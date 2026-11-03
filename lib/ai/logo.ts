import sharp from 'sharp';
import { YOCA_LOGO_ASPECT, YOCA_LOGO_BLACK_SVG, YOCA_LOGO_WHITE_SVG } from '@/lib/brand/logoSvg';

/**
 * Yoca — small logo on AI images (server only).
 *
 * The image model never draws the logo (it would distort it). After an image
 * is generated, edited or cropped, the real logo file is placed on top:
 *   - bottom-right corner, LOGO_WIDTH_RATIO of the image width, MARGIN_RATIO
 *     from the edges;
 *   - black logo on a light corner, white logo on a dark corner (average
 *     luminance of the area under the logo).
 * The logo-free original ("master") is kept separately, so edits and crops
 * always start from a clean image and the logo is added once, at the end.
 */

export const LOGO_WIDTH_RATIO = 0.08;
export const MARGIN_RATIO = 0.03;
const MIN_LOGO_WIDTH = 48;

export interface LogoPlacement {
  logoWidth: number;
  logoHeight: number;
  left: number;
  top: number;
}

/** Where the logo goes for an image of this size. Pure; unit-tested. */
export function logoPlacement(width: number, height: number): LogoPlacement {
  const logoWidth = Math.max(MIN_LOGO_WIDTH, Math.round(width * LOGO_WIDTH_RATIO));
  const logoHeight = Math.max(1, Math.round(logoWidth / YOCA_LOGO_ASPECT));
  const margin = Math.round(width * MARGIN_RATIO);
  return {
    logoWidth,
    logoHeight,
    left: Math.max(0, width - margin - logoWidth),
    top: Math.max(0, height - margin - logoHeight),
  };
}

/** Relative luminance 0–255 from channel means (sRGB weights). Pure. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Light corner → black logo; dark corner → white logo. Pure. */
export function logoVariantFor(luma: number): 'black' | 'white' {
  return luma >= 140 ? 'black' : 'white';
}

/**
 * Returns the image (PNG) with the logo in the bottom-right corner, plus which
 * variant was used. Throws when the image cannot be read.
 */
export async function applyLogo(bytes: Buffer): Promise<{ bytes: Buffer; variant: 'black' | 'white'; placement: LogoPlacement }> {
  const base = sharp(bytes, { failOn: 'none' }).rotate();
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('Görsel boyutu okunamadı.');
  const placement = logoPlacement(width, height);

  // Note: .extract().stats() measures the whole image in sharp; cut the area
  // to its own buffer first, then measure it.
  const corner = await sharp(bytes, { failOn: 'none' })
    .rotate()
    .extract({ left: placement.left, top: placement.top, width: Math.min(placement.logoWidth, width - placement.left), height: Math.min(placement.logoHeight, height - placement.top) })
    .removeAlpha()
    .png()
    .toBuffer();
  const area = await sharp(corner).stats();
  const [r, g, b] = area.channels;
  const variant = logoVariantFor(luminance(r?.mean ?? 255, g?.mean ?? 255, b?.mean ?? 255));

  const svg = Buffer.from(variant === 'black' ? YOCA_LOGO_BLACK_SVG : YOCA_LOGO_WHITE_SVG);
  const logo = await sharp(svg, { density: 300 }).resize({ width: placement.logoWidth, height: placement.logoHeight, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

  const out = await base.composite([{ input: logo, left: placement.left, top: placement.top }]).png().toBuffer();
  return { bytes: out, variant, placement };
}
