import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Yoca cockpit — cron guard (server only).
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every scheduled
 * call when the project has a CRON_SECRET environment variable. The jobs run
 * ONLY when that header matches exactly:
 *   - CRON_SECRET missing or too short → 503 `cron_not_configured`, nothing runs
 *   - header missing or wrong          → 401 `unauthorized`, nothing runs
 * The check happens before any database read or notification. The "once per
 * day" guard of the morning summary is not an access control and is not used
 * as one.
 */

export const CRON_SECRET_MIN_LENGTH = 32;

export type CronAuth = { ok: true } | { ok: false; status: 401 | 503; error: 'unauthorized' | 'cron_not_configured' };

let warnedMissing = false;

/** Pure check (unit-testable): secret from the environment, header from the request. */
export function checkCronAuth(secret: string | undefined, authorization: string | null): CronAuth {
  const value = (secret ?? '').trim();
  if (value.length < CRON_SECRET_MIN_LENGTH) return { ok: false, status: 503, error: 'cron_not_configured' };
  const expected = Buffer.from(`Bearer ${value}`);
  const given = Buffer.from(authorization ?? '');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
}

export function cronAuth(request: NextRequest): CronAuth {
  const result = checkCronAuth(process.env.CRON_SECRET, request.headers.get('authorization'));
  if (!result.ok && result.error === 'cron_not_configured' && !warnedMissing) {
    warnedMissing = true;
    // Never logs the secret or the header — only that the setting is missing.
    console.error('[cron] CRON_SECRET is not set (or shorter than 32 characters): scheduled jobs are refused.');
  }
  return result;
}
