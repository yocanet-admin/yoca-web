import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getDict } from '@/lib/i18n';
import { notifyContact } from '@/lib/notify';
import { freeText, logSpam, screenSubmission } from '@/lib/spam';
import type { Locale } from '@/types';

/** Yoca — contact form endpoint: validate, screen for spam, persist to Supabase, notify. */

export const runtime = 'nodejs';

const hits = new Map<string, number[]>();
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((ts) => ts > now - WINDOW_MS);
  if (list.length >= RATE_LIMIT) return true;
  list.push(now);
  hits.set(ip, list);
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCALES: Locale[] = ['en', 'tr', 'az', 'ar'];

interface ContactPayload {
  name?: string;
  email?: string;
  company?: string;
  message?: string;
  locale?: Locale;
  website?: string; // honeypot (hidden input)
  elapsed?: number; // ms the form was open
}

export async function POST(request: NextRequest) {
  let payload: ContactPayload;
  try {
    payload = (await request.json()) as ContactPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Too many submissions. Please try again later.' },
      { status: 429 },
    );
  }

  const locale: Locale = LOCALES.includes(payload.locale as Locale)
    ? (payload.locale as Locale)
    : 'en';
  const dict = getDict(locale);

  const name = String(payload.name ?? '').trim().slice(0, 190);
  const email = String(payload.email ?? '').trim().slice(0, 190);
  const company = String(payload.company ?? '').trim().slice(0, 190);
  const message = String(payload.message ?? '').trim().slice(0, 5000);

  if (!name || !email || !message) {
    return NextResponse.json({ ok: false, error: dict.checkup.errorRequired }, { status: 422 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: dict.checkup.errorEmail }, { status: 422 });
  }

  // Spam: answer exactly like a success, but store nothing and notify no one.
  const verdict = screenSubmission({
    honeypot: payload.website,
    elapsed: payload.elapsed,
    name,
    company,
    email,
    message: freeText(message),
  });
  if (verdict.spam) {
    console.warn('contact spam dropped:', verdict.reasons.join(','));
    await logSpam('contact', verdict.reasons);
    return NextResponse.json({ ok: true, message: dict.contact.success });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: dict.checkup.errorGeneric }, { status: 503 });
  }

  const id = randomUUID();
  const { error } = await supabase.from('contact_submissions').insert({ id, name, email, company, message, locale });

  if (error) {
    console.error('contact insert failed:', error.message);
    return NextResponse.json({ ok: false, error: dict.checkup.errorGeneric }, { status: 500 });
  }

  await notifyContact({ id, name, email, company, message, locale });

  return NextResponse.json({ ok: true, message: dict.contact.success });
}
