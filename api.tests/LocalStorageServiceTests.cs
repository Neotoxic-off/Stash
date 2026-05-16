using Storage.Api.Services;
using Xunit;

namespace Storage.Api.Tests;

public class LocalStorageServiceTests : IDisposable
{
    private readonly string _root;
    private readonly string _encRoot;
    private readonly LocalStorageService _svc;
    private readonly LocalStorageService _encSvc;

    public LocalStorageServiceTests()
    {
        _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _encRoot = _root + "_enc";
        Directory.CreateDirectory(_root);
        _svc = new LocalStorageService(_root);
        _encSvc = new LocalStorageService(_encRoot, "test-passphrase");
        Directory.CreateDirectory(Path.Combine(_root, "buckets", "b", "objects"));
        Directory.CreateDirectory(Path.Combine(_encRoot, "buckets", "b", "objects"));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
        if (Directory.Exists(_encRoot)) Directory.Delete(_encRoot, recursive: true);
    }

    // --- GetTempPartPath ---

    [Fact]
    public void GetTempPartPath_CreatesDirectoryAndReturnsCorrectName()
    {
        string path = _svc.GetTempPartPath("upload-abc", 7);
        Assert.EndsWith("part_00007", path);
        Assert.True(Directory.Exists(Path.GetDirectoryName(path)));
    }

    // --- EnsureBucketDirectory ---

    [Fact]
    public void EnsureBucketDirectory_CreatesObjectsSubdirectory()
    {
        _svc.EnsureBucketDirectory("new-bucket");
        Assert.True(Directory.Exists(Path.Combine(_root, "buckets", "new-bucket", "objects")));
    }

    // --- DeleteBucketDirectory ---

    [Fact]
    public void DeleteBucketDirectory_ExistingDir_Removes()
    {
        _svc.EnsureBucketDirectory("del-me");
        _svc.DeleteBucketDirectory("del-me");
        Assert.False(Directory.Exists(Path.Combine(_root, "buckets", "del-me")));
    }

    [Fact]
    public void DeleteBucketDirectory_NonExistent_DoesNotThrow()
    {
        _svc.DeleteBucketDirectory("ghost"); // must not throw
    }

    // --- DeleteObject ---

    [Fact]
    public void DeleteObject_ExistingFile_Removes()
    {
        string path = Path.Combine(_root, "to-delete.txt");
        File.WriteAllText(path, "hi");
        _svc.DeleteObject(path);
        Assert.False(File.Exists(path));
    }

    [Fact]
    public void DeleteObject_NonExistent_DoesNotThrow()
    {
        _svc.DeleteObject(Path.Combine(_root, "ghost.txt")); // must not throw
    }

    // --- DeleteTempParts ---

    [Fact]
    public void DeleteTempParts_ExistingDir_Removes()
    {
        _svc.GetTempPartPath("upload-del", 1); // creates dir
        _svc.DeleteTempParts("upload-del");
        Assert.False(Directory.Exists(Path.Combine(_root, "tmp", "upload-del")));
    }

    [Fact]
    public void DeleteTempParts_NonExistent_DoesNotThrow()
    {
        _svc.DeleteTempParts("ghost-upload"); // must not throw
    }

    // --- ComputeETag ---

    [Fact]
    public void ComputeETag_ReturnsLowerHexMd5()
    {
        string path = Path.Combine(_root, "etag.bin");
        File.WriteAllBytes(path, [1, 2, 3, 4]);
        string etag = _svc.ComputeETag(path);
        Assert.Matches("^[0-9a-f]{32}$", etag);
    }

    [Fact]
    public void ComputeETag_EmptyFile_ReturnsKnownMd5()
    {
        string path = Path.Combine(_root, "empty.bin");
        File.WriteAllBytes(path, []);
        string etag = _svc.ComputeETag(path);
        // MD5 of empty input is d41d8cd98f00b204e9800998ecf8427e
        Assert.Equal("d41d8cd98f00b204e9800998ecf8427e", etag);
    }

    // --- OpenForRead: small file (< HeaderSize) ---

    [Fact]
    public void OpenForRead_SmallFile_ReturnsRawFileStream()
    {
        string path = Path.Combine(_root, "tiny.bin");
        File.WriteAllBytes(path, [1, 2, 3]);
        using Stream s = _svc.OpenForRead(path);
        Assert.IsType<FileStream>(s);
    }

    // --- OpenForRead: file >= HeaderSize, no STENC magic ---

    [Fact]
    public async Task OpenForRead_LargeUnencryptedFile_ReturnsFullContent()
    {
        string dest = _svc.GetObjectPath("b", "plain-large.bin");
        byte[] payload = new byte[50];
        new Random(1).NextBytes(payload);
        await using (MemoryStream src = new(payload))
            await _svc.WriteAndHashAsync(src, dest);

        await using Stream readback = _svc.OpenForRead(dest);
        using MemoryStream ms = new();
        await readback.CopyToAsync(ms);
        Assert.Equal(payload, ms.ToArray());
    }

    // --- OpenForRead: encrypted file, key present ---

    [Fact]
    public async Task OpenForRead_EncryptedFile_DecryptsCorrectly()
    {
        string dest = _encSvc.GetObjectPath("b", "enc.bin");
        byte[] payload = Enumerable.Range(0, 200).Select(i => (byte)i).ToArray();
        await using (MemoryStream src = new(payload))
            await _encSvc.WriteAndHashAsync(src, dest);

        // File on disk must differ from plaintext
        byte[] raw = await File.ReadAllBytesAsync(dest);
        Assert.NotEqual(payload, raw);

        await using Stream readback = _encSvc.OpenForRead(dest);
        using MemoryStream ms = new();
        await readback.CopyToAsync(ms);
        Assert.Equal(payload, ms.ToArray());
    }

    // --- OpenForRead: encrypted file, no key → throws ---

    [Fact]
    public async Task OpenForRead_EncryptedFile_WithoutKey_Throws()
    {
        string dest = _encSvc.GetObjectPath("b", "enc2.bin");
        await using (MemoryStream src = new([1, 2, 3, 4, 5]))
            await _encSvc.WriteAndHashAsync(src, dest);

        Assert.Throws<InvalidOperationException>(() => _svc.OpenForRead(dest));
    }

    // --- WriteAndHashAsync: no encryption ---

    [Fact]
    public async Task WriteAndHashAsync_NoEncryption_HashesAndSizeCorrect()
    {
        string dest = _svc.GetObjectPath("b", "hash-test.bin");
        byte[] payload = [10, 20, 30, 40, 50];
        await using MemoryStream src = new(payload);
        (string etag, string sha256, long size) = await _svc.WriteAndHashAsync(src, dest);

        Assert.Equal(payload.Length, size);
        Assert.Matches("^[0-9a-f]{32}$", etag);
        Assert.Matches("^[0-9a-f]{64}$", sha256);
        Assert.Equal(payload, await File.ReadAllBytesAsync(dest));
    }

    [Fact]
    public async Task WriteAndHashAsync_NoEncryption_EmptyStream_SizeZero()
    {
        string dest = _svc.GetObjectPath("b", "empty-write.bin");
        await using MemoryStream src = new([]);
        (string etag, string sha256, long size) = await _svc.WriteAndHashAsync(src, dest);

        Assert.Equal(0, size);
        Assert.Equal("d41d8cd98f00b204e9800998ecf8427e", etag);
    }

    // --- WriteAndHashAsync: with encryption ---

    [Fact]
    public async Task WriteAndHashAsync_WithEncryption_PlaintextSizeReturned()
    {
        string dest = _encSvc.GetObjectPath("b", "enc-size.bin");
        byte[] payload = new byte[100];
        await using MemoryStream src = new(payload);
        (string etag, string sha256, long size) = await _encSvc.WriteAndHashAsync(src, dest);

        Assert.Equal(100, size); // plaintext size, not encrypted file size
        long fileSize = new FileInfo(dest).Length;
        Assert.True(fileSize > 100); // encrypted + header is larger
    }

    // --- MergePartsAsync: no encryption ---

    [Fact]
    public async Task MergePartsAsync_NoEncryption_MergesAndHashesCorrectly()
    {
        string part1 = _svc.GetTempPartPath("mp1", 1);
        string part2 = _svc.GetTempPartPath("mp1", 2);
        await File.WriteAllBytesAsync(part1, [1, 2, 3]);
        await File.WriteAllBytesAsync(part2, [4, 5, 6]);

        string dest = _svc.GetObjectPath("b", "merged.bin");
        (string etag, string sha256, long size) = await _svc.MergePartsAsync([part1, part2], dest);

        Assert.Equal(6, size);
        Assert.Matches("^[0-9a-f]{32}$", etag);
        Assert.Matches("^[0-9a-f]{64}$", sha256);
        Assert.Equal<byte[]>([1, 2, 3, 4, 5, 6], await File.ReadAllBytesAsync(dest));
    }

    // --- MergePartsAsync: with encryption ---

    [Fact]
    public async Task MergePartsAsync_WithEncryption_RoundTrip()
    {
        string tmpDir = Path.Combine(_encRoot, "tmp", "mp2");
        Directory.CreateDirectory(tmpDir);
        string part1 = Path.Combine(tmpDir, "part_00001");
        string part2 = Path.Combine(tmpDir, "part_00002");
        await File.WriteAllBytesAsync(part1, [10, 20, 30]);
        await File.WriteAllBytesAsync(part2, [40, 50, 60]);

        string dest = _encSvc.GetObjectPath("b", "merged-enc.bin");
        (string etag, string sha256, long size) = await _encSvc.MergePartsAsync([part1, part2], dest);

        Assert.Equal(6, size);

        await using Stream readback = _encSvc.OpenForRead(dest);
        using MemoryStream ms = new();
        await readback.CopyToAsync(ms);
        Assert.Equal<byte[]>([10, 20, 30, 40, 50, 60], ms.ToArray());
    }
}
