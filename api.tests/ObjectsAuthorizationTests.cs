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

/// <summary>
/// Verifies that ObjectsController enforces bucket ownership:
/// a key must not be able to read/write/delete objects in another key's bucket.
/// </summary>
public class ObjectsAuthorizationTests : IAsyncDisposable
{
    public async ValueTask DisposeAsync() => await _db.DisposeAsync();

    private readonly StorageDbContext _db;
    private readonly AccessKey _keyA;
    private readonly AccessKey _keyB;
    private readonly Bucket _bucketB;
    private readonly NotificationService _notifications = new();
    private readonly Mock<IStorageService> _storage = new();

    public ObjectsAuthorizationTests()
    {
        var opts = new DbContextOptionsBuilder<StorageDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new StorageDbContext(opts);

        _keyA = new AccessKey { Id = "AAAAAAAAAA", Secret = "s", Name = "A", IsActive = true, CreatedAt = DateTime.UtcNow };
        _keyB = new AccessKey { Id = "BBBBBBBBBB", Secret = "s", Name = "B", IsActive = true, CreatedAt = DateTime.UtcNow };
        _bucketB = new Bucket { Name = "bucket-b", AccessKeyId = _keyB.Id, CreatedAt = DateTime.UtcNow };

        _db.AccessKeys.AddRange(_keyA, _keyB);
        _db.Buckets.Add(_bucketB);
        _db.SaveChanges();
    }

    private ObjectsController ControllerFor(AccessKey key)
    {
        var ctrl = new ObjectsController(_db, _storage.Object, _notifications);
        var ctx = new DefaultHttpContext();
        ctx.Items["AccessKey"] = key;
        ctrl.ControllerContext = new ControllerContext { HttpContext = ctx };
        return ctrl;
    }

    private static int StatusOf(IActionResult result) => result switch
    {
        ContentResult cr => cr.StatusCode ?? 200,
        StatusCodeResult sc => sc.StatusCode,
        ObjectResult or => or.StatusCode ?? 200,
        _ => 200
    };

    [Fact]
    public async Task ListObjects_CrossBucket_Returns403()
    {
        var result = await ControllerFor(_keyA).ListObjects("bucket-b");
        Assert.Equal(403, StatusOf(result));
    }

    [Fact]
    public async Task GetObject_CrossBucket_Returns403()
    {
        var result = await ControllerFor(_keyA).GetObject("bucket-b", "any-key");
        Assert.Equal(403, StatusOf(result));
    }

    [Fact]
    public async Task HeadObject_CrossBucket_Returns403()
    {
        var result = await ControllerFor(_keyA).HeadObject("bucket-b", "any-key");
        Assert.Equal(403, StatusOf(result));
    }

    [Fact]
    public async Task DeleteObject_CrossBucket_Returns403()
    {
        var result = await ControllerFor(_keyA).DeleteObject("bucket-b", "any-key", null);
        Assert.Equal(403, StatusOf(result));
    }

    [Fact]
    public async Task ListObjects_OwnBucket_Returns200()
    {
        var result = await ControllerFor(_keyB).ListObjects("bucket-b");
        // Owner gets 200 with XML content
        var cr = Assert.IsType<ContentResult>(result);
        Assert.Equal(200, cr.StatusCode ?? 200);
    }

    [Fact]
    public async Task ListObjects_NonExistentBucket_Returns404()
    {
        var result = await ControllerFor(_keyA).ListObjects("does-not-exist");
        Assert.Equal(404, StatusOf(result));
    }
}
