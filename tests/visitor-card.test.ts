import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VISITOR_TODAY_LABEL, VISITOR_WEEK_LABEL, visitorCard } from '../lib/cockpit/visitorCard';
import type { TrafficReport } from '../lib/cockpit/vercel';

const report = (over: Partial<TrafficReport> = {}): TrafficReport => ({
  range: { days: 7, since: '2026-11-03', until: '2026-11-10' },
  dayBoundary: 'UTC',
  today: { date: '2026-11-09', visitors: 6, pageviews: 27 },
  fetchedAt: '2026-11-09T14:00:00.000Z',
  // Vercel's own period total — deliberately NOT the sum of the daily rows below
  totals: { visitors: 45, pageviews: 127 },
  previous: { visitors: 30, pageviews: 90 },
  daily: [
    { date: '2026-11-03', visitors: 11, pageviews: 36 },
    { date: '2026-11-09', visitors: 6, pageviews: 27 },
  ],
  pages: [], referrers: [], countries: [], devices: [], events: [], signatures: [],
  ...over,
});

test('main value is today; 7-day figure is the source total, includes today, UTC days', () => {
  const card = visitorCard({ ok: true, configured: true, report: report() });
  assert.equal(card.state, 'ok');
  assert.equal(card.value, '6');
  assert.equal(card.todayNote, "9 Kas · Türkiye saatiyle 03:00'te sıfırlanır · gün sürüyor");
  assert.equal(card.week, '45', 'uses totals.visitors, not a sum of days');
  assert.equal(card.weekNote, 'UTC günleri · 3 Kas–9 Kas · Vercel dönem toplamı');
});

test('real zero vs no row vs error vs not configured vs loading stay distinct', () => {
  const zero = visitorCard({ ok: true, report: report({ today: { date: '2026-11-09', visitors: 0, pageviews: 0 } }) });
  assert.deepEqual([zero.state, zero.value], ['zero', '0']);
  assert.match(zero.todayNote, /^henüz ziyaret yok, veri gecikebilir · 9 Kas · Türkiye saatiyle 03:00'te sıfırlanır/);
  const missing = visitorCard({ ok: true, report: report({ today: null }) });
  assert.deepEqual([missing.state, missing.value], ['no_data', '–']);
  assert.equal(missing.week, '45');
  const error = visitorCard({ ok: false, configured: true, error: 'Vercel 500' });
  assert.deepEqual([error.state, error.value, error.week], ['error', '–', null]);
  const off = visitorCard({ ok: false, configured: false });
  assert.deepEqual([off.state, off.value], ['not_configured', '–']);
  const loading = visitorCard(null);
  assert.deepEqual([loading.state, loading.value], ['loading', null]);
});

test('large numbers use Turkish grouping', () => {
  const card = visitorCard({ ok: true, report: report({ today: { date: '2026-11-09', visitors: 1234, pageviews: 0 }, totals: { visitors: 12345, pageviews: 0 } }) });
  assert.equal(card.value, '1.234');
  assert.equal(card.week, '12.345');
});

test('labels carry the UTC boundary', () => {
  assert.equal(VISITOR_TODAY_LABEL, 'Ziyaretçi · Bugün · UTC');
  assert.equal(VISITOR_WEEK_LABEL, 'Son 7 gün · bugün dahil');
});
