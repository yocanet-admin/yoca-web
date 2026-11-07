import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, panelRole, sessionUser } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { readWorkbook } from '@/lib/fin/xlsx';
import { planImport, readExpenseSheet, type ImportPlan } from '@/lib/fin/importPlan';

/**
 * Yoca Giderler — Excel import (admin or finance user).
 *   POST { action: 'preview' | 'apply', fileName, data (base64), month? }
 * The file is read on the server (values only; formulas are not evaluated and
 * macros never run) and is NOT stored. Preview writes nothing. Apply calls
 * fin_import_apply with the user's own session (RLS + database guards, one
 * transaction). Nothing here sends a notification.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 5 * 1024 * 1024;
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

export async function POST(request: NextRequest) {
  const user = await sessionUser(request);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const token = bearerToken(request);
  const role = await panelRole(token);
  if (role !== 'admin' && role !== 'finance') return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const client = getSupabaseAsUser(token);
  if (!client) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { action?: string; fileName?: string; data?: string; month?: string } | null;
  if (!body?.data || !body.fileName) return NextResponse.json({ ok: false, error: 'Dosya gerekli.' }, { status: 400 });
  if (!/\.(xlsx|xlsm)$/i.test(body.fileName)) return NextResponse.json({ ok: false, error: 'Yalnızca .xlsx veya .xlsm dosyası.' }, { status: 400 });
  const buf = Buffer.from(body.data, 'base64');
  if (!buf.length || buf.length > MAX) return NextResponse.json({ ok: false, error: 'Dosya boş ya da 5 MB’tan büyük.' }, { status: 400 });
  const fileName = body.fileName.replace(/[\u0000-\u001f/\\<>:"|?*]/g, '_').slice(0, 200);
  const fileSha = sha(buf);

  let plan: ImportPlan;
  let macros = false;
  try {
    const wb = readWorkbook(buf);
    macros = wb.hasMacros;
    const name = wb.sheets.find((n) => /gider/i.test(n)) ?? wb.sheets[0];
    const sheet = name ? wb.sheet(name) : null;
    if (!sheet) throw new Error('Sayfa bulunamadı.');
    const read = readExpenseSheet(sheet, wb.date1904);
    plan = planImport({ sheet: name, ...read, date1904: wb.date1904, hash: (s) => sha(s) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
  if (body.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month) && !plan.month) {
    plan = { ...plan, month: body.month, rows: plan.rows.map((r) => ({ ...r, key: r.key.replace('|ay-belirsiz|', `|${body.month}|`) })) };
  }

  // What already exists (re-upload: same key → already / changed), Operasyon overlaps, same-name expenses
  const [existing, ops, exps] = await Promise.all([
    client.from('fin_import_rows').select('source_key, row_hash, expense_id, action, resolved_at').eq('sheet', plan.sheet),
    client.from('fin_ops_periods').select('service_id, service_name, service_kind, provider_name, currency'),
    client.from('fin_expenses').select('id, title, archived_at'),
  ]);
  if (existing.error && /does not exist|schema cache/i.test(existing.error.message)) return NextResponse.json({ ok: false, error: 'Aktarım tabloları yok: supabase/upgrade-v25-expenses.sql çalıştırılmalı.' }, { status: 503 });
  const byKey = new Map(((existing.data ?? []) as Array<{ source_key: string; row_hash: string; expense_id: string | null; action: string }>).map((e) => [e.source_key, e] as const));
  const opsServices = Array.from(new Map(((ops.data ?? []) as Array<{ service_id: string; service_name: string; service_kind: string; provider_name: string | null }>).map((o) => [o.service_id, o] as const)).values());
  const norm = (s: string) => s.toLocaleLowerCase('tr-TR').trim();
  const rows = plan.rows.map((r) => {
    const e = byKey.get(r.key);
    const state = !e ? 'new' : e.row_hash === r.hash ? 'already' : 'changed';
    const sameName = ((exps.data ?? []) as Array<{ id: string; title: string }>).filter((x) => norm(x.title) === norm(r.name) && (!e || x.id !== e.expense_id)).map((x) => x.id);
    // candidates only (same kind of service); never treated as proof of the same cost
    const opsMatches = r.action === 'possible_duplicate' ? opsServices.filter((o) => r.opsKinds.includes(o.service_kind)).map((o) => ({ name: o.service_name, kind: o.service_kind, provider: o.provider_name })) : [];
    return { ...r, state, sameName, opsMatches };
  });

  if (body.action !== 'apply') {
    const plain = JSON.parse(JSON.stringify({ file: { name: fileName, sha256: fileSha, macros }, ...plan, rows }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    return NextResponse.json({ ok: true, preview: plain }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (!plan.month) return NextResponse.json({ ok: false, error: 'Aktarım ayı belirlenemedi; ayı seçin.' }, { status: 400 });
  if (rows.some((r) => r.state === 'new' && r.sameName.length && (r.action === 'create' || r.action === 'pending_payment'))) {
    return NextResponse.json({ ok: false, error: 'Aynı adla kayıtlı gider var; önizlemedeki “olası mükerrer” satırları kontrol edin.' }, { status: 409 });
  }
  // every row goes to the database: it decides under a lock (same hash → nothing, different → reported)
  const payloadRows = rows.map((r) => ({
    key: r.key, row: r.row, hash: r.hash, name: r.name, category: r.category, action: r.action, recurrence: r.recurrence, variable: r.variable,
    amount: r.amount, due: r.due, method: r.method, note: r.note, payload: r.payload,
    status: r.status, missing: r.missing, reasons: r.reasons,
  }));
  const summary = {
    source: plan.totals.source,
    computed: { total: String(plan.totals.computed.total), paid: String(plan.totals.computed.paid), known: plan.totals.computed.knownCount, missing: plan.totals.computed.missingCount },
    macros,
  };
  const { data, error } = await client.rpc('fin_import_apply', { p_file_name: fileName, p_file_sha256: fileSha, p_sheet: plan.sheet, p_month: plan.month, p_summary: summary, p_rows: payloadRows });
  if (error) return NextResponse.json({ ok: false, error: error.message.replace(/^.*?ERROR:\s*/, '') }, { status: 400 });
  return NextResponse.json({ ok: true, result: data });
}
