'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import { Badge, fmtDate } from '@/components/admin/ops/ui';
import { moneyOf } from '@/lib/documents/client';
import { KIND_LABEL, QUOTE_STATE_LABEL, STATUS_LABEL, type DocKind, type DocStatus, type QuoteState } from '@/lib/documents/model';

/** Teklifler ve Belgeler of one client (Operasyon → müşteri detayı → Belgeler). */
interface Row { id: string; kind: DocKind; number: string; title: string; status: DocStatus; currency: string; total: string | null; final_total: string | null; final_version: number; quote_state: QuoteState | null; created_at: string }

export default function ClientDocuments({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const db = getAdminClient();
    if (!db) return;
    void db.from('doc_documents').select('id, kind, number, title, status, currency, total, final_total, final_version, quote_state, created_at').eq('client_id', clientId).order('created_at', { ascending: false })
      .then(({ data, error: e }) => { if (e) setError(/doc_documents|does not exist|schema cache/i.test(e.message) ? 'Belge modülü kurulu değil (v19).' : e.message); setRows((data ?? []) as Row[]); });
  }, [clientId]);
  return (
    <section className="admin-card grid gap-2 !p-4" aria-label="Teklifler ve belgeler">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Teklifler ve belgeler</h2>
        <div className="flex gap-2">
          <Link href={`/admin/documents?client=${clientId}`} className="admin-btn admin-btn-sm">Tümü</Link>
          <Link href={`/admin/documents?new=1&client=${clientId}`} className="admin-btn admin-btn-sm">+ Yeni belge</Link>
        </div>
      </div>
      {error ? <p className="text-[13px] text-subtle">{error}</p> : rows === null ? <p className="text-[13px] text-subtle">Yükleniyor…</p> : rows.length === 0 ? <p className="text-[13px] text-subtle">Bu müşteriye bağlı belge yok.</p> : (
        <ul className="grid gap-1 text-[13px]">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
              <span className="min-w-0"><Link href={`/admin/documents/${d.id}`} className="font-mono font-semibold text-white underline decoration-line underline-offset-2 hover:text-yoca-lime">{d.number}</Link> {d.title} <span className="text-subtle">· {KIND_LABEL[d.kind].short} · {fmtDate(d.created_at)}</span></span>
              <span className="flex items-center gap-1.5">
                {moneyOf(d.status === 'draft' ? d.total : d.final_total ?? d.total, d.currency) ?? ''}
                <Badge tone={d.status === 'final' ? 'ok' : d.status === 'draft' ? 'warn' : 'muted'}>{STATUS_LABEL[d.status]}</Badge>
                {d.quote_state ? <Badge tone="info">{QUOTE_STATE_LABEL[d.quote_state]}</Badge> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
