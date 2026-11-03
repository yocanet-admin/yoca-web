/**
 * Yoca — before/after diff for AI edits (pure, client-safe; unit-tested).
 * Paragraph-level alignment (LCS) groups changes into hunks the editor can
 * accept one by one; inside a hunk a word-level diff is shown for reading.
 */

export interface DiffSegment {
  type: 'equal' | 'add' | 'remove';
  text: string;
}

export interface Hunk {
  id: number;
  before: string[];
  after: string[];
  words: DiffSegment[];
}

type Op = { type: 'equal'; a: string; b: string } | { type: 'remove'; a: string } | { type: 'add'; b: string };

export function splitParagraphs(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((p) => p.replace(/\s+$/, '')).filter((p) => p.trim().length > 0);
}

function lcsOps<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Array<{ type: 'equal' | 'remove' | 'add'; i?: number; j?: number }> {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: Array<{ type: 'equal' | 'remove' | 'add'; i?: number; j?: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      ops.push({ type: 'equal', i, j });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', i });
      i += 1;
    } else {
      ops.push({ type: 'add', j });
      j += 1;
    }
  }
  while (i < n) ops.push({ type: 'remove', i: i++ });
  while (j < m) ops.push({ type: 'add', j: j++ });
  return ops;
}

/** Word-level diff for display (falls back to remove+add for very long hunks). */
export function wordDiff(before: string, after: string): DiffSegment[] {
  const a = before.split(/(\s+)/).filter((t) => t !== '');
  const b = after.split(/(\s+)/).filter((t) => t !== '');
  if (a.length * b.length > 4_000_000) return [{ type: 'remove', text: before }, { type: 'add', text: after }].filter((s) => s.text) as DiffSegment[];
  const out: DiffSegment[] = [];
  for (const op of lcsOps(a, b, (x, y) => x === y)) {
    const text = op.type === 'add' ? b[op.j!] : a[op.i!];
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += text;
    else out.push({ type: op.type, text });
  }
  return out;
}

function paragraphOps(before: string, after: string): Op[] {
  const a = splitParagraphs(before);
  const b = splitParagraphs(after);
  return lcsOps(a, b, (x, y) => x.trim() === y.trim()).map((op) =>
    op.type === 'equal' ? { type: 'equal', a: a[op.i!], b: b[op.j!] } : op.type === 'remove' ? { type: 'remove', a: a[op.i!] } : { type: 'add', b: b[op.j!] },
  );
}

/** Changed regions between two texts; empty when identical (ignoring trailing spaces). */
export function computeHunks(before: string, after: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  for (const op of paragraphOps(before, after)) {
    if (op.type === 'equal') {
      current = null;
      continue;
    }
    if (!current) {
      current = { id: hunks.length, before: [], after: [], words: [] };
      hunks.push(current);
    }
    if (op.type === 'remove') current.before.push(op.a);
    else current.after.push(op.b);
  }
  for (const h of hunks) h.words = wordDiff(h.before.join('\n\n'), h.after.join('\n\n'));
  return hunks;
}

/** Build the text with only the accepted hunks applied (others keep the "before" paragraphs). */
export function applyHunks(before: string, after: string, accepted: Set<number> | 'all' | 'none'): string {
  const out: string[] = [];
  let hunkId = -1;
  let inHunk = false;
  let pendingBefore: string[] = [];
  let pendingAfter: string[] = [];
  const flush = () => {
    if (!inHunk) return;
    const take = accepted === 'all' || (accepted !== 'none' && accepted.has(hunkId));
    out.push(...(take ? pendingAfter : pendingBefore));
    pendingBefore = [];
    pendingAfter = [];
    inHunk = false;
  };
  for (const op of paragraphOps(before, after)) {
    if (op.type === 'equal') {
      flush();
      out.push(op.a);
      continue;
    }
    if (!inHunk) {
      inHunk = true;
      hunkId += 1;
    }
    if (op.type === 'remove') pendingBefore.push(op.a);
    else pendingAfter.push(op.b);
  }
  flush();
  return out.join('\n\n');
}
