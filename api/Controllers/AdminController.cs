using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Storage.Api.Data;
using Storage.Api.Models;

namespace Storage.Api.Controllers;

[ApiController]
[Route("admin")]
public class AdminController(StorageDbContext db) : ControllerBase
{
    [HttpPost("unlock")]
    public async Task<IActionResult> Unlock([FromBody] UnlockRequest req, IConfiguration config)
    {
        string? adminPassword = config["Admin:Password"];
        bool valid = !string.IsNullOrWhiteSpace(req.Password) &&
                     !string.IsNullOrEmpty(adminPassword) &&
                     CryptographicOperations.FixedTimeEquals(
                         Encoding.UTF8.GetBytes(req.Password),
                         Encoding.UTF8.GetBytes(adminPassword));
        if (!valid)
        {
            await Task.Delay(2000);
            return StatusCode(403, new { error = "Invalid password" });
        }

        List<KeySummary> keys = await db.AccessKeys
            .OrderByDescending(k => k.CreatedAt)
            .Select(k => new KeySummary(k.Id, k.Name, k.CreatedAt, k.IsActive))
            .ToListAsync();
        return Ok(keys);
    }

    [HttpPost("setup")]
    public async Task<IActionResult> Setup([FromBody] SetupRequest req)
    {
        if (await db.AccessKeys.AnyAsync())
            return Conflict(new { error = "Setup already completed. Use /admin/keys to manage keys." });

        AccessKey key = BuildKey(req.Name ?? "admin");
        db.AccessKeys.Add(key);
        await db.SaveChangesAsync();

        return Ok(new { id = key.Id, secret = key.Secret, name = key.Name });
    }

    [HttpGet("keys")]
    public async Task<IActionResult> ListKeys()
    {
        List<KeySummary> keys = await db.AccessKeys
            .OrderByDescending(k => k.CreatedAt)
            .Select(k => new KeySummary(k.Id, k.Name, k.CreatedAt, k.IsActive))
            .ToListAsync();
        return Ok(keys);
    }

    [HttpPost("keys")]
    public async Task<IActionResult> CreateKey([FromBody] CreateKeyRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name is required" });

        AccessKey key = BuildKey(req.Name);
        db.AccessKeys.Add(key);
        await db.SaveChangesAsync();

        return Ok(new { id = key.Id, secret = key.Secret, name = key.Name });
    }

    [HttpDelete("keys/{id}")]
    public async Task<IActionResult> DeleteKey(string id)
    {
        AccessKey? key = await db.AccessKeys.FindAsync(id);
        if (key is null) return NotFound(new { error = "Key not found" });

        AccessKey current = (AccessKey)HttpContext.Items["AccessKey"]!;
        if (key.Id == current.Id)
            return BadRequest(new { error = "Cannot delete the key currently in use" });

        db.AccessKeys.Remove(key);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static AccessKey BuildKey(string name) => new()
    {
        Id = GenerateId(),
        Secret = GenerateSecret(),
        Name = name,
        CreatedAt = DateTime.UtcNow,
        IsActive = true
    };

    private static string GenerateId() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(10)).ToUpper();

    private static string GenerateSecret() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(30))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
}

public record UnlockRequest(string Password);
public record SetupRequest(string? Name);
public record CreateKeyRequest(string Name);
public record KeySummary(string Id, string Name, DateTime CreatedAt, bool IsActive);
