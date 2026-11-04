'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/insightsAdmin';

/**
 * Yoca Admin — Bülten.
 * Subscribers (double opt-in: Onay bekliyor → Aktif → Ayrıldı) and the
 * article sends. Sending happens from a published article (Yayın tab).
 * Addresses are shown in full only here, to admins; export is CSV.
 */

type Sub = { id: string; email: string; locale: string; status: 'pending' | 'active' | 'unsubscribed'; source: string | null; created_at: string; confirmed_at: string | null; unsubscribed_at: string | null };
type Send = { id: string; insight_id: string | null; title: string | null; status: string; test_sent_at: string | null; started_at: string | null; finished_at: string | null; recipients: number; sent: number; failed: number; created_by: string | null };
type Data = { mailer: boolean; counts: { active: Record<string, number>; pending: number; unsubscribed: number }; subscribers: Sub[]; sends: Send[] };

const STATUS: Record<Sub['status'], { label: string; cls: string }> = {
  pending: { label: 'Onay bekliyor', cls: 'border-yellow-400/50 text-yellow-300' },
  active: { label: 'Aktif', cls: 'border-yoca-green/50 text-yoca-green' },
  unsubscribed: { label: 'Ayrıldı', cls: 'border-line text-subtle' },
};
const SEND_STATUS: Record<string, string> = { draft: 'Deneme gönderildi', sending: 'Gönderiliyor / yarım', partial: 'Kısmen gönderildi', sent: 'Gönderildi' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR') : '—');

export default function AdminNewsletter() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Sub['status']>('active');
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const r = await adminFetch<Data>('/api/admin/newsletter');
      if (!r.ok) setError(r.error ?? 'Okunamadı.');
      else setData(r);
    })();
  }, []);

  const rows = useMemo(() => (data?.subscribers ?? []).filter((s) => (filter === 'all' || s.status === filter) && (!q || s.email.includes(q.toLowerCase()))), [data, filter, q]);

  const exportCsv = () => {
    const lines = [['email', 'dil', 'durum', 'kaynak', 'kayit', 'onay', 'ayrilma'].join(','), ...rows.map((s) => [s.email, s.locale, s.status, s.source ?? '', s.created_at, s.confirmed_at ?? '', s.unsubscribed_at ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yoca-bulten-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error) return <p className="text-[14px] text-yellow-300">{error}</p>;
  if (!data) return <p className="text-[14px] text-muted">Yükleniyor…</p>;
  const active = Object.values(data.counts.active).reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Bülten</h1>
        <p className="mt-1 max-w-[80ch] text-[13px] text-muted">
          Ziyaretçi Insights sayfasından veya site altbilgisinden kaydolur, e-postadaki bağlantıyla onaylar (çift onay). Yalnızca <strong className="text-white">Aktif</strong> adreslere gönderilir. Göndermek için yayınlanmış bir yazının <em>Yayın</em> sekmesinde önce “Bana deneme gönder”, sonra “Bültene gönder”. Her e-postada tek tıkla ayrılma bağlantısı vardır.
        </p>
        {!data.mailer && <p className="mt-2 text-[13px] text-yellow-300">E-posta gönderimi kurulu değil (RESEND_API_KEY).</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="admin-card"><p className="text-[12px] text-subtle">Aktif</p><p className="text-2xl font-extrabold">{active}</p><p className="text-[11px] text-subtle">{Object.entries(data.counts.active).map(([l, n]) => `${l.toUpperCase()} ${n}`).join(' · ')}</p></div>
        <div className="admin-card"><p className="text-[12px] text-subtle">Onay bekliyor</p><p className="text-2xl font-extrabold">{data.counts.pending}</p></div>
        <div className="admin-card"><p className="text-[12px] text-subtle">Ayrılan</p><p className="text-2xl font-extrabold">{data.counts.unsubscribed}</p></div>
        <div className="admin-card"><p className="text-[12px] text-subtle">Gönderilen bülten</p><p className="text-2xl font-extrabold">{data.sends.filter((s) => s.status === 'sent' || s.status === 'partial').length}</p></div>
      </div>

      <div className="admin-card grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-muted">Gönderimler</p>
        </div>
        {data.sends.length === 0 ? <p className="text-[12px] text-subtle">Henüz gönderim yok.</p> : (
          <ul className="grid gap-1 text-[13px]">
            {data.sends.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2">
                <span>{s.insight_id ? <Link href={`/admin/insights/${s.insight_id}`} className="text-white hover:text-yoca-lime">{s.title ?? 'Yazı'}</Link> : 'Yazı'} <span className="text-subtle">· {SEND_STATUS[s.status] ?? s.status}</span></span>
                <span className="text-[12px] text-subtle">{s.sent}/{s.recipients}{s.failed ? ` · ${s.failed} başarısız` : ''} · {fmt(s.finished_at ?? s.started_at ?? s.test_sent_at)}{s.created_by ? ` · ${s.created_by}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-card grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['active', 'pending', 'unsubscribed', 'all'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`px-3 py-1.5 text-[12px] font-bold ${filter === f ? 'bg-yoca-lime text-black' : 'border border-line text-muted hover:text-white'}`}>{f === 'all' ? 'Tümü' : STATUS[f].label}</button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="E-posta ara" className="admin-input !w-[220px] !py-1.5 !text-[13px]" />
          <button type="button" className="admin-btn !px-3 !py-1.5 !text-[12px]" onClick={exportCsv} disabled={!rows.length}>CSV indir ({rows.length})</button>
        </div>
        {rows.length === 0 ? <p className="text-[12px] text-subtle">Bu filtrede abone yok.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-[13px]">
              <thead><tr className="text-[11px] uppercase tracking-wide text-subtle"><th className="py-2 text-start">E-posta</th><th className="text-start">Dil</th><th className="text-start">Durum</th><th className="text-start">Kaynak</th><th className="text-start">Kayıt</th><th className="text-start">Onay / ayrılma</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-2 pe-3" dir="ltr">{s.email}</td>
                    <td className="pe-3">{s.locale.toUpperCase()}</td>
                    <td className="pe-3"><span className={`border px-2 py-0.5 text-[11px] font-bold ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span></td>
                    <td className="pe-3 text-subtle">{s.source ?? '—'}</td>
                    <td className="pe-3 text-subtle">{fmt(s.created_at)}</td>
                    <td className="text-subtle">{s.status === 'unsubscribed' ? fmt(s.unsubscribed_at) : fmt(s.confirmed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-subtle">Son 500 kayıt gösterilir. Kayıt sırasında gösterilen onay metni, zamanı ve IP adresinin özeti (SHA-256, adresin kendisi değil) her aboneyle birlikte saklanır.</p>
      </div>
    </div>
  );
}
