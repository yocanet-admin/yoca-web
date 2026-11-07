/**
 * Giderler + Finans sorumlusu — LOCAL test stack only (gateway on :54331, app on :3190,
 * capture endpoints; nothing reaches a real inbox or chat). Synthetic data, marked TEST.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const APP = 'http://localhost:3190';
const GW = 'http://127.0.0.1:54331';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const CRON = process.env.CRON_SECRET ?? '';
const OUT = process.argv[2] ?? process.env.ITEST_OUT ?? '/tmp/yoca-itest-out';
const PSQL = ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc'];
const sql = (q: string) => execFileSync('psql', [...PSQL, q], { encoding: 'utf8' }).trim();
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };

async function as(email: string, password: string): Promise<{ db: SupabaseClient; token: string }> {
  const db = createClient(GW, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message}`);
  return { db, token: data.session.access_token };
}
const api = async (path: string, token: string | null, init: RequestInit = {}) => {
  const r = await fetch(`${APP}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' } });
  return { status: r.status, body: await r.json().catch(() => null) as Record<string, unknown> | null };
};

// clean previous synthetic data (test DB only; guards are bypassed with a session flag)
sql(`set session_replication_role = replica; delete from fin_documents where name like 'TEST%'; delete from fin_payments where period_id in (select p.id from fin_periods p join fin_expenses e on e.id = p.expense_id where e.title like 'TEST%'); delete from fin_periods where expense_id in (select id from fin_expenses where title like 'TEST%'); delete from fin_expenses where title like 'TEST%'; delete from storage.objects where bucket_id = 'fin-docs';`);
sql(`set session_replication_role = replica; delete from ops_payments where service_id in (select id from ops_services where name like 'TEST GID%'); delete from ops_periods where service_id in (select id from ops_services where name like 'TEST GID%'); delete from ops_service_links where service_id in (select id from ops_services where name like 'TEST GID%'); delete from ops_services where name like 'TEST GID%'; delete from clients where name like 'TEST GID%'; delete from ops_notifications where dedupe_key like 'digest:%';`);

const admin = await as('admin@test.local', 'itest-admin-pw');
const fin = await as('finance@test.local', 'itest-finance-pw');
const intruder = await as('intruder@test.local', 'itest-intruder-pw');

/* ── 1. Roles at the API level ──────────────────────────────── */
const meF = await api('/api/admin/me', fin.token);
check('me: finance user is allowed with role "finance" (ADMIN_EMAILS set to the admin only)', meF.body?.allowed === true && meF.body?.role === 'finance', JSON.stringify(meF.body));
const meA = await api('/api/admin/me', admin.token);
check('me: admin keeps role "admin"', meA.body?.allowed === true && meA.body?.role === 'admin');
const meI = await api('/api/admin/me', intruder.token);
check('me: signed-in user without a role is refused', meI.body?.allowed === false && meI.body?.reason === 'not_admin');

const adminRoutes: Array<[string, RequestInit?]> = [
  ['/api/admin/site-settings'], ['/api/admin/notify'], ['/api/admin/health'], ['/api/admin/ops/settings'],
  ['/api/admin/traffic'], ['/api/admin/newsletter'],
  ['/api/admin/ai', { method: 'POST', body: JSON.stringify({ mode: 'rewrite', text: 'x' }) }],
  ['/api/admin/documents', { method: 'POST', body: JSON.stringify({}) }],
  ['/api/admin/insights/publish', { method: 'POST', body: JSON.stringify({}) }],
  ['/api/admin/ops/forward', { method: 'POST', body: JSON.stringify({ action: 'preview' }) }],
];
const statuses: string[] = [];
let allRefused = true;
for (const [path, init] of adminRoutes) {
  const r = await api(path, fin.token, init);
  statuses.push(`${path}=${r.status}`);
  if (![401, 403, 404, 405].includes(r.status) || r.status === 404) allRefused = allRefused && [401, 403].includes(r.status);
}
check('server: finance token refused by admin API routes (settings, API-key health, AI, documents, Insights, Operasyon)', allRefused, statuses.join(' '));

/* ── 2. Data access (RLS) ───────────────────────────────────── */
const seeded = { prov: '', cust: '', svc: '', per: '' };
{
  const { data: prov } = await admin.db.from('clients').insert({ name: 'TEST GID Sağlayıcı', roles: ['provider'], email: 'gid-saglayici@ornek.example', phone: '+90 000' }).select('id').single();
  const { data: cust } = await admin.db.from('clients').insert({ name: 'TEST GID Müşteri', roles: ['customer'], email: 'gid-musteri@ornek.example' }).select('id').single();
  const { data: svc } = await admin.db.from('ops_services').insert({ name: 'TEST GID hosting', kind: 'hosting', provider_id: prov!.id, payer_party: 'yoca', cost_amount: 100, cost_currency: 'USD', price_amount: 300, price_currency: 'USD', note: 'GİZLİ iç not', period: 'yearly' }).select('id').single();
  await admin.db.from('ops_service_links').insert({ service_id: svc!.id, client_id: cust!.id });
  const { data: per } = await admin.db.from('ops_periods').insert({ service_id: svc!.id, starts_on: '2026-11-01', ends_on: '2027-10-31', due_on: '2026-11-03', expected_cost: 100, cost_currency: 'USD', expected_price: 300, price_currency: 'USD' }).select('id').single();
  Object.assign(seeded, { prov: prov!.id, cust: cust!.id, svc: svc!.id, per: per!.id });
}
const hidden: Record<string, number> = {};
for (const t of ['ops_services', 'ops_periods', 'ops_payments', 'clients', 'client_contacts', 'ops_provider_accounts', 'contact_submissions', 'audit_log', 'cockpit_settings', 'doc_documents', 'admin_users']) {
  const { data } = await fin.db.from(t).select('*').limit(5);
  hidden[t] = (data ?? []).length;
}
check('rls: finance reads nothing from Operasyon, CRM, leads, settings, documents, audit log, user list', Object.values(hidden).every((n) => n === 0), JSON.stringify(hidden));
const draftInsights = await fin.db.from('insights').select('id, status').neq('status', 'PUBLISHED');
check('rls: finance cannot see unpublished Insights', (draftInsights.data ?? []).length === 0);
const writeContent = await fin.db.from('site_content').upsert({ key: 'test.fin', value: 'x' }).select();
check('rls: finance cannot write site content', Boolean(writeContent.error) || (writeContent.data ?? []).length === 0, writeContent.error?.message ?? '');
const grant = await fin.db.from('admin_users').insert({ email: 'yeni@ornek.example', role: 'admin' }).select();
check('rls: finance cannot add users or change roles', Boolean(grant.error), grant.error?.message ?? '');

const view = await fin.db.from('fin_ops_periods').select('*').eq('id', seeded.per);
const v = (view.data ?? [])[0] as Record<string, unknown> | undefined;
check('ops link: finance sees the provider cost (service, provider, cost) …', Boolean(v) && v!.service_name === 'TEST GID hosting' && v!.provider_name === 'TEST GID Sağlayıcı' && String(v!.amount) === '100.00');
check('… but no customer, sale price, notes or contact fields', Boolean(v) && !('expected_price' in v!) && !('note' in v!) && !('client_id' in v!) && !JSON.stringify(v).includes('GİZLİ') && !JSON.stringify(v).includes('Müşteri'));
const parties = await fin.db.from('fin_parties').select('*');
check('parties: providers only, name only (no e-mail / phone)', (parties.data ?? []).some((p) => p.name === 'TEST GID Sağlayıcı') && !(parties.data ?? []).some((p) => p.name === 'TEST GID Müşteri') && !JSON.stringify(parties.data).includes('ornek.example'));

/* ── 3. Recurring expense, periods, partial payment, double submit ── */
const { data: e1, error: e1err } = await fin.db.from('fin_expenses').insert({ title: 'TEST Ofis kirası', category: 'rent', kind: 'recurring', recurrence: 'monthly', first_due_on: '2026-10-05', amount: '10000.00', currency: 'TRY', vendor_name: 'TEST Ev sahibi', owner_email: 'finance@test.local', pay_account: 'Şirket hesabı', pay_method: 'bank_transfer', created_by: 'sahte@ornek.example' }).select('*').single();
check('expense: finance creates a recurring expense; "created_by" comes from the session', !e1err && e1?.created_by === 'finance@test.local', e1err?.message ?? e1?.created_by);
const roll1 = await fin.db.rpc('fin_roll_periods', { p_until: '2026-12-20' });
const roll2 = await fin.db.rpc('fin_roll_periods', { p_until: '2026-12-20' });
const pers = ((await fin.db.from('fin_periods').select('*').eq('expense_id', e1!.id).order('seq')).data ?? []) as Array<Record<string, string>>;
check('periods: Oct, Nov, Dec created; a second run creates none (no duplicate period)', pers.map((p) => p.due_on).join(',') === '2026-10-05,2026-11-05,2026-12-05' && roll2.data === 0, `roll1=${roll1.data} roll2=${roll2.data} ${pers.map((p) => p.due_on).join(',')}`);
check('periods: new periods have no payment (not "paid" by themselves)', ((await fin.db.from('fin_payments').select('id').in('period_id', pers.map((p) => p.id))).data ?? []).length === 0);
await fin.db.from('fin_expenses').update({ amount: '12500.00' }).eq('id', e1!.id);
await fin.db.rpc('fin_roll_periods', { p_until: '2027-01-20' });
const pers2 = ((await fin.db.from('fin_periods').select('seq, amount').eq('expense_id', e1!.id).order('seq')).data ?? []) as Array<{ amount: string }>;
check('amount change: Oct–Dec keep 10000, the new January period has 12500', pers2.map((p) => p.amount).join(',') === '10000.00,10000.00,10000.00,12500.00', pers2.map((p) => p.amount).join(','));

const nov = pers[1].id;
const key = randomUUID();
const p1 = await fin.db.from('fin_payments').insert({ period_id: nov, kind: 'payment', amount: '4000.00', currency: 'TRY', paid_on: '2026-11-04', method: 'bank_transfer', reference: 'TEST-DEKONT-1', request_key: key }).select('id').single();
const p1again = await fin.db.from('fin_payments').insert({ period_id: nov, kind: 'payment', amount: '4000.00', currency: 'TRY', paid_on: '2026-11-04', method: 'bank_transfer', reference: 'TEST-DEKONT-1', request_key: key }).select('id').single();
const novPays = ((await fin.db.from('fin_payments').select('*').eq('period_id', nov)).data ?? []);
check('partial payment recorded; the same form submitted twice (same key) stays ONE record', !p1.error && Boolean(p1again.error) && novPays.length === 1, p1.error?.message ?? '');
const edit = await fin.db.from('fin_payments').update({ amount: '1.00' }).eq('id', p1.data!.id).select();
check('history: finance cannot edit a payment', Boolean(edit.error), edit.error?.message ?? '');
const del = await fin.db.from('fin_payments').delete().eq('id', p1.data!.id).select();
check('history: finance cannot delete a payment', Boolean(del.error) || ((await fin.db.from('fin_payments').select('id').eq('id', p1.data!.id)).data ?? []).length === 1);
const delAdmin = await admin.db.from('fin_payments').delete().eq('id', p1.data!.id).select();
check('history: not even the admin can delete a payment', Boolean(delAdmin.error) || ((await admin.db.from('fin_payments').select('id').eq('id', p1.data!.id)).data ?? []).length === 1);
const wrong = await fin.db.from('fin_payments').insert({ period_id: nov, kind: 'payment', amount: '600.00', currency: 'TRY', paid_on: '2026-11-05', request_key: randomUUID() }).select('id').single();
const voided = await fin.db.from('fin_payments').update({ voided_at: new Date().toISOString(), void_reason: 'Yanlış dönem seçildi' }).eq('id', wrong.data!.id).select('voided_by, void_reason').single();
check('correction: a wrong payment is voided with a reason (who recorded), record kept', voided.data?.voided_by === 'finance@test.local');
await fin.db.from('fin_payments').insert({ period_id: nov, kind: 'payment', amount: '6500.00', currency: 'TRY', paid_on: '2026-11-06', request_key: randomUUID() });
await fin.db.from('fin_payments').insert({ period_id: nov, kind: 'refund', amount: '500.00', currency: 'TRY', paid_on: '2026-11-06', note: 'Fazla ödeme iadesi', request_key: randomUUID() });
const usd = await fin.db.from('fin_payments').insert({ period_id: nov, kind: 'payment', amount: '10.00', currency: 'USD', paid_on: '2026-11-06', request_key: randomUUID() });
check('currency: a USD payment cannot be added to a TRY period (no conversion)', Boolean(usd.error));
const novAll = ((await fin.db.from('fin_payments').select('*').eq('period_id', nov)).data ?? []);
const valid = novAll.filter((p) => !p.voided_at).reduce((s, p) => s + (p.kind === 'refund' ? -1 : 1) * Number(p.amount), 0);
check('state inputs: 4000 + 6500 − 500 refund = 10000 valid (voided 600 ignored) → paid', valid === 10000 && novAll.length === 4, `valid=${valid} rows=${novAll.length}`);
const cancelPaid = await fin.db.from('fin_periods').update({ status: 'cancelled', cancel_reason: 'deneme' }).eq('id', nov).select();
check('period with valid payments cannot be cancelled', Boolean(cancelPaid.error));

/* one-off expense */
const { data: e2 } = await fin.db.from('fin_expenses').insert({ title: 'TEST Laptop', category: 'equipment', kind: 'once', first_due_on: '2026-11-15', amount: '50000.00', currency: 'TRY', vendor_name: 'TEST Mağaza' }).select('id').single();
const e2pers = ((await fin.db.from('fin_periods').select('*').eq('expense_id', e2!.id)).data ?? []);
check('one-off expense: exactly one period, due 15 Nov', e2pers.length === 1 && e2pers[0].due_on === '2026-11-15');

/* ── 4. Operasyon provider payment — one record, both screens ── */
const opKey = randomUUID();
const o1 = await fin.db.rpc('fin_ops_pay', { p_period: seeded.per, p_kind: 'payment', p_amount: '60.00', p_currency: 'USD', p_paid_on: '2026-11-02', p_method: 'card', p_reference: 'TEST-KART', p_request_key: opKey });
const o2 = await fin.db.rpc('fin_ops_pay', { p_period: seeded.per, p_kind: 'payment', p_amount: '60.00', p_currency: 'USD', p_paid_on: '2026-11-02', p_method: 'card', p_reference: 'TEST-KART', p_request_key: opKey });
const opsRows = ((await admin.db.from('ops_payments').select('*').eq('period_id', seeded.per)).data ?? []);
check('ops: finance records the provider payment once (retry → same id) …', !o1.error && o1.data === o2.data, o1.error?.message ?? '');
check('… it is the Operasyon record itself (ops_payments, direction out, by finance) — no copy in Giderler', opsRows.length === 1 && opsRows[0].direction === 'out' && opsRows[0].created_by === 'finance@test.local' && Number(sql(`select count(*) from fin_payments where reference = 'TEST-KART'`)) === 0);
const finViewPays = ((await fin.db.from('fin_ops_payments').select('*').eq('period_id', seeded.per)).data ?? []);
check('… and Giderler shows that same record (source: Operasyon)', finViewPays.length === 1 && finViewPays[0].id === o1.data);
const adminEdit = await admin.db.from('ops_payments').update({ amount: '1.00' }).eq('id', o1.data as string).select();
check('ops_payments are append-only now (even an admin cannot change the amount)', Boolean(adminEdit.error));
const ov = await fin.db.rpc('fin_ops_void', { p_payment: o1.data, p_reason: 'Kart çekimi iptal' });
check('ops: finance voids with a reason; the record stays in Operasyon', !ov.error && ((await admin.db.from('ops_payments').select('voided_at, void_reason').eq('id', o1.data as string).single()).data?.void_reason === 'Kart çekimi iptal'));
const intrPay = await intruder.db.rpc('fin_ops_pay', { p_period: seeded.per, p_kind: 'payment', p_amount: '1', p_currency: 'USD', p_paid_on: '2026-11-02', p_method: null, p_reference: null, p_request_key: randomUUID() });
check('ops: a user without a role cannot record provider payments', Boolean(intrPay.error));

/* ── 5. Documents (private bucket) ─────────────────────────── */
const pdf = Buffer.from('%PDF-1.4\n% TEST dekont\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const path = `payment/${p1.data!.id}/${randomUUID()}-TEST-dekont.pdf`;
const up = await fin.db.storage.from('fin-docs').upload(path, pdf, { contentType: 'application/pdf' });
const meta = await fin.db.from('fin_documents').insert({ entity: 'payment', entity_id: p1.data!.id, name: 'TEST-dekont.pdf', path, mime: 'application/pdf', size_bytes: pdf.length }).select('*').single();
check('docs: finance uploads a receipt to the private bucket; uploaded_by from the session', !up.error && meta.data?.uploaded_by === 'finance@test.local', up.error?.message ?? meta.error?.message ?? '');
const signed = await fin.db.storage.from('fin-docs').createSignedUrl(path, 60);
const dl = signed.data?.signedUrl ? await fetch(signed.data.signedUrl) : null;
check('docs: finance opens it through a short-lived link', Boolean(dl && dl.ok && (await dl.arrayBuffer()).byteLength === pdf.length));
const pub = await fetch(`${GW}/storage/v1/object/public/fin-docs/${path}`);
check('docs: no public URL (bucket is private)', !pub.ok);
const anonGet = await fetch(`${GW}/storage/v1/object/fin-docs/${path}`, { headers: { apikey: ANON } });
check('docs: direct link without a session is refused', !anonGet.ok);
const intrSign = await intruder.db.storage.from('fin-docs').createSignedUrl(path, 60);
const intrGet = await fetch(`${GW}/storage/v1/object/fin-docs/${path}`, { headers: { Authorization: `Bearer ${intruder.token}` } });
check('docs: a signed-in user without a role can neither sign nor download it', !intrSign.data?.signedUrl && !intrGet.ok);
const rm = await fin.db.storage.from('fin-docs').remove([path]);
check('docs: finance cannot delete or overwrite files (archive only)', (rm.data ?? []).length === 0 && Number(sql(`select count(*) from storage.objects where bucket_id = 'fin-docs' and name = '${path}'`)) === 1);
const ovw = await fin.db.storage.from('fin-docs').upload(path, Buffer.from('x'), { upsert: true, contentType: 'application/pdf' });
check('docs: upsert/overwrite refused', Boolean(ovw.error));
const opsDocs = await fin.db.storage.from('ops-docs').list('service');
check('docs: finance cannot list the Operasyon / Belgeler buckets', (opsDocs.data ?? []).length === 0);

/* ── 6. Audit trail ─────────────────────────────────────────── */
const audit = sql(`select string_agg(distinct entity || ':' || action, ',' order by entity || ':' || action) from audit_log where actor = 'finance@test.local' and at > now() - interval '5 minutes'`);
check('audit: finance actions are in audit_log with the finance e-mail as actor', /fin_expenses/.test(audit) && /fin_payments/.test(audit) && /ops_payments/.test(audit), audit);
const fakeAudit = await fin.db.from('audit_log').insert({ action: 'x', entity: 'x', actor: 'sahte' }).select();
check('audit: finance cannot write or read the audit log', Boolean(fakeAudit.error) || (fakeAudit.data ?? []).length === 0);

/* ── 7. Same team digest (no separate notification) ─────────── */
await fetch(`${GW}/capture/reset`, { method: 'POST' });
sql(`update cockpit_settings set value = jsonb_set(jsonb_set(value, '{email_to}', '"ekip-test@ornek.example"'), '{telegram_chat_id}', '"-100777"') where key = 'notify'`);
// 7-day window boundary (the app runs on a fixed clock: FAKE_NOW 2026-11-07 09:00 UTC = 12:00 Istanbul)
await fin.db.from('fin_expenses').insert({ title: 'TEST Sınır 7 gün', category: 'equipment', kind: 'once', first_due_on: '2026-11-14', amount: '100.00', currency: 'TRY' });
const cron = await (await fetch(`${APP}/api/cron/ops`, { headers: { Authorization: `Bearer ${CRON}` } })).json();
check('clock: the app runs on the fixed test day (Istanbul 2026-11-07)', cron.today === '2026-11-07', String(cron.today));
const caps = (await (await fetch(`${GW}/capture/list`)).json()) as Array<Record<string, any>>;
const mails = caps.filter((c) => c.path === '/capture/resend');
const tgs = caps.filter((c) => String(c.path).includes('/sendMessage'));
const html = JSON.stringify(mails.map((m) => m.body));
const text = String(mails[0]?.body?.text ?? '');
const giderler = text.slice(text.indexOf('GİDERLER'));
check('digest: one team e-mail + one Telegram message; overdue rent inside the SAME digest (Giderler section)', mails.length === 1 && tgs.length === 1 && /TEST Ofis kirası — gecikti 2026-10-05/.test(giderler) && /Giderler/.test(JSON.stringify(tgs[0].body)), `mails=${mails.length} tg=${tgs.length} digest=${cron.digest}`);
check('digest: a one-off due in 8 days (2026-11-15) is not listed yet (window: overdue + 7 days)', !/TEST Laptop/.test(text));
check('digest: a one-off due in exactly 7 days (2026-11-14) is listed (window boundary included)', /TEST Sınır 7 gün — vade 2026-11-14/.test(text));
check('digest: only the team address; no customer or provider address', mails.every((m) => JSON.stringify(m.body.to) === '["ekip-test@ornek.example"]') && !/gid-(saglayici|musteri)@/.test(JSON.stringify(caps)));
check('digest: the Operasyon provider payment stays in "Ödemeler" and is not repeated under Giderler', /sağlayıcı ödemesi gecikti/.test(text) && giderler.length > 0 && !/TEST GID hosting/.test(giderler));
const cron2 = await (await fetch(`${APP}/api/cron/ops`, { headers: { Authorization: `Bearer ${CRON}` } })).json();
const caps2 = (await (await fetch(`${GW}/capture/list`)).json()) as Array<Record<string, any>>;
check('digest: a second run the same day sends nothing new', caps2.filter((c) => c.path === '/capture/resend').length === 1 && caps2.filter((c) => String(c.path).includes('/sendMessage')).length === 1, `digest=${cron2.digest}`);

fs.writeFileSync(`${OUT}/fin-e2e.json`, JSON.stringify({ results, seeded, expense: e1!.id, oneoff: e2!.id, nov, opsPeriod: seeded.per }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
