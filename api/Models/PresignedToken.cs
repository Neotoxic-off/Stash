namespace Storage.Api.Models;

public class PresignedToken
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string BucketName { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
