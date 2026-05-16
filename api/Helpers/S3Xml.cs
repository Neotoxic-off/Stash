using System.Xml.Linq;
using Storage.Api.Models;

namespace Storage.Api.Helpers;

public static class S3Xml
{
    private static readonly XNamespace Ns = "http://s3.amazonaws.com/doc/2006-03-01/";

    public static string ListBuckets(IEnumerable<Bucket> buckets, string ownerId)
    {
        var doc = new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(Ns + "ListAllMyBucketsResult",
                new XElement(Ns + "Owner",
                    new XElement(Ns + "ID", ownerId),
                    new XElement(Ns + "DisplayName", "owner")),
                new XElement(Ns + "Buckets",
                    buckets.Select(b => new XElement(Ns + "Bucket",
                        new XElement(Ns + "Name", b.Name),
                        new XElement(Ns + "CreationDate", b.CreatedAt.ToString("o")))))));
        return doc.Declaration + doc.ToString();
    }

    public static string ListObjects(
        string bucketName,
        IEnumerable<StorageObject> objects,
        string prefix,
        string delimiter,
        bool isTruncated,
        IEnumerable<string> commonPrefixes,
        string? nextContinuationToken = null)
    {
        var contents = objects.Select(o => new XElement(Ns + "Contents",
            new XElement(Ns + "Key", o.Key),
            new XElement(Ns + "LastModified", o.LastModified.ToString("o")),
            new XElement(Ns + "ETag", $"\"{o.ETag}\""),
            o.Sha256 is not null ? new XElement(Ns + "ChecksumSHA256", o.Sha256) : null,
            new XElement(Ns + "Size", o.Size),
            new XElement(Ns + "StorageClass", "STANDARD")));

        var prefixElements = commonPrefixes.Select(p => new XElement(Ns + "CommonPrefixes",
            new XElement(Ns + "Prefix", p)));

        var doc = new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(Ns + "ListBucketResult",
                new XElement(Ns + "Name", bucketName),
                new XElement(Ns + "Prefix", prefix),
                new XElement(Ns + "Delimiter", delimiter),
                new XElement(Ns + "IsTruncated", isTruncated.ToString().ToLower()),
                isTruncated && nextContinuationToken is not null
                    ? new XElement(Ns + "NextContinuationToken", nextContinuationToken)
                    : null,
                contents,
                prefixElements));
        return doc.Declaration + doc.ToString();
    }

    public static string CreateMultipartUpload(string bucket, string key, string uploadId)
    {
        var doc = new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(Ns + "InitiateMultipartUploadResult",
                new XElement(Ns + "Bucket", bucket),
                new XElement(Ns + "Key", key),
                new XElement(Ns + "UploadId", uploadId)));
        return doc.Declaration + doc.ToString();
    }

    public static string CompleteMultipartUpload(string bucket, string key, string etag)
    {
        var doc = new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(Ns + "CompleteMultipartUploadResult",
                new XElement(Ns + "Location", $"/{bucket}/{key}"),
                new XElement(Ns + "Bucket", bucket),
                new XElement(Ns + "Key", key),
                new XElement(Ns + "ETag", $"\"{etag}\"")));
        return doc.Declaration + doc.ToString();
    }

    public static string Error(string code, string message, string resource = "")
    {
        var doc = new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement("Error",
                new XElement("Code", code),
                new XElement("Message", message),
                new XElement("Resource", resource)));
        return doc.Declaration + doc.ToString();
    }
}
