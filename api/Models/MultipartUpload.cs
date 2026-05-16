namespace Storage.Api.Models;

public class MultipartUpload
{
    public string UploadId { get; set; } = Guid.NewGuid().ToString("N");
    public string BucketName { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/octet-stream";
    public DateTime InitiatedAt { get; set; } = DateTime.UtcNow;
}

public class MultipartPart
{
    public int Id { get; set; }
    public string UploadId { get; set; } = string.Empty;
    public int PartNumber { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public long Size { get; set; }
    public string ETag { get; set; } = string.Empty;
}
