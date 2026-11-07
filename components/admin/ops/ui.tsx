'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { documentUrl, listDocuments, uploadDocument, type DocumentRow } from '@/lib/ops/data';

/**
 * Yoca Operasyon — small shared pieces in the existing admin style
 * (admin-card / admin-input / admin-btn). States always carry text next to
 * any colour. Forms start short; details open on demand (<Details>).
 */

export const field = 'admin-input';
export const label = 'grid gap-1.5 text-[13px] font-semibold text-muted';
export const small = 'admin-btn !px-2.5 !py-1 !text-[12px]';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';
const TONE: Record<Tone, string> = {
  ok: 'border-yoca-green/60 text-yoca-green',
  warn: 'border-yellow-400/60 text-yellow-200',
  bad: 'border-red-500/60 text-red-300',
  info: 'border-sky-400/50 text-sky-200',
  muted: 'border-line text-muted',
};

/** A state as text with a coloured border (never colour alone). */
export function Badge({ tone = 'muted', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold ${TONE[tone]}`}>{children}</span>;
}

export function PageHead({ title, sub, actions, kicker = 'Operasyon' }: { title: string; sub?: string; actions?: ReactNode; kicker?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-subtle">{kicker}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-[80ch] text-[13px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Optional section that opens on demand (keeps forms short). */
export function Details({ title, children, open = false, hint }: { title: string; children: ReactNode; open?: boolean; hint?: string }) {
  return (
    <details open={open} className="group border border-line">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[13px] font-bold text-soft">
        <span>{title}{hint && <span className="ms-2 font-normal text-subtle">{hint}</span>}</span>
        <span aria-hidden="true" className="text-subtle group-open:rotate-90">›</span>
      </summary>
      <div className="grid gap-3 border-t border-line p-3">{children}</div>
    </details>
  );
}

export function Flash({ message, tone = 'ok', onClose }: { message: string | null; tone?: 'ok' | 'bad' | 'warn'; onClose?: () => void }) {
  if (!message) return null;
  const cls = tone === 'bad' ? 'border-red-500/40 bg-red-500/10 text-red-200' : tone === 'warn' ? 'border-yellow-400/40 bg-yellow-400/10 text-yellow-100' : 'border-yoca-green/40 bg-yoca-green/10 text-yoca-green';
  return (
    <p role={tone === 'bad' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-sm border px-4 py-2 text-[13px] ${cls}`}>
      <span>{message}</span>
      {onClose && <button type="button" className="text-[12px] underline" onClick={onClose}>Kapat</button>}
    </p>
  );
}

/** Empty state: what is missing and the action that creates it. No fake numbers. */
export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-3 border border-dashed border-line p-4 text-[13px] text-muted">
      <p>{text}</p>
      {action}
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
  return <Link href={href} className="font-semibold text-white underline decoration-line underline-offset-2 hover:text-yoca-lime">{children}</Link>;
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
