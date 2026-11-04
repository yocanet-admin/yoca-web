/**
 * Newsletter: helpers, wording in every language, e-mail templates.
 * Run: npx tsx --test tests/newsletter.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleUrl, asLocale, chunk, confirmUrl, hashToken, isTokenShape, maskEmail, newToken, normalizeEmail, pickVersion, unsubscribeUrl, type PublishedVersion } from '../lib/newsletter/core';
import { NEWSLETTER_COPY } from '../lib/newsletter/copy';
import { confirmEmail, issueEmail } from '../lib/newsletter/template';

const v = (locale: PublishedVersion['locale'], extra: Partial<PublishedVersion> = {}): PublishedVersion => ({
  id: locale, locale, slug: `slug-${locale}`, title: `Title ${locale}`, excerpt: 'Excerpt <b>x</b>', cover_url: 'https://cdn.example.com/c.png', cover_alt: 'Cover', reading_minutes: 6, source_insight_id: 'src', ...extra,
});

test('e-mail normalisation', () => {
  assert.equal(normalizeEmail('  Ali@Example.COM '), 'ali@example.com');
  for (const bad of ['', 'ali', 'ali@', 'a@b', 'ali@example', 'a b@example.com', '<x>@example.com', 'x'.repeat(200) + '@e.com']) assert.equal(normalizeEmail(bad), null, bad);
});

test('tokens: random, 48 hex, hash differs from token', () => {
  const a = newToken();
  const b = newToken();
  assert.notEqual(a, b);
  assert.ok(isTokenShape(a));
  assert.equal(hashToken(a).length, 64);
  assert.notEqual(hashToken(a), a);
  assert.equal(isTokenShape('abc'), false);
  assert.equal(isTokenShape(undefined), false);
});

test('language version: own language, then EN, then source, then any', () => {
  const tr = v('tr', { source_insight_id: null });
  const en = v('en');
  const az = v('az');
  assert.equal(pickVersion('az', [tr, en, az])?.locale, 'az');
  assert.equal(pickVersion('ar', [tr, en, az])?.locale, 'en');
  assert.equal(pickVersion('ar', [tr, az])?.locale, 'tr');
  assert.equal(pickVersion('ar', [az])?.locale, 'az');
  assert.equal(pickVersion('tr', []), null);
  assert.equal(asLocale('xx'), 'en');
});

test('links: article with UTM, confirm and unsubscribe on the site', () => {
  const url = articleUrl('https://yoca.net', v('tr'));
  assert.match(url, /^https:\/\/yoca\.net\/tr\/insights\/slug-tr\?utm_source=newsletter&utm_medium=email&utm_campaign=insights-slug-tr$/);
  assert.equal(confirmUrl('https://yoca.net', 'a'.repeat(48)), `https://yoca.net/api/newsletter/confirm?token=${'a'.repeat(48)}`);
  assert.match(unsubscribeUrl('https://yoca.net', 'b'.repeat(48)), /\/api\/newsletter\/unsubscribe\?token=b{48}$/);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(maskEmail('ali@example.com'), 'a***@example.com');
});

test('wording exists in every language with the same keys', () => {
  const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, val]) => (val && typeof val === 'object' ? keys(val, `${p}${k}.`) : [`${p}${k}`]));
  const base = keys(NEWSLETTER_COPY.tr).sort();
  for (const l of ['en', 'az', 'ar'] as const) {
    assert.deepEqual(keys(NEWSLETTER_COPY[l]).sort(), base, l);
    for (const k of keys(NEWSLETTER_COPY[l])) {
      const val = k.split('.').reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], NEWSLETTER_COPY[l]);
      assert.ok(typeof val === 'string' && val.trim().length > 0, `${l}.${k}`);
    }
  }
});

test('issue e-mail: escaped text, cover, button, unsubscribe link, plain text', () => {
  const unsub = unsubscribeUrl('https://yoca.net', 'c'.repeat(48));
  const mail = issueEmail({ locale: 'tr', version: v('tr'), url: articleUrl('https://yoca.net', v('tr')), unsubscribeUrl: unsub });
  assert.equal(mail.subject, 'Title tr');
  assert.ok(mail.html.includes('Excerpt &lt;b&gt;x&lt;/b&gt;'), 'excerpt escaped');
  assert.ok(!mail.html.includes('<b>x</b>'));
  assert.ok(mail.html.includes('https://cdn.example.com/c.png'));
  assert.ok(mail.html.includes(unsub));
  assert.ok(mail.html.includes('Yazıyı oku'));
  assert.ok(mail.html.includes('Bağdat Caddesi'), 'postal address in footer');
  assert.ok(mail.text.includes(unsub) && mail.text.includes('Yazıyı oku'));
  const test = issueEmail({ locale: 'tr', version: v('tr'), url: 'https://yoca.net/x', unsubscribeUrl: unsub, test: true });
  assert.ok(test.subject.startsWith('[Deneme] '));
  const noCover = issueEmail({ locale: 'en', version: v('en', { cover_url: 'http://insecure/c.png' }), url: 'https://yoca.net/x', unsubscribeUrl: unsub });
  assert.ok(!noCover.html.includes('insecure'), 'non-https cover skipped');
});

test('Arabic e-mail is right-to-left; confirm e-mail has the link', () => {
  const ar = issueEmail({ locale: 'ar', version: v('ar'), url: 'https://yoca.net/ar/x', unsubscribeUrl: 'https://yoca.net/u' });
  assert.match(ar.html, /<html lang="ar" dir="rtl">/);
  assert.ok(ar.html.includes('اقرأ المقال'));
  const c = confirmEmail('az', 'https://yoca.net/api/newsletter/confirm?token=' + 'd'.repeat(48));
  assert.ok(c.html.includes('d'.repeat(48)) && c.text.includes('d'.repeat(48)));
  assert.equal(c.subject, NEWSLETTER_COPY.az.confirmEmail.subject);
});
