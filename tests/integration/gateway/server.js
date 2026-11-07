// Isolated test gateway: a PostgREST-compatible subset + Supabase-style auth on a LOCAL
// Postgres (real RLS, triggers, constraints), plus a capture server for e-mail/Telegram.
// Test only — never points at production.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
// Like PostgREST: timestamptz as ISO text with microseconds (not a JS Date with milliseconds).
types.setTypeParser(1082, (v) => v); // like PostgREST: date as YYYY-MM-DD
types.setTypeParser(1184, (v) => v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));

const PORT = Number(process.env.GW_PORT || 54331);
const SECRET = process.env.ITEST_JWT_SECRET || 'itest-secret-not-for-production-0123456789';
const pool = new Pool({ host: process.env.ITEST_DIR || '/var/tmp/yoca-itest', port: Number(process.env.ITEST_PORT || 54339), user: 'postgres', database: process.env.ITEST_DB || 'itest', max: 8 });
const STATE = process.env.ITEST_STATE || '/var/tmp/yoca-itest-gw';
fs.mkdirSync(STATE + '/files', { recursive: true });
const CAPTURE_FILE = STATE + '/captured.jsonl';
const FILES = STATE + '/files';

// ── JWT (HS256) ───────────────────────────────────────────────
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function sign(payload) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = String(token || '').split('.');
  if (!h || !b || !s) return null;
  const expected = b64u(crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest());
  if (expected !== s) return null;
  const payload = JSON.parse(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}
const USERS = {
  'admin@test.local': { id: '11111111-1111-4111-8111-111111111111', password: process.env.ITEST_ADMIN_PW || 'itest-admin-pw' },
  'intruder@test.local': { id: '22222222-2222-4222-8222-222222222222', password: process.env.ITEST_INTRUDER_PW || 'itest-intruder-pw' },
  'finance@test.local': { id: '33333333-3333-4333-8333-333333333333', password: process.env.ITEST_FINANCE_PW || 'itest-finance-pw' },
};
function session(email) {
  const u = USERS[email];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token: sign({ sub: u.id, email, role: 'authenticated', aud: 'authenticated', exp }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `r-${email}`, user };
}

// ── helpers ───────────────────────────────────────────────────
const qi = (id) => `"${String(id).replace(/"/g, '""')}"`;
function colExpr(key, alias = 't') {
  // json paths: a->>b, a->b->>c
  const parts = key.split(/(->>|->)/);
  let out = `${alias}.${qi(parts[0])}`;
  for (let i = 1; i < parts.length; i += 2) out += `${parts[i]}'${parts[i + 1].replace(/'/g, "''")}'`;
  return out;
}
function splitTop(str, sep = ',') {
  const out = []; let depth = 0; let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}
async function fkBetween(client, from, to) {
  const r = await client.query(
    `select a.attname as col, af.attname as ref from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
      where c.contype = 'f' and c.conrelid = $1::regclass and c.confrelid = $2::regclass limit 1`,
    [`public.${from}`, `public.${to}`],
  );
  return r.rows[0] || null;
}
async function selectList(client, table, select, alias = 't') {
  const items = splitTop(select || '*');
  const cols = [];
  for (const item of items) {
    const m = item.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/s);
    if (m) {
      const [, as, rel, inner] = m;
      const sub = `e_${rel}`;
      const innerCols = await selectList(client, rel, inner, sub);
      const many = await fkBetween(client, table, rel); // table.fk → rel (many-to-one)
      if (many) {
        cols.push(`(select row_to_json(x) from (select ${innerCols} from public.${qi(rel)} ${sub} where ${sub}.${qi(many.ref)} = ${alias}.${qi(many.col)}) x) as ${qi(as || rel)}`);
      } else {
        const one = await fkBetween(client, rel, table); // rel.fk → table (one-to-many)
        if (!one) throw Object.assign(new Error(`no relationship ${table} ↔ ${rel}`), { code: 'PGRST200' });
        cols.push(`coalesce((select json_agg(x) from (select ${innerCols} from public.${qi(rel)} ${sub} where ${sub}.${qi(one.col)} = ${alias}.${qi(one.ref)}) x), '[]') as ${qi(as || rel)}`);
      }
    } else if (item === '*') cols.push(`${alias}.*`);
    else {
      const [as, col] = item.includes(':') ? item.split(':') : [null, item];
      cols.push(`${colExpr(col, alias)} as ${qi(as || col.split(/->>|->/).pop())}`);
    }
  }
  return cols.join(', ');
}
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function whereClause(params, values) {
  const conds = [];
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    // PostgREST logical filter: or=(col.op.val,col.op.val) (test gateway: one level, no nested and/or)
    if (key === 'or' || key === 'and') {
      const parts = splitTop(raw.replace(/^\(|\)$/g, '')).map((part) => {
        const d = part.indexOf('.');
        const sub = whereClause([[part.slice(0, d), part.slice(d + 1)]], values);
        return sub.replace(/^where /, '');
      });
      conds.push(`(${parts.join(key === 'or' ? ' or ' : ' and ')})`);
      continue;
    }
    let v = raw; let neg = false;
    if (v.startsWith('not.')) { neg = true; v = v.slice(4); }
    const dot = v.indexOf('.');
    const op = v.slice(0, dot); const val = v.slice(dot + 1);
    const col = colExpr(key);
    let c;
    const p = (x) => { values.push(x); return `$${values.length}`; };
    switch (op) {
      case 'eq': c = `${col} = ${p(val)}`; break;
      case 'neq': c = `${col} <> ${p(val)}`; break;
      case 'gt': c = `${col} > ${p(val)}`; break;
      case 'gte': c = `${col} >= ${p(val)}`; break;
      case 'lt': c = `${col} < ${p(val)}`; break;
      case 'lte': c = `${col} <= ${p(val)}`; break;
      case 'like': c = `${col}::text like ${p(val.replace(/\*/g, '%'))}`; break;
      case 'ilike': c = `${col}::text ilike ${p(val.replace(/\*/g, '%'))}`; break;
      case 'is': c = `${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`; break;
      case 'in': {
        const list = splitTop(val.replace(/^\(|\)$/g, '')).map((x) => x.replace(/^"|"$/g, ''));
        c = `${col}::text = any(${p(list)}::text[])`; break;
      }
      case 'cs': c = `${col} @> ${p(val)}`; break;
      default: throw Object.assign(new Error(`unsupported operator ${op}`), { code: 'PGRST100' });
    }
    conds.push(neg ? `not (${c})` : c);
  }
  return conds.length ? `where ${conds.join(' and ')}` : '';
}
function orderClause(order) {
  if (!order) return '';
  return 'order by ' + splitTop(order).map((part) => {
    const [col, ...mods] = part.split('.');
    return `${colExpr(col)} ${mods.includes('desc') ? 'desc' : 'asc'}${mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : ''}`;
  }).join(', ');
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range', ...headers });
  res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body));
}
const readBody = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => ok(d)); });

async function rest(req, res, url) {
  const table = decodeURIComponent(url.pathname.replace('/rest/v1/', ''));
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers.apikey;
  const claims = verify(auth);
  if (!claims) return send(res, 401, { code: 'PGRST301', message: 'JWT invalid' });
  const role = ['anon', 'authenticated', 'service_role'].includes(claims.role) ? claims.role : 'anon';
  const prefer = req.headers.prefer || '';
  const wantObject = (req.headers.accept || '').includes('vnd.pgrst.object');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    if (table.startsWith('rpc/')) {
      // PostgREST-style RPC subset: POST /rest/v1/rpc/<fn> with named JSON args; scalar result.
      const fn = table.slice(4);
      if (!/^[a-z_][a-z0-9_]*$/.test(fn)) return send(res, 404, { code: 'PGRST202', message: 'function not found' });
      const args = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : Object.fromEntries(url.searchParams);
      const keys = Object.keys(args).filter((k) => /^[a-z_][a-z0-9_]*$/.test(k));
      const sql = `select public.${qi(fn)}(${keys.map((k, i) => `${qi(k)} => $${i + 1}`).join(', ')}) as r`;
      // like PostgREST: object / array arguments are JSON (node-postgres would turn arrays into Postgres array literals)
      const out = await client.query(sql, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
      await client.query('commit');
      // PostgREST returns the scalar as JSON (a uuid / text result is a JSON string)
      return send(res, 200, JSON.stringify(out.rows[0].r ?? null));
    }
    const params = [...url.searchParams];
    const select = url.searchParams.get('select') || '*';
    let rows = []; let total = null;
    const ret = /return=representation/.test(prefer) ? 'returning t.*' : '';
    if (req.method === 'GET' || req.method === 'HEAD') {
      const values = [];
      const where = whereClause(params, values);
      const cols = await selectList(client, table, select);
      const limit = url.searchParams.get('limit'); const offset = url.searchParams.get('offset');
      const sql = `select ${cols} from public.${qi(table)} t ${where} ${orderClause(url.searchParams.get('order'))} ${limit ? `limit ${Number(limit)}` : ''} ${offset ? `offset ${Number(offset)}` : ''}`;
      rows = (await client.query(sql, values)).rows;
      if (/count=exact/.test(prefer)) total = Number((await client.query(`select count(*) from public.${qi(table)} t ${where}`, values)).rows[0].count);
    } else if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '[]');
      const list = Array.isArray(body) ? body : [body];
      const keys = [...new Set(list.flatMap((r) => Object.keys(r)))];
      const conflict = url.searchParams.get('on_conflict');
      let upsert = '';
      if (/resolution=(merge|ignore)-duplicates/.test(prefer)) {
        let target = conflict ? conflict.split(',').map(qi).join(', ') : null;
        if (!target) {
          const pk = await client.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary`, [`public.${table}`]);
          target = pk.rows.map((r) => qi(r.attname)).join(', ');
        }
        upsert = /ignore-duplicates/.test(prefer) ? `on conflict (${target}) do nothing` : `on conflict (${target}) do update set ${keys.map((k) => `${qi(k)} = excluded.${qi(k)}`).join(', ')}`;
      }
      const cols = keys.map(qi).join(', ');
      const sql = `insert into public.${qi(table)} as t (${cols}) select ${keys.map((k) => `r.${qi(k)}`).join(', ')} from json_populate_recordset(null::public.${qi(table)}, $1::json) r ${upsert} ${ret}`;
      rows = (await client.query(sql, [JSON.stringify(list)])).rows;
    } else if (req.method === 'PATCH') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const keys = Object.keys(body);
      const values = [JSON.stringify(body)];
      const where = whereClause(params, values);
      const sql = `update public.${qi(table)} t set ${keys.map((k) => `${qi(k)} = r.${qi(k)}`).join(', ')} from json_populate_record(null::public.${qi(table)}, $1::json) r ${where} ${ret}`;
      rows = (await client.query(sql, values)).rows;
    } else if (req.method === 'DELETE') {
      const values = [];
      const where = whereClause(params, values);
      rows = (await client.query(`delete from public.${qi(table)} t ${where} ${ret}`, values)).rows;
    } else return send(res, 405, { message: 'method' });
    // Re-select with the requested columns for writes that asked for a representation.
    if (req.method !== 'GET' && req.method !== 'HEAD' && /return=representation/.test(prefer) && select !== '*' && rows.length) {
      const pk = Object.keys(rows[0]).includes('id') ? 'id' : null;
      if (pk) {
        const cols = await selectList(client, table, select);
        rows = (await client.query(`select ${cols} from public.${qi(table)} t where t.id::text = any($1::text[])`, [rows.map((r) => String(r.id))])).rows;
      }
    }
    await client.query('commit');
    const range = total !== null ? `${rows.length ? `0-${rows.length - 1}` : '*'}/${total}` : `0-${Math.max(0, rows.length - 1)}/*`;
    if (req.method === 'HEAD') return send(res, 200, undefined, { 'Content-Range': range });
    if (req.method !== 'GET' && !/return=representation/.test(prefer)) return send(res, req.method === 'POST' ? 201 : 204, undefined, { 'Content-Range': range });
    if (wantObject) {
      if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null });
      return send(res, req.method === 'POST' ? 201 : 200, rows[0], { 'Content-Range': range });
    }
    return send(res, req.method === 'POST' ? 201 : 200, rows, { 'Content-Range': range });
  } catch (e) {
    await client.query('rollback').catch(() => {});
    const status = e.code === '23505' ? 409 : e.code === '42501' ? (role === 'anon' ? 401 : 403) : 400;
    return send(res, status, { code: e.code || 'PGRST', message: e.message, details: e.detail || null, hint: e.hint || null });
  } finally {
    client.release();
  }
}

async function authRoute(req, res, url) {
  const path = url.pathname.replace('/auth/v1', '');
  if (path === '/token') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = USERS[String(body.email || '').toLowerCase()];
      if (!u || u.password !== body.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return send(res, 200, session(String(body.email).toLowerCase()));
    }
    if (grant === 'refresh_token') {
      const email = String(body.refresh_token || '').replace(/^r-/, '');
      if (!USERS[email]) return send(res, 400, { error: 'invalid_grant' });
      return send(res, 200, session(email));
    }
  }
  if (path === '/user') {
    const claims = verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!claims || claims.role !== 'authenticated') return send(res, 401, { code: 401, msg: 'invalid JWT' });
    return send(res, 200, session(claims.email).user);
  }
  if (path === '/logout') return send(res, 204);
  return send(res, 404, { msg: 'not found' });
}

async function capture(req, res, url) {
  const body = await readBody(req);
  const entry = { at: new Date().toISOString(), path: url.pathname, body: body ? (() => { try { return JSON.parse(body); } catch { return body; } })() : null };
  if (url.pathname === '/capture/reset') { fs.writeFileSync(CAPTURE_FILE, ''); global.__flaky = new Map(); global.__resend = { keys: new Map(), mails: new Map() }; return send(res, 200, { ok: true }); }
  if (url.pathname === '/capture/list') return send(res, 200, fs.existsSync(CAPTURE_FILE) ? fs.readFileSync(CAPTURE_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  // Resend emulation (test only): Idempotency-Key replays, GET /emails/{id} with last_event,
  // and recipient hooks: fail4xx@ → 422 (not sent), err5xx@ → 500 (not sent), slow@ → sent but answers after 30 s,
  // bounce@ → last_event bounced, restricted@ → GET 401 (sending-only key).
  global.__resend = global.__resend || { keys: new Map(), mails: new Map() };
  const R = global.__resend;
  const gm = /^\/capture\/resend\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (gm && req.method === 'GET') {
    const mail = R.mails.get(gm[1]);
    if (!mail) return send(res, 404, { message: 'not found' });
    const to = JSON.stringify(mail.to || []);
    if (to.includes('restricted@')) return send(res, 401, { message: 'This API key is restricted to only send emails' });
    return send(res, 200, { id: gm[1], last_event: to.includes('bounce@') ? 'bounced' : 'delivered' });
  }
  if (url.pathname === '/capture/resend' && req.method === 'POST') {
    const idem = req.headers['idempotency-key'];
    if (idem && R.keys.has(idem)) return send(res, 200, { id: R.keys.get(idem) });
    const b = entry.body || {};
    const to = JSON.stringify(b.to || []);
    if (to.includes('fail4xx@')) return send(res, 422, { name: 'validation_error', message: 'Invalid `to` field (test)' });
    if (to.includes('err5xx@')) return send(res, 500, { name: 'internal_server_error', message: 'test 500' });
    global.__flaky = global.__flaky || new Map();
    if (to.includes('flaky5xx@') && !global.__flaky.get('mail')) { global.__flaky.set('mail', 1); return send(res, 500, { name: 'internal_server_error', message: 'test 500 (flaky)' }); }
    const id = crypto.randomUUID();
    if (idem) R.keys.set(idem, id);
    R.mails.set(id, b);
    entry.idempotencyKey = idem || null;
    entry.id = id;
    if (b.attachments) entry.body = { ...b, attachments: b.attachments.map((a) => ({ filename: a.filename, bytes: Buffer.from(a.content, 'base64').length, sha256: crypto.createHash('sha256').update(Buffer.from(a.content, 'base64')).digest('hex') })) };
    fs.appendFileSync(CAPTURE_FILE, JSON.stringify(entry) + '\n');
    if (to.includes('slow@')) { await new Promise((r) => setTimeout(r, 30000)); }
    return send(res, 200, { id });
  }
  // Telegram hooks (test only): chat_id tg-fail → 400 ok:false (not delivered), tg-err → 502 (unclear),
  // tg-slow → delivered but answers after 20 s (client timeout → unclear). Each recorded with `tg`.
  if (url.pathname.startsWith('/capture/telegram/') && url.pathname.endsWith('/sendMessage')) {
    const chat = String(entry.body?.chat_id ?? '');
    if (chat === 'tg-fail') { fs.appendFileSync(CAPTURE_FILE, JSON.stringify({ ...entry, tg: 'rejected' }) + '\n'); return send(res, 400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' }); }
    global.__flaky = global.__flaky || new Map();
    if (chat === 'tg-flaky' && !global.__flaky.get('tg')) { global.__flaky.set('tg', 1); fs.appendFileSync(CAPTURE_FILE, JSON.stringify({ ...entry, tg: 'rejected' }) + '\n'); return send(res, 429, { ok: false, error_code: 429, description: 'Too Many Requests: retry later' }); }
    if (chat === 'tg-err') { fs.appendFileSync(CAPTURE_FILE, JSON.stringify({ ...entry, tg: 'error' }) + '\n'); return send(res, 502, { ok: false, error_code: 502, description: 'Bad Gateway' }); }
    fs.appendFileSync(CAPTURE_FILE, JSON.stringify({ ...entry, tg: 'delivered' }) + '\n');
    if (chat === 'tg-slow') await new Promise((r) => setTimeout(r, 20000));
    return send(res, 200, { ok: true, result: { message_id: 1 } });
  }
  fs.appendFileSync(CAPTURE_FILE, JSON.stringify(entry) + '\n');
  if (url.pathname.startsWith('/capture/telegram/')) {
    if (url.pathname.endsWith('/getUpdates')) return send(res, 200, { ok: true, result: [] });
    return send(res, 200, { ok: true, result: { message_id: 1 } });
  }
  return send(res, 200, { id: crypto.randomUUID() });
}


// ── Minimal storage API (test-only; NOT Supabase Storage). RLS is checked by
// inserting/selecting storage.objects rows under the caller's role.
async function storageRoute(req, res, url) {
  const rest = url.pathname.replace('/storage/v1/', '');
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers.apikey;
  const claims = verify(auth) || { role: 'anon' };
  const role = ['anon', 'authenticated', 'service_role'].includes(claims.role) ? claims.role : 'anon';
  const asRole = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role ${role}`);
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      const out = await fn(client);
      await client.query('commit');
      return out;
    } catch (e) { await client.query('rollback').catch(() => {}); throw e; } finally { client.release(); }
  };
  const fileOf = (bucket, name) => path.join(FILES, bucket, name);
  let m;
  if ((m = /^object\/sign\/([^/]+)\/(.+)$/.exec(rest))) {
    const [, bucket, name] = m.map(decodeURIComponent);
    if (req.method === 'POST') {
      const visible = await asRole(async (c) => (await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rowCount);
      if (!visible) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const token = crypto.createHmac('sha256', SECRET).update(`${bucket}/${name}`).digest('hex');
      return send(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${token}` });
    }
    const token = crypto.createHmac('sha256', SECRET).update(`${bucket}/${name}`).digest('hex');
    if (url.searchParams.get('token') !== token || !fs.existsSync(fileOf(bucket, name))) return send(res, 400, { message: 'invalid signature' });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    return res.end(fs.readFileSync(fileOf(bucket, name)));
  }
  if ((m = /^object\/list\/([^/]+)$/.exec(rest)) && req.method === 'POST') {
    const bucket = decodeURIComponent(m[1]);
    const chunks = []; for await (const ch of req) chunks.push(ch);
    const b = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    const prefix = (b.prefix || '').replace(/\/$/, '');
    const rows = await asRole(async (c) => (await c.query('select name from storage.objects where bucket_id = $1 and name like $2', [bucket, `${prefix}/%`])).rows);
    const names = rows.map((r) => r.name.slice(prefix.length + 1)).filter((n) => !n.includes('/') && (!b.search || n.includes(b.search)));
    return send(res, 200, names.slice(0, b.limit || 100).map((name) => ({ name, id: crypto.randomUUID(), metadata: {} })));
  }
  if ((m = /^object\/([^/]+)$/.exec(rest)) && req.method === 'DELETE') {
    const bucket = decodeURIComponent(m[1]);
    const chunks = []; for await (const ch of req) chunks.push(ch);
    const b = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    const out = [];
    for (const name of b.prefixes || []) {
      const n = await asRole(async (c) => (await c.query('delete from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rowCount);
      if (n) { try { fs.unlinkSync(fileOf(bucket, name)); } catch {} out.push({ name, bucket_id: bucket }); }
    }
    return send(res, 200, out);
  }
  if ((m = /^object\/public\/([^/]+)\/(.+)$/.exec(rest))) {
    const [, bucket, name] = m.map(decodeURIComponent);
    const pub = (await pool.query('select public from storage.buckets where id = $1', [bucket])).rows[0]?.public;
    if (!pub || !fs.existsSync(fileOf(bucket, name))) return send(res, 400, { message: 'not found' });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    return res.end(fs.readFileSync(fileOf(bucket, name)));
  }
  if ((m = /^object\/([^/]+)\/(.+)$/.exec(rest))) {
    const [, bucket, name] = m.map(decodeURIComponent);
    if (req.method === 'POST' || req.method === 'PUT') {
      const chunks = []; for await (const ch of req) chunks.push(ch);
      const body = Buffer.concat(chunks);
      const upsert = req.headers['x-upsert'] === 'true';
      try {
        await asRole(async (c) => {
          const exists = (await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rowCount;
          if (exists && !upsert) throw Object.assign(new Error('The resource already exists'), { code: 'dup' });
          // like Supabase Storage: overwriting needs an UPDATE policy on storage.objects
          if (exists && upsert) { const u = await c.query('update storage.objects set name = name where bucket_id = $1 and name = $2', [bucket, name]); if (!u.rowCount) throw Object.assign(new Error('new row violates row-level security policy'), { code: 'rls' }); }
          if (!exists) { const ins = await c.query('insert into storage.objects (bucket_id, name) values ($1, $2) on conflict (bucket_id, name) do nothing', [bucket, name]); if (!ins.rowCount && !upsert) throw Object.assign(new Error('The resource already exists'), { code: 'dup' }); }
        });
      } catch (e) {
        return send(res, 400, { statusCode: e.code === 'dup' ? '409' : '403', error: e.code === 'dup' ? 'Duplicate' : 'Unauthorized', message: e.code === 'dup' ? e.message : 'new row violates row-level security policy' });
      }
      fs.mkdirSync(path.dirname(fileOf(bucket, name)), { recursive: true });
      fs.writeFileSync(fileOf(bucket, name), body);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
    }
    if (req.method === 'GET') {
      const visible = await asRole(async (c) => (await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rowCount);
      if (!visible || !fs.existsSync(fileOf(bucket, name))) return send(res, 400, { statusCode: '404', message: 'Object not found' });
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      return res.end(fs.readFileSync(fileOf(bucket, name)));
    }
  }
  return send(res, 404, { message: 'storage route not implemented in test gateway' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    return res.end();
  }
  try {
    if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url);
    if (url.pathname.startsWith('/auth/v1/')) return await authRoute(req, res, url);
    if (url.pathname.startsWith('/capture/')) return await capture(req, res, url);
    if (url.pathname.startsWith('/storage/v1/')) return await storageRoute(req, res, url);
    return send(res, 404, { message: 'not found' });
  } catch (e) {
    return send(res, 500, { message: e.message });
  }
}).listen(PORT, () => {
  console.log(`itest gateway on ${PORT}`);
  pool.query('select current_database() as d').then((r) => console.log('DB=' + r.rows[0].d));
  console.log('ANON=' + sign({ role: 'anon', iss: 'itest' }));
  console.log('SERVICE=' + sign({ role: 'service_role', iss: 'itest' }));
});
