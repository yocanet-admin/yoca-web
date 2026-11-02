'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/admin/cockpit/Widgets';
import { adminPost, fmtDate } from '@/lib/cockpit/client';
import type { AiSummary, Lead } from '@/lib/cockpit/leads';

/**
 * Yoca cockpit — AI help inside a lead: "Özetle" (saved brief for the team)
 * and "Yanıt taslağı" (first reply in the lead's language, editable, opened
 * in the mail app — never sent automatically).
 */

const LEVEL: Record<AiSummary['aciliyet'], 'good' | 'warning' | 'critical'> = { düşük: 'good', orta: 'warning', yüksek: 'critical' };
const SPAM: Record<AiSummary['spam_olasiligi'], 'good' | 'warning' | 'critical'> = { düşük: 'good', orta: 'warning', yüksek: 'critical' };

export function LeadAI({ lead, onSummary, onNote }: { lead: Lead; onSummary: (summary: AiSummary, at: string) => void; onNote: (text: string) => void }) {
  const [busy, setBusy] = useState<'summary' | 'reply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<{ konu: string; metin: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const summary = lead.aiSummary;

  const run = async (mode: 'summary' | 'reply') => {
    setBusy(mode);
    setError(null);
    const result = await adminPost<{ ok: boolean; error?: string; summary?: AiSummary; at?: string; reply?: { konu: string; metin: string } }>('/api/admin/lead-ai', {
      type: lead.type,
      id: lead.id,
      mode,
    });
    setBusy(null);
    if (!result.ok) return setError(result.error ?? 'Yapay zekâ yanıt vermedi.');
    if (result.summary && result.at) onSummary(result.summary, result.at);
    if (result.reply) setReply(result.reply);
  };

  const mailto = reply
    ? `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(reply.konu)}&body=${encodeURIComponent(reply.metin)}`
    : '#';

  return (
    <div className="grid gap-3 rounded-sm border border-line bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-subtle">Yapay zekâ</span>
        <button type="button" className="admin-btn !py-1 text-[12px]" disabled={busy !== null} onClick={() => run('summary')}>
          {busy === 'summary' ? 'Özetleniyor…' : summary ? '↻ Yeniden özetle' : 'Özetle'}
        </button>
        <button type="button" className="admin-btn !py-1 text-[12px]" disabled={busy !== null} onClick={() => run('reply')}>
          {busy === 'reply' ? 'Yazılıyor…' : 'Yanıt taslağı'}
        </button>
      </div>
      {error && <p className="text-[12px] text-amber-300">{error}</p>}

      {summary && (
        <div className="grid gap-2 text-[13px] leading-relaxed text-soft">
          <p>{summary.ozet}</p>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge kind={summary.uygunluk >= 4 ? 'good' : summary.uygunluk >= 3 ? 'neutral' : 'warning'}>Uygunluk {summary.uygunluk}/5</StatusBadge>
            <StatusBadge kind={LEVEL[summary.aciliyet] ?? 'neutral'}>Aciliyet: {summary.aciliyet}</StatusBadge>
            <StatusBadge kind={SPAM[summary.spam_olasiligi] ?? 'neutral'}>Spam olasılığı: {summary.spam_olasiligi}</StatusBadge>
          </div>
          {summary.ihtiyaclar.length > 0 && (
            <p>
              <span className="font-bold text-white">İhtiyaç: </span>
              {summary.ihtiyaclar.join(' · ')}
            </p>
          )}
          <p>
            <span className="font-bold text-white">Bütçe: </span>
            {summary.butce}
          </p>
          <p>
            <span className="font-bold text-white">Neden: </span>
            {summary.uygunluk_nedeni}
          </p>
          <p>
            <span className="font-bold text-white">Sonraki adım: </span>
            {summary.sonraki_adim}
          </p>
          {summary.sorular.length > 0 && (
            <div>
              <p className="font-bold text-white">Sorulacaklar</p>
              <ul className="list-disc pl-5">
                {summary.sorular.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-subtle">
            {lead.aiSummaryAt && <span>{fmtDate(lead.aiSummaryAt)}</span>}
            <button
              type="button"
              className="underline hover:text-white"
              onClick={() => onNote([lead.note, `AI özeti: ${summary.ozet} Sonraki adım: ${summary.sonraki_adim}`].filter(Boolean).join('\n'))}
            >
              Nota ekle
            </button>
          </div>
        </div>
      )}

      {reply && (
        <div className="grid gap-2">
          <input value={reply.konu} onChange={(e) => setReply({ ...reply, konu: e.target.value })} aria-label="Konu" className="admin-input text-[13px] font-bold" />
          <textarea value={reply.metin} onChange={(e) => setReply({ ...reply, metin: e.target.value })} rows={9} aria-label="E-posta metni" className="admin-input text-[13px] leading-relaxed" />
          <div className="flex flex-wrap gap-2">
            <a href={mailto} className="admin-btn-primary">
              E-postada aç
            </a>
            <button
              type="button"
              className="admin-btn"
              onClick={async () => {
                await navigator.clipboard.writeText(`${reply.konu}\n\n${reply.metin}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
            <button type="button" className="text-[12px] text-subtle hover:text-white" onClick={() => setReply(null)}>
              Kapat
            </button>
          </div>
          <p className="text-[11px] text-subtle">Taslağı kontrol edip düzenleyin; hiçbir şey otomatik gönderilmez.</p>
        </div>
      )}
    </div>
  );
}
