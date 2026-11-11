'use client';

import { useEffect, useRef, useState } from 'react';
import { Notice } from '@/components/admin/cockpit/Widgets';
import { Flash, PageHead } from '@/components/admin/ops/ui';
import { adminApi, adminPost } from '@/lib/cockpit/client';
import { DEFAULT_FILTERS, NO_DATA } from '@/lib/seoPanel/model';
import { Comparison, ConnectionNotice, Daily, DataLag, Filters, SampleBadge, TopLists, Totals, Weekly, type Query } from '@/components/admin/seo/Performance';
import { Keywords } from '@/components/admin/seo/Keywords';
import { Audit, PageSpeed } from '@/components/admin/seo/Technical';
import { Opportunities } from '@/components/admin/seo/Opportunities';
import type { SeoResponse } from '@/components/admin/seo/types';

/**
 * Yoca Kokpit — SEO (Faz 0, yoca.net). Admin only: hidden from the finance
 * menu and refused by every /api/admin/seo route (requireAdmin + RLS).
 * Search Console performance with a same-filter comparison, target keyword ↔
 * page mapping, weekly record, limited technical audit, PageSpeed (lab and
 * field kept apart) and rule-based opportunities with on-request AI help.
 */

const TABS = [
  { id: 'performance', label: 'Performans' },
  { id: 'keywords', label: 'Anahtar kelimeler' },
  { id: 'technical', label: 'Teknik' },
  { id: 'opportunities', label: 'Fırsatlar' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function AdminSeo() {
  const [tab, setTab] = useState<Tab>('performance');
  const [query, setQuery] = useState<Query>({ preset: 28, start: '', end: '', filters: { ...DEFAULT_FILTERS } });
  const [data, setData] = useState<SeoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'bad' | 'warn' } | null>(null);

  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (TABS.some((t) => t.id === h)) setTab(h as Tab);
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    try { window.history.replaceState(null, '', `#${t}`); } catch { /* ignore */ }
  };

  const latest = useRef(0);
  const load = async (fresh = false) => {
    const ticket = ++latest.current;
    setLoading(true);
    const q = new URLSearchParams();
    if (query.preset) q.set('preset', String(query.preset));
    else { q.set('start', query.start); q.set('end', query.end); }
    if (query.filters.country) q.set('country', query.filters.country);
    if (query.filters.device) q.set('device', query.filters.device);
    q.set('searchType', query.filters.searchType);
    q.set('dataState', query.filters.dataState);
    if (fresh) q.set('refresh', '1');
    const next = await adminApi<SeoResponse>(`/api/admin/seo?${q.toString()}`);
    if (ticket !== latest.current) return;
    setData(next);
    setLoading(false);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const act = async (body: Record<string, unknown>, ok: string, path = '/api/admin/seo') => {
    setBusy(String(body.action ?? path));
    const r = await adminPost<{ ok: boolean; error?: string; weeks?: Array<{ week: string; status: string }>; limitReason?: string | null }>(path, body);
    setBusy(null);
    if (!r.ok) { setFlash({ text: r.error ?? 'İşlem başarısız.', tone: 'bad' }); return false; }
    let text = ok;
    if (r.weeks) text = `Haftalık kayıt: ${r.weeks.map((w) => `${w.week} ${w.status === 'saved' ? 'kaydedildi' : w.status === 'skipped' ? 'kesinleşme tarihi belirlenemedi, atlandı' : 'henüz kesinleşmedi, atlandı'}`).join(' · ')}`;
    setFlash({ text, tone: 'ok' });
    await load(true);
    return true;
  };

  if (data && !data.ok) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageHead kicker="Genel" title="SEO" sub="yoca.net — Search Console, hedef kelimeler, teknik kontrol." />
        <Notice tone="warning">{data.pending ? <><strong>Migration bekleniyor.</strong> {data.error}</> : <>{data.error} SEO sayfası yalnızca yöneticilere açıktır.</>}</Notice>
      </div>
    );
  }

  const report = data?.report ?? null;
  const connected = Boolean(data && data.connection.mode !== 'none');
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <PageHead
        kicker="Genel"
        title="SEO"
        sub={`yoca.net — Search Console (${data?.site.property ?? 'https://yoca.net/'}), hedef kelimeler, teknik kontrol. Yalnızca yöneticiler görür.`}
        actions={<>{data?.connection.fixture && <SampleBadge />}<button type="button" className="admin-btn admin-btn-sm" onClick={() => load(true)}>↻ Yenile</button></>}
      />
      <Flash message={flash?.text ?? null} tone={flash?.tone} onClose={() => setFlash(null)} />
      {data && <ConnectionNotice mode={data.connection.mode} message={data.connection.message} step={data.connection.step} />}
      {data?.reportError && <Notice tone="warning">{data.reportError}</Notice>}

      <nav className="admin-tabs" aria-label="SEO bölümleri">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => pick(t.id)} aria-current={tab === t.id ? 'page' : undefined}
            className="admin-tab">
            {t.label}{t.id === 'opportunities' && report ? ` (${report.opportunities.length})` : ''}
          </button>
        ))}
      </nav>

      {(tab === 'performance' || tab === 'keywords' || tab === 'opportunities') && <Filters query={query} onChange={setQuery} today={data?.today ?? ''} />}

      <div className={`grid min-w-0 grid-cols-1 gap-6 transition-opacity ${loading && data ? 'opacity-60' : ''}`}>
        {!data && <p className="text-[13px] text-subtle">Yükleniyor…</p>}

        {data && tab === 'performance' && (
          <>
            {report ? (
              <>
                <DataLag report={report} />
                <Comparison report={report} />
                <Totals report={report} />
                {!report.current.totals.impressions && <Notice>{NO_DATA}.</Notice>}
                <Daily report={report} />
                <TopLists report={report} />
              </>
            ) : connected ? null : <p className="text-[13px] text-subtle">Bağlantı kurulunca performans burada görünür.</p>}
            <Weekly weekly={data.weekly} busy={busy === 'snapshot'} canSave={connected} onSave={() => act({ action: 'snapshot' }, 'Kaydedildi.')} />
          </>
        )}

        {data && tab === 'keywords' && (
          <Keywords filters={report?.current.filters ?? query.filters} range={report?.current.range ?? null} prevRange={report?.previous.range ?? null} keywords={data.keywords} gscQueries={report?.gscQueries ?? []} act={(b, ok) => act(b, ok)} busy={busy !== null} connected={connected} />
        )}

        {data && tab === 'technical' && (
          <>
            <Audit audit={data.audit} hosts={data.connection.hosts} busy={busy === '/api/admin/seo/audit'} onRun={() => act({}, 'Tarama bitti.', '/api/admin/seo/audit')} />
            <PageSpeed rows={data.pagespeed} origin={`https://${data.site.domain}`} running={busy?.startsWith('psi:') ? busy.slice(4) : null}
              onRun={async (p) => {
                setBusy(`psi:${p}`);
                const r = await adminPost<{ ok: boolean; error?: string }>('/api/admin/seo/pagespeed', { path: p });
                setBusy(null);
                setFlash(r.ok ? { text: `${p} test edildi (mobil + masaüstü).`, tone: 'ok' } : { text: r.error ?? 'Test başarısız.', tone: 'bad' });
                await load(true);
              }} />
          </>
        )}

        {data && tab === 'opportunities' && (
          report ? <Opportunities items={report.opportunities} previous={data.suggestions} /> : <p className="text-[13px] text-subtle">Fırsatlar Search Console verisinden hesaplanır; bağlantı kurulunca görünür.</p>
        )}
      </div>
    </div>
  );
}
