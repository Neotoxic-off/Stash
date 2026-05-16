namespace Storage.Api.Models;

public class StorageObject
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string BucketName { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public long Size { get; set; }
    public string ContentType { get; set; } = "application/octet-stream";
    public string ETag { get; set; } = string.Empty;
    public string? Sha256 { get; set; }
    public DateTime LastModified { get; set; } = DateTime.UtcNow;
    public string FilePath { get; set; } = string.Empty;
}
