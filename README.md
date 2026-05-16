<div align="center">
  <img src="web/src/app/icon.svg" width="64" height="64" alt="Stash logo" />
  <h1>Stash</h1>
  <p>Self-hosted, S3-compatible object storage with a clean web UI.</p>
</div>

---

## What it is

Stash is a lightweight storage server you can run alongside any project. It speaks the S3 API, so any AWS SDK works out of the box — just point it at your Stash instance instead of AWS.

- **S3-compatible** — works with boto3, @aws-sdk/client-s3, AWSSDK.S3, and any other S3 client
- **At-rest encryption** — optional AES-256-CBC encryption for stored objects
- **Presigned URLs** — generate time-limited download links without exposing credentials
- **Real-time events** — SSE feed for bucket/object lifecycle events
- **Web UI** — browse buckets, upload files, manage keys, monitor events

## Quick start

```yaml
# docker-compose.yml
services:
  stash:
    image: ghcr.io/Neotoxic-off/stash:latest
    ports:
      - "3000:3000"
    environment:
      ADMIN_PASSWORD: "changeme"
      ENCRYPTION_KEY: ""        # optional: enable at-rest encryption
      STORAGE_PATH: "/data"
    volumes:
      - stash_data:/data

volumes:
  stash_data:
```

```bash
docker compose up
```

Open `http://localhost:3141`, log in with your `ADMIN_PASSWORD`, create an API key, and start using it.

## Connect with an SDK

```python
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="http://localhost:3141",
    aws_access_key_id="YOUR_KEY_ID",
    aws_secret_access_key="YOUR_SECRET",
    region_name="us-east-1",
)

s3.create_bucket(Bucket="my-bucket")
s3.upload_file("file.txt", "my-bucket", "file.txt")
```

See [CONNECT.md](CONNECT.md) for Python, JavaScript, and .NET examples.

## Stack

| Layer | Tech |
|-------|------|
| API | ASP.NET Core 10, EF Core + SQLite |
| Web UI | Next.js 16, React 19, Tailwind v4, shadcn/ui |
| Storage | Local filesystem (encrypted or plain) |
| Auth | HMAC API keys, constant-time comparison |

## Running tests

```bash
dotnet test api.tests/ \
  /p:CollectCoverage=true \
  /p:CoverletOutputFormat=cobertura \
  /p:CoverletOutput=./coverage/
```
