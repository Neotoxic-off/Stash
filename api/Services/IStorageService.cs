namespace Storage.Api.Services;

public interface IStorageService
{
    string GetObjectPath(string bucketName, string key);
    string GetTempPartPath(string uploadId, int partNumber);
    void EnsureBucketDirectory(string bucketName);
    void DeleteBucketDirectory(string bucketName);
    void DeleteObject(string filePath);
    void DeleteTempParts(string uploadId);
    string ComputeETag(string filePath);
    Stream OpenForRead(string filePath);
    Task<(string etag, string sha256, long size)> WriteAndHashAsync(Stream source, string destPath);
    Task<(string etag, string sha256, long size)> MergePartsAsync(string[] partPaths, string destPath);
}
