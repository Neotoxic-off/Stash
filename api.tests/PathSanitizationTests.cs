using Storage.Api.Services;
using Xunit;

namespace Storage.Api.Tests;

public class PathSanitizationTests : IDisposable
{
    private readonly string _root;
    private readonly LocalStorageService _svc;

    public PathSanitizationTests()
    {
        _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(_root);
        _svc = new LocalStorageService(_root);
        // create the bucket directory so GetObjectPath can resolve within it
        Directory.CreateDirectory(Path.Combine(_root, "buckets", "test-bucket", "objects"));
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);

    // --- Valid keys ---

    [Theory]
    [InlineData("file.txt")]
    [InlineData("folder/file.txt")]
    [InlineData("deep/nested/path/image.jpg")]
    [InlineData("a.b.c")]
    public void ValidKey_ReturnsPathInsideBucket(string key)
    {
        var path = _svc.GetObjectPath("test-bucket", key);
        var bucketDir = Path.GetFullPath(Path.Combine(_root, "buckets", "test-bucket", "objects"));
        Assert.StartsWith(bucketDir + Path.DirectorySeparatorChar, path);
    }

    // --- Path traversal ---

    [Theory]
    [InlineData("../secret.txt")]
    [InlineData("../../etc/passwd")]
    [InlineData("folder/../../outside.txt")]
    [InlineData("folder/../../../root.txt")]
    public void PathTraversal_ThrowsArgumentException(string key)
    {
        Assert.Throws<ArgumentException>(() => _svc.GetObjectPath("test-bucket", key));
    }

    // --- Null bytes ---

    [Theory]
    [InlineData("file\0.txt")]
    [InlineData("\0")]
    [InlineData("folder/\0evil")]
    public void NullByte_ThrowsArgumentException(string key)
    {
        Assert.Throws<ArgumentException>(() => _svc.GetObjectPath("test-bucket", key));
    }

    // --- Empty / whitespace only ---

    [Theory]
    [InlineData("")]
    [InlineData("/")]
    [InlineData("./")]
    [InlineData("../")]
    public void EmptyResolvedPath_ThrowsArgumentException(string key)
    {
        Assert.Throws<ArgumentException>(() => _svc.GetObjectPath("test-bucket", key));
    }

    // --- Key too long ---

    [Fact]
    public void KeyExceeds1024Bytes_ThrowsArgumentException()
    {
        var longKey = new string('a', 1025);
        Assert.Throws<ArgumentException>(() => _svc.GetObjectPath("test-bucket", longKey));
    }

    [Fact]
    public void KeyExactly1024Bytes_DoesNotThrow()
    {
        var key = new string('a', 1024);
        var path = _svc.GetObjectPath("test-bucket", key);
        Assert.NotEmpty(path);
    }
}
