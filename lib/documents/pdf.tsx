/**
 * Yoca — Teklifler ve Belgeler: A4 PDF template (server only, @react-pdf/renderer).
 *
 * Template "belge-2026-11-f" (Bolt set; "f": short proforma notes inside "Ödeme ve koşullar"): the Yoca corporate set chosen in Bolt
 * (yoca-kurumsal-claude-teslim, ProformaDocument / LetterDocument / A4Sheet /
 * DocumentFooter). The Bolt preview is a fixed 794 × 1123 px stage; this file
 * rebuilds the same look on the real document data with automatic page
 * breaking. CSS px are converted with 1 px = 0.75 pt.
 *
 *  - White page, 42 pt side margins. Page 1: the brand motif in the top right
 *    corner, the original light-background Yoca logo, a small uppercase
 *    kicker, a large headline with the leaf-green brand dot.
 *  - Teklif / proforma: subtitle (document title), "Hazırlanan" and
 *    "Belge / tarih" columns, the lime three-cell table header (repeated on
 *    every page), item rows with code / title / description, quantity and
 *    amount, the totals and the large grand total with the dot; the sections;
 *    then the closing block under a 1.5 pt ink rule: "Ödeme ve koşullar"
 *    (payment plan, bank details) on the left, the logo (and signatory) on
 *    the right.
 *  - Antetli yazı / durum raporu / teslim belgesi: "Alıcı" and "Sayı / tarih"
 *    columns, an ink rule, "Konu" with the subject, the text, the closing
 *    ("Saygılarımızla,") and the logo.
 *  - Every page: the footer under a 1.5 pt ink rule — legal name and company
 *    details on the left, website and page number on the right. Continuation
 *    pages get a small logo header instead of the motif.
 *  - Company facts come ONLY from the Issuer passed in (one company profile
 *    revision per PDF). Empty facts print nothing: no label, no separator.
 *    Nothing from the Bolt sample data is used.
 *  - Logo: the original vector paths of public/brand/yoca-logo-light-bg.svg —
 *    no added subline, not redrawn, not recoloured. Motif:
 *    public/brand/yoca-motif.svg (copied unchanged from the Bolt package).
 *  - Colours: ink #0D0E12, lime #A2FF00, leaf #40C401, line #DCE0D8, muted
 *    #666A65 on white. Uppercase is done with the document locale (tr-TR:
 *    "İLETİŞİM", not "ILETIŞIM").
 *  - Type: Manrope (SIL OFL 1.1, lib/documents/fonts/OFL.txt), embedded.
 *
 * Page breaks: a heading never stays without its first lines; table rows, the
 * totals, the closing block and the signature never split; the table header
 * repeats on continuation pages; lists that continue on a new page get a
 * "… — devam" label; the footer's height is reserved from the body.
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
type Sty = import('@react-pdf/types').Style;
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
  // IBANs, e-mail addresses) get break points so they never leave their column.
  R.Font.registerHyphenationCallback((word) => {
    if (word.length <= 24) return [word];
    const parts: string[] = [];
    for (let i = 0; i < word.length; i += 16) parts.push(word.slice(i, i + 16));
    return parts;
  });
  fontsReady = true;
}

type BrandFile = 'yoca-logo-primary.svg' | 'yoca-logo-light-bg.svg' | 'yoca-motif.svg';
interface SvgData { viewBox: [number, number, number, number]; paths: Array<{ d: string; fill: string }> }
const svgCache = new Map<string, SvgData>();
export function loadBrandSvg(file: BrandFile): SvgData {
  const hit = svgCache.get(file);
  if (hit) return hit;
  const svg = fs.readFileSync(path.join(process.cwd(), 'public', 'brand', file), 'utf8');
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1].trim().split(/\s+/).map(Number) as [number, number, number, number] | undefined;
  const paths = Array.from(svg.matchAll(/<path\s+fill="(#[0-9A-Fa-f]{3,8})"\s+d="([^"]+)"\s*\/>/g)).map((m) => ({ fill: m[1], d: m[2] }));
  if (!vb || vb.length !== 4 || !paths.length) throw new Error(`Yoca marka dosyası okunamadı (public/brand/${file}).`);
  const data = { viewBox: vb, paths };
  svgCache.set(file, data);
  return data;
}
export const loadLogo = () => loadBrandSvg('yoca-logo-light-bg.svg');

function BrandSvg({ file, width }: { file: BrandFile; width: number }) {
  const s = loadBrandSvg(file);
  const [, , w, h] = s.viewBox;
  const height = (width * h) / w;
  // the wrapper keeps the size inside render callbacks too (an Svg alone gets clipped there)
  return (
    <R.View style={{ width, height, flexShrink: 0 }}>
      <R.Svg viewBox={s.viewBox.join(' ')} style={{ width, height }}>
        {s.paths.map((p, i) => <R.Path key={i} d={p.d} fill={p.fill} />)}
      </R.Svg>
    </R.View>
  );
}
/** The original logo for light surfaces; width given, height from the file's aspect ratio. */
const Logo = ({ width }: { width: number }) => <BrandSvg file="yoca-logo-light-bg.svg" width={width} />;

/** The slanted brand dot (Bolt BrandDot: 17.76 × 16.29). */
function Dot({ size, style }: { size: number; style?: Sty }) {
  return (
    <R.Svg viewBox="0 0 17.76 16.29" style={{ width: size, height: (size * 16.29) / 17.76, flexShrink: 0, ...style }}>
      <R.Path d="M0,16.29L1.37,0H17.76L16.38,16.29Z" fill={C.leaf} />
    </R.Svg>
  );
}

/* ── Labels ───────────────────────────────────────────────────── */

const L = {
  tr: {
    number: 'Belge no', valid: 'Geçerlilik', currency: 'Para birimi', source: 'Kaynak teklif', period: 'Dönem',
    preparedFor: 'Hazırlanan', docDate: 'Belge / tarih', refDate: 'Sayı / tarih', recipient: 'Alıcı', subject: 'Konu',
    project: 'Proje', attention: 'İlgili', taxOffice: 'Vergi dairesi', taxNo: 'Vergi no', vkn: 'VKN', mersis: 'MERSİS', tradeReg: 'Ticaret sicil', kep: 'KEP', reference: 'İlgi',
    service: 'Hizmet / kapsam', qty: 'Miktar', amount: 'Tutar', disc: 'İnd.', tax: 'KDV',
    subtotal: 'Ara toplam', discount: 'İndirim', net: 'Net tutar', taxLine: (r: string) => `KDV %${r}`, base: 'matrah', grand: 'Genel toplam', investment: 'Toplam yatırım',
    missingTotal: (n: number) => `Genel toplam hesaplanmadı: ${n} kalemin fiyatı eksik.`, priceMissing: 'Fiyat eksik',
    paymentTerms: 'Ödeme ve koşullar', payment: 'Ödeme planı', delivery: 'Takvim', bank: 'Banka bilgileri', holder: 'Hesap sahibi', iban: 'IBAN', swift: 'SWIFT', branch: 'Şube',
    notInvoice: 'Fatura yerine geçmez', plan: 'Plan ve koşullar',
    draft: 'Taslak', sample: 'Örnek', versionLine: (v: number, at: string) => `Sürüm ${v}${at ? ` · ${at}` : ''}`, draftLine: 'Taslak · kesinleşmemiş belge',
    continued: (h: string) => `${h} — devam`,
    head: {
      quote: { kicker: 'Fiyat teklifi', h1: 'Teklif', sub: '' },
      proforma: { kicker: 'Proforma', h1: 'Proforma', sub: '' },
      letter: { kicker: 'Kurumsal iletişim', h1: 'Birlikte', sub: 'bir sonraki adıma.' },
      status_report: { kicker: 'Proje durum raporu', h1: 'Rapor', sub: '' },
      delivery: { kicker: 'Teslim belgesi', h1: 'Teslim', sub: '' },
    },
  },
  en: {
    number: 'Document no', valid: 'Valid until', currency: 'Currency', source: 'Source quotation', period: 'Period',
    preparedFor: 'Prepared for', docDate: 'Document / date', refDate: 'Ref. / date', recipient: 'To', subject: 'Subject',
    project: 'Project', attention: 'Attn.', taxOffice: 'Tax office', taxNo: 'Tax no', vkn: 'Tax ID', mersis: 'MERSIS', tradeReg: 'Trade registry', kep: 'KEP', reference: 'Reference',
    service: 'Service / scope', qty: 'Qty', amount: 'Amount', disc: 'Disc.', tax: 'VAT',
    subtotal: 'Subtotal', discount: 'Discount', net: 'Net amount', taxLine: (r: string) => `VAT ${r}%`, base: 'base', grand: 'Grand total', investment: 'Total investment',
    missingTotal: (n: number) => `Grand total not calculated: ${n} line(s) without a price.`, priceMissing: 'Price missing',
    paymentTerms: 'Payment and terms', payment: 'Payment plan', delivery: 'Timeline', bank: 'Bank details', holder: 'Account holder', iban: 'IBAN', swift: 'SWIFT', branch: 'Branch',
    notInvoice: 'Not an invoice (fatura yerine geçmez)', plan: 'Plan and terms',
    draft: 'Draft', sample: 'Sample', versionLine: (v: number, at: string) => `Version ${v}${at ? ` · ${at}` : ''}`, draftLine: 'Draft · not final',
    continued: (h: string) => `${h} — continued`,
    head: {
      quote: { kicker: 'Price quotation', h1: 'Quote', sub: '' },
      proforma: { kicker: 'Proforma', h1: 'Proforma', sub: '' },
      letter: { kicker: 'Corporate communication', h1: 'Together', sub: 'to the next step.' },
      status_report: { kicker: 'Project status report', h1: 'Report', sub: '' },
      delivery: { kicker: 'Delivery note', h1: 'Delivery', sub: '' },
    },
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
/** 05.11.2026 (tr) / 05/11/2026 (en), as in the Bolt sample. */
function fmtShort(iso: string, locale: 'tr' | 'en'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return locale === 'tr' ? `${m[3]}.${m[2]}.${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

/* ── Palette & measures (Bolt tailwind tokens; px × 0.75 = pt) ── */

const C = { ink: '#0D0E12', lime: '#A2FF00', leaf: '#40C401', mist: '#F3F5EF', line: '#DCE0D8', muted: '#666A65', warn: '#8A2E0B' };
const W = 595.28;
const H = 841.89;
const PX = 42;                 // px-14
const CW = W - PX * 2;         // content width
const TOP1 = 36;               // pt-12: page 1 starts here
const PT = 84;                 // text area top on every page (continuation header above it)
const BOTTOM = 30;             // pb-10: footer bottom
const MOTIF_W = 147;           // 196 px
const COL_QTY = 90;            // 120 px
const COL_AMT = 126;           // 168 px
const GAP = 6;                 // gap-2

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
const KICK = 8.25;
const st = {
  kicker: { fontSize: KICK, fontWeight: 600, letterSpacing: KICK * 0.18, color: C.muted, lineHeight: 1.3 },
  h1: { fontSize: 63, fontWeight: 800, letterSpacing: -63 * 0.035, color: C.ink, lineHeight: 1 },
  body: { fontSize: 10.5, color: C.ink, lineHeight: 1.6 },
  small: { fontSize: 9.75, color: C.muted, lineHeight: 1.5 },
  strong: { fontSize: 10.5, fontWeight: 700, color: C.ink, lineHeight: 1.45 },
  li: { flexDirection: 'row', marginBottom: 5 },
  liMark: { width: 4.5, height: 4.5, backgroundColor: C.leaf, marginRight: 10 },
  pill: { flexShrink: 0, backgroundColor: C.lime, color: C.ink, fontSize: 7, fontWeight: 800, letterSpacing: 0.9, lineHeight: 1.3, paddingVertical: 2.5, paddingHorizontal: 6 },

  // table
  th: { backgroundColor: C.lime, paddingVertical: 9, paddingHorizontal: 12 },
  thText: { fontSize: KICK, fontWeight: 700, letterSpacing: KICK * 0.14, color: C.ink, lineHeight: 1.3 },
  row: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 0.75, borderBottomColor: C.line },
  code: { width: 18, marginRight: 12, fontSize: 9.75, fontWeight: 700, color: C.leaf, lineHeight: 1.3, paddingTop: 1.5 },
  itemTitle: { fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.3 },
  itemDesc: { fontSize: 9.75, color: C.muted, lineHeight: 15 / 9.75, marginTop: 3 },
  qty: { fontSize: 10.5, color: C.ink, lineHeight: 1.4 },
  fig: { fontSize: 7.8, color: C.muted, lineHeight: 1.45 },
  amount: { fontSize: 12.75, fontWeight: 600, color: C.ink, lineHeight: 1.3, textAlign: 'right' },
  missing: { fontSize: 8.25, fontWeight: 800, color: C.warn, lineHeight: 1.4 },

  // totals
  tRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  tLabel: { fontSize: 10.5, color: C.muted, lineHeight: 1.4 },
  tBase: { fontSize: 7.8, color: C.muted, lineHeight: 1.4 },
  tValue: { fontSize: 10.5, color: C.ink, lineHeight: 1.4, textAlign: 'right' },
  warnBox: { borderWidth: 1, borderColor: C.warn, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12 },

  // footer
  footName: { fontSize: 9.75, fontWeight: 700, color: C.ink, lineHeight: 1.3 },
  footText: { fontSize: KICK, color: C.muted, lineHeight: 15 / KICK, marginTop: 3 },
  footWeb: { flexShrink: 0, fontSize: 11.25, fontWeight: 700, color: C.ink, lineHeight: 1.3 },
  footPage: { fontSize: 9.75, fontWeight: 700, color: C.ink, lineHeight: 1.3 },
} as const;

/* ── Shared pieces ────────────────────────────────────────────── */

type PartT = { type: 'p' | 'li' | 'h'; text: string };

/**
 * Options for one rendering pass (see renderDocumentPdf):
 *  - planBreak: start "Plan ve koşullar" on a new page;
 *  - cont: places where a continuation label ("TESLİMATLAR — DEVAM") goes,
 *    as `${section}:${part}` — found in the previous pass;
 *  - probe: filled during the pass with the page of the plan opener and the
 *    page on which each section part ends, plus each section's part order.
 * Passed down as props (no React context: route handlers run on the
 * react-server build, which has none), never module state, so concurrent
 * renders do not mix.
 */
interface LayoutOpts {
  planBreak?: boolean;
  /** page count of the previous pass (only places the website next to the page number) */
  pages?: number;
  /** vertical spacing factor (1 = Bolt spacing); see renderDocumentPdf */
  k?: number;
  cont?: Set<string>;
  probe?: { planPage: number; ends: Map<string, number>; order: Map<string, Array<{ key: string; li: boolean }>> };
}

function Part({ p, prev, size, lh, gap, last = false }: { p: PartT; prev?: PartT['type']; size: number; lh: number; gap: number; last?: boolean }) {
  if (p.type === 'h') return <R.Text style={[st.strong, { fontSize: size + 1.5, fontWeight: 600, marginTop: prev ? 4 : 0, marginBottom: 6 }]}>{p.text}</R.Text>;
  if (p.type === 'p') return <R.Text style={[st.body, { fontSize: size, lineHeight: lh, marginBottom: last ? 0 : gap, marginTop: prev === 'li' ? 4 : 0 }]} orphans={2} widows={2}>{p.text}</R.Text>;
  return (
    <R.View style={[st.li, last ? { marginBottom: 0 } : {}]} wrap={false}>
      <R.View style={[st.liMark, { marginTop: (size * lh - 4.5) / 2 }]} />
      <R.Text style={[st.body, { flexGrow: 1, flexBasis: 0, fontSize: size, lineHeight: lh }]}>{p.text}</R.Text>
    </R.View>
  );
}

/**
 * A section whose heading always travels with the start of its content.
 *  - Short sections (estimated ≤ 130 pt) move as one piece.
 *  - Longer ones flow: the heading (and `before`, e.g. the "Plan ve koşullar"
 *    opener) asks for at least two lines of the section below it on the same
 *    page (minPresenceAhead) instead of dragging the whole section to the next
 *    page; paragraphs keep at least two lines on each side of a break; the last
 *    two list items stay together, and `after` (the closing block) stays with
 *    the last part.
 * The last part has no bottom margin; `gap` is the only space after a section.
 */
function Section({ lay = {}, id, heading, body, list, size = 10.5, lh = 1.6, pgap = 9, gap = 21, before, after, afterGap = 0, width = CW, continued }: { lay?: LayoutOpts; id?: string; heading: React.ReactNode; body: string; list: boolean; size?: number; lh?: number; pgap?: number; gap?: number; before?: React.ReactNode; after?: React.ReactNode; afterGap?: number; width?: number; continued?: string }) {
  const parts = bodyParts(body, list);
  if (!parts.length) return null;
  const head = <R.Text style={[st.kicker, { marginBottom: 7.5 }]}>{heading}</R.Text>;
  const n = parts.length;
  const part = (i: number) => <Part key={i} p={parts[i]} prev={parts[i - 1]?.type} size={size} lh={lh} gap={pgap} last={i === n - 1} />;
  const tailAfter = after ? <R.View style={{ marginTop: afterGap }}>{after}</R.View> : null;
  const lineH = size * lh;
  const est = parts.reduce((h, p) => h + lines(p.text, p.type === 'li' ? width - 15 : width, size) * lineH + (p.type === 'li' ? 5 : pgap), 20);
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
  // Continuation label: when a list continues on the next page, the first item
  // there gets a small "TESLİMATLAR — DEVAM" line so the section stays clear.
  // Where that happens is measured in a rendering pass (probes record the page
  // each part ends on) and applied in the next one (renderDocumentPdf).
  const sid = id && continued ? id : null;
  const flow = idx.slice(0, n - tailN);
  const hasTail = Boolean(tailN || tailAfter);
  if (sid && lay.probe) lay.probe.order.set(sid, [{ key: 'h', li: false }, ...flow.map((i) => ({ key: String(i), li: parts[i].type === 'li' })), ...(hasTail ? [{ key: 't', li: true }] : [])]);
  const mark = (k: string) => (sid && lay.probe ? <R.View key={`m${k}`} render={({ pageNumber }) => { lay.probe!.ends.set(`${sid}:${k}`, pageNumber); return null; }} /> : null);
  // The label sits in the free band above the page's text area (negative top
  // margin = its own height), so adding it never moves a page break.
  const contStyle = [st.kicker, { marginBottom: 8, marginTop: -(KICK * 1.3 + 8) }];
  const label = (k: string) => (sid && lay.cont?.has(`${sid}:${k}`) ? <R.Text style={contStyle}>{continued}</R.Text> : null);
  return (
    <R.View style={{ marginBottom: gap }}>
      <R.View wrap={false} minPresenceAhead={lineH * 2 + 6}>{before}{head}</R.View>
      {mark('h')}
      {flow.map((i) => {
        const l = label(String(i));
        return (
          <React.Fragment key={i}>
            {l ? <R.View wrap={false}>{l}{part(i)}</R.View> : part(i)}
            {mark(String(i))}
          </React.Fragment>
        );
      })}
      {hasTail ? <R.View wrap={false}>{label('t')}{idx.slice(n - tailN).map(part)}{tailAfter}</R.View> : null}
      {hasTail ? mark('t') : null}
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

/* ── Page frame: motif, continuation header, footer ───────────── */

const website = (issuer: Issuer) => (issuer.website ?? '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

/** Bolt footerDetails: address · phone · e-mail · Vergi dairesi · VKN (+ MERSİS, sicil, KEP when filled). */
function footerDetails(issuer: Issuer, t: Labels): string {
  const f = (s?: string) => (s ?? '').trim();
  return [
    f(issuer.address), f(issuer.phone), f(issuer.email),
    f(issuer.taxOffice) ? `${t.taxOffice}: ${f(issuer.taxOffice)}` : '',
    f(issuer.taxNumber) ? `${t.vkn}: ${f(issuer.taxNumber)}` : '',
    f(issuer.mersis) ? `${t.mersis}: ${f(issuer.mersis)}` : '',
    f(issuer.tradeRegistry) ? `${t.tradeReg}: ${f(issuer.tradeRegistry)}` : '',
    f(issuer.kep) ? `${t.kep}: ${f(issuer.kep)}` : '',
  ].filter(Boolean).join(' · ');
}

interface FooterPlan { name: string; details: string; web: string; height: number; reserve: number }
function footerPlan(input: RenderInput, t: Labels, k = 1): FooterPlan {
  const name = (input.issuer.legalName ?? '').trim();
  const details = footerDetails(input.issuer, t);
  const web = website(input.issuer);
  const rightW = (web ? web.length * 11.25 * 0.62 + 18 : 0) + 7 * 9.75 * 0.6 + 18;
  const leftW = CW - rightW - 18;
  const leftH = (name ? 9.75 * 1.3 : 0) + (details ? 3 + lines(details, leftW, KICK) * 15 : 0);
  const height = 1.5 + 15 + Math.max(leftH, 11.25 * 1.3);
  return { name, details, web, height, reserve: BOTTOM + height + 14 * k };
}

function Frame({ input, t, foot, pages = 1 }: { input: RenderInput; t: Labels; foot: FooterPlan; pages?: number }) {
  // page number width from the previous pass's page count ("01" or "01 / 03")
  const pageW = (pages > 1 ? 7 : 2) * 9.75 * 0.6;
  const head = t.head[input.kind];
  const badge = input.mode === 'draft' ? up(t.draft) : input.sample ? up(t.sample) : '';
  const pillW = badge ? badge.length * (7 * 0.72 + 0.9) + 12 + 10 : 0;
  return (
    <>
      {/* every page: small logo header. Page 1 paints its masthead (white) over it,
          so it only shows on continuation pages; no render callback (react-pdf
          draws SVG paths and padded text wrongly inside render callbacks). */}
      <R.View fixed style={{ position: 'absolute', top: TOP1, left: PX }}><Logo width={66} /></R.View>
      {/* text only from page 2 on (no hidden duplicate text under the page-1 masthead); dynamic
          texts must be direct children of the page or react-pdf does not draw them */}
      <R.Text fixed style={[st.kicker, { position: 'absolute', top: TOP1 + 3.5, right: PX + pillW, width: 330, textAlign: 'right' }]} render={({ pageNumber }) => (pageNumber > 1 ? `${up(head.kicker)}  ·  ${input.number}` : '')} />
      {badge ? <R.View fixed style={{ position: 'absolute', top: TOP1 + 2.5, right: PX, width: pillW - 10, height: 7 * 1.3 + 5, backgroundColor: C.lime }} /> : null}
      {badge ? <R.Text fixed style={{ position: 'absolute', top: TOP1 + 5, right: PX, width: pillW - 10, textAlign: 'center', fontSize: 7, fontWeight: 800, letterSpacing: 0.9, lineHeight: 1.3, color: C.ink }} render={({ pageNumber }) => (pageNumber > 1 ? badge : '')} /> : null}
      {/* every page: footer (explicit position: react-pdf sizes absolute boxes with "bottom" unreliably) */}
      <R.View fixed style={{ position: 'absolute', left: PX, right: PX, top: H - BOTTOM - foot.height, height: foot.height, borderTopWidth: 1.5, borderTopColor: C.ink, paddingTop: 15, flexDirection: 'row', alignItems: 'flex-end' }}>
        <R.View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 18, alignSelf: 'flex-start' }}>
          {foot.name ? <R.Text style={st.footName}>{foot.name}</R.Text> : null}
          {foot.details ? <R.Text style={[st.footText, foot.name ? {} : { marginTop: 0 }]}>{foot.details}</R.Text> : null}
        </R.View>
        <R.View style={{ flexDirection: 'row', alignItems: 'flex-end', marginRight: pageW + 18 }}>
          {foot.web ? <R.Text style={st.footWeb}>{foot.web}</R.Text> : <R.Text style={st.footWeb}> </R.Text>}
        </R.View>
      </R.View>
      {/* the page number is a direct child of the page: inside another fixed box react-pdf does not draw it */}
      <R.Text fixed style={[st.footPage, { position: 'absolute', top: H - BOTTOM - 9.75 * 1.3 - 1, right: PX, width: pageW + 8, textAlign: 'right' }]} render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${two(pageNumber)} / ${two(totalPages)}` : two(pageNumber))} />
    </>
  );
}

/** Page 1 opening: logo, kicker, headline + dot (and the letter's second line). Pulled up to the page-1 top. */
function Masthead({ input, t, sub, k = 1 }: { input: RenderInput; t: Labels; sub?: string; k?: number }) {
  const head = t.head[input.kind];
  const year = /^(\d{4})/.exec(input.content.issueDate)?.[1] ?? '';
  const kicker = input.kind === 'letter' ? up(head.kicker) : `${up(head.kicker)}${year ? ` / ${year}` : ''}`;
  return (
    // White box from the page-1 top: covers the continuation header; the motif
    // is its absolute child, pinned to the page corner.
    <R.View wrap={false} style={{ marginTop: TOP1 - PT, marginLeft: -PX, marginRight: -PX, paddingLeft: PX, backgroundColor: '#FFFFFF' }}>
      <R.View style={{ position: 'absolute', top: -TOP1, right: 0 }}><BrandSvg file="yoca-motif.svg" width={MOTIF_W} /></R.View>
      <R.View style={{ width: CW - MOTIF_W + PX - 12 }}>
      <Logo width={100.5} />
      <R.View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 36 * k }}>
        <R.Text style={st.kicker}>{kicker}</R.Text>
        {input.mode === 'draft' || input.sample ? <R.Text style={[st.pill, { marginLeft: 10 }]}>{up(input.mode === 'draft' ? t.draft : t.sample)}</R.Text> : null}
      </R.View>
      <R.View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: -1 }}>
        <R.Text style={input.kind === 'letter' ? [st.h1, { fontSize: 60, letterSpacing: -60 * 0.035 }] : st.h1}>{head.h1}</R.Text>
        <Dot size={15} style={{ marginLeft: 9, marginBottom: 0 }} />
      </R.View>
      {sub ? <R.Text style={{ fontSize: 18, fontWeight: 800, color: C.ink, lineHeight: 1.25, marginTop: 16 }}>{sub}</R.Text> : null}
      </R.View>
    </R.View>
  );
}

function Kicker({ children, style }: { children: React.ReactNode; style?: Sty }) {
  return <R.Text style={[st.kicker, style ?? {}]}>{children}</R.Text>;
}

/* ── Teklif / proforma ────────────────────────────────────────── */

/**
 * Bolt table: three lime header cells (service / quantity / amount) repeated on
 * every page; each row shows the code, title and description, the quantity —
 * with the unit price, discount and line tax when they add information — and
 * the net amount. No data column is dropped.
 */
function ItemsTable({ c, t, tail, k = 1 }: { c: DocContent; t: Labels; tail?: React.ReactNode; k?: number }) {
  const { totals } = computeDocument(c);
  if (!totals.lines.length) return null;
  const rates = new Set(totals.lines.map((l) => (l.taxRateBp === null ? '' : String(l.taxRateBp))));
  const lineTax = rates.size > 1;
  return (
    <R.View>
      <R.View style={{ flexDirection: 'row' }} fixed>
        <R.View style={[st.th, { flexGrow: 1, flexBasis: 0, marginRight: GAP }]}><R.Text style={st.thText}>{up(t.service)}</R.Text></R.View>
        <R.View style={[st.th, { width: COL_QTY, marginRight: GAP }]}><R.Text style={st.thText}>{up(t.qty)}</R.Text></R.View>
        <R.View style={[st.th, { width: COL_AMT }]}><R.Text style={[st.thText, { textAlign: 'right' }]}>{up(t.amount)} / {c.currency}</R.Text></R.View>
      </R.View>
      {totals.lines.map((l, li) => {
        const it = c.items[l.index];
        const disc = it.discountPct.trim() && it.discountPct.trim() !== '0';
        const qtyOne = (parseMoney(it.quantity) ?? BigInt(0)) === BigInt(100) || it.quantity.trim() === '1';
        const showUnit = !l.missingPrice && (!qtyOne || disc);
        const row = (
          <R.View key={l.id} style={[st.row, { paddingVertical: 12 * k }]} wrap={false}>
            <R.View style={{ flexGrow: 1, flexBasis: 0, flexDirection: 'row', paddingHorizontal: 12, marginRight: GAP }}>
              <R.Text style={st.code}>{two(l.index + 1)}</R.Text>
              <R.View style={{ flexGrow: 1, flexBasis: 0 }}>
                <R.Text style={st.itemTitle}>{it.title || '—'}</R.Text>
                {it.description ? <R.Text style={st.itemDesc}>{it.description}</R.Text> : null}
              </R.View>
            </R.View>
            <R.View style={{ width: COL_QTY, paddingHorizontal: 12, paddingTop: 2, marginRight: GAP }}>
              <R.Text style={st.qty}>{fmtQty(it.quantity, c.locale)}{it.unit ? ` ${it.unit}` : ''}</R.Text>
              {showUnit ? <R.Text style={st.fig}>× {fmtMoney(parseMoney(it.unitPrice) ?? BigInt(0), c.currency, c.locale, false)}</R.Text> : null}
              {disc ? <R.Text style={st.fig}>{t.disc} {pctText(it.discountPct, c.locale)}</R.Text> : null}
              {lineTax && l.taxRateBp !== null ? <R.Text style={st.fig}>{t.tax} {pct(l.taxRateBp, c.locale)}</R.Text> : null}
            </R.View>
            <R.View style={{ width: COL_AMT, paddingHorizontal: 12, paddingTop: 1 }}>
              {l.missingPrice ? <R.Text style={[st.missing, { textAlign: 'right' }]}>{t.priceMissing}</R.Text> : <R.Text style={st.amount}>{l.net !== null ? fmtMoney(l.net, c.currency, c.locale, false) : ''}</R.Text>}
            </R.View>
          </R.View>
        );
        // the totals never start a page on their own: they keep the last row with them
        return li === totals.lines.length - 1 && tail ? <R.View key={l.id} wrap={false}>{row}{tail}</R.View> : row;
      })}
    </R.View>
  );
}

function Totals({ input, t, k = 1 }: { input: RenderInput; t: Labels; k?: number }) {
  const c = input.content;
  const { totals } = computeDocument(c);
  const money = (m: bigint) => fmtMoney(m, c.currency, c.locale, false);
  if (!totals.lines.length) return null;
  const multi = totals.taxes.length > 1;
  const grandText = totals.grand !== null ? money(totals.grand) : '';
  const kicker = `${up(input.kind === 'quote' ? t.investment : t.grand)} / ${c.currency}`;
  // 56 px (42 pt) like the sample; long amounts get smaller so they stay on one line
  const room = CW - 24 - kicker.length * KICK * 0.78 - 30;
  const size = Math.min(42, Math.floor(room / (Math.max(grandText.length, 1) * 0.62)));
  return (
    <R.View>
      <R.View style={{ alignSelf: 'flex-end', width: 222, paddingHorizontal: 12, marginTop: 18 * k }}>
        <R.View style={st.tRow}><R.Text style={st.tLabel}>{t.subtotal}</R.Text><R.Text style={st.tValue}>{money(totals.subtotal)}</R.Text></R.View>
        {totals.discount > BigInt(0) ? <R.View style={st.tRow}><R.Text style={st.tLabel}>{t.discount}</R.Text><R.Text style={st.tValue}>−{money(totals.discount)}</R.Text></R.View> : null}
        {totals.discount > BigInt(0) ? <R.View style={st.tRow}><R.Text style={st.tLabel}>{t.net}</R.Text><R.Text style={st.tValue}>{money(totals.net)}</R.Text></R.View> : null}
        {totals.taxes.map((x) => (
          <R.View key={String(x.rateBp)} style={st.tRow}>
            <R.Text style={st.tLabel}>{t.taxLine(fmtPct(x.rateBp, c.locale))}{multi ? <R.Text style={st.tBase}>{`  ${t.base} ${money(x.base)}`}</R.Text> : null}</R.Text>
            <R.Text style={st.tValue}>{money(x.tax)}</R.Text>
          </R.View>
        ))}
      </R.View>
      {totals.grand !== null ? (
        <R.View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 12 }}>
          <Kicker style={{ paddingBottom: 9 }}>{kicker}</Kicker>
          <R.View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <R.Text style={{ fontSize: size, fontWeight: 800, letterSpacing: -size * 0.02, color: C.ink, lineHeight: 1 }}>{grandText}</R.Text>
            <Dot size={13.5} style={{ marginLeft: 9 }} />
          </R.View>
        </R.View>
      ) : (
        <R.View style={st.warnBox}><R.Text style={st.missing}>{t.missingTotal(totals.missingPrices.length + totals.errors.length)}</R.Text></R.View>
      )}
    </R.View>
  );
}

function PaymentRows({ c }: { c: DocContent }) {
  const { payment } = computeDocument(c);
  const money = (m: bigint) => `${fmtMoney(m, c.currency, c.locale, false)} ${c.currency}`;
  return (
    <>
      {payment.rows.map((r, i) => (
        <R.View key={r.id} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: i ? 0.75 : 0, borderTopColor: C.line }}>
          <R.View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 10 }}>
            <R.Text style={[st.body, { lineHeight: 1.5 }]}>{r.pctBp !== null ? `${pct(r.pctBp, c.locale)} · ` : ''}{r.label}</R.Text>
            {r.due ? <R.Text style={[st.small, { fontSize: 8.6 }]}>{r.due}</R.Text> : null}
          </R.View>
          <R.Text style={[st.body, { lineHeight: 1.5, fontWeight: 600, width: 110, textAlign: 'right' }]}>{r.amount !== null ? money(r.amount) : '—'}</R.Text>
        </R.View>
      ))}
    </>
  );
}

function BankList({ banks, t }: { banks: BankAccount[]; t: Labels }) {
  return (
    <>
      {banks.map((a, i) => (
        <R.View key={a.id} style={{ marginTop: i ? 9 : 0 }}>
          <R.Text style={[st.strong, { fontSize: 10 }]}>{[a.bank, a.currency].filter(Boolean).join(' · ')}</R.Text>
          {a.holder ? <R.Text style={[st.body, { fontSize: 9.75, lineHeight: 1.5 }]}>{t.holder}: {a.holder}</R.Text> : null}
          <R.Text style={[st.body, { fontSize: 9.75, lineHeight: 1.5, fontWeight: 600 }]}>{t.iban} {formatIban(a.iban)}</R.Text>
          {a.swift || a.branch ? <R.Text style={[st.small, { fontSize: 8.6 }]}>{[a.swift ? `${t.swift} ${a.swift}` : '', a.branch ? `${t.branch} ${a.branch}` : ''].filter(Boolean).join(' · ')}</R.Text> : null}
        </R.View>
      ))}
    </>
  );
}

/** Signatory under the logo: name, then title · company. Nothing when both are empty. */
function Signatory({ input, align = 'left' }: { input: RenderInput; align?: 'left' | 'right' }) {
  const c = input.content;
  if (!c.signatory.name && !c.signatory.title) return null;
  const brand = input.issuer.legalName || input.issuer.brand;
  const sub = [c.signatory.title, c.signatory.name ? brand : ''].filter(Boolean).join(' · ');
  return (
    <R.View style={{ marginTop: 12 }}>
      <R.Text style={[st.strong, { textAlign: align }]}>{c.signatory.name || brand}</R.Text>
      {sub ? <R.Text style={[st.small, { fontSize: 8.6, textAlign: align }]}>{sub}</R.Text> : null}
    </R.View>
  );
}

/** Bolt closing: 1.5 pt ink rule; "Ödeme ve koşullar" (payment plan, bank details, closing text) left, logo right. */
const CLOSING_LEFT = 330;

/**
 * Proforma: a SHORT Notlar text (the free payment / terms text, at most
 * TERMS_MAX_LINES lines in the closing column) is printed inside "Ödeme ve
 * koşullar", right under the payment plan, as in the Bolt sample — and not
 * again as a separate section, so a few sentences never open a "Plan ve
 * koşullar" page. Longer notes stay a normal section that flows over pages.
 */
const TERMS_MAX_LINES = 9;
function inlineTerms(kind: DocKind, blocks: Block[]): Block | null {
  if (kind !== 'proforma') return null;
  const notes = blocks.filter((b) => b.key === 'notes' && b.body.trim());
  if (notes.length !== 1) return null;
  const parts = bodyParts(notes[0].body, BLOCK_LABEL.notes.list);
  const n = parts.reduce((sum, p) => sum + lines(p.text, p.type === 'li' ? CLOSING_LEFT - 15 : CLOSING_LEFT, 10.5), 0) + Math.max(0, parts.length - 1) * 0.6;
  return n <= TERMS_MAX_LINES ? notes[0] : null;
}

function CommercialClosing({ input, t, banks, terms, k = 1 }: { input: RenderInput; t: Labels; banks: BankAccount[]; terms?: Block | null; k?: number }) {
  const c = input.content;
  const hasPay = computeDocument(c).payment.rows.length > 0;
  const termParts = terms ? bodyParts(terms.body, BLOCK_LABEL.notes.list) : [];
  // the section label is printed only when the admin wrote his own (the default "Notlar" adds nothing here)
  const ownHeading = terms && terms.heading.trim() && terms.heading.trim() !== BLOCK_LABEL.notes[c.locale] ? terms.heading.trim() : '';
  const hasTerms = termParts.length > 0;
  return (
    <R.View wrap={false} style={{ marginTop: 24 * k, borderTopWidth: 1.5, borderTopColor: C.ink, paddingTop: 18 * k, flexDirection: 'row', justifyContent: 'space-between' }}>
      <R.View style={{ width: CLOSING_LEFT }}>
        {hasPay || hasTerms ? <Kicker style={{ marginBottom: 6 }}>{up(t.paymentTerms)}</Kicker> : null}
        {hasPay ? <PaymentRows c={c} /> : null}
        {hasTerms ? (
          <R.View style={{ marginTop: hasPay ? 9 : 0 }}>
            {ownHeading ? <R.Text style={[st.strong, { fontSize: 10, marginBottom: 3 }]}>{ownHeading}</R.Text> : null}
            {termParts.map((p, i) => <Part key={i} p={p} prev={termParts[i - 1]?.type} size={10.5} lh={1.55} gap={6} last={i === termParts.length - 1} />)}
          </R.View>
        ) : null}
        {banks.length ? <><Kicker style={{ marginTop: hasPay || hasTerms ? 15 : 0, marginBottom: 6 }}>{up(t.bank)}</Kicker><BankList banks={banks} t={t} /></> : null}
        {c.closing ? <R.Text style={[st.body, { marginTop: hasPay || hasTerms || banks.length ? 15 : 0 }]}>{c.closing}</R.Text> : null}
      </R.View>
      <R.View style={{ width: 130, alignItems: 'flex-end' }}>
        <Logo width={112.5} />
        <Signatory input={input} align="right" />
      </R.View>
    </R.View>
  );
}

function InfoCol({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <R.View style={{ flexGrow: 1, flexBasis: 0 }}>
      <Kicker>{label}</Kicker>
      <R.View style={{ marginTop: 8 }}>{children}</R.View>
    </R.View>
  );
}

function recipientDetail(c: DocContent, t: Labels, commercial: boolean): string[] {
  const r = c.recipient;
  return [
    r.company && r.name ? r.name : '', r.attention ? `${t.attention}: ${r.attention}` : '', r.address,
    commercial ? [r.taxOffice ? `${t.taxOffice}: ${r.taxOffice}` : '', r.taxNumber ? `${t.taxNo}: ${r.taxNumber}` : ''].filter(Boolean).join(' · ') : '',
    commercial ? [r.email, r.phone].filter(Boolean).join(' · ') : '',
  ].filter(Boolean);
}

function statusLine(input: RenderInput, t: Labels): string {
  return input.mode === 'draft' ? t.draftLine : input.version ? t.versionLine(input.version, input.versionAt ?? '') : '';
}

function CommercialDocument({ input, layout }: { input: RenderInput; layout?: LayoutOpts }) {
  const c = input.content;
  const t = L[c.locale];
  const def = KIND_DEF[input.kind];
  const r = c.recipient;
  const clientName = r.company || r.name;
  const blocks = c.blocks.filter((b) => b.body.trim());
  const intro = blocks.find((b) => b.key === 'intro');
  const inline = inlineTerms(input.kind, blocks);
  const terms = blocks.filter((b) => b.key !== 'intro' && b !== inline);
  const banks = def.bank ? input.bankAccounts.filter((a) => c.bankAccountIds.includes(a.id)) : [];
  // Sections in the kit order: process blocks, the timeline, then the rest.
  const processKeys = new Set(['scope', 'deliverables', 'assumptions', 'revisions', 'terms']);
  const process = terms.filter((b) => processKeys.has(b.key) || b.key === 'custom');
  const rest = terms.filter((b) => !processKeys.has(b.key) && b.key !== 'custom');
  const name = (b: Block) => b.heading || BLOCK_LABEL[b.key][c.locale];
  const meta = [
    def.validity && c.validUntil ? `${t.valid}: ${fmtShort(c.validUntil, c.locale)}` : '',
    `${t.currency}: ${c.currency}`,
  ].filter(Boolean).join(' · ');
  const k = layout?.k ?? 1;
  const closing = <CommercialClosing input={input} t={t} banks={banks} terms={inline} k={k} />;

  type Item = (before?: React.ReactNode, after?: React.ReactNode) => React.ReactNode;
  const items: Item[] = [];
  for (const b of process) items.push((before, x) => <Section key={b.id} lay={layout} id={b.id} heading={up(name(b))} body={b.body} list={BLOCK_LABEL[b.key].list} before={before} after={x} continued={up(t.continued(name(b)))} />);
  if (def.deliveryTime && c.deliveryTime) items.push((before, x) => <Section key="delivery" lay={layout} id="delivery" heading={up(t.delivery)} body={c.deliveryTime} list={false} before={before} after={x} continued={up(t.continued(t.delivery))} />);
  for (const b of rest) items.push((before, x) => <Section key={b.id} lay={layout} id={b.id} heading={up(name(b))} body={b.body} list={BLOCK_LABEL[b.key].list} before={before} after={x} continued={up(t.continued(name(b)))} />);

  const opener = (
    <R.View style={{ borderTopWidth: 0.75, borderTopColor: C.line, paddingTop: 18, marginBottom: 18 }}>
      <R.Text style={{ fontSize: 16.5, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{t.plan}</R.Text>
    </R.View>
  );

  return (
    <>
      <Masthead input={input} t={t} k={k} />
      <R.View wrap={false}>
        <R.Text style={{ fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.35, marginTop: 25 * k }}>{input.title}</R.Text>
        {input.kind === 'proforma' ? <Kicker style={{ marginTop: 6 }}>{up(t.notInvoice)}</Kicker> : null}
      </R.View>

      <R.View wrap={false} style={{ marginTop: 30 * k, flexDirection: 'row' }}>
        <InfoCol label={up(t.preparedFor)}>
          <R.Text style={{ fontSize: 16.5, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{clientName || '—'}</R.Text>
          {recipientDetail(c, t, true).map((l, i) => <R.Text key={i} style={[st.small, { fontSize: 10.5, marginTop: i ? 0 : 3 }]}>{l}</R.Text>)}
        </InfoCol>
        <R.View style={{ width: 24 }} />
        <InfoCol label={up(t.docDate)}>
          <R.Text style={{ fontSize: 10.5, fontWeight: 600, color: C.ink, lineHeight: 1.4 }}>{input.number} / {fmtShort(c.issueDate, c.locale)}</R.Text>
          <R.Text style={[st.small, { marginTop: 3 }]}>{meta}</R.Text>
          {input.sourceNumber ? <R.Text style={st.small}>{t.source}: {input.sourceNumber}</R.Text> : null}
          {c.projectName ? <R.Text style={st.small}>{t.project}: {c.projectName}</R.Text> : null}
          {c.reference ? <R.Text style={st.small}>{t.reference}: {c.reference}</R.Text> : null}
          {statusLine(input, t) ? <R.Text style={st.small}>{statusLine(input, t)}</R.Text> : null}
        </InfoCol>
      </R.View>

      {intro ? (
        <R.View style={{ marginTop: 24 * k }}>
          {bodyParts(intro.body, false).map((p, i, a) => <Part key={i} p={p} prev={a[i - 1]?.type} size={11.25} lh={1.5} gap={9} last={i === a.length - 1} />)}
        </R.View>
      ) : null}

      <R.View style={{ marginTop: 30 * k }}>
        <ItemsTable c={c} t={t} k={k} tail={<Totals input={input} t={t} k={k} />} />
      </R.View>

      {(() => {
        // no sections: the closing block follows the totals (on the next page if it does not fit)
        if (!items.length) return closing;
        const lastI = items.length - 1;
        return (
          <R.View style={{ marginTop: layout?.planBreak ? 0 : 30 * k }} break={layout?.planBreak}>
            {layout?.probe ? <R.View render={({ pageNumber }) => { layout.probe!.planPage = pageNumber; return null; }} /> : null}
            {items.map((it, i) => it(i === 0 ? opener : undefined, i === lastI ? closing : undefined))}
          </R.View>
        );
      })()}
    </>
  );
}

/* ── Antetli yazı / durum raporu / teslim belgesi ─────────────── */

/** Bolt letter closing: "Saygılarımızla," then the logo (and the signatory when filled). */
function LetterClosing({ input }: { input: RenderInput }) {
  const c = input.content;
  return (
    <R.View wrap={false} style={{ marginTop: 24 }}>
      {c.closing ? <R.Text style={[st.body, { fontSize: 11.25, lineHeight: 1.5 }]}>{c.closing}</R.Text> : null}
      <R.View style={{ marginTop: c.closing ? 15 : 0 }}><Logo width={90} /></R.View>
      <Signatory input={input} />
    </R.View>
  );
}

function LetterDocument({ input, layout }: { input: RenderInput; layout?: LayoutOpts }) {
  const c = input.content;
  const t = L[c.locale];
  const r = c.recipient;
  const SIZE = 11.25; // 15 px
  const LH = 1.5;
  const PG = 15;      // space-y-5
  const blocks = c.blocks.filter((b) => b.body.trim());
  const numbered = input.kind === 'status_report';
  const head = t.head[input.kind];
  const details = [
    statusLine(input, t),
    input.kind === 'status_report' && c.period ? `${t.period}: ${c.period}` : '',
    c.projectName ? `${t.project}: ${c.projectName}` : '',
    c.reference ? `${t.reference}: ${c.reference}` : '',
  ].filter(Boolean);
  const subjectLine = c.subject && c.subject.trim() !== input.title.trim() ? c.subject : '';
  const sig = <LetterClosing input={input} />;
  const salutation = c.salutation?.trim() ? <R.Text style={[st.body, { fontSize: SIZE, lineHeight: LH, marginBottom: PG }]}>{c.salutation}</R.Text> : null;

  return (
    <>
      <Masthead input={input} t={t} sub={head.sub} />

      <R.View wrap={false} style={{ marginTop: 30, flexDirection: 'row' }}>
        <InfoCol label={up(t.recipient)}>
          <R.Text style={{ fontSize: 11.25, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>{r.company || r.name || '—'}</R.Text>
          {recipientDetail(c, t, false).map((l, i) => <R.Text key={i} style={[st.small, { marginTop: i ? 0 : 2 }]}>{l}</R.Text>)}
        </InfoCol>
        <R.View style={{ width: 24 }} />
        <InfoCol label={up(t.refDate)}>
          <R.Text style={{ fontSize: 11.25, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>{input.number} / {fmtShort(c.issueDate, c.locale)}</R.Text>
          {details.map((l, i) => <R.Text key={i} style={[st.small, { marginTop: i ? 0 : 2 }]}>{l}</R.Text>)}
        </InfoCol>
      </R.View>

      <R.View wrap={false} style={{ marginTop: 24, borderTopWidth: 1.125, borderTopColor: C.ink, paddingTop: 24, marginBottom: 24 }} minPresenceAhead={60}>
        <Kicker>{up(t.subject)}</Kicker>
        <R.Text style={{ fontSize: 16.5, fontWeight: 600, color: C.ink, lineHeight: 1.3, marginTop: 6 }}>{input.title}</R.Text>
        {subjectLine ? <R.Text style={[st.small, { fontSize: 10.5, marginTop: 4 }]}>{subjectLine}</R.Text> : null}
      </R.View>

      {blocks.length === 0 ? <>{salutation}{sig}</> : null}
      {blocks.map((b, i) => {
        const last = i === blocks.length - 1;
        const after = last ? sig : undefined;
        if (input.kind === 'letter' && b.key === 'body') {
          const parts = bodyParts(b.body, false);
          // Units that must not split: list runs (≤ 3 items together, otherwise
          // the last two), and the last part together with the closing.
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
          if (after && units.length) units[units.length - 1].keep = true;
          // a sub-heading joins the unit after it when that unit cannot split;
          // otherwise it asks for two lines of it on the same page
          const merged: Unit[] = [];
          for (let u = 0; u < units.length; u += 1) {
            const cur = units[u];
            const next = units[u + 1];
            const lead = parts[cur.to];
            // a paragraph that introduces a list ("…duyuyoruz:") stays with the list
            const introLine = lead.type === 'p' && /:\s*$/.test(lead.text) && next && parts[next.from].type === 'li' && lines(lead.text, CW, SIZE) <= 3;
            if ((parts[cur.from].type === 'h' && next && (next.keep || u + 1 === units.length - 1)) || introLine) { merged.push({ from: cur.from, to: next.to, keep: true }); u += 1; } else merged.push(cur);
          }
          const out: React.ReactNode[] = merged.map((u, m) => {
            const isLast = m === merged.length - 1;
            const nodes = parts.slice(u.from, u.to + 1).map((p, q) => <Part key={q} p={p} prev={parts[u.from + q - 1]?.type} size={SIZE} lh={LH} gap={PG} last={u.from + q === parts.length - 1} />);
            // the salutation stays with the first lines of the text
            const sal = m === 0 && i === 0 ? salutation : null;
            if (u.keep || (isLast && after) || sal) {
              const solo = parts[u.from].type === 'h' && u.from === u.to;
              return <R.View key={m} wrap={u.keep || (isLast && after) ? false : true} minPresenceAhead={solo ? SIZE * LH * 2 + 6 : undefined}>{sal}{nodes}{isLast && after ? after : null}</R.View>;
            }
            return <React.Fragment key={m}>{nodes}</React.Fragment>;
          });
          return <R.View key={b.id}>{out}</R.View>;
        }
        const heading = `${numbered ? `${two(i + 1)} / ` : ''}${up(b.heading || BLOCK_LABEL[b.key][c.locale])}`;
        return (
          <React.Fragment key={b.id}>
            {i === 0 ? salutation : null}
            <Section lay={layout} id={b.id} heading={heading} body={b.body} list={BLOCK_LABEL[b.key].list} size={SIZE} lh={LH} pgap={PG - 3} gap={21} after={after} continued={up(t.continued(b.heading || BLOCK_LABEL[b.key][c.locale]))} />
          </React.Fragment>
        );
      })}
    </>
  );
}

/* ── Document ─────────────────────────────────────────────────── */

export function DocumentPdf(input: RenderInput & { layout?: LayoutOpts }) {
  const c = input.content;
  UP_LOCALE = c.locale === 'tr' ? 'tr-TR' : 'en-GB';
  const t = L[c.locale];
  const commercial = input.kind === 'quote' || input.kind === 'proforma';
  const foot = footerPlan(input, t, input.layout?.k ?? 1);
  const pageStyle = { fontFamily: 'Manrope', fontSize: 10.5, color: C.ink, backgroundColor: '#FFFFFF', paddingTop: PT, paddingBottom: foot.reserve, paddingLeft: PX, paddingRight: PX };
  const issuer = input.issuer;
  return (
    <R.Document title={`${input.number} — ${input.title}`} author={issuer.legalName || issuer.brand} creator="Yoca yönetim paneli" producer="Yoca" language={c.locale === 'tr' ? 'tr-TR' : 'en-GB'}>
      <R.Page size="A4" style={pageStyle}>
        <Frame input={input} t={t} foot={foot} pages={input.layout?.pages} />
        {commercial ? <CommercialDocument input={input} layout={input.layout} /> : <LetterDocument input={input} layout={input.layout} />}
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

type Probe = NonNullable<LayoutOpts['probe']>;
const newProbe = (): Probe => ({ planPage: 0, ends: new Map(), order: new Map() });

/** Where a list continues on a new page: an unsplittable part (list item / tail group) that ends on a later page than the part before it. */
function continuations(p: Probe): Set<string> {
  const out = new Set<string>();
  p.order.forEach((keys, sid) => {
    for (let i = 1; i < keys.length; i += 1) {
      const prev = p.ends.get(`${sid}:${keys[i - 1].key}`);
      const cur = p.ends.get(`${sid}:${keys[i].key}`);
      if (keys[i].li && prev && cur && cur > prev) out.add(`${sid}:${keys[i].key}`);
    }
  });
  return out;
}
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && Array.from(a).every((x) => b.has(x));

/**
 * One layout: render, find where lists continue on a new page, render again
 * with the continuation labels there; repeat until the places stop changing
 * (a label adds a line and can move a later break). At most 4 passes.
 */
async function renderLaidOut(input: RenderInput, base: Omit<LayoutOpts, 'cont' | 'probe'>): Promise<RenderedPdf & { planPage: number }> {
  let cont = new Set<string>();
  let last: RenderedPdf & { planPage: number } = { buffer: Buffer.alloc(0), pages: 0, planPage: 0 };
  let pages = 1;
  for (let pass = 0; pass < 5; pass += 1) {
    const probe = newProbe();
    const r = await renderOnce(input, { ...base, cont, probe, pages });
    last = { ...r, planPage: probe.planPage };
    const next = continuations(probe);
    const samePages = (r.pages > 1) === (pages > 1);
    if (sameSet(next, cont) && samePages) return last;
    cont = next;
    pages = r.pages;
  }
  return last;
}

/** Teklif / proforma at one spacing: when "Plan ve koşullar" starts on one page and runs onto the last page, a second layout starts it on a fresh page and is kept if the document does not get longer. */
async function commercialLayout(input: RenderInput, k: number): Promise<RenderedPdf> {
  const first = await renderLaidOut(input, { k });
  if (!first.planPage || first.planPage >= first.pages) return { buffer: first.buffer, pages: first.pages };
  const second = await renderLaidOut(input, { planBreak: true, k });
  const pick = second.pages <= first.pages ? second : first;
  return { buffer: pick.buffer, pages: pick.pages };
}

/**
 * Every layout adds "… — devam" labels where a list continues on a new page.
 * Teklif / proforma: a short document that runs onto a second page only by a
 * little (e.g. three items, totals and the payment terms) is laid out again
 * with the vertical gaps reduced evenly (×0.85, then ×0.7: margins between
 * blocks, row padding, the gap above the footer; never the type sizes or the
 * content). The tighter layout is used only if the whole document then fits on
 * ONE page; longer documents keep the normal spacing and flow over as many
 * pages as they need. No page limit is applied.
 */
export async function renderDocumentPdf(input: RenderInput): Promise<RenderedPdf> {
  await loadRenderer();
  registerFonts();
  if (input.kind !== 'quote' && input.kind !== 'proforma') {
    const r = await renderLaidOut(input, {});
    return { buffer: r.buffer, pages: r.pages };
  }
  const normal = await commercialLayout(input, 1);
  if (normal.pages !== 2) return normal;
  for (const k of [0.85, 0.7]) {
    const tight = await commercialLayout(input, k);
    if (tight.pages === 1) return tight;
  }
  return normal;
}

export { CW as CONTENT_W };

/* ── Kurumsal materyaller: blank letterhead and business card ─── */

/**
 * Blank letterhead (Boş antet): A4 with the motif, the original logo and the
 * footer from the CURRENT company profile. No number, no document record.
 */
export async function renderLetterheadPdf(issuer: Issuer, locale: 'tr' | 'en' = 'tr'): Promise<RenderedPdf> {
  await loadRenderer();
  registerFonts();
  UP_LOCALE = locale === 'tr' ? 'tr-TR' : 'en-GB';
  const t = L[locale];
  const foot = footerPlan({ kind: 'letter', number: '', title: '', content: { locale } as DocContent, issuer, bankAccounts: [], mode: 'final' }, t);
  const doc = (
    <R.Document title={locale === 'tr' ? 'Yoca antetli kâğıt' : 'Yoca letterhead'} author={issuer.legalName || issuer.brand} creator="Yoca yönetim paneli" producer="Yoca" language={locale === 'tr' ? 'tr-TR' : 'en-GB'}>
      <R.Page size="A4" style={{ fontFamily: 'Manrope', backgroundColor: '#FFFFFF', paddingTop: TOP1, paddingLeft: PX, paddingRight: PX, paddingBottom: foot.reserve }}>
        <R.View fixed style={{ position: 'absolute', top: 0, right: 0 }}><BrandSvg file="yoca-motif.svg" width={MOTIF_W} /></R.View>
        <Logo width={100.5} />
        <R.View fixed style={{ position: 'absolute', left: PX, right: PX, top: H - BOTTOM - foot.height, height: foot.height, borderTopWidth: 1.5, borderTopColor: C.ink, paddingTop: 15, flexDirection: 'row', alignItems: 'flex-end' }}>
          <R.View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 18, alignSelf: 'flex-start' }}>
            {foot.name ? <R.Text style={st.footName}>{foot.name}</R.Text> : null}
            {foot.details ? <R.Text style={[st.footText, foot.name ? {} : { marginTop: 0 }]}>{foot.details}</R.Text> : null}
          </R.View>
          {foot.web ? <R.Text style={st.footWeb}>{foot.web}</R.Text> : null}
        </R.View>
      </R.Page>
    </R.Document>
  );
  const buffer = await R.renderToBuffer(doc);
  return { buffer, pages: 1 };
}

export interface CardInput { name: string; title: string; phone: string; email: string; website: string; bleedMm: number }

const MM = 72 / 25.4;

/**
 * Business card (Kartvizit), Bolt BusinessCard (321 × 208 px = 85 × 55 mm):
 * page 1 front (ink, white logo, motif, "Fikirden etkiye."), page 2 back
 * (mist, logo, name, title, phone, e-mail, website, dot). Trim 85 × 55 mm;
 * the bleed (taşma payı) is given separately; crop marks sit outside the
 * bleed. RGB — a proof for the print shop, not a print-ready file.
 */
export async function renderBusinessCardPdf(card: CardInput): Promise<RenderedPdf> {
  await loadRenderer();
  registerFonts();
  UP_LOCALE = 'tr-TR';
  const TW = 85 * MM;
  const TH = 55 * MM;
  const B = Math.max(0, Math.min(5, card.bleedMm)) * MM;
  const SLUG = 8 * MM;            // room for the crop marks
  const PW = TW + 2 * (B + SLUG);
  const PH = TH + 2 * (B + SLUG);
  const X0 = SLUG + B;            // trim box origin on the page
  const Y0 = SLUG + B;
  const s = TW / 321;             // Bolt px → pt on the card
  const marks = (
    <>
      {[[X0, 0], [X0 + TW, 0], [X0, PH - SLUG + 2 * MM], [X0 + TW, PH - SLUG + 2 * MM]].map(([x, y], i) => <R.View key={`v${i}`} style={{ position: 'absolute', left: x - 0.25, top: y, width: 0.5, height: SLUG - 2 * MM, backgroundColor: '#000000' }} />)}
      {[[0, Y0], [0, Y0 + TH], [PW - SLUG + 2 * MM, Y0], [PW - SLUG + 2 * MM, Y0 + TH]].map(([x, y], i) => <R.View key={`h${i}`} style={{ position: 'absolute', left: x, top: y - 0.25, width: SLUG - 2 * MM, height: 0.5, backgroundColor: '#000000' }} />)}
    </>
  );
  const slugText = (side: string) => (
    <R.Text style={{ position: 'absolute', left: X0, top: PH - SLUG + 2.2 * MM, fontFamily: 'Manrope', fontSize: 4.5, color: '#666A65', lineHeight: 1.2 }}>
      {`Yoca kartvizit · ${side} · kesim 85 × 55 mm · taşma payı ${card.bleedMm} mm · RGB prova (matbaa onayı gerekir)`}
    </R.Text>
  );
  const nameSize = card.name.length > 24 ? 15 : 19.5;
  const contact = [card.phone.trim(), card.email.trim()].filter(Boolean);
  const doc = (
    <R.Document title={`Kartvizit — ${card.name}`} author="Yoca" creator="Yoca yönetim paneli" producer="Yoca">
      {/* front */}
      <R.Page size={[PW, PH]} style={{ backgroundColor: '#FFFFFF' }}>
        <R.View style={{ position: 'absolute', left: SLUG, top: SLUG, width: TW + 2 * B, height: TH + 2 * B, backgroundColor: C.ink, overflow: 'hidden' }}>
          <R.View style={{ position: 'absolute', left: B + 36 * s, top: B + 36 * s }}><BrandSvg file="yoca-logo-primary.svg" width={156 * s} /></R.View>
          <R.View style={{ position: 'absolute', right: B - 24 * s, bottom: B - 56 * s }}><BrandSvg file="yoca-motif.svg" width={150 * s} /></R.View>
          <R.Text style={{ position: 'absolute', left: B + 36 * s, bottom: B + 36 * s, fontFamily: 'Manrope', fontSize: 10 * s, fontWeight: 700, letterSpacing: 10 * s * 0.2, color: '#FFFFFF', lineHeight: 1.2 }}>{up('Fikirden etkiye.')}</R.Text>
        </R.View>
        {marks}
        {slugText('ön yüz')}
      </R.Page>
      {/* back */}
      <R.Page size={[PW, PH]} style={{ backgroundColor: '#FFFFFF' }}>
        <R.View style={{ position: 'absolute', left: SLUG, top: SLUG, width: TW + 2 * B, height: TH + 2 * B, backgroundColor: C.mist, overflow: 'hidden' }}>
          <R.View style={{ position: 'absolute', left: B + 36 * s, top: B + 30 * s }}><Logo width={96 * s} /></R.View>
          <R.View style={{ position: 'absolute', left: B + 36 * s, top: B + 76 * s, width: TW - 72 * s }}>
            <R.Text style={{ fontFamily: 'Manrope', fontSize: nameSize, fontWeight: 800, letterSpacing: -nameSize * 0.01, color: C.ink, lineHeight: 1.15 }}>{card.name}</R.Text>
            {card.title.trim() ? <R.Text style={{ fontFamily: 'Manrope', fontSize: 12 * s, color: C.muted, lineHeight: 1.3, marginTop: 3 }}>{card.title}</R.Text> : null}
          </R.View>
          <R.View style={{ position: 'absolute', left: B + 36 * s, bottom: B + 30 * s, width: TW - 100 * s }}>
            {contact.map((l) => <R.Text key={l} style={{ fontFamily: 'Manrope', fontSize: 11 * s, color: C.ink, lineHeight: 1.35 }}>{l}</R.Text>)}
            {card.website.trim() ? <R.Text style={{ fontFamily: 'Manrope', fontSize: 13 * s, fontWeight: 700, color: C.ink, lineHeight: 1.35 }}>{card.website.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')}</R.Text> : null}
          </R.View>
          <R.View style={{ position: 'absolute', right: B + 36 * s, bottom: B + 40 * s }}><Dot size={16 * s} /></R.View>
        </R.View>
        {marks}
        {slugText('arka yüz')}
      </R.Page>
    </R.Document>
  );
  const buffer = await R.renderToBuffer(doc);
  return { buffer, pages: 2 };
}
