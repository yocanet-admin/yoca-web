'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, Notice, StatusBadge } from '@/components/admin/cockpit/Widgets';
import { adminApi, fmtDate } from '@/lib/cockpit/client';
import { addSite, checkIsStale, checkLabel, loadSiteRows, normalizeSiteUrl, browserProbeText, probeFromBrowser, removeSite, siteIssues, updateSite, type BrowserProbe, type HealthResponse, type SiteEdit, type SiteRow } from '@/lib/cockpit/sites';
import type { SiteCheck } from '@/lib/cockpit/monitor';

/**
 * Yoca Admin — Müşteri siteleri.
 * Live checks (up / suspended / slow, signature, SSL, domain) + renewal
 * calendar + the list of monitored sites (managed here, stored in Supabase).
 */

const STATE: Record<SiteCheck['state'], { kind: 'good' | 'warning' | 'critical'; label: string }> = {
  up: { kind: 'good', label: 'Çalışıyor' },
  slow: { kind: 'warning', label: 'Yavaş' },
  down: { kind: 'critical', label: 'Site erişilemiyor' },
  suspended: { kind: 'critical', label: 'Askıda' },
  unknown: { kind: 'warning', label: 'Kontrol tamamlanamadı' },
};

function days(value: number | null): string {
  if (value === null) return 'bilinmiyor';
  if (value < 0) return 'süresi geçti';
  return `${value} gün`;
}

export default function AdminSites() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(true);
  const [draft, setDraft] = useState({ name: '', url: '', expects_signature: true });
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // re-evaluates "Sonuç güncel değil" while the page stays open
  const [now, setNow] = useState(() => Date.now());
  const [probes, setProbes] = useState<Record<string, BrowserProbe>>({});
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const say = (text: string) => {
    setFlash(text);
    setTimeout(() => setFlash(null), 3000);
  };

  const check = async (fresh = false) => {
    setBusy(true);
    try {
      setHealth(await adminApi<HealthResponse>(`/api/admin/health${fresh ? '?refresh=1' : ''}`));
    } finally {
      setBusy(false);
    }
  };
  const edit = async (row: SiteRow, patch: SiteEdit) => {
    if (await updateSite(row.id, patch)) loadRows();
    else say('Kaydedilemedi — oturumu ve SQL kurulumunu kontrol edin.');
  };
  const loadRows = async () => {
    const result = await loadSiteRows();
    setRows(result.rows);
    setReady(result.ready);
  };

  useEffect(() => {
    check();
    loadRows();
  }, []);

  const checks = health?.checks ?? [];

  // For every site the server could not confirm, also try from this browser (a second vantage point).
  useEffect(() => {
    const pending = (health?.checks ?? []).filter((c) => c.state !== 'up' && c.state !== 'slow');
    if (!pending.length) return;
    let alive = true;
    setProbes((prev) => ({ ...prev, ...Object.fromEntries(pending.map((c) => [c.url, { state: 'checking' } as BrowserProbe])) }));
    pending.forEach((c) =>
      probeFromBrowser(c.url).then((result) => {
        if (alive) setProbes((prev) => ({ ...prev, [c.url]: result }));
      }),
    );
    return () => {
      alive = false;
    };
  }, [health]);
  const region = health?.monitorRegion ? `Vercel ${health.monitorRegion}` : 'Vercel sunucusu';
  const failed = health && !health.ok ? health.error ?? 'Site kontrolü yapılamadı.' : null;
  const renewals = checks
    .flatMap((c) => [
      c.domainExpires ? { site: c.name, what: 'Alan adı', date: c.domainExpires } : null,
      c.sslExpires ? { site: c.name, what: 'SSL sertifikası', date: c.sslExpires } : null,
      c.hostingRenewsOn ? { site: c.name, what: 'Hosting', date: c.hostingRenewsOn } : null,
    ])
    .filter((x): x is { site: string; what: string; date: string } => Boolean(x))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Müşteri siteleri</h1>
          <p className="mt-1.5 text-[14px] text-muted">Açık mı, askıda mı, imza var mı, SSL ve alan adı ne zaman bitiyor.</p>
        </div>
        <div className="flex items-center gap-3">
          {flash && <span role="status" className="text-[13px] font-bold text-amber-300">{flash}</span>}
          <button type="button" onClick={() => check(true)} disabled={busy} className="admin-btn">
            {busy ? 'Kontrol ediliyor…' : '↻ Şimdi kontrol et'}
          </button>
        </div>
      </header>

      {failed && !busy && (
        <Notice tone="warning">
          Site kontrolü alınamadı: {failed}{' '}
          <button type="button" onClick={() => check(true)} className="font-bold underline">
            Tekrar dene
          </button>
        </Notice>
      )}

      {!ready && (
        <Notice tone="warning">
          Site listesi şu an varsayılan 5 siteden oluşuyor. Site eklemek/düzenlemek ve hosting tarihlerini girmek için <code className="text-yoca-lime">supabase/upgrade-v8-cockpit.sql</code> dosyasını çalıştırın.
        </Notice>
      )}

      <div className={`grid gap-3 transition-opacity ${busy && health ? 'opacity-60' : ''}`}>
        {checks.map((c) => {
          // the state itself is the badge and the "İzleme noktası" line; list only the other issues (SSL, domain, signature …)
          const issues = siteIssues(c).filter((issue) => !issue.text.startsWith(checkLabel(c)));
          const stale = checkIsStale(c.checkedAt, now);
          return (
            <article key={c.url} className="rounded-md border border-line bg-surface-deep/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2.5 text-[15px] font-extrabold">
                    {c.name}
                    <StatusBadge kind={STATE[c.state].kind}>{checkLabel(c)}</StatusBadge>
                    {stale && <StatusBadge kind="neutral">Sonuç güncel değil</StatusBadge>}
                  </p>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-subtle hover:text-white">
                    {c.url.replace(/^https?:\/\//, '')} ↗
                  </a>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
                  <div>
                    <dt className="text-subtle">Yanıt</dt>
                    <dd className="font-bold tabular-nums text-white">{c.ms !== null ? `${(c.ms / 1000).toFixed(1)} sn` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">İmza</dt>
                    <dd className="font-bold text-white">{c.signature === null ? '—' : c.signature ? 'Var' : c.expectsSignature ? 'Yok' : 'Gerekmiyor'}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">SSL</dt>
                    <dd className="font-bold text-white">{days(c.sslDaysLeft)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Alan adı</dt>
                    <dd className="font-bold text-white">{days(c.domainDaysLeft)}</dd>
                  </div>
                </dl>
              </div>
              {issues.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {issues.map((issue) => (
                    <li key={issue.text}>
                      <StatusBadge kind={issue.severity}>{issue.text}</StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="mt-3 grid gap-1 text-[12px] text-subtle">
                <div className="flex flex-wrap gap-x-2">
                  <dt>İzleme noktası ({region}):</dt>
                  <dd className="text-soft">
                    {checkLabel(c)}
                    {c.error ? ` — ${c.error}` : c.httpStatus !== null ? ` · HTTP ${c.httpStatus}` : ''} · {fmtDate(c.checkedAt)}
                    {stale ? ' · 30 dakikadan eski, “Şimdi kontrol et” ile yenileyin' : ''}
                  </dd>
                </div>
                {probes[c.url] && c.state !== 'up' && c.state !== 'slow' && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt title="fetch no-cors: yalnız isteğin tamamlanıp tamamlanmadığı görülür; durum kodu ve içerik okunamaz. İzleme uyarısını etkilemez.">Bu tarayıcıdan (yalnız bilgi):</dt>
                    <dd className="text-soft">
                      {browserProbeText(probes[c.url])}
                    </dd>
                  </div>
                )}
              </dl>
              {(c.state === 'unknown' || c.problem === 'restricted') && (
                <p className="mt-1 text-[12px] text-subtle">Bu sonuç sitenin herkes için kapalı olduğunu göstermez: kontrol {region} üzerinden yapılıyor. Tarayıcıdan açılıyorsa sorun bağlantı yolunda ya da hosting güvenlik duvarında olabilir.</p>
              )}
            </article>
          );
        })}
        {!health && <div className="h-40 animate-pulse rounded-md bg-surface" />}
        {checks[0] && (
          <p className="text-[12px] text-subtle">
            Sonuçlar 10 dakika saklanır. “Kontrol tamamlanamadı”: izleme isteği bitmedi (zaman aşımı, bağlantı hatası). “Erişim kısıtlı”: sunucu 401/403/429 ile kontrolü reddetti. “Sunucu hatası” (5xx), “İzlenen adres bulunamadı” (404), “Güvenli bağlantı sorunu” (sertifika) ve “Alan adı bulunamadı” (DNS NXDOMAIN) sitenin kendisiyle ilgili kanıttır.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Yenileme takvimi">
          {renewals.length === 0 ? (
            <p className="text-[13px] text-subtle">Henüz tarih yok. Alan adı ve SSL tarihleri otomatik okunur; hosting tarihini aşağıdan girin.</p>
          ) : (
            <ul className="grid gap-2">
              {renewals.map((r) => {
                const left = Math.floor((Date.parse(r.date) - Date.now()) / 86_400_000);
                return (
                  <li key={`${r.site}-${r.what}`} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-soft">
                      <span className="font-bold text-white">{r.site}</span> · {r.what}
                    </span>
                    <span className={`tabular-nums ${left <= 30 ? 'font-bold text-amber-300' : 'text-subtle'}`}>
                      {fmtDate(r.date, false)} ({days(left)})
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-subtle">.az gibi bazı uzantılar alan adı bitişini paylaşmaz; o durumda “bilinmiyor” görünür.</p>
        </Card>

        <Card title="İzlenen siteler">
          <ul className="grid gap-2">
            {(ready ? rows : []).map((row) => (
              <li key={row.id} className="grid gap-2 rounded-sm border border-line p-3 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{row.name}</span>
                  <span className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[12px] text-subtle">
                      <input
                        type="checkbox"
                        checked={row.expects_signature}
                        className="accent-yoca-lime"
                        onChange={(e) => edit(row, { expects_signature: e.target.checked })}
                      />
                      imza beklenir
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm(`${row.name} izlemeden çıkarılsın mı?`) && (await removeSite(row.id))) {
                          loadRows();
                          check(true);
                        }
                      }}
                      className="text-[12px] text-subtle hover:text-red-400"
                    >
                      Çıkar
                    </button>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-subtle">
                  {row.url}
                  <label className="ml-auto flex items-center gap-1.5">
                    Hosting yenileme
                    <input
                      type="date"
                      value={row.hosting_renews_on ?? ''}
                      onChange={(e) => edit(row, { hosting_renews_on: e.target.value || null })}
                      className="admin-input !w-auto !py-1 text-[12px]"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          {ready && (
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setFormError(null);
                if (!draft.name.trim()) return setFormError('Site adı gerekli.');
                const url = normalizeSiteUrl(draft.url);
                if (!url) return setFormError('Geçerli bir adres girin (ör. ornek.com veya https://ornek.com).');
                const order = rows.length ? Math.max(...rows.map((r) => r.order_index ?? 0)) + 1 : 0;
                const result = await addSite({ name: draft.name.trim(), url, expects_signature: draft.expects_signature, order_index: order });
                if (!result.ok) return setFormError(`Eklenemedi: ${result.error ?? 'bilinmeyen hata'}`);
                setDraft({ name: '', url: '', expects_signature: true });
                await loadRows();
                check(true);
              }}
            >
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ad" aria-label="Site adı" className="admin-input !w-36 !py-1.5 text-[13px]" />
              <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="ornek.com" aria-label="Adres" className="admin-input min-w-[160px] flex-1 !py-1.5 text-[13px]" />
              <button type="submit" className="admin-btn">
                + Ekle
              </button>
            </form>
          )}
          {formError && (
            <p role="alert" className="mt-2 text-[12px] font-bold text-amber-300">
              {formError}
            </p>
          )}
          <p className="mt-3 text-[12px] text-subtle">
            İmza kodu: <Link href="/admin/signature" className="underline">İmza</Link> sayfası.
          </p>
        </Card>
      </div>
    </div>
  );
}
