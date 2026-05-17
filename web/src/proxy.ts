import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout'];

async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password || '__empty__'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('stash-session-v1'));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.svg'
  ) return NextResponse.next();

  // Public routes
  if (PUBLIC.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const adminPassword = process.env.ADMIN_PASSWORD ?? '';

  // No password configured → open access
  if (!adminPassword) return NextResponse.next();

  const cookie = req.cookies.get('stash_session')?.value;
  const expected = await sessionToken(adminPassword);

  if (cookie === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}
