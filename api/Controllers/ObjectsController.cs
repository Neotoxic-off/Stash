using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Storage.Api.Data;
using Storage.Api.Helpers;
using Storage.Api.Models;
using Storage.Api.Services;

namespace Storage.Api.Controllers;

[ApiController]
public class ObjectsController(StorageDbContext db, IStorageService storage, NotificationService notifications) : ControllerBase
{
    private static readonly FileExtensionContentTypeProvider MimeProvider = new();

    [HttpGet("/{bucket}")]
    public async Task<IActionResult> ListObjects(
        string bucket,
        [FromQuery] string prefix = "",
        [FromQuery] string delimiter = "",
        [FromQuery(Name = "max-keys")] int maxKeys = 50,
        [FromQuery(Name = "continuation-token")] string? continuationToken = null)
    {
        (bool ok, IActionResult? authErr) = await VerifyBucketAsync(bucket);
        if (!ok) return authErr!;

        if (prefix.Length > 1024)
            return XmlError(400, S3Xml.Error("InvalidArgument", "prefix must be at most 1024 characters"));
        if (delimiter.Length > 128)
            return XmlError(400, S3Xml.Error("InvalidArgument", "delimiter must be at most 128 characters"));
        if (continuationToken is not null && continuationToken.Length > 1024)
            return XmlError(400, S3Xml.Error("InvalidArgument", "continuation-token must be at most 1024 characters"));

        int clampedMax = Math.Clamp(maxKeys, 1, 1000);

        List<string> allKeys = await db.Objects
            .Where(o => o.BucketName == bucket && o.Key.StartsWith(prefix))
            .OrderBy(o => o.Key)
            .Select(o => o.Key)
            .ToListAsync();

        List<(string key, bool isPrefix)> entries = [];
        HashSet<string> seenPrefixes = [];

        foreach (string key in allKeys)
        {
            if (!string.IsNullOrEmpty(delimiter))
            {
                string rest = key[prefix.Length..];
                int idx = rest.IndexOf(delimiter, StringComparison.Ordinal);
                if (idx >= 0)
                {
                    string cp = prefix + rest[..(idx + delimiter.Length)];
                    if (seenPrefixes.Add(cp)) entries.Add((cp, true));
                    continue;
                }
            }
            entries.Add((key, false));
        }

        if (!string.IsNullOrEmpty(continuationToken))
            entries = entries.Where(e => string.CompareOrdinal(e.key, continuationToken) > 0).ToList();

        bool isTruncated = entries.Count > clampedMax;
        if (isTruncated) entries = entries.Take(clampedMax).ToList();
        string? nextToken = isTruncated ? entries.Last().key : null;

        HashSet<string> objectKeysOnPage = entries.Where(e => !e.isPrefix).Select(e => e.key).ToHashSet();
        List<string> commonPrefixes = entries.Where(e => e.isPrefix).Select(e => e.key).ToList();

        List<StorageObject> objects = await db.Objects
            .Where(o => o.BucketName == bucket && objectKeysOnPage.Contains(o.Key))
            .OrderBy(o => o.Key)
            .ToListAsync();

        Response.ContentType = "application/xml";
        return Content(S3Xml.ListObjects(bucket, objects, prefix, delimiter, isTruncated, commonPrefixes, nextToken));
    }

    [HttpGet("/{bucket}/{**key}")]
    public async Task<IActionResult> GetObject(string bucket, string key)
    {
        (bool ok, IActionResult? authErr) = await VerifyBucketAsync(bucket);
        if (!ok) return authErr!;

        StorageObject? obj = await db.Objects.FirstOrDefaultAsync(o => o.BucketName == bucket && o.Key == key);
        if (obj is null)
            return XmlError(404, S3Xml.Error("NoSuchKey", "The specified key does not exist", $"/{bucket}/{key}"));

        if (!System.IO.File.Exists(obj.FilePath))
            return XmlError(404, S3Xml.Error("NoSuchKey", "Object file missing from storage", $"/{bucket}/{key}"));

        Response.Headers.ETag = $"\"{obj.ETag}\"";
        Response.Headers.LastModified = obj.LastModified.ToString("R");
        Response.Headers.ContentLength = obj.Size;
        if (obj.Sha256 is not null)
            Response.Headers["x-amz-checksum-sha256"] = obj.Sha256;

        Stream stream = storage.OpenForRead(obj.FilePath);
        return File(stream, obj.ContentType, enableRangeProcessing: stream.CanSeek);
    }

    [HttpHead("/{bucket}/{**key}")]
    public async Task<IActionResult> HeadObject(string bucket, string key)
    {
        (bool ok, IActionResult? authErr) = await VerifyBucketAsync(bucket);
        if (!ok) return authErr!;

        StorageObject? obj = await db.Objects.FirstOrDefaultAsync(o => o.BucketName == bucket && o.Key == key);
        if (obj is null) return NotFound();

        Response.Headers.ETag = $"\"{obj.ETag}\"";
        Response.Headers.LastModified = obj.LastModified.ToString("R");
        Response.Headers.ContentLength = obj.Size;
        Response.Headers.ContentType = obj.ContentType;
        if (obj.Sha256 is not null)
            Response.Headers["x-amz-checksum-sha256"] = obj.Sha256;
        return Ok();
    }

    [HttpPut("/{bucket}/{**key}")]
    [DisableRequestSizeLimit]
    [RequestFormLimits(MultipartBodyLengthLimit = long.MaxValue, ValueLengthLimit = int.MaxValue)]
    public async Task<IActionResult> PutObject(
        string bucket,
        string key,
        [FromQuery] int? partNumber,
        [FromQuery] string? uploadId)
    {
        (bool ok, IActionResult? authErr) = await VerifyBucketAsync(bucket);
        if (!ok) return authErr!;

        if (key.Length > 1024)
            return XmlError(400, S3Xml.Error("KeyTooLong", "Key must be at most 1024 bytes"));

        if (partNumber.HasValue && !string.IsNullOrEmpty(uploadId))
            return await UploadPart(bucket, key, uploadId, partNumber.Value);

        string contentType = Request.ContentType ?? ResolveContentType(key);
        string destPath;
        try { destPath = storage.GetObjectPath(bucket, key); }
        catch (ArgumentException ex) { return XmlError(400, S3Xml.Error("InvalidKey", ex.Message)); }

        bool isUpdate = await db.Objects.AnyAsync(o => o.BucketName == bucket && o.Key == key);

        (string etag, string sha256, long size) = await storage.WriteAndHashAsync(Request.Body, destPath);
        DateTime now = DateTime.UtcNow;

        StorageObject? existing = await db.Objects.FirstOrDefaultAsync(o => o.BucketName == bucket && o.Key == key);
        if (existing is not null)
        {
            existing.Size = size;
            existing.ContentType = contentType;
            existing.ETag = etag;
            existing.Sha256 = sha256;
            existing.LastModified = now;
            existing.FilePath = destPath;
        }
        else
        {
            db.Objects.Add(new StorageObject
            {
                BucketName = bucket,
                Key = key,
                Size = size,
                ContentType = contentType,
                ETag = etag,
                Sha256 = sha256,
                LastModified = now,
                FilePath = destPath
            });
        }

        await db.SaveChangesAsync();

        StorageEvent evt = isUpdate
            ? StorageEvent.ObjectUpdated(bucket, key, size, contentType)
            : StorageEvent.ObjectCreated(bucket, key, size, contentType);
        await notifications.BroadcastAsync(evt);

        Response.Headers.ETag = $"\"{etag}\"";
        return Ok();
    }

    [HttpDelete("/{bucket}/{**key}")]
    public async Task<IActionResult> DeleteObject(string bucket, string key, [FromQuery] string? uploadId)
    {
        (bool ok, IActionResult? authErr) = await VerifyBucketAsync(bucket);
        if (!ok) return authErr!;

        if (!string.IsNullOrEmpty(uploadId))
            return await AbortMultipart(uploadId);

        StorageObject? obj = await db.Objects.FirstOrDefaultAsync(o => o.BucketName == bucket && o.Key == key);
        if (obj is null) return NoContent();

        storage.DeleteObject(obj.FilePath);
        db.Objects.Remove(obj);
        await db.SaveChangesAsync();

        await notifications.BroadcastAsync(StorageEvent.ObjectDeleted(bucket, key));

        return NoContent();
    }

    [HttpPost("/{bucket}/{**key}")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> MultipartOperation(
        string bucket,
        string key,
        [FromQuery] string? uploadId)
    {
        (bool ok, IActionResult? authErr) = await VerifyBucketAsync(bucket);
        if (!ok) return authErr!;

        if (Request.Query.ContainsKey("uploads"))
            return await CreateMultipartUpload(bucket, key);

        if (!string.IsNullOrEmpty(uploadId))
            return await CompleteMultipartUpload(bucket, key, uploadId);

        return BadRequest();
    }

    private async Task<IActionResult> UploadPart(string bucket, string key, string uploadId, int partNumber)
    {
        if (partNumber < 1 || partNumber > 10000)
            return XmlError(400, S3Xml.Error("InvalidArgument", "Part number must be between 1 and 10000"));

        if (!await db.MultipartUploads.AnyAsync(u => u.UploadId == uploadId))
            return XmlError(404, S3Xml.Error("NoSuchUpload", "The specified upload does not exist"));

        string partPath;
        try { partPath = storage.GetTempPartPath(uploadId, partNumber); }
        catch (ArgumentException ex) { return XmlError(400, S3Xml.Error("InvalidKey", ex.Message)); }

        await using (FileStream dest = System.IO.File.Create(partPath))
            await Request.Body.CopyToAsync(dest);

        string etag = storage.ComputeETag(partPath);
        long size = new FileInfo(partPath).Length;

        MultipartPart? existing = await db.MultipartParts
            .FirstOrDefaultAsync(p => p.UploadId == uploadId && p.PartNumber == partNumber);

        if (existing is not null)
        {
            existing.FilePath = partPath;
            existing.Size = size;
            existing.ETag = etag;
        }
        else
        {
            db.MultipartParts.Add(new MultipartPart
            {
                UploadId = uploadId,
                PartNumber = partNumber,
                FilePath = partPath,
                Size = size,
                ETag = etag
            });
        }

        await db.SaveChangesAsync();
        Response.Headers.ETag = $"\"{etag}\"";
        return Ok();
    }

    private async Task<IActionResult> CreateMultipartUpload(string bucket, string key)
    {
        MultipartUpload upload = new()
        {
            BucketName = bucket,
            Key = key,
            ContentType = Request.ContentType ?? ResolveContentType(key)
        };
        db.MultipartUploads.Add(upload);
        await db.SaveChangesAsync();

        Response.ContentType = "application/xml";
        return Content(S3Xml.CreateMultipartUpload(bucket, key, upload.UploadId));
    }

    private async Task<IActionResult> CompleteMultipartUpload(string bucket, string key, string uploadId)
    {
        MultipartUpload? upload = await db.MultipartUploads.FindAsync(uploadId);
        if (upload is null)
            return XmlError(404, S3Xml.Error("NoSuchUpload", "The specified upload does not exist"));

        List<MultipartPart> parts = await db.MultipartParts
            .Where(p => p.UploadId == uploadId)
            .OrderBy(p => p.PartNumber)
            .ToListAsync();

        if (parts.Count == 0)
            return XmlError(400, S3Xml.Error("MalformedXML", "No parts found for this upload"));

        string destPath;
        try { destPath = storage.GetObjectPath(bucket, key); }
        catch (ArgumentException ex) { return XmlError(400, S3Xml.Error("InvalidKey", ex.Message)); }

        (string etag, string sha256, long size) = await storage.MergePartsAsync([.. parts.Select(p => p.FilePath)], destPath);
        DateTime now = DateTime.UtcNow;
        bool isUpdate = await db.Objects.AnyAsync(o => o.BucketName == bucket && o.Key == key);

        StorageObject? existing = await db.Objects.FirstOrDefaultAsync(o => o.BucketName == bucket && o.Key == key);
        if (existing is not null)
        {
            existing.Size = size;
            existing.ContentType = upload.ContentType;
            existing.ETag = etag;
            existing.Sha256 = sha256;
            existing.LastModified = now;
            existing.FilePath = destPath;
        }
        else
        {
            db.Objects.Add(new StorageObject
            {
                BucketName = bucket,
                Key = key,
                Size = size,
                ContentType = upload.ContentType,
                ETag = etag,
                Sha256 = sha256,
                LastModified = now,
                FilePath = destPath
            });
        }

        db.MultipartParts.RemoveRange(parts);
        db.MultipartUploads.Remove(upload);
        await db.SaveChangesAsync();
        storage.DeleteTempParts(uploadId);

        StorageEvent evt = isUpdate
            ? StorageEvent.ObjectUpdated(bucket, key, size, upload.ContentType)
            : StorageEvent.ObjectCreated(bucket, key, size, upload.ContentType);
        await notifications.BroadcastAsync(evt);

        Response.ContentType = "application/xml";
        return Content(S3Xml.CompleteMultipartUpload(bucket, key, etag));
    }

    private async Task<IActionResult> AbortMultipart(string uploadId)
    {
        MultipartUpload? upload = await db.MultipartUploads.FindAsync(uploadId);
        if (upload is null) return NoContent();

        List<MultipartPart> parts = await db.MultipartParts.Where(p => p.UploadId == uploadId).ToListAsync();
        db.MultipartParts.RemoveRange(parts);
        db.MultipartUploads.Remove(upload);
        await db.SaveChangesAsync();
        storage.DeleteTempParts(uploadId);

        return NoContent();
    }

    private async Task<(bool ok, IActionResult? error)> VerifyBucketAsync(string bucketName)
    {
        AccessKey accessKey = (AccessKey)HttpContext.Items["AccessKey"]!;
        Bucket? bucket = await db.Buckets.FindAsync(bucketName);
        if (bucket is null)
            return (false, XmlError(404, S3Xml.Error("NoSuchBucket", "Bucket does not exist", $"/{bucketName}")));
        if (bucket.AccessKeyId != accessKey.Id)
            return (false, XmlError(403, S3Xml.Error("AccessDenied", "Access denied", $"/{bucketName}")));
        return (true, null);
    }

    private ContentResult XmlError(int status, string xml)
    {
        ContentResult r = Content(xml, "application/xml");
        r.StatusCode = status;
        return r;
    }

    private static string ResolveContentType(string key)
    {
        if (MimeProvider.TryGetContentType(key, out string? ct)) return ct;
        return "application/octet-stream";
    }
}
