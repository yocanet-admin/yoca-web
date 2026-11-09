'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, Notice, StatusBadge } from '@/components/admin/cockpit/Widgets';
import { adminApi, fmtDate } from '@/lib/cockpit/client';
import {
  addSite,
  browserProbeText,
  checkLabel,
  checkSiteNow,
  loadSiteRows,
  normalizeSiteUrl,
  probeFromBrowser,
  removeSite,
  setSiteInterval,
  siteIssues,
  updateSite,
  type BrowserProbe,
  type HealthResponse,
  type SiteEdit,
  type SiteRow,
  type SiteStatus,
} from '@/lib/cockpit/sites';
import { CHECK_INTERVALS, INTERVAL_LABEL, LONG_INTERVALS, MANUAL_GAP_S, resultFreshness, slotCeil, type CheckInterval } from '@/lib/cockpit/schedule';
import type { SiteCheck } from '@/lib/cockpit/monitor';

/**
 * Yoca Admin — Müşteri siteleri.
 * Shows the STORED last check of each site with its schedule (frequency, last
 * attempt, last success, next planned check — Istanbul time). Opening or
 * refreshing this page sends no request to the client sites: the cron checks a
 * site when its frequency says so; "Şimdi kontrol et" checks one site on demand;
 * "Bu tarayıcıdan dene" is an explicit button too.
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

const tr = (iso: string | null) => (iso ? `${fmtDate(iso)} (TR)` : '—');
const hm = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

// the cron slot that will do the check (schedule.ts plannedSlot), not a computed "about" time
function nextLine(site: SiteStatus): string {
  if (site.interval === 'manual' || !site.plannedAt) return 'Otomatik kontrol kapalı — yalnız elle';
  if (site.confirmPending) return `${tr(site.plannedAt)} · ilk başarısız kontrolden sonra tek doğrulama`;
  // never checked, or the planned slot has passed (a missed run): the next cron run takes it
  if (!site.nextCheckAt || Date.parse(site.plannedAt) !== slotCeil(Date.parse(site.nextCheckAt))) return `${tr(site.plannedAt)} · bir sonraki cron çalışması`;
  return tr(site.plannedAt);
}

export default function AdminSites() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(true);
  const [draft, setDraft] = useState({ name: '', url: '', expects_signature: true });
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [probes, setProbes] = useState<Record<string, BrowserProbe>>({});
  // re-evaluates freshness and the manual-check countdown while the page stays open
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const say = (text: string) => {
    setFlash(text);
    setTimeout(() => setFlash(null), 4000);
  };

  // reads the stored results only — no request to any client site
  const check = async () => {
    setBusy(true);
    try {
      setHealth(await adminApi<HealthResponse>('/api/admin/health'));
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
  const checkNow = async (site: SiteStatus) => {
    setChecking((prev) => ({ ...prev, [site.id]: true }));
    const result = await checkSiteNow(site.id);
    setChecking((prev) => ({ ...prev, [site.id]: false }));
    if (!result.ok) say(result.error ?? 'Kontrol yapılamadı.');
    await check();
  };
  const changeInterval = async (site: SiteStatus, interval: CheckInterval) => {
    const result = await setSiteInterval(site.id, interval);
    say(
      !result.ok
        ? result.error ?? 'Sıklık kaydedilemedi.'
        : result.applied === 'after_check'
          ? `${site.name}: ${INTERVAL_LABEL[interval]} — süren kontrol bitince yeni sıklıkla planlanır (alarm durumu ve son sonuç korunur)`
          : `${site.name}: ${INTERVAL_LABEL[interval]} (alarm durumu ve son sonuç korunur)`,
    );
    await check();
  };
  const probe = async (site: SiteStatus) => {
    setProbes((prev) => ({ ...prev, [site.id]: { state: 'checking' } }));
    const result = await probeFromBrowser(site.url);
    setProbes((prev) => ({ ...prev, [site.id]: result }));
  };

  useEffect(() => {
    check();
    loadRows();
  }, []);

  const sites = health?.sites ?? [];
  const checks = sites.map((s) => s.check).filter((c): c is SiteCheck => Boolean(c));
  const region = health?.monitorRegion ? `Vercel ${health.monitorRegion}` : 'Vercel sunucusu';
  const failed = health && !health.ok ? health.error ?? 'Site durumları alınamadı.' : null;
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
          <p className="mt-1.5 text-[14px] text-muted">Açık mı, askıda mı, imza var mı, SSL ve alan adı ne zaman bitiyor. Her site kendi sıklığıyla kontrol edilir.</p>
        </div>
        <div className="flex items-center gap-3">
          {flash && <span role="status" className="text-[13px] font-bold text-amber-300">{flash}</span>}
          <button type="button" onClick={() => check()} disabled={busy} className="admin-btn" title="Kayıtlı sonuçları yeniden okur; sitelere istek göndermez.">
            {busy ? 'Okunuyor…' : '↻ Listeyi yenile'}
          </button>
        </div>
      </header>

      {failed && !busy && (
        <Notice tone="warning">
          Site durumları alınamadı: {failed}{' '}
          <button type="button" onClick={() => check()} className="font-bold underline">
            Tekrar dene
          </button>
        </Notice>
      )}

      {!ready && (
        <Notice tone="warning">
          Site eklemek/düzenlemek ve hosting tarihlerini girmek için <code className="text-yoca-lime">supabase/upgrade-v8-cockpit.sql</code> dosyasını çalıştırın.
        </Notice>
      )}

      <div className={`grid gap-3 transition-opacity ${busy && health ? 'opacity-60' : ''}`}>
        {sites.map((site) => {
          const c = site.check;
          // the state itself is the badge and the "Son deneme" line; list only the other issues (SSL, domain, signature …)
          const issues = c ? siteIssues(c).filter((issue) => !issue.text.startsWith(checkLabel(c))) : [];
          const freshness = resultFreshness({ interval: site.interval, lastAttemptAt: site.lastAttemptAt, nextCheckAt: site.nextCheckAt, now });
          const cooldown = site.lastManualAt ? Math.max(0, Math.ceil((Date.parse(site.lastManualAt) + MANUAL_GAP_S * 1000 - now) / 1000)) : 0;
          const inFlight = checking[site.id] || site.checking;
          const answered = c && (c.state === 'up' || c.state === 'slow');
          return (
            <article key={site.id} className="rounded-md border border-line bg-surface-deep/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2.5 text-[15px] font-extrabold">
                    {site.name}
                    {c ? <StatusBadge kind={STATE[c.state].kind}>{checkLabel(c)}</StatusBadge> : <StatusBadge kind="neutral">Henüz kontrol edilmedi</StatusBadge>}
                    {freshness === 'overdue' && <StatusBadge kind="neutral">Sonuç güncel değil</StatusBadge>}
                    {inFlight && <StatusBadge kind="neutral">Kontrol ediliyor…</StatusBadge>}
                  </p>
                  <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-subtle hover:text-white">
                    {site.url.replace(/^https?:\/\//, '')} ↗
                  </a>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
                  <div>
                    <dt className="text-subtle">Yanıt</dt>
                    <dd className="font-bold tabular-nums text-white">{c?.ms != null ? `${(c.ms / 1000).toFixed(1)} sn` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">İmza</dt>
                    <dd className="font-bold text-white">{!c || c.signature === null ? '—' : c.signature ? 'Var' : c.expectsSignature ? 'Yok' : 'Gerekmiyor'}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">SSL</dt>
                    <dd className="font-bold text-white">{days(c?.sslDaysLeft ?? null)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Alan adı</dt>
                    <dd className="font-bold text-white">{days(c?.domainDaysLeft ?? null)}</dd>
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
              <dl className="mt-3 grid gap-1 text-[12px] text-subtle sm:grid-cols-2 sm:gap-x-6">
                <div className="flex flex-wrap items-center gap-x-2">
                  <dt>Sıklık:</dt>
                  <dd>
                    <select
                      value={site.interval}
                      onChange={(e) => changeInterval(site, e.target.value as CheckInterval)}
                      aria-label={`${site.name} kontrol sıklığı`}
                      className="admin-input !w-auto !py-1 text-[12px]"
                    >
                      {CHECK_INTERVALS.map((value) => (
                        <option key={value} value={value}>
                          {INTERVAL_LABEL[value]}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt>Sonraki planlanan kontrol:</dt>
                  <dd className="text-soft">{nextLine(site)}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt>Son deneme ({region}):</dt>
                  <dd className="text-soft">
                    {site.lastAttemptAt ? tr(site.lastAttemptAt) : 'yok'}
                    {site.lastSlotAt ? ` · ${hm(site.lastSlotAt)} cron dilimi` : site.lastStartedAt ? ' · elle' : ''}
                    {c && !answered ? ` · ${checkLabel(c)}${c.error ? ` — ${c.error}` : c.httpStatus !== null ? ` · HTTP ${c.httpStatus}` : ''}` : ''}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt>Son başarılı kontrol:</dt>
                  <dd className="text-soft">{tr(site.lastSuccessAt)}</dd>
                </div>
                {probes[site.id] && (
                  <div className="flex flex-wrap gap-x-2 sm:col-span-2">
                    <dt title="fetch no-cors: yalnız isteğin tamamlanıp tamamlanmadığı görülür; durum kodu ve içerik okunamaz. İzleme uyarısını etkilemez.">Bu tarayıcıdan (yalnız bilgi):</dt>
                    <dd className="text-soft">{browserProbeText(probes[site.id])}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => checkNow(site)} disabled={Boolean(inFlight) || cooldown > 0} className="admin-btn !py-1.5 text-[12px]">
                  {inFlight ? 'Kontrol ediliyor…' : cooldown > 0 ? `Şimdi kontrol et (${cooldown} sn)` : 'Şimdi kontrol et'}
                </button>
                {c && !answered && (
                  <button type="button" onClick={() => probe(site)} disabled={probes[site.id]?.state === 'checking'} className="admin-btn !py-1.5 text-[12px]">
                    Bu tarayıcıdan dene
                  </button>
                )}
              </div>
              {LONG_INTERVALS.includes(site.interval) && (
                <p className="mt-2 text-[12px] text-subtle">
                  {site.interval === 'manual'
                    ? 'Otomatik kontrol yok: kesinti ve düzelme yalnız elle kontrol edildiğinde görülür.'
                    : 'Seyrek izleme: kesinti de düzelme de ancak bir sonraki kontrolde görülür; iki kontrol arasındaki kısa kesintiler görülmeyebilir.'}
                </p>
              )}
              {c && (c.state === 'unknown' || c.problem === 'restricted') && (
                <p className="mt-1 text-[12px] text-subtle">Bu sonuç sitenin herkes için kapalı olduğunu göstermez: kontrol {region} üzerinden yapılıyor. Tarayıcıdan açılıyorsa sorun bağlantı yolunda ya da hosting güvenlik duvarında olabilir.</p>
              )}
            </article>
          );
        })}
        {!health && <div className="h-40 animate-pulse rounded-md bg-surface" />}
        {sites[0] && (
          <div className="grid gap-1 text-[12px] text-subtle">
            <p>
              <strong className="text-muted">Şimdi kontrol et:</strong> gerçek bir kontroldür; alarm ve düzelme kuralları aynen uygulanır. Başarılı olursa sonraki otomatik kontrol, bu andan en az bir aralık sonraki ilk cron çalışmasına planlanır (günlük / haftalık site erken kontrol edilmez); başarısız olursa en az 7,5 dakika sonraki ilk cron çalışmasında tek doğrulama yapılır (“yalnız elle” seçili sitede otomatik doğrulama yapılmaz). Aynı site {MANUAL_GAP_S / 60} dakikada bir elle kontrol edilebilir.
            </p>
            <p>
              <strong className="text-muted">Alarm:</strong> kesinti, sitenin sıklığına göre bir sonraki planlı kontrolde görülür (haftalık sitede başlangıcından bir haftaya kadar sonra). Bu ilk başarısız kontrolden sonraki cron çalışmasında tek doğrulama yapılır; ikisi de başarısızsa bir kez haber verilir — yani alarm, kesintinin başlangıcından değil ilk başarısız kontrolden yaklaşık 15 dakika sonra (bir sonraki cron çalışmasında) gelir. Düzelme de bir sonraki başarılı kontrolde (planlı ya da “Şimdi kontrol et”) anlaşılır ve mesajı yalnız sitenin yanıt verdiği bir kontrolden sonra gider. “Yalnız elle” seçili sitede otomatik doğrulama yoktur; iki elle kontrol üst üste başarısızsa haber verilir. Sıklığı değiştirmek alarm durumunu ve son sonucu değiştirmez; sonraki kontrol yeni sıklığa göre son kontrolden itibaren yeniden hesaplanır, “yalnız elle”ye geçmek bekleyen doğrulamayı iptal eder. “Sonuç güncel değil”: planlanan kontrol 30 dakikadan fazla gecikti.
            </p>
            <p>
              “Kontrol tamamlanamadı”: izleme isteği bitmedi (zaman aşımı, bağlantı hatası). “Erişim kısıtlı”: sunucu 401/403/429 ile kontrolü reddetti. “Sunucu hatası” (5xx), “İzlenen adres bulunamadı” (404), “Güvenli bağlantı sorunu” (sertifika) ve “Alan adı bulunamadı” (DNS NXDOMAIN) sitenin kendisiyle ilgili kanıttır. Sayfa ve TLS kontrolü sitenin sıklığıyla yapılır; alan adı (RDAP) sorgusu yalnız bir kontrolle birlikte ve en fazla günde bir kez.
            </p>
          </div>
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
                          check();
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
                check();
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
