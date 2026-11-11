import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceExists, serviceSlugFromPath, workLookupState, workSlugFromPath, workVerdictFromApi } from '../lib/detailRoutes';
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

test('work: hidden and unknown are both "missing"; a data-source error is never "missing"', () => {
  const code = DEFAULT_CASE_STUDY_SLUGS[0];
  assert.ok(code);
  // found (active row, or a code project with no row) → found, whatever the source status
  assert.equal(workLookupState(true, 'ok', code), 'found');
  assert.equal(workLookupState(true, 'missing_service_role', 'db-only'), 'found');
  // hidden rows were checked (ok) or there is no Supabase: not public → missing (hidden code project included)
  assert.equal(workLookupState(false, 'ok', code), 'missing', 'a hidden code project');
  assert.equal(workLookupState(false, 'ok', 'unknown-x'), 'missing');
  assert.equal(workLookupState(false, 'not_configured', 'unknown-x'), 'missing');
  // no service role: active rows were read, so a non-code slug is certain; a code slug may be hidden or not
  assert.equal(workLookupState(false, 'missing_service_role', 'unknown-x'), 'missing');
  assert.equal(workLookupState(false, 'missing_service_role', code), 'uncertain');
  // read error: nothing is certain
  assert.equal(workLookupState(false, 'read_failed', 'unknown-x'), 'uncertain');
  assert.equal(workLookupState(false, 'read_failed', code), 'uncertain');
});

test('work: the middleware 404s only on an explicit "missing" answer', () => {
  assert.equal(workVerdictFromApi('found'), true);
  assert.equal(workVerdictFromApi('missing'), false);
  for (const other of ['uncertain', undefined, null, '', 'MISSING', 404]) assert.equal(workVerdictFromApi(other), null, String(other));
});
