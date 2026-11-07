/**
 * v25 pre-release checks — LOCAL test stack only (gateway :54331, app :3190).
 * MODE=new  → current code (93aa01f + follow-up)
 * MODE=old  → production code (main 01ced37) running on a database WITH v25
 * Synthetic data only (TEST V25 …).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const MODE = process.env.MODE === 'old' ? 'old' : 'new';
const APP = 'http://localhost:3190';
const GW = 'http://127.0.0.1:54331';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const OUT = process.argv[2] ?? process.env.ITEST_OUT ?? '/tmp/yoca-itest-out';
const sql = (q: string) => execFileSync('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc', q], { encoding: 'utf8' }).trim();
const results: Array<{ group: string; name: string; ok: boolean; detail?: string }> = [];
let group = '';
const check = (name: string, ok: boolean, detail = '') => { results.push({ group, name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${detail ? `  — ${detail}` : ''}`); };
async function as(email: string, password: string) {
  const db = createClient(GW, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message}`);
  return { db, token: data.session.access_token };
}
const api = async (path: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(`${APP}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, any> | null };
};

sql(`set session_replication_role = replica; delete from site_content where key like 'test.v25%'; delete from insights where slug like 'test-v25%'; delete from ops_payments where service_id in (select id from ops_services where name like 'TEST V25%'); delete from ops_periods where service_id in (select id from ops_services where name like 'TEST V25%'); delete from ops_services where name like 'TEST V25%'; delete from clients where name like 'TEST V25%';`);

const admin = await as('admin@test.local', 'itest-admin-pw');
const fin = await as('finance@test.local', 'itest-finance-pw');

/* ── 1. Existing admins keep everything ───────────────────────── */
group = `yönetici (${MODE === 'old' ? 'eski kod + v25' : 'yeni kod + v25'})`;
const me = await api('/api/admin/me', admin.token);
check('panel login: /api/admin/me allows the admin', me.body?.allowed === true, JSON.stringify(me.body));
check('database: is_admin() is still true for the admin', (await admin.db.rpc('is_admin')).data === true);
const routes = ['/api/admin/site-settings', '/api/admin/ops/settings', '/api/admin/health', '/api/admin/notify'];
const st = await Promise.all(routes.map((r) => api(r, admin.token).then((x) => `${r}=${x.status}`)));
check('admin API routes answer the admin (settings, Operasyon settings, health, notify)', st.every((s) => s.endsWith('=200')), st.join(' '));
const content = await admin.db.from('site_content').upsert({ key: 'test.v25.metin', locale: 'tr', value: 'TEST' }, { onConflict: 'key,locale' }).select('id').single();
check('content: admin writes site content', !content.error, content.error?.message ?? '');
const ins = await admin.db.from('insights').insert({ locale: 'tr', slug: 'test-v25-taslak', title: 'TEST V25 taslak', status: 'DRAFT', body_md: 'TEST' }).select('id').single();
const insRead = ins.data ? await admin.db.from('insights').select('id, status').eq('id', ins.data.id).single() : null;
check('Insights: admin creates and reads a draft', !ins.error && insRead?.data?.status === 'DRAFT', ins.error?.message ?? '');
const doc = await admin.db.rpc('doc_create', { p_kind: 'letter', p_title: 'TEST V25 yazı', p_client_id: null, p_source_id: null, p_locale: 'tr', p_currency: 'TRY', p_content: { blocks: [] }, p_total: null, p_request_key: randomUUID(), p_event: 'created' });
check('Belgeler: admin creates a document (doc_create)', !doc.error, doc.error?.message ?? '');
const docs = await admin.db.from('doc_documents').select('id').limit(1);
check('Belgeler: admin reads documents', !docs.error && (docs.data ?? []).length > 0);
const { data: prov } = await admin.db.from('clients').insert({ name: 'TEST V25 Sağlayıcı', roles: ['provider'] }).select('id').single();
const { data: cust } = await admin.db.from('clients').insert({ name: 'TEST V25 Müşteri', roles: ['customer'] }).select('id').single();
const svc = await admin.db.from('ops_services').insert({ name: 'TEST V25 hosting', kind: 'hosting', provider_id: prov!.id, payer_party: 'yoca', cost_amount: 50, cost_currency: 'EUR', price_amount: 90, price_currency: 'EUR', period: 'yearly', end_on: '2026-12-31' }).select('id').single();
const per = await admin.db.from('ops_periods').insert({ service_id: svc.data!.id, starts_on: '2026-01-01', ends_on: '2026-12-31', due_on: '2026-11-01', customer_due_on: '2026-11-01', expected_cost: 50, cost_currency: 'EUR', expected_price: 90, price_currency: 'EUR' }).select('id').single();
check('Operasyon: admin creates service and period', !svc.error && !per.error, svc.error?.message ?? per.error?.message ?? '');
const payIn = await admin.db.from('ops_payments').insert({ period_id: per.data!.id, service_id: svc.data!.id, direction: 'in', amount: 90, currency: 'EUR', paid_on: '2026-11-02', client_id: cust!.id, note: 'TEST müşteri tahsilatı', request_key: randomUUID() }).select('id').single();
const payOut = await admin.db.from('ops_payments').insert({ period_id: per.data!.id, service_id: svc.data!.id, direction: 'out', amount: 50, currency: 'EUR', paid_on: '2026-11-02', request_key: randomUUID() }).select('id').single();
check('Operasyon: admin records a collection and a provider payment', !payIn.error && !payOut.error);
const voidIn = await admin.db.from('ops_payments').update({ voided_at: new Date().toISOString(), void_reason: 'TEST yanlış kayıt' }).eq('id', payOut.data!.id).is('voided_at', null).select('id');
check('Operasyon: admin voids a payment with a reason (the Operasyon screen flow)', !voidIn.error && (voidIn.data ?? []).length === 1, voidIn.error?.message ?? '');
const editAmt = await admin.db.from('ops_payments').update({ amount: 1 }).eq('id', payIn.data!.id).select('id');
check('Operasyon (v25 change): editing a payment amount afterwards is refused — the screens never did this', Boolean(editAmt.error), editAmt.error?.message ?? 'not refused');
const renew = await admin.db.rpc('ops_confirm_renewal', { p_period: per.data!.id, p_new_end: '2027-12-31', p_actual_cost: 50, p_ref: 'TEST', p_note: null, p_next_due: '2027-11-01', p_next_customer_due: '2027-11-01' });
check('Operasyon: admin confirms a renewal (ops_confirm_renewal)', !renew.error, renew.error?.message ?? '');
const up = await admin.db.storage.from('ops-docs').upload(`service/${svc.data!.id}/${randomUUID()}-TEST.pdf`, Buffer.from('%PDF-1.4\n%%EOF\n'), { contentType: 'application/pdf' });
check('Operasyon: admin uploads to the private ops-docs bucket', !up.error, up.error?.message ?? '');
check('İşlem geçmişi: admin reads audit_log', ((await admin.db.from('audit_log').select('id').limit(1)).data ?? []).length === 1);

/* ── finance in OLD code: refused at the shell, no data ────────── */
if (MODE === 'old') {
  group = 'finans hesabı (eski kod + v25)';
  const meF = await api('/api/admin/me', fin.token);
  check('old panel: finance account is NOT let in (old check = is_admin) — no access before the new code ships', meF.body?.allowed === false, JSON.stringify(meF.body));
  const leak = await fin.db.from('ops_services').select('id').limit(1);
  check('old panel: no Operasyon data for the finance account', (leak.data ?? []).length === 0);
}

/* ── 2. Provider payment only, through a controlled function ──── */
if (MODE === 'new') {
  group = 'sağlayıcı ödemesi (fin_ops_pay)';
  const svc2 = await admin.db.from('ops_services').insert({ name: 'TEST V25 müşterinin ödediği alan adı', kind: 'domain', payer_party: 'client', cost_amount: 10, cost_currency: 'EUR' }).select('id').single();
  const per2 = await admin.db.from('ops_periods').insert({ service_id: svc2.data!.id, due_on: '2026-11-20', expected_cost: 10, cost_currency: 'EUR' }).select('id').single();
  const call = (args: Record<string, unknown>) => fin.db.rpc('fin_ops_pay', { p_period: per.data!.id, p_kind: 'payment', p_amount: '5.00', p_currency: 'EUR', p_paid_on: '2026-11-03', p_method: null, p_reference: null, p_request_key: randomUUID(), ...args });
  const okPay = await call({});
  const okRefund = await call({ p_kind: 'refund', p_amount: '1.00' });
  const okAdj = await call({ p_kind: 'adjustment', p_amount: '-0.50' });
  check('allowed: provider payment, refund and adjustment', !okPay.error && !okRefund.error && !okAdj.error, okPay.error?.message ?? okRefund.error?.message ?? okAdj.error?.message ?? '');
  const stored = ((await admin.db.from('ops_payments').select('direction, kind, client_id, note').in('id', [okPay.data, okRefund.data, okAdj.data] as string[])).data ?? []);
  check('stored as direction "out" only, no customer link, no note', stored.length === 3 && stored.every((r) => r.direction === 'out' && r.client_id === null && r.note === null));
  const bad: Record<string, string> = {};
  for (const [name, args] of Object.entries({
    'kind=in (tahsilat)': { p_kind: 'in' }, 'kind=collection': { p_kind: 'collection' }, 'kind=null': { p_kind: null },
    'amount 0': { p_amount: '0' }, 'negative payment': { p_amount: '-5' }, 'wrong currency': { p_currency: 'TRY' },
    'client-paid period (not a Yoca cost)': { p_period: per2.data!.id }, 'unknown period': { p_period: randomUUID() }, 'future date': { p_paid_on: '2030-01-01' },
    'reuse the key of a customer collection': { p_request_key: null },
  })) {
    const a = name.startsWith('reuse') ? { p_request_key: sql(`select request_key from ops_payments where id = '${payIn.data!.id}'`) } : args;
    const r = await call(a);
    bad[name] = r.error ? 'refused' : `ACCEPTED ${String(r.data)}`;
  }
  check('refused by direct API call: collection, invalid kinds/amounts/currency, client-paid or unknown period, future date, foreign key reuse', Object.values(bad).every((v) => v === 'refused'), JSON.stringify(bad));
  const voidIn2 = await fin.db.rpc('fin_ops_void', { p_payment: payIn.data!.id, p_reason: 'TEST deneme' });
  check('fin_ops_void cannot touch a customer collection (direction in)', Boolean(voidIn2.error) && sql(`select coalesce(voided_at::text, 'açık') from ops_payments where id = '${payIn.data!.id}'`) === 'açık');
  const renewF = await fin.db.rpc('ops_confirm_renewal', { p_period: per.data!.id, p_new_end: '2028-12-31', p_actual_cost: null, p_ref: null, p_note: null, p_next_due: null, p_next_customer_due: null });
  check('finance cannot confirm renewals (ops_confirm_renewal)', Boolean(renewF.error));
  const direct = await fin.db.from('ops_payments').insert({ period_id: per.data!.id, service_id: svc.data!.id, direction: 'in', amount: 1, currency: 'EUR', paid_on: '2026-11-03' }).select();
  const directUpd = await fin.db.from('ops_periods').update({ expected_price: 1 }).eq('id', per.data!.id).select();
  const directSel = await fin.db.from('ops_payments').select('id').limit(5);
  check('direct table access: insert ops_payments refused, ops_periods update touches nothing, select returns nothing', Boolean(direct.error) && (directUpd.data ?? []).length === 0 && (directSel.data ?? []).length === 0, direct.error?.message ?? '');
  const vp = ((await fin.db.from('fin_ops_payments').select('*').eq('period_id', per.data!.id)).data ?? []) as Array<Record<string, unknown>>;
  check('Giderler view lists provider payments only (no collection, no note, no customer)', vp.length >= 3 && vp.every((p) => !('direction' in p) && !('note' in p) && !('client_id' in p)) && !vp.some((p) => p.id === payIn.data!.id));
  const vper = ((await fin.db.from('fin_ops_periods').select('*').eq('id', per.data!.id)).data ?? []) as Array<Record<string, unknown>>;
  check('Giderler view of the period: cost only (no sale price / customer due date)', vper.length === 1 && !('expected_price' in vper[0]) && !('customer_due_on' in vper[0]) && !('price_currency' in vper[0]));

  /* ── 4. Own history, nothing else; no role changes ──────────── */
  group = 'işlem geçmişi ve rol';
  const { data: e } = await fin.db.from('fin_expenses').insert({ title: 'TEST V25 yazılım', category: 'software', kind: 'once', first_due_on: '2026-11-20', amount: '100.00', currency: 'TRY' }).select('id').single();
  await fin.db.from('fin_expenses').update({ amount: '120.00' }).eq('id', e!.id);
  await admin.db.from('site_content').update({ value: 'TEST2' }).eq('key', 'test.v25.metin');
  const hist = ((await fin.db.from('fin_audit').select('*').order('at', { ascending: false }).limit(500)).data ?? []) as Array<Record<string, any>>;
  const entities = Array.from(new Set(hist.map((h) => h.entity))).sort();
  check('finance sees the history of expenses and provider payments (who / when / what)', hist.some((h) => h.entity === 'fin_expenses' && h.entity_id === e!.id && h.action === 'update' && h.actor === 'finance@test.local') && hist.some((h) => h.entity === 'ops_payments'), entities.join(','));
  check('… and nothing from other modules (content, Operasyon services, CRM, documents …) — v26 adds receivables / collections', entities.every((x) => ['fin_expenses', 'fin_periods', 'fin_payments', 'fin_documents', 'fin_imports', 'fin_import_rows', 'ops_payments', 'fin_receivables', 'fin_collections'].includes(x)), entities.join(','));
  const opsHist = hist.filter((h) => h.entity === 'ops_payments');
  check('Operasyon payment history: payment fields only (no note / customer link); v26: customer collections are listed too', opsHist.some((h) => h.entity_id === payIn.data!.id) && opsHist.every((h) => !h.changes || Object.keys(h.changes).every((k) => ['kind', 'amount', 'currency', 'paid_on', 'method', 'reference', 'voided_at', 'void_reason'].includes(k))));
  await admin.db.from('fin_expenses').update({ note: 'Yönetici notu (TEST)' }).eq('id', e!.id);
  const hist2 = ((await fin.db.from('fin_audit').select('*').eq('entity_id', e!.id).order('at')).data ?? []) as Array<Record<string, any>>;
  check('scope = the expense records, not only own actions: finance sees the ADMIN change on the same expense', hist2.some((h) => h.actor === 'admin@test.local' && h.action === 'update') && hist2.some((h) => h.actor === 'finance@test.local'), hist2.map((h) => `${h.actor}:${h.action}`).join(','));
  const adminOpsOut = hist.filter((h) => h.entity === 'ops_payments');
  check('provider payments recorded by the admin in Operasyon also appear (payment fields only)', adminOpsOut.length > 0);
  check('the general audit_log stays closed to finance', ((await fin.db.from('audit_log').select('id').limit(5)).data ?? []).length === 0);
  const hEdit = await fin.db.from('fin_audit').update({ actor: 'sahte' }).eq('entity_id', e!.id).select();
  const hDel = await fin.db.from('fin_audit').delete().eq('entity_id', e!.id).select();
  const aIns = await fin.db.from('audit_log').insert({ action: 'insert', entity: 'fin_expenses', actor: 'sahte' }).select();
  check('history cannot be edited, deleted or forged', Boolean(hEdit.error) && Boolean(hDel.error) && Boolean(aIns.error) && Number(sql(`select count(*) from audit_log where actor = 'sahte'`)) === 0);
  const self = await fin.db.from('admin_users').update({ role: 'admin' }).eq('email', 'finance@test.local').select();
  const newAdmin = await fin.db.from('admin_users').insert({ email: 'yeni-yonetici@ornek.example', role: 'admin', note: 'x' }).select();
  const upsertSelf = await fin.db.from('admin_users').upsert({ email: 'finance@test.local', role: 'admin' }).select();
  check('finance cannot promote itself or create an admin (direct API)', (self.error || (self.data ?? []).length === 0) && Boolean(newAdmin.error) && Boolean(upsertSelf.error) && sql(`select role from admin_users where email = 'finance@test.local'`) === 'finance' && Number(sql(`select count(*) from admin_users where email = 'yeni-yonetici@ornek.example'`)) === 0);
  check('roles unchanged after the attempts: is_admin() false, panel_role() = finance', (await fin.db.rpc('is_admin')).data === false && (await fin.db.rpc('panel_role')).data === 'finance');
  const meF = await api('/api/admin/me', fin.token);
  check('panel: finance gets role "finance" (Giderler only)', meF.body?.role === 'finance');
}

fs.writeFileSync(`${OUT}/v25-verify-${MODE}.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed (${MODE})`);
process.exit(failed ? 1 : 0);
