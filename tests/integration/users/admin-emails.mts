/**
 * ADMIN_EMAILS geçişi (v30) — LOCAL test stack only. Run twice:
 *   ADMIN_EMAILS=admin@test.local bash tests/integration/start.sh && EXPECT_ADMIN_EMAILS=1 tsx tests/integration/users/admin-emails.mts
 *   bash tests/integration/start.sh                                && tsx tests/integration/users/admin-emails.mts
 * Production has ADMIN_EMAILS=<owner>. With the v30 app the database role is the only source:
 *   • a NEW admin (created in the panel, not in ADMIN_EMAILS) works fully after the password change;
 *   • the existing admin keeps working (with or without the variable);
 *   • a signed-in Auth user without a panel row gets nothing (no admin rights open up);
 *   • editor / finance stay within their roles.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

const APP = 'http://localhost:3190';
const GW = 'http://127.0.0.1:54331';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const EXPECT = process.env.EXPECT_ADMIN_EMAILS === '1';
const PSQL = ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc'];
const sql = (q: string) => execFileSync('psql', [...PSQL, q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const results: Array<{ name: string; ok: boolean }> = [];
const tag = EXPECT ? '[ADMIN_EMAILS=admin@test.local]' : '[ADMIN_EMAILS yok]';
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${tag} ${name}${detail && !ok ? `  — ${detail}` : ''}`); };
async function as(email: string, password: string): Promise<{ db: SupabaseClient; token: string }> {
  const db = createClient(GW, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message}`);
  return { db, token: data.session.access_token };
}
async function api(token: string, path: string, body?: unknown) {
  const r = await fetch(APP + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

await fetch(`${GW}/capture/reset?users=1`);
sql(`set session_replication_role = replica; delete from admin_invites; delete from admin_users where email not in ('admin@test.local', 'finance@test.local', 'editor@test.local');
     update admin_users set role = 'admin', status = 'active' where email = 'admin@test.local';`);
const admin = await as('admin@test.local', 'itest-admin-pw');
const list = await api(admin.token, '/api/admin/users');
check('the existing admin keeps full access', list.status === 200 && (await api(admin.token, '/api/admin/me')).json.role === 'admin' && (await api(admin.token, '/api/admin/ops/settings')).status === 200);
check(`the Users screen reports the variable ${EXPECT ? 'as still set (transition notice)' : 'as not set'}`, list.json.adminEmailsSet === EXPECT, String(list.json.adminEmailsSet));

const TEMP = 'Gecici-Yonetici-4410';
const NEW = 'Yeni-Yonetici-Kendi-8820';
const cr = await api(admin.token, '/api/admin/users', { action: 'create', email: 'panel.admin@test.local', name: 'TEST Panel Yöneticisi', role: 'admin', password: TEMP });
const pa = await as('panel.admin@test.local', TEMP);
const before = await api(pa.token, '/api/admin/users');
await api(pa.token, '/api/admin/password', { current: TEMP, next: NEW });
const after = await Promise.all(['/api/admin/me', '/api/admin/users', '/api/admin/ops/settings', '/api/admin/traffic', '/api/admin/site-settings'].map((p) => api(pa.token, p)));
check('a NEW panel-created admin (not in ADMIN_EMAILS) has no access before the password change …', cr.status === 200 && before.status === 401);
check('… and full admin access after it — no Vercel change needed', after[0].json.role === 'admin' && after.slice(1).every((r) => r.status === 200), after.map((r) => r.status).join(','));
const isAdmin = await pa.db.rpc('is_admin');
check('the new admin is an admin in the database too (RLS)', isAdmin.data === true && (await pa.db.from('clients').select('id').limit(1)).error === null);

const intr = await as('intruder@test.local', 'itest-intruder-pw');
const intrMe = await api(intr.token, '/api/admin/me');
const intrApi = await Promise.all(['/api/admin/users', '/api/admin/ops/settings', '/api/admin/site-settings', '/api/admin/traffic'].map((p) => api(intr.token, p)));
const intrDb = await intr.db.rpc('is_admin');
check('a signed-in Auth user WITHOUT a panel account gets nothing (no admin rights open up)', intrMe.json.allowed === false && intrApi.every((r) => r.status === 401) && intrDb.data === false && ((await intr.db.from('clients').select('id').limit(1)).data ?? []).length === 0);
const ed = await as('editor@test.local', 'itest-editor-pw');
const fin = await as('finance@test.local', 'itest-finance-pw');
check('editor and finance stay within their roles', (await api(ed.token, '/api/admin/users')).status === 401 && (await api(ed.token, '/api/admin/site-settings')).status === 200 && (await api(fin.token, '/api/admin/users')).status === 401 && (await api(fin.token, '/api/admin/me')).json.role === 'finance');

await fetch(`${GW}/capture/reset?users=1`);
sql(`delete from admin_users where email = 'panel.admin@test.local'`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
