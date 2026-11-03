import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getDict } from '@/lib/i18n';
import { notifyContact } from '@/lib/notify';
import { getFormCopy } from '@/lib/siteSettings';
import { clientIp, contactFingerprint, rateLimited } from '@/lib/formGuard';
import { freeText, logSpam, screenSubmission } from '@/lib/spam';
import type { Locale } from '@/types';

/** A re-send with IDENTICAL content inside this window is treated as one submission. */
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

const TOO_MANY: Record<string, string> = {"tr": "Kısa sürede çok fazla gönderim yapıldı. Lütfen biraz sonra tekrar deneyin.", "en": "Too many submissions. Please try again later.", "az": "Qısa müddətdə çox göndəriş edildi. Bir az sonra yenidən cəhd edin.", "ar": "عدد كبير من الإرسالات. يرجى المحاولة لاحقًا."};

/** Yoca — contact form endpoint: validate, screen for spam, persist to Supabase, notify. */

export const runtime = 'nodejs';

// Rate limit: lib/formGuard.ts (shared across instances once v13 is installed).

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

  if (await rateLimited('contact', clientIp(request.headers))) {
    return NextResponse.json(
      { ok: false, error: TOO_MANY[String((payload as { locale?: string }).locale)] ?? TOO_MANY.en },
      { status: 429 },
    );
  }

  const locale: Locale = LOCALES.includes(payload.locale as Locale)
    ? (payload.locale as Locale)
    : 'en';
  const dict = getDict(locale);
  // Success text: neutral until response times are approved (Ayarlar → Yanıt süreleri).
  const success = (await getFormCopy(locale).catch(() => null))?.contactSuccess ?? dict.contact.success;

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
    return NextResponse.json({ ok: true, message: success });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: dict.checkup.errorGeneric }, { status: 503 });
  }

  // Re-send of the same message (double click, retry after a slow response): answer like a
  // success, but keep one row and one notification. Logged as "duplicate" in spam_log.
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  // Identical content only: a changed name, company or message is a new submission.
  const fingerprint = contactFingerprint({ name, company, email, message });
  const recent = await supabase
    .from('contact_submissions')
    .select('name, company, email, message')
    .eq('email', email)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);
  if (!recent.error && (recent.data ?? []).some((row) => contactFingerprint(row) === fingerprint)) {
    await logSpam('contact', ['duplicate']);
    return NextResponse.json({ ok: true, message: success });
  }

  const id = randomUUID();
  const { error } = await supabase.from('contact_submissions').insert({ id, name, email, company, message, locale });

  if (error) {
    console.error('contact insert failed:', error.message);
    return NextResponse.json({ ok: false, error: dict.checkup.errorGeneric }, { status: 500 });
  }

  await notifyContact({ id, name, email, company, message, locale });

  return NextResponse.json({ ok: true, message: success });
}
