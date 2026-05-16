using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Storage.Api.Data;
using Storage.Api.Helpers;
using Storage.Api.Models;
using Storage.Api.Services;


namespace Storage.Api.Controllers;

[ApiController]
public class BucketsController(StorageDbContext db, IStorageService storage, NotificationService notifications) : ControllerBase
{
    [HttpGet("/")]
    public async Task<IActionResult> ListBuckets()
    {
        AccessKey accessKey = (AccessKey)HttpContext.Items["AccessKey"]!;
        List<Bucket> buckets = await db.Buckets
            .Where(b => b.AccessKeyId == accessKey.Id)
            .OrderBy(b => b.Name)
            .ToListAsync();

        Response.ContentType = "application/xml";
        return Content(S3Xml.ListBuckets(buckets, accessKey.Id));
    }

    [HttpPut("/{bucket}")]
    public async Task<IActionResult> CreateBucket(string bucket)
    {
        if (!BucketValidator.IsValid(bucket))
            return XmlError(400, S3Xml.Error("InvalidBucketName",
                "Bucket name must be 3-63 chars, lowercase alphanumeric, hyphens, or dots. 'admin' is reserved."));

        AccessKey accessKey = (AccessKey)HttpContext.Items["AccessKey"]!;

        if (await db.Buckets.AnyAsync(b => b.Name == bucket))
            return XmlError(409, S3Xml.Error("BucketAlreadyExists", "Bucket already exists", $"/{bucket}"));

        db.Buckets.Add(new Bucket { Name = bucket, AccessKeyId = accessKey.Id });
        await db.SaveChangesAsync();
        storage.EnsureBucketDirectory(bucket);

        await notifications.BroadcastAsync(StorageEvent.BucketCreated(bucket));

        Response.Headers.Location = $"/{bucket}";
        return Ok();
    }

    [HttpDelete("/{bucket}")]
    public async Task<IActionResult> DeleteBucket(string bucket)
    {
        AccessKey accessKey = (AccessKey)HttpContext.Items["AccessKey"]!;
        Bucket? b = await db.Buckets.FindAsync(bucket);

        if (b is null)
            return XmlError(404, S3Xml.Error("NoSuchBucket", "Bucket does not exist", $"/{bucket}"));

        if (b.AccessKeyId != accessKey.Id)
            return Forbid();

        if (await db.Objects.AnyAsync(o => o.BucketName == bucket))
            return XmlError(409, S3Xml.Error("BucketNotEmpty", "Delete all objects before deleting the bucket", $"/{bucket}"));

        db.Buckets.Remove(b);
        await db.SaveChangesAsync();

        await notifications.BroadcastAsync(StorageEvent.BucketDeleted(bucket));
        try { storage.DeleteBucketDirectory(bucket); } catch { /* best-effort */ }

        return NoContent();
    }

    private ContentResult XmlError(int status, string xml)
    {
        ContentResult r = Content(xml, "application/xml");
        r.StatusCode = status;
        return r;
    }
}
