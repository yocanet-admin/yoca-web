/**
 * Logo on AI images: placement, variant choice, real compositing with sharp.
 * Run: npx tsx --test tests/logo.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { applyLogo, logoPlacement, logoVariantFor, luminance, LOGO_WIDTH_RATIO } from '../lib/ai/logo';
import { masterPath, shouldBrand } from '../lib/ai/images';

const solid = (r: number, g: number, b: number, w = 1536, h = 1024) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();

test('placement: bottom-right, ~8% of the width, inside the image', () => {
  const p = logoPlacement(1536, 1024);
  assert.equal(p.logoWidth, Math.round(1536 * LOGO_WIDTH_RATIO));
  assert.ok(p.left + p.logoWidth <= 1536 && p.top + p.logoHeight <= 1024);
  assert.ok(p.left > 1536 / 2 && p.top > 1024 / 2);
  const small = logoPlacement(300, 200);
  assert.equal(small.logoWidth, 48); // minimum size stays legible
});

test('variant: black on light, white on dark', () => {
  assert.equal(logoVariantFor(luminance(245, 244, 240)), 'black');
  assert.equal(logoVariantFor(luminance(12, 12, 12)), 'white');
});

test('applyLogo draws the logo only in the corner', async () => {
  for (const [bg, expected] of [[[244, 244, 241], 'black'], [[10, 10, 10], 'white']] as const) {
    const input = await solid(bg[0], bg[1], bg[2]);
    const { bytes, variant, placement } = await applyLogo(input);
    assert.equal(variant, expected);
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, 1536);
    assert.equal(meta.height, 1024);
    const region = (left: number, top: number, width: number, height: number) => sharp(bytes).extract({ left, top, width, height }).removeAlpha().png().toBuffer().then((b) => sharp(b).stats());
    const corner = await region(placement.left, placement.top, placement.logoWidth, placement.logoHeight);
    const before = luminance(bg[0], bg[1], bg[2]);
    const after = luminance(corner.channels[0].mean, corner.channels[1].mean, corner.channels[2].mean);
    assert.ok(Math.abs(after - before) > 20, `logo visible in the corner (${before} → ${after})`);
    const topLeft = await region(0, 0, 200, 200);
    assert.ok(Math.abs(luminance(topLeft.channels[0].mean, topLeft.channels[1].mean, topLeft.channels[2].mean) - before) < 1, 'rest of the image unchanged');
  }
});

test('master path and brand rule', () => {
  assert.equal(masterPath('g/abc.png'), 'g/abc.master.png');
  assert.equal(masterPath('g/abc.jpg'), 'g/abc.master.png');
  assert.equal(shouldBrand({ origin: 'ai' }), true);
  assert.equal(shouldBrand({ origin: 'upload' }), false);
});
