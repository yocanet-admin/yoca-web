import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { hashToken, isTokenShape } from '@/lib/newsletter/core';

/**
 * Yoca — newsletter confirmation link (double opt-in). Activates the address
 * and sends the visitor to /{locale}/newsletter with the result.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function to(request: NextRequest, locale: string, status: string) {
  const url = new URL(`/${locale}/newsletter`, request.nextUrl.origin);
  url.searchParams.set('s', status);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!isTokenShape(token)) return to(request, 'en', 'invalid');
  const db = getSupabaseServiceRole();
  if (!db) return to(request, 'en', 'invalid');

  const { data } = await db
    .from('newsletter_subscribers')
    .select('id, locale, status, confirm_expires_at')
    .eq('confirm_token_hash', hashToken(token))
    .maybeSingle();
  const row = data as { id: string; locale: string; status: string; confirm_expires_at: string | null } | null;
  if (!row) return to(request, 'en', 'invalid');
  if (row.confirm_expires_at && Date.parse(row.confirm_expires_at) < Date.now()) return to(request, row.locale, 'expired');

  const now = new Date().toISOString();
  const { error } = await db
    .from('newsletter_subscribers')
    .update({ status: 'active', confirmed_at: now, confirm_token_hash: null, confirm_expires_at: null, updated_at: now })
    .eq('id', row.id);
  if (error) {
    console.error('newsletter: confirm failed', error.message);
    return to(request, row.locale, 'invalid');
  }
  return to(request, row.locale, 'confirmed');
}
