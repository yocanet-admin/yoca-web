import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { clientIp, rateLimited } from '@/lib/formGuard';
import { logSpam, MIN_FILL_MS } from '@/lib/spam';
import { newsletterCopy } from '@/lib/newsletter/copy';
import { asLocale, CONFIRM_RESEND_MS, CONFIRM_TTL_MS, confirmUrl, hashIp, hashToken, newToken, normalizeEmail } from '@/lib/newsletter/core';
import { confirmEmail } from '@/lib/newsletter/template';
import { sendOne } from '@/lib/newsletter/mailer';
import { SITE } from '@/lib/notifyTemplates';

/**
 * Yoca — newsletter sign-up (double opt-in).
 * The answer is the same whether the address is new, pending or already
 * active, so the form cannot be used to find out who is subscribed. A new or
 * returning address gets a confirmation e-mail (at most one per 10 minutes);
 * nothing else is ever sent to an unconfirmed address.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  email?: string;
  locale?: string;
  consent?: boolean;
  website?: string; // honeypot
  elapsed?: number;
  source?: string;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const locale = asLocale(body.locale);
  const t = newsletterCopy(locale).form;
  const ip = clientIp(request.headers);

  if (await rateLimited('newsletter', ip)) return NextResponse.json({ ok: false, error: t.tooMany }, { status: 429 });

  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ ok: false, error: t.errorEmail }, { status: 422 });
  if (body.consent !== true) return NextResponse.json({ ok: false, error: t.errorConsent }, { status: 422 });

  // Bots: answer like a success, store nothing.
  const reasons: string[] = [];
  if (body.website) reasons.push('honeypot');
  if (typeof body.elapsed === 'number' && body.elapsed < MIN_FILL_MS) reasons.push('too_fast');
  if (reasons.length) {
    await logSpam('newsletter', reasons);
    return NextResponse.json({ ok: true, message: t.success });
  }

  const db = getSupabaseServiceRole();
  if (!db) return NextResponse.json({ ok: false, error: t.errorGeneric }, { status: 503 });

  const { data: existing, error: readError } = await db
    .from('newsletter_subscribers')
    .select('id, status, confirm_sent_at, unsubscribe_token')
    .eq('email', email)
    .maybeSingle();
  if (readError) {
    console.error('newsletter: read failed', readError.message);
    return NextResponse.json({ ok: false, error: t.errorGeneric }, { status: 503 });
  }
  const row = existing as { id: string; status: string; confirm_sent_at: string | null; unsubscribe_token: string } | null;
  if (row?.status === 'active') return NextResponse.json({ ok: true, message: t.success });
  if (row?.status === 'pending' && row.confirm_sent_at && Date.now() - Date.parse(row.confirm_sent_at) < CONFIRM_RESEND_MS) {
    return NextResponse.json({ ok: true, message: t.success });
  }

  const token = newToken();
  const now = new Date();
  const fields = {
    email,
    locale,
    status: 'pending',
    confirm_token_hash: hashToken(token),
    confirm_expires_at: new Date(now.getTime() + CONFIRM_TTL_MS).toISOString(),
    confirm_sent_at: now.toISOString(),
    consent_text: t.consent,
    consent_at: now.toISOString(),
    ip_hash: hashIp(ip),
    source: String(body.source ?? '').slice(0, 40) || null,
    unsubscribed_at: null,
    updated_at: now.toISOString(),
  };
  const write = row
    ? await db.from('newsletter_subscribers').update(fields).eq('id', row.id)
    : await db.from('newsletter_subscribers').insert({ ...fields, unsubscribe_token: newToken() });
  if (write.error) {
    // Two sign-ups of the same address at the same moment: the other one won.
    if (write.error.code === '23505') return NextResponse.json({ ok: true, message: t.success });
    console.error('newsletter: write failed', write.error.message);
    return NextResponse.json({ ok: false, error: t.errorGeneric }, { status: 500 });
  }

  // Production links always point at yoca.net (never at a Host header value).
  const site = process.env.VERCEL_ENV === 'production' ? SITE : request.nextUrl.origin;
  const mail = confirmEmail(locale, confirmUrl(site, token));
  const sent = await sendOne({ to: email, ...mail });
  if (!sent.ok) {
    console.error('newsletter: confirmation e-mail failed', sent.error);
    return NextResponse.json({ ok: false, error: t.errorGeneric }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message: t.success });
}
