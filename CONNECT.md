# Connecting to Stash from your project

Stash exposes an S3-compatible API. Any AWS SDK works out of the box — point it at your Stash instance instead of AWS.

## Docker Compose setup

```yaml
# docker-compose.yml (your project)
services:
  stash:
    image: ghcr.io/Neotoxic-off/stash:latest   # or build: ./stash
    ports:
      - "3141:3141"                        # web UI
    environment:
      ADMIN_PASSWORD: "changeme"
      ENCRYPTION_KEY: ""                   # optional: enable at-rest encryption
      STORAGE_PATH: "/data/storage"
    volumes:
      - stash_data:/data/storage

volumes:
  stash_data:
```

The S3 endpoint is the Next.js app on port 3000 — it proxies all S3 requests to the API internally.

## Credentials

1. Open the web UI (`http://localhost:3141`) and log in with your `ADMIN_PASSWORD`.
2. Go to **Settings → API Keys** and create a key.
3. Note the **Key ID** and **Secret**.

For SDK clients, use:
- **Endpoint**: `http://localhost:3141`
- **Access Key ID**: your key ID
- **Secret Access Key**: your secret
- **Region**: `us-east-1` (any value works — Stash ignores it)

---

## Python — boto3

```bash
pip install boto3
```

```python
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="http://localhost:3141",
    aws_access_key_id="YOUR_KEY_ID",
    aws_secret_access_key="YOUR_SECRET",
    region_name="us-east-1",
)

# Create a bucket
s3.create_bucket(Bucket="my-bucket")

# Upload a file
s3.upload_file("local.txt", "my-bucket", "remote/path.txt")

# Download a file
s3.download_file("my-bucket", "remote/path.txt", "downloaded.txt")

# List objects
response = s3.list_objects_v2(Bucket="my-bucket", Prefix="remote/")
for obj in response.get("Contents", []):
    print(obj["Key"], obj["Size"])

# Generate a presigned URL (via Stash /presign endpoint — see API below)
# boto3 presigned URLs target AWS directly; use the /presign REST API instead.

# Delete an object
s3.delete_object(Bucket="my-bucket", Key="remote/path.txt")
```

---

## JavaScript / TypeScript — @aws-sdk/client-s3

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

```typescript
import { S3Client, CreateBucketCommand, PutObjectCommand,
         GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: "http://localhost:3141",
  credentials: { accessKeyId: "YOUR_KEY_ID", secretAccessKey: "YOUR_SECRET" },
  region: "us-east-1",
  forcePathStyle: true,   // required for non-AWS endpoints
});

// Create bucket
await s3.send(new CreateBucketCommand({ Bucket: "my-bucket" }));

// Upload
await s3.send(new PutObjectCommand({
  Bucket: "my-bucket",
  Key: "folder/file.txt",
  Body: "hello world",
  ContentType: "text/plain",
}));

// Download
const { Body } = await s3.send(new GetObjectCommand({
  Bucket: "my-bucket",
  Key: "folder/file.txt",
}));
const text = await Body!.transformToString();

// List
const { Contents } = await s3.send(new ListObjectsV2Command({
  Bucket: "my-bucket",
  Prefix: "folder/",
}));

// Delete
await s3.send(new DeleteObjectCommand({ Bucket: "my-bucket", Key: "folder/file.txt" }));
```

---

## .NET — AWSSDK.S3

```bash
dotnet add package AWSSDK.S3
```

```csharp
using Amazon;
using Amazon.S3;
using Amazon.S3.Model;

AmazonS3Config config = new()
{
    ServiceURL = "http://localhost:3141",
    ForcePathStyle = true,
};

using AmazonS3Client s3 = new("YOUR_KEY_ID", "YOUR_SECRET", config);

// Create bucket
await s3.PutBucketAsync(new PutBucketRequest { BucketName = "my-bucket" });

// Upload
await s3.PutObjectAsync(new PutObjectRequest
{
    BucketName = "my-bucket",
    Key = "folder/file.txt",
    ContentBody = "hello world",
    ContentType = "text/plain",
});

// Download
GetObjectResponse response = await s3.GetObjectAsync("my-bucket", "folder/file.txt");
using StreamReader reader = new(response.ResponseStream);
string content = await reader.ReadToEndAsync();

// List
ListObjectsV2Response list = await s3.ListObjectsV2Async(new ListObjectsV2Request
{
    BucketName = "my-bucket",
    Prefix = "folder/",
});
foreach (S3Object obj in list.S3Objects)
    Console.WriteLine($"{obj.Key}  {obj.Size} bytes");

// Delete
await s3.DeleteObjectAsync("my-bucket", "folder/file.txt");
```

---

## Presigned download URLs

Stash supports temporary download links via its own `/presign` endpoint (auth required, the download link itself is auth-free):

```http
POST /presign
X-Access-Key: YOUR_KEY_ID
Content-Type: application/json

{ "bucket": "my-bucket", "key": "folder/file.txt", "expiresIn": 3600 }
```

Response:
```json
{ "token": "abc123...", "expiresAt": "2025-01-01T00:00:00Z" }
```

Share link: `http://localhost:3141/download/abc123...`

The link works without credentials and expires automatically. Min 60 s, max 7 days.

---

## Running tests

```bash
# From repo root
dotnet test api.tests/ \
  /p:CollectCoverage=true \
  /p:CoverletOutputFormat=cobertura \
  /p:CoverletOutput=./coverage/
```
