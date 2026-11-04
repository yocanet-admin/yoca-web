import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absoluteMedia, mediaPathFor, parseMediaFile, referencesMedia } from '../lib/insightMedia';
import { publicFingerprintText } from '../lib/insightGroup';
import { normalizeImageRefs } from '../lib/ai/translateHelpers';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

test('media URL is the image id with the stored file extension', () => {
  assert.equal(mediaPathFor({ id: ID, path: `group/${ID}.png` }), `/media/insights/${ID}.png`);
  assert.equal(mediaPathFor({ id: ID, path: `group/${ID}.webp` }), `/media/insights/${ID}.webp`);
  assert.equal(mediaPathFor({ id: ID, path: 'odd' }), `/media/insights/${ID}.png`);
});

test('only "<uuid>.<image ext>" is a media file name', () => {
  assert.deepEqual(parseMediaFile(`${ID}.png`), { id: ID, ext: 'png' });
  assert.equal(parseMediaFile(`${ID}.master.png`), null);
  assert.equal(parseMediaFile(`../${ID}.png`), null);
  assert.equal(parseMediaFile(`${ID}.svg`), null);
  assert.equal(parseMediaFile('x.png'), null);
});

test('an image is served only for the exact URL a visible version uses', () => {
  const url = `/media/insights/${ID}.png`;
  assert.equal(referencesMedia({ body_md: `![a](${url})` }, url), true);
  assert.equal(referencesMedia({ cover_url: url }, url), true);
  assert.equal(referencesMedia({ og_image: url }, url), true);
  // A draft reference inside a published body is not shown to visitors (stripped) → not served.
  assert.equal(referencesMedia({ body_md: `![a](yoca-image:${ID})` }, url), false);
  assert.equal(referencesMedia({ body_md: 'no images' }, url), false);
});

test('e-mails get an absolute media URL; other URLs are kept', () => {
  assert.equal(absoluteMedia(`/media/insights/${ID}.png`, 'https://yoca.net'), `https://yoca.net/media/insights/${ID}.png`);
  assert.equal(absoluteMedia('https://cdn.example/x.png', 'https://yoca.net'), 'https://cdn.example/x.png');
  assert.equal(absoluteMedia(null, 'https://yoca.net'), null);
});

test('publishing (reference → media URL) does not count as a content change', () => {
  const draft = { title: 'T', slug: 's', excerpt: 'e', body_md: `x ![a](yoca-image:${ID}) y`, cover_url: null };
  const pub = { ...draft, body_md: `x ![a](/media/insights/${ID}.png) y` };
  const legacy = { ...draft, body_md: `x ![a](https://p.supabase.co/storage/v1/object/public/insights/g/${ID}.png) y` };
  assert.equal(publicFingerprintText(draft), publicFingerprintText(pub));
  assert.equal(publicFingerprintText(legacy), publicFingerprintText(pub));
  assert.equal(normalizeImageRefs(`![a](/media/insights/${ID}.png)`), normalizeImageRefs(`![a](yoca-image:${ID})`));
});
