// TEST ONLY: local test database (setup-db.sh, v27 applied). Synthetic rows; cleans up after itself.
// Database guarantees behind the SEO panel:
//  - seo_audit_acquire: exactly one running audit per site, also for two concurrent sessions
//    ("different instances"); a run older than the timeout is expired and a new one may start;
//  - seo_weekly_replace: a week's set is replaced in one transaction (no leftovers; a failing
//    row leaves the previous set intact; identical rerun = identical rows).
// Run: node tests/integration/seo/seo-db.cjs
const { execFileSync, spawn } = require('node:child_process');
const base = ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest'];
const sql = (q) => execFileSync('psql', [...base, '-v', 'ON_ERROR_STOP=1', '-Atqc', q], { encoding: 'utf8' }).trim();
const sqlFails = (q) => { try { execFileSync('psql', [...base, '-v', 'ON_ERROR_STOP=1', '-Atqc', q], { stdio: 'pipe' }); return false; } catch { return true; } };
const psqlAsync = (q) => new Promise((ok) => { const p = spawn('psql', [...base, '-Atqc', q]); let out = ''; p.stdout.on('data', (d) => (out += d)); p.on('close', () => ok(out.trim())); });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`); };

(async () => {
  const site = sql("select id from seo_sites where domain = 'yoca.net'");
  sql(`delete from seo_audit_runs where site_id = '${site}'`);
  const acquire = (who) => `select coalesce(seo_audit_acquire('${site}', 'fixture', '${who}', 180)::text, 'NULL')`;

  // 1. sequential: the second acquire while the first is running gets NULL
  const first = sql(acquire('a'));
  const second = sql(acquire('b'));
  check('acquire: second call while a run is running → NULL', /^[0-9a-f-]{36}$/.test(first) && second === 'NULL', `${first} / ${second}`);
  check('partial unique index forbids a second running row', sqlFails(`insert into seo_audit_runs (site_id, status) values ('${site}', 'running')`));
  sql(`update seo_audit_runs set status = 'done', finished_at = now() where id = '${first}'`);

  // 2. concurrent sessions (two server instances): exactly one acquires
  const a = psqlAsync(`begin; ${acquire('A')}; select pg_sleep(1.5); commit;`);
  await new Promise((r) => setTimeout(r, 400));
  const b = psqlAsync(acquire('B'));
  const [ra, rb] = await Promise.all([a, b]);
  const ids = [ra, rb].map((x) => x.split('\n')[0]);
  check('concurrent acquire from two sessions: exactly one run id, the other NULL', ids.filter((x) => /^[0-9a-f-]{36}$/.test(x)).length === 1 && ids.includes('NULL'), JSON.stringify(ids));
  check('exactly one running row', sql(`select count(*) from seo_audit_runs where site_id = '${site}' and status = 'running'`) === '1');

  // 3. a stale run (older than the timeout) is expired by the next acquire
  sql(`update seo_audit_runs set started_at = now() - interval '10 minutes' where site_id = '${site}' and status = 'running'`);
  const stale = sql(`select id from seo_audit_runs where site_id = '${site}' and status = 'running'`);
  const fresh = sql(acquire('C'));
  check('stale running run expired → new run acquired', /^[0-9a-f-]{36}$/.test(fresh) && fresh !== stale);
  check('expired run marked failed with a timeout reason', sql(`select status || '|' || (limit_reason like 'Zaman aşımı%')::text || '|' || (finished_at is not null)::text from seo_audit_runs where id = '${stale}'`) === 'failed|true|true');
  check('a run younger than the timeout is NOT expired', sql(acquire('D')) === 'NULL' && sql(`select status from seo_audit_runs where id = '${fresh}'`) === 'running');
  sql(`delete from seo_audit_runs where site_id = '${site}'`);

  // 4. weekly replace
  const week = '2026-10-05';
  const row = (dimension, key, clicks, extra = {}) => ({ dimension, key, filters: 'country=all;device=all;type=web;state=final', clicks, impressions: clicks * 10, ctr: 0.1, position: 3.2, days_with_data: 7, data_through: '2026-10-11', ...extra });
  const call = (rows) => sql(`select seo_weekly_replace('${site}', '${week}', '${JSON.stringify(rows).replace(/'/g, "''")}'::jsonb)`);
  const state = () => sql(`select string_agg(dimension || ':' || key || ':' || clicks, ',' order by dimension, key) from seo_weekly where site_id = '${site}' and week_start = '${week}'`);
  sql(`delete from seo_weekly where site_id = '${site}' and week_start in ('${week}', '2026-09-28')`);
  sql(`select seo_weekly_replace('${site}', '2026-09-28', '${JSON.stringify([row('total', '', 77)])}'::jsonb)`);
  const five = [row('total', '', 50), row('query', 'a', 10), row('query', 'b', 9), row('query', 'c', 8), row('page', '/tr', 20)];
  check('replace: first set stored (5 rows)', call(five) === '5');
  const s1 = state();
  check('replace: identical rerun → identical rows', call(five) === '5' && state() === s1);
  const three = [row('total', '', 40), row('query', 'a', 12), row('page', '/tr', 18)];
  check('replace: shrinking set → exactly the new 3 rows, no leftovers', call(three) === '3' && state() === 'page:/tr:18,query:a:12,total::40', state());
  const s2 = state();
  const broken = [row('total', '', 1), row('query', 'x', 1), row('query', 'y', 1, { days_with_data: 9 }), row('page', '/en', 1)];
  check('replace: a failing row in the middle raises an error', sqlFails(`select seo_weekly_replace('${site}', '${week}', '${JSON.stringify(broken)}'::jsonb)`));
  check('replace: after the failure the previous complete set is intact', state() === s2, state());
  check('replace: empty set refused (never wipes a week)', sqlFails(`select seo_weekly_replace('${site}', '${week}', '[]'::jsonb)`) && state() === s2);
  check('replace: other weeks untouched', sql(`select clicks from seo_weekly where site_id = '${site}' and week_start = '2026-09-28'`) === '77');
  sql(`delete from seo_weekly where site_id = '${site}' and week_start in ('${week}', '2026-09-28')`);

  // 5. functions are not callable by anon
  check('anon cannot execute the SEO functions', sql(`select has_function_privilege('anon', 'public.seo_audit_acquire(uuid, text, text, integer)', 'execute')::text || has_function_privilege('anon', 'public.seo_weekly_replace(uuid, date, jsonb)', 'execute')::text`) === 'falsefalse');

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
