using Storage.Api.Services;
using Xunit;

namespace Storage.Api.Tests;

public class StorageEventTests
{
    [Fact]
    public void BucketCreated_SetsCorrectFields()
    {
        StorageEvent evt = StorageEvent.BucketCreated("my-bucket");
        Assert.Equal("bucket.created", evt.Event);
        Assert.Equal("my-bucket", evt.Bucket);
        Assert.Null(evt.Key);
        Assert.Null(evt.Size);
        Assert.NotEmpty(evt.Timestamp);
    }

    [Fact]
    public void BucketDeleted_SetsCorrectFields()
    {
        StorageEvent evt = StorageEvent.BucketDeleted("my-bucket");
        Assert.Equal("bucket.deleted", evt.Event);
        Assert.Equal("my-bucket", evt.Bucket);
        Assert.Null(evt.Key);
    }

    [Fact]
    public void ObjectCreated_SetsCorrectFields()
    {
        StorageEvent evt = StorageEvent.ObjectCreated("b", "k.txt", 99, "text/plain");
        Assert.Equal("object.created", evt.Event);
        Assert.Equal("b", evt.Bucket);
        Assert.Equal("k.txt", evt.Key);
        Assert.Equal(99, evt.Size);
        Assert.Equal("text/plain", evt.ContentType);
        Assert.NotEmpty(evt.Timestamp);
    }

    [Fact]
    public void ObjectUpdated_SetsCorrectFields()
    {
        StorageEvent evt = StorageEvent.ObjectUpdated("b", "k.txt", 50, "image/png");
        Assert.Equal("object.updated", evt.Event);
        Assert.Equal(50, evt.Size);
        Assert.Equal("image/png", evt.ContentType);
    }

    [Fact]
    public void ObjectDeleted_SetsCorrectFields()
    {
        StorageEvent evt = StorageEvent.ObjectDeleted("b", "k.txt");
        Assert.Equal("object.deleted", evt.Event);
        Assert.Equal("b", evt.Bucket);
        Assert.Equal("k.txt", evt.Key);
        Assert.Null(evt.Size);
        Assert.Null(evt.ContentType);
    }
}
