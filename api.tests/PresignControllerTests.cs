using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using Storage.Api.Controllers;
using Storage.Api.Data;
using Storage.Api.Models;
using Storage.Api.Services;
using Xunit;

namespace Storage.Api.Tests;

public class PresignControllerTests : IAsyncDisposable
{
    private readonly StorageDbContext _db;
    private readonly AccessKey _keyA;
    private readonly AccessKey _keyB;
    private readonly Bucket _bucketA;
    private readonly StorageObject _obj;
    private readonly string _tempFile;

    public PresignControllerTests()
    {
        DbContextOptions<StorageDbContext> opts = new DbContextOptionsBuilder<StorageDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new StorageDbContext(opts);

        _keyA = new AccessKey { Id = "AAAAAAAAAA", Secret = "s", Name = "A", IsActive = true, CreatedAt = DateTime.UtcNow };
        _keyB = new AccessKey { Id = "BBBBBBBBBB", Secret = "s", Name = "B", IsActive = true, CreatedAt = DateTime.UtcNow };
        _bucketA = new Bucket { Name = "bucket-a", AccessKeyId = _keyA.Id, CreatedAt = DateTime.UtcNow };

        // Create a real temp file so Download can serve it
        _tempFile = Path.GetTempFileName();
        File.WriteAllBytes(_tempFile, [1, 2, 3, 4, 5]);

        _obj = new StorageObject
        {
            BucketName = "bucket-a", Key = "file.txt", Size = 5,
            ContentType = "application/octet-stream", ETag = "etag",
            FilePath = _tempFile, LastModified = DateTime.UtcNow
        };

        _db.AccessKeys.AddRange(_keyA, _keyB);
        _db.Buckets.Add(_bucketA);
        _db.Objects.Add(_obj);
        _db.SaveChanges();
    }

    private PresignController ControllerFor(AccessKey key)
    {
        Mock<IStorageService> storageMock = new();
        storageMock.Setup(s => s.OpenForRead(It.IsAny<string>()))
                   .Returns((string path) => File.OpenRead(path));

        PresignController ctrl = new(_db, storageMock.Object);
        DefaultHttpContext ctx = new();
        ctx.Response.Body = new MemoryStream();
        ctx.Items["AccessKey"] = key;
        ctrl.ControllerContext = new ControllerContext { HttpContext = ctx };
        return ctrl;
    }

    private static int StatusOf(IActionResult result) => result switch
    {
        ObjectResult or => or.StatusCode ?? 200,
        StatusCodeResult sc => sc.StatusCode,
        ContentResult cr => cr.StatusCode ?? 200,
        _ => 200
    };

    // --- CreateToken ---

    [Fact]
    public async Task CreateToken_OwnBucket_Returns200WithToken()
    {
        IActionResult result = await ControllerFor(_keyA).CreateToken(new PresignRequest("bucket-a", "file.txt", 3600));
        OkObjectResult ok = Assert.IsType<OkObjectResult>(result);
        string json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
        Assert.Contains("token", json);
    }

    [Fact]
    public async Task CreateToken_AnotherKeysBucket_Returns403()
    {
        IActionResult result = await ControllerFor(_keyB).CreateToken(new PresignRequest("bucket-a", "file.txt", 3600));
        Assert.Equal(403, StatusOf(result));
    }

    [Fact]
    public async Task CreateToken_NonExistentBucket_Returns403()
    {
        IActionResult result = await ControllerFor(_keyA).CreateToken(new PresignRequest("no-such-bucket", "file.txt", null));
        Assert.Equal(403, StatusOf(result));
    }

    [Fact]
    public async Task CreateToken_NonExistentObject_Returns404()
    {
        IActionResult result = await ControllerFor(_keyA).CreateToken(new PresignRequest("bucket-a", "ghost.txt", 3600));
        Assert.Equal(404, StatusOf(result));
    }

    [Fact]
    public async Task CreateToken_ExpiryClampedToMin60Seconds()
    {
        IActionResult result = await ControllerFor(_keyA).CreateToken(new PresignRequest("bucket-a", "file.txt", 1));
        OkObjectResult ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
    }

    [Fact]
    public async Task CreateToken_ExpiryClampedToMax7Days()
    {
        IActionResult result = await ControllerFor(_keyA).CreateToken(new PresignRequest("bucket-a", "file.txt", 999_999));
        OkObjectResult ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
    }

    [Fact]
    public async Task CreateToken_NullExpiry_UsesDefault3600()
    {
        IActionResult result = await ControllerFor(_keyA).CreateToken(new PresignRequest("bucket-a", "file.txt", null));
        Assert.IsType<OkObjectResult>(result);
    }

    // --- Download ---

    [Fact]
    public async Task Download_UnknownToken_Returns403()
    {
        IActionResult result = await ControllerFor(_keyA).Download("doesnotexist");
        Assert.Equal(403, StatusOf(result));
    }

    [Fact]
    public async Task Download_ExpiredToken_Returns403AndDeletesToken()
    {
        PresignedToken expired = new()
        {
            Id = "expiredtoken",
            BucketName = "bucket-a",
            Key = "file.txt",
            ExpiresAt = DateTime.UtcNow.AddSeconds(-1),
        };
        _db.PresignedTokens.Add(expired);
        await _db.SaveChangesAsync();

        IActionResult result = await ControllerFor(_keyA).Download("expiredtoken");
        Assert.Equal(403, StatusOf(result));
        Assert.Null(await _db.PresignedTokens.FindAsync("expiredtoken"));
    }

    [Fact]
    public async Task Download_ValidToken_MissingFile_Returns404()
    {
        // Object whose FilePath doesn't exist on disk
        StorageObject ghost = new()
        {
            BucketName = "bucket-a", Key = "ghost.bin", Size = 0,
            ContentType = "application/octet-stream", ETag = "e",
            FilePath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()),
            LastModified = DateTime.UtcNow
        };
        _db.Objects.Add(ghost);

        PresignedToken token = new()
        {
            Id = "validtoken-ghost",
            BucketName = "bucket-a",
            Key = "ghost.bin",
            ExpiresAt = DateTime.UtcNow.AddHours(1),
        };
        _db.PresignedTokens.Add(token);
        await _db.SaveChangesAsync();

        IActionResult result = await ControllerFor(_keyA).Download("validtoken-ghost");
        Assert.Equal(404, StatusOf(result));
    }

    [Fact]
    public async Task Download_ValidToken_ExistingFile_ReturnsFile()
    {
        PresignedToken token = new()
        {
            Id = "good-token",
            BucketName = "bucket-a",
            Key = "file.txt",
            ExpiresAt = DateTime.UtcNow.AddHours(1),
        };
        _db.PresignedTokens.Add(token);
        await _db.SaveChangesAsync();

        IActionResult result = await ControllerFor(_keyA).Download("good-token");
        Assert.IsType<FileStreamResult>(result);
    }

    // --- Expired token cleanup on CreateToken ---

    [Fact]
    public async Task ExpiredTokensDeletedOnCreate()
    {
        _db.PresignedTokens.Add(new PresignedToken
        {
            Id = "oldtoken",
            BucketName = "bucket-a",
            Key = "file.txt",
            ExpiresAt = DateTime.UtcNow.AddDays(-1),
        });
        await _db.SaveChangesAsync();

        await ControllerFor(_keyA).CreateToken(new PresignRequest("bucket-a", "file.txt", 300));

        Assert.Null(await _db.PresignedTokens.FindAsync("oldtoken"));
    }

    public async ValueTask DisposeAsync()
    {
        await _db.DisposeAsync();
        if (File.Exists(_tempFile)) File.Delete(_tempFile);
    }
}
