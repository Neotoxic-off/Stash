using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Storage.Api.Data;
using Storage.Api.Models;
using Storage.Api.Services;

namespace Storage.Api.Controllers;

[ApiController]
public class PresignController(StorageDbContext db, IStorageService storage) : ControllerBase
{
    [HttpPost("/presign")]
    public async Task<IActionResult> CreateToken([FromBody] PresignRequest req)
    {
        AccessKey accessKey = (AccessKey)HttpContext.Items["AccessKey"]!;

        Bucket? bucket = await db.Buckets.FindAsync(req.Bucket);
        if (bucket is null || bucket.AccessKeyId != accessKey.Id)
            return StatusCode(403, new { error = "Forbidden" });

        bool exists = await db.Objects.AnyAsync(o => o.BucketName == req.Bucket && o.Key == req.Key);
        if (!exists) return NotFound(new { error = "Object not found" });

        // Lazy cleanup of expired tokens
        List<PresignedToken> expired = await db.PresignedTokens
            .Where(t => t.ExpiresAt < DateTime.UtcNow)
            .ToListAsync();
        if (expired.Count > 0)
        {
            db.PresignedTokens.RemoveRange(expired);
            await db.SaveChangesAsync();
        }

        int expiresIn = Math.Clamp(req.ExpiresIn ?? 3600, 60, 7 * 24 * 3600);
        PresignedToken token = new()
        {
            BucketName = req.Bucket,
            Key = req.Key,
            ExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn),
        };
        db.PresignedTokens.Add(token);
        await db.SaveChangesAsync();

        return Ok(new { token = token.Id, expiresAt = token.ExpiresAt });
    }

    [HttpGet("/download/{token}")]
    public async Task<IActionResult> Download(string token)
    {
        PresignedToken? entry = await db.PresignedTokens.FindAsync(token);
        if (entry is null || entry.ExpiresAt < DateTime.UtcNow)
        {
            if (entry is not null)
            {
                db.PresignedTokens.Remove(entry);
                await db.SaveChangesAsync();
            }
            return StatusCode(403, new { error = "Token expired or not found" });
        }

        StorageObject? obj = await db.Objects.FirstOrDefaultAsync(
            o => o.BucketName == entry.BucketName && o.Key == entry.Key);

        if (obj is null || !System.IO.File.Exists(obj.FilePath))
            return NotFound(new { error = "Object not found" });

        Response.Headers.ETag = $"\"{obj.ETag}\"";
        Response.Headers.LastModified = obj.LastModified.ToString("R");
        Response.Headers.ContentLength = obj.Size;
        if (obj.Sha256 is not null)
            Response.Headers["x-amz-checksum-sha256"] = obj.Sha256;

        string filename = Path.GetFileName(entry.Key);
        Response.Headers.ContentDisposition = $"attachment; filename=\"{Uri.EscapeDataString(filename)}\"";

        Stream stream = storage.OpenForRead(obj.FilePath);
        return File(stream, obj.ContentType, enableRangeProcessing: stream.CanSeek);
    }
}

public record PresignRequest(string Bucket, string Key, int? ExpiresIn);
