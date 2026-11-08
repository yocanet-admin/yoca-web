import type { ChannelResult } from '@/lib/notify';
import type { DigestChannels } from '@/lib/ops/digest';

/**
 * Yoca cockpit — Healthchecks heartbeats for the scheduled jobs (server only).
 *
 * Each Vercel Cron job tells an outside monitor (Healthchecks) that it started
 * and how it ended, so a job that never runs, hangs or half-fails raises an
 * alert even when Vercel itself is the thing that broke.
 *
 *  - One ping URL per job, from the environment (HEALTHCHECKS_URL_MORNING / _OPS /
 *    _SITES). Unset → nothing is sent; set them only on Production.
 *  - Pings carry NO content: a bare GET to <url>, <url>/start or <url>/fail.
 *    No body, no query string, no finance or customer data — ever.
 *  - "success" only when the job really finished; a partial failure is "fail".
 *    A run that found nothing to do and ended cleanly is a success.
 *  - The monitor can never break a job: 3 s timeout, every error swallowed,
 *    the job's own response is returned unchanged.
 *  - Unauthorized calls (wrong CRON_SECRET) are not runs and send nothing.
 */

export type HeartbeatJob = 'morning' | 'ops' | 'sites';
export type HeartbeatPhase = 'start' | 'success' | 'fail';
export type Outcome = 'success' | 'fail';

const ENV_KEY: Record<HeartbeatJob, string> = {
  morning: 'HEALTHCHECKS_URL_MORNING',
  ops: 'HEALTHCHECKS_URL_OPS',
  sites: 'HEALTHCHECKS_URL_SITES',
};

export const HEARTBEAT_TIMEOUT_MS = 3000;

/**
 * The URL to ping for a phase, or null when the configured value is unusable.
 * Only https (http just for a local test monitor), no credentials, no query or
 * fragment — so nothing but the check's own address can ever leave.
 */
export function heartbeatUrl(base: string | undefined, phase: HeartbeatPhase): string | null {
  const raw = (base ?? '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (!path) return null;
  return `${url.origin}${path}${phase === 'start' ? '/start' : phase === 'fail' ? '/fail' : ''}`;
}

/** Sends one heartbeat. Never throws; reports what happened for the logs. */
export async function heartbeat(job: HeartbeatJob, phase: HeartbeatPhase, fetchImpl: typeof fetch = fetch): Promise<'sent' | 'skipped' | 'error'> {
  const url = heartbeatUrl(process.env[ENV_KEY[job]], phase);
  if (!url) return 'skipped';
  try {
    const res = await fetchImpl(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS), headers: { 'user-agent': 'yoca-cockpit-cron' } });
    if (!res.ok) console.warn(`[heartbeat] ${job} ${phase}: HTTP ${res.status}`);
    return res.ok ? 'sent' : 'error';
  } catch (error) {
    // The monitor being down must not touch the job; the URL is not logged.
    console.warn(`[heartbeat] ${job} ${phase}: ${(error as Error).name}`);
    return 'error';
  }
}

/**
 * Runs a job between a "start" and a final heartbeat. The job decides its own
 * outcome; an exception is a "fail" and is re-thrown unchanged.
 */
export async function withHeartbeat(job: HeartbeatJob, run: () => Promise<{ response: Response; outcome: Outcome }>, fetchImpl: typeof fetch = fetch): Promise<Response> {
  await heartbeat(job, 'start', fetchImpl);
  let result: { response: Response; outcome: Outcome };
  try {
    result = await run();
  } catch (error) {
    await heartbeat(job, 'fail', fetchImpl);
    throw error;
  }
  await heartbeat(job, result.outcome, fetchImpl);
  return result.response;
}

// ── Outcome rules, one per job (pure, unit-tested) ────────────────────────

type Sent = { email: ChannelResult; telegram: ChannelResult };

/**
 * Morning summary (05:30 UTC). Success: already sent today, switched off in the
 * settings, or delivered with no channel failing. Fail: settings table missing,
 * a channel errored, or nothing reached any channel.
 */
export function morningOutcome(run: { ready: boolean; skipped?: 'already' | 'off'; sent?: Sent }): Outcome {
  if (!run.ready) return 'fail';
  if (run.skipped) return 'success';
  if (!run.sent) return 'fail';
  const states = [run.sent.email, run.sent.telegram];
  if (states.includes('error')) return 'fail';
  return states.includes('sent') ? 'success' : 'fail';
}

/**
 * Operasyon (06:00 / 12:00 UTC). Fail: the Giderler part failed (partial run),
 * the digest failed or reached no channel, or any channel failed / is unclear.
 * Success: everything that had to be sent was sent, or there was nothing to send
 * (skipped, already sent, switched off).
 */
export function opsOutcome(run: { partial: boolean; digest: 'sent' | 'skipped' | 'failed' | 'suppressed' | 'off' | 'already'; channels: DigestChannels | null }): Outcome {
  if (run.partial) return 'fail';
  if (run.digest === 'failed' || run.digest === 'suppressed') return 'fail';
  if (run.channels) {
    const bad = ['failed', 'unknown'];
    if (bad.includes(run.channels.email.state) || bad.includes(run.channels.telegram.state)) return 'fail';
  }
  return 'success';
}

/**
 * Site watch (every 15 min). Fail: the sites table could not be read, the
 * scheduled-Insights publish step failed, or an alert could not be delivered.
 * Success: a clean check (with or without alerts), a throttled run, or alerts
 * switched off in the settings.
 */
export function sitesOutcome(run: { dbOk: boolean; published: number | null; sent: Sent | null }): Outcome {
  if (!run.dbOk) return 'fail';
  if (run.published === null) return 'fail';
  if (run.sent && (run.sent.email === 'error' || run.sent.telegram === 'error')) return 'fail';
  return 'success';
}
