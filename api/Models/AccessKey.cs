namespace Storage.Api.Models;

public class AccessKey
{
    public string Id { get; set; } = string.Empty;
    public string Secret { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;
}
