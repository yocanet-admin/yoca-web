/**
 * Gelirler + Operasyon tahsilatları + Finans rolü — LOCAL test stack only (gateway :54331,
 * app :3190). Synthetic data marked "TEST GEL"; nothing is sent anywhere.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const APP = 'http://localhost:3190';
const GW = 'http://127.0.0.1:54331';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PSQL = ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc'];
const sql = (q: string) => execFileSync('psql', [...PSQL, q], { encoding: 'utf8' }).trim();
const results: Array<{ name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
async function as(email: string, password: string): Promise<{ db: SupabaseClient; token: string }> {
  const db = createClient(GW, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message}`);
  return { db, token: data.session.access_token };
}
const today = sql(`select (now() at time zone 'Europe/Istanbul')::date`);
const month = today.slice(0, 7);
const prevMonthDay = sql(`select (('${today}'::date) - interval '1 month')::date::text`);

// clean previous synthetic data (test DB only)
sql(`set session_replication_role = replica;
  delete from fin_documents where entity in ('receivable','collection','ops_receivable','ops_collection');
  delete from fin_collections; delete from fin_receivables;
  delete from ops_payments where service_id in (select id from ops_services where name like 'TEST GEL%');
  delete from ops_periods where service_id in (select id from ops_services where name like 'TEST GEL%');
  delete from ops_service_links where service_id in (select id from ops_services where name like 'TEST GEL%');
  delete from ops_services where name like 'TEST GEL%'; delete from clients where name like 'TEST GEL%';
  delete from storage.objects where bucket_id = 'fin-docs' and name ~ '^(receivable|collection|ops_receivable|ops_collection)/';`);

const admin = await as('admin@test.local', 'itest-admin-pw');
const fin = await as('finance@test.local', 'itest-finance-pw');

/* ── 1. Operasyon customer collection recorded in Operasyon → visible in Finans once ── */
const { data: cust } = await admin.db.from('clients').insert({ name: 'TEST GEL Müşteri', roles: ['customer'], email: 'gel-musteri@ornek.example', phone: '+90 000 000' }).select('id').single();
const { data: prov } = await admin.db.from('clients').insert({ name: 'TEST GEL Sağlayıcı', roles: ['provider'] }).select('id').single();
const { data: svc } = await admin.db.from('ops_services').insert({ name: 'TEST GEL hosting', kind: 'hosting', provider_id: prov!.id, payer_party: 'yoca', cost_amount: 400, cost_currency: 'TRY', price_amount: 1000, price_currency: 'TRY', note: 'GİZLİ iç not', details: { login_hint: 'GİZLİ ipucu' } }).select('id').single();
await admin.db.from('ops_service_links').insert({ service_id: svc!.id, client_id: cust!.id });
const { data: per } = await admin.db.from('ops_periods').insert({ service_id: svc!.id, starts_on: `${month}-01`, ends_on: '2027-10-31', due_on: `${month}-03`, customer_due_on: `${month}-20`, expected_cost: 400, cost_currency: 'TRY', expected_price: 1000, price_currency: 'TRY' }).select('id').single();
// the admin records a customer collection in Operasyon (as the Operasyon screen does: a direct ops_payments row)
const opsKey = randomUUID();
const { data: opsIn, error: opsInErr } = await admin.db.from('ops_payments').insert({ period_id: per!.id, service_id: svc!.id, direction: 'in', kind: 'payment', amount: '600.00', currency: 'TRY', paid_on: prevMonthDay, client_id: cust!.id, note: 'GİZLİ tahsilat notu', request_key: opsKey, created_by: 'admin@test.local' }).select('id').single();
// and a provider payment
const { data: opsOut } = await admin.db.from('ops_payments').insert({ period_id: per!.id, service_id: svc!.id, direction: 'out', kind: 'payment', amount: '400.00', currency: 'TRY', paid_on: today, request_key: randomUUID(), created_by: 'admin@test.local' }).select('id').single();
check('setup: admin records a customer collection and a provider payment in Operasyon', !opsInErr && Boolean(opsIn?.id) && Boolean(opsOut?.id), opsInErr?.message ?? '');

const rv = await fin.db.from('fin_ops_receivables').select('*').eq('id', per!.id);
const r0 = (rv.data ?? [])[0] as Record<string, unknown> | undefined;
check('ops: finance sees the receivable (service, customer display name, collection due date, expected price)', Boolean(r0) && r0!.service_name === 'TEST GEL hosting' && r0!.client_names === 'TEST GEL Müşteri' && r0!.due_on === `${month}-20` && String(r0!.amount) === '1000.00');
check('ops: … but no cost, notes, login hints, contact data or secret refs', Boolean(r0) && !JSON.stringify(r0).includes('GİZLİ') && !JSON.stringify(r0).includes('ornek.example') && !('expected_cost' in r0!) && !('note' in r0!));
const col = await fin.db.from('fin_ops_collections').select('*').eq('period_id', per!.id);
check('ops: the Operasyon collection appears in Finans exactly once, without its note', (col.data ?? []).length === 1 && String((col.data ?? [])[0]?.amount) === '600.00' && !JSON.stringify(col.data).includes('GİZLİ'));
const costView = await fin.db.from('fin_ops_payments').select('id').eq('period_id', per!.id);
check('ops: the provider payment is in the expense view only (once), never in the collection view', (costView.data ?? []).length === 1 && (costView.data ?? [])[0].id === opsOut!.id && !(col.data ?? []).some((c) => c.id === opsOut!.id));

/* ── 2. Finance records a collection through the controlled path (same ops_payments row) ── */
const k1 = randomUUID();
const c1 = await fin.db.rpc('fin_ops_collect', { p_period: per!.id, p_kind: 'payment', p_amount: '400.00', p_currency: 'TRY', p_paid_on: today, p_method: 'bank_transfer', p_reference: 'TEST-REF', p_request_key: k1 });
const c1b = await fin.db.rpc('fin_ops_collect', { p_period: per!.id, p_kind: 'payment', p_amount: '400.00', p_currency: 'TRY', p_paid_on: today, p_method: 'bank_transfer', p_reference: 'TEST-REF', p_request_key: k1 });
const inRows = sql(`select count(*) || '|' || coalesce(string_agg(distinct created_by, ','), '') || '|' || coalesce(string_agg(distinct client_id::text, ','), '') from ops_payments where period_id = '${per!.id}' and direction = 'in'`);
check('collect: finance records a collection; it is an ops_payments "in" row (Operasyon sees it), a retry is the same record', !c1.error && c1.data === c1b.data && inRows.startsWith('2|') && inRows.includes('finance@test.local') && inRows.endsWith(cust!.id), `${c1.error?.message ?? ''} ${inRows}`);
const copies = sql(`select count(*) from fin_collections`);
check('collect: no copy in the Gelirler tables', copies === '0');
const wrongCur = await fin.db.rpc('fin_ops_collect', { p_period: per!.id, p_kind: 'payment', p_amount: '5', p_currency: 'USD', p_paid_on: today, p_method: null, p_reference: null, p_request_key: randomUUID() });
check('collect: another currency is refused (no conversion)', Boolean(wrongCur.error), wrongCur.error?.message ?? '');
const future = await fin.db.rpc('fin_ops_collect', { p_period: per!.id, p_kind: 'payment', p_amount: '5', p_currency: 'TRY', p_paid_on: '2099-01-01', p_method: null, p_reference: null, p_request_key: randomUUID() });
check('collect: a future collection date is refused (no invented dates)', Boolean(future.error));

/* ── 3. Refund / void on the same source; direction is enforced ── */
const refund = await fin.db.rpc('fin_ops_collect', { p_period: per!.id, p_kind: 'refund', p_amount: '50.00', p_currency: 'TRY', p_paid_on: today, p_method: null, p_reference: null, p_request_key: randomUUID() });
const v1 = await fin.db.rpc('fin_ops_collect_void', { p_payment: c1.data, p_reason: 'TEST yanlış tutar' });
const voided = sql(`select voided_at is not null and void_reason = 'TEST yanlış tutar' from ops_payments where id = '${c1.data}'`);
check('refund + void: recorded on the same ops_payments rows; the voided one stays with its reason (Operasyon shows the same)', !refund.error && !v1.error && voided === 't', `${refund.error?.message ?? ''} ${v1.error?.message ?? ''}`);
const crossA = await fin.db.rpc('fin_ops_collect_void', { p_payment: opsOut!.id, p_reason: 'TEST deneme' });
const crossB = await fin.db.rpc('fin_ops_void', { p_payment: opsIn!.id, p_reason: 'TEST deneme' });
check('direction: the collection path cannot void a provider payment, the provider path cannot void a collection', Boolean(crossA.error) && Boolean(crossB.error) && sql(`select count(*) from ops_payments where id in ('${opsOut!.id}', '${opsIn!.id}') and voided_at is not null`) === '0');
const noReason = await fin.db.rpc('fin_ops_collect_void', { p_payment: opsIn!.id, p_reason: '' });
check('void: a reason is required', Boolean(noReason.error));
const editOps = await fin.db.from('ops_payments').update({ amount: '1' }).eq('id', opsIn!.id).select();
check('rls: finance cannot edit or read ops_payments directly', (editOps.data ?? []).length === 0 && sql(`select amount from ops_payments where id = '${opsIn!.id}'`) === '600.00');

/* ── 4. Manual receivable: unknown amount, partial, refund, over, other months, guards ── */
const { data: r1, error: r1e } = await fin.db.from('fin_receivables').insert({ title: 'TEST GEL danışmanlık', category: 'consulting', period_month: month, amount: null, currency: 'TRY', payer_name: 'TEST GEL Bireysel' }).select('*').single();
check('receivable: finance adds income without Operasyon or a registered customer; unknown amount stays null; "who" from the session', !r1e && r1!.amount === null && r1!.created_by === 'finance@test.local' && r1!.client_id === null, r1e?.message ?? '');
const zero = await fin.db.from('fin_receivables').insert({ title: 'TEST GEL sıfır', category: 'other', period_month: month, amount: '0', currency: 'TRY' }).select();
check('receivable: an amount of 0 is refused (unknown is empty, never 0)', Boolean(zero.error));
await fin.db.from('fin_receivables').update({ amount: '1000.00', client_id: cust!.id, payer_name: null, due_on: `${month}-25` }).eq('id', r1!.id);
const ck = randomUUID();
const p1 = await fin.db.from('fin_collections').insert({ receivable_id: r1!.id, kind: 'payment', amount: '300.00', currency: 'TRY', paid_on: prevMonthDay, request_key: ck }).select('id').single();
const p1again = await fin.db.from('fin_collections').insert({ receivable_id: r1!.id, kind: 'payment', amount: '300.00', currency: 'TRY', paid_on: prevMonthDay, request_key: ck }).select('id').single();
check('collection: partial collection (paid last month for this month\'s income); the same form twice stays ONE record', !p1.error && Boolean(p1again.error) && sql(`select count(*) from fin_collections where receivable_id = '${r1!.id}'`) === '1');
await fin.db.from('fin_collections').insert({ receivable_id: r1!.id, kind: 'payment', amount: '900.00', currency: 'TRY', paid_on: today, request_key: randomUUID() });
await fin.db.from('fin_collections').insert({ receivable_id: r1!.id, kind: 'refund', amount: '100.00', currency: 'TRY', paid_on: today, request_key: randomUUID() });
const net = sql(`select sum(case when kind = 'refund' then -amount else amount end) from fin_collections where receivable_id = '${r1!.id}' and voided_at is null`);
check('collection: refund recorded; over-collection kept as is (net 1 100 for 1 000)', net === '1100.00', net);
const colsBefore = sql(`select string_agg(id || ':' || amount || ':' || coalesce(voided_at::text, '-'), ',' order by id) from fin_collections where receivable_id = '${r1!.id}'`);
const amtChange = await fin.db.from('fin_receivables').update({ amount: '1100.00' }).eq('id', r1!.id).select();
check('correction: after a collection the expected amount does not change silently (no reason → refused)', Boolean(amtChange.error) && sql(`select amount from fin_receivables where id = '${r1!.id}'`) === '1000.00', amtChange.error?.message ?? '');
const toNull = await fin.db.from('fin_receivables').update({ amount: null, amount_note: 'TEST bilinmiyor' }).eq('id', r1!.id).select();
const curChange = await fin.db.from('fin_receivables').update({ currency: 'USD' }).eq('id', r1!.id).select();
check('correction: cannot empty the amount or change the currency after a collection', Boolean(toNull.error) && Boolean(curChange.error));
const fix = await fin.db.from('fin_receivables').update({ amount: '1200.00', amount_note: 'TEST sözleşmede 1.200 yazıyor' }).eq('id', r1!.id).select('amount, amount_note, amount_corrected_by').single();
const colsAfter = sql(`select string_agg(id || ':' || amount || ':' || coalesce(voided_at::text, '-'), ',' order by id) from fin_collections where receivable_id = '${r1!.id}'`);
check('correction: a wrongly entered amount is corrected WITH a reason; who is the session; collections untouched', !fix.error && String(fix.data?.amount) === '1200.00' && fix.data?.amount_corrected_by === 'finance@test.local' && colsBefore === colsAfter, fix.error?.message ?? '');
const sameReason = await fin.db.from('fin_receivables').update({ amount: '1300.00', amount_note: 'TEST sözleşmede 1.200 yazıyor' }).eq('id', r1!.id).select();
const rewriteReason = await fin.db.from('fin_receivables').update({ amount_note: 'TEST başka gerekçe' }).eq('id', r1!.id).select('amount_note').single();
check('correction: every correction needs its own reason; the reason cannot be rewritten later', Boolean(sameReason.error) && rewriteReason.data?.amount_note === 'TEST sözleşmede 1.200 yazıyor');
const trail = sql(`select string_agg(actor || ' ' || (changes->'amount'->>'from') || '→' || (changes->'amount'->>'to') || ' ' || (changes->'amount_note'->>'to'), ' | ') from audit_log where entity = 'fin_receivables' and entity_id = '${r1!.id}' and changes ? 'amount' and changes->'amount'->>'from' is not null`);
check('correction: the history keeps old → new amount, the reason and the actor', /finance@test\.local 1000\.00→1200\.00 TEST sözleşmede 1\.200 yazıyor/.test(trail), trail);
await fin.db.from('fin_receivables').update({ amount: '1000.00', amount_note: 'TEST test için geri alındı' }).eq('id', r1!.id);
const editCol = await fin.db.from('fin_collections').update({ amount: '1.00' }).eq('id', p1.data!.id).select();
check('guard: a collection cannot be edited', Boolean(editCol.error) && sql(`select amount from fin_collections where id = '${p1.data!.id}'`) === '300.00');
const delCol = await fin.db.from('fin_collections').delete().eq('id', p1.data!.id).select();
const delRec = await fin.db.from('fin_receivables').delete().eq('id', r1!.id).select();
check('guard: nothing is deleted (collection, receivable)', (delCol.data ?? []).length === 0 && (delRec.data ?? []).length === 0 && sql(`select count(*) from fin_collections where receivable_id = '${r1!.id}'`) === '3');
const cancelWithPay = await fin.db.from('fin_receivables').update({ status: 'cancelled', cancel_reason: 'TEST' }).eq('id', r1!.id).select();
check('guard: a receivable with valid collections cannot be cancelled', Boolean(cancelWithPay.error));
const wrongCurCol = await fin.db.from('fin_collections').insert({ receivable_id: r1!.id, kind: 'payment', amount: '1.00', currency: 'USD', paid_on: today, request_key: randomUUID() }).select();
check('guard: a collection in another currency is refused', Boolean(wrongCurCol.error));
const noReasonVoid = await fin.db.from('fin_collections').update({ voided_at: new Date().toISOString(), void_reason: '' }).eq('id', p1.data!.id).select();
const okVoid = await fin.db.from('fin_collections').update({ voided_at: new Date().toISOString(), void_reason: 'TEST mükerrer' }).eq('id', p1.data!.id).select('voided_by');
check('void: needs a reason; "who" is the session', Boolean(noReasonVoid.error) && !okVoid.error && (okVoid.data ?? [])[0]?.voided_by === 'finance@test.local');
// a second receivable in USD for next month, to check currencies stay apart
await fin.db.from('fin_receivables').insert({ title: 'TEST GEL USD proje', category: 'project', period_month: sql(`select to_char(('${today}'::date + interval '1 month'), 'YYYY-MM')`), amount: '250.00', currency: 'USD' });

/* ── 5. Files and history ── */
const up = await fin.db.storage.from('fin-docs').upload(`receivable/${r1!.id}/TEST-fatura.pdf`, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
const doc = await fin.db.from('fin_documents').insert({ entity: 'receivable', entity_id: r1!.id, name: 'TEST-fatura.pdf', path: `receivable/${r1!.id}/TEST-fatura.pdf`, mime: 'application/pdf', size_bytes: 13 }).select('id').single();
const badPath = await fin.db.storage.from('fin-docs').upload(`evil/${r1!.id}/x.pdf`, new Blob(['x'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
check('files: finance uploads an invoice for the receivable to the private bucket; other paths refused', !up.error && !doc.error && Boolean(badPath.error), `${up.error?.message ?? ''} ${doc.error?.message ?? ''}`);
const hist = await fin.db.from('fin_audit').select('actor, entity, action, changes').in('entity_id', [r1!.id, opsIn!.id, c1.data as string]);
const hrows = (hist.data ?? []) as Array<{ actor: string; entity: string; action: string; changes: Record<string, unknown> | null }>;
check('history: finance sees every action on these records, the admin\'s Operasyon collection included (payment fields only, no note)', hrows.some((h) => h.entity === 'ops_payments' && h.actor === 'admin@test.local') && hrows.some((h) => h.entity === 'ops_payments' && h.actor === 'finance@test.local') && hrows.some((h) => h.entity === 'fin_receivables' && h.action === 'update') && !JSON.stringify(hrows).includes('GİZLİ'), `${hrows.length} rows`);
const raw = await fin.db.from('audit_log').select('id').limit(3);
check('history: the general audit log stays closed to finance', (raw.data ?? []).length === 0);

/* ── 6. Access limits of the finance role ── */
const hidden: Record<string, number> = {};
for (const t of ['ops_services', 'ops_periods', 'ops_payments', 'clients', 'client_contacts', 'ops_provider_accounts', 'contact_submissions', 'cockpit_settings', 'doc_documents', 'admin_users', 'insights']) {
  const { data } = await fin.db.from(t).select('*').limit(5);
  hidden[t] = (data ?? []).filter((r: Record<string, unknown>) => t !== 'insights' || r.status !== 'PUBLISHED').length;
}
check('rls: finance still reads nothing from Operasyon tables, CRM, leads, settings, documents, users, draft Insights', Object.values(hidden).every((n) => n === 0), JSON.stringify(hidden));
const clientsView = await fin.db.from('fin_clients').select('*');
check('customers: id + display name only (no e-mail / phone), customers only', (clientsView.data ?? []).some((c) => c.name === 'TEST GEL Müşteri') && !(clientsView.data ?? []).some((c) => c.name === 'TEST GEL Sağlayıcı') && !JSON.stringify(clientsView.data).includes('ornek.example') && Object.keys((clientsView.data ?? [])[0] ?? {}).sort().join(',') === 'id,name');
const roleUp = await fin.db.from('admin_users').update({ role: 'admin' }).eq('email', 'finance@test.local').select();
const addAdmin = await fin.db.from('admin_users').insert({ email: 'yeni-admin@ornek.example', role: 'admin' }).select();
check('roles: finance cannot raise its own role or add an admin', (roleUp.data ?? []).length === 0 && Boolean(addAdmin.error) && sql(`select role from admin_users where email = 'finance@test.local'`) === 'finance');
const apis: string[] = [];
for (const p of ['/api/admin/site-settings', '/api/admin/notify', '/api/admin/health', '/api/admin/ops/settings']) {
  const r = await fetch(`${APP}${p}`, { headers: { Authorization: `Bearer ${fin.token}` } });
  apis.push(`${p}=${r.status}`);
}
check('server: admin API routes (settings, secrets health, Operasyon settings) still refuse the finance token', apis.every((a) => /=(401|403)$/.test(a)), apis.join(' '));
const anon = createClient(GW, ANON, { auth: { persistSession: false } });
const anonRead = await anon.from('fin_receivables').select('id');
const anonOps = await anon.from('fin_ops_receivables').select('id');
check('anon: nothing readable', (anonRead.data ?? []).length === 0 && (anonOps.data ?? []).length === 0);
const grants = sql(`select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name in ('fin_receivables', 'fin_collections') and ((grantee = 'anon') or (grantee = 'authenticated' and privilege_type in ('DELETE', 'TRUNCATE')))`);
check('grants: no anon access, no DELETE / TRUNCATE for signed-in users on the new tables', grants === '0', grants);

/* ── 7. No money movement from renewals / documents ── */
const writers = sql(`select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ~* 'insert\\s+into\\s+public\\.ops_payments'`);
check('only the two controlled Finans functions insert into ops_payments in the database (renewal, documents: none)', writers === 'fin_ops_collect,fin_ops_pay', writers);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(JSON.stringify({ receivable: r1!.id, opsPeriod: per!.id, month }));
process.exit(failed ? 1 : 0);
