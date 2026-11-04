import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { asLocale, isTokenShape } from '@/lib/newsletter/core';

/**
 * Yoca — change the newsletter language. Authorised by the subscriber's own
 * key from the link in every e-mail (nobody can change someone else's
 * language by typing their address). Unsubscribed addresses stay as they are.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; locale?: string };
  if (!isTokenShape(body.token)) return NextResponse.json({ ok: false }, { status: 400 });
  const db = getSupabaseServiceRole();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const locale = asLocale(body.locale);
  const { data, error } = await db
    .from('newsletter_subscribers')
    .update({ locale, updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', body.token)
    .neq('status', 'unsubscribed')
    .select('id');
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: Boolean(data?.length), locale });
}
