'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import { TokenHelp } from '@/components/admin/cockpit/TokenHelp';
import Bars from '@/components/admin/tangram/Bars';
import { Status, type Tone } from '@/components/admin/tangram/ui';
import t from '@/components/admin/tangram/tangram.module.css';
import { loadOps } from '@/lib/ops/data';
import { KIND_LABEL } from '@/lib/ops/model';
import { renewalStats, type RenewalStats } from '@/lib/ops/renewals';
import { formatTotals } from '@/lib/ops/money';
import { loadFinance } from '@/lib/fin/data';
import { buildItems, overview, type Overview } from '@/lib/fin/model';
import { LEAD_LABEL, OPEN_STATUSES, adminApi, delta, fmtDate, fmtNumber, istanbulToday, timeAgo, type LeadStatus } from '@/lib/cockpit/client';
import { loadLeads, type Lead } from '@/lib/cockpit/leads';
import { loadCrm, money, pipelineByCurrency, type CrmData } from '@/lib/cockpit/crm';
import { siteIssues, type HealthResponse, type Severity, type SiteStatus } from '@/lib/cockpit/sites';
import { resultFreshness } from '@/lib/cockpit/schedule';
import type { TrafficReport } from '@/lib/cockpit/vercel';
import { VISITOR_TODAY_LABEL, VISITOR_WEEK_LABEL, visitorCard } from '@/lib/cockpit/visitorCard';
import { mergeWorkSources } from '@/lib/workData';

/**
 * Yoca Admin — Kokpit.
 * One screen: what needs attention now, the week in numbers, traffic,
 * leads, client sites, tasks and site health. Every block degrades
 * gracefully (missing SQL v8, missing Vercel token) and says how to fix it.
 *
 * Layout: approved Tangram design (components/admin/tangram). Same data and
 * rules as before. The "Yaklaşan ödeme ve yenilemeler" card shows figures that
 * already exist elsewhere: Operasyon → Genel bakış (lib/ops/renewals.ts) and
 * Giderler (lib/fin/model.ts overview), read-only (no period roll from here).
 * Charts use only the days Vercel returned; no estimate is drawn.
 */

type RenewCard = { ops: RenewalStats | null; opsError: string | null; fin: Overview | null; finError: string | null };

type TrafficResponse = { ok: boolean; configured?: boolean; report?: TrafficReport; error?: string };

interface ContentStats {
  drafts: number;
  scheduled: number;
  hiddenSections: number;
  /** Work projects as the site merges them: database rows + code projects without a row (null = table unreadable). */
  work: { db: number; code: number; hidden: number } | null;
  team: number;
  spam7: number | null;
}

const today = istanbulToday;
const VERCEL_DASHBOARD = process.env.NEXT_PUBLIC_VERCEL_DASHBOARD_URL || 'https://vercel.com/mgs-projects-8dc47200/yoca-web';
const DAY = 86_400_000;

export default function Cockpit() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [leadsReady, setLeadsReady] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [crm, setCrm] = useState<CrmData | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [week, setWeek] = useState<TrafficResponse | null>(null);
  const [month, setMonth] = useState<TrafficResponse | null>(null);
  const [content, setContent] = useState<ContentStats | null>(null);
  const [renew, setRenew] = useState<RenewCard | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = (fresh = false) => {
    const q = fresh ? '&refresh=1' : '';
    if (fresh) {
      setHealth(null);
      setWeek(null);
      setMonth(null);
    }
    loadLeads()
      .then((r) => {
        setLeads(r.leads);
        setLeadsReady(r.schemaReady);
        setLeadsError(r.error);
      })
      .catch((error: Error) => {
        setLeads([]);
        setLeadsError(error?.message || 'Leadler okunamadı.');
      });
    loadCrm()
      .then(setCrm)
      .catch(() => setCrm({ ready: false, clients: [], deals: [], activities: [] }));
    adminApi<HealthResponse>(`/api/admin/health${fresh ? '?refresh=1' : ''}`).then(setHealth);
    adminApi<TrafficResponse>(`/api/admin/traffic?days=7${q}`).then(setWeek);
    adminApi<TrafficResponse>(`/api/admin/traffic?days=30${q}`).then(setMonth);
    loadContent()
      .then(setContent)
      .catch(() => setContent({ drafts: 0, scheduled: 0, hiddenSections: 0, work: null, team: 0, spam7: null }));
    if (fresh) setRenew(null);
    void loadRenewals().then(setRenew);
  };

  useEffect(() => {
    load();
  }, []);

  // ── Derived numbers ──────────────────────────────────────────
  const now = Date.now();
  const real = (leads ?? []).filter((l) => l.status !== 'spam');
  const leads7 = real.filter((l) => now - new Date(l.createdAt).getTime() < 7 * DAY).length;
  const leadsPrev7 = real.filter((l) => {
    const age = now - new Date(l.createdAt).getTime();
    return age >= 7 * DAY && age < 14 * DAY;
  }).length;
  const waiting = real.filter((l) => l.status === 'new' && now - new Date(l.createdAt).getTime() > DAY);
  const lateFollowUps = real.filter((l) => l.followUpOn && l.followUpOn < today() && OPEN_STATUSES.includes(l.status));
  const openLeads = real.filter((l) => OPEN_STATUSES.includes(l.status));
  const openTasks = (crm?.activities ?? []).filter((a) => a.kind === 'task' && !a.done).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
  const lateTasks = openTasks.filter((a) => a.due_on && a.due_on < today());
  const pipeline = pipelineByCurrency(crm?.deals ?? []);
  const visitors = visitorCard(week);
  // stored results with each site's own frequency (reading them sends no request to the sites)
  const siteList = health?.sites ?? [];
  const overdue = (s: SiteStatus) => resultFreshness({ interval: s.interval, lastAttemptAt: s.lastAttemptAt, nextCheckAt: s.nextCheckAt, now }) === 'overdue';
  const checks = siteList.map((s) => s.check).filter((c): c is NonNullable<SiteStatus['check']> => Boolean(c));
  // a result whose planned check is late does not count as "working"; a site whose check has not come yet is not a failure
  const sitesUp = siteList.filter((s) => s.check && (s.check.state === 'up' || s.check.state === 'slow') && !overdue(s)).length;
  const sitesUnchecked = siteList.filter((s) => s.check?.state === 'unknown').length;
  const sitesStale = siteList.filter(overdue).length;
  const sitesNever = siteList.filter((s) => !s.check).length;
  const latestProd = health?.deployments?.find((d) => d.target === 'production') ?? null;
  const healthError = health && !health.ok ? health.error ?? 'Site kontrolü alınamadı.' : null;

  // ── Attention list ───────────────────────────────────────────
  const attention: Array<{ severity: Severity; text: string; href: string }> = [];
  for (const check of checks) for (const issue of siteIssues(check)) attention.push({ severity: issue.severity, text: `${check.name}: ${issue.text}`, href: '/admin/sites' });
  if (latestProd && latestProd.state === 'ERROR') attention.push({ severity: 'critical', text: `Son yayın başarısız: “${latestProd.message}”`, href: VERCEL_DASHBOARD });
  if (waiting.length) attention.push({ severity: 'warning', text: `${waiting.length} lead 24 saatten uzun süredir yanıt bekliyor`, href: '/admin/submissions?status=new' });
  if (lateFollowUps.length) attention.push({ severity: 'warning', text: `${lateFollowUps.length} lead için takip tarihi geçti`, href: '/admin/submissions' });
  if (lateTasks.length) attention.push({ severity: 'warning', text: `${lateTasks.length} görevin tarihi geçti`, href: '/admin/clients' });
  if (healthError) attention.push({ severity: 'warning', text: `Site kontrolü yapılamadı: ${healthError}`, href: '/admin/sites' });
  if (leadsError) attention.push({ severity: 'warning', text: `Leadler okunamadı: ${leadsError}`, href: '/admin/submissions' });
  if (leads && !leadsReady) attention.push({ severity: 'neutral', text: 'Kokpit veritabanı kurulumu bekliyor (SQL v8) — lead durumu, CRM ve spam kaydı için', href: '/admin/submissions' });
  if (week && week.configured === false) attention.push({ severity: 'neutral', text: 'Trafik için Vercel anahtarı eklenmedi', href: '/admin/traffic' });
  const order: Record<Severity, number> = { critical: 0, warning: 1, neutral: 2, good: 3 };
  attention.sort((a, b) => order[a.severity] - order[b.severity]);
  const loadingAll = !leads || !health;

  const critical = attention.filter((a) => a.severity === 'critical').length;
  const counts: Record<Severity, number> = { critical: 0, warning: 0, neutral: 0, good: 0 };
  for (const a of attention) counts[a.severity] += 1;
  const greeting = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' }).format(new Date());
  const leadDelta = leads ? delta(leads7, leadsPrev7) : null;
  const summary = loadingAll
    ? 'Durum yükleniyor…'
    : [
        attention.length ? `${attention.length} iş ilgi bekliyor${critical ? ` (${critical} acil)` : ''}` : 'Bekleyen iş yok',
        health && !healthError && siteList.length ? `${siteList.length} siteden ${sitesUp}'i çalışıyor` : '',
        renew?.ops?.within[7] ? `${renew.ops.within[7]} yenileme 7 gün içinde` : '',
      ].filter(Boolean).join(' · ');

  const siteBadge = (st: SiteStatus) => {
    const c = st.check;
    if (!c) return <Status tone="muted" icon="○">Henüz kontrol edilmedi</Status>;
    if (overdue(st)) return <Status tone="muted" icon="◷">Sonuç güncel değil{st.lastAttemptAt ? ` · son deneme ${timeAgo(st.lastAttemptAt)}` : ''}</Status>;
    const worst = siteIssues(c)[0];
    if (worst) return <Status tone={SEV_TONE[worst.severity]} icon={SEV_ICON[worst.severity]}>{worst.text}</Status>;
    return <Status tone="good" icon="●">Çalışıyor{c.ms !== null ? ` · ${(c.ms / 1000).toFixed(1).replace('.', ',')} sn` : ''}</Status>;
  };
  const sitesDown = siteList.filter((st) => st.check && (st.check.state === 'down' || st.check.state === 'suspended') && !overdue(st)).length;
  const sitesOther = siteList.length - sitesUp - sitesDown - sitesUnchecked - sitesStale - sitesNever;
  const segs = [
    { n: sitesUp, label: 'çalışıyor', icon: '●', color: '#63d863' },
    { n: sitesDown, label: 'erişilemiyor', icon: '✕', color: '#ff7b7b' },
    { n: sitesUnchecked, label: 'kontrol tamamlanamadı', icon: '▲', color: '#fab219' },
    { n: sitesStale, label: 'sonuç güncel değil', icon: '◷', color: '#6b717c' },
    { n: sitesNever, label: 'henüz kontrol yok', icon: '○', color: '#343943' },
    { n: Math.max(0, sitesOther), label: 'diğer', icon: '·', color: '#4a505b' },
  ].filter((x) => x.n > 0);
  const weekDaily = week?.report?.daily ?? [];
  const monthDaily = month?.report?.daily ?? [];
  const todayUtc = new Date().toISOString().slice(0, 10);

  const skeleton = (h: number) => <div className="animate-pulse rounded-md bg-surface" style={{ height: h }} />;

  return (
    <div className={t.screen}>
      <header className={t.head}>
        <div className={t.headText}>
          <p className={t.kicker}>{greeting}</p>
          <h1 className={t.h1}>Kokpit</h1>
          <p className={t.lede}>{summary}</p>
        </div>
        <div className={t.headActions}>
          <button type="button" onClick={() => load(true)} className={t.btn}>
            <span aria-hidden="true">↻</span> Yenile
          </button>
        </div>
      </header>

      {/* 1 · what needs attention + visitors */}
      <div className={t.grid}>
        <section className={`${t.tile} ${t.attnCard} ${t.span7}`} aria-labelledby="k-attn">
          <div className={t.attnHero}>
            <div className={t.attnHeroText}>
              <h2 id="k-attn" className={t.tileTitle}>Şimdi ilgilenilmesi gerekenler</h2>
              <p className={t.attnSummary}>
                {loadingAll ? 'Yükleniyor…' : attention.length === 0 ? 'Bekleyen iş yok' : ATTN_ORDER.filter((k) => counts[k]).map((k) => (
                  <span key={k}><span aria-hidden="true">{SEV_ICON[k]}</span> {counts[k]} {SEV_WORD[k]}</span>
                ))}
              </p>
            </div>
            {!loadingAll && <span className={t.heroCount}><strong className={t.num}>{attention.length}</strong><span>iş</span></span>}
          </div>
          <div className={t.attnBody}>
            {loadingAll ? (
              skeleton(80)
            ) : attention.length === 0 ? (
              <p className={t.note}>
                <Status tone="good" icon="●">Her şey yolunda</Status> Siteler çalışıyor, bekleyen lead ya da geciken iş yok.
              </p>
            ) : (
              <>
                <ul id="k-attn-list" className={t.attnList}>
                  {attention.map((item, i) => (
                    <li key={item.text} className={`${t.attnItem} ${i >= 3 && !showAll ? t.attnMore : ''}`}>
                      <Status tone={SEV_TONE[item.severity]} icon={SEV_ICON[item.severity]}>{SEV_LABEL[item.severity]}</Status>
                      <span className={t.attnText}>{item.text}</span>
                      {item.href.startsWith('http') ? (
                        <a href={item.href} target="_blank" rel="noopener noreferrer" className={t.attnOpen}>Aç ↗</a>
                      ) : (
                        <Link href={item.href} className={t.attnOpen}>Aç →</Link>
                      )}
                    </li>
                  ))}
                </ul>
                {attention.length > 3 && (
                  <button type="button" className={`${t.btn} ${t.btnSmall} ${t.attnToggle}`} aria-expanded={showAll} aria-controls="k-attn-list" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? 'Daha az göster' : `Tümünü göster (${attention.length})`}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        <section className={`${t.tile} ${t.span5}`} aria-labelledby="k-visit">
          <div className={t.tileHead}>
            <h2 id="k-visit" className={t.tileTitle}>{VISITOR_TODAY_LABEL}</h2>
            <Link href="/admin/traffic" className={t.tileLink}>Trafik →</Link>
          </div>
          <div>
            <p className={`${t.bigNum} ${t.num}`}>{visitors.value ?? <span className="inline-block h-12 w-24 animate-pulse rounded-md bg-surface" />}</p>
            {visitors.todayNote && <p className={t.note} style={{ marginTop: 8 }}>{visitors.todayNote}</p>}
          </div>
          <div className={t.subMetric}>
            <div className={t.subMetricRow}>
              <span className={t.metricLabel}>{VISITOR_WEEK_LABEL}</span>
              <strong className={t.num}>{visitors.week ?? '–'}</strong>
            </div>
            <p className={t.note}>{visitors.weekNote}</p>
          </div>
          {weekDaily.length > 0 && <MiniWeek days={weekDaily.map((d) => ({ date: d.date, value: d.visitors }))} todayUtc={todayUtc} />}
        </section>
      </div>

      {/* 2 · the week in numbers */}
      <section className={t.kpis} aria-label="Haftanın sayıları">
        <Link href="/admin/submissions" className={t.kpi}>
          <span className={t.kpiLabel}>Yeni lead · 7 gün</span>
          <span className={`${t.kpiValue} ${t.num}`}>{leads ? leads7 : '…'}</span>
          <span className={t.kpiHint}>
            {!leads ? '' : leadDelta !== null ? (
              <><span className={leadDelta >= 0 ? t.up : t.down}><span aria-hidden="true">{leadDelta >= 0 ? '▲' : '▼'}</span> %{Math.abs(leadDelta)}<span className="sr-only">{leadDelta >= 0 ? ' artış' : ' düşüş'}</span></span><span>önceki 7 gün ({leadsPrev7})</span></>
            ) : <span>önceki 7 gün: {leadsPrev7}</span>}
          </span>
        </Link>
        <Link href="/admin/submissions" className={t.kpi}>
          <span className={t.kpiLabel}>Açık lead</span>
          <span className={`${t.kpiValue} ${t.num} ${waiting.length ? t.kpiValueAlert : ''}`}>{leads ? openLeads.length : '…'}</span>
          <span className={t.kpiHint}>{!leads ? '' : waiting.length ? <><span aria-hidden="true">▲</span> {waiting.length} yanıt bekliyor</> : 'bekleyen yok'}</span>
        </Link>
        <Link href="/admin/clients" className={t.kpi}>
          <span className={t.kpiLabel}>Açık fırsat</span>
          <span className={`${t.kpiValue} ${t.num}`}>{crm ? (pipeline.length ? money(pipeline[0].value, pipeline[0].currency) : '–') : '…'}</span>
          <span className={t.kpiHint}>{crm && !crm.ready ? 'CRM kurulmadı' : pipeline.length > 1 ? `+ ${pipeline.slice(1).map((p) => money(p.value, p.currency)).join(' + ')} · ayrı para birimi` : ''}</span>
        </Link>
        <Link href="/admin/sites" className={t.kpi}>
          <span className={t.kpiLabel}>Siteler</span>
          <span className={`${t.kpiValue} ${t.num} ${health && sitesUp + sitesNever < siteList.length ? t.kpiValueAlert : ''}`}>{health ? `${sitesUp}/${siteList.length}` : '…'}</span>
          <span className={t.kpiHint}>{health ? ['çalışıyor', sitesUnchecked ? `${sitesUnchecked} kontrol tamamlanamadı` : '', sitesStale ? `${sitesStale} sonuç güncel değil` : '', sitesNever ? `${sitesNever} henüz kontrol edilmedi` : ''].filter(Boolean).join(' · ') : ''}</span>
        </Link>
        <div className={t.kpi}>
          <span className={t.kpiLabel}>Engellenen spam · 7 gün</span>
          <span className={`${t.kpiValue} ${t.num}`}>{content ? (content.spam7 === null ? '–' : content.spam7) : '…'}</span>
          <span className={t.kpiHint}>kayda geçmeden atıldı</span>
        </div>
      </section>

      {/* 3 · client sites, payments & renewals, tasks */}
      <div className={t.grid}>
        <section className={`${t.tile} ${t.span5} ${t.spanWideLg}`} aria-labelledby="k-sites">
          <div className={t.tileHead}>
            <div>
              <h2 id="k-sites" className={t.tileTitle}>Müşteri siteleri</h2>
              <p className={t.tileSub}>Kayıtlı son sonuçlar · bu ekran sitelere istek göndermez</p>
            </div>
            <Link href="/admin/sites" className={t.tileLink}>Detay →</Link>
          </div>
          {!health ? (
            skeleton(128)
          ) : healthError ? (
            <p className={t.note}>
              Kontrol alınamadı: {healthError}{' '}
              <button type="button" onClick={() => load(true)} className="font-bold text-white underline">Tekrar dene</button>
            </p>
          ) : siteList.length === 0 ? (
            <p className={t.note}>İzlenen site yok. <Link href="/admin/sites" className="underline">Siteler</Link>’den ekleyin.</p>
          ) : (
            <>
              <div className={t.segbar} aria-hidden="true">
                {segs.map((x) => <span key={x.label} style={{ flex: x.n, background: x.color }} />)}
              </div>
              <ul className={t.legend}>
                {segs.map((x) => <li key={x.label}><span aria-hidden="true">{x.icon}</span><b className={t.num}>{x.n}</b> {x.label}</li>)}
              </ul>
              <ul className={t.rows}>
                {siteList.map((st) => (
                  <li key={st.id} className={`${t.row} ${t.siteRow}`}>
                    <span className={t.rowMain}>
                      <span className={t.rowTitle}>{st.name}</span>
                      <span className={t.rowMeta}>{st.url.replace(/^https?:\/\//, '')}</span>
                    </span>
                    <span className={t.rowEnd}>{siteBadge(st)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className={`${t.tile} ${t.span4}`} aria-labelledby="k-renew">
          <div className={t.tileHead}>
            <div>
              <h2 id="k-renew" className={t.tileTitle}>Yaklaşan ödeme ve yenilemeler</h2>
              <p className={t.tileSub}>Operasyon ve Giderler’deki mevcut göstergeler</p>
            </div>
            <Link href="/admin/ops" className={t.tileLink}>Operasyon →</Link>
          </div>
          {!renew ? (
            skeleton(160)
          ) : (
            <>
              {renew.opsError ? (
                <p className={t.note}>Operasyon verisi okunamadı: {renew.opsError}</p>
              ) : renew.ops && renew.ops.live.length === 0 ? (
                <p className={t.note}>Takip edilen aktif hizmet yok.</p>
              ) : renew.ops && (
                <dl className={t.renewRows}>
                  {([7, 30, 90] as const).map((n) => (
                    <div key={n} className={t.renewRow}>
                      <dt><Link href={`/admin/ops/services?within=${n}`} className="hover:text-white hover:underline">{n} gün içinde bitiyor</Link></dt>
                      <dd><strong className={t.num}>{renew.ops!.within[n]}</strong></dd>
                    </div>
                  ))}
                  <div className={t.renewRow}>
                    <dt><Link href="/admin/ops/services?renew=overdue" className="hover:text-white hover:underline">Bitiş tarihi geçti</Link></dt>
                    <dd>{renew.ops.overdue ? <Status tone="bad" icon="✕">{renew.ops.overdue} hizmet</Status> : 'Yok'}</dd>
                  </div>
                  <div className={t.renewRow}>
                    <dt><Link href="/admin/ops/services?renew=awaiting" className="hover:text-white hover:underline">Yenileme doğrulaması bekliyor</Link></dt>
                    <dd>{renew.ops.awaiting ? <Status tone="warn" icon="▲">{renew.ops.awaiting} hizmet</Status> : 'Yok'}</dd>
                  </div>
                </dl>
              )}
              {renew.finError ? (
                <p className={t.note}>Giderler okunamadı: {renew.finError}</p>
              ) : renew.fin && (
                <Link href="/admin/expenses" className={t.renewFin}>
                  <div><span>Giderler · geciken · tüm aylar</span><strong className={t.num}>{renew.fin.overdueCount ? `${formatTotals(renew.fin.overdue)} · ${renew.fin.overdueCount} dönem` : 'Yok'}</strong></div>
                  <div><span>Giderler · bu ay kalan</span><strong className={t.num}>{formatTotals(renew.fin.remaining)}</strong></div>
                </Link>
              )}
              {renew.ops && renew.ops.upcoming.length > 0 && (
                <ul className={t.rows}>
                  {renew.ops.upcoming.slice(0, 3).map((r) => (
                    <li key={r.id} className={t.row}>
                      <Link href={`/admin/ops/services/${r.id}`} className={t.rowMain}>
                        <span className={t.rowTitle}>{r.name}</span>
                        <span className={t.rowMeta}>{KIND_LABEL[r.kind] ?? r.kind}</span>
                      </Link>
                      <span className={`${t.rowEnd} ${r.days <= 7 ? t.dueLate : t.rowMeta}`}>{r.days <= 7 && <span aria-hidden="true">▲</span>}{r.days === 0 ? 'Bugün' : `${r.days} gün kaldı`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className={`${t.tile} ${t.span3}`} aria-labelledby="k-tasks">
          <div className={t.tileHead}>
            <h2 id="k-tasks" className={t.tileTitle}>Yapılacaklar</h2>
            <Link href="/admin/clients" className={t.tileLink}>CRM →</Link>
          </div>
          {!crm ? (
            skeleton(128)
          ) : !crm.ready ? (
            <p className={t.note}>CRM için SQL v8 kurulumu bekleniyor.</p>
          ) : openTasks.length === 0 && lateFollowUps.length === 0 ? (
            <p className={t.note}>Açık görev yok.</p>
          ) : (
            <ul className={t.rows}>
              {openTasks.slice(0, 5).map((task) => {
                const late = Boolean(task.due_on && task.due_on < today());
                return (
                  <li key={task.id} className={t.row}>
                    <Link href={`/admin/clients?id=${task.client_id}`} className={t.rowMain}><span className={t.rowTitle} style={{ whiteSpace: 'normal' }}>{task.body}</span></Link>
                    <span className={`${t.rowEnd} ${t.num} ${late ? t.dueLate : t.rowMeta}`}>{late && <span aria-hidden="true">▲</span>}{task.due_on ? fmtDate(task.due_on, false) : '—'}{late && <span className="sr-only"> (gecikti)</span>}</span>
                  </li>
                );
              })}
              {lateFollowUps.slice(0, 3).map((lead) => (
                <li key={`f-${lead.id}`} className={t.row}>
                  <Link href={`/admin/submissions?status=all&id=${lead.id}`} className={t.rowMain}><span className={t.rowTitle}>Takip: {lead.name}</span></Link>
                  <span className={`${t.rowEnd} ${t.dueLate} ${t.num}`}><span aria-hidden="true">▲</span>{lead.followUpOn ? fmtDate(lead.followUpOn, false) : ''}<span className="sr-only"> (gecikti)</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 4 · traffic + leads */}
      <div className={t.grid}>
        <section className={`${t.tile} ${t.span7}`} aria-labelledby="k-traffic">
          <div className={t.tileHead}>
            <div>
              <h2 id="k-traffic" className={t.tileTitle}>Ziyaretçi · son 30 gün</h2>
              <p className={t.tileSub}>Günlük tekil ziyaretçi · UTC günleri{monthDaily.at(-1)?.date === todayUtc ? ' · son sütun bugün (sürüyor)' : ''}</p>
            </div>
            <Link href="/admin/traffic" className={t.tileLink}>Trafik detayı →</Link>
          </div>
          {month?.configured === false ? (
            <TokenHelp />
          ) : month?.report ? (
            <>
              <Bars data={monthDaily.map((d) => ({ date: d.date, value: d.visitors }))} label="Ziyaretçi" lastIsPartial={monthDaily.at(-1)?.date === todayUtc} />
              <div className={t.twoCol}>
                <div>
                  <p className={t.miniHead}>En çok bakılan</p>
                  <RankList rows={month.report.pages.slice(0, 4).map((p) => ({ label: p.label, value: p.pageviews }))} />
                </div>
                <div>
                  <p className={t.miniHead}>Kaynaklar</p>
                  <RankList rows={month.report.referrers.slice(0, 4).map((r) => ({ label: r.label === '—' ? 'Doğrudan' : r.label, value: r.visitors }))} />
                </div>
              </div>
            </>
          ) : month && !month.ok ? (
            <p className={t.note}>
              Vercel verisi alınamadı: {month.error ?? 'bilinmeyen hata'}{' '}
              <button type="button" onClick={() => load(true)} className="font-bold text-white underline">Tekrar dene</button>
            </p>
          ) : (
            skeleton(176)
          )}
        </section>

        <section className={`${t.tile} ${t.span5}`} aria-labelledby="k-leads">
          <div className={t.tileHead}>
            <h2 id="k-leads" className={t.tileTitle}>Son leadler</h2>
            <Link href="/admin/submissions" className={t.tileLink}>Tümü →</Link>
          </div>
          {!leads ? (
            skeleton(176)
          ) : real.length === 0 ? (
            <p className={t.note}>Henüz lead yok.</p>
          ) : (
            <ul className={t.rows}>
              {real.slice(0, 6).map((lead) => (
                <li key={`${lead.type}:${lead.id}`} className={t.row}>
                  <Link href={`/admin/submissions?status=all&id=${lead.id}`} className={t.rowMain}>
                    <span className={t.rowTitle}>{lead.name || '—'}</span>
                    <span className={t.rowMeta}>{lead.type === 'checkup' ? `Check-Up · skor ${lead.score ?? '–'}` : 'İletişim formu'} · {timeAgo(lead.createdAt)}</span>
                  </Link>
                  <span className={t.rowEnd}><Status tone={LEAD_TONE[lead.status]} icon={LEAD_ICON[lead.status]}>{LEAD_LABEL[lead.status]}</Status></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 5 · site health */}
      <section className={t.tile} aria-labelledby="k-health">
        <div className={t.tileHead}>
          <h2 id="k-health" className={t.tileTitle}>Site sağlığı</h2>
        </div>
        <div className={t.healthGrid}>
          <div className={`${t.healthCell} ${t.healthDeploy}`}>
            <span>Son yayın</span>
            {!health ? (
              <span className="h-4 w-24 animate-pulse rounded-sm bg-surface" />
            ) : latestProd ? (
              <>
                <Status tone={latestProd.state === 'READY' ? 'good' : latestProd.state === 'ERROR' ? 'bad' : 'warn'} icon={latestProd.state === 'READY' ? '●' : latestProd.state === 'ERROR' ? '✕' : '◇'}>
                  {latestProd.state === 'READY' ? 'Yayında' : latestProd.state === 'ERROR' ? 'Hata' : 'Hazırlanıyor'} · {timeAgo(new Date(latestProd.createdAt).toISOString())}
                </Status>
                <small>“{latestProd.message}”</small>
              </>
            ) : (
              <strong>{health.vercelConfigured ? '—' : 'Vercel anahtarı yok'}</strong>
            )}
          </div>
          <Link href="/admin/insights" className={t.healthCell}><span>Taslak / incelemede yazı</span><strong className={t.num}>{content ? content.drafts : '…'}</strong></Link>
          <div className={t.healthCell}><span>Zamanlanmış yazı</span><strong className={t.num}>{content ? content.scheduled : '…'}</strong></div>
          <Link href="/admin/sections" className={t.healthCell}><span>Gizli bölüm</span><strong className={t.num}>{content ? content.hiddenSections : '…'}</strong></Link>
          <Link href="/admin/work" className={t.healthCell}>
            <span>Work projesi</span>
            <strong className={t.num}>{content ? (content.work === null ? '–' : content.work.db - content.work.hidden + content.work.code) : '…'}</strong>
            {content?.work && <small>{content.work.db - content.work.hidden} veritabanı, {content.work.code} kod{content.work.hidden ? `, ${content.work.hidden} gizli` : ''}</small>}
          </Link>
          <Link href="/admin/team" className={t.healthCell}><span>Ekip üyesi</span><strong className={t.num}>{content ? content.team : '…'}</strong></Link>
        </div>
      </section>
    </div>
  );
}

const SEV_TONE: Record<Severity, Tone> = { critical: 'bad', warning: 'warn', neutral: 'muted', good: 'good' };
const SEV_ICON: Record<Severity, string> = { critical: '✕', warning: '▲', neutral: '○', good: '●' };
const SEV_LABEL: Record<Severity, string> = { critical: 'Acil', warning: 'Dikkat', neutral: 'Kurulum', good: 'Tamam' };
const SEV_WORD: Record<Severity, string> = { critical: 'acil', warning: 'dikkat', neutral: 'kurulum', good: 'tamam' };
const ATTN_ORDER: Severity[] = ['critical', 'warning', 'neutral'];
const LEAD_TONE: Record<LeadStatus, Tone> = { new: 'lime', contacted: 'info', proposal: 'warn', won: 'good', lost: 'muted', spam: 'bad' };
const LEAD_ICON: Record<LeadStatus, string> = { new: '✦', contacted: '◇', proposal: '◆', won: '●', lost: '○', spam: '✕' };

/** The figures of the "Yaklaşan ödeme ve yenilemeler" card, read-only (each part fails on its own). */
async function loadRenewals(): Promise<RenewCard> {
  const day = istanbulToday();
  const [ops, fin] = await Promise.all([
    loadOps().catch((e: Error) => ({ ready: false, error: e?.message ?? 'okunamadı' }) as Awaited<ReturnType<typeof loadOps>>),
    loadFinance(45, { roll: false }).catch((e: Error) => ({ ready: false, error: e?.message ?? 'okunamadı' }) as Awaited<ReturnType<typeof loadFinance>>),
  ]);
  return {
    ops: ops.ready ? renewalStats(ops, day) : null,
    opsError: ops.ready ? null : ops.error ?? 'Operasyon verisi okunamadı.',
    fin: fin.ready ? overview(buildItems({ ...fin, today: day }), day) : null,
    finError: fin.ready ? null : fin.error ?? 'Giderler okunamadı.',
  };
}

/** Last 7 UTC days as Vercel returned them (a missing day is not drawn as zero). */
function MiniWeek({ days, todayUtc }: { days: Array<{ date: string; value: number }>; todayUtc: string }) {
  const max = Math.max(1, ...days.map((d) => d.value));
  const wd = (iso: string) => new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  return (
    <figure className={t.miniBars} style={{ margin: 0 }}>
      <div className={t.miniBarsRow} aria-hidden="true">
        {days.map((d) => (
          <div key={d.date} className={`${t.miniBar} ${d.date === todayUtc ? t.miniBarToday : ''}`}>
            <i style={{ height: `${Math.max(4, (d.value / max) * 64)}px` }} />
            <span>{d.date === todayUtc ? 'Bugün' : wd(d.date)}</span>
          </div>
        ))}
      </div>
      <figcaption className={t.note}>Günlük ziyaretçi · son 7 gün (UTC) · günler toplanınca dönem toplamı çıkmaz</figcaption>
      <table className="sr-only"><caption>Günlük ziyaretçi, son 7 gün</caption><tbody>{days.map((d) => <tr key={d.date}><th scope="row">{d.date}</th><td>{d.value}</td></tr>)}</tbody></table>
    </figure>
  );
}

function RankList({ rows }: { rows: Array<{ label: string; value: number }> }) {
  if (rows.length === 0) return <p className={t.note}>Veri yok.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className={t.rank}>
      {rows.map((r) => (
        <li key={r.label}>
          <div className={t.rankRow}><span title={r.label}>{r.label}</span><span className={t.num}>{fmtNumber(r.value)}</span></div>
          <div className={t.rankTrack} aria-hidden="true"><div className={t.rankFill} style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

async function loadContent(): Promise<ContentStats> {
  const supabase = getAdminClient();
  const empty: ContentStats = { drafts: 0, scheduled: 0, hiddenSections: 0, work: null, team: 0, spam7: null };
  if (!supabase) return empty;
  const count = async (table: string, filter?: (q: any) => any): Promise<number | null> => {
    try {
      let query = supabase.from(table).select('*', { count: 'exact', head: true });
      if (filter) query = filter(query);
      const { count: value, error } = await query;
      return error ? null : value ?? 0;
    } catch {
      return null;
    }
  };
  const workCount = async (): Promise<ContentStats['work']> => {
    try {
      const { data, error } = await supabase.from('case_studies').select('id,slug,is_active,order_index');
      if (error || !data) return null;
      const rows = data as Array<{ id: number; slug: string; is_active: boolean; order_index: number }>;
      const code = mergeWorkSources(rows, { includeHidden: true }).filter((entry) => entry.source === 'code').length;
      return { db: rows.length, code, hidden: rows.filter((row) => !row.is_active).length };
    } catch {
      return null;
    }
  };
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [drafts, scheduled, hiddenSections, work, team, spam7] = await Promise.all([
    count('insights', (q) => q.in('status', ['DRAFT', 'IN_REVIEW'])),
    count('insights', (q) => q.eq('status', 'SCHEDULED')),
    count('sections', (q) => q.eq('is_active', false)),
    workCount(),
    count('team_members'),
    count('spam_log', (q) => q.gte('created_at', since)),
  ]);
  return { drafts: drafts ?? 0, scheduled: scheduled ?? 0, hiddenSections: hiddenSections ?? 0, work, team: team ?? 0, spam7 };
}
