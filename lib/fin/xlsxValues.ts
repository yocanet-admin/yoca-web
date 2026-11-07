/** Pure cell-value helpers (safe for the browser bundle). */

/** "1.234567891E9" → "1234567891"; "46346.0" → "46346"; "1.5E-3" → "0.0015" (exact, no float). */
export function exactNumber(v: string): string {
  const m = /^(-?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(v.trim());
  if (!m) return v.trim();
  const [, sign, intPart, fracPart = '', expStr] = m;
  const digits = `${intPart}${fracPart}` || '0';
  const point = intPart.length + Number(expStr ?? 0);
  let whole: string; let frac: string;
  if (point <= 0) { whole = '0'; frac = '0'.repeat(-point) + digits; }
  else if (point >= digits.length) { whole = digits + '0'.repeat(point - digits.length); frac = ''; }
  else { whole = digits.slice(0, point); frac = digits.slice(point); }
  whole = whole.replace(/^0+(?=\d)/, '');
  frac = frac.replace(/0+$/, '');
  const out = frac ? `${whole}.${frac}` : whole;
  return out === '0' ? '0' : `${sign}${out}`;
}

/** Excel serial day → YYYY-MM-DD (1900 or 1904 system). */
export function excelDate(serial: string, date1904 = false): string | null {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0 || n > 2958465) return null;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(base + Math.floor(n) * 86_400_000).toISOString().slice(0, 10);
}

