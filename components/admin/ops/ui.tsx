'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { documentUrl, listDocuments, uploadDocument, type DocumentRow } from '@/lib/ops/data';

/**
 * Yoca panel — small shared pieces of the panel design (the approved Kokpit /
 * Giderler look: admin-* classes in app/globals.css, tokens from the panel
 * shell). Used by Operasyon, Finans, Site içeriği and Sistem screens alike.
 * States always carry text next to any colour. Forms start short; details
 * open on demand (<Details>).
 */

export const field = 'admin-input';
export const label = 'admin-label';
export const small = 'admin-btn admin-btn-sm';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'lime';
const TONE: Record<Tone, string> = {
  ok: 'admin-tag admin-tag-good',
  warn: 'admin-tag admin-tag-warn',
  bad: 'admin-tag admin-tag-bad',
  info: 'admin-tag admin-tag-info',
  muted: 'admin-tag',
  lime: 'admin-tag admin-tag-lime',
};
/** Tag classes for a tone (for spans that are not <Badge>). */
export const tagClass = (tone: Tone) => TONE[tone];

/** A state as text with a coloured border (never colour alone). */
export function Badge({ tone = 'muted', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={TONE[tone]}>{children}</span>;
}

/** Page head of every panel screen: kicker · title · lede · actions (Kokpit / Giderler layout). */
export function PageHead({ title, sub, actions, kicker = 'Operasyon', titleNode }: { title: string; sub?: ReactNode; actions?: ReactNode; kicker?: ReactNode; titleNode?: ReactNode }) {
  return (
    <header className="admin-head">
      <div className="admin-head-text">
        {kicker && <p className="admin-kicker">{kicker}</p>}
        <h1 className="admin-h1">{titleNode ?? title}</h1>
        {sub && <p className="admin-lede">{sub}</p>}
      </div>
      {actions && <div className="admin-head-actions">{actions}</div>}
    </header>
  );
}

/** Section title row inside a screen (title, optional note, optional actions). */
export function SectionHead({ title, note, actions, id }: { title: ReactNode; note?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 id={id} className="admin-h2">{title}</h2>
        {note && <p className="admin-hint mt-1">{note}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Optional section that opens on demand (keeps forms short). */
export function Details({ title, children, open = false, hint }: { title: string; children: ReactNode; open?: boolean; hint?: string }) {
  return (
    <details open={open} className="group admin-details">
      <summary>
        <span>{title}{hint && <span className="ms-2 font-medium text-subtle">{hint}</span>}</span>
        <span aria-hidden="true" className="text-subtle transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
      </summary>
      <div className="admin-details-body">{children}</div>
    </details>
  );
}

export function Flash({ message, tone = 'ok', onClose }: { message: string | null; tone?: 'ok' | 'bad' | 'warn'; onClose?: () => void }) {
  if (!message) return null;
  const cls = tone === 'bad' ? 'admin-notice-bad' : tone === 'warn' ? 'admin-notice-warn' : 'admin-notice-good';
  return (
    <p role={tone === 'bad' ? 'alert' : 'status'} className={`admin-notice ${cls}`}>
      <span className="min-w-0">{message}</span>
      {onClose && <button type="button" className="text-[12px] font-bold underline" onClick={onClose}>Kapat</button>}
    </p>
  );
}

/** Empty state: what is missing and the action that creates it. No fake numbers. */
export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="admin-empty">
      <p>{text}</p>
      {action}
    </div>
  );
}

/**
 * Mobile card labels: copies each column title (thead) onto the cells of that
 * column as data-label, so `.admin-table-cards` can show "Column: value" rows
 * under 768px. Runs after every render (rows change with filters); cheap.
 */
export function useCellLabels(ref: RefObject<HTMLTableElement>) {
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim() ?? '');
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const explicit = tr.querySelector(':scope > td[data-primary]');
      Array.from(tr.children).forEach((cell, i) => {
        if (cell.tagName !== 'TD' || cell.hasAttribute('data-actions')) return;
        if (i === 0 && !explicit && !cell.hasAttribute('data-label')) { cell.setAttribute('data-primary', ''); return; }
        if (heads[i] && cell.getAttribute('data-label') !== heads[i] && !cell.hasAttribute('data-primary')) cell.setAttribute('data-label', heads[i]);
      });
    });
  });
}

/**
 * Panel table: rounded frame on desktop, one card per row on phones (first
 * column, or the cell marked data-primary, is the card title). Wide tables
 * (min ≥ 720px) already switch to cards under 1280px (tablets, narrow windows).
 */
export function AdminTable({ head, children, min = 820, cards = true, className = '', label }: { head: ReactNode[]; children: ReactNode; min?: number; cards?: boolean; className?: string; label?: string }) {
  const ref = useRef<HTMLTableElement>(null);
  useCellLabels(ref);
  const cardClass = !cards ? '' : min >= 720 ? 'admin-table-cards-lg' : 'admin-table-cards';
  return (
    <div className={`admin-table-wrap ${cardClass} ${className}`}>
      <table ref={ref} className="admin-table" style={{ minWidth: min }} aria-label={label}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Inner tables (detail screens, import previews) keep their columns and scroll
 * sideways inside their own area; the page never does. When the content is
 * wider than the area: a visible hint, a visible scrollbar, and the area is a
 * focusable, labelled region so it can also be scrolled with the keyboard.
 */
export function ScrollArea({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOver(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="grid min-w-0 gap-1">
      <div ref={ref} role="region" aria-label={over ? `${label} (yana kaydırılabilir)` : label} tabIndex={over ? 0 : undefined} className={`admin-scroll ${className}`}>
        {children}
      </div>
      {over && <p className="admin-hint" aria-hidden="true">↔ Tablo yana kaydırılabilir</p>}
    </div>
  );
}

export function Unknown({ children = 'Bilinmiyor' }: { children?: ReactNode }) {
  return <span className="italic text-subtle">{children}</span>;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const date = d.length === 10 ? new Date(`${d}T12:00:00Z`) : new Date(d);
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
}

/** Date or an explicit "Bilinmiyor" (never empty, never "süresiz"). */
export function DateOr({ value, unknown = 'Bilinmiyor' }: { value: string | null | undefined; unknown?: string }) {
  return value ? <span className="tabular-nums">{fmtDate(value)}</span> : <Unknown>{unknown}</Unknown>;
}

export function EntityLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="admin-link">{children}</Link>;
}

/** Comma / newline separated text ↔ list. */
export const toList = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** Documents of one record: private bucket, short-lived links, type/size limits. */
export function Documents({ entity, entityId }: { entity: string; entityId: string }) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => listDocuments(entity, entityId).then(setDocs).catch(() => setDocs([]));
  useEffect(() => { void load(); }, [entity, entityId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid gap-2 text-[13px]">
      {docs === null ? <p className="text-subtle">Belgeler yükleniyor…</p> : docs.filter((d) => !d.archived_at).length === 0 ? <p className="text-subtle">Belge yok.</p> : (
        <ul className="grid gap-1">
          {docs.filter((d) => !d.archived_at).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
              <span className="min-w-0 truncate">{d.name} <span className="text-subtle">· {Math.ceil((d.size_bytes ?? 0) / 1024)} KB · {fmtDate(d.created_at)}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}</span></span>
              <button type="button" className={small} onClick={async () => { const u = await documentUrl(d.path); if (u) window.open(u, '_blank', 'noopener'); else setError('Bağlantı oluşturulamadı.'); }}>Aç</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[12px] text-red-300">{error}</p>}
      <label className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span>Belge ekle (PDF, görsel, metin, CSV, Word, Excel, ZIP · en çok 20 MB):</span>
        <input type="file" disabled={busy} className="text-[12px]" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true); setError(null);
          const r = await uploadDocument(entity, entityId, f);
          setBusy(false);
          e.target.value = '';
          if (r.error) setError(r.error); else void load();
        }} />
        {busy && <span>Yükleniyor…</span>}
      </label>
    </div>
  );
}
