namespace Storage.Api.Models;

public class Bucket
{
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string AccessKeyId { get; set; } = string.Empty;
}
