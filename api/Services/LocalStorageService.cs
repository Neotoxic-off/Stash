using System.Security.Cryptography;

namespace Storage.Api.Services;

public class LocalStorageService : IStorageService
{
    private readonly string _bucketsRoot;
    private readonly string _tempRoot;
    private readonly byte[]? _masterKey;

    // Magic header: "STENC" (5 bytes) + version 0x01 (1 byte) + IV (16 bytes) = 22 bytes
    private static ReadOnlySpan<byte> Magic => "STENC"u8;
    private const byte Version = 0x01;
    private const int HeaderSize = 22;

    public LocalStorageService(string storagePath, string? encryptionPassphrase = null)
    {
        _bucketsRoot = Path.Combine(storagePath, "buckets");
        _tempRoot = Path.Combine(storagePath, "tmp");
        Directory.CreateDirectory(_bucketsRoot);
        Directory.CreateDirectory(_tempRoot);

        if (!string.IsNullOrEmpty(encryptionPassphrase))
        {
            byte[] salt = "STASH-MASTER-SALT-V1"u8.ToArray();
            _masterKey = Rfc2898DeriveBytes.Pbkdf2(
                encryptionPassphrase, salt, 100_000, HashAlgorithmName.SHA256, 32);
        }
    }

    public string GetObjectPath(string bucketName, string key)
    {
        if (string.IsNullOrEmpty(key) || key.Length > 1024)
            throw new ArgumentException("Key must be 1–1024 characters.", nameof(key));
        if (key.Contains('\0'))
            throw new ArgumentException("Key must not contain null bytes.", nameof(key));

        string[] parts = key.Replace('\\', '/').Split('/');

        if (parts.Any(p => p == ".."))
            throw new ArgumentException("Key must not contain path traversal sequences.", nameof(key));

        string[] safeParts = parts
            .Where(p => p is not ("" or "."))
            .ToArray();

        if (safeParts.Length == 0)
            throw new ArgumentException("Key resolves to an empty path.", nameof(key));

        string bucketDir = Path.GetFullPath(Path.Combine(_bucketsRoot, bucketName, "objects"));
        string fullPath = Path.GetFullPath(Path.Combine(bucketDir, Path.Combine(safeParts)));

        if (!fullPath.StartsWith(bucketDir + Path.DirectorySeparatorChar))
            throw new ArgumentException("Key resolves outside the bucket directory.", nameof(key));

        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        return fullPath;
    }

    public string GetTempPartPath(string uploadId, int partNumber)
    {
        if (string.IsNullOrEmpty(uploadId) || uploadId.Length > 64 ||
            uploadId.IndexOfAny(['/', '\\', '.']) >= 0)
            throw new ArgumentException("Invalid upload ID.", nameof(uploadId));

        string dir = Path.Combine(_tempRoot, uploadId);
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, $"part_{partNumber:D5}");
    }

    public void EnsureBucketDirectory(string bucketName) =>
        Directory.CreateDirectory(Path.Combine(_bucketsRoot, bucketName, "objects"));

    public void DeleteBucketDirectory(string bucketName)
    {
        string dir = Path.Combine(_bucketsRoot, bucketName);
        if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
    }

    public void DeleteObject(string filePath)
    {
        if (File.Exists(filePath)) File.Delete(filePath);
    }

    public void DeleteTempParts(string uploadId)
    {
        string dir = Path.Combine(_tempRoot, uploadId);
        if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
    }

    // Returns a stream that transparently decrypts if the file was written with encryption.
    // Backwards-compatible: unencrypted files (no STENC header) are returned as-is.
    public Stream OpenForRead(string filePath)
    {
        FileStream fs = File.OpenRead(filePath);

        if (fs.Length < HeaderSize)
            return fs;

        Span<byte> header = stackalloc byte[HeaderSize];
        fs.ReadExactly(header);

        bool isEncrypted = header[..5].SequenceEqual(Magic) && header[5] == Version;

        if (!isEncrypted)
        {
            fs.Seek(0, SeekOrigin.Begin);
            return fs;
        }

        if (_masterKey is null)
        {
            fs.Dispose();
            throw new InvalidOperationException(
                "File is encrypted but ENCRYPTION_KEY is not configured.");
        }

        byte[] iv = header[6..].ToArray();

        using Aes aes = Aes.Create();
        aes.Key = _masterKey;
        aes.IV = iv;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        ICryptoTransform decryptor = aes.CreateDecryptor();

        // leaveOpen: false — fs disposed when CryptoStream is disposed
        return new CryptoStream(fs, decryptor, CryptoStreamMode.Read, leaveOpen: false);
    }

    // Single-pass: stream → disk + MD5 + SHA256, encrypting if key is configured.
    // Returns hashes and size of the PLAINTEXT content.
    public async Task<(string etag, string sha256, long size)> WriteAndHashAsync(Stream source, string destPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(destPath)!);

        using MD5 md5 = MD5.Create();
        using SHA256 sha256Hasher = SHA256.Create();
        byte[] buffer = new byte[1 << 17]; // 128 KB
        long plaintextSize = 0;

        await using FileStream fileStream = File.Create(destPath);

        if (_masterKey is not null)
        {
            byte[] header = new byte[HeaderSize];
            Magic.CopyTo(header);
            header[5] = Version;
            RandomNumberGenerator.Fill(header.AsSpan(6, 16));
            await fileStream.WriteAsync(header);

            using Aes aes = Aes.Create();
            aes.Key = _masterKey;
            aes.IV = header[6..];
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;

            await using CryptoStream cs = new CryptoStream(fileStream, aes.CreateEncryptor(), CryptoStreamMode.Write, leaveOpen: true);
            int read;
            while ((read = await source.ReadAsync(buffer)) > 0)
            {
                plaintextSize += read;
                await cs.WriteAsync(buffer.AsMemory(0, read));
                md5.TransformBlock(buffer, 0, read, null, 0);
                sha256Hasher.TransformBlock(buffer, 0, read, null, 0);
            }
            // cs disposed here → FlushFinalBlockAsync → PKCS7 padding written
        }
        else
        {
            int read;
            while ((read = await source.ReadAsync(buffer)) > 0)
            {
                plaintextSize += read;
                await fileStream.WriteAsync(buffer.AsMemory(0, read));
                md5.TransformBlock(buffer, 0, read, null, 0);
                sha256Hasher.TransformBlock(buffer, 0, read, null, 0);
            }
        }

        md5.TransformFinalBlock([], 0, 0);
        sha256Hasher.TransformFinalBlock([], 0, 0);

        return (
            Convert.ToHexString(md5.Hash!).ToLower(),
            Convert.ToHexString(sha256Hasher.Hash!).ToLower(),
            plaintextSize
        );
    }

    // Merges unencrypted temp parts into a single (optionally encrypted) final object.
    public async Task<(string etag, string sha256, long size)> MergePartsAsync(string[] partPaths, string destPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(destPath)!);

        using MD5 md5 = MD5.Create();
        using SHA256 sha256Hasher = SHA256.Create();
        byte[] buffer = new byte[1 << 17];
        long plaintextSize = 0;

        await using FileStream fileStream = File.Create(destPath);

        async Task StreamParts(Stream target)
        {
            foreach (string part in partPaths)
            {
                await using FileStream src = File.OpenRead(part);
                int read;
                while ((read = await src.ReadAsync(buffer)) > 0)
                {
                    plaintextSize += read;
                    await target.WriteAsync(buffer.AsMemory(0, read));
                    md5.TransformBlock(buffer, 0, read, null, 0);
                    sha256Hasher.TransformBlock(buffer, 0, read, null, 0);
                }
            }
        }

        if (_masterKey is not null)
        {
            byte[] header = new byte[HeaderSize];
            Magic.CopyTo(header);
            header[5] = Version;
            RandomNumberGenerator.Fill(header.AsSpan(6, 16));
            await fileStream.WriteAsync(header);

            using Aes aes = Aes.Create();
            aes.Key = _masterKey;
            aes.IV = header[6..];
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;

            await using CryptoStream cs = new CryptoStream(fileStream, aes.CreateEncryptor(), CryptoStreamMode.Write, leaveOpen: true);
            await StreamParts(cs);
        }
        else
        {
            await StreamParts(fileStream);
        }

        md5.TransformFinalBlock([], 0, 0);
        sha256Hasher.TransformFinalBlock([], 0, 0);

        return (
            Convert.ToHexString(md5.Hash!).ToLower(),
            Convert.ToHexString(sha256Hasher.Hash!).ToLower(),
            plaintextSize
        );
    }

    // Used for individual multipart parts (temp files, never encrypted).
    public string ComputeETag(string filePath)
    {
        using MD5 md5 = MD5.Create();
        using FileStream stream = File.OpenRead(filePath);
        return Convert.ToHexString(md5.ComputeHash(stream)).ToLower();
    }
}
