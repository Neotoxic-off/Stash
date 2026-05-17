import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/Navbar';

export const dynamic = 'force-dynamic';

async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password || '__empty__'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('stash-session-v1'));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';

  if (adminPassword) {
    const jar = await cookies();
    const cookie = jar.get('stash_session')?.value;
    const expected = await sessionToken(adminPassword);

    if (cookie !== expected) {
      redirect('/login');
    }
  }

  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
