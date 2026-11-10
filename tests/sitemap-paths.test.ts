import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sitemapPaths } from '../lib/sitemapPaths';
import { SERVICE_PAGES } from '../lib/servicePages';

test('sitemap lists every service detail page once (the page and the sitemap share one list)', () => {
  const paths = sitemapPaths(['prime-wash-car']).map((p) => p.path);
  for (const { slug } of SERVICE_PAGES) assert.equal(paths.filter((p) => p === `/services/${slug}`).length, 1, slug);
  assert.equal(SERVICE_PAGES.length, 6);
  assert.equal(new Set(paths).size, paths.length, 'no duplicates');
  for (const p of ['/', '/about', '/overview', '/services', '/work', '/work/prime-wash-car', '/products', '/checkup', '/contact']) assert.ok(paths.includes(p), p);
  // the service page uses the same list (no second copy that could drift)
  const page = readFileSync('app/services/[slug]/page.tsx', 'utf8');
  assert.match(page, /SERVICE_PAGES/);
  assert.doesNotMatch(page, /slug: 'brand-strategy-identity'/);
});

test('privacy stays out of the static list (only added once published as final; the draft is noindex)', () => {
  assert.ok(!sitemapPaths([]).some((p) => p.path === '/privacy'));
});
