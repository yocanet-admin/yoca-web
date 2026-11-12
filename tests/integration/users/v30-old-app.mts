/**
 * Yayın sırası kontrolü: BUGÜNKÜ production uygulaması (v30 öncesi kod) + v30 veritabanı.
 * LOCAL only. Run the old checkout with the production-like variable:
 *   git worktree add ../yoca-main <main>; (build there)
 *   APP_DIR=../yoca-main ADMIN_EMAILS=admin@test.local bash tests/integration/start.sh
 *   tsx tests/integration/users/v30-old-app.mts
 * Expectation: existing admin and finance work unchanged; accounts the old code does not know
 * (editor, temporary password) get NO access — so applying v30 before the new app is safe.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

const APP = 'http://localhost:3190';
const GW = 'http://127.0.0.1:54331';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PSQL = ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc'];
const sql = (q: string) => execFileSync('psql', [...PSQL, q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const results: Array<{ name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  [eski uygulama + v30] ${name}${detail && !ok ? `  — ${detail}` : ''}`); };
async function as(email: string, password: string): Promise<{ db: SupabaseClient; token: string }> {
  const db = createClient(GW, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message}`);
  return { db, token: data.session.access_token };
}
const api = async (token: string, path: string) => {
  const r = await fetch(APP + path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
};

await fetch(`${GW}/capture/reset?users=1`);
// a temporary-password admin bound to the intruder's Auth user (as the new app would create it)
sql(`delete from admin_users where email = 'intruder@test.local';
     insert into admin_users (email, name, role, status, user_id, must_change_password, created_via) values ('intruder@test.local', 'TEST geçici', 'admin', 'active', '22222222-2222-4222-8222-222222222222', true, 'direct');`);
const admin = await as('admin@test.local', 'itest-admin-pw');
const fin = await as('finance@test.local', 'itest-finance-pw');
const ed = await as('editor@test.local', 'itest-editor-pw');
const tmp = await as('intruder@test.local', 'itest-intruder-pw');
const am = await api(admin.token, '/api/admin/me');
check('existing admin works (me = admin, Operasyon API 200)', am.json.role === 'admin' && (await api(admin.token, '/api/admin/ops/settings')).status === 200, JSON.stringify(am.json));
check('existing finance user works (me = finance)', (await api(fin.token, '/api/admin/me')).json.role === 'finance');
const em = await api(ed.token, '/api/admin/me');
check('an editor account gets no panel in the old app (unknown role → not allowed) and no admin API', em.json.allowed === false && (await api(ed.token, '/api/admin/ops/settings')).status === 401);
const tm = await api(tmp.token, '/api/admin/me');
check('a temporary-password admin gets nothing until the change (database says not admin)', tm.json.allowed === false && (await api(tmp.token, '/api/admin/ops/settings')).status === 401 && (await tmp.db.rpc('is_admin')).data === false);
sql(`delete from admin_users where email = 'intruder@test.local'`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
