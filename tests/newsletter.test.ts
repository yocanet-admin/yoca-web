/**
 * Newsletter: helpers, wording in every language, e-mail templates.
 * Run: npx tsx --test tests/newsletter.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleUrl, asLocale, chunk, confirmUrl, hashToken, isTokenShape, maskEmail, newToken, normalizeEmail, pickVersion, quoteInArticle, sanitizeCopy, senderLine, teaserParagraphs, unsubscribeUrl, type PublishedVersion } from '../lib/newsletter/core';
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

test('e-mail copy: sanitised per language; teaser paragraphs', () => {
  const c = sanitizeCopy({ tr: { subject: '  Konu ', preheader: 'Ön', teaser: 'A\nB\n\nC', extra: 'x' }, xx: { subject: 'no' }, en: { subject: '', preheader: '', teaser: '' }, az: 'bad' });
  assert.deepEqual(Object.keys(c), ['tr']);
  assert.equal(c.tr?.subject, 'Konu');
  assert.equal((c.tr as Record<string, unknown>).extra, undefined);
  assert.deepEqual(teaserParagraphs('İlk satır\ndevamı\n\n\nİkinci paragraf'), ['İlk satır devamı', 'İkinci paragraf']);
  assert.deepEqual(sanitizeCopy(null), {});
});

test('issue e-mail uses the written copy (subject, preview, teaser) and escapes it', () => {
  const unsub = unsubscribeUrl('https://yoca.net', 'e'.repeat(48));
  const mail = issueEmail({ locale: 'tr', version: v('tr'), url: 'https://yoca.net/tr/insights/x', unsubscribeUrl: unsub, copy: { subject: 'Formunuz müşteri kaçırıyor olabilir', preheader: 'Üç alan, bir karar', teaser: 'Birinci <i>paragraf</i>.\n\nİkinci paragraf.' } });
  assert.equal(mail.subject, 'Formunuz müşteri kaçırıyor olabilir');
  assert.ok(mail.html.includes('Üç alan, bir karar'), 'preheader');
  assert.ok(mail.html.includes('Birinci &lt;i&gt;paragraf&lt;/i&gt;.') && mail.html.includes('İkinci paragraf.'));
  assert.ok(!mail.html.includes('Excerpt &lt;b&gt;'), 'teaser replaces excerpt');
  assert.ok(mail.html.includes('Title tr'), 'title stays as heading');
  assert.ok(mail.html.includes('Dil tercihi') && mail.html.includes('Bültenden ayrıl'), 'preferences + leave links');
  assert.ok(mail.text.includes('İkinci paragraf.'));
  const fallback = issueEmail({ locale: 'tr', version: v('tr'), url: 'https://yoca.net/x', unsubscribeUrl: unsub, copy: null });
  assert.equal(fallback.subject, 'Title tr');
});

test('quote must be word for word in the article (Markdown, quotes and spacing ignored)', () => {
  const body = '## Giriş\n\nFormu kısaltmak her zaman **daha iyi** sonuç vermez.  Ziyaretçi [ne olacağını](/tr/x) bilmek ister.';
  assert.equal(quoteInArticle('Formu kısaltmak her zaman daha iyi sonuç vermez.', body), true);
  assert.equal(quoteInArticle('“Ziyaretçi ne olacağını bilmek ister”', body), true);
  assert.equal(quoteInArticle('Formu kısaltmak her zaman en iyi sonuç verir.', body), false, 'changed words');
  assert.equal(quoteInArticle('kısa', body), false, 'too short to be a quote');
});

test('sender: official name + address once filled, else the site address', () => {
  assert.deepEqual(senderLine({}, 'Yoca. Your Own Creative Agency', 'Bağdat Caddesi, No: 131 Kadıköy / İstanbul'), { name: 'Yoca. Your Own Creative Agency', address: 'Bağdat Caddesi, No: 131 Kadıköy / İstanbul' });
  assert.deepEqual(senderLine({ siteAddress: 'Yeni adres\nİstanbul' }, 'Yoca', 'x'), { name: 'Yoca', address: 'Yeni adres, İstanbul' });
  assert.deepEqual(senderLine({ controllerName: 'Örnek Ltd. Şti.', officialAddress: 'Resmî adres 1', siteAddress: 'Site' }, 'Yoca', 'x'), { name: 'Örnek Ltd. Şti.', address: 'Resmî adres 1' });
  assert.equal(senderLine({ controllerName: 'Örnek', officialAddress: '' }, 'Yoca', 'x').name, 'Yoca', 'both needed');
});

test('issue e-mail extras: category, quote, CTA line, more articles, reply note, sender, dark mode', () => {
  const mail = issueEmail({
    locale: 'tr', version: v('tr'), url: 'https://yoca.net/tr/insights/x', unsubscribeUrl: unsubscribeUrl('https://yoca.net', 'f'.repeat(48)),
    copy: { teaser: 'Bir.\n\nİki.', quote: 'Ziyaretçi <ne> olacağını bilmek ister.' },
    category: 'Web ve dijital deneyim',
    cta: { label: 'Proje başlatın', url: 'https://yoca.net/tr/contact?utm_source=newsletter' },
    more: [{ title: 'Diğer yazı A', url: 'https://yoca.net/tr/insights/a' }, { title: 'Diğer yazı B', url: 'https://yoca.net/tr/insights/b' }, { title: 'C', url: 'https://yoca.net/tr/insights/c' }],
    sender: { name: 'Örnek Ltd. Şti.', address: 'Resmî adres 1' },
  });
  assert.ok(mail.html.includes('· Web ve dijital deneyim'));
  assert.ok(mail.html.includes('Ziyaretçi &lt;ne&gt; olacağını bilmek ister.'), 'quote escaped');
  assert.ok(mail.html.indexOf('Bir.') < mail.html.indexOf('Ziyaretçi') && mail.html.indexOf('Ziyaretçi') < mail.html.indexOf('İki.'), 'quote after the first paragraph');
  assert.ok(mail.html.includes('Proje başlatın'));
  assert.ok(mail.html.includes('Ayrıca okuyun') && mail.html.includes('Diğer yazı B') && !mail.html.includes('>C <'), 'at most two more articles');
  assert.ok(mail.html.includes('bu e-postayı yanıtlayın'));
  assert.ok(mail.html.includes('Örnek Ltd. Şti. · Resmî adres 1') && !mail.html.includes('Bağdat'));
  assert.ok(mail.html.includes('prefers-color-scheme: dark') && mail.html.includes('class="nl-card"'));
  assert.ok(mail.text.includes('Ayrıca okuyun:') && mail.text.includes('Örnek Ltd. Şti.'));
  const plain = issueEmail({ locale: 'en', version: v('en'), url: 'https://yoca.net/x', unsubscribeUrl: 'https://yoca.net/u' });
  assert.ok(!plain.html.includes('Also on Yoca Insights') && !plain.html.includes('border-left:3px'), 'no empty extras');
  assert.ok(plain.html.includes('Bağdat Caddesi'), 'default sender');
  const ar = issueEmail({ locale: 'ar', version: v('ar'), url: 'https://yoca.net/ar/x', unsubscribeUrl: 'https://yoca.net/u', copy: { quote: 'اقتباس من المقال هنا' } });
  assert.ok(ar.html.includes('border-right:3px'), 'RTL quote rule on the right');
});
