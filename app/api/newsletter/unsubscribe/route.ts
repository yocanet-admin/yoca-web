import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { isTokenShape } from '@/lib/newsletter/core';

/**
 * Yoca — leave the newsletter.
 *  GET  ?token=…  (the link in the e-mail) → the confirmation page, so a
 *                 mail scanner that opens links cannot unsubscribe anybody
 *  POST ?token=…  unsubscribes: the page's button, and the one-click
 *                 List-Unsubscribe-Post request of Gmail / Apple Mail
 * Unknown or repeated tokens answer the same way (nothing to reveal).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function find(token: string) {
  const db = getSupabaseServiceRole();
  if (!db) return { db: null, row: null };
  const { data } = await db.from('newsletter_subscribers').select('id, locale, status').eq('unsubscribe_token', token).maybeSingle();
  return { db, row: data as { id: string; locale: string; status: string } | null };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const { row } = isTokenShape(token) ? await find(token) : { row: null };
  const url = new URL(`/${row?.locale ?? 'en'}/newsletter`, request.nextUrl.origin);
  if (row && isTokenShape(token)) url.searchParams.set('u', token);
  else url.searchParams.set('s', 'invalid');
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  let token = request.nextUrl.searchParams.get('token');
  if (!isTokenShape(token)) {
    const body = (await request.json().catch(() => ({}))) as { token?: string };
    token = body.token ?? null;
  }
  if (!isTokenShape(token)) return NextResponse.json({ ok: false }, { status: 400 });
  const { db, row } = await find(token);
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  if (row && row.status !== 'unsubscribed') {
    const now = new Date().toISOString();
    const { error } = await db
      .from('newsletter_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: now, confirm_token_hash: null, confirm_expires_at: null, updated_at: now })
      .eq('id', row.id);
    if (error) return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, locale: row?.locale ?? null });
}
