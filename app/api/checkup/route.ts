import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { CHECKUP_WEIGHTS, getDict } from '@/lib/i18n';
import { notifyCheckup } from '@/lib/notify';
import { screenSubmission } from '@/lib/spam';
import type { CheckupAnswer, CheckupPayload, Locale } from '@/types';

/**
 * Yoca — Digital Check-Up submission endpoint.
 *
 * Validates the wizard payload server-side (spam screen, field limits, option
 * ranges), computes the 0–100 digital-health score and inserts the record
 * into the Supabase `checkup_submissions` table.
 */

export const runtime = 'nodejs';

// Best-effort in-memory rate limit (per serverless instance).
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

export async function POST(request: NextRequest) {
  let payload: CheckupPayload;
  try {
    payload = (await request.json()) as CheckupPayload;
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

  const { error } = await supabase.from('checkup_submissions').insert({
    data_json: answers,
    contact_info_json: { name, company, email, phone, locale, score: finalScore },
  });

  if (error) {
    console.error('checkup insert failed:', error.message);
    return NextResponse.json({ ok: false, error: dict.checkup.errorGeneric }, { status: 500 });
  }

  await notifyCheckup({ name, email, company, phone, locale, score: finalScore, answers });

  return NextResponse.json({ ok: true, score: finalScore });
}
