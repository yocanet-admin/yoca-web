/**
 * Minimal, read-only .xlsx / .xlsm reader (server only, no dependency).
 *
 * Reads cell VALUES from the zip: workbook → sheet, shared strings, inline
 * strings, numbers, booleans and cached formula results. It never evaluates
 * formulas and never runs macros (VBA parts are ignored entirely). Numbers are
 * kept as the exact decimal TEXT stored in the file ("1.234567891E9" →
 * "1234567891"), so long reference numbers are never rounded or shown in
 * scientific notation.
 */

import { inflateRawSync } from 'node:zlib';

export interface XCell { ref: string; col: string; row: number; type: 'n' | 's' | 'b' | 'e' | 'empty'; text: string; style: number | null }
export interface XSheet { name: string; cells: Map<string, XCell>; maxRow: number }
export interface XWorkbook { sheets: string[]; date1904: boolean; hasMacros: boolean; sheet(name: string): XSheet | null }

const MAX_BYTES = 5 * 1024 * 1024;

function readZip(buf: Buffer): Map<string, Buffer> {
  if (buf.length > MAX_BYTES) throw new Error('Dosya çok büyük (en çok 5 MB).');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Geçerli bir Excel (.xlsx / .xlsm) dosyası değil.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bozuk zip dizini.');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^(xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml|_rels\/workbook\.xml\.rels|vbaProject\.bin))$/.test(name)) continue;
    const lnameLen = buf.readUInt16LE(local + 26);
    const lextraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lnameLen + lextraLen;
    const data = buf.subarray(start, start + csize);
    if (name.endsWith('.bin')) { out.set(name, Buffer.alloc(0)); continue; } // presence only; never read
    const raw = method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: 20 * 1024 * 1024 }) : null;
    if (!raw) throw new Error('Desteklenmeyen sıkıştırma.');
    out.set(name, raw);
  }
  return out;
}

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const textOf = (xml: string) => Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)).map((m) => unescape(m[1] ?? '')).join('');

export { exactNumber, excelDate } from '@/lib/fin/xlsxValues';
import { exactNumber } from '@/lib/fin/xlsxValues';

export function readWorkbook(buf: Buffer): XWorkbook {
  const files = readZip(buf);
  const wb = files.get('xl/workbook.xml')?.toString('utf8');
  if (!wb) throw new Error('Çalışma kitabı bulunamadı.');
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const relTarget = new Map(Array.from(rels.matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)).map((m) => [m[1], m[2]] as const));
  Array.from(rels.matchAll(/<Relationship\b[^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)).forEach((m) => relTarget.set(m[2], m[1]));
  const sheets = Array.from(wb.matchAll(/<sheet\b([^>]*)\/?>/g)).map((m) => ({
    name: unescape(/name="([^"]*)"/.exec(m[1])?.[1] ?? ''),
    rid: /r:id="([^"]*)"/.exec(m[1])?.[1] ?? '',
  }));
  const date1904 = /date1904="(1|true)"/.test(wb);
  const shared = Array.from((files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)).map((m) => textOf(m[1]));
  return {
    sheets: sheets.map((s) => s.name),
    date1904,
    hasMacros: files.has('xl/vbaProject.bin'),
    sheet(name: string) {
      const s = sheets.find((x) => x.name === name);
      if (!s) return null;
      let target = relTarget.get(s.rid) ?? '';
      target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      const xml = files.get(`xl/${target}`)?.toString('utf8');
      if (!xml) return null;
      const cells = new Map<string, XCell>();
      let maxRow = 0;
      for (const m of Array.from(xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g))) {
        const attrs = m[1];
        const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
        if (!ref) continue;
        const t = /t="([^"]*)"/.exec(attrs)?.[1] ?? 'n';
        const style = /s="(\d+)"/.exec(attrs)?.[1];
        const body = m[2] ?? '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let type: XCell['type'] = 'empty';
        let text = '';
        if (t === 's' && v !== undefined) { type = 's'; text = shared[Number(v)] ?? ''; }
        else if (t === 'inlineStr') { type = 's'; text = textOf(body); }
        else if (t === 'str' && v !== undefined) { type = 's'; text = unescape(v); }
        else if (t === 'b' && v !== undefined) { type = 'b'; text = v === '1' ? 'TRUE' : 'FALSE'; }
        else if (t === 'e') { type = 'e'; text = v ?? '#ERR'; }
        else if (v !== undefined) { type = 'n'; text = exactNumber(unescape(v)); }
        const row = Number(ref[2]);
        maxRow = Math.max(maxRow, row);
        cells.set(`${ref[1]}${ref[2]}`, { ref: `${ref[1]}${ref[2]}`, col: ref[1], row, type, text, style: style ? Number(style) : null });
      }
      return { name, cells, maxRow };
    },
  };
}
