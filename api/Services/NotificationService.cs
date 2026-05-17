using System.Collections.Concurrent;
using System.Text.Json;

namespace Storage.Api.Services;

public record StorageEvent(
    string Event,
    string? Bucket = null,
    string? Key = null,
    long? Size = null,
    string? ContentType = null,
    string? Sha256 = null,
    string Timestamp = "")
{
    public static StorageEvent BucketCreated(string bucket) =>
        new("bucket.created", bucket, Timestamp: DateTime.UtcNow.ToString("o"));

    public static StorageEvent BucketDeleted(string bucket) =>
        new("bucket.deleted", bucket, Timestamp: DateTime.UtcNow.ToString("o"));

    public static StorageEvent ObjectCreated(string bucket, string key, long size, string contentType, string? sha256 = null) =>
        new("object.created", bucket, key, size, contentType, sha256, DateTime.UtcNow.ToString("o"));

    public static StorageEvent ObjectUpdated(string bucket, string key, long size, string contentType, string? sha256 = null) =>
        new("object.updated", bucket, key, size, contentType, sha256, DateTime.UtcNow.ToString("o"));

    public static StorageEvent ObjectDeleted(string bucket, string key) =>
        new("object.deleted", bucket, key, Timestamp: DateTime.UtcNow.ToString("o"));
}

public class NotificationService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly ConcurrentDictionary<string, (HttpResponse Response, SemaphoreSlim Sem)> _clients = new();

    public string Subscribe(HttpResponse response)
    {
        string id = Guid.NewGuid().ToString("N");
        _clients.TryAdd(id, (response, new SemaphoreSlim(1, 1)));
        return id;
    }

    public void Unsubscribe(string id)
    {
        if (_clients.TryRemove(id, out (HttpResponse _, SemaphoreSlim Sem) entry))
            entry.Sem.Dispose();
    }

    public int ClientCount => _clients.Count;

    public async Task BroadcastAsync(StorageEvent evt)
    {
        if (_clients.IsEmpty) return;

        string line = $"data: {JsonSerializer.Serialize(evt, JsonOpts)}\n\n";
        List<string> dead = [];

        foreach ((string clientId, (HttpResponse response, SemaphoreSlim sem)) in _clients)
        {
            await sem.WaitAsync();
            try
            {
                await response.WriteAsync(line);
                await response.Body.FlushAsync();
            }
            catch
            {
                dead.Add(clientId);
            }
            finally
            {
                sem.Release();
            }
        }

        foreach (string clientId in dead)
        {
            if (_clients.TryRemove(clientId, out (HttpResponse _, SemaphoreSlim Sem) entry))
                entry.Sem.Dispose();
        }
    }
}
