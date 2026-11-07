/**
 * LOCAL test stack only (gateway :54331 with capture endpoints, app :3190).
 * Recurring periods are created by the cron alone (nobody opens Giderler) and
 * enter the same team digest; a failed roll is reported, not silent.
 * Synthetic data marked "TEST CRON"; nothing reaches a real inbox or chat.
 */
import { execFileSync } from 'node:child_process';

const APP = 'http://localhost:3190';
const GW = 'http://127.0.0.1:54331';
const CRON = process.env.CRON_SECRET ?? '';
const PSQL = ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc'];
const sql = (q: string) => execFileSync('psql', [...PSQL, q], { encoding: 'utf8' }).trim();
const results: Array<{ name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const runCron = async () => { const r = await fetch(`${APP}/api/cron/ops`, { headers: { Authorization: `Bearer ${CRON}` } }); return { ...((await r.json()) as Record<string, any>), httpStatus: r.status }; };
const captured = async () => (await (await fetch(`${GW}/capture/list`)).json()) as Array<Record<string, any>>;
const clean = () => sql(`set session_replication_role = replica;
  delete from fin_periods where expense_id in (select id from fin_expenses where title like 'TEST CRON%');
  delete from fin_expenses where title like 'TEST CRON%';
  delete from ops_notifications where dedupe_key like 'digest:%';`);

clean();
const today = sql(`select (now() at time zone 'Europe/Istanbul')::date`);
const plus = (d: number) => sql(`select ('${today}'::date + ${d})::text`);
const monthAgo = (d: number) => sql(`select (('${today}'::date + ${d}) - interval '1 month')::date::text`);
// fixed monthly: last period a month ago (late), next one due in 3 days — not created yet
const fixedFirst = monthAgo(3);
// variable (amount unknown): next one due in 5 days
const varFirst = monthAgo(5);
sql(`insert into fin_expenses (title, category, kind, recurrence, first_due_on, amount, currency) values
  ('TEST CRON sabit aylık', 'internet', 'recurring', 'monthly', '${fixedFirst}', 777, 'TRY'),
  ('TEST CRON değişken aylık', 'utilities', 'recurring', 'monthly', '${varFirst}', null, 'TRY')`);
const count = (t: string) => Number(sql(`select count(*) from fin_periods p join fin_expenses e on e.id = p.expense_id where e.title = '${t}'`));
check('setup: only the first period exists (nobody opened the page, nothing rolled)', count('TEST CRON sabit aylık') === 1 && count('TEST CRON değişken aylık') === 1);

await fetch(`${GW}/capture/reset`, { method: 'POST' });
sql(`update cockpit_settings set value = jsonb_set(jsonb_set(value, '{email_to}', '"ekip-test@ornek.example"'), '{telegram_chat_id}', '"-100777"') where key = 'notify'`);
const r1 = await runCron();
check('cron: rolls the missing periods itself and reports a clean success', (r1.expenses?.rolled ?? 0) >= 2 && r1.expenses?.error === null && r1.ok === true && r1.partial === false && r1.httpStatus === 200, JSON.stringify(r1.expenses));
const next = sql(`select string_agg(e.title || ' #' || p.seq || ' ' || p.due_on || ' ' || coalesce(p.amount::text, 'bekleniyor'), ' | ' order by e.title, p.seq) from fin_periods p join fin_expenses e on e.id = p.expense_id where e.title like 'TEST CRON%'`);
check('cron: next fixed period due in 3 days created with the fixed amount; variable one without an amount', next.includes(`TEST CRON sabit aylık #1 ${plus(3)} 777.00`) && next.includes(`TEST CRON değişken aylık #1 ${plus(5)} bekleniyor`), next);
check('cron: created by "sistem" (no user session)', sql(`select string_agg(distinct p.created_by, ',') from fin_periods p join fin_expenses e on e.id = p.expense_id where e.title like 'TEST CRON%' and p.seq > 0`) === 'sistem');
const caps = await captured();
const mails = caps.filter((c) => c.path === '/capture/resend');
const text = String(mails[0]?.body?.text ?? '');
const giderler = text.slice(text.indexOf('GİDERLER'));
check('digest: the new period (due in 3 days) is in the same team digest, Giderler section', mails.length === 1 && new RegExp(`TEST CRON sabit aylık — vade ${plus(3)}`).test(giderler), `mails=${mails.length}`);
check('digest: the late previous period is listed as late', new RegExp(`TEST CRON sabit aylık — gecikti ${fixedFirst}`).test(giderler));
check('digest: unknown amount listed as "tutar bilinmiyor" (no debt invented)', /TEST CRON değişken aylık — vade [^\n]*tutar bilinmiyor/.test(giderler));
check('digest: only the team address', mails.every((m) => JSON.stringify(m.body.to) === '["ekip-test@ornek.example"]'));
const r2 = await runCron();
check('cron: second run is idempotent (no new periods, nothing sent again)', r2.expenses?.rolled === 0 && (await captured()).filter((c) => c.path === '/capture/resend').length === 1, JSON.stringify(r2.expenses));

// failure is visible: take the function away from service_role for a moment
sql(`set session_replication_role = replica; delete from ops_notifications where dedupe_key like 'digest:%'`);
sql(`revoke execute on function public.fin_roll_periods(date) from service_role`);
await fetch(`${GW}/capture/reset`, { method: 'POST' });
const r3 = await runCron();
const sends = async () => { const c = await captured(); return { mail: c.filter((x) => x.path === '/capture/resend').length, tg: c.filter((x) => String(x.path).includes('/sendMessage')).length }; };
const s3 = await sends();
check('cron: a failed roll is NOT reported as success (ok:false, partial:true, HTTP 500) and the rest of the digest is still sent', typeof r3.expenses?.error === 'string' && /dönemler oluşturulamadı/.test(r3.expenses.error) && r3.ok === false && r3.partial === true && r3.httpStatus === 500 && r3.digest === 'sent' && s3.mail === 1 && s3.tg === 1, JSON.stringify({ ok: r3.ok, partial: r3.partial, http: r3.httpStatus, digest: r3.digest, expenses: r3.expenses, sends: s3 }));
// the HTTP 500 is retried (the 15:00 run, or a manual re-run) while the error is still there → nothing sent again
const r4 = await runCron();
const s4 = await sends();
check('retry after a partial run, error still there: still ok:false / 500, the e-mail and Telegram are NOT sent again', r4.httpStatus === 500 && r4.partial === true && r4.digest === 'already' && s4.mail === 1 && s4.tg === 1, JSON.stringify({ http: r4.httpStatus, digest: r4.digest, sends: s4 }));
const digestRow = sql(`select status || '|' || attempts || '|' || (payload->'channels'->'email'->>'state') || '|' || (payload->'channels'->'telegram'->>'state') from ops_notifications where dedupe_key like 'digest:%'`);
check('the digest row stays "sent" after the partial runs (no retry planned for delivered channels)', digestRow === 'sent|1|sent|sent', digestRow);
// the error is fixed → the next run rolls the periods, reports success, still sends nothing new that day
sql(`grant execute on function public.fin_roll_periods(date) to service_role`);
const r5 = await runCron();
const s5 = await sends();
check('after the fix: ok:true / 200, periods rolled again, no duplicate e-mail or Telegram the same day', r5.httpStatus === 200 && r5.ok === true && r5.expenses?.error === null && r5.digest === 'already' && s5.mail === 1 && s5.tg === 1, JSON.stringify({ http: r5.httpStatus, rolled: r5.expenses?.rolled, digest: r5.digest, sends: s5 }));

// partial run AND one channel refused (Telegram 429 on the first try): the 15:00 retry sends ONLY the missing channel
sql(`set session_replication_role = replica; delete from ops_notifications where dedupe_key like 'digest:%'`);
sql(`update cockpit_settings set value = jsonb_set(value, '{telegram_chat_id}', '"tg-flaky"') where key = 'notify'`);
await fetch(`${GW}/capture/reset`, { method: 'POST' });
sql(`revoke execute on function public.fin_roll_periods(date) from service_role`);
const q1 = await runCron();
const t1 = await sends();
check('partial + Telegram refused: HTTP 500, e-mail sent once, Telegram waits for retry', q1.httpStatus === 500 && q1.channels?.email === 'sent' && q1.channels?.telegram === 'failed' && t1.mail === 1, JSON.stringify({ http: q1.httpStatus, channels: q1.channels, sends: t1 }));
sql(`update ops_notifications set next_attempt_at = now() - interval '1 minute' where dedupe_key like 'digest:%' and next_attempt_at is not null`);
const q2 = await runCron();
const t2 = await sends();
const delivered = (await captured()).filter((c) => String(c.path).includes('/sendMessage') && c.tg === 'delivered').length;
check('15:00 retry (error still there): Telegram delivered once, e-mail NOT sent again; still reported as partial', q2.httpStatus === 500 && t2.mail === 1 && delivered === 1, JSON.stringify({ http: q2.httpStatus, channels: q2.channels, sends: t2, delivered }));
const q3 = await runCron();
const t3 = await sends();
check('further runs the same day send nothing', q3.digest === 'already' && t3.mail === t2.mail && t3.tg === t2.tg, JSON.stringify({ digest: q3.digest, sends: t3 }));
sql(`grant execute on function public.fin_roll_periods(date) to service_role`);
sql(`update cockpit_settings set value = jsonb_set(value, '{telegram_chat_id}', '"-100777"') where key = 'notify'`);

clean();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
