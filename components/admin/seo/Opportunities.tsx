'use client';

import { useState } from 'react';
import { Card } from '@/components/admin/cockpit/Widgets';
import { Badge, small } from '@/components/admin/ops/ui';
import { adminPost, fmtDate, fmtNumber } from '@/lib/cockpit/client';
import { ctrText, OPPORTUNITY_LABEL, OPPORTUNITY_RULES as R, positionText, type Opportunity, type OpportunityKind } from '@/lib/seoPanel/model';
import type { StoredSuggestion } from '@/components/admin/seo/types';

type Suggestion = StoredSuggestion['suggestion'];
const RULE: Record<OpportunityKind, string> = {
  striking: `Ortalama pozisyon ${R.strikingMin}–${R.strikingMax} ve en az ${R.strikingImpr} gösterim.`,
  low_ctr: `En az ${R.lowCtrImpr} gösterim, TO %${R.lowCtrMax * 100}’nin altında.`,
  untargeted_page: `En az ${R.pageImpr} gösterim alan ama aktif hedef kelimesi olmayan sayfa.`,
  target_no_data: 'Aktif hedef kelime, seçilen dönemde tam eşleşen sorguda gösterim yok.',
};
const KINDS: OpportunityKind[] = ['striking', 'low_ctr', 'untargeted_page', 'target_no_data'];
const key = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

function SuggestionView({ s, mock }: { s: Suggestion; mock: boolean }) {
  return (
    <div className="mt-2 grid gap-2 rounded-sm border border-yoca-lime/30 bg-yoca-lime/[0.04] p-3 text-[13px]" data-testid="seo-suggestion">
      <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">AI önerisi {mock && <Badge tone="warn">Mock</Badge>} <span className="font-normal normal-case tracking-normal text-subtle">Yalnızca öneri: hiçbir sayfaya, Insights’a veya site metnine yazılmadı, yayımlanmadı.</span></p>
      <p><span className="text-subtle">Başlık:</span> <span className="text-white">{s.title}</span></p>
      <p><span className="text-subtle">Meta açıklama:</span> <span className="text-soft">{s.metaDescription}</span></p>
      {s.outline.length > 0 && (
        <ol className="list-decimal ps-5 text-soft">
          {s.outline.map((o, i) => <li key={i}><span className="text-white">{o.heading}</span>{o.points.length > 0 && <span className="text-subtle"> — {o.points.join(' · ')}</span>}</li>)}
        </ol>
      )}
      {s.notes.length > 0 && <p className="text-[12px] text-subtle">Notlar: {s.notes.join(' · ')}</p>}
    </div>
  );
}

export function Opportunities({ items, previous }: { items: Opportunity[]; previous: StoredSuggestion[] }) {
  const [state, setState] = useState<Record<string, { busy?: boolean; error?: string; s?: Suggestion; mock?: boolean }>>({});
  const ask = async (o: Opportunity) => {
    const id = `${o.kind}:${o.subject}`;
    setState((x) => ({ ...x, [id]: { busy: true } }));
    const r = await adminPost<{ ok: boolean; error?: string; suggestion?: Suggestion; mock?: boolean }>('/api/admin/seo/suggest', { kind: o.kind, subject: o.subject, page: o.page, metrics: o.metrics, requestKey: key() });
    setState((x) => ({ ...x, [id]: r.ok && r.suggestion ? { s: r.suggestion, mock: r.mock } : { error: r.error ?? 'Öneri alınamadı.' } }));
  };
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <p className="max-w-[95ch] text-[12px] leading-relaxed text-subtle">Kurallara dayalı liste (seçilen dönem ve filtreler). “AI önerisi iste” yalnızca tıkladığınızda çalışır; mevcut yapay zekâ ayarları, aylık bütçe sınırı ve kullanım kaydı geçerlidir. Öneri bu panelde gösterilir; hiçbir şey otomatik yayımlanmaz.</p>
      {KINDS.map((kind) => {
        const list = items.filter((o) => o.kind === kind);
        return (
          <Card key={kind} title={`${OPPORTUNITY_LABEL[kind]} (${list.length})`}>
            <p className="mb-3 text-[12px] text-subtle">{RULE[kind]}</p>
            {list.length === 0 ? <p className="text-[13px] text-subtle">Bu kurala uyan satır yok.</p> : (
              <ul className="grid gap-2">
                {list.slice(0, 15).map((o) => {
                  const id = `${o.kind}:${o.subject}`;
                  const st = state[id] ?? {};
                  return (
                    <li key={id} className="border-b border-line/50 pb-2" data-testid="seo-opportunity">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-white">{o.title}{o.page && o.page !== o.title && <span className="ms-2 font-mono text-[12px] font-normal text-subtle">{o.page}</span>}</p>
                          <p className="text-[12px] text-soft">{o.detail}</p>
                          {o.metrics && <p className="text-[11px] tabular-nums text-subtle">{fmtNumber(o.metrics.clicks)} tık · {fmtNumber(o.metrics.impressions)} gösterim · TO {ctrText(o.metrics.ctr, o.metrics.impressions)} · ort. pozisyon {positionText(o.metrics.position)}</p>}
                        </div>
                        <button type="button" className={small} disabled={st.busy} onClick={() => ask(o)}>{st.busy ? 'Hazırlanıyor…' : 'AI önerisi iste'}</button>
                      </div>
                      {st.error && <p className="mt-1 text-[12px] text-red-300">{st.error}</p>}
                      {st.s && <SuggestionView s={st.s} mock={Boolean(st.mock)} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
      {previous.length > 0 && (
        <Card title="Önceki AI önerileri">
          <ul className="grid gap-3">
            {previous.slice(0, 10).map((p) => (
              <li key={p.id}>
                <p className="text-[12px] text-subtle">{OPPORTUNITY_LABEL[p.kind as OpportunityKind] ?? p.kind} · <span className="text-white">{p.subject}</span> · {fmtDate(p.created_at)} · {p.created_by}</p>
                <SuggestionView s={p.suggestion} mock={p.mock} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
