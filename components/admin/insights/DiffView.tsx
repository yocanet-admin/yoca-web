'use client';

import { useMemo, useState } from 'react';
import { applyHunks, computeHunks } from '@/lib/ai/diff';

/**
 * Yoca Admin — before/after view for an AI edit. Every changed paragraph
 * group is a separate change the editor can keep or drop; nothing is applied
 * until "Seçilenleri uygula" / "Tümünü uygula".
 */

interface Props {
  before: string;
  after: string;
  changes?: string[];
  onApply: (text: string) => void;
  onCancel: () => void;
}

export default function DiffView({ before, after, changes, onApply, onCancel }: Props) {
  const hunks = useMemo(() => computeHunks(before, after), [before, after]);
  const [accepted, setAccepted] = useState<Set<number>>(() => new Set(hunks.map((h) => h.id)));
  const toggle = (id: number) =>
    setAccepted((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (hunks.length === 0) {
    return (
      <div className="grid gap-2 border border-line p-3 text-[13px]">
        <p className="text-muted">Önerilen metin mevcut metinle aynı; uygulanacak değişiklik yok.</p>
        <button type="button" className="admin-btn w-fit" onClick={onCancel}>Kapat</button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 border border-line p-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-white">{hunks.length} değişiklik · {accepted.size} seçili</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="admin-btn !px-2 !py-1 !text-[12px]" onClick={() => setAccepted(new Set(hunks.map((h) => h.id)))}>Tümünü seç</button>
          <button type="button" className="admin-btn !px-2 !py-1 !text-[12px]" onClick={() => setAccepted(new Set())}>Hiçbiri</button>
        </div>
      </div>
      {changes && changes.length > 0 && (
        <details className="text-[12px] text-muted">
          <summary className="cursor-pointer font-bold text-white">Modelin özeti ({changes.length})</summary>
          <ul className="mt-1 list-disc ps-5">{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </details>
      )}
      <ol className="grid max-h-[460px] gap-2 overflow-auto">
        {hunks.map((h) => (
          <li key={h.id} className={`border p-2 ${accepted.has(h.id) ? 'border-yoca-green/50' : 'border-line opacity-70'}`}>
            <label className="mb-1 flex items-center gap-2 text-[12px] font-bold text-muted">
              <input type="checkbox" checked={accepted.has(h.id)} onChange={() => toggle(h.id)} /> Değişiklik {h.id + 1}
            </label>
            <p className="whitespace-pre-wrap leading-relaxed">
              {h.words.map((seg, i) =>
                seg.type === 'equal' ? <span key={i}>{seg.text}</span> : seg.type === 'remove' ? <del key={i} className="bg-red-500/20 text-red-300">{seg.text}</del> : <ins key={i} className="bg-yoca-green/20 text-yoca-green no-underline">{seg.text}</ins>,
              )}
            </p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="admin-btn-primary" disabled={accepted.size === 0} onClick={() => onApply(applyHunks(before, after, accepted))}>Seçilenleri uygula</button>
        <button type="button" className="admin-btn" onClick={() => onApply(applyHunks(before, after, 'all'))}>Tümünü uygula</button>
        <button type="button" className="admin-btn" onClick={onCancel}>Vazgeç</button>
      </div>
      <p className="text-[11px] text-subtle">Uygulamadan önce mevcut metin sürüm geçmişine kaydedilir. Uygulanan değişiklik “Kaydet”e basana kadar yalnızca editördedir.</p>
    </div>
  );
}
