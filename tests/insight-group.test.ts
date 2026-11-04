/**
 * One article in every language: grouping, states, filters, bulk publish helpers.
 * Run: npx tsx --test tests/insight-group.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bulkMode,
  diffChanges,
  editableFields,
  groupInsights,
  langState,
  matchesFilter,
  oversizedFields,
  memberFor,
  publicFingerprint,
  publishBlockers,
  sanitizeChanges,
  summarizeOutcomes,
  type GroupMember,
} from '../lib/insightGroup';

let n = 0;
const row = (p: Partial<GroupMember>): GroupMember => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  group_id: 'g1',
  locale: 'tr',
  title: 'Başlık',
  slug: 'baslik',
  body_md: 'Metin.',
  status: 'DRAFT',
  publish_at: null,
  updated_at: `2026-11-0${(n % 9) + 1}T10:00:00Z`,
  source_insight_id: null,
  language_reviewed: false,
  ...p,
});

test('groups by group_id only — same titles in different groups stay apart', () => {
  const a = row({ group_id: 'g1', title: 'Aynı başlık' });
  const b = row({ group_id: 'g2', title: 'Aynı başlık' });
  const groups = groupInsights([a, b]);
  assert.equal(groups.length, 2);
});

test('one line per article, Turkish title preferred', () => {
  const tr = row({ locale: 'tr', title: 'Türkçe başlık' });
  const en = row({ locale: 'en', title: 'English title', source_insight_id: tr.id, updated_at: '2026-11-09T00:00:00Z' });
  const [g] = groupInsights([en, tr]);
  assert.equal(g.title, 'Türkçe başlık');
  assert.equal(g.primary.id, tr.id);
  assert.equal(memberFor(g, 'en')?.id, en.id);
  assert.equal(memberFor(g, 'az'), undefined);
});

test('no Turkish version → title of the source version', () => {
  const en = row({ locale: 'en', title: 'Source EN' });
  const ar = row({ locale: 'ar', title: 'عنوان', source_insight_id: en.id, updated_at: '2026-11-09T00:00:00Z' });
  const [g] = groupInsights([ar, en]);
  assert.equal(g.title, 'Source EN');
  assert.equal(g.titleLocale, 'en');
});

test('unclear relations are warned about, not merged', () => {
  const tr1 = row({ group_id: 'g1', locale: 'tr', slug: 'a' });
  const tr2 = row({ group_id: 'g1', locale: 'tr', slug: 'b' });
  const other = row({ group_id: 'g9', locale: 'tr' });
  const en = row({ group_id: 'g1', locale: 'en', source_insight_id: other.id });
  const groups = groupInsights([tr1, tr2, other, en]);
  const g1 = groups.find((g) => g.groupId === 'g1')!;
  assert.equal(g1.byLocale.tr?.length, 2);
  assert.ok(g1.warnings.some((w) => w.includes('2 ayrı kayıt')));
  assert.ok(g1.warnings.some((w) => w.includes('başka bir yazı grubunda')));
  assert.equal(groups.find((g) => g.groupId === 'g9')!.members.length, 1);
});

test('states: Yok, Taslak, Kontrol bekliyor, Hazır, Yayında, Zamanlandı', () => {
  assert.equal(langState(undefined), 'missing');
  assert.equal(langState(row({ body_md: '' })), 'draft');
  assert.equal(langState(row({ body_md: 'İddia [KAYNAK GEREKLİ]' })), 'draft');
  assert.equal(langState(row({ source_insight_id: 'x', language_reviewed: false })), 'review');
  assert.equal(langState(row({ source_insight_id: 'x', language_reviewed: true })), 'ready');
  assert.equal(langState(row({})), 'ready');
  assert.equal(langState(row({ status: 'PUBLISHED', publish_at: '2026-01-01T00:00:00Z' })), 'published');
  assert.equal(langState(row({ status: 'SCHEDULED' })), 'scheduled');
});

test('blockers explain why a version cannot be published', () => {
  const b = publishBlockers({ title: '', slug: '', body_md: 'x [KAYNAK GEREKLİ] y [KAYNAK GEREKLI: tarih]', source_insight_id: 'x', language_reviewed: false });
  assert.deepEqual(b.map((x) => x.code), ['title', 'slug', 'source_marker', 'language_review']);
  assert.ok(b[2].text.includes('2 adet'));
});

test('filters keep language and state', () => {
  const tr = row({ locale: 'tr', status: 'PUBLISHED', publish_at: '2026-01-01T00:00:00Z' });
  const en = row({ locale: 'en', source_insight_id: tr.id });
  const [g] = groupInsights([tr, en]);
  assert.equal(matchesFilter(g, { locale: 'all', state: 'all' }), true);
  assert.equal(matchesFilter(g, { locale: 'en', state: 'all' }), true);
  assert.equal(matchesFilter(g, { locale: 'az', state: 'all' }), false);
  assert.equal(matchesFilter(g, { locale: 'all', state: 'review' }), true);
  assert.equal(matchesFilter(g, { locale: 'tr', state: 'review' }), false);
  assert.equal(matchesFilter(g, { locale: 'az', state: 'missing' }), true);
  assert.equal(matchesFilter(g, { locale: 'all', state: 'missing' }), true);
  assert.equal(matchesFilter(g, { locale: 'tr', state: 'published' }), true);
});

test('changes from the browser: only whitelisted fields, never status or language check', () => {
  const clean = sanitizeChanges({ title: 'Yeni', status: 'PUBLISHED', publish_at: 'now', language_reviewed: true, group_id: 'x', locale: 'en', source_insight_id: null, tags: ['a', 'b'], faq: [{ q: 1 }], cta_type: 'hack', featured: 'yes' });
  assert.deepEqual(clean, { title: 'Yeni', tags: ['a', 'b'] });
  // The language check can be withdrawn from the editor, never given.
  assert.deepEqual(sanitizeChanges({ language_reviewed: false }), { language_reviewed: false });
  assert.deepEqual(sanitizeChanges({ language_reviewed: true }), {});
  // Values are never cut or rewritten; too long is reported instead.
  assert.equal((sanitizeChanges({ cover_alt: '' }) as { cover_alt: string }).cover_alt, '');
  assert.deepEqual(oversizedFields(sanitizeChanges({ title: 'x'.repeat(501), excerpt: 'ok' })), ['title']);
  assert.deepEqual(diffChanges({ title: 'Eski', tags: ['a', 'b'] }, clean), { title: 'Yeni' });
  assert.deepEqual(diffChanges({ title: 'Yeni', tags: ['a', 'b'] }, clean), {});
  assert.ok(!('status' in editableFields({ status: 'DRAFT', title: 't' })));
});

test('fingerprint: same public text → same value; image ref vs public URL is the same image', async () => {
  const id = '3f1c2b9a-1111-4222-8333-444455556666';
  const draft = { title: 'T', slug: 's', body_md: `![a](yoca-image:${id})`, tags: [], faq: [], sources: [] };
  const published = { ...draft, body_md: `![a](https://x.supabase.co/storage/v1/object/public/insights/g/${id}.png)` };
  assert.equal(await publicFingerprint(draft), await publicFingerprint(published));
  assert.notEqual(await publicFingerprint(draft), await publicFingerprint({ ...draft, title: 'T2' }));
  assert.equal(await publicFingerprint({ ...draft, status: 'PUBLISHED', updated_at: 'x' }), await publicFingerprint(draft));
});

test('bulk mode: draft → publish, published+changed → update, published+same/unknown → unchanged', () => {
  assert.equal(bulkMode('DRAFT', null), 'publish');
  assert.equal(bulkMode('SCHEDULED', null), 'publish');
  assert.equal(bulkMode('PUBLISHED', true), 'update');
  assert.equal(bulkMode('PUBLISHED', false), 'unchanged');
  assert.equal(bulkMode('PUBLISHED', null), 'unchanged');
});

test('summary never says "all" when one language failed', () => {
  const all = summarizeOutcomes([{ locale: 'tr', outcome: 'published' }, { locale: 'en', outcome: 'updated' }]);
  assert.ok(all.startsWith('Seçilen 2 dilin tümü'));
  const partial = summarizeOutcomes([{ locale: 'tr', outcome: 'published' }, { locale: 'ar', outcome: 'failed' }]);
  assert.ok(partial.startsWith('Kısmen'));
  assert.ok(partial.includes('Başarısız: AR'));
  assert.ok(!partial.includes('tümü'));
  assert.ok(summarizeOutcomes([{ locale: 'ar', outcome: 'failed' }]).startsWith('Hiçbir dil yayımlanmadı'));
});

test('timestamps: same instant in different spellings', async () => {
  const { sameTimestamp } = await import('../lib/insightGroup');
  assert.equal(sameTimestamp('2026-11-04T14:16:08.783626+00:00', '2026-11-04T14:16:08.783626Z'), true);
  assert.equal(sameTimestamp('2026-11-04T14:16:08.783626+00:00', '2026-11-04T14:16:08.783Z'), true);
  assert.equal(sameTimestamp('2026-11-04T14:16:08.783626+00:00', '2026-11-04T14:16:08.783627+00:00'), false);
  assert.equal(sameTimestamp('2026-11-04T14:16:08.5+00:00', '2026-11-04T14:16:08.500000Z'), true);
  assert.equal(sameTimestamp('2026-11-04T14:16:09+00:00', '2026-11-04T14:16:08.999Z'), false);
});
