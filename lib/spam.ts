/**
 * Yoca — form spam screening (server only, dependency-free).
 *
 * Three quiet layers shared by /api/contact and /api/checkup:
 *   1. Honeypot  — a real hidden input in the form (sent as `website`).
 *                  Any value means a bot filled every field it found.
 *   2. Timing    — the form reports how long it was open (`elapsed`, ms).
 *                  Humans cannot fill it in under MIN_FILL_MS.
 *   3. Content   — the pattern seen in production spam: names and messages
 *                  that are one long token of random mixed-case letters
 *                  ("fdPZCzJwmYtUnjHWl"), plus weaker signals (dotted Gmail
 *                  local parts, "Xxxxx LLC", no timing data at all).
 *
 * Spam is never told it was caught: the route answers { ok: true } and
 * simply skips the insert and the notification email.
 */

export const MIN_FILL_MS = 3000;

export interface SpamInput {
  honeypot?: unknown;
  elapsed?: unknown;
  name?: string;
  company?: string;
  email?: string;
  /** The visitor's own free-text message (without generated planner lines). */
  message?: string;
}

export interface SpamVerdict {
  spam: boolean;
  reasons: string[];
}

/** One token of 10+ ASCII letters with 3+ capitals after the first letter. */
export function looksRandom(value: string | undefined): boolean {
  const s = (value ?? '').trim();
  if (!/^[A-Za-z]{10,}$/.test(s)) return false;
  const innerCaps = s.slice(1).replace(/[^A-Z]/g, '').length;
  return innerCaps >= 3;
}

function dottedGmail(email: string | undefined): boolean {
  const m = /^([^@]+)@(gmail|googlemail)\.com$/i.exec((email ?? '').trim());
  if (!m) return false;
  return (m[1].match(/\./g) ?? []).length >= 3;
}

function shellCompany(company: string | undefined): boolean {
  return /^[A-Z][a-z]{4,} LLC$/.test((company ?? '').trim());
}

export function screenSubmission(input: SpamInput): SpamVerdict {
  const reasons: string[] = [];

  if (typeof input.honeypot === 'string' && input.honeypot.trim().length > 0) {
    reasons.push('honeypot');
    return { spam: true, reasons };
  }

  const elapsed = Number(input.elapsed);
  const hasTiming = input.elapsed !== undefined && Number.isFinite(elapsed);
  if (hasTiming && elapsed < MIN_FILL_MS) {
    reasons.push('too-fast');
    return { spam: true, reasons };
  }

  // Strong signals drop on their own; weak ones only when three agree.
  let strong = 0;
  let weak = 0;
  if (looksRandom(input.name)) {
    strong += 1;
    reasons.push('random-name');
  }
  if (input.message !== undefined && looksRandom(input.message)) {
    strong += 1;
    reasons.push('random-message');
  }
  if (dottedGmail(input.email)) {
    weak += 1;
    reasons.push('dotted-gmail');
  }
  if (shellCompany(input.company) && looksRandomWord(input.company)) {
    weak += 1;
    reasons.push('shell-company');
  }
  if (!hasTiming) {
    weak += 1;
    reasons.push('no-timing');
  }

  return { spam: strong > 0 || weak >= 3, reasons };
}

/** "Huozflvct LLC" — the first word has almost no vowels or impossible clusters. */
function looksRandomWord(company: string | undefined): boolean {
  const word = (company ?? '').trim().split(' ')[0] ?? '';
  const vowels = (word.match(/[aeiouy]/gi) ?? []).length;
  return word.length >= 5 && vowels / word.length < 0.3;
}

/** Record a dropped submission (reasons only — no personal data). Never throws. */
export async function logSpam(form: 'contact' | 'checkup', reasons: string[]): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase');
    const admin = getSupabaseAdmin();
    if (!admin) return;
    await admin.from('spam_log').insert({ form, reasons });
  } catch {
    // table missing (upgrade-v8 not run yet) or Supabase unreachable — ignore
  }
}

/** The free-text part of a contact message (planner lines are "[Label] value"). */
export function freeText(message: string): string {
  const parts = message.split(/\n\s*\n/);
  return (parts[parts.length - 1] ?? '').trim();
}
