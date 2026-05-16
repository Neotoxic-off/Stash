'use client';

import type { Bucket, ListObjectsResult, AccessKey, NewAccessKey, S3Object, StorageEvent } from './types';

const S3_NS = 'http://s3.amazonaws.com/doc/2006-03-01/';
const API = '/api';

export function getAccessKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('storage_access_key') ?? '';
}

export function setAccessKey(key: string): void {
  localStorage.setItem('storage_access_key', key);
  window.dispatchEvent(new Event('keychange'));
}

export function isConfigured(): boolean {
  return typeof window !== 'undefined' && Boolean(localStorage.getItem('storage_access_key'));
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'X-Access-Key': getAccessKey(), ...extra };
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function xmlText(el: Document | Element, tag: string): string {
  return (
    el.getElementsByTagNameNS(S3_NS, tag)[0]?.textContent ??
    el.getElementsByTagName(tag)[0]?.textContent ??
    ''
  );
}

async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text();
  let message = `HTTP ${res.status}`;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('xml')) {
    try {
      const doc = parseXml(text);
      const msg = xmlText(doc, 'Message');
      const code = xmlText(doc, 'Code');
      if (msg) message = msg;
      else if (code) message = code;
    } catch {
      if (text) message = text;
    }
  } else if (text) {
    try {
      const json = JSON.parse(text) as Record<string, string>;
      message = json['error'] ?? json['message'] ?? text;
    } catch {
      message = text;
    }
  }
  throw new Error(message);
}

export const api = {
  // Buckets
  async listBuckets(): Promise<Bucket[]> {
    const res = await fetch(`${API}/`, { headers: authHeaders() });
    await assertOk(res);
    const doc = parseXml(await res.text());
    return Array.from(doc.getElementsByTagNameNS(S3_NS, 'Bucket')).map((b) => ({
      name: b.getElementsByTagNameNS(S3_NS, 'Name')[0]?.textContent ?? '',
      creationDate: b.getElementsByTagNameNS(S3_NS, 'CreationDate')[0]?.textContent ?? '',
    }));
  },

  async createBucket(name: string): Promise<void> {
    const res = await fetch(`${API}/${name}`, { method: 'PUT', headers: authHeaders() });
    await assertOk(res);
  },

  async deleteBucket(name: string): Promise<void> {
    const res = await fetch(`${API}/${name}`, { method: 'DELETE', headers: authHeaders() });
    await assertOk(res);
  },

  // Objects
  async listObjects(
    bucket: string,
    prefix = '',
    delimiter = '/',
    maxKeys = 50,
    continuationToken?: string,
  ): Promise<ListObjectsResult> {
    const params = new URLSearchParams({ prefix, delimiter, 'max-keys': String(maxKeys) });
    if (continuationToken) params.set('continuation-token', continuationToken);
    const res = await fetch(`${API}/${bucket}?${params}`, { headers: authHeaders() });
    await assertOk(res);
    const doc = parseXml(await res.text());

    const contents: S3Object[] = Array.from(
      doc.getElementsByTagNameNS(S3_NS, 'Contents'),
    ).map((el) => ({
      key: el.getElementsByTagNameNS(S3_NS, 'Key')[0]?.textContent ?? '',
      lastModified: el.getElementsByTagNameNS(S3_NS, 'LastModified')[0]?.textContent ?? '',
      etag: (el.getElementsByTagNameNS(S3_NS, 'ETag')[0]?.textContent ?? '').replace(/"/g, ''),
      sha256: el.getElementsByTagNameNS(S3_NS, 'ChecksumSHA256')[0]?.textContent ?? undefined,
      size: parseInt(el.getElementsByTagNameNS(S3_NS, 'Size')[0]?.textContent ?? '0', 10),
      storageClass:
        el.getElementsByTagNameNS(S3_NS, 'StorageClass')[0]?.textContent ?? 'STANDARD',
    }));

    const commonPrefixes = Array.from(
      doc.getElementsByTagNameNS(S3_NS, 'CommonPrefixes'),
    ).map((el) => el.getElementsByTagNameNS(S3_NS, 'Prefix')[0]?.textContent ?? '');

    const nextToken = doc.getElementsByTagNameNS(S3_NS, 'NextContinuationToken')[0]?.textContent ?? undefined;
    return {
      name: xmlText(doc, 'Name'),
      prefix: xmlText(doc, 'Prefix'),
      delimiter: xmlText(doc, 'Delimiter'),
      contents,
      commonPrefixes,
      isTruncated: xmlText(doc, 'IsTruncated') === 'true',
      nextContinuationToken: nextToken || undefined,
    };
  },

  async createPresignedUrl(bucket: string, key: string, expiresIn = 3600): Promise<string> {
    const res = await fetch(`${API}/presign`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, key, expiresIn }),
    });
    await assertOk(res);
    const { token } = (await res.json()) as { token: string };
    return `${API}/download/${token}`;
  },

  async uploadObject(
    bucket: string,
    key: string,
    file: Blob,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${API}/${bucket}/${key}`);
      xhr.setRequestHeader('X-Access-Key', getAccessKey());
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
          if (e.lengthComputable) onProgress(e.loaded / e.total);
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      });
      xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
      xhr.send(file);
    });
  },

  async deleteObject(bucket: string, key: string): Promise<void> {
    const res = await fetch(`${API}/${bucket}/${key}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await assertOk(res);
  },

  async deletePrefix(bucket: string, prefix: string): Promise<void> {
    let token: string | undefined;
    do {
      const result = await api.listObjects(bucket, prefix, '', 1000, token);
      if (result.contents.length > 0) {
        await Promise.all(result.contents.map((obj) => api.deleteObject(bucket, obj.key)));
      }
      token = result.nextContinuationToken;
    } while (token);
  },

  // Admin
  async setup(name: string): Promise<NewAccessKey> {
    const res = await fetch(`${API}/admin/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    await assertOk(res);
    return res.json() as Promise<NewAccessKey>;
  },

  async listKeys(): Promise<AccessKey[]> {
    const res = await fetch(`${API}/admin/keys`, { headers: authHeaders() });
    await assertOk(res);
    return res.json() as Promise<AccessKey[]>;
  },

  async createKey(name: string): Promise<NewAccessKey> {
    const res = await fetch(`${API}/admin/keys`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    await assertOk(res);
    return res.json() as Promise<NewAccessKey>;
  },

  async unlockKeys(password: string): Promise<AccessKey[]> {
    const res = await fetch(`${API}/admin/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    await assertOk(res);
    return res.json() as Promise<AccessKey[]>;
  },

  async autoConfigureKey(): Promise<boolean> {
    try {
      const res = await fetch('/api/admin/autokey');
      if (!res.ok) return false;
      const data = (await res.json()) as { id?: string };
      if (data.id) { setAccessKey(data.id); return true; }
      return false;
    } catch {
      return false;
    }
  },

  async deleteKey(id: string): Promise<void> {
    const res = await fetch(`${API}/admin/keys/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await assertOk(res);
  },

  // SSE events
  connectEvents(onEvent: (event: StorageEvent) => void, onDisconnect?: () => void): () => void {
    const url = `${API}/events?accessKey=${encodeURIComponent(getAccessKey())}`;
    const es = new EventSource(url);
    es.addEventListener('message', (e: MessageEvent<string>) => {
      try {
        onEvent(JSON.parse(e.data) as StorageEvent);
      } catch {
        // ignore malformed frames
      }
    });
    es.addEventListener('error', () => onDisconnect?.());
    return () => { es.close(); onDisconnect?.(); };
  },
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fileIcon(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'audio';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return 'archive';
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'c', 'cpp', 'cs', 'java', 'sh'].includes(ext)) return 'code';
  if (['txt', 'md', 'csv', 'log', 'xml', 'json', 'yaml', 'yml', 'toml'].includes(ext)) return 'text';
  return 'file';
}
