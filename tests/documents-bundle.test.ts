/**
 * Teklifler ve Belgeler — files the PDF routes read at runtime must be listed
 * for the serverless bundle (the file tracer does not follow them).
 * 5 Kasım 2026: production PDF generation failed because pdfkit's built-in
 * font metrics (Helvetica.cjs, loaded through package "imports") were missing.
 * Run: npx tsx --test tests/documents-bundle.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8');

test('PDF routes ship the fonts, logo and pdfkit font metrics', () => {
  for (const entry of ['./lib/documents/fonts/**', './public/brand/*.svg', './node_modules/pdfkit/js/standard-fonts/**']) {
    assert.ok(config.includes(`'${entry}'`), `next.config.mjs outputFileTracingIncludes is missing ${entry}`);
  }
  assert.ok(fs.existsSync(path.join(root, 'node_modules/pdfkit/js/standard-fonts/Helvetica.cjs')), 'pdfkit standard font file not found where the include points');
});

test('brand files the PDF template reads are under the traced public/brand/*.svg (incl. the motif)', () => {
  for (const f of ['yoca-logo-light-bg.svg', 'yoca-logo-primary.svg', 'yoca-motif.svg']) {
    assert.ok(fs.existsSync(path.join(root, 'public/brand', f)), `public/brand/${f} missing`);
  }
  assert.ok(config.includes("'/api/admin/documents/**'"), 'the include must cover every documents route (pdf, email, materials)');
  assert.ok(fs.existsSync(path.join(root, 'public/brand/email/yoca-logo-light.png')), 'e-mail logo PNG (light background) missing');
});

test('v21 only revokes TRUNCATE from client roles (no data change, service role untouched)', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/upgrade-v21-document-grants.sql'), 'utf8').replace(/--.*$/gm, '').toLowerCase();
  const statements = sql.split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  assert.deepEqual(statements[0], 'begin');
  assert.deepEqual(statements.at(-1), 'commit');
  const body = statements.slice(1, -1);
  assert.equal(body.length, 1);
  assert.match(body[0], /^revoke truncate on (public\.doc_[a-z_]+, )*public\.doc_[a-z_]+ from anon, authenticated$/);
  assert.ok(!/service_role|delete from|truncate table|drop /.test(sql));
});

test('v22 only adds the e-mail theme (column with default, function parameter with default, guard); nothing deleted', () => {
  const raw = fs.readFileSync(path.join(root, 'supabase/upgrade-v22-document-email-theme.sql'), 'utf8');
  const sql = raw.replace(/--.*$/gm, '').toLowerCase();
  assert.match(sql, /add column if not exists theme text not null default 'light'/);
  assert.match(sql, /check \(theme in \('light', 'dark'\)\)/);
  assert.match(sql, /p_request_key uuid, p_theme text default 'light'/);
  assert.match(sql, /new\.created_at, new\.theme\)/, 'theme cannot change after sending');
  assert.match(sql, /grant execute on function public\.doc_email_begin\(uuid, integer, uuid, text, text\[\], text\[\], text, text, text, uuid, text\) to authenticated/);
  assert.ok(!/delete from|truncate|drop table|drop column|update public\.doc_emails/.test(sql), 'no data change');
  assert.ok(!/grant [a-z, ]* on (table )?public\.doc_emails to (anon|authenticated)/.test(sql.replace('grant select on public.doc_emails to authenticated', '')), 'no new table grants');
});
