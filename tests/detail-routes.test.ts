import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceExists, serviceSlugFromPath, workSlugFromPath, workVerdict } from '../lib/detailRoutes';
import { SERVICE_PAGES } from '../lib/servicePages';
import { DEFAULT_CASE_STUDY_SLUGS } from '../lib/workData';

test('detail slugs are read only from /services/{slug} and /work/{slug} (decoded, trailing slash ok)', () => {
  assert.equal(serviceSlugFromPath('/services/ai-automation'), 'ai-automation');
  assert.equal(serviceSlugFromPath('/services/ai-automation/'), 'ai-automation');
  assert.equal(serviceSlugFromPath('/services/ai%2Dautomation'), 'ai-automation', 'the page gets the decoded param');
  assert.equal(serviceSlugFromPath('/services'), null, 'index page is not a detail page');
  assert.equal(serviceSlugFromPath('/services/a/b'), null, 'deeper paths are unmatched routes (already a real 404)');
  assert.equal(serviceSlugFromPath('/work/cleova'), null);
  assert.equal(serviceSlugFromPath('/services/%E0%A4%A'), null, 'undecodable → no verdict (fail open)');
  assert.equal(workSlugFromPath('/work/cleova'), 'cleova');
  assert.equal(workSlugFromPath('/work'), null);
  assert.equal(workSlugFromPath('/insights/x'), null);
});

test('every service page exists; anything else is missing', () => {
  for (const { slug } of SERVICE_PAGES) assert.equal(serviceExists(slug), true, slug);
  assert.equal(serviceExists('unknown-x'), false);
  assert.equal(serviceExists('AI-Automation'), false, 'slugs are case-sensitive, like the page');
});

test('work: 404 only when there is certainly no public project', () => {
  assert.ok(DEFAULT_CASE_STUDY_SLUGS.length > 0);
  for (const slug of DEFAULT_CASE_STUDY_SLUGS) {
    // a hidden row (invisible to the anon key) may hide a code project → the page decides
    assert.equal(workVerdict(slug, false), null, slug);
    assert.equal(workVerdict(slug, null), null, slug);
    assert.equal(workVerdict(slug, true), true, slug);
  }
  assert.equal(workVerdict('db-only-project', true), true, 'active DB row → exists');
  assert.equal(workVerdict('unknown-x', false), false, 'no active row, not a code project → 404');
  assert.equal(workVerdict('unknown-x', null), null, 'lookup failed → fail open');
});
