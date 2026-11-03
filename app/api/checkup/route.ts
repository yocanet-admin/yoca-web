import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { CHECKUP_WEIGHTS, getDict } from '@/lib/i18n';
import { notifyCheckup } from '@/lib/notify';
import { checkupFingerprint, clientIp, rateLimited, storedCheckupFingerprint } from '@/lib/formGuard';
import { logSpam, screenSubmission } from '@/lib/spam';
import type { CheckupAnswer, CheckupPayload, Locale } from '@/types';

/** A re-send with IDENTICAL content inside this window is treated as one submission. */
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

const TOO_MANY: Record<string, string> = {"tr": "Kısa sürede çok fazla gönderim yapıldı. Lütfen biraz sonra tekrar deneyin.", "en": "Too many submissions. Please try again later.", "az": "Qısa müddətdə çox göndəriş edildi. Bir az sonra yenidən cəhd edin.", "ar": "عدد كبير من الإرسالات. يرجى المحاولة لاحقًا."};

/**
 * Yoca — Digital Check-Up submission endpoint.
 *
 * Validates the wizard payload server-side (spam screen, field limits, option
 * ranges), computes the 0–100 digital-health score and inserts the record
 * into the Supabase `checkup_submissions` table.
 */

export const runtime = 'nodejs';

// Rate limit: lib/formGuard.ts (shared across instances once v13 is installed).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCALES: Locale[] = ['en', 'tr', 'az', 'ar'];

export async function POST(request: NextRequest) {
  let payload: CheckupPayload;
  try {
    payload = (await request.json()) as CheckupPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (await rateLimited('checkup', clientIp(request.headers))) {
    return NextResponse.json(
      { ok: false, error: TOO_MANY[String((payload as { locale?: string }).locale)] ?? TOO_MANY.en },
      { status: 429 },
    );
  }

  const locale: Locale = LOCALES.includes(payload.locale) ? payload.locale : 'en';
  const dict = getDict(locale);

  // ── Contact validation ───────────────────────────────────────
  const contact = payload.contact ?? { name: '', company: '', email: '', phone: '' };
  const name = String(contact.name ?? '').trim().slice(0, 190);
  const company = String(contact.company ?? '').trim().slice(0, 190);
  const email = String(contact.email ?? '').trim().slice(0, 190);
  const phone = String(contact.phone ?? '').trim().slice(0, 60);

  if (!name || !email) {
    return NextResponse.json({ ok: false, error: dict.checkup.errorRequired }, { status: 422 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: dict.checkup.errorEmail }, { status: 422 });
  }

  // Spam: answer like a success so bots learn nothing; store and notify nothing.
  const verdict = screenSubmission({
    honeypot: payload.website,
    elapsed: payload.elapsed,
    name,
    company,
    email,
  });
  if (verdict.spam) {
    console.warn('checkup spam dropped:', verdict.reasons.join(','));
    await logSpam('checkup', verdict.reasons);
    return NextResponse.json({ ok: true, score: 0 });
  }

  // ── Answer validation + scoring ──────────────────────────────
  const validKeys = new Map(dict.checkup.questions.map((q) => [q.key, q.options.length]));
  const answers: Record<string, CheckupAnswer> = {};
  let score = 0;
  let maxScore = 0;

  for (const [key, rawIndex] of Object.entries(payload.answers ?? {})) {
    const optionCount = validKeys.get(key);
    const index = Number(rawIndex);
    if (!optionCount || !Number.isInteger(index) || index < 0 || index >= optionCount) continue;
    const question = dict.checkup.questions.find((q) => q.key === key)!;
    answers[key] = { i: index, v: question.options[index] };
    const weights = CHECKUP_WEIGHTS[key];
    if (weights) {
      score += weights[index] ?? 0;
      maxScore += Math.max(...weights);
    }
  }

  if (Object.keys(answers).length < 5) {
    return NextResponse.json({ ok: false, error: dict.checkup.errorRequired }, { status: 422 });
  }

  const finalScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  // ── Persist ──────────────────────────────────────────────────
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: dict.checkup.errorGeneric }, { status: 503 });
  }

  // Technical re-send (double click, retry): same e-mail AND identical answers and
  // contact fields within the window → one row, one notification, logged as
  // "duplicate". Changed answers or details from the same person are a new,
  // real submission and are stored.
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const fingerprint = checkupFingerprint({ name, company, email, phone, locale, answers });
  const recent = await supabase
    .from('checkup_submissions')
    .select('data_json, contact_info_json')
    .eq('contact_info_json->>email', email)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);
  if (!recent.error && (recent.data ?? []).some((row) => storedCheckupFingerprint(row) === fingerprint)) {
    await logSpam('checkup', ['duplicate']);
    return NextResponse.json({ ok: true, score: finalScore });
  }

  const id = randomUUID();
  const { error } = await supabase.from('checkup_submissions').insert({
    id,
    data_json: answers,
    contact_info_json: { name, company, email, phone, locale, score: finalScore },
  });

  if (error) {
    console.error('checkup insert failed:', error.message);
    return NextResponse.json({ ok: false, error: dict.checkup.errorGeneric }, { status: 500 });
  }

  await notifyCheckup({ id, name, email, company, phone, locale, score: finalScore, answers });

  return NextResponse.json({ ok: true, score: finalScore });
}
