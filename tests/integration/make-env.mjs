// Writes tests/integration/.env.itest — TEST values only: JWTs signed with the
// gateway's public test secret, local capture endpoints instead of Resend /
// Telegram, random local secrets. Nothing here is a production credential.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const SECRET = process.env.ITEST_JWT_SECRET || 'itest-secret-not-for-production-0123456789';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const sign = (p) => { const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const b = b64u(JSON.stringify(p)); return `${h}.${b}.${b64u(crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest())}`; };
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 86400;
const rnd = () => crypto.randomBytes(24).toString('hex');
const GW = 'http://127.0.0.1:54331';
const env = {
  NEXT_PUBLIC_SUPABASE_URL: GW,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: sign({ role: 'anon', iss: 'itest', exp }),
  SUPABASE_SERVICE_ROLE_KEY: sign({ role: 'service_role', iss: 'itest', exp }),
  AI_MOCK: '1',
  NOTIFY_RESEND_ENDPOINT: `${GW}/capture/resend`,
  NOTIFY_TELEGRAM_API: `${GW}/capture/telegram`,
  RESEND_API_KEY: 'itest-resend-key',
  TELEGRAM_BOT_TOKEN: 'itest-fake-token',
  INSIGHTS_PREVIEW_SECRET: 'itest-preview',
  CRON_SECRET: rnd(),
  YOCA_LICENSE_API_URL: 'http://127.0.0.1:54400',
  YOCA_LICENSE_API_KEY_ID: 'test-key',
  YOCA_LICENSE_API_SECRET: rnd(),
};
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '.env.itest');
fs.writeFileSync(out, Object.entries(env).map(([k, v]) => `export ${k}=${v}`).join('\n') + '\n');
console.log(`wrote ${out}`);
