/**
 * Yoca — Teklifler ve Belgeler: A4 PDF design layer (server only, @react-pdf/renderer).
 *
 * Design reference: "Yoca kurumsal belge tasarım kiti" (5 Kasım 2026). The
 * kit's ReportLab sample generator places fixed sample text at fixed
 * coordinates; it is NOT used here. This file rebuilds the same look on the
 * existing document data with automatic page breaking.
 *
 *  - Teklif / proforma ("sidebar"): 146 pt dark side band on every page with
 *    the logo, document type and document facts, and the company block that
 *    grows upwards from the bottom; off-white (#F2F2EC) main surface with the
 *    section label, the editable document title as a strong headline, the
 *    detailed line-item table (quantity, unit, discount and tax columns kept),
 *    totals and the lime total block; then "plan ve koşullar".
 *  - Antetli yazı / durum raporu / teslim belgesi ("letterhead"): dark
 *    letterhead with the lime date block on the right, a thin dark + lime band
 *    on the left edge of every page, recipient and document number, headline,
 *    sections, signature and the dark contact block at the bottom.
 *  - Continuation pages: smaller letterhead (letters) / the same side band
 *    (quotes); the brand band and the page number stay on every page.
 *  - Company facts come ONLY from the Issuer passed in (one company profile
 *    revision per PDF). Empty facts print nothing: no label, no separator.
 *  - Logo: the original vector paths of public/brand/yoca-logo-primary.svg
 *    (white word mark with the lime/green modules), with its own viewBox and
 *    aspect ratio — not the PNG from the kit, not redrawn, not recoloured.
 *  - Colours: #0D0E12, #A2FF00, #40C401, #F2F2EC; body text dark; no lime on
 *    small text over light surfaces. The full background prints (no
 *    "economy" white variant by default).
 *  - Type: Manrope (SIL OFL 1.1, lib/documents/fonts/OFL.txt), embedded. The
 *    kit's samples used Noto Sans; every page was re-checked with Manrope.
 *
 * Page breaks: a heading never stays without its first paragraph; table rows,
 * the totals block, the payment plan, bank details and the signature never
 * split; the table header repeats on continuation pages; the bottom contact
 * block's height is reserved from the body so the footer never overflows.
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import type { BankAccount } from '@/lib/documents/settings';
import { formatIban } from '@/lib/documents/settings';
import { BLOCK_LABEL, KIND_DEF, KIND_LABEL, bodyParts, type Block, type DocContent, type DocKind, type Issuer } from '@/lib/documents/model';
import { computeDocument, fmtMoney, fmtPct, fmtQty, parseMoney } from '@/lib/documents/calc';

// @react-pdf/renderer is ESM-only ("import" export condition): it is loaded with
// a dynamic import, so this module also works where it is compiled as CommonJS.
type RP = typeof import('@react-pdf/renderer');
let R = null as unknown as RP;
async function loadRenderer(): Promise<RP> {
  if (!R) R = await import('@react-pdf/renderer');
  return R;
}

/* ── Fonts & logo ─────────────────────────────────────────────── */

const FONT_DIR = path.join(process.cwd(), 'lib', 'documents', 'fonts');
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  R.Font.register({
    family: 'Manrope',
    fonts: [
      { src: path.join(FONT_DIR, 'Manrope-Regular.ttf'), fontWeight: 400 },
      { src: path.join(FONT_DIR, 'Manrope-Medium.ttf'), fontWeight: 500 },
      { src: path.join(FONT_DIR, 'Manrope-SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(FONT_DIR, 'Manrope-Bold.ttf'), fontWeight: 700 },
      { src: path.join(FONT_DIR, 'Manrope-ExtraBold.ttf'), fontWeight: 800 },
    ],
  });
  // No English-pattern hyphenation of Turkish words. Very long tokens (URLs,
  // IBANs, e-mail addresses) get break points so they never leave their column.
  R.Font.registerHyphenationCallback((word) => {
    if (word.length <= 24) return [word];
    const parts: string[] = [];
    for (let i = 0; i < word.length; i += 16) parts.push(word.slice(i, i + 16));
    return parts;
  });
  fontsReady = true;
}

interface SvgData { viewBox: [number, number, number, number]; paths: Array<{ d: string; fill: string }> }
const svgCache = new Map<string, SvgData>();
export function loadBrandSvg(file: 'yoca-logo-primary.svg' | 'yoca-logo-light-bg.svg'): SvgData {
  const hit = svgCache.get(file);
  if (hit) return hit;
  const svg = fs.readFileSync(path.join(process.cwd(), 'public', 'brand', file), 'utf8');
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1].trim().split(/\s+/).map(Number) as [number, number, number, number] | undefined;
  const paths = Array.from(svg.matchAll(/<path\s+fill="(#[0-9A-Fa-f]{3,8})"\s+d="([^"]+)"\s*\/>/g)).map((m) => ({ fill: m[1], d: m[2] }));
  if (!vb || vb.length !== 4 || !paths.length) throw new Error(`Yoca logosu okunamadı (public/brand/${file}).`);
  const data = { viewBox: vb, paths };
  svgCache.set(file, data);
  return data;
}
export const loadLogo = () => loadBrandSvg('yoca-logo-primary.svg');

/** The original white logo for dark surfaces; width given, height from the file's aspect ratio. */
function Logo({ width }: { width: number }) {
  const logo = loadBrandSvg('yoca-logo-primary.svg');
  const [, , w, h] = logo.viewBox;
  return (
    <R.Svg viewBox={logo.viewBox.join(' ')} style={{ width, height: (width * h) / w }}>
      {logo.paths.map((p, i) => <R.Path key={i} d={p.d} fill={p.fill} />)}
    </R.Svg>
  );
}

/* ── Labels ───────────────────────────────────────────────────── */

const L = {
  tr: {
    brandDocs: 'Yoca / Belgeler', number: 'Belge no', issued: 'Düzenleme', valid: 'Geçerlilik', currency: 'Para birimi', source: 'Kaynak teklif', version: 'Sürüm', period: 'Dönem',
    scope: 'Kapsam ve yatırım', scopeProforma: 'Kapsam ve tutarlar', plan: 'Plan ve koşullar', planHeadline: 'Plan ve koşullar.',
    client: 'Müşteri', project: 'Proje', recipient: 'Alıcı', attention: 'İlgili', taxOffice: 'Vergi dairesi', taxNo: 'Vergi no', mersis: 'MERSİS', tradeReg: 'Ticaret sicil', kep: 'KEP',
    desc: 'Açıklama', qty: 'Miktar', unitPrice: 'Birim fiyat', disc: 'İnd.', tax: 'KDV', amount: 'Tutar',
    subtotal: 'Ara toplam', discount: 'İndirim', net: 'Net tutar', taxLine: (r: string) => `KDV %${r}`, base: 'matrah', grand: 'Genel toplam', investment: 'Toplam yatırım', taxIncl: 'KDV dahil', taxExcl: 'KDV hariç',
    missingTotal: (n: number) => `Genel toplam hesaplanmadı: ${n} kalemin fiyatı eksik.`, priceMissing: 'Fiyat eksik',
    payment: 'Ödeme planı', delivery: 'Takvim', bank: 'Banka bilgileri', holder: 'Hesap sahibi', iban: 'IBAN', swift: 'SWIFT', branch: 'Şube',
    proforma: 'Proforma • fatura yerine geçmez', proformaSub: 'Ödeme bilgisi içindir; resmî fatura değildir ve tahsilat yapıldığını göstermez.',
    subject: 'Konu', reference: 'İlgi', contact: 'İletişim',
    draft: 'Taslak', draftLine: 'Taslak · kesinleşmemiş belge', versionLine: (v: number, at: string) => `Sürüm ${v} · ${at}`, sample: 'Örnek belge / sentetik bilgiler',
    brandKind: (k: string) => `Yoca / ${k}`,
  },
  en: {
    brandDocs: 'Yoca / Documents', number: 'Document no', issued: 'Issued', valid: 'Valid until', currency: 'Currency', source: 'Source quotation', version: 'Version', period: 'Period',
    scope: 'Scope and investment', scopeProforma: 'Scope and amounts', plan: 'Plan and terms', planHeadline: 'Plan and terms.',
    client: 'Client', project: 'Project', recipient: 'To', attention: 'Attn.', taxOffice: 'Tax office', taxNo: 'Tax no', mersis: 'MERSIS', tradeReg: 'Trade registry', kep: 'KEP',
    desc: 'Description', qty: 'Qty', unitPrice: 'Unit price', disc: 'Disc.', tax: 'VAT', amount: 'Amount',
    subtotal: 'Subtotal', discount: 'Discount', net: 'Net amount', taxLine: (r: string) => `VAT ${r}%`, base: 'base', grand: 'Grand total', investment: 'Total investment', taxIncl: 'incl. VAT', taxExcl: 'excl. VAT',
    missingTotal: (n: number) => `Grand total not calculated: ${n} line(s) without a price.`, priceMissing: 'Price missing',
    payment: 'Payment plan', delivery: 'Timeline', bank: 'Bank details', holder: 'Account holder', iban: 'IBAN', swift: 'SWIFT', branch: 'Branch',
    proforma: 'Proforma • fatura yerine geçmez (not an invoice)', proformaSub: 'For payment information only; not a tax invoice and not a confirmation of payment.',
    subject: 'Subject', reference: 'Reference', contact: 'Contact',
    draft: 'Draft', draftLine: 'Draft · not final', versionLine: (v: number, at: string) => `Version ${v} · ${at}`, sample: 'Sample document / synthetic data',
    brandKind: (k: string) => `Yoca / ${k}`,
  },
} as const;
type Labels = (typeof L)['tr'] | (typeof L)['en'];

const MONTHS = {
  tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

export function fmtDate(iso: string, locale: 'tr' | 'en'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[locale][Number(m[2]) - 1]} ${m[1]}`;
}
/** 05.11.2026 (tr) / 05/11/2026 (en) — the kit's compact form for the side band. */
function fmtShort(iso: string, locale: 'tr' | 'en'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return locale === 'tr' ? `${m[3]}.${m[2]}.${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

/* ── Palette & measures ───────────────────────────────────────── */

const C = {
  dark: '#0D0E12', lime: '#A2FF00', green: '#40C401', paper: '#F2F2EC',
  ink: '#0D0E12', soft: '#3A3D38', muted: '#62665F', rule: '#CDD0C6', label: '#397800',
  onDark: '#FFFFFF', onDarkLabel: '#92968F', onDarkSoft: '#BDC0B8', onDarkKicker: '#B0B3AB', warn: '#8A2E0B',
};
const W = 595.28;
const H = 841.89;
const SIDE = 146;          // side band width (quote / proforma)
const MAIN_X = 176;        // main column x
const MAIN_R = 36;         // main column right margin
const MAIN_W = W - MAIN_X - MAIN_R;
const LX = 44;             // letter content x
const LR = 44;             // letter right margin
const LETTER_W = W - LX - LR;
const FOOT_LINE = 786;     // footer rule y (from top)

let UP_LOCALE = 'tr-TR';
const up = (text: string) => text.toLocaleUpperCase(UP_LOCALE);
const two = (n: number) => String(n).padStart(2, '0');
/** Percent in the document language: %20 (tr) / 20% (en). */
const pct = (bp: bigint, locale: 'tr' | 'en') => (locale === 'tr' ? `%${fmtPct(bp, locale)}` : `${fmtPct(bp, locale)}%`);
const pctText = (v: string, locale: 'tr' | 'en') => (locale === 'tr' ? `%${v.replace('.', ',')}` : `${v.replace(',', '.')}%`);

/** Conservative line count for a text in a column (Manrope ≈ 0.56 em per character; 0.6 used). */
function lines(text: string, width: number, size: number): number {
  const per = Math.max(8, Math.floor(width / (size * 0.6)));
  return text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0);
}

// No lineHeight on the page: an inherited lineHeight stops react-pdf from drawing
// the dynamic page number. Every Text style sets its own size and line height.
const st = {
  label: { fontSize: 7.6, fontWeight: 800, letterSpacing: 0.6, color: C.label, lineHeight: 1.3 },
  labelMuted: { fontSize: 7.6, fontWeight: 800, letterSpacing: 0.6, color: C.muted, lineHeight: 1.3 },
  headline: { fontSize: 30, fontWeight: 800, color: C.ink, lineHeight: 1.22, letterSpacing: -0.3 },
  sub: { fontSize: 10, color: C.muted, lineHeight: 1.5 },
  lead: { fontSize: 11, color: C.ink, lineHeight: 1.55 },
  body: { fontSize: 10, color: C.ink, lineHeight: 1.55 },
  small: { fontSize: 8.6, color: C.muted, lineHeight: 1.5 },
  strong: { fontSize: 10, fontWeight: 800, color: C.ink, lineHeight: 1.45 },
  li: { flexDirection: 'row', marginBottom: 4 },
  liMark: { width: 4.5, height: 4.5, backgroundColor: C.green, marginTop: 5.2, marginRight: 9 },
  liText: { flexGrow: 1, flexBasis: 0, fontSize: 10, color: C.ink, lineHeight: 1.55 },
  rule: { height: 0.6, backgroundColor: C.rule },

  // side band
  side: { position: 'absolute', top: 0, left: 0, bottom: 0, width: SIDE, backgroundColor: C.dark },
  sideKicker: { position: 'absolute', top: 102, left: 23, fontSize: 7.6, fontWeight: 800, color: C.onDarkKicker, letterSpacing: 0.6 },
  sideBar: { position: 'absolute', top: 151, left: 23, width: 100, height: 3, backgroundColor: C.lime },
  sideKind: { position: 'absolute', top: 172, left: 23, width: 105, fontSize: 18, fontWeight: 800, color: C.onDark, lineHeight: 1.3 },
  sideMeta: { position: 'absolute', top: 297, left: 23, width: 108 },
  sideMetaLabel: { fontSize: 7.6, fontWeight: 800, color: C.onDarkLabel, letterSpacing: 0.6, lineHeight: 1.3 },
  sideMetaValue: { fontSize: 9.6, color: C.onDark, lineHeight: 1.4, marginTop: 4, marginBottom: 20 },
  sideDraft: { alignSelf: 'flex-start', backgroundColor: C.lime, color: C.dark, fontSize: 7.4, fontWeight: 800, letterSpacing: 0.8, paddingVertical: 2.5, paddingHorizontal: 6, marginBottom: 18 },
  sideCompany: { position: 'absolute', left: 23, width: 103, bottom: H - 772 },
  sideCompanyLine: { fontSize: 7.8, color: C.onDarkSoft, lineHeight: 1.45, marginBottom: 3 },
  sideCompanyLegal: { fontSize: 7, color: C.onDarkSoft, lineHeight: 1.45, marginBottom: 3 },

  // table
  thead: { flexDirection: 'row', backgroundColor: C.dark, paddingVertical: 7.5, paddingHorizontal: 10 },
  th: { fontSize: 7.2, fontWeight: 800, color: C.onDark, letterSpacing: 0.5 },
  row: { paddingTop: 11, paddingBottom: 11, paddingHorizontal: 10, borderBottomWidth: 0.6, borderBottomColor: C.rule },
  rowTop: { flexDirection: 'row' },
  cNo: { width: 17 },
  cDesc: { flexGrow: 1, flexBasis: 0, paddingRight: 8 },
  cQty: { width: 54, textAlign: 'right', paddingRight: 6 },
  cPrice: { width: 64, textAlign: 'right', paddingRight: 6 },
  cDisc: { width: 32, textAlign: 'right', paddingRight: 6 },
  cTax: { width: 32, textAlign: 'right', paddingRight: 6 },
  cAmt: { width: 70, textAlign: 'right' },
  no: { fontSize: 9, fontWeight: 800, color: C.label, lineHeight: 1.45 },
  itemTitle: { fontSize: 11, fontWeight: 800, color: C.ink, lineHeight: 1.35 },
  itemDesc: { fontSize: 9, color: C.muted, lineHeight: 1.55, marginTop: 5, marginLeft: 17, marginRight: 80 },
  num: { fontSize: 9.2, color: C.ink, lineHeight: 1.45 },
  fig: { fontSize: 8.8, color: C.soft, lineHeight: 1.4 },
  amount: { fontSize: 10, fontWeight: 800, color: C.ink, lineHeight: 1.4 },
  missing: { fontSize: 8, fontWeight: 800, color: C.warn, lineHeight: 1.4 },

  // totals
  tRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4.5 },
  tLabel: { fontSize: 9, color: C.muted, lineHeight: 1.4 },
  tBase: { fontSize: 7.6, color: C.muted, lineHeight: 1.4 },
  tValue: { fontSize: 10, color: C.ink, lineHeight: 1.4, textAlign: 'right' },
  grand: { backgroundColor: C.lime, paddingTop: 13, paddingBottom: 14, paddingHorizontal: 14, marginTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  grandLabel: { fontSize: 7.6, fontWeight: 800, color: C.dark, letterSpacing: 0.6, lineHeight: 1.3 },
  grandValue: { fontSize: 29, fontWeight: 800, color: C.dark, lineHeight: 1.15, marginTop: 8 },
  grandCur: { fontSize: 10, fontWeight: 800, color: C.dark, lineHeight: 1.3, marginBottom: 6 },
  warnBox: { borderWidth: 1, borderColor: C.warn, paddingVertical: 10, paddingHorizontal: 12, marginTop: 18 },

  // footer
  foot: { position: 'absolute', top: FOOT_LINE, height: 0.6, backgroundColor: C.rule },
  footText: { position: 'absolute', top: FOOT_LINE + 12, fontSize: 6.6, color: C.muted, letterSpacing: 0.4, lineHeight: 1.3 },
  pageNo: { position: 'absolute', top: FOOT_LINE + 10, width: 80, textAlign: 'right', fontSize: 9, fontWeight: 800, color: C.ink, lineHeight: 1.3 },

  // letterhead
  edge: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 14, backgroundColor: C.dark },
  edgeLime: { position: 'absolute', top: 0, left: 14, width: 5, height: 180, backgroundColor: C.lime },
  head: { marginTop: -92, marginLeft: -(LX - 19), marginRight: -LR, height: 127, backgroundColor: C.dark, flexDirection: 'row' },
  headLeft: { flexGrow: 1, paddingLeft: LX - 19, paddingTop: 31 },
  headKicker: { fontSize: 7.6, fontWeight: 800, color: '#BFC3B9', letterSpacing: 0.6, marginTop: 20, lineHeight: 1.3 },
  dateBlock: { width: 181, backgroundColor: C.lime, paddingLeft: 20, paddingTop: 14 },
  dateDay: { fontSize: 49, fontWeight: 800, color: C.dark, lineHeight: 1.1 },
  dateMonth: { fontSize: 10, fontWeight: 800, color: C.dark, lineHeight: 1.3, marginTop: 6 },
  cHead: { position: 'absolute', top: 0, left: 19, right: 0, height: 56, backgroundColor: C.dark, flexDirection: 'row', alignItems: 'center' },
  cDate: { position: 'absolute', top: 0, right: 0, width: 120, height: 56, backgroundColor: C.lime, paddingLeft: 14, justifyContent: 'center' },
  cDateText: { fontSize: 9, fontWeight: 800, color: C.dark, lineHeight: 1.3 },
  contactBox: { position: 'absolute', left: LX, right: LR, backgroundColor: C.dark, paddingTop: 12, paddingBottom: 13, paddingHorizontal: 13 },
  contactLabel: { fontSize: 7.6, fontWeight: 800, color: C.lime, letterSpacing: 0.6, lineHeight: 1.3 },
  contactText: { fontSize: 9, color: C.onDark, lineHeight: 1.5, marginTop: 7 },
  legalLine: { position: 'absolute', left: LX, right: LR, fontSize: 6.8, color: C.muted, lineHeight: 1.45 },
} as const;

/* ── Shared pieces ────────────────────────────────────────────── */

type PartT = { type: 'p' | 'li' | 'h'; text: string };

function Part({ p, prev, size = 10, last = false }: { p: PartT; prev?: PartT['type']; size?: number; last?: boolean }) {
  if (p.type === 'h') return <R.Text style={[st.strong, { fontSize: size + 1, marginTop: prev ? 6 : 0, marginBottom: 6 }]}>{p.text}</R.Text>;
  if (p.type === 'p') return <R.Text style={[st.body, { fontSize: size, marginBottom: last ? 0 : 9, marginTop: prev === 'li' ? 4 : 0 }]} orphans={2} widows={2}>{p.text}</R.Text>;
  return (
    <R.View style={[st.li, last ? { marginBottom: 0 } : {}]} wrap={false}>
      <R.View style={st.liMark} />
      <R.Text style={[st.liText, { fontSize: size }]}>{p.text}</R.Text>
    </R.View>
  );
}

/**
 * A section whose heading always travels with the start of its content.
 *  - Short sections (estimated ≤ 130 pt) move as one piece.
 *  - Longer ones flow: the heading (and `before`, e.g. the "02 / Plan ve
 *    koşullar" opener) asks for at least two lines of the section below it on
 *    the same page (minPresenceAhead) instead of dragging the whole section to
 *    the next page; paragraphs keep at least two lines on each side of a break;
 *    the last two list items stay together, and `after` (the signature) stays
 *    with the last part.
 * The last part has no bottom margin; `gap` is the only space after a section.
 */
function Section({ heading, body, list, headingStyle, size = 10, gap = 18, before, after, afterGap = 6, width = MAIN_W }: { heading: React.ReactNode; body: string; list: boolean; headingStyle?: 'label' | 'strong'; size?: number; gap?: number; before?: React.ReactNode; after?: React.ReactNode; afterGap?: number; width?: number }) {
  const parts = bodyParts(body, list);
  if (!parts.length) return null;
  const head = headingStyle === 'strong'
    ? <R.Text style={[st.strong, { fontSize: 11, marginBottom: 7 }]}>{heading}</R.Text>
    : <R.Text style={[st.label, { marginBottom: 9 }]}>{heading}</R.Text>;
  const n = parts.length;
  const part = (i: number) => <Part key={i} p={parts[i]} prev={parts[i - 1]?.type} size={size} last={i === n - 1} />;
  const tailAfter = after ? <R.View style={{ marginTop: afterGap }}>{after}</R.View> : null;
  const lineH = size * 1.55;
  const est = parts.reduce((h, p) => h + lines(p.text, p.type === 'li' ? width - 14 : width, size) * lineH + (p.type === 'li' ? 4 : 9), 20);
  if (est <= 130) {
    return (
      <R.View wrap={false} style={{ marginBottom: gap }}>
        {before}
        {head}
        {parts.map((_, i) => part(i))}
        {tailAfter}
      </R.View>
    );
  }
  const tailN = Math.min(n, parts[n - 1].type === 'li' ? 2 : after ? 1 : 0);
  const idx = parts.map((_, i) => i);
  if (n - tailN === 0) {
    return <R.View wrap={false} style={{ marginBottom: gap }}>{before}{head}{parts.map((_, i) => part(i))}{tailAfter}</R.View>;
  }
  return (
    <R.View style={{ marginBottom: gap }}>
      <R.View wrap={false} minPresenceAhead={lineH * 2 + 6}>{before}{head}</R.View>
      {idx.slice(0, n - tailN).map(part)}
      {tailN || tailAfter ? <R.View wrap={false}>{idx.slice(n - tailN).map(part)}{tailAfter}</R.View> : null}
    </R.View>
  );
}

/** Company lines (only filled fields, never a label for an empty one). */
function companyLines(issuer: Issuer, t: Labels): { contact: string[]; legal: string[] } {
  const contact = [issuer.legalName, issuer.address, issuer.phone, issuer.email, issuer.website?.replace(/^https?:\/\//, '')].map((s) => (s ?? '').trim()).filter(Boolean);
  const legal = [
    [issuer.taxOffice, issuer.taxNumber].map((s) => (s ?? '').trim()).filter(Boolean).join(' · '),
    issuer.mersis?.trim() ? `${t.mersis} ${issuer.mersis.trim()}` : '',
    issuer.tradeRegistry?.trim() ? `${t.tradeReg} ${issuer.tradeRegistry.trim()}` : '',
    issuer.kep?.trim() ? `${t.kep} ${issuer.kep.trim()}` : '',
  ].filter(Boolean);
  return { contact, legal };
}

function footerNote(input: RenderInput, t: Labels): string {
  const status = input.mode === 'draft' ? t.draftLine : input.version ? t.versionLine(input.version, input.versionAt ?? '') : '';
  return up([input.sample ? t.sample : '', status].filter(Boolean).join(' · '));
}

function Signature({ input, x = 0, ruleWidth = 172 }: { input: RenderInput; x?: number; ruleWidth?: number }) {
  const c = input.content;
  const brand = input.issuer.legalName || input.issuer.brand;
  const sub = [c.signatory.title, c.signatory.name ? brand : ''].filter(Boolean).join(' · ');
  return (
    <R.View wrap={false} style={{ marginLeft: x }}>
      {c.closing ? <R.Text style={[st.body, { marginTop: 8 }]}>{c.closing}</R.Text> : null}
      {/* room for a handwritten signature above the rule */}
      <R.View style={{ width: ruleWidth, height: 0.8, backgroundColor: C.ink, marginTop: 26, marginBottom: 10 }} />
      <R.Text style={[st.strong, { fontSize: 12 }]}>{c.signatory.name || brand}</R.Text>
      {sub ? <R.Text style={[st.small, { marginTop: 2 }]}>{sub}</R.Text> : null}
    </R.View>
  );
}

function BankBlock({ banks, t }: { banks: BankAccount[]; t: Labels }) {
  if (!banks.length) return null;
  return (
    <R.View wrap={false}>
      <R.Text style={[st.label, { marginBottom: 9 }]}>{up(t.bank)}</R.Text>
      {banks.map((a, i) => (
        <R.View key={a.id} style={{ marginBottom: i === banks.length - 1 ? 0 : 10 }}>
          <R.Text style={st.strong}>{[a.bank, a.currency].filter(Boolean).join(' · ')}</R.Text>
          {a.holder ? <R.Text style={st.body}>{t.holder}: {a.holder}</R.Text> : null}
          <R.Text style={[st.body, { fontWeight: 700 }]}>{t.iban} {formatIban(a.iban)}</R.Text>
          {[a.swift ? `${t.swift} ${a.swift}` : '', a.branch ? `${t.branch} ${a.branch}` : ''].filter(Boolean).length ? <R.Text style={st.small}>{[a.swift ? `${t.swift} ${a.swift}` : '', a.branch ? `${t.branch} ${a.branch}` : ''].filter(Boolean).join(' · ')}</R.Text> : null}
        </R.View>
      ))}
    </R.View>
  );
}

/* ── Input ────────────────────────────────────────────────────── */

export interface RenderInput {
  kind: DocKind;
  number: string;
  title: string;
  content: DocContent;
  /** Company facts from ONE company profile revision. */
  issuer: Issuer;
  bankAccounts: BankAccount[];
  mode: 'draft' | 'final';
  version?: number;
  /** Local display time of the version (e.g. "5 Kasım 2026 14:03"). */
  versionAt?: string;
  sourceNumber?: string | null;
  sample?: boolean;
}

/* ── Quote / proforma (side band) ─────────────────────────────── */

function SideBand({ input, t }: { input: RenderInput; t: Labels }) {
  const c = input.content;
  const def = KIND_DEF[input.kind];
  const kind = input.kind === 'quote' ? (c.locale === 'tr' ? 'Fiyat teklifi' : 'Price quotation') : 'Proforma';
  const meta: Array<[string, string]> = [[t.number, input.number], [t.issued, fmtShort(c.issueDate, c.locale)]];
  if (def.validity && c.validUntil) meta.push([t.valid, fmtShort(c.validUntil, c.locale)]);
  meta.push([t.currency, c.currency]);
  if (input.sourceNumber) meta.push([t.source, input.sourceNumber]);
  const { contact, legal } = companyLines(input.issuer, t);
  return (
    <>
      <R.View style={st.side} fixed />
      <R.View style={{ position: 'absolute', top: 35, left: 23 }} fixed><Logo width={101} /></R.View>
      <R.Text style={st.sideKicker} fixed>{up(t.brandDocs)}</R.Text>
      <R.View style={st.sideBar} fixed />
      <R.Text style={st.sideKind} fixed>{kind}</R.Text>
      <R.View style={st.sideMeta} fixed>
        {input.mode === 'draft' ? <R.Text style={st.sideDraft}>{up(t.draft)}</R.Text> : null}
        {meta.map(([k, v]) => (
          <R.View key={k}>
            <R.Text style={st.sideMetaLabel}>{up(k)}</R.Text>
            <R.Text style={st.sideMetaValue}>{v}</R.Text>
          </R.View>
        ))}
      </R.View>
      {contact.length || legal.length ? (
        <R.View style={st.sideCompany} fixed>
          {contact.map((l, i) => <R.Text key={`c${i}`} style={st.sideCompanyLine}>{l}</R.Text>)}
          {legal.map((l, i) => <R.Text key={`l${i}`} style={st.sideCompanyLegal}>{l}</R.Text>)}
        </R.View>
      ) : null}
    </>
  );
}

/**
 * Detailed table, kit look: dark header bar; each row shows the title on a
 * full-width first line with its amount, then quantity / unit price / discount
 * / tax in their own columns under the header labels, then the description.
 * All data columns stay; titles do not get squeezed into a narrow column.
 */
function ItemsTable({ c, t, tail }: { c: DocContent; t: Labels; tail?: React.ReactNode }) {
  const { totals } = computeDocument(c);
  const showDisc = c.items.some((i) => i.discountPct.trim() && i.discountPct.trim() !== '0');
  if (!totals.lines.length) return null;
  return (
    <R.View>
      <R.View style={st.thead} fixed>
        <R.Text style={[st.th, { width: 17 }]}>#</R.Text>
        <R.Text style={[st.th, st.cDesc]}>{up(t.desc)}</R.Text>
        <R.Text style={[st.th, st.cQty]}>{up(t.qty)}</R.Text>
        <R.Text style={[st.th, st.cPrice]}>{up(t.unitPrice)}</R.Text>
        {showDisc ? <R.Text style={[st.th, st.cDisc]}>{up(t.disc)}</R.Text> : null}
        <R.Text style={[st.th, st.cTax]}>{up(t.tax)}</R.Text>
        <R.Text style={[st.th, st.cAmt, { paddingRight: 0 }]}>{up(t.amount)} · {c.currency}</R.Text>
      </R.View>
      {totals.lines.map((l, li) => {
        const it = c.items[l.index];
        const row = (
          <R.View key={l.id} style={st.row} wrap={false}>
            <R.View style={st.rowTop}>
              <R.Text style={[st.no, st.cNo]}>{two(l.index + 1)}</R.Text>
              <R.Text style={[st.itemTitle, { flexGrow: 1, flexBasis: 0, paddingRight: 12 }]}>{it.title || '—'}</R.Text>
              {l.missingPrice ? <R.Text style={[st.missing, st.cAmt]}>{t.priceMissing}</R.Text> : <R.Text style={[st.amount, st.cAmt]}>{l.net !== null ? fmtMoney(l.net, c.currency, c.locale, false) : ''}</R.Text>}
            </R.View>
            <R.View style={[st.rowTop, { marginTop: 5 }]}>
              <R.View style={st.cNo} />
              <R.View style={st.cDesc} />
              <R.Text style={[st.fig, st.cQty]}>{fmtQty(it.quantity, c.locale)}{it.unit ? ` ${it.unit}` : ''}</R.Text>
              <R.Text style={[st.fig, st.cPrice]}>{l.missingPrice ? '—' : fmtMoney(parseMoney(it.unitPrice) ?? BigInt(0), c.currency, c.locale, false)}</R.Text>
              {showDisc ? <R.Text style={[st.fig, st.cDisc]}>{it.discountPct && it.discountPct !== '0' ? pctText(it.discountPct, c.locale) : '—'}</R.Text> : null}
              <R.Text style={[st.fig, st.cTax]}>{l.taxRateBp !== null ? pct(l.taxRateBp, c.locale) : ''}</R.Text>
              <R.View style={st.cAmt} />
            </R.View>
            {it.description ? <R.Text style={st.itemDesc}>{it.description}</R.Text> : null}
          </R.View>
        );
        // the totals never start a page on their own: they keep the last row with them
        return li === totals.lines.length - 1 && tail ? <R.View key={l.id} wrap={false}>{row}{tail}</R.View> : row;
      })}
    </R.View>
  );
}

function Totals({ input, t }: { input: RenderInput; t: Labels }) {
  const c = input.content;
  const { totals } = computeDocument(c);
  const money = (m: bigint) => fmtMoney(m, c.currency, c.locale, false) + ` ${c.currency}`;
  if (!totals.lines.length) return null;
  const grandLabel = `${up(input.kind === 'quote' ? t.investment : t.grand)}${totals.tax > BigInt(0) ? ` / ${up(t.taxIncl)}` : ''}`;
  return (
    <R.View wrap={false} style={{ marginTop: 20 }}>
      <R.View style={st.tRow}><R.Text style={st.tLabel}>{t.subtotal}</R.Text><R.Text style={st.tValue}>{money(totals.subtotal)}</R.Text></R.View>
      {totals.discount > BigInt(0) ? <R.View style={st.tRow}><R.Text style={st.tLabel}>{t.discount}</R.Text><R.Text style={st.tValue}>−{money(totals.discount)}</R.Text></R.View> : null}
      {totals.discount > BigInt(0) ? <R.View style={st.tRow}><R.Text style={st.tLabel}>{t.net}</R.Text><R.Text style={st.tValue}>{money(totals.net)}</R.Text></R.View> : null}
      {totals.taxes.map((x) => (
        <R.View key={String(x.rateBp)} style={st.tRow}>
          <R.Text style={st.tLabel}>{t.taxLine(fmtPct(x.rateBp, c.locale))} <R.Text style={st.tBase}>({t.base} {money(x.base)})</R.Text></R.Text>
          <R.Text style={st.tValue}>{money(x.tax)}</R.Text>
        </R.View>
      ))}
      {totals.grand !== null ? (
        <R.View style={st.grand}>
          <R.View>
            <R.Text style={st.grandLabel}>{grandLabel}</R.Text>
            <R.Text style={st.grandValue}>{fmtMoney(totals.grand, c.currency, c.locale, false)}</R.Text>
          </R.View>
          <R.Text style={st.grandCur}>{c.currency}</R.Text>
        </R.View>
      ) : (
        <R.View style={st.warnBox}><R.Text style={st.missing}>{t.missingTotal(totals.missingPrices.length + totals.errors.length)}</R.Text></R.View>
      )}
    </R.View>
  );
}

function PaymentBlock({ c, t }: { c: DocContent; t: Labels }) {
  const { payment } = computeDocument(c);
  if (!payment.rows.length) return null;
  const money = (m: bigint) => `${fmtMoney(m, c.currency, c.locale, false)} ${c.currency}`;
  const allPct = payment.rows.every((r) => r.pctBp !== null);
  const summary = allPct ? payment.rows.map((r) => `${pct(r.pctBp as bigint, c.locale)} ${r.label.toLocaleLowerCase(UP_LOCALE)}`).join(' / ') : '';
  return (
    <R.View wrap={false}>
      <R.View style={[st.rule, { marginBottom: 14 }]} />
      <R.Text style={[st.labelMuted, { marginBottom: 9 }]}>{up(t.payment)}</R.Text>
      {summary ? <R.Text style={[st.strong, { fontSize: 12, marginBottom: 10 }]}>{summary}</R.Text> : null}
      {payment.rows.map((r) => (
        <R.View key={r.id} style={{ flexDirection: 'row', paddingVertical: 5, borderTopWidth: 0.6, borderTopColor: C.rule }}>
          <R.View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 10 }}>
            <R.Text style={[st.body, { fontWeight: 700 }]}>{r.pctBp !== null ? `${pct(r.pctBp, c.locale)} · ` : ''}{r.label}</R.Text>
            {r.due ? <R.Text style={st.small}>{r.due}</R.Text> : null}
          </R.View>
          <R.Text style={[st.amount, { width: 110, textAlign: 'right' }]}>{r.amount !== null ? money(r.amount) : '—'}</R.Text>
        </R.View>
      ))}
    </R.View>
  );
}

/** Internal layout options for the second rendering pass (see renderDocumentPdf). */
interface LayoutOpts { planBreak?: boolean; probe?: { planPage: number } }

function SidebarDocument({ input, layout }: { input: RenderInput; layout?: LayoutOpts }) {
  const c = input.content;
  const t = L[c.locale];
  const def = KIND_DEF[input.kind];
  const r = c.recipient;
  const clientName = r.company || r.name;
  const recipientLines = [
    r.company && r.name ? r.name : '', r.attention ? `${t.attention}: ${r.attention}` : '', r.address,
    [r.taxOffice ? `${t.taxOffice}: ${r.taxOffice}` : '', r.taxNumber ? `${t.taxNo}: ${r.taxNumber}` : ''].filter(Boolean).join(' · '),
    [r.email, r.phone].filter(Boolean).join(' · '),
  ].filter(Boolean);
  const blocks = c.blocks.filter((b) => b.body.trim());
  const intro = blocks.find((b) => b.key === 'intro');
  const terms = blocks.filter((b) => b.key !== 'intro');
  const banks = def.bank ? input.bankAccounts.filter((a) => c.bankAccountIds.includes(a.id)) : [];
  const hasTerms = terms.length > 0 || computeDocument(c).payment.rows.length > 0 || (def.deliveryTime && c.deliveryTime) || banks.length > 0;
  let n = 0;
  const idx = () => `${two(++n)} / `;
  // Terms: blocks in their order; payment plan after the process blocks, then timeline and the rest (kit order).
  const processKeys = new Set(['scope', 'deliverables', 'assumptions', 'revisions', 'terms']);
  const process = terms.filter((b) => processKeys.has(b.key) || b.key === 'custom');
  const after = terms.filter((b) => !processKeys.has(b.key) && b.key !== 'custom');
  const sectionHeading = (b: Block) => idx() + up(b.heading || BLOCK_LABEL[b.key][c.locale]);

  return (
    <>
      <SideBand input={input} t={t} />
      <R.View style={st.foot} fixed />
      <R.Text style={[st.footText, { left: MAIN_X }]} fixed>{footerNote(input, t)}</R.Text>
      <R.Text style={[st.pageNo, { right: MAIN_R + 18 }]} fixed render={({ pageNumber, totalPages }) => `${two(pageNumber)} / ${two(totalPages)}`} />

      {/* 01 — scope and amounts */}
      <R.View wrap={false}>
        <R.Text style={[st.label, { marginBottom: 14 }]}>01 / {up(input.kind === 'quote' ? t.scope : t.scopeProforma)}</R.Text>
        <R.Text style={st.headline}>{input.title}</R.Text>
        {clientName || c.projectName ? <R.Text style={[st.sub, { marginTop: 14 }]}>{[clientName, c.projectName].filter(Boolean).join(' / ')}</R.Text> : null}
        {input.kind === 'proforma' ? (
          <R.View style={{ marginTop: 18 }}>
            <R.Text style={[st.strong, { fontSize: 8.6, letterSpacing: 0.4 }]}>{up(t.proforma)}</R.Text>
            <R.Text style={[st.small, { marginTop: 3 }]}>{t.proformaSub}</R.Text>
          </R.View>
        ) : null}
      </R.View>
      {intro ? <R.Text style={[st.lead, { marginTop: 22 }]}>{bodyParts(intro.body, false).map((p) => p.text).join('\n\n')}</R.Text> : null}

      {recipientLines.length ? (
        <R.View wrap={false} style={{ marginTop: 22, flexDirection: 'row' }}>
          <R.View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 14 }}>
            <R.Text style={[st.labelMuted, { marginBottom: 6 }]}>{up(t.client)}</R.Text>
            {clientName ? <R.Text style={st.strong}>{clientName}</R.Text> : null}
            {recipientLines.map((l, i) => <R.Text key={i} style={st.small}>{l}</R.Text>)}
          </R.View>
        </R.View>
      ) : null}

      <R.View style={{ marginTop: 24 }}>
        <ItemsTable c={c} t={t} tail={<Totals input={input} t={t} />} />
      </R.View>

      {/* 02 — plan and terms: the opener travels with the first item, the signature with the last */}
      {(() => {
        const sig = <Signature input={input} />;
        // Each item gets the opener ("02 / Plan ve koşullar") if it is the first
        // one, and the signature if it is the last one.
        type Item = (before?: React.ReactNode, after?: React.ReactNode) => React.ReactNode;
        const items: Item[] = [];
        const boxed = (key: string, node: React.ReactNode): Item => (before, x) => (
          <R.View key={key} wrap={false} style={{ marginBottom: 18 }}>{before}{node}{x ? <R.View style={{ marginTop: 6 }}>{x}</R.View> : null}</R.View>
        );
        for (const b of process) items.push((before, x) => <Section key={b.id} heading={sectionHeading(b)} body={b.body} list={BLOCK_LABEL[b.key].list} before={before} after={x} />);
        if (computeDocument(c).payment.rows.length) items.push(boxed('pay', <PaymentBlock c={c} t={t} />));
        if (def.deliveryTime && c.deliveryTime) items.push((before, x) => <Section key="delivery" heading={up(t.delivery)} body={c.deliveryTime} list={false} before={before} after={x} />);
        for (const b of after) items.push((before, x) => <Section key={b.id} heading={up(b.heading || BLOCK_LABEL[b.key][c.locale])} body={b.body} list={BLOCK_LABEL[b.key].list} before={before} after={x} />);
        // Bank details and the signature share the closing row (bank left, signature right).
        if (banks.length) {
          items.push((before) => (
            <R.View key="closing" wrap={false}>
              {before}
              <R.View style={{ flexDirection: 'row' }}>
                <R.View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 14 }}><BankBlock banks={banks} t={t} /></R.View>
                <R.View style={{ width: 150, marginTop: -8 }}><Signature input={input} ruleWidth={150} /></R.View>
              </R.View>
            </R.View>
          ));
        }
        if (!hasTerms || !items.length) return <R.View style={{ marginTop: 20 }}>{sig}</R.View>;
        const opener = (
          <>
            <R.Text style={[st.label, { marginBottom: 14 }]}>02 / {up(t.plan)}</R.Text>
            <R.Text style={[st.headline, { marginBottom: 20 }]}>{t.planHeadline}</R.Text>
          </>
        );
        const lastI = items.length - 1;
        return (
          <R.View style={{ marginTop: layout?.planBreak ? 0 : 28 }} break={layout?.planBreak}>
            {layout?.probe ? <R.View render={({ pageNumber }) => { layout.probe!.planPage = pageNumber; return null; }} /> : null}
            {items.map((it, i) => it(i === 0 ? opener : undefined, i === lastI && !banks.length ? sig : undefined))}
          </R.View>
        );
      })()}
    </>
  );
}

/* ── Letter / status report / delivery note (letterhead) ──────── */

/** Height (pt) reserved at the bottom of every page for the contact block + legal line + footer. */
function letterBottom(issuer: Issuer, t: Labels): { contact: string; legal: string; boxH: number; legalH: number; bottom: number } {
  const contact = [issuer.phone, issuer.email, issuer.website?.replace(/^https?:\/\//, '')].map((s) => (s ?? '').trim()).filter(Boolean).join('  /  ');
  const { legal: legalParts } = companyLines(issuer, t);
  const legal = [issuer.legalName, issuer.address, ...legalParts].map((s) => (s ?? '').trim()).filter(Boolean).join(' · ');
  const inner = LETTER_W - 26;
  const boxH = contact ? 12 + 7.6 * 1.3 + 7 + lines(contact, inner, 9) * 9 * 1.5 + 13 : 0;
  const legalH = legal ? lines(legal, LETTER_W, 6.8) * 6.8 * 1.45 : 0;
  // footer zone: from the rule (786) to the page bottom = 56; gaps: legal 6, box 8, body 22
  const bottom = (H - FOOT_LINE) + (legal ? legalH + 6 : 0) + (contact ? boxH + 8 : 0) + 22;
  return { contact, legal, boxH, legalH, bottom };
}

function LetterDocument({ input }: { input: RenderInput }) {
  const c = input.content;
  const t = L[c.locale];
  const r = c.recipient;
  const kindLabel = KIND_LABEL[input.kind][c.locale];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.issueDate);
  const day = m ? m[3] : '';
  const monthYear = m ? up(`${MONTHS[c.locale][Number(m[2]) - 1]} ${m[1]}`) : '';
  const bottom = letterBottom(input.issuer, t);
  const statusLine = input.mode === 'draft' ? t.draftLine : input.version ? t.versionLine(input.version, input.versionAt ?? '') : '';
  const extra = [r.company && r.name ? r.name : '', r.attention ? `${t.attention}: ${r.attention}` : '', r.address].filter(Boolean);
  const blocks = c.blocks.filter((b) => b.body.trim());
  const numbered = input.kind === 'status_report';
  return (
    <>
      {/* every page: left brand band, small letterhead (covered on page 1), contact block, footer */}
      <R.View style={st.edge} fixed />
      <R.View style={st.edgeLime} fixed />
      <R.View style={st.cHead} fixed>
        <R.View style={{ paddingLeft: LX - 19 }}><Logo width={78} /></R.View>
        <R.Text style={[st.headKicker, { marginTop: 0, marginLeft: 16 }]}>{up(t.brandKind(kindLabel))}  ·  {input.number}</R.Text>
      </R.View>
      <R.View style={st.cDate} fixed><R.Text style={st.cDateText}>{day} {monthYear}</R.Text></R.View>
      {bottom.contact ? (
        <R.View style={[st.contactBox, { top: FOOT_LINE - (bottom.legal ? bottom.legalH + 6 : 0) - 8 - bottom.boxH }]} fixed>
          <R.Text style={st.contactLabel}>{up(t.contact)}</R.Text>
          <R.Text style={st.contactText}>{bottom.contact}</R.Text>
        </R.View>
      ) : null}
      {bottom.legal ? <R.Text style={[st.legalLine, { top: FOOT_LINE - 6 - bottom.legalH }]} fixed>{bottom.legal}</R.Text> : null}
      <R.View style={[st.foot, { left: LX, right: LR }]} fixed />
      <R.Text style={[st.footText, { left: LX }]} fixed>{footerNote(input, t)}</R.Text>
      <R.Text style={[st.pageNo, { right: LR }]} fixed render={({ pageNumber, totalPages }) => `${two(pageNumber)} / ${two(totalPages)}`} />

      {/* page 1 letterhead */}
      <R.View style={st.head}>
        <R.View style={st.headLeft}>
          <Logo width={128} />
          <R.Text style={st.headKicker}>{up(t.brandKind(kindLabel))}</R.Text>
        </R.View>
        <R.View style={st.dateBlock}>
          <R.Text style={st.dateDay}>{day}</R.Text>
          <R.Text style={st.dateMonth}>{monthYear}</R.Text>
        </R.View>
      </R.View>

      <R.View style={{ flexDirection: 'row', marginTop: 24 }} wrap={false}>
        <R.View style={{ width: 350 - LX, paddingRight: 14 }}>
          <R.Text style={[st.labelMuted, { marginBottom: 6 }]}>{up(t.recipient)}</R.Text>
          <R.Text style={[st.strong, { fontSize: 12 }]}>{r.company || r.name || '—'}</R.Text>
          {extra.map((l, i) => <R.Text key={i} style={st.small}>{l}</R.Text>)}
        </R.View>
        <R.View style={{ flexGrow: 1, flexBasis: 0 }}>
          <R.Text style={[st.labelMuted, { marginBottom: 6 }]}>{up(t.number)} / {input.number}</R.Text>
          {statusLine ? <R.Text style={st.small}>{statusLine}</R.Text> : null}
          {input.kind === 'status_report' && c.period ? <R.Text style={st.small}>{t.period}: {c.period}</R.Text> : null}
          {c.projectName ? <R.Text style={st.small}>{t.project}: {c.projectName}</R.Text> : null}
          {c.reference ? <R.Text style={st.small}>{t.reference}: {c.reference}</R.Text> : null}
        </R.View>
      </R.View>

      <R.View wrap={false} style={{ marginTop: 22, marginBottom: 18 }}>
        <R.Text style={[st.headline, { fontSize: 29 }]}>{input.title}</R.Text>
        {input.kind === 'letter' && c.subject && c.subject.trim() !== input.title.trim() ? <R.Text style={[st.strong, { fontSize: 10.5, marginTop: 14 }]}>{t.subject}: {c.subject}</R.Text> : null}
      </R.View>

      {blocks.map((b, i) => {
        const last = i === blocks.length - 1;
        const sig = last ? <Signature input={input} /> : undefined;
        if (input.kind === 'letter' && b.key === 'body') {
          const parts = bodyParts(b.body, false);
          // Units that must not split: list runs (≤ 3 items together, otherwise
          // the last two), and the last part together with the signature.
          type Unit = { from: number; to: number; keep: boolean };
          const units: Unit[] = [];
          for (let j = 0; j < parts.length;) {
            if (parts[j].type === 'li') {
              let k = j;
              while (k + 1 < parts.length && parts[k + 1].type === 'li') k += 1;
              if (k - j < 3) units.push({ from: j, to: k, keep: true });
              else { for (let q = j; q < k - 1; q += 1) units.push({ from: q, to: q, keep: true }); units.push({ from: k - 1, to: k, keep: true }); }
              j = k + 1;
            } else { units.push({ from: j, to: j, keep: parts[j].type === 'h' }); j += 1; }
          }
          if (sig && units.length) units[units.length - 1].keep = true;
          // a sub-heading joins the unit after it when that unit cannot split;
          // otherwise it asks for two lines of it on the same page
          const merged: Unit[] = [];
          for (let u = 0; u < units.length; u += 1) {
            const cur = units[u];
            const next = units[u + 1];
            const lead = parts[cur.to];
            // a paragraph that introduces a list ("…duyuyoruz:") stays with the list
            const intro = lead.type === 'p' && /:\s*$/.test(lead.text) && next && parts[next.from].type === 'li' && lines(lead.text, LETTER_W, 10.5) <= 3;
            if ((parts[cur.from].type === 'h' && next && (next.keep || u + 1 === units.length - 1)) || intro) { merged.push({ from: cur.from, to: next.to, keep: true }); u += 1; } else merged.push(cur);
          }
          const out: React.ReactNode[] = merged.map((u, m) => {
            const isLast = m === merged.length - 1;
            const nodes = parts.slice(u.from, u.to + 1).map((p, q) => <Part key={q} p={p} prev={parts[u.from + q - 1]?.type} size={10.5} last={u.from + q === parts.length - 1} />);
            if (u.keep || (isLast && sig)) {
              const solo = parts[u.from].type === 'h' && u.from === u.to;
              return <R.View key={m} wrap={false} minPresenceAhead={solo ? 10.5 * 1.55 * 2 + 6 : undefined}>{nodes}{isLast && sig ? <R.View style={{ marginTop: 6 }}>{sig}</R.View> : null}</R.View>;
            }
            return <React.Fragment key={m}>{nodes}</React.Fragment>;
          });
          return <R.View key={b.id}>{out}</R.View>;
        }
        const heading = `${numbered ? `${two(i + 1)} / ` : ''}${b.heading || BLOCK_LABEL[b.key][c.locale]}`;
        return <Section key={b.id} heading={heading} body={b.body} list={BLOCK_LABEL[b.key].list} headingStyle="strong" size={10.5} gap={18} after={sig} width={LETTER_W} />;
      })}
      {blocks.length ? null : <Signature input={input} />}
    </>
  );
}

/* ── Document ─────────────────────────────────────────────────── */

export function DocumentPdf(input: RenderInput & { layout?: LayoutOpts }) {
  const c = input.content;
  UP_LOCALE = c.locale === 'tr' ? 'tr-TR' : 'en-GB';
  const t = L[c.locale];
  const sidebar = input.kind === 'quote' || input.kind === 'proforma';
  const pageStyle = sidebar
    ? { fontFamily: 'Manrope', fontSize: 10, color: C.ink, backgroundColor: C.paper, paddingTop: 40, paddingBottom: H - FOOT_LINE + 22, paddingLeft: MAIN_X, paddingRight: MAIN_R }
    : { fontFamily: 'Manrope', fontSize: 10, color: C.ink, backgroundColor: C.paper, paddingTop: 92, paddingBottom: letterBottom(input.issuer, t).bottom, paddingLeft: LX, paddingRight: LR };
  const issuer = input.issuer;
  return (
    <R.Document title={`${input.number} — ${input.title}`} author={issuer.legalName || issuer.brand} creator="Yoca yönetim paneli" producer="Yoca" language={c.locale === 'tr' ? 'tr-TR' : 'en-GB'}>
      <R.Page size="A4" style={pageStyle}>
        {sidebar ? <SidebarDocument input={input} layout={input.layout} /> : <LetterDocument input={input} />}
      </R.Page>
    </R.Document>
  );
}

export interface RenderedPdf { buffer: Buffer; pages: number }

async function renderOnce(input: RenderInput, layout?: LayoutOpts): Promise<RenderedPdf> {
  const buffer = await R.renderToBuffer(<DocumentPdf {...input} layout={layout} />);
  const pages = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return { buffer, pages };
}

/**
 * Teklif / proforma: when "Plan ve koşullar" starts on one page and runs onto
 * the last page (which then often holds only a short remainder), a second pass
 * starts the plan on a fresh page — as in the design kit — and is kept only if
 * the document does not get longer. No page limit is applied.
 */
export async function renderDocumentPdf(input: RenderInput): Promise<RenderedPdf> {
  await loadRenderer();
  registerFonts();
  if (input.kind !== 'quote' && input.kind !== 'proforma') return renderOnce(input);
  const probe = { planPage: 0 };
  const first = await renderOnce(input, { probe });
  if (!probe.planPage || probe.planPage >= first.pages) return first;
  const second = await renderOnce(input, { planBreak: true });
  return second.pages <= first.pages ? second : first;
}

export { MAIN_W, SIDE };
