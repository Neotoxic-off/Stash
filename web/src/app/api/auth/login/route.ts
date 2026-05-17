import { NextRequest, NextResponse } from 'next/server';

async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password || '__empty__'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('stash-session-v1'));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { password?: string };
  const password = body.password ?? '';
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';

  if (!adminPassword) {
    return NextResponse.json({ error: 'No admin password configured' }, { status: 500 });
  }

  const valid = password.length > 0 && password === adminPassword;

  if (!valid) {
    await new Promise(r => setTimeout(r, 1000));
    return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
  }

  const token = await sessionToken(adminPassword);
  const res = NextResponse.json({ ok: true });
  res.cookies.set('stash_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
