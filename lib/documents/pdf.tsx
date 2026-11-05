/**
 * Yoca — Teklifler ve Belgeler: A4 PDF design layer (server only, @react-pdf/renderer).
 *
 * Identity comes from the brand files in public/brand and the site's own brand
 * geometry (app/globals.css), not from a previous PDF (none exists):
 *  - Logo: the original vector paths of yoca-logo-primary.svg (white word mark
 *    with the lime/green modules, for the dark letterhead) and
 *    yoca-logo-light-bg.svg (for light areas), drawn with the file's own
 *    viewBox and aspect ratio. Never redrawn, recoloured or stretched.
 *  - Colours: Electric Lime #A2FF00, Yoca Green #40C401, deep surface #0D0E12,
 *    hairline #2A2E37, muted #B4B7BF, soft #F4F4F1 (tailwind.config).
 *  - Geometry: one angle everywhere, the 4.83° lean of the two modules in the
 *    mark (1.36 / 16.09) — the site's .slant / .intro-slab / .module-rule.
 *    The stacked lime + green modules sit at the top-end corner of the
 *    letterhead (as on every inner page of the site); section headings carry
 *    the lime module rule; the grand total is a lime block with black text
 *    (the site's primary-button treatment). Nothing decorative sits behind text.
 *  - Type: Manrope (SIL OFL 1.1, lib/documents/fonts/OFL.txt), embedded.
 *
 * Two layouts share these parts:
 *  - "form" (quote, proforma, status report, delivery note): dark letterhead
 *    band with document type, subject as the main title, client/project and
 *    document facts; dark table header; totals block tied to the payment plan.
 *  - "letter": letterhead band with the issuer's contact lines, then number /
 *    date, recipient, subject, body, closing and signature — no form boxes.
 * Continuation pages carry a smaller band with the same identity; the footer
 * (legal facts + page number) repeats on every page.
 *
 * Page breaks: table rows, the summary, bank details and the signature never
 * split. A heading always travels with its section; short sections move as a
 * whole, long ones keep their heading with the first lines and their last
 * lines together (no two stray list items at the top of a page).
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

/* ── Fonts & brand files ──────────────────────────────────────── */

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
  // IBANs, file names) get break points so they never run out of their column.
  R.Font.registerHyphenationCallback((word) => {
    if (word.length <= 28) return [word];
    const parts: string[] = [];
    for (let i = 0; i < word.length; i += 18) parts.push(word.slice(i, i + 18));
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
/** Back-compat for tests. */
export const loadLogo = () => loadBrandSvg('yoca-logo-light-bg.svg');

function Logo({ height, onDark }: { height: number; onDark: boolean }) {
  const logo = loadBrandSvg(onDark ? 'yoca-logo-primary.svg' : 'yoca-logo-light-bg.svg');
  const [, , w, h] = logo.viewBox;
  return (
    <R.Svg viewBox={logo.viewBox.join(' ')} style={{ height, width: (height * w) / h }}>
      {logo.paths.map((p, i) => <R.Path key={i} d={p.d} fill={p.fill} />)}
    </R.Svg>
  );
}

/* ── Brand geometry ───────────────────────────────────────────── */

/** The lean of the mark's modules: 1.36 horizontal per 16.09 vertical (4.83°). */
const LEAN = 1.36 / 16.09;

/** A module: parallelogram leaning like the mark (site .slant). */
function Module({ w, h, color, style }: { w: number; h: number; color: string; style?: Record<string, unknown> }) {
  const o = h * LEAN;
  return (
    <R.Svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, ...(style ?? {}) }}>
      <R.Polygon points={`${o},0 ${w},0 ${w - o},${h} 0,${h}`} fill={color} />
    </R.Svg>
  );
}

/* ── Labels ───────────────────────────────────────────────────── */

const L = {
  tr: {
    number: 'Belge no', letterNo: 'Sayı', date: 'Tarih', valid: 'Geçerlilik', currency: 'Para birimi', period: 'Dönem', project: 'Proje', reference: 'İlgi',
    client: 'Müşteri', recipient: 'Alıcı', attention: 'İlgili', taxOffice: 'Vergi dairesi', taxNo: 'Vergi no', mersis: 'MERSİS', tradeReg: 'Ticaret sicil', kep: 'KEP',
    items: 'İş kalemleri', no: '#', desc: 'Açıklama', qty: 'Miktar', unitPrice: 'Birim fiyat', disc: 'İnd.', tax: 'KDV', amount: 'Tutar',
    subtotal: 'Ara toplam', discount: 'İndirim', net: 'Net tutar', taxLine: (r: string) => `KDV %${r}`, base: 'matrah', grand: 'Genel toplam', taxIncl: 'KDV dahil',
    missingTotal: (n: number) => `Genel toplam hesaplanmadı: ${n} kalemin fiyatı eksik.`, priceMissing: 'Fiyat eksik',
    payment: 'Ödeme planı', due: 'Vade', share: 'Oran', delivery: 'Teslim süresi', bank: 'Banka bilgileri', holder: 'Hesap sahibi', iban: 'IBAN', swift: 'SWIFT', branch: 'Şube',
    page: (p: number, t: number) => `${p} / ${t}`, draft: 'TASLAK', draftNote: 'Taslak — kesinleşmemiş belge', sample: 'Örnek belge · sentetik bilgiler',
    proforma: 'Fatura yerine geçmez', proformaSub: 'Ödeme bilgisi içindir; resmî fatura değildir ve tahsilat yapıldığını göstermez.',
    subject: 'Konu', version: (v: number, at: string) => `Sürüm ${v} · ${at}`, from: 'Kaynak teklif', continued: 'devam',
  },
  en: {
    number: 'Document no', letterNo: 'Ref.', date: 'Date', valid: 'Valid until', currency: 'Currency', period: 'Period', project: 'Project', reference: 'Reference',
    client: 'Client', recipient: 'To', attention: 'Attn.', taxOffice: 'Tax office', taxNo: 'Tax no', mersis: 'MERSIS', tradeReg: 'Trade registry', kep: 'KEP',
    items: 'Line items', no: '#', desc: 'Description', qty: 'Qty', unitPrice: 'Unit price', disc: 'Disc.', tax: 'VAT', amount: 'Amount',
    subtotal: 'Subtotal', discount: 'Discount', net: 'Net amount', taxLine: (r: string) => `VAT ${r}%`, base: 'base', grand: 'Grand total', taxIncl: 'incl. VAT',
    missingTotal: (n: number) => `Grand total not calculated: ${n} line(s) without a price.`, priceMissing: 'Price missing',
    payment: 'Payment plan', due: 'Due', share: 'Share', delivery: 'Delivery time', bank: 'Bank details', holder: 'Account holder', iban: 'IBAN', swift: 'SWIFT', branch: 'Branch',
    page: (p: number, t: number) => `${p} / ${t}`, draft: 'DRAFT', draftNote: 'Draft — not final', sample: 'Sample document · synthetic data',
    proforma: 'Fatura yerine geçmez · not an invoice', proformaSub: 'For payment information only; not a tax invoice and not a confirmation of payment.',
    subject: 'Subject', version: (v: number, at: string) => `Version ${v} · ${at}`, from: 'Source quotation', continued: 'continued',
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

/* ── Palette, measures, styles ────────────────────────────────── */

const C = {
  ink: '#0D0E12', text: '#16181D', soft: '#4B4F58', muted: '#80848D', rule: '#DCDDD8', panel: '#F4F4F1',
  dark: '#0D0E12', darkRule: '#2A2E37', onDark: '#FFFFFF', onDarkMuted: '#B4B7BF',
  lime: '#A2FF00', green: '#40C401', greenDark: '#267800', warn: '#9A3412',
};
const PAGE_W = 595.28;
const MX = 48;            // side margin
const CONT_BAND = 50;     // continuation band height
const TOP = 84;           // content top on every page (below the continuation band)
const BOTTOM = 66;        // room for the footer
const CONTENT_W = PAGE_W - 2 * MX;

// No lineHeight on the page: an inherited lineHeight stops react-pdf from drawing
// the dynamic page number. Text styles set their own multiplier with their own fontSize.
const st = {
  page: { fontFamily: 'Manrope', fontSize: 9.4, color: C.text, paddingTop: TOP, paddingBottom: BOTTOM, paddingHorizontal: MX, backgroundColor: '#FFFFFF' },

  // continuation band (every page; page 1 covers it with the large letterhead)
  cBand: { position: 'absolute', top: 0, left: 0, right: 0, height: CONT_BAND, backgroundColor: C.dark, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: MX },
  cMeta: { fontSize: 7.4, color: C.onDarkMuted, letterSpacing: 0.4 },
  cKind: { fontSize: 7.4, color: C.onDark, fontWeight: 700, letterSpacing: 1.2 },

  // first-page letterhead (bleeds to the page edges)
  band: { marginTop: -TOP, marginHorizontal: -MX, backgroundColor: C.dark, paddingTop: 34, paddingHorizontal: MX, paddingBottom: 0 },
  bandTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tag: { flexDirection: 'row', alignItems: 'center' },
  tagText: { fontSize: 7.6, fontWeight: 800, letterSpacing: 1.6, color: C.lime },
  sampleTag: { fontSize: 6.6, color: C.onDarkMuted, letterSpacing: 0.3, marginTop: 6, textAlign: 'right' },
  draftTag: { fontSize: 6.8, fontWeight: 800, letterSpacing: 1, color: C.dark, backgroundColor: C.lime, paddingVertical: 2, paddingHorizontal: 6, marginTop: 6, alignSelf: 'flex-end' },
  title: { fontSize: 25, fontWeight: 800, color: C.onDark, lineHeight: 1.16, marginTop: 30, maxWidth: 400 },
  subline: { fontSize: 10.4, color: C.onDarkMuted, lineHeight: 1.4, marginTop: 8, maxWidth: 400 },
  facts: { flexDirection: 'row', marginTop: 26, borderTopWidth: 0.8, borderTopColor: C.darkRule, paddingTop: 11, paddingBottom: 22 },
  fact: { paddingRight: 22 },
  factLabel: { fontSize: 6.6, color: C.onDarkMuted, letterSpacing: 0.9, marginBottom: 3 },
  factValue: { fontSize: 9.6, fontWeight: 700, color: C.onDark },
  proformaPill: { flexDirection: 'row', alignItems: 'center', marginTop: 12, alignSelf: 'flex-start', backgroundColor: C.lime, paddingVertical: 4, paddingHorizontal: 8 },
  proformaPillText: { fontSize: 8.6, fontWeight: 800, color: '#000000', letterSpacing: 0.3 },

  // parties under the band
  partyRow: { flexDirection: 'row', marginTop: 24, marginBottom: 6 },
  partyCol: { flexGrow: 1, flexBasis: 0, paddingRight: 18 },
  eyebrow: { fontSize: 6.8, fontWeight: 800, color: C.greenDark, letterSpacing: 1.3, marginBottom: 5 },
  partyName: { fontSize: 11.2, fontWeight: 800, color: C.ink, lineHeight: 1.3, marginBottom: 2 },
  partyLine: { fontSize: 8.6, color: C.soft, lineHeight: 1.45 },

  // section heading with the module rule
  hWrap: { marginTop: 20, marginBottom: 8 },
  hRule: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  hLine: { flexGrow: 1, height: 0.7, backgroundColor: C.rule, marginLeft: 6 },
  h: { fontSize: 12.4, fontWeight: 800, color: C.ink, lineHeight: 1.25 },
  p: { fontSize: 9.4, lineHeight: 1.52, color: C.text, marginBottom: 6 },
  li: { flexDirection: 'row', marginBottom: 3.5 },
  liMark: { width: 5, height: 5, marginTop: 4.4, marginRight: 8 },
  liText: { flexGrow: 1, flexBasis: 0, fontSize: 9.4, lineHeight: 1.5, color: C.text },
  twoCol: { flexDirection: 'row' },
  col: { flexGrow: 1, flexBasis: 0 },
  colGap: { width: 22 },

  // table
  thead: { flexDirection: 'row', backgroundColor: C.dark, paddingVertical: 6.5, paddingHorizontal: 8 },
  th: { fontSize: 6.8, fontWeight: 800, letterSpacing: 0.9, color: C.onDark },
  trWrap: { paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 0.6, borderBottomColor: C.rule },
  trTop: { flexDirection: 'row' },
  itemDescWide: { fontSize: 8.3, color: C.soft, lineHeight: 1.48, marginTop: 2, marginLeft: 20, marginRight: 96 },
  cNo: { width: 20 },
  cDesc: { flexGrow: 1, flexBasis: 0, paddingRight: 10 },
  cQty: { width: 64, textAlign: 'right', paddingRight: 8 },
  cPrice: { width: 70, textAlign: 'right', paddingRight: 8 },
  cDisc: { width: 36, textAlign: 'right', paddingRight: 8 },
  cTax: { width: 34, textAlign: 'right', paddingRight: 8 },
  cAmt: { width: 78, textAlign: 'right' },
  rowNo: { fontSize: 8, fontWeight: 700, color: C.greenDark },
  itemTitle: { fontSize: 9.4, fontWeight: 700, color: C.ink, lineHeight: 1.35 },
  itemDesc: { fontSize: 8.3, color: C.soft, lineHeight: 1.48, marginTop: 2 },
  num: { fontSize: 8.9, color: C.text },
  numStrong: { fontSize: 8.9, fontWeight: 700, color: C.ink },
  missing: { fontSize: 7.8, fontWeight: 800, color: C.warn },

  // summary (payment plan + totals)
  summary: { flexDirection: 'row', marginTop: 16 },
  planCol: { flexGrow: 1, flexBasis: 0, backgroundColor: C.panel, paddingVertical: 12, paddingHorizontal: 14, marginRight: 12 },
  planRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.6, borderBottomColor: C.rule },
  totCol: { width: 214 },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3.4, paddingHorizontal: 2 },
  tLabel: { fontSize: 8.6, color: C.soft },
  tSmall: { fontSize: 7.2, color: C.muted },
  tValue: { fontSize: 8.9, color: C.text, textAlign: 'right' },
  grand: { backgroundColor: C.lime, paddingVertical: 11, paddingHorizontal: 12, marginTop: 8 },
  grandLabel: { fontSize: 7, fontWeight: 800, letterSpacing: 1.3, color: '#000000' },
  grandValue: { fontSize: 18, fontWeight: 800, color: '#000000', marginTop: 3 },
  grandNote: { fontSize: 7, color: '#1B2A00', marginTop: 2 },
  warnBox: { borderWidth: 0.9, borderColor: C.warn, paddingVertical: 8, paddingHorizontal: 10, marginTop: 8 },

  box: { borderLeftWidth: 2, borderLeftColor: C.green, backgroundColor: C.panel, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  kv: { flexDirection: 'row', marginBottom: 2 },
  k: { width: 88, fontSize: 7.8, color: C.muted, lineHeight: 1.45 },
  v: { flexGrow: 1, flexBasis: 0, fontSize: 8.8, color: C.text, lineHeight: 1.45 },

  // closing
  sign: { marginTop: 22 },
  signSpace: { height: 26 },
  signRule: { width: 170, height: 0.8, backgroundColor: C.ink, marginBottom: 5 },
  signName: { fontSize: 9.8, fontWeight: 800, color: C.ink },
  signTitle: { fontSize: 8.4, color: C.soft, lineHeight: 1.4 },
  colophon: { marginTop: 14, fontSize: 6.8, color: C.muted },

  // footer (every page)
  footer: { position: 'absolute', bottom: 24, left: MX, right: MX, flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: 0.7, borderTopColor: C.rule, paddingTop: 8 },
  footMark: { marginRight: 8, marginBottom: 1 },
  footText: { fontSize: 6.8, color: C.muted, lineHeight: 1.45, maxWidth: 420 },
  footStrong: { fontSize: 6.8, color: C.soft, fontWeight: 700, lineHeight: 1.45 },
  pageNo: { position: 'absolute', bottom: 24.5, right: MX, width: 80, textAlign: 'right', fontSize: 7.6, fontWeight: 800, color: C.ink },
  watermark: { position: 'absolute', top: 380, left: 0, right: 0, textAlign: 'center', fontSize: 118, fontWeight: 800, color: '#000000', opacity: 0.04, transform: 'rotate(-30deg)' },

  // letter
  letterBand: { marginTop: -TOP, marginHorizontal: -MX, backgroundColor: C.dark, paddingTop: 32, paddingBottom: 26, paddingHorizontal: MX, flexDirection: 'row', justifyContent: 'space-between' },
  letterContact: { fontSize: 7.4, color: C.onDarkMuted, lineHeight: 1.55, textAlign: 'right' },
  letterMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  letterMeta: { fontSize: 8.6, color: C.soft, lineHeight: 1.5 },
  letterMetaStrong: { fontSize: 8.6, color: C.ink, fontWeight: 700, lineHeight: 1.5 },
  letterTo: { marginTop: 24 },
  letterSubject: { flexDirection: 'row', marginTop: 24, marginBottom: 16, alignItems: 'flex-start' },
  letterSubjectLabel: { fontSize: 9.4, fontWeight: 800, color: C.ink, marginRight: 6, lineHeight: 1.4 },
  letterSubjectText: { flexGrow: 1, flexBasis: 0, fontSize: 9.4, fontWeight: 700, color: C.ink, lineHeight: 1.4 },
} as const;

/* ── Helpers ──────────────────────────────────────────────────── */

let UP_LOCALE = 'tr-TR';
/** Uppercase with the document language (Turkish i → İ). */
const up = (text: string) => text.toLocaleUpperCase(UP_LOCALE);

/** Rough height (pt) of a block of text, used only to decide what may move as one piece. */
function estimate(text: string, width: number, size = 9.4, lineH = 1.5): number {
  const perLine = Math.max(20, Math.floor(width / (size * 0.5)));
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return lines * size * lineH;
}

type PartT = { type: 'p' | 'li'; text: string };

function Part({ p, prev }: { p: PartT; prev?: 'p' | 'li' }) {
  if (p.type === 'p') return <R.Text style={prev === 'li' ? [st.p, { marginTop: 4 }] : st.p} orphans={3} widows={3}>{p.text}</R.Text>;
  return (
    <R.View style={st.li} wrap={false}>
      <Module w={5.2} h={5} color={C.green} style={st.liMark} />
      <R.Text style={st.liText}>{p.text}</R.Text>
    </R.View>
  );
}

function Heading({ text }: { text: string }) {
  return (
    <R.View style={st.hWrap}>
      <R.View style={st.hRule}>
        <Module w={11} h={10} color={C.lime} />
        <R.View style={st.hLine} />
      </R.View>
      <R.Text style={st.h}>{text}</R.Text>
    </R.View>
  );
}

/**
 * A section that never leaves its heading alone and never strands its last
 * lines: short sections move as one piece; long ones keep heading + first
 * two parts and the last three parts together.
 */
function Section({ heading, body, list, width = CONTENT_W }: { heading: string; body: string; list: boolean; width?: number }) {
  const parts = bodyParts(body, list);
  if (!parts.length) return null;
  const height = parts.reduce((h, p) => h + estimate(p.text, width - (p.type === 'li' ? 13 : 0)) + 5, 46);
  if (height < 330 || parts.length <= 5) {
    return (
      <R.View wrap={false}>
        <Heading text={heading} />
        {parts.map((p, i) => <Part key={i} p={p} prev={parts[i - 1]?.type} />)}
      </R.View>
    );
  }
  const head = parts.slice(0, 2);
  const tail = parts.slice(-3);
  const middle = parts.slice(2, -3);
  return (
    <R.View>
      <R.View wrap={false}>
        <Heading text={heading} />
        {head.map((p, i) => <Part key={`h${i}`} p={p} prev={head[i - 1]?.type} />)}
      </R.View>
      {middle.map((p, i) => <Part key={`m${i}`} p={p} prev={(i === 0 ? head[1] : middle[i - 1])?.type} />)}
      <R.View wrap={false}>
        {tail.map((p, i) => <Part key={`t${i}`} p={p} prev={(i === 0 ? middle[middle.length - 1] ?? head[1] : tail[i - 1])?.type} />)}
      </R.View>
    </R.View>
  );
}

/** Pairs of short list sections side by side (each pair moves as one piece). */
function SectionFlow({ blocks, locale }: { blocks: Block[]; locale: 'tr' | 'en' }) {
  const out: React.ReactNode[] = [];
  const half = (CONTENT_W - 22) / 2;
  const shortList = (b: Block) => BLOCK_LABEL[b.key].list && bodyParts(b.body, true).length <= 6 && bodyParts(b.body, true).every((p) => p.text.length <= 110);
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    const next = blocks[i + 1];
    const heading = b.heading || BLOCK_LABEL[b.key][locale];
    if (next && shortList(b) && shortList(next)) {
      out.push(
        <R.View key={b.id} style={st.twoCol} wrap={false}>
          <R.View style={st.col}><Section heading={heading} body={b.body} list width={half} /></R.View>
          <R.View style={st.colGap} />
          <R.View style={st.col}><Section heading={next.heading || BLOCK_LABEL[next.key][locale]} body={next.body} list width={half} /></R.View>
        </R.View>,
      );
      i += 1;
    } else {
      out.push(<Section key={b.id} heading={heading} body={b.body} list={BLOCK_LABEL[b.key].list} />);
    }
  }
  return <>{out}</>;
}

function footerLines(issuer: Issuer, t: Labels): [string, string] {
  const first = [issuer.legalName || issuer.brand, issuer.address].filter(Boolean).join('  ·  ');
  const second = [
    issuer.taxOffice || issuer.taxNumber ? [issuer.taxOffice ? `${t.taxOffice} ${issuer.taxOffice}` : '', issuer.taxNumber ? `${t.taxNo} ${issuer.taxNumber}` : ''].filter(Boolean).join(' ') : '',
    issuer.mersis ? `${t.mersis} ${issuer.mersis}` : '',
    issuer.email, issuer.phone, issuer.website?.replace(/^https?:\/\//, ''),
  ].filter(Boolean).join('  ·  ');
  return [first, second];
}

/** Letter footer: legal facts only — the contact lines are already in the letterhead. */
function letterFooter(issuer: Issuer, t: Labels): [string, string] {
  const legal = [
    issuer.taxOffice ? `${t.taxOffice} ${issuer.taxOffice}` : '', issuer.taxNumber ? `${t.taxNo} ${issuer.taxNumber}` : '',
    issuer.mersis ? `${t.mersis} ${issuer.mersis}` : '', issuer.tradeRegistry ? `${t.tradeReg} ${issuer.tradeRegistry}` : '', issuer.kep ? `${t.kep} ${issuer.kep}` : '',
  ].filter(Boolean).join('  ·  ');
  return [issuer.legalName || issuer.brand, legal];
}

/* ── Input ────────────────────────────────────────────────────── */

export interface RenderInput {
  kind: DocKind;
  number: string;
  title: string;
  content: DocContent;
  issuer: Issuer;
  bankAccounts: BankAccount[];
  mode: 'draft' | 'final';
  version?: number;
  /** Local display time of the version (e.g. "5 Kasım 2026 14:03"). */
  versionAt?: string;
  sourceNumber?: string | null;
  sample?: boolean;
}

/* ── Repeating chrome ─────────────────────────────────────────── */

function Chrome({ input, t, kindLabel }: { input: RenderInput; t: Labels; kindLabel: string }) {
  const [f1, f2] = input.kind === 'letter' ? letterFooter(input.issuer, t) : footerLines(input.issuer, t);
  return (
    <>
      {/* Continuation band — page 1 draws its letterhead over it. */}
      <R.View style={st.cBand} fixed>
        <Logo height={15} onDark />
        <R.View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 70 }}>
          <R.Text style={st.cKind}>{up(kindLabel)}</R.Text>
          <R.Text style={[st.cMeta, { marginLeft: 10 }]}>{input.number}</R.Text>
          {input.mode === 'draft' ? <R.Text style={[st.cKind, { marginLeft: 10, color: C.lime }]}>{t.draft}</R.Text> : null}
        </R.View>
      </R.View>
      <R.View style={{ position: 'absolute', top: 14, right: MX }} fixed>
        <Module w={22} h={21} color={C.lime} />
      </R.View>
      <R.View style={{ position: 'absolute', top: 35, right: MX - 11 }} fixed>
        <Module w={22} h={21} color={C.green} />
      </R.View>
      <R.View style={st.footer} fixed>
        <Module w={9} h={8.5} color={C.lime} style={st.footMark} />
        <R.View>
          <R.Text style={st.footStrong}>{f1}</R.Text>
          {f2 ? <R.Text style={st.footText}>{f2}</R.Text> : null}
          {input.sample ? <R.Text style={[st.footText, { color: C.greenDark }]}>{t.sample}</R.Text> : null}
        </R.View>
      </R.View>
      <R.Text style={st.pageNo} fixed render={({ pageNumber, totalPages }) => t.page(pageNumber, totalPages)} />
    </>
  );
}

/** The stacked lime + green modules at the top-end corner of the letterhead (site .intro-slab). */
function CornerModules({ top, size = 46 }: { top: number; size?: number }) {
  const h = Math.round(size * 0.935);
  return (
    <>
      <R.View style={{ position: 'absolute', top, right: MX + 4 }}><Module w={size} h={h} color={C.lime} /></R.View>
      <R.View style={{ position: 'absolute', top: top + h, right: MX - size * 0.4 }}><Module w={size} h={h} color={C.green} /></R.View>
    </>
  );
}

/* ── Form layout (quote, proforma, status report, delivery) ───── */

function FormDocument({ input }: { input: RenderInput }) {
  const { kind, content: c } = input;
  const t = L[c.locale];
  const def = KIND_DEF[kind];
  const { totals, payment } = computeDocument(c);
  const money = (m: bigint) => fmtMoney(m, c.currency, c.locale);
  const kindLabel = KIND_LABEL[kind][c.locale];
  const r = c.recipient;
  const clientName = r.company || r.name;
  const facts: Array<[string, string]> = [[t.number, input.number], [t.date, fmtDate(c.issueDate, c.locale)]];
  if (def.validity && c.validUntil) facts.push([t.valid, fmtDate(c.validUntil, c.locale)]);
  if (def.items) facts.push([t.currency, c.currency]);
  if (def.period && c.period) facts.push([t.period, c.period]);
  if (input.sourceNumber) facts.push([t.from, input.sourceNumber]);
  // Under the title: who it is for (the project has its own column below the letterhead).
  const subline = clientName;
  const recipientLines = [
    r.company && r.name ? r.name : '',
    r.attention ? `${t.attention}: ${r.attention}` : '',
    r.address,
    [r.taxOffice ? `${t.taxOffice}: ${r.taxOffice}` : '', r.taxNumber ? `${t.taxNo}: ${r.taxNumber}` : ''].filter(Boolean).join('  ·  '),
    [r.email, r.phone].filter(Boolean).join('  ·  '),
  ].filter(Boolean);
  const showDisc = c.items.some((i) => i.discountPct.trim() && i.discountPct.trim() !== '0');
  const blocks = c.blocks.filter((b) => b.body.trim());
  const intro = blocks.filter((b) => b.key === 'intro');
  const rest = blocks.filter((b) => b.key !== 'intro');
  const banks = def.bank ? input.bankAccounts.filter((a) => c.bankAccountIds.includes(a.id)) : [];
  const hasPlan = def.payment && payment.rows.length > 0;

  return (
    <>
      {/* Letterhead */}
      <R.View style={st.band}>
        <R.View style={st.bandTop}>
          <Logo height={25} onDark />
          <R.View style={{ alignItems: 'flex-end' }}>
            <R.View style={st.tag}>
              <Module w={9} h={8.5} color={C.lime} style={{ marginRight: 6 }} />
              <R.Text style={st.tagText}>{up(kindLabel)}</R.Text>
            </R.View>
            {input.mode === 'draft' ? <R.Text style={st.draftTag}>{up(t.draftNote)}</R.Text> : null}
          </R.View>
        </R.View>
        <R.Text style={st.title}>{input.title}</R.Text>
        {subline ? <R.Text style={st.subline}>{subline}</R.Text> : null}
        {kind === 'proforma' ? (
          <R.View style={st.proformaPill}>
            <R.Text style={st.proformaPillText}>{up('Proforma')} — {t.proforma}</R.Text>
          </R.View>
        ) : null}
        <R.View style={st.facts}>
          {facts.map(([k, v]) => (
            <R.View key={k} style={st.fact}>
              <R.Text style={st.factLabel}>{up(k)}</R.Text>
              <R.Text style={st.factValue}>{v}</R.Text>
            </R.View>
          ))}
        </R.View>
        <CornerModules top={96} />
      </R.View>

      {/* Client and project */}
      <R.View style={st.partyRow} wrap={false}>
        <R.View style={st.partyCol}>
          <R.Text style={st.eyebrow}>{up(t.client)}</R.Text>
          <R.Text style={st.partyName}>{clientName || '—'}</R.Text>
          {recipientLines.map((l, i) => <R.Text key={i} style={st.partyLine}>{l}</R.Text>)}
        </R.View>
        {c.projectName || c.deliveryTime || c.reference ? (
          <R.View style={st.partyCol}>
            <R.Text style={st.eyebrow}>{up(t.project)}</R.Text>
            {c.projectName ? <R.Text style={st.partyName}>{c.projectName}</R.Text> : null}
            {c.reference ? <R.Text style={st.partyLine}>{t.reference}: {c.reference}</R.Text> : null}
            {def.deliveryTime && c.deliveryTime ? <R.Text style={st.partyLine}>{t.delivery}: {c.deliveryTime}</R.Text> : null}
          </R.View>
        ) : null}
      </R.View>
      {kind === 'proforma' ? <R.Text style={[st.partyLine, { marginTop: 8 }]}>{t.proformaSub}</R.Text> : null}

      {intro.map((b) => <Section key={b.id} heading={b.heading || BLOCK_LABEL[b.key][c.locale]} body={b.body} list={false} />)}

      {/* Line items */}
      {def.items && totals.lines.length ? (
        <R.View>
          <R.View style={{ marginTop: 6 }}>
            <R.View wrap={false}><Heading text={t.items} /></R.View>
            <R.View style={st.thead} fixed>
              <R.Text style={[st.th, st.cNo]}>{t.no}</R.Text>
              <R.Text style={[st.th, st.cDesc]}>{up(t.desc)}</R.Text>
              <R.Text style={[st.th, st.cQty]}>{up(t.qty)}</R.Text>
              <R.Text style={[st.th, st.cPrice]}>{up(t.unitPrice)}</R.Text>
              {showDisc ? <R.Text style={[st.th, st.cDisc]}>{up(t.disc)}</R.Text> : null}
              <R.Text style={[st.th, st.cTax]}>{up(t.tax)}</R.Text>
              <R.Text style={[st.th, st.cAmt]}>{up(t.amount)}</R.Text>
            </R.View>
            {totals.lines.map((l) => {
              const it = c.items[l.index];
              return (
                <R.View key={l.id} style={st.trWrap} wrap={false}>
                <R.View style={st.trTop}>
                  <R.Text style={[st.rowNo, st.cNo]}>{String(l.index + 1).padStart(2, '0')}</R.Text>
                  <R.View style={st.cDesc}>
                    <R.Text style={st.itemTitle}>{it.title || '—'}</R.Text>
                  </R.View>
                  <R.Text style={[st.num, st.cQty]}>{fmtQty(it.quantity, c.locale)}{it.unit ? ` ${it.unit}` : ''}</R.Text>
                  <R.Text style={[st.num, st.cPrice]}>{l.missingPrice ? '' : fmtMoney(parseMoney(it.unitPrice) ?? BigInt(0), c.currency, c.locale, false)}</R.Text>
                  {showDisc ? <R.Text style={[st.num, st.cDisc]}>{it.discountPct && it.discountPct !== '0' ? `%${it.discountPct.replace('.', ',')}` : '—'}</R.Text> : null}
                  <R.Text style={[st.num, st.cTax]}>{l.taxRateBp !== null ? `%${fmtPct(l.taxRateBp, c.locale)}` : ''}</R.Text>
                  {l.missingPrice ? <R.Text style={[st.missing, st.cAmt]}>{t.priceMissing}</R.Text> : <R.Text style={[st.numStrong, st.cAmt]}>{l.net !== null ? fmtMoney(l.net, c.currency, c.locale, false) : ''}</R.Text>}
                </R.View>
                {/* The description runs under the title across the number columns (not the amount), so long text stays compact. */}
                {it.description ? <R.Text style={st.itemDescWide}>{it.description}</R.Text> : null}
                </R.View>
              );
            })}
          </R.View>

          {/* Summary: payment plan tied to the totals */}
          <R.View style={st.summary} wrap={false}>
            {hasPlan ? (
              <R.View style={st.planCol}>
                <R.Text style={st.eyebrow}>{up(t.payment)}</R.Text>
                {payment.rows.map((p, i) => (
                  <R.View key={p.id} style={[st.planRow, i === payment.rows.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                    <R.View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 8 }}>
                      <R.Text style={[st.itemTitle, { fontSize: 8.9 }]}>{p.label}</R.Text>
                      {p.due ? <R.Text style={[st.itemDesc, { marginTop: 1 }]}>{p.due}</R.Text> : null}
                    </R.View>
                    <R.Text style={[st.num, { width: 40, textAlign: 'right', color: C.soft }]}>{p.pctBp !== null ? `%${fmtPct(p.pctBp, c.locale)}` : ''}</R.Text>
                    <R.Text style={[st.numStrong, { width: 84, textAlign: 'right' }]}>{p.amount !== null ? money(p.amount) : '—'}</R.Text>
                  </R.View>
                ))}
              </R.View>
            ) : <R.View style={{ flexGrow: 1 }} />}
            <R.View style={st.totCol}>
              <R.View style={st.tRow}><R.Text style={st.tLabel}>{t.subtotal}</R.Text><R.Text style={st.tValue}>{money(totals.subtotal)}</R.Text></R.View>
              {totals.discount > BigInt(0) ? <R.View style={st.tRow}><R.Text style={st.tLabel}>{t.discount}</R.Text><R.Text style={st.tValue}>−{money(totals.discount)}</R.Text></R.View> : null}
              {totals.discount > BigInt(0) ? <R.View style={st.tRow}><R.Text style={st.tLabel}>{t.net}</R.Text><R.Text style={st.tValue}>{money(totals.net)}</R.Text></R.View> : null}
              {totals.taxes.map((x) => (
                <R.View key={String(x.rateBp)} style={st.tRow}>
                  <R.View><R.Text style={st.tLabel}>{t.taxLine(fmtPct(x.rateBp, c.locale))}</R.Text><R.Text style={st.tSmall}>{t.base} {money(x.base)}</R.Text></R.View>
                  <R.Text style={st.tValue}>{money(x.tax)}</R.Text>
                </R.View>
              ))}
              {totals.grand !== null ? (
                <R.View style={st.grand}>
                  <R.Text style={st.grandLabel}>{up(t.grand)} · {c.currency}</R.Text>
                  <R.Text style={st.grandValue}>{money(totals.grand)}</R.Text>
                  {totals.tax > BigInt(0) ? <R.Text style={st.grandNote}>{t.taxIncl}</R.Text> : null}
                </R.View>
              ) : (
                <R.View style={st.warnBox}><R.Text style={st.missing}>{t.missingTotal(totals.missingPrices.length + totals.errors.length)}</R.Text></R.View>
              )}
            </R.View>
          </R.View>
        </R.View>
      ) : null}

      <SectionFlow blocks={rest} locale={c.locale} />

      {banks.length ? (
        <R.View wrap={false}>
          <Heading text={t.bank} />
          {banks.map((a) => (
            <R.View key={a.id} style={st.box}>
              <R.Text style={[st.itemTitle, { marginBottom: 4 }]}>{a.bank}{a.currency ? `  ·  ${a.currency}` : ''}</R.Text>
              <R.View style={st.kv}><R.Text style={st.k}>{t.holder}</R.Text><R.Text style={st.v}>{a.holder}</R.Text></R.View>
              <R.View style={st.kv}><R.Text style={st.k}>{t.iban}</R.Text><R.Text style={[st.v, { fontWeight: 700 }]}>{formatIban(a.iban)}</R.Text></R.View>
              {a.swift ? <R.View style={st.kv}><R.Text style={st.k}>{t.swift}</R.Text><R.Text style={st.v}>{a.swift}</R.Text></R.View> : null}
              {a.branch ? <R.View style={st.kv}><R.Text style={st.k}>{t.branch}</R.Text><R.Text style={st.v}>{a.branch}</R.Text></R.View> : null}
            </R.View>
          ))}
        </R.View>
      ) : null}

      <Signature input={input} />
    </>
  );
}

function Signature({ input }: { input: RenderInput }) {
  const c = input.content;
  const t = L[c.locale];
  const colophon = <R.Text style={st.colophon}>{input.version ? t.version(input.version, input.versionAt ?? '') : t.draftNote}</R.Text>;
  if (!c.closing && !c.signatory.name) return colophon;
  return (
    <R.View wrap={false}>
      <R.View style={st.sign}>
        {c.closing ? <R.Text style={st.p}>{c.closing}</R.Text> : null}
        <R.View style={st.signSpace} />
        <R.View style={st.signRule} />
        {c.signatory.name ? <R.Text style={st.signName}>{c.signatory.name}</R.Text> : null}
        {c.signatory.title ? <R.Text style={st.signTitle}>{c.signatory.title}</R.Text> : null}
        <R.Text style={st.signTitle}>{input.issuer.legalName || input.issuer.brand}</R.Text>
      </R.View>
      {colophon}
    </R.View>
  );
}

/* ── Letter layout ────────────────────────────────────────────── */

function LetterDocument({ input }: { input: RenderInput }) {
  const { content: c, issuer } = input;
  const t = L[c.locale];
  const r = c.recipient;
  const contact = [issuer.address, [issuer.email, issuer.phone].filter(Boolean).join('  ·  '), issuer.website?.replace(/^https?:\/\//, '')].filter(Boolean);
  const body = c.blocks.filter((b) => b.body.trim());
  return (
    <>
      <R.View style={st.letterBand}>
        <R.View>
          <Logo height={26} onDark />
          {input.mode === 'draft' ? <R.Text style={[st.draftTag, { alignSelf: 'flex-start', marginTop: 12 }]}>{up(t.draftNote)}</R.Text> : null}
        </R.View>
        <R.View style={{ marginRight: 74 }}>
          {contact.map((l, i) => <R.Text key={i} style={st.letterContact}>{l}</R.Text>)}
        </R.View>
        <CornerModules top={28} size={30} />
      </R.View>

      <R.View style={st.letterMetaRow}>
        <R.View style={st.letterTo}>
          <R.Text style={st.eyebrow}>{up(t.recipient)}</R.Text>
          {r.company ? <R.Text style={st.partyName}>{r.company}</R.Text> : null}
          {r.name ? <R.Text style={r.company ? st.partyLine : st.partyName}>{r.name}</R.Text> : null}
          {r.attention ? <R.Text style={st.partyLine}>{t.attention}: {r.attention}</R.Text> : null}
          {r.address ? <R.Text style={st.partyLine}>{r.address}</R.Text> : null}
        </R.View>
        <R.View style={{ alignItems: 'flex-end', marginTop: 24 }}>
          <R.Text style={st.letterMeta}>{t.letterNo}: <R.Text style={st.letterMetaStrong}>{input.number}</R.Text></R.Text>
          <R.Text style={st.letterMeta}>{t.date}: <R.Text style={st.letterMetaStrong}>{fmtDate(c.issueDate, c.locale)}</R.Text></R.Text>
        </R.View>
      </R.View>

      {c.subject ? (
        <R.View style={st.letterSubject} wrap={false}>
          <Module w={9} h={8.5} color={C.lime} style={{ marginRight: 7, marginTop: 3 }} />
          <R.Text style={st.letterSubjectLabel}>{t.subject}:</R.Text>
          <R.Text style={st.letterSubjectText}>{c.subject}</R.Text>
        </R.View>
      ) : <R.View style={{ height: 20 }} />}
      {c.reference ? <R.Text style={[st.partyLine, { marginTop: -8, marginBottom: 14 }]}>{t.reference}: {c.reference}</R.Text> : null}

      {body.map((b) => {
        const parts = bodyParts(b.body, false);
        return (
          <R.View key={b.id}>
            {b.key !== 'body' ? <R.Text style={[st.h, { fontSize: 10.6, marginTop: 10, marginBottom: 5 }]} minPresenceAhead={40}>{b.heading}</R.Text> : null}
            {parts.map((p, i) => <Part key={i} p={p} prev={parts[i - 1]?.type} />)}
          </R.View>
        );
      })}

      <Signature input={input} />
    </>
  );
}

/* ── Document ─────────────────────────────────────────────────── */

export function DocumentPdf(input: RenderInput) {
  const c = input.content;
  UP_LOCALE = c.locale === 'tr' ? 'tr-TR' : 'en-GB';
  const t = L[c.locale];
  const kindLabel = KIND_LABEL[input.kind][c.locale];
  const issuer = input.issuer;
  return (
    <R.Document title={`${input.number} — ${input.title}`} author={issuer.legalName || issuer.brand} creator="Yoca yönetim paneli" producer="Yoca" language={c.locale === 'tr' ? 'tr-TR' : 'en-GB'}>
      <R.Page size="A4" style={st.page}>
        <Chrome input={input} t={t} kindLabel={kindLabel} />
        {input.kind === 'letter' ? <LetterDocument input={input} /> : <FormDocument input={input} />}
        {input.mode === 'draft' ? <R.Text style={st.watermark} fixed>{t.draft}</R.Text> : null}
      </R.Page>
    </R.Document>
  );
}

export interface RenderedPdf { buffer: Buffer; pages: number }

export async function renderDocumentPdf(input: RenderInput): Promise<RenderedPdf> {
  await loadRenderer();
  registerFonts();
  const buffer = await R.renderToBuffer(<DocumentPdf {...input} />);
  const pages = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return { buffer, pages };
}
