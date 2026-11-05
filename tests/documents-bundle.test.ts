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
