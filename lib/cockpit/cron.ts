import type { NextRequest } from 'next/server';

/**
 * Yoca cockpit — cron guard (server only).
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
 * set; then nothing else may run the jobs. Without the secret the jobs stay
 * harmless if someone calls them: the morning summary goes out once per day,
 * site alerts fire only on a real state change, and the site job is throttled.
 */
export function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
