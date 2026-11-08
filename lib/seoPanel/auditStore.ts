import type { AuditResult } from '@/lib/seoPanel/audit';

/**
 * Yoca Kokpit SEO — technical audit persistence (server only).
 *
 *  - acquire: ONE running run per site across all server instances, decided by
 *    the database (partial unique index + RPC seo_audit_acquire, which first
 *    expires runs older than AUDIT_RUN_TIMEOUT_S). null → "tarama zaten çalışıyor".
 *  - save: every findings insert and the final run update are checked; when the
 *    results cannot be stored the run is marked failed and an error is returned
 *    (never a success with half-stored results).
 */

/** Longer than the route's maxDuration (60 s): a run still "running" after this is treated as dead. */
export const AUDIT_RUN_TIMEOUT_S = 180;
export const ALREADY_RUNNING = 'Bir tarama zaten çalışıyor; bitmesini bekleyin (en çok 3 dakika sonra süresi dolar).';

type Res = { error: { message: string } | null };
export interface AuditDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    insert(rows: unknown[]): PromiseLike<Res>;
    update(values: Record<string, unknown>): { eq(col: string, v: string): PromiseLike<Res> };
  };
}

export type Acquire = { ok: true; runId: string } | { ok: false; status: 409 | 500; error: string };

export async function acquireRun(db: AuditDb, siteId: string, source: 'live' | 'fixture', by: string): Promise<Acquire> {
  const { data, error } = await db.rpc('seo_audit_acquire', { p_site_id: siteId, p_source: source, p_triggered_by: by, p_timeout_seconds: AUDIT_RUN_TIMEOUT_S });
  if (error) return { ok: false, status: 500, error: `Tarama başlatılamadı: ${error.message.slice(0, 160)}` };
  if (typeof data !== 'string' || !data) return { ok: false, status: 409, error: ALREADY_RUNNING };
  return { ok: true, runId: data };
}

export type Save = { ok: true } | { ok: false; error: string };

export async function saveResult(db: AuditDb, runId: string, result: AuditResult, chunk = 300): Promise<Save> {
  const rows = result.findings.map((f) => ({ run_id: runId, url: f.url, check_key: f.check, severity: f.severity, message: f.message.slice(0, 500), detail: f.detail ?? {} }));
  const fail = async (why: string): Promise<Save> => {
    // best effort: never leave the run "running"; even if this update fails, the timeout expires it
    await Promise.resolve(db.from('seo_audit_runs').update({ status: 'failed', finished_at: new Date().toISOString(), limit_reason: `Sonuçlar kaydedilemedi: ${why}`.slice(0, 500), summary: result.summary }).eq('id', runId)).catch(() => undefined);
    return { ok: false, error: `Tarama bitti ama sonuçlar kaydedilemedi (${why}). Tarama başarısız olarak işaretlendi; yeniden deneyin.` };
  };
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from('seo_audit_findings').insert(rows.slice(i, i + chunk));
    if (error) return fail(error.message.slice(0, 160));
  }
  const { error } = await db.from('seo_audit_runs').update({ status: result.status, finished_at: new Date().toISOString(), pages_planned: result.pagesPlanned, pages_checked: result.pagesChecked, limit_reason: result.limitReason, summary: result.summary }).eq('id', runId);
  if (error) return fail(error.message.slice(0, 160));
  return { ok: true };
}
