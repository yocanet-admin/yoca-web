/**
 * Yoca — one synthetic GlitchTip event after a deploy, to prove the connection.
 *
 * Off unless GLITCHTIP_SELFTEST is set to the deployed commit (7–40 hex chars of
 * VERCEL_GIT_COMMIT_SHA). Then each server instance of THAT deployment sends at
 * most one event, once, at start-up — no route, no request, no database, no
 * effect on any response. The next deploy (another commit) turns it off by
 * itself even if the variable is forgotten; removing the variable turns it off
 * for good.
 *
 * The event goes through the same allow-list as real errors (toSafeEvent): type
 * GlitchTipSelfTest, code GLITCHTIP_SELFTEST, stack locations and the release.
 */

export const SELFTEST_CODE = 'GLITCHTIP_SELFTEST';

export function selftestDue(env: { GLITCHTIP_SELFTEST?: string; VERCEL_GIT_COMMIT_SHA?: string }, alreadySent: boolean): boolean {
  if (alreadySent) return false;
  const token = (env.GLITCHTIP_SELFTEST ?? '').trim().toLowerCase();
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(token) || !/^[0-9a-f]{40}$/.test(sha)) return false;
  return sha.startsWith(token);
}

export class GlitchTipSelfTest extends Error {
  code = SELFTEST_CODE;
  constructor() {
    super('GlitchTip bağlantı testi (sentetik)');
    this.name = 'GlitchTipSelfTest';
  }
}
