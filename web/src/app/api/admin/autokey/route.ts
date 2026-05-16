import { NextResponse } from 'next/server';

const API = process.env.API_INTERNAL_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export async function GET(): Promise<Response> {
  if (!API || !ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(`${API}/admin/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Unlock failed' }, { status: res.status });
    }

    const keys = (await res.json()) as Array<{ id: string; isActive: boolean }>;
    const active = keys.find((k) => k.isActive) ?? keys[0];

    if (!active) {
      return NextResponse.json({ error: 'No keys available' }, { status: 404 });
    }

    return NextResponse.json({ id: active.id });
  } catch {
    return NextResponse.json({ error: 'API unreachable' }, { status: 502 });
  }
}
