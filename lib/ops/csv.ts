/**
 * Yoca Operasyon — CSV in/out (pure; unit-tested).
 * RFC 4180 parsing (quotes, "" escapes, CRLF, ; or , separators), export with
 * quoting and a formula-injection guard, and the service import checks:
 * column mapping → typed rows → errors and possible duplicates. An import
 * only ever ADDS records; a duplicate is reported, never merged or overwritten.
 */

import { parseAmount, minorToDb, CURRENCIES } from '@/lib/ops/money';
import { PERIODS, SERVICE_KINDS, KIND_LABEL, PERIOD_LABEL, type ServiceKind } from '@/lib/ops/model';

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const head = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => head.split(c).length - 1;
  const best = ([',', ';', '\t'] as const).map((c) => [c, count(c)] as const).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** A cell that a spreadsheet would run as a formula gets a leading apostrophe. */
function safeCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(safeCell).join(',')).join('\r\n') + '\r\n';
}

/* ── Service import ─────────────────────────────────────────────── */

export const IMPORT_FIELDS = [
  { key: 'name', label: 'Kayıt adı', required: true },
  { key: 'kind', label: 'Tür', required: true },
  { key: 'client', label: 'Müşteri (ad)' },
  { key: 'provider', label: 'Sağlayıcı (ad)' },
  { key: 'domain', label: 'Alan adı (domain)' },
  { key: 'start_on', label: 'Başlangıç' },
  { key: 'end_on', label: 'Bitiş' },
  { key: 'due_on', label: 'Ödeme vadesi' },
  { key: 'period', label: 'Yenileme dönemi' },
  { key: 'auto_renew', label: 'Otomatik yenileme' },
  { key: 'cost_amount', label: 'Alış bedeli' },
  { key: 'cost_currency', label: 'Alış para birimi' },
  { key: 'price_amount', label: 'Satış bedeli' },
  { key: 'price_currency', label: 'Satış para birimi' },
  { key: 'team_owner', label: 'Ekip sorumlusu' },
  { key: 'note', label: 'Not' },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]['key'];

const norm = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Header → field guess (by key or Turkish label). */
export function guessMapping(header: string[]): Partial<Record<ImportField, number>> {
  const out: Partial<Record<ImportField, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const f of IMPORT_FIELDS) if (out[f.key] === undefined && (n === norm(f.key) || n === norm(f.label))) out[f.key] = i;
  });
  return out;
}

function parseDate(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) { m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s); if (m) m = [m[0], m[3], m[2].padStart(2, '0'), m[1].padStart(2, '0')] as unknown as RegExpExecArray; }
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? undefined : iso;
}

function parseKind(v: string): ServiceKind | undefined {
  const n = norm(v);
  return SERVICE_KINDS.find((k) => norm(k) === n || norm(KIND_LABEL[k]).startsWith(n) || (n === 'sunucu' && k === 'server') || (n === 'eposta' && k === 'email') || (n === 'e posta' && k === 'email') || (n === 'bakim' && k === 'maintenance'));
}

export interface ImportRow {
  line: number;
  values: Record<string, string | null>;
  errors: string[];
  duplicateOf: string | null;
}

/**
 * Typed rows with errors. `existing` are current services (name + kind +
 * domain) — a row matching one by domain, or by name and kind, is marked as
 * a possible duplicate (also within the file).
 */
export function validateImport(rows: string[][], mapping: Partial<Record<ImportField, number>>, existing: Array<{ id: string; name: string; kind: string; domain?: string | null }>): ImportRow[] {
  const seen = new Map<string, string>();
  for (const e of existing) {
    seen.set(`n:${norm(e.name)}:${e.kind}`, e.name);
    if (e.domain) seen.set(`d:${norm(e.domain)}`, e.name);
  }
  return rows.map((r, idx) => {
    const get = (k: ImportField) => (mapping[k] === undefined ? '' : (r[mapping[k] as number] ?? '').trim());
    const errors: string[] = [];
    const values: Record<string, string | null> = {};
    const name = get('name');
    if (!name) errors.push('Kayıt adı boş.');
    values.name = name || null;
    const kindRaw = get('kind');
    const kind = kindRaw ? parseKind(kindRaw) : undefined;
    if (!kindRaw) errors.push('Tür boş.');
    else if (!kind) errors.push(`Tür tanınmadı: “${kindRaw}”.`);
    values.kind = kind ?? null;
    for (const k of ['start_on', 'end_on', 'due_on'] as const) {
      const d = parseDate(get(k));
      if (d === undefined) errors.push(`${IMPORT_FIELDS.find((f) => f.key === k)?.label}: geçersiz tarih “${get(k)}” (YYYY-AA-GG veya GG.AA.YYYY).`);
      values[k] = d ?? null;
    }
    for (const [a, c] of [['cost_amount', 'cost_currency'], ['price_amount', 'price_currency']] as const) {
      const raw = get(a);
      const minor = parseAmount(raw);
      if (minor === undefined) errors.push(`${IMPORT_FIELDS.find((f) => f.key === a)?.label}: geçersiz tutar “${raw}”.`);
      values[a] = minor === null || minor === undefined ? null : minorToDb(minor);
      const cur = get(c).toUpperCase().replace('TL', 'TRY');
      if (cur && !(CURRENCIES as readonly string[]).includes(cur)) errors.push(`Para birimi tanınmadı: “${get(c)}”.`);
      if (values[a] !== null && !cur) errors.push(`${IMPORT_FIELDS.find((f) => f.key === a)?.label} için para birimi yok.`);
      values[c] = cur || null;
    }
    const per = get('period');
    const perNorm = norm(per);
    const period = per ? PERIODS.find((p) => norm(p) === perNorm || norm(PERIOD_LABEL[p]) === perNorm) : null;
    if (per && !period) errors.push(`Yenileme dönemi tanınmadı: “${per}”.`);
    values.period = period ?? null;
    const ar = norm(get('auto_renew'));
    values.auto_renew = !ar ? 'unknown' : ['evet', 'acik', 'on', 'yes', '1', 'true'].includes(ar) ? 'on' : ['hayir', 'kapali', 'off', 'no', '0', 'false'].includes(ar) ? 'off' : 'unknown';
    for (const k of ['client', 'provider', 'domain', 'team_owner', 'note'] as const) values[k] = get(k) || null;
    let duplicateOf: string | null = null;
    const keyN = name && kind ? `n:${norm(name)}:${kind}` : null;
    const keyD = values.domain ? `d:${norm(values.domain)}` : null;
    if (keyD && seen.has(keyD)) duplicateOf = seen.get(keyD) ?? null;
    else if (keyN && seen.has(keyN)) duplicateOf = seen.get(keyN) ?? null;
    if (keyN && !seen.has(keyN)) seen.set(keyN, `${name} (dosyada satır ${idx + 2})`);
    if (keyD && !seen.has(keyD)) seen.set(keyD, `${name} (dosyada satır ${idx + 2})`);
    return { line: idx + 2, values, errors, duplicateOf };
  });
}
