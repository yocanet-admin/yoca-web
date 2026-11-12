/**
 * Kullanıcı yönetimi + roller (v30) — LOCAL test stack only (gateway :54331, app :3190).
 * Synthetic accounts @test.local; e-mails go to the gateway's capture (never a real inbox);
 * Auth users live in the gateway's test file. Re-runnable after setup-db.sh.
 *
 * Covers: the three roles on direct database access, storage and API routes; the invite
 * flow (link by e-mail, own password, one-time, expiry, resend, cancel, failed send,
 * duplicates, an e-mail that already exists in Auth); role change and closed access with an
 * OPEN session (old token); the last active admin; audit log; history kept; no secrets stored.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const APP = 'http://localhost:3190';
const GW = 'http://127.0.0.1:54331';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PSQL = ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc'];
const sql = (q: string) => execFileSync('psql', [...PSQL, q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const results: Array<{ name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  — ${detail}` : ''}`); };
type Who = { db: SupabaseClient; token: string; refresh: string };
async function login(email: string, password: string): Promise<Who | { error: string }> {
  const db = createClient(GW, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { error: error?.message ?? 'no session' };
  return { db, token: data.session.access_token, refresh: data.session.refresh_token };
}
async function as(email: string, password: string): Promise<Who> {
  const r = await login(email, password);
  if ('error' in r) throw new Error(`login ${email}: ${r.error}`);
  return r;
}
async function api(token: string | null, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(APP + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}
const captured = async () => (await (await fetch(`${GW}/capture/list`)).json()) as Array<{ path: string; body: { to?: string[]; subject?: string; html?: string; email?: string } }>;
async function lastInviteToken(to: string): Promise<string | null> {
  const mails = (await captured()).filter((m) => m.path === '/capture/resend' && (m.body.to ?? []).includes(to));
  const html = mails.at(-1)?.body.html ?? '';
  return /\/admin\/davet#t=([A-Za-z0-9_-]{43})/.exec(html)?.[1] ?? null;
}
const PW = 'Yesil-Vadi-2026-Kalem';

// ── reset (test DB + test Auth only) ─────────────────────────────────
await fetch(`${GW}/capture/reset?users=1`);
sql(`set session_replication_role = replica;
  delete from admin_invites;
  delete from admin_users where email not in ('admin@test.local', 'finance@test.local', 'editor@test.local');
  update admin_users set role = 'admin', status = 'active', disabled_at = null where email = 'admin@test.local';
  update admin_users set role = 'finance', status = 'active', disabled_at = null where email = 'finance@test.local';
  insert into admin_users (email, note, role, name) values ('editor@test.local', 'TEST içerik editörü', 'editor', 'TEST Editör') on conflict (email) do update set role = 'editor', status = 'active', disabled_at = null;
  delete from audit_log where entity = 'admin_users';
  delete from menus where title like 'TEST USR%'; delete from insights where slug like 'test-usr-%';
  delete from storage.objects where name like 'test-usr/%';`);

const admin = await as('admin@test.local', 'itest-admin-pw');
const fin = await as('finance@test.local', 'itest-finance-pw');
const ed = await as('editor@test.local', 'itest-editor-pw');
const intr = await as('intruder@test.local', 'itest-intruder-pw');

/* ── 1. Database: what each role can read / write directly ─────────── */
const canInsertMenu = async (w: Who, tag: string) => {
  const r = await w.db.from('menus').insert({ title: `TEST USR ${tag}`, url: '/tr', location: 'footer', order_index: 990, is_active: false }).select('id');
  return !r.error && (r.data ?? []).length === 1;
};
const rows = async (w: Who, table: string) => {
  const r = await w.db.from(table).select('*').limit(5);
  return r.error ? -1 : (r.data ?? []).length;
};
sql(`insert into clients (name, roles) values ('TEST USR müşteri', '{customer}') on conflict do nothing;
     insert into contact_submissions (name, email, message) values ('TEST USR lead', 'usr-lead@test.local', 'x');
     insert into insights (locale, slug, title, status) values ('tr', 'test-usr-draft', 'TEST USR taslak', 'DRAFT');`);
check('db: editor manages content (menus insert, Insights draft read + update, team / Work read)', (await canInsertMenu(ed, 'editor')) && (await rows(ed, 'insights')) > 0 && !(await ed.db.from('insights').update({ excerpt: 'TEST USR editör' }).eq('slug', 'test-usr-draft')).error && sql(`select excerpt from insights where slug = 'test-usr-draft'`) === 'TEST USR editör' && (await rows(ed, 'team_members')) >= 0 && (await rows(ed, 'case_studies')) >= 0);
const edAbout = await ed.db.from('cockpit_settings').upsert({ key: 'about_intro', value: { status: 'draft', texts: { tr: 'TEST USR' } }, updated_at: new Date().toISOString() });
const edOther = await ed.db.from('cockpit_settings').upsert({ key: 'site_copy', value: { hacked: true }, updated_at: new Date().toISOString() });
check('db: editor may write the Hakkımızda draft setting only (other settings refused)', !edAbout.error && Boolean(edOther.error) && !sql(`select value::text from cockpit_settings where key = 'site_copy'`).includes('hacked'), `${edAbout.error?.message ?? ''} | ${edOther.error?.message ?? 'other accepted'}`);
const closedForEditor = ['clients', 'contact_submissions', 'deals', 'ops_services', 'ops_payments', 'fin_expenses', 'fin_receivables', 'doc_documents', 'audit_log', 'newsletter_subscribers', 'monitored_sites', 'admin_users', 'admin_invites', 'seo_keywords'];
const leaks: string[] = [];
for (const t of closedForEditor) if ((await rows(ed, t)) > 0) leaks.push(t);
check('db: editor sees no Operasyon, Finans, CRM / lead, documents, newsletter, audit, users or SEO rows', leaks.length === 0, leaks.join(', '));
const edWriteClient = await ed.db.from('clients').insert({ name: 'TEST USR editör müşteri', roles: ['customer'] }).select('id');
check('db: editor cannot write customer data', Boolean(edWriteClient.error) || (edWriteClient.data ?? []).length === 0);
check('db: finance keeps Finans (receivables / expenses readable) but cannot write content', (await rows(fin, 'fin_receivables')) >= 0 && (await fin.db.from('fin_expenses').select('id').limit(1)).error === null && !(await canInsertMenu(fin, 'finance')));
check('db: finance sees no content-management data beyond public rows (drafts, revisions)', (await fin.db.from('insights').select('id').eq('slug', 'test-usr-draft')).data?.length === 0 && (await rows(fin, 'insight_revisions')) <= 0);
check('db: admin keeps everything (content, customers, users list)', (await canInsertMenu(admin, 'admin')) && (await rows(admin, 'clients')) > 0 && !(await admin.db.rpc('users_list')).error);
const ul = await Promise.all([ed, fin, intr].map((w) => w.db.rpc('users_list')));
check('db: users_list() refused for editor, finance and a signed-in non-member', ul.every((r) => Boolean(r.error)), ul.map((r) => r.error?.message ?? 'ok').join(' | '));
const edInvite = await ed.db.rpc('users_invite', { p_email: 'x@test.local', p_name: 'X', p_role: 'admin', p_token_hash: 'a'.repeat(64), p_expires_at: new Date(Date.now() + 3600e3).toISOString() });
const edRole = await ed.db.rpc('users_set_role', { p_email: 'editor@test.local', p_role: 'admin' });
check('db: an editor cannot invite or raise anyone’s role (not even their own)', Boolean(edInvite.error) && Boolean(edRole.error) && sql(`select role from admin_users where email = 'editor@test.local'`) === 'editor');
const lookup = await ed.db.rpc('invite_lookup', { p_token_hash: 'a'.repeat(64) });
check('db: invite_lookup / invite_accept are server-only (refused for signed-in users)', Boolean(lookup.error));

// storage: content media yes, private finance / ops / document files no
const up = async (w: Who, bucket: string) => !(await w.db.storage.from(bucket).upload(`test-usr/${Date.now()}-${Math.random()}.txt`, new Blob(['x'], { type: 'text/plain' }), { contentType: 'text/plain' })).error;
const edBuckets = { insights: await up(ed, 'insights'), 'team-photos': await up(ed, 'team-photos'), 'insight-drafts': await up(ed, 'insight-drafts'), 'case-evidence': await up(ed, 'case-evidence'), 'fin-docs': await up(ed, 'fin-docs'), 'ops-docs': await up(ed, 'ops-docs'), 'yoca-docs': await up(ed, 'yoca-docs') };
check('storage: editor uploads content media (insights, team photos, drafts, case evidence)', edBuckets.insights && edBuckets['team-photos'] && edBuckets['insight-drafts'] && edBuckets['case-evidence'], JSON.stringify(edBuckets));
check('storage: editor cannot upload to finance, Operasyon or document buckets', !edBuckets['fin-docs'] && !edBuckets['ops-docs'] && !edBuckets['yoca-docs'], JSON.stringify(edBuckets));
check('storage: finance cannot upload content media', !(await up(fin, 'insights')) && !(await up(fin, 'team-photos')));

/* ── 2. API routes per role ────────────────────────────────────────── */
const me = await Promise.all([admin, fin, ed, intr].map((w) => api(w.token, '/api/admin/me')));
check('api: /me reports admin / finance / editor; a non-member is not allowed', me[0].json.role === 'admin' && me[1].json.role === 'finance' && me[2].json.role === 'editor' && me[3].json.allowed === false, me.map((m) => `${m.json.role ?? m.json.reason}`).join(','));
const usersApi = await Promise.all([admin, fin, ed, intr].map((w) => api(w.token, '/api/admin/users')));
check('api: user management is admin only', usersApi[0].status === 200 && usersApi.slice(1).every((r) => r.status === 401), usersApi.map((r) => r.status).join(','));
const edSettings = await api(ed.token, '/api/admin/site-settings');
check('api: editor gets only the Hakkımızda draft from site settings (no company / KVKK / response data)', edSettings.status === 200 && 'about' in edSettings.json && !('company' in edSettings.json) && !('responseTimes' in edSettings.json) && !('kvkk' in edSettings.json));
const edCompany = await api(ed.token, '/api/admin/site-settings', { key: 'company_info', value: { legalName: 'TEST USR' } });
const edAboutApi = await api(ed.token, '/api/admin/site-settings', { key: 'about_intro', value: { status: 'draft', texts: { tr: 'TEST USR api' } } });
check('api: editor cannot save company info; can save the Hakkımızda draft', edCompany.status === 403 && edAboutApi.status === 200, `${edCompany.status} ${edAboutApi.status}`);
const contentRoutes = ['/api/admin/insights/images?groupId=00000000-0000-4000-8000-000000000000'];
const edContent = await Promise.all(contentRoutes.map((p) => api(ed.token, p)));
const finContent = await Promise.all(contentRoutes.map((p) => api(fin.token, p)));
const edAi = await api(ed.token, '/api/ai', { action: 'fetch_sources', urls: [] });
const finAi = await api(fin.token, '/api/ai', { action: 'fetch_sources', urls: [] });
const edPublish = await api(ed.token, '/api/admin/insights/publish', { insightId: 'not-an-id' });
check('api: editor reaches the content routes (Insights images, AI studio, publish validation); finance does not', edContent.every((r) => r.status !== 401) && edAi.status !== 401 && edPublish.status === 400 && finContent.every((r) => r.status === 401) && finAi.status === 401, `${edContent.map((r) => r.status)} ai=${edAi.status} pub=${edPublish.status} fin=${finContent.map((r) => r.status)}/${finAi.status}`);
const adminOnly = ['/api/admin/newsletter?groupId=00000000-0000-4000-8000-000000000000', '/api/admin/ops/settings', '/api/admin/traffic', '/api/admin/seo', '/api/admin/ai', '/api/admin/health', '/api/admin/documents?list=1'];
const edAdminOnly = await Promise.all(adminOnly.map((p) => api(ed.token, p)));
check('api: editor is refused on newsletter, Operasyon, traffic, SEO, AI settings, health and documents', edAdminOnly.every((r) => r.status === 401), adminOnly.map((p, i) => `${p.split('?')[0]}=${edAdminOnly[i].status}`).join(' '));
const edFin = await fetch(`${APP}/api/admin/fin/import`, { method: 'POST', headers: { Authorization: `Bearer ${ed.token}` }, body: new FormData() });
check('api: editor is refused on the Finans import', edFin.status === 403 || edFin.status === 401, String(edFin.status));
const edAiSave = await api(ed.token, '/api/admin/ai', { action: 'save', settings: { monthlyBudgetUsd: 9999 } });
const edAiRow = await ed.db.from('cockpit_settings').upsert({ key: 'ai', value: { monthlyBudgetUsd: 9999 }, updated_at: new Date().toISOString() });
const edAiRead = await ed.db.from('cockpit_settings').select('key').eq('key', 'ai');
check('AI: editor cannot change AI budget / model / key settings (API and database) nor read them', edAiSave.status === 401 && Boolean(edAiRow.error) && (edAiRead.data ?? []).length === 0 && !sql(`select coalesce(value::text, '') from cockpit_settings where key = 'ai'`).includes('9999'));
const noToken = await api(null, '/api/admin/users');
check('api: no session → 401', noToken.status === 401);

/* ── 3. Invite flow ────────────────────────────────────────────────── */
const inv = await api(admin.token, '/api/admin/users', { action: 'invite', email: 'Yeni.Editor@Test.Local ', name: 'TEST Yeni Editör', role: 'editor' });
const tok1 = await lastInviteToken('yeni.editor@test.local');
check('invite: admin invites (e-mail normalised); the e-mail is accepted by the service and carries a one-time link', inv.status === 200 && inv.json.sent === true && Boolean(tok1), JSON.stringify(inv.json));
const row1 = sql(`select u.status || '|' || u.role || '|' || i.send_status || '|' || (i.token_hash = '${createHash('sha256').update(tok1 ?? '').digest('hex')}') from admin_users u join admin_invites i using (email) where email = 'yeni.editor@test.local'`);
check('invite: row "invited" + invite "sent"; only the token HASH is stored', row1 === 'invited|editor|sent|true', row1);
check('invite: the raw token is stored nowhere (invites, users, audit log)', sql(`select count(*) from admin_invites where token_hash like '%${tok1}%'`) === '0' && sql(`select count(*) from audit_log where coalesce(changes::text,'') || coalesce(label,'') like '%${tok1}%'`) === '0');
const noAccessYet = await login('yeni.editor@test.local', PW);
check('invite: an invited person cannot sign in before setting a password', 'error' in noAccessYet);
const dup = await api(admin.token, '/api/admin/users', { action: 'invite', email: 'yeni.editor@test.local', name: 'Tekrar', role: 'admin' });
const dupExisting = await api(admin.token, '/api/admin/users', { action: 'invite', email: 'FINANCE@test.local', name: 'Tekrar', role: 'editor' });
check('invite: the same e-mail cannot be invited twice (pending invite / existing account, clear reasons)', dup.status === 409 && dup.json.code === 'pending_invite' && dupExisting.status === 409 && dupExisting.json.code === 'exists' && sql(`select count(*) from admin_users where email in ('yeni.editor@test.local', 'finance@test.local')`) === '2' && sql(`select role from admin_users where email = 'finance@test.local'`) === 'finance', `${dup.json.code} ${dupExisting.json.code}`);
const bad = await Promise.all([
  api(admin.token, '/api/admin/users', { action: 'invite', email: 'not-an-email', name: 'X', role: 'editor' }),
  api(admin.token, '/api/admin/users', { action: 'invite', email: 'x@test.local', name: '', role: 'editor' }),
  api(admin.token, '/api/admin/users', { action: 'invite', email: 'x@test.local', name: 'X', role: 'superuser' }),
]);
check('invite: invalid e-mail, empty name, unknown role refused', bad.every((r) => r.status === 400) && sql(`select count(*) from admin_users where email = 'x@test.local'`) === '0');

const chk = await api(null, '/api/admin/invite', { token: tok1 });
check('accept: the link shows name, e-mail and role (no session needed)', chk.json.state === 'valid' && chk.json.email === 'yeni.editor@test.local' && chk.json.role === 'İçerik editörü');
const weak = await api(null, '/api/admin/invite', { token: tok1, password: 'kisa' });
check('accept: a weak password is refused; the invite stays usable', weak.status === 400 && sql(`select status from admin_users where email = 'yeni.editor@test.local'`) === 'invited');
const acc = await api(null, '/api/admin/invite', { token: tok1, password: PW });
check('accept: the invitee sets their own password → account active', acc.status === 200 && acc.json.state === 'accepted' && sql(`select status || '|' || (user_id is not null) from admin_users where email = 'yeni.editor@test.local'`) === 'active|true', JSON.stringify(acc.json));
const reuse = await api(null, '/api/admin/invite', { token: tok1, password: 'Baska-Bir-Sifre-99' });
check('accept: the link works once', reuse.json.state === 'used' && reuse.status === 200);
const newEd = await as('yeni.editor@test.local', PW);
const newMe = await api(newEd.token, '/api/admin/me');
check('accept: the new user signs in with their own password and gets the invited role', newMe.json.role === 'editor');
check('accept: no password is stored or logged by the app (only Auth has it)', sql(`select count(*) from audit_log where coalesce(changes::text,'') like '%${PW}%'`) === '0' && sql(`select count(*) from admin_invites where coalesce(send_error,'') like '%${PW}%'`) === '0');
const createdAuth = (await captured()).filter((m) => m.path === '/auth/admin/create' && m.body.email === 'yeni.editor@test.local');
check('accept: exactly one Auth user created for the invitee', createdAuth.length === 1);

// resend → the old link stops working; the new one works
await api(admin.token, '/api/admin/users', { action: 'invite', email: 'ikinci@test.local', name: 'TEST İkinci', role: 'finance' });
const tA = await lastInviteToken('ikinci@test.local');
const rs = await api(admin.token, '/api/admin/users', { action: 'resend', email: 'ikinci@test.local' });
const tB = await lastInviteToken('ikinci@test.local');
const oldState = await api(null, '/api/admin/invite', { token: tA });
const newState = await api(null, '/api/admin/invite', { token: tB });
check('resend: a new link is sent; the previous one is revoked', rs.status === 200 && tA !== tB && oldState.json.state === 'revoked' && newState.json.state === 'valid', `${rs.status} ${oldState.json.state} ${newState.json.state}`);
const resendActive = await api(admin.token, '/api/admin/users', { action: 'resend', email: 'yeni.editor@test.local' });
check('resend: refused for an account that is already active', resendActive.status === 409 && resendActive.json.code === 'not_invited');

// expiry
sql(`update admin_invites set expires_at = now() - interval '1 minute' where email = 'ikinci@test.local' and revoked_at is null`);
const exp = await api(null, '/api/admin/invite', { token: tB });
const expAcc = await api(null, '/api/admin/invite', { token: tB, password: PW });
check('expiry: an expired link shows "expired" and cannot be used', exp.json.state === 'expired' && (expAcc.json.state === 'expired' || expAcc.status === 409) && sql(`select status from admin_users where email = 'ikinci@test.local'`) === 'invited');
const listExp = await api(admin.token, '/api/admin/users');
const ikinci = (listExp.json.users as Array<Record<string, unknown>>).find((u) => u.email === 'ikinci@test.local');
check('expiry: the list shows it as an invite (resend / cancel possible)', ikinci?.status === 'invited' && ikinci?.invite_open === true);

// cancel
const rv = await api(admin.token, '/api/admin/users', { action: 'revoke', email: 'ikinci@test.local' });
const afterRv = await api(null, '/api/admin/invite', { token: tB });
check('cancel: the pending invite is removed; its link is invalid; the e-mail can be invited again', rv.status === 200 && afterRv.json.state === 'invalid' && sql(`select count(*) from admin_users where email = 'ikinci@test.local'`) === '0');
const revokeActive = await api(admin.token, '/api/admin/users', { action: 'revoke', email: 'yeni.editor@test.local' });
check('cancel: refused for an active account (use "close access" instead)', revokeActive.status === 409 && sql(`select status from admin_users where email = 'yeni.editor@test.local'`) === 'active');

// failed send is never reported as sent
const failInv = await api(admin.token, '/api/admin/users', { action: 'invite', email: 'fail4xx@test.local', name: 'TEST Gönderilemez', role: 'editor' });
const failRow = sql(`select u.status || '|' || i.send_status || '|' || (i.revoked_at is not null) from admin_users u join admin_invites i using (email) where email = 'fail4xx@test.local'`);
const failList = ((await api(admin.token, '/api/admin/users')).json.users as Array<Record<string, unknown>>).find((u) => u.email === 'fail4xx@test.local');
check('send failure: the API answers with an error (not success); the link is revoked; the list shows "gönderilemedi"', failInv.status === 502 && failInv.json.ok === false && failRow === 'invited|failed|true' && failList?.invite_send_status === 'failed', `${failInv.status} ${failRow}`);
const failResend = await api(admin.token, '/api/admin/users', { action: 'resend', email: 'fail4xx@test.local' });
check('send failure: a failing resend is also reported as failed', failResend.status === 502);
await api(admin.token, '/api/admin/users', { action: 'revoke', email: 'fail4xx@test.local' });

/* ── 3b. Direct creation with a temporary password ─────────────────── */
const TEMP = 'Gecici-Sifre-7731-Kum';
const NEWPW = 'Kendi-Sifrem-9054-Dag';
const mailsBefore = (await captured()).filter((m) => m.path === '/capture/resend').length;
const cr = await api(admin.token, '/api/admin/users', { action: 'create', email: 'Dogrudan@Test.Local', name: 'TEST Doğrudan Editör', role: 'editor', password: TEMP });
const crAuth = (await captured()).filter((m) => m.path === '/auth/admin/create' && m.body.email === 'dogrudan@test.local');
check('create: admin creates an account with a temporary password; NO e-mail is sent', cr.status === 200 && cr.json.created === true && (await captured()).filter((m) => m.path === '/capture/resend').length === mailsBefore && crAuth.length === 1, JSON.stringify(cr.json));
check('create: the response never echoes the password', !JSON.stringify(cr.json).includes(TEMP));
const crRow = sql(`select status || '|' || role || '|' || must_change_password || '|' || created_via || '|' || (email_verified_at is null) || '|' || (user_id is not null) from admin_users where email = 'dogrudan@test.local'`);
check('create: row active, bound to its Auth user, must change password, e-mail NOT marked verified', crRow === 'active|editor|true|direct|true|true', crRow);
const crList = ((await api(admin.token, '/api/admin/users')).json.users as Array<Record<string, unknown>>).find((u) => u.email === 'dogrudan@test.local');
check('create: the list says "must change password" and "e-mail not verified"', crList?.must_change_password === true && crList?.email_verified === false && crList?.created_via === 'direct');
const dTemp = await as('dogrudan@test.local', TEMP);
const dMe = await api(dTemp.token, '/api/admin/me');
const dContent = await canInsertMenu(dTemp, 'temp');
const dRead = await dTemp.db.from('insights').select('id').eq('slug', 'test-usr-draft');
const dApi = await api(dTemp.token, '/api/ai', { action: 'fetch_sources', urls: [] });
const dSettings = await api(dTemp.token, '/api/admin/site-settings');
check('first sign-in: the temporary password signs in, but no role yet (/me → password_change)', dMe.json.allowed === false && dMe.json.reason === 'password_change', JSON.stringify(dMe.json));
check('first sign-in: database and API refuse everything until the password is changed', !dContent && (dRead.data ?? []).length === 0 && dApi.status === 401 && dSettings.status === 401, `content=${dContent} ai=${dApi.status} settings=${dSettings.status}`);
const dSelfClear = await dTemp.db.rpc('users_password_set', { p_email: 'dogrudan@test.local', p_user_id: sql(`select user_id from admin_users where email = 'dogrudan@test.local'`) });
const dSelfUpdate = await dTemp.db.from('admin_users').update({ must_change_password: false }).eq('email', 'dogrudan@test.local').select('email');
check('first sign-in: the account cannot clear its own flag (function server-only, table closed)', Boolean(dSelfClear.error) && (Boolean(dSelfUpdate.error) || (dSelfUpdate.data ?? []).length === 0) && sql(`select must_change_password from admin_users where email = 'dogrudan@test.local'`) === 't');
const wrongCur = await api(dTemp.token, '/api/admin/password', { current: 'yanlis-sifre-000', next: NEWPW });
const weakNew = await api(dTemp.token, '/api/admin/password', { current: TEMP, next: 'kisa' });
const sameNew = await api(dTemp.token, '/api/admin/password', { current: TEMP, next: TEMP });
check('password change: wrong temporary password, weak or unchanged new password refused', wrongCur.json.code === 'wrong_current' && weakNew.json.code === 'weak_password' && sameNew.json.code === 'same_password', `${wrongCur.json.code} ${weakNew.json.code} ${sameNew.json.code}`);
const changed = await api(dTemp.token, '/api/admin/password', { current: TEMP, next: NEWPW });
const dMe2 = await api(dTemp.token, '/api/admin/me');
check('password change: succeeds; the same session now has its role (editor) and content access', changed.status === 200 && dMe2.json.role === 'editor' && (await canInsertMenu(dTemp, 'after-pw')), JSON.stringify(changed.json));
const tempAgain = await login('dogrudan@test.local', TEMP);
const newLogin = await login('dogrudan@test.local', NEWPW);
check('password change: the temporary password stops working; the new one works', 'error' in tempAgain && !('error' in newLogin));
const notRequired = await api(admin.token, '/api/admin/password', { current: 'itest-admin-pw', next: NEWPW });
check('password change: refused for accounts that have no pending change', notRequired.status === 409 && notRequired.json.code === 'not_required');
// the row is bound to ITS Auth user: another Auth identity with the same e-mail gets nothing
sql(`update admin_users set user_id = gen_random_uuid() where email = 'dogrudan@test.local'`);
const otherId = await api((newLogin as Who).token, '/api/admin/me');
sql(`update admin_users set user_id = '${(await (newLogin as Who).db.auth.getUser()).data.user!.id}' where email = 'dogrudan@test.local'`);
check('binding: a session of a different Auth user with the same e-mail has no role', otherId.json.allowed === false && (await api((newLogin as Who).token, '/api/admin/me')).json.role === 'editor');
// duplicates: existing panel account / pending invite / Auth user without panel account
const dupCreate = await api(admin.token, '/api/admin/users', { action: 'create', email: 'dogrudan@test.local', name: 'X', role: 'admin', password: TEMP });
await api(admin.token, '/api/admin/users', { action: 'invite', email: 'bekleyen@test.local', name: 'TEST Bekleyen', role: 'finance' });
const dupPending = await api(admin.token, '/api/admin/users', { action: 'create', email: 'bekleyen@test.local', name: 'X', role: 'admin', password: TEMP });
const authCountBefore = (await captured()).filter((m) => m.path === '/auth/admin/create').length;
const dupAuth = await api(admin.token, '/api/admin/users', { action: 'create', email: 'intruder@test.local', name: 'X', role: 'admin', password: TEMP });
check('create: no second account — existing panel account, pending invite and an existing Auth user are all refused with clear reasons', dupCreate.json.code === 'exists' && dupPending.json.code === 'pending_invite' && dupAuth.json.code === 'auth_exists' && sql(`select count(*) from admin_users where email = 'intruder@test.local'`) === '0' && (await captured()).filter((m) => m.path === '/auth/admin/create').length === authCountBefore && sql(`select role from admin_users where email = 'dogrudan@test.local'`) === 'editor', `${dupCreate.json.code} ${dupPending.json.code} ${dupAuth.json.code}`);
await api(admin.token, '/api/admin/users', { action: 'revoke', email: 'bekleyen@test.local' });
const weakTemp = await api(admin.token, '/api/admin/users', { action: 'create', email: 'zayif@test.local', name: 'X', role: 'editor', password: 'kisa' });
check('create: a weak temporary password is refused before anything is created', weakTemp.status === 400 && sql(`select count(*) from admin_users where email = 'zayif@test.local'`) === '0' && !(await captured()).some((m) => m.path === '/auth/admin/create' && m.body.email === 'zayif@test.local'));
const edCreate = await api(ed.token, '/api/admin/users', { action: 'create', email: 'edcreate@test.local', name: 'X', role: 'admin', password: TEMP });
const finCreate = await api(fin.token, '/api/admin/users', { action: 'create', email: 'fincreate@test.local', name: 'X', role: 'admin', password: TEMP });
const edDbCreate = await ed.db.rpc('users_create', { p_email: 'edcreate@test.local', p_name: 'X', p_role: 'admin', p_user_id: '11111111-1111-4111-8111-111111111111' });
check('create: editor and finance cannot create accounts (API and database function)', edCreate.status === 401 && finCreate.status === 401 && Boolean(edDbCreate.error) && sql(`select count(*) from admin_users where email in ('edcreate@test.local', 'fincreate@test.local')`) === '0');
// partial failure: the role assignment fails after the Auth user exists → Auth user removed (or blocked), request fails
sql(`create or replace function itest_fail_bind() returns trigger language plpgsql as $f$ begin if new.email like 'partial%' then raise exception 'test: bind failed'; end if; return new; end $f$;
     drop trigger if exists itest_fail_bind on admin_users; create trigger itest_fail_bind before insert on admin_users for each row execute function itest_fail_bind();`);
const part = await api(admin.token, '/api/admin/users', { action: 'create', email: 'partial@test.local', name: 'TEST Yarım', role: 'admin', password: TEMP });
const partLogin = await login('partial@test.local', TEMP);
const partDeleted = (await captured()).some((m) => m.path === '/auth/admin/delete' && m.body.email === 'partial@test.local');
check('partial failure: not reported as success; no panel row; the new Auth user is deleted (cannot sign in)', part.json.ok === false && sql(`select count(*) from admin_users where email = 'partial@test.local'`) === '0' && partDeleted && 'error' in partLogin, JSON.stringify(part.json));
const part2 = await api(admin.token, '/api/admin/users', { action: 'create', email: 'partial-nodelete@test.local', name: 'TEST Yarım 2', role: 'admin', password: TEMP });
const part2Login = await login('partial-nodelete@test.local', TEMP);
check('partial failure: if the Auth user cannot be deleted it is blocked and the admin is told to remove it', part2.status === 500 && part2.json.code === 'partial' && 'error' in part2Login && /user_banned|banned/i.test((part2Login as { error: string }).error) && sql(`select count(*) from admin_users where email = 'partial-nodelete@test.local'`) === '0', `${JSON.stringify(part2.json)} ${'error' in part2Login ? (part2Login as { error: string }).error : 'signed in'}`);
sql(`drop trigger if exists itest_fail_bind on admin_users; drop function if exists itest_fail_bind();`);
// an admin created directly does not count as an effective admin before the password change
const crAdmin = await api(admin.token, '/api/admin/users', { action: 'create', email: 'yeni.yonetici@test.local', name: 'TEST Yeni Yönetici', role: 'admin', password: TEMP });
let lastWithPending = '';
try { sql(`update admin_users set role = 'editor' where email = 'admin@test.local'`); } catch (e) { lastWithPending = String((e as Error).message); }
check('last admin: an admin who has not changed the temporary password does not count — the only effective admin stays protected', crAdmin.status === 200 && /Son etkin yönetici/.test(lastWithPending));
// no password anywhere it must not be
const appLog = (() => { try { return execFileSync('cat', [`${process.env.ITEST_STATE || '/var/tmp/yoca-itest-gw'}.app.log`], { encoding: 'utf8' }); } catch { return ''; } })();
const gwFiles = execFileSync('bash', ['-c', `cat ${process.env.ITEST_STATE || '/var/tmp/yoca-itest-gw'}.log ${process.env.ITEST_STATE || '/var/tmp/yoca-itest-gw'}/captured.jsonl 2>/dev/null || true`], { encoding: 'utf8' });
const dbHits = sql(`select count(*) from audit_log where coalesce(changes::text,'') || coalesce(label,'') ~ '${TEMP}|${NEWPW}'`) + sql(`select count(*) from admin_users where row_to_json(admin_users)::text ~ '${TEMP}|${NEWPW}'`) + sql(`select count(*) from admin_invites where row_to_json(admin_invites)::text ~ '${TEMP}|${NEWPW}'`);
check('secrets: neither the temporary nor the new password is in audit log, user table, invites, app log, gateway log or captured requests', dbHits === '000' && !appLog.includes(TEMP) && !appLog.includes(NEWPW) && !gwFiles.includes(TEMP) && !gwFiles.includes(NEWPW), `db=${dbHits} app=${appLog.includes(TEMP) || appLog.includes(NEWPW)} gw=${gwFiles.includes(TEMP) || gwFiles.includes(NEWPW)}`);

// an e-mail that already has an Auth user (but no panel account): the link proves the inbox; no second Auth user
await api(admin.token, '/api/admin/users', { action: 'invite', email: 'intruder@test.local', name: 'TEST Var Olan', role: 'finance' });
const tI = await lastInviteToken('intruder@test.local');
const accI = await api(null, '/api/admin/invite', { token: tI, password: PW });
const intrNew = await login('intruder@test.local', PW);
const intrOld = await login('intruder@test.local', 'itest-intruder-pw');
check('existing Auth user: accepted without creating a second Auth user; the new password works, the old one not', accI.status === 200 && !('error' in intrNew) && 'error' in intrOld && (await captured()).filter((m) => m.path === '/auth/admin/create' && m.body.email === 'intruder@test.local').length === 0);

/* ── 4. Role change with an OPEN session ───────────────────────────── */
const oldToken = newEd; // signed in as editor before the change
const toFin = await api(admin.token, '/api/admin/users', { action: 'role', email: 'yeni.editor@test.local', role: 'finance' });
const afterMe = await api(oldToken.token, '/api/admin/me');
const afterContent = await canInsertMenu(oldToken, 'after-role');
const afterFin = await oldToken.db.from('fin_expenses').select('id').limit(1);
const afterApi = await api(oldToken.token, '/api/ai', { action: 'fetch_sources', urls: [] });
check('role change: the open session (same token) immediately has the NEW rights only', toFin.status === 200 && afterMe.json.role === 'finance' && !afterContent && !afterFin.error && afterApi.status === 401, `${afterMe.json.role} content=${afterContent} ai=${afterApi.status}`);
const toSelf = await api(admin.token, '/api/admin/users', { action: 'role', email: 'admin@test.local', role: 'editor' });
check('role change: an admin cannot change their own role here', toSelf.status === 409 && toSelf.json.code === 'self' && sql(`select role from admin_users where email = 'admin@test.local'`) === 'admin');

/* ── 5. Close access with an OPEN session; history kept; reopen ───── */
await oldToken.db.from('fin_expenses').select('id').limit(1); // (finance now)
const auditBefore = sql(`select count(*) from audit_log`);
const off = await api(admin.token, '/api/admin/users', { action: 'access', email: 'yeni.editor@test.local', enabled: false });
const offMe = await api(oldToken.token, '/api/admin/me');
const offFin = await oldToken.db.from('fin_expenses').select('id').limit(1);
const offFinRows = (offFin.data ?? []).length;
const offLogin = await login('yeni.editor@test.local', PW);
const offRefresh = await oldToken.db.auth.refreshSession({ refresh_token: oldToken.refresh });
check('close access: the open session is refused by the API and the database at once', off.status === 200 && !off.json.warning && offMe.json.allowed === false && (Boolean(offFin.error) || offFinRows === 0) && !(await canInsertMenu(oldToken, 'after-off')), `${JSON.stringify(off.json)} me=${JSON.stringify(offMe.json)}`);
check('close access: sign-in and token refresh are refused (Auth ban)', 'error' in offLogin && Boolean(offRefresh.error));
check('close access: nothing is deleted (account row + its history stay)', sql(`select status from admin_users where email = 'yeni.editor@test.local'`) === 'disabled' && Number(sql(`select count(*) from audit_log`)) > Number(auditBefore) && sql(`select count(*) from audit_log where actor = 'yeni.editor@test.local' or entity_id = 'yeni.editor@test.local'`) !== '0');
const listOff = ((await api(admin.token, '/api/admin/users')).json.users as Array<Record<string, unknown>>).find((u) => u.email === 'yeni.editor@test.local');
check('close access: the list shows "Erişim kapalı" state (disabled, kept)', listOff?.status === 'disabled');
const on = await api(admin.token, '/api/admin/users', { action: 'access', email: 'yeni.editor@test.local', enabled: true });
const onLogin = await login('yeni.editor@test.local', PW);
check('reopen: sign-in works again with the same password, with the current role', on.status === 200 && !('error' in onLogin) && (await api((onLogin as Who).token, '/api/admin/me')).json.role === 'finance');
const offSelf = await api(admin.token, '/api/admin/users', { action: 'access', email: 'admin@test.local', enabled: false });
check('close access: an admin cannot close their own access here', offSelf.status === 409 && offSelf.json.code === 'self');

/* ── 6. Last active admin ──────────────────────────────────────────── */
let lastAdmin = '';
try { sql(`update admin_users set role = 'editor' where email = 'admin@test.local'`); } catch (e) { lastAdmin = String((e as Error).message); }
let lastAdminDel = '';
try { sql(`delete from admin_users where email = 'admin@test.local'`); } catch (e) { lastAdminDel = String((e as Error).message); }
let lastAdminOff = '';
try { sql(`update admin_users set status = 'disabled' where email = 'admin@test.local'`); } catch (e) { lastAdminOff = String((e as Error).message); }
check('last admin: demoting, disabling or deleting the only active admin is refused (even from SQL)', /Son etkin yönetici/.test(lastAdmin) && /Son etkin yönetici/.test(lastAdminDel) && /Son etkin yönetici/.test(lastAdminOff) && sql(`select role || status from admin_users where email = 'admin@test.local'`) === 'adminactive');
// a second admin through the invite flow; two admins demoting each other at the same time → one must fail
await api(admin.token, '/api/admin/users', { action: 'invite', email: 'admin2@test.local', name: 'TEST Yönetici 2', role: 'admin' });
await api(null, '/api/admin/invite', { token: await lastInviteToken('admin2@test.local'), password: PW });
const admin2 = await as('admin2@test.local', PW);
const [d1, d2] = await Promise.all([
  api(admin.token, '/api/admin/users', { action: 'role', email: 'admin2@test.local', role: 'editor' }),
  api(admin2.token, '/api/admin/users', { action: 'role', email: 'admin@test.local', role: 'editor' }),
]);
const activeAdmins = sql(`select count(*) from admin_users where role = 'admin' and status = 'active' and not must_change_password`);
const st = [d1.status, d2.status].sort();
check('last admin: two admins demoting each other concurrently → exactly one succeeds, one admin remains', st[0] === 200 && [401, 403, 409].includes(st[1]) && activeAdmins === '1', `${d1.status}/${d1.json.code} ${d2.status}/${d2.json.code} admins=${activeAdmins}`);
sql(`update admin_users set role = 'admin' where email in ('admin@test.local', 'admin2@test.local')`);

/* ── 7. Audit log ──────────────────────────────────────────────────── */
const actions = sql(`select string_agg(distinct action, ',' order by action) from audit_log where entity = 'admin_users'`);
const want = ['create', 'disable', 'enable', 'invite', 'invite_accept', 'invite_resend', 'invite_revoke', 'invite_send_failed', 'password_changed', 'role_change'];
check('audit: every user action is in İşlem geçmişi (create, password change, invite, resend, cancel, failed send, accept, role, close, reopen)', want.every((a) => actions.split(',').includes(a)), actions);
check('audit: actor is the admin (or the invitee for acceptance)', sql(`select count(*) from audit_log where entity = 'admin_users' and action = 'role_change' and actor = 'admin@test.local'`) !== '0' && sql(`select count(*) from audit_log where entity = 'admin_users' and action = 'invite_accept' and actor = 'davet: yeni.editor@test.local'`) === '1');
const adminAudit = await rows(admin, 'audit_log');
check('audit: readable by admins only (editor/finance get nothing)', adminAudit > 0 && (await rows(ed, 'audit_log')) <= 0 && (await rows(fin, 'audit_log')) <= 0);

// leave the test Auth users as built (other suites use the built-in passwords)
await fetch(`${GW}/capture/reset?users=1`);
sql(`delete from admin_users where email in ('intruder@test.local'); delete from menus where title like 'TEST USR%';`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
