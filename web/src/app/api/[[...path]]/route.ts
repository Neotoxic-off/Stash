import { type NextRequest, NextResponse } from 'next/server';

const API = process.env.API_INTERNAL_URL;

// Large uploads stream through — no body size limit
export const maxDuration = 300;

type RouteContext = { params: Promise<{ path?: string[] }> };

function buildUrl(req: NextRequest, path: string[] | undefined): string {
  const p = path?.length ? path.join('/') : '';
  return `${API}/${p}${req.nextUrl.search}`;
}

function forwardHeaders(req: NextRequest): Record<string, string> {
  const skip = new Set(['host', 'connection', 'transfer-encoding', 'upgrade', 'keep-alive']);
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (!skip.has(k.toLowerCase())) out[k] = v;
  });
  // Extract key ID from AWS SDK Authorization header → X-Access-Key
  if (!out['x-access-key']) {
    const auth = req.headers.get('authorization') ?? '';
    const m = auth.match(/Credential=([^/,\s]+)/);
    if (m) out['x-access-key'] = m[1];
  }
  return out;
}

async function proxy(
  req: NextRequest,
  path: string[] | undefined,
  method: string,
): Promise<Response> {
  if (!API) {
    return NextResponse.json({ error: 'API_INTERNAL_URL not configured' }, { status: 503 });
  }

  const url = buildUrl(req, path);
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers: forwardHeaders(req),
      body: hasBody ? req.body : undefined,
      // @ts-expect-error duplex required for streaming request body in Node.js fetch
      duplex: hasBody ? 'half' : undefined,
    });
  } catch {
    return NextResponse.json({ error: 'API server unreachable' }, { status: 502 });
  }

  const resHeaders = new Headers();
  const toForward = [
    'content-type',
    'etag',
    'last-modified',
    'content-length',
    'content-disposition',
    'accept-ranges',
  ];
  for (const h of toForward) {
    const v = upstream.headers.get(h);
    if (v) resHeaders.set(h, v);
  }

  if (upstream.headers.get('content-type')?.includes('text/event-stream')) {
    resHeaders.set('cache-control', 'no-cache, no-transform');
    resHeaders.set('x-accel-buffering', 'no');
    const { readable, writable } = new TransformStream();
    upstream.body?.pipeTo(writable).catch(() => {});
    return new Response(readable, { status: upstream.status, headers: resHeaders });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path, 'GET');
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path, 'PUT');
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path, 'POST');
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path, 'DELETE');
}

export async function HEAD(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path, 'HEAD');
}
