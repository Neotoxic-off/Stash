export interface Bucket {
  name: string;
  creationDate: string;
}

export interface S3Object {
  key: string;
  lastModified: string;
  etag: string;
  sha256?: string;
  size: number;
  storageClass: string;
}

export interface ListObjectsResult {
  name: string;
  prefix: string;
  delimiter: string;
  contents: S3Object[];
  commonPrefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export interface AccessKey {
  id: string;
  name: string;
  createdAt: string;
  isActive: boolean;
}

export interface NewAccessKey {
  id: string;
  secret: string;
  name: string;
}

export interface StorageEvent {
  event:
    | "connected"
    | "object.created"
    | "object.updated"
    | "object.deleted"
    | "bucket.created"
    | "bucket.deleted";
  bucket?: string;
  key?: string;
  size?: number;
  contentType?: string;
  timestamp?: string;
  clients?: number;
}

export interface UploadTask {
  id: string;
  name: string;
  key: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}
