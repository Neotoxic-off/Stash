using System.Xml.Linq;
using Storage.Api.Helpers;
using Storage.Api.Models;
using Xunit;

namespace Storage.Api.Tests;

public class S3XmlTests
{
    private static readonly XNamespace Ns = "http://s3.amazonaws.com/doc/2006-03-01/";

    private static XDocument Parse(string xml) => XDocument.Parse(xml);

    // --- ListBuckets ---

    [Fact]
    public void ListBuckets_ContainsNameAndDate()
    {
        Bucket[] buckets = [new Bucket { Name = "bucket-a", CreatedAt = new DateTime(2024, 1, 15, 0, 0, 0, DateTimeKind.Utc) }];
        string xml = S3Xml.ListBuckets(buckets, "owner-id");
        XDocument doc = Parse(xml);

        string name = doc.Descendants(Ns + "Name").First().Value;
        Assert.Equal("bucket-a", name);

        string date = doc.Descendants(Ns + "CreationDate").First().Value;
        Assert.Contains("2024-01-15", date);
    }

    [Fact]
    public void ListBuckets_UsesS3Namespace()
    {
        string xml = S3Xml.ListBuckets([], "owner");
        XDocument doc = Parse(xml);
        Assert.Equal(Ns.NamespaceName, doc.Root!.Name.Namespace.NamespaceName);
    }

    [Fact]
    public void ListBuckets_OwnerId_InOwnerElement()
    {
        string xml = S3Xml.ListBuckets([], "my-owner-id");
        XDocument doc = Parse(xml);
        string id = doc.Descendants(Ns + "ID").First().Value;
        Assert.Equal("my-owner-id", id);
    }

    [Fact]
    public void ListBuckets_EmptyList_NoBucketElements()
    {
        string xml = S3Xml.ListBuckets([], "owner");
        XDocument doc = Parse(xml);
        Assert.Empty(doc.Descendants(Ns + "Bucket"));
    }

    // --- ListObjects ---

    [Fact]
    public void ListObjects_IncludesSha256WhenPresent()
    {
        StorageObject obj = new()
        {
            Key = "file.txt", Size = 100, ETag = "abc", Sha256 = "deadbeef",
            LastModified = DateTime.UtcNow, ContentType = "text/plain"
        };
        string xml = S3Xml.ListObjects("bucket", [obj], "", "", false, []);
        XDocument doc = Parse(xml);

        XElement? sha = doc.Descendants(Ns + "ChecksumSHA256").FirstOrDefault();
        Assert.NotNull(sha);
        Assert.Equal("deadbeef", sha!.Value);
    }

    [Fact]
    public void ListObjects_OmitsSha256WhenNull()
    {
        StorageObject obj = new()
        {
            Key = "file.txt", Size = 100, ETag = "abc", Sha256 = null,
            LastModified = DateTime.UtcNow, ContentType = "text/plain"
        };
        string xml = S3Xml.ListObjects("bucket", [obj], "", "", false, []);
        XDocument doc = Parse(xml);

        Assert.Empty(doc.Descendants(Ns + "ChecksumSHA256"));
    }

    [Fact]
    public void ListObjects_CommonPrefixesIncluded()
    {
        string xml = S3Xml.ListObjects("bucket", [], "img/", "/", false, ["img/2024/", "img/2025/"]);
        XDocument doc = Parse(xml);

        List<string> prefixes = doc.Descendants(Ns + "CommonPrefixes")
            .Select(el => el.Element(Ns + "Prefix")!.Value)
            .ToList();

        Assert.Contains("img/2024/", prefixes);
        Assert.Contains("img/2025/", prefixes);
    }

    [Fact]
    public void ListObjects_IsTruncated_IncludesNextToken()
    {
        string xml = S3Xml.ListObjects("bucket", [], "", "", true, [], "last-key");
        XDocument doc = Parse(xml);

        XElement? truncated = doc.Descendants(Ns + "IsTruncated").FirstOrDefault();
        Assert.NotNull(truncated);
        Assert.Equal("true", truncated!.Value);

        XElement? token = doc.Descendants(Ns + "NextContinuationToken").FirstOrDefault();
        Assert.NotNull(token);
        Assert.Equal("last-key", token!.Value);
    }

    [Fact]
    public void ListObjects_NotTruncated_NoNextToken()
    {
        string xml = S3Xml.ListObjects("bucket", [], "", "", false, []);
        XDocument doc = Parse(xml);

        Assert.Empty(doc.Descendants(Ns + "NextContinuationToken"));
        XElement? truncated = doc.Descendants(Ns + "IsTruncated").First();
        Assert.Equal("false", truncated.Value);
    }

    [Fact]
    public void ListObjects_ETagWrappedInQuotes()
    {
        StorageObject obj = new()
        {
            Key = "f.txt", Size = 1, ETag = "abc123",
            LastModified = DateTime.UtcNow, ContentType = "text/plain"
        };
        string xml = S3Xml.ListObjects("bucket", [obj], "", "", false, []);
        XDocument doc = Parse(xml);
        string etag = doc.Descendants(Ns + "ETag").First().Value;
        Assert.Equal("\"abc123\"", etag);
    }

    // --- CreateMultipartUpload ---

    [Fact]
    public void CreateMultipartUpload_ContainsBucketKeyUploadId()
    {
        string xml = S3Xml.CreateMultipartUpload("my-bucket", "path/to/file.bin", "upload-123");
        XDocument doc = Parse(xml);

        Assert.Equal("my-bucket", doc.Descendants(Ns + "Bucket").First().Value);
        Assert.Equal("path/to/file.bin", doc.Descendants(Ns + "Key").First().Value);
        Assert.Equal("upload-123", doc.Descendants(Ns + "UploadId").First().Value);
    }

    // --- CompleteMultipartUpload ---

    [Fact]
    public void CompleteMultipartUpload_ContainsETag()
    {
        string xml = S3Xml.CompleteMultipartUpload("bucket", "key.txt", "etag123");
        XDocument doc = Parse(xml);
        Assert.Equal("\"etag123\"", doc.Descendants(Ns + "ETag").First().Value);
    }

    [Fact]
    public void CompleteMultipartUpload_ContainsLocation()
    {
        string xml = S3Xml.CompleteMultipartUpload("bucket", "key.txt", "etag");
        XDocument doc = Parse(xml);
        string location = doc.Descendants(Ns + "Location").First().Value;
        Assert.Equal("/bucket/key.txt", location);
    }

    // --- Error ---

    [Fact]
    public void Error_ContainsCodeAndMessage()
    {
        string xml = S3Xml.Error("NoSuchKey", "The key does not exist", "/bucket/key");
        XDocument doc = Parse(xml);

        Assert.Equal("NoSuchKey", doc.Root!.Element("Code")!.Value);
        Assert.Equal("The key does not exist", doc.Root.Element("Message")!.Value);
        Assert.Equal("/bucket/key", doc.Root.Element("Resource")!.Value);
    }

    [Fact]
    public void Error_EmptyResource_DefaultsToEmptyString()
    {
        string xml = S3Xml.Error("SomeCode", "Some message");
        XDocument doc = Parse(xml);
        string resource = doc.Root!.Element("Resource")!.Value;
        Assert.Equal("", resource);
    }
}
