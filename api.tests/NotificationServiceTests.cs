using Microsoft.AspNetCore.Http;
using Storage.Api.Services;
using Xunit;

namespace Storage.Api.Tests;

public class NotificationServiceTests
{
    // --- Subscribe / Unsubscribe / ClientCount ---

    [Fact]
    public void Subscribe_IncreasesClientCount()
    {
        NotificationService svc = new();
        DefaultHttpContext ctx = new();
        ctx.Response.Body = new MemoryStream();

        string id = svc.Subscribe(ctx.Response);

        Assert.Equal(1, svc.ClientCount);
        Assert.NotEmpty(id);
    }

    [Fact]
    public void Unsubscribe_DecreasesClientCount()
    {
        NotificationService svc = new();
        DefaultHttpContext ctx = new();
        ctx.Response.Body = new MemoryStream();

        string id = svc.Subscribe(ctx.Response);
        svc.Unsubscribe(id);

        Assert.Equal(0, svc.ClientCount);
    }

    [Fact]
    public void Unsubscribe_UnknownId_DoesNotThrow()
    {
        NotificationService svc = new();
        svc.Unsubscribe("unknown-id"); // must not throw
    }

    // --- BroadcastAsync: no clients ---

    [Fact]
    public async Task BroadcastAsync_NoClients_ReturnsWithoutError()
    {
        NotificationService svc = new();
        await svc.BroadcastAsync(StorageEvent.BucketCreated("test")); // must not throw
    }

    // --- BroadcastAsync: writes data to live client ---

    [Fact]
    public async Task BroadcastAsync_LiveClient_WritesEventData()
    {
        NotificationService svc = new();
        DefaultHttpContext ctx = new();
        MemoryStream body = new();
        ctx.Response.Body = body;

        svc.Subscribe(ctx.Response);
        await svc.BroadcastAsync(StorageEvent.ObjectCreated("bucket", "key.txt", 42, "text/plain"));

        body.Seek(0, SeekOrigin.Begin);
        string written = new StreamReader(body).ReadToEnd();
        Assert.Contains("object.created", written);
        Assert.Contains("bucket", written);
    }

    // --- BroadcastAsync: removes dead clients ---

    [Fact]
    public async Task BroadcastAsync_DeadClient_IsRemovedAfterFailure()
    {
        NotificationService svc = new();
        DefaultHttpContext ctx = new();
        ctx.Response.Body = new ThrowingStream();

        svc.Subscribe(ctx.Response);
        Assert.Equal(1, svc.ClientCount);

        await svc.BroadcastAsync(StorageEvent.BucketDeleted("bucket"));

        Assert.Equal(0, svc.ClientCount);
    }

    // --- BroadcastAsync: mixed live + dead clients ---

    [Fact]
    public async Task BroadcastAsync_MixedClients_OnlyDeadRemoved()
    {
        NotificationService svc = new();

        DefaultHttpContext liveCtx = new();
        MemoryStream liveBody = new();
        liveCtx.Response.Body = liveBody;
        svc.Subscribe(liveCtx.Response);

        DefaultHttpContext deadCtx = new();
        deadCtx.Response.Body = new ThrowingStream();
        svc.Subscribe(deadCtx.Response);

        Assert.Equal(2, svc.ClientCount);

        await svc.BroadcastAsync(StorageEvent.BucketCreated("test"));

        Assert.Equal(1, svc.ClientCount);
        liveBody.Seek(0, SeekOrigin.Begin);
        Assert.Contains("bucket.created", new StreamReader(liveBody).ReadToEnd());
    }

    private sealed class ThrowingStream : Stream
    {
        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }
        public override void Flush() => throw new IOException("disconnected");
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new IOException("disconnected");
        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken ct) =>
            throw new IOException("disconnected");
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken ct = default) =>
            throw new IOException("disconnected");
        public override Task FlushAsync(CancellationToken ct) => throw new IOException("disconnected");
    }
}
