'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/cockpit/Widgets';
import { Badge, small } from '@/components/admin/ops/ui';
import { fmtDate } from '@/lib/cockpit/client';
import { FIELD_LABEL, FIELD_SCOPE_LABEL, KEY_PAGES, LAB_LABEL, NO_FIELD } from '@/lib/seoPanel/pagespeed';
import type { AuditFinding, AuditRun, PsiRow } from '@/components/admin/seo/types';

const SEV: Record<AuditFinding['severity'], { kind: 'critical' | 'warning' | 'neutral' | 'good'; label: string }> = {
  error: { kind: 'critical', label: 'Hata' },
  warning: { kind: 'warning', label: 'Uyarı' },
  info: { kind: 'neutral', label: 'Bilgi' },
  ok: { kind: 'good', label: 'Tamam' },
};
const CHECK: Record<string, string> = {
  status: 'Durum kodu', redirect: 'Yönlendirme', title: 'Başlık', description: 'Meta açıklama', canonical: 'Canonical', hreflang: 'hreflang', lang: 'html lang',
  h1: 'H1', noindex: 'noindex', jsonld: 'JSON-LD', in_sitemap: 'Sitemap', robots: 'robots.txt', allowlist: 'İzin listesi', sitemap: 'Sitemap',
};
const STATUS: Record<AuditRun['status'], { kind: 'good' | 'warning' | 'critical' | 'neutral'; label: string }> = {
  done: { kind: 'good', label: 'Tamamlandı' },
  partial: { kind: 'warning', label: 'Kısmi tarama (sınıra ulaşıldı)' },
  failed: { kind: 'critical', label: 'Başarısız' },
  running: { kind: 'neutral', label: 'Çalışıyor' },
};
const path = (u: string) => { try { const x = new URL(u); return x.hostname === 'yoca.net' ? x.pathname || '/' : u; } catch { return u; } };

export function Audit({ audit, onRun, busy, hosts }: { audit: { run: AuditRun; findings: AuditFinding[] } | null; onRun: () => void; busy: boolean; hosts: string[] }) {
  const [all, setAll] = useState(false);
  const order = { error: 0, warning: 1, info: 2, ok: 3 } as const;
  const shown = (audit?.findings ?? []).filter((f) => all || f.severity === 'error' || f.severity === 'warning').sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <Card title="Teknik kontrol" action={<button type="button" className="admin-btn !py-1.5 text-[12px]" disabled={busy} onClick={onRun}>{busy ? 'Taranıyor…' : 'Taramayı başlat'}</button>}>
      <p className="mb-3 max-w-[95ch] text-[12px] leading-relaxed text-subtle">
        Yalnızca izin verilen alan adları ({hosts.join(', ')}); adresler sitenin sitemap’inden. robots.txt’e uyulur, yalnızca GET, izin listesi dışına yönlendirme izlenmez. Sınırlar: en çok 50 sayfa (üst sınır 100), toplam ~40 sn, istek başına 8 sn, aynı anda en çok 3 istek. Elle başlatılır.
      </p>
      {!audit ? <p className="text-[13px] text-subtle">Henüz tarama yapılmadı.</p> : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="seo-audit-run">
            <StatusBadge kind={STATUS[audit.run.status].kind}>{STATUS[audit.run.status].label}</StatusBadge>
            {audit.run.source === 'fixture' && <Badge tone="warn">Örnek veri</Badge>}
            <span className="text-soft">{audit.run.pages_checked}/{audit.run.pages_planned} sayfa · {fmtDate(audit.run.finished_at ?? audit.run.started_at)}</span>
            <span className="text-subtle">· {audit.run.summary.error ?? 0} hata · {audit.run.summary.warning ?? 0} uyarı · {audit.run.summary.info ?? 0} bilgi · {audit.run.summary.ok ?? 0} tamam</span>
          </div>
          {audit.run.limit_reason && <p className="text-[12px] text-amber-200">{audit.run.limit_reason}</p>}
          <label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Bilgi ve “tamam” satırlarını da göster</label>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]" data-testid="seo-findings">
              <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-subtle"><th className="px-1 py-2">Önem</th><th className="px-1 py-2">Kontrol</th><th className="px-1 py-2">Sayfa</th><th className="px-1 py-2">Bulgu</th></tr></thead>
              <tbody>
                {shown.slice(0, 300).map((f, i) => (
                  <tr key={i} className="border-b border-line/50 align-top">
                    <td className="px-1 py-1.5"><StatusBadge kind={SEV[f.severity].kind}>{SEV[f.severity].label}</StatusBadge></td>
                    <td className="whitespace-nowrap px-1 py-1.5 text-soft">{CHECK[f.check_key] ?? f.check_key}</td>
                    <td className="max-w-[16rem] break-all px-1 py-1.5 font-mono text-[12px]">{path(f.url)}</td>
                    <td className="px-1 py-1.5 text-soft">{f.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

const ms = (v: number | null) => (v === null ? '—' : v >= 1000 ? `${(v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn` : `${Math.round(v)} ms`);
const cls = (v: number | null) => (v === null ? '—' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 3 }));
const CAT: Record<string, string> = { FAST: 'İyi', AVERAGE: 'İyileştirilmeli', SLOW: 'Zayıf' };

function PsiCell({ row }: { row: PsiRow | undefined }) {
  if (!row) return <p className="text-[12px] text-subtle">Test edilmedi.</p>;
  if (row.error) return <p className="text-[12px] text-red-300">{row.error}</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-sm border border-line p-2.5" data-testid="seo-psi-lab">
        <p className="text-[11px] font-bold text-muted">{LAB_LABEL}</p>
        <p className="mt-1 text-[22px] font-extrabold tabular-nums text-white">{row.lab_perf_score === null ? '—' : Math.round(Number(row.lab_perf_score))}<span className="text-[12px] font-semibold text-subtle"> /100 performans</span></p>
        <p className="text-[12px] tabular-nums text-soft">LCP {ms(row.lab_lcp_ms)} · CLS {cls(row.lab_cls)} · TBT {ms(row.lab_tbt_ms)}</p>
      </div>
      <div className="rounded-sm border border-yoca-lime/30 p-2.5" data-testid="seo-psi-field">
        <p className="text-[11px] font-bold text-muted">{FIELD_LABEL}</p>
        {row.field_scope === 'none' ? <p className="mt-1 text-[12px] text-subtle">{NO_FIELD}</p> : (
          <>
            <p className="mt-1 text-[13px] font-bold text-white">{row.field_category ? CAT[row.field_category] ?? row.field_category : '—'} <span className="text-[11px] font-normal text-subtle">· {FIELD_SCOPE_LABEL[row.field_scope]}</span></p>
            <p className="text-[12px] tabular-nums text-soft">p75 LCP {ms(row.field_lcp_p75_ms)} · INP {ms(row.field_inp_p75_ms)} · CLS {cls(row.field_cls_p75)}</p>
          </>
        )}
      </div>
    </div>
  );
}

export function PageSpeed({ rows, onRun, running, origin }: { rows: PsiRow[]; onRun: (path: string) => void; running: string | null; origin: string }) {
  const latest = (url: string, s: 'mobile' | 'desktop') => rows.find((r) => r.url === url && r.strategy === s);
  return (
    <Card title="PageSpeed Insights">
      <p className="mb-3 max-w-[95ch] text-[12px] leading-relaxed text-subtle">
        En çok 5 ana sayfa, mobil ve masaüstü, elle başlatılır. <strong className="text-muted">Laboratuvar ölçümü</strong> o anki tek bir simüle testtir ve her çalıştırmada değişebilir; <strong className="text-muted">gerçek kullanıcı verisi</strong> Chrome kullanıcılarının son 28 günlük 75. yüzdelik değeridir. İkisi ayrı tutulur ve karıştırılmaz.
      </p>
      <div className="grid gap-4">
        {KEY_PAGES.map((p) => {
          const url = `${origin}${p}`;
          const m = latest(url, 'mobile');
          const d = latest(url, 'desktop');
          return (
            <div key={p} className="grid gap-2 border-b border-line/60 pb-4 last:border-0" data-testid="seo-psi-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[13px] text-white">{p}{(m ?? d)?.source === 'fixture' && <span className="ms-2 align-middle"><Badge tone="warn">Örnek veri</Badge></span>}</p>
                <span className="flex items-center gap-2 text-[12px] text-subtle">{(m ?? d) && fmtDate((m ?? d)!.fetched_at)}<button type="button" className={small} disabled={running !== null} onClick={() => onRun(p)}>{running === p ? 'Test ediliyor…' : 'Test et'}</button></span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div><p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">Mobil</p><PsiCell row={m} /></div>
                <div><p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">Masaüstü</p><PsiCell row={d} /></div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
