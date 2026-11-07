/**
 * Yoca Giderler — Excel import plan (pure; unit-tested; no real data in code).
 *
 * Turns the rows of an expense sheet ("Gider kalemi | Aylık tutar (TL) | Son
 * ödeme tarihi | Ödeme durumu | Ödeme yöntemi | Notlar") into a PREVIEW. Nothing
 * is written here. Rules:
 *   - "", "?", "-", "—" amounts are NOT zero: "Tutar bekleniyor", outside totals.
 *   - An empty payment status is not "Ödenmedi"; it stays "boş".
 *   - "Ödendi" without a payment date is NOT turned into a dated payment: the
 *     period is created and held for review until the real date is entered.
 *   - Due date, provider, account, document number or tax data are never invented.
 *   - Name-only rows are suggestions (not monthly debts); "Diğer gider N" blank
 *     rows are skipped; rows that look like Operasyon costs (domain, hosting,
 *     server, database, e-mail, cloud) are possible duplicates, never created.
 *   - Fixed monthly costs (rent, building fee, internet, accountant) are proposed
 *     as monthly with the source amount; variable utilities (electricity, water,
 *     gas) as monthly WITHOUT a fixed amount (each new period "Tutar bekleniyor").
 *   - Notes keep exact text (long numbers are never rounded or reformatted).
 *   - Every row gets a stable key (file sheet + month + row + name) and a content
 *     hash: importing the same file again creates nothing; a changed row is
 *     reported, never applied silently.
 */

import { excelDate } from '@/lib/fin/xlsxValues';
import type { XSheet } from '@/lib/fin/xlsx';
import { parseAmount, minorToDb, type Minor } from '@/lib/ops/money';
import type { Category } from '@/lib/fin/model';

const ZERO = BigInt(0);
const MONTHS_TR = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const lower = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
/** Stable key part: lower-case, Turkish letters folded, only a-z 0-9 and '-'. */
const slug = (s: string) => lower(s).replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'satir';

export type ImportAction = 'create' | 'pending_payment' | 'needs_info' | 'suggestion' | 'possible_duplicate' | 'skip_blank';
export const ACTION_LABEL: Record<ImportAction, string> = {
  create: 'Gider ve dönem oluşturulacak', pending_payment: 'Kaynakta “Ödendi”; ödeme tarihi bekleniyor', needs_info: 'Tutar veya tarih eksik',
  suggestion: 'Gider tanımı önerisi (oluşturulmaz)', possible_duplicate: 'Olası eşleşme (Operasyon) — doğrulanmadı', skip_blank: 'Boş satır (atlanır)',
};

export interface SourceRow {
  row: number;
  name: string;
  amountText: string;      // exact cell text ('' when empty)
  amountIsNumber: boolean;
  dueText: string;         // exact cell text / serial
  dueIsNumber: boolean;
  status: string;
  method: string;
  note: string;
}

export interface PlanRow {
  row: number;
  key: string;
  hash: string;
  name: string;
  category: Category;
  action: ImportAction;
  recurrence: 'monthly' | null;
  variable: boolean;            // amount differs month to month: new periods open without an amount
  opsKinds: string[];           // Operasyon service kinds this row MIGHT overlap with (never proof)
  amount: string | null;        // numeric(14,2) text, or null = "Tutar bekleniyor"
  amountNote: string | null;    // why the amount is missing ('boş', '?', '-')
  due: string | null;           // YYYY-MM-DD
  status: 'paid' | 'unpaid' | 'empty' | 'other';
  statusText: string;
  method: 'bank_transfer' | 'card' | 'cash' | 'direct_debit' | 'other' | null;
  methodText: string;
  note: string | null;          // internal note, exact text
  missing: string[];
  reasons: string[];
  payload: SourceRow;
}

export interface ImportTotals {
  source: { total: string | null; paid: string | null; remaining: string | null };
  computed: { total: Minor; paid: Minor; remaining: Minor; knownCount: number; missingCount: number };
  system: { periods: Minor; paidImported: Minor; review: Minor; remaining: Minor };
  match: { total: boolean | null; paid: boolean | null; remaining: boolean | null };
}

export interface ImportPlan {
  sheet: string;
  headerRow: number;
  month: string | null;
  monthEvidence: string[];
  warnings: string[];
  rows: PlanRow[];
  totals: ImportTotals;
  questions: string[];
}

/* ── Category and recurrence suggestions (by item name) ──────────── */

const RULES: Array<{ re: RegExp; category: Category; fixedMonthly?: boolean; variable?: boolean; ops?: string[] }> = [
  { re: /kira/, category: 'rent', fixedMonthly: true },
  { re: /aidat/, category: 'utilities', fixedMonthly: true },
  { re: /internet|i̇nternet/, category: 'internet', fixedMonthly: true },
  { re: /muhasebe/, category: 'accounting', fixedMonthly: true },
  { re: /elektrik|(^|\s)su$|doğalgaz|ısıtma|soğutma/, category: 'utilities', variable: true },
  { re: /domain|hosting|sunucu|veritaban/, category: 'software', ops: ['domain', 'hosting', 'vps', 'server', 'ssl'] },
  { re: /e-posta|bulut/, category: 'software', ops: ['email', 'saas'] },
  { re: /maaş|sgk|personel/, category: 'personnel' },
  { re: /vergi|resm[iî]/, category: 'tax' },
  { re: /temizlik hizmeti|freelancer|dış hizmet/, category: 'services' },
  { re: /temizlik|hijyen|mutfak|kırtasiye|yazıcı|kargo|kurye/, category: 'office' },
  { re: /yapay zek|yazılım|abonelik|proje yönetim|araçlar/, category: 'software' },
  { re: /stok|lisans|font/, category: 'subscription' },
  { re: /reklam|pazarlama|toplantı|ağırlama/, category: 'marketing' },
  { re: /ulaşım|yakıt|otopark/, category: 'travel' },
  { re: /bilgisayar|ekipman/, category: 'equipment' },
  { re: /bakım|tamirat/, category: 'maintenance' },
  { re: /sigorta/, category: 'insurance' },
  { re: /banka|komisyon|kredi/, category: 'bank' },
  { re: /telefon|gsm/, category: 'phone' },
];

export function suggest(name: string): { category: Category; fixedMonthly: boolean; variable: boolean; ops: boolean; opsKinds: string[] } {
  const n = lower(name);
  const r = RULES.find((x) => x.re.test(n));
  return { category: r?.category ?? 'other', fixedMonthly: Boolean(r?.fixedMonthly), variable: Boolean(r?.variable), ops: Boolean(r?.ops), opsKinds: r?.ops ?? [] };
}

const METHOD: Array<[RegExp, PlanRow['method']]> = [[/havale|eft/, 'bank_transfer'], [/kredi kart|banka kart|kart/, 'card'], [/nakit/, 'cash'], [/otomatik|talimat/, 'direct_debit']];

/* ── Values ─────────────────────────────────────────────────────── */

const MISSING = new Set(['', '?', '-', '—', '–']);

function amountOf(text: string, isNumber: boolean): { amount: string | null; note: string | null } {
  const t = text.trim();
  if (MISSING.has(t)) return { amount: null, note: t === '' ? 'boş' : `“${t}”` };
  const m = parseAmount(isNumber ? t : t.replace(/\s*(tl|₺|try)$/i, ''));
  if (m === null || m === undefined || m <= ZERO) return { amount: null, note: `okunamadı (“${t}”)` };
  return { amount: minorToDb(m), note: null };
}

function dueOf(text: string, isNumber: boolean, date1904: boolean): string | null {
  const t = text.trim();
  if (!t) return null;
  if (isNumber) return excelDate(t, date1904);
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/* ── Sheet → rows ───────────────────────────────────────────────── */

const HEAD: Record<string, RegExp> = { name: /gider kalemi/, amount: /tutar/, due: /son ödeme|vade/, status: /ödeme durumu|durum/, method: /ödeme yöntemi|yöntem/, note: /not/ };

export function readExpenseSheet(sheet: XSheet, date1904 = false): { headerRow: number; cols: Record<string, string>; rows: SourceRow[]; labels: Map<string, string>; preface: string[] } {
  const byRow = new Map<number, Array<{ col: string; text: string; type: string }>>();
  for (const c of Array.from(sheet.cells.values())) byRow.set(c.row, [...(byRow.get(c.row) ?? []), { col: c.col, text: c.text, type: c.type }]);
  let headerRow = 0;
  const cols: Record<string, string> = {};
  for (let r = 1; r <= Math.min(40, sheet.maxRow); r++) {
    const cells = byRow.get(r) ?? [];
    const found: Record<string, string> = {};
    for (const c of cells) for (const [k, re] of Object.entries(HEAD)) if (!found[k] && re.test(lower(c.text))) found[k] = c.col;
    if (found.name && found.amount && found.due) { headerRow = r; Object.assign(cols, found); break; }
  }
  if (!headerRow) throw new Error('Başlık satırı bulunamadı (“Gider kalemi”, “Aylık tutar”, “Son ödeme tarihi”).');
  const labels = new Map<string, string>();
  const preface: string[] = [];
  for (let r = 1; r < headerRow; r++) {
    const cells = (byRow.get(r) ?? []).sort((a, b) => a.col.localeCompare(b.col));
    cells.forEach((c, i) => {
      if (c.type === 's' && c.text.trim()) preface.push(c.text.trim());
      const next = cells[i + 1];
      if (c.type === 's' && next && next.type === 'n') labels.set(lower(c.text), next.text);
    });
  }
  const cell = (r: number, col?: string) => (col ? sheet.cells.get(`${col}${r}`) : undefined);
  const rows: SourceRow[] = [];
  for (let r = headerRow + 1; r <= sheet.maxRow; r++) {
    const name = (cell(r, cols.name)?.text ?? '').trim();
    const a = cell(r, cols.amount); const d = cell(r, cols.due);
    const rest = [a?.text, d?.text, cell(r, cols.status)?.text, cell(r, cols.method)?.text, cell(r, cols.note)?.text].some((x) => (x ?? '').trim());
    if (!name && !rest) continue;
    rows.push({
      row: r, name,
      amountText: a?.text ?? '', amountIsNumber: a?.type === 'n',
      dueText: d?.text ?? '', dueIsNumber: d?.type === 'n',
      status: (cell(r, cols.status)?.text ?? '').trim(),
      method: (cell(r, cols.method)?.text ?? '').trim(),
      note: (cell(r, cols.note)?.text ?? '').trim(),
    });
  }
  return { headerRow, cols, rows, labels, preface };
}

/* ── Plan ───────────────────────────────────────────────────────── */

export function planImport(input: {
  sheet: string; rows: SourceRow[]; headerRow: number; labels: Map<string, string>; preface: string[]; date1904?: boolean;
  hash: (s: string) => string;
}): ImportPlan {
  const warnings: string[] = [];
  const evidence: string[] = [];
  const dues = input.rows.map((r) => dueOf(r.dueText, r.dueIsNumber, Boolean(input.date1904))).filter((d): d is string => Boolean(d));
  const months = Array.from(new Set(dues.map((d) => d.slice(0, 7))));
  let month: string | null = months.length === 1 ? months[0] : null;
  if (months.length === 1) evidence.push(`Satırlardaki ${dues.length} vade tarihinin tamamı ${months[0]} ayında.`);
  if (months.length > 1) warnings.push(`Vade tarihleri birden fazla aya dağılıyor (${months.join(', ')}); dönem seçilmeli.`);
  for (const p of input.preface) {
    const l = lower(p);
    const mi = MONTHS_TR.findIndex((m) => l.includes(m));
    if (mi < 0) continue;
    const example = /örnek/.test(l);
    const year = /(20\d{2})/.exec(l)?.[1];
    const agrees = month ? Number(month.slice(5, 7)) === mi + 1 && (!year || month.startsWith(year)) : null;
    evidence.push(`${example ? 'Örnek ifade (veri sayılmadı)' : 'Başlık'}: “${p}”${agrees === null ? '' : agrees ? ' — tarihlerle uyumlu' : ' — tarihlerle UYUMSUZ'}`);
    if (!example && agrees === false) { warnings.push(`Başlıktaki ay (“${p}”) satır tarihleriyle uyuşmuyor.`); month = null; }
  }

  const rows: PlanRow[] = input.rows.map((s) => {
    const sug = suggest(s.name);
    const { amount, note: amountNote } = amountOf(s.amountText, s.amountIsNumber);
    const due = dueOf(s.dueText, s.dueIsNumber, Boolean(input.date1904));
    const st = lower(s.status);
    const status: PlanRow['status'] = !st ? 'empty' : st === 'ödendi' ? 'paid' : st === 'ödenmedi' ? 'unpaid' : 'other';
    const m = lower(s.method);
    const method = !m ? null : (METHOD.find(([re]) => re.test(m))?.[1] ?? 'other');
    const nameOnly = !s.amountText.trim() && !s.dueText.trim() && !s.status && !s.method && !s.note;
    const missing: string[] = [];
    if (!amount) missing.push(`tutar (${amountNote})`);
    if (!due) missing.push(s.dueText.trim() ? `vade (okunamadı: “${s.dueText}”)` : 'vade');
    const reasons: string[] = [];
    let action: ImportAction;
    if (!s.name) { action = 'needs_info'; reasons.push('Gider adı boş.'); }
    else if (nameOnly && /^diğer gider\s*\d*$/.test(lower(s.name))) { action = 'skip_blank'; reasons.push('Boş “Diğer gider” satırı.'); }
    else if (sug.ops) { action = 'possible_duplicate'; reasons.push('Operasyon’daki hizmet maliyetleriyle kesişebilir (olası eşleşme, doğrulanmadı); kendiliğinden oluşturulmaz veya birleştirilmez.'); }
    else if (nameOnly) { action = 'suggestion'; reasons.push('Yalnızca başlık var; aylık borç olarak açılmaz.'); }
    else if (!amount || !due) { action = 'needs_info'; reasons.push('Eksik bilgi tamamlanınca gider olarak açılabilir.'); }
    else if (status === 'paid') { action = 'pending_payment'; reasons.push('Kaynakta “Ödendi” ama ödeme tarihi yok: vade tarihi ödeme tarihi sayılmaz; dönem inceleme bekler.'); }
    else action = 'create';
    if (status === 'empty' && (action === 'create' || action === 'needs_info')) reasons.push('Ödeme durumu kaynakta boş; “Ödenmedi” varsayılmadı.');
    if (status === 'other') reasons.push(`Ödeme durumu tanınmadı (“${s.status}”); ödeme aktarılmaz.`);
    if (method === 'other') reasons.push(`Ödeme yöntemi tanınmadı (“${s.method}”); not olarak saklanır.`);
    if (/^\d{6,}$/.test(s.note)) reasons.push('Notlardaki sayı tutar/telefon olarak yorumlanmadı; tam haliyle iç not olarak saklanır.');
    const recurrence = action === 'create' || action === 'pending_payment' ? (sug.fixedMonthly || sug.variable ? 'monthly' : null) : null;
    const notes = [s.note || null, method === 'other' ? `Ödeme yöntemi (Excel): ${s.method}` : null].filter(Boolean).join('\n') || null;
    const payloadText = JSON.stringify([s.name, s.amountText, s.dueText, s.status, s.method, s.note]);
    return {
      row: s.row,
      key: `xlsx|${slug(input.sheet)}|${month ?? 'ay-belirsiz'}|r${s.row}|${slug(s.name)}`,
      hash: input.hash(payloadText),
      name: s.name, category: sug.category, action, recurrence, variable: sug.variable, opsKinds: sug.opsKinds,
      amount, amountNote, due, status, statusText: s.status, method, methodText: s.method, note: notes,
      missing, reasons, payload: s,
    };
  });

  // Totals, computed from the rows (independent of the sheet's own formulas)
  let total = ZERO, paid = ZERO, knownCount = 0, missingCount = 0;
  for (const r of rows) {
    if (r.action === 'skip_blank') continue;
    if (!r.amount) { if (r.action === 'needs_info') missingCount += 1; continue; }
    const v = parseAmount(r.amount) as Minor;
    total += v; knownCount += 1;
    if (r.status === 'paid') paid += v;
  }
  let periods = ZERO, review = ZERO;
  for (const r of rows) {
    if ((r.action === 'create' || r.action === 'pending_payment') && r.amount) {
      const v = parseAmount(r.amount) as Minor;
      periods += v;
      if (r.action === 'pending_payment') review += v;
    }
  }
  const src = (label: RegExp) => { const e = Array.from(input.labels.entries()).find(([k]) => label.test(k)); return e ? e[1] : null; };
  const source = { total: src(/^toplam/), paid: src(/^ödenen/), remaining: src(/^kalan/) };
  const eq = (a: string | null, b: Minor) => (a === null ? null : parseAmount(a) === b);
  const totals: ImportTotals = {
    source,
    computed: { total, paid, remaining: total - paid, knownCount, missingCount },
    system: { periods, paidImported: ZERO, review, remaining: periods - review },
    match: { total: eq(source.total, total), paid: eq(source.paid, paid), remaining: eq(source.remaining, total - paid) },
  };
  if (totals.match.total === false || totals.match.paid === false || totals.match.remaining === false) warnings.push('Satırlardan hesaplanan toplamlar dosyadaki toplamlarla uyuşmuyor.');

  const questions: string[] = [];
  for (const r of rows.filter((x) => x.action === 'pending_payment')) questions.push(`“${r.name}” (satır ${r.row}) kaynakta Ödendi işaretli; gerçek ödeme tarihi nedir? Tarih gelene kadar dönem “İnceleme bekliyor” olarak kalır.`);
  if (!month) questions.push('Aktarım hangi aya (dönem) ait?');
  return { sheet: input.sheet, headerRow: input.headerRow, month, monthEvidence: evidence, warnings, rows, totals, questions };
}
