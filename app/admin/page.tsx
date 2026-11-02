'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import { Card, CardLink, DailyBars, StatTile, StatusBadge } from '@/components/admin/cockpit/Widgets';
import { TokenHelp } from '@/components/admin/cockpit/TokenHelp';
import { LEAD_LABEL, LEAD_PILL, OPEN_STATUSES, adminApi, delta, fmtDate, fmtNumber, timeAgo } from '@/lib/cockpit/client';
import { loadLeads, type Lead } from '@/lib/cockpit/leads';
import { loadCrm, money, pipelineByCurrency, type CrmData } from '@/lib/cockpit/crm';
import { siteIssues, type HealthResponse, type Severity } from '@/lib/cockpit/sites';
import type { TrafficReport } from '@/lib/cockpit/vercel';

/**
 * Yoca Admin — Kokpit.
 * One screen: what needs attention now, the week in numbers, traffic,
 * leads, client sites, tasks and site health. Every block degrades
 * gracefully (missing SQL v8, missing Vercel token) and says how to fix it.
 */

type TrafficResponse = { ok: boolean; configured?: boolean; report?: TrafficReport; error?: string };

interface ContentStats {
  drafts: number;
  scheduled: number;
  hiddenSections: number;
  work: number;
  team: number;
  spam7: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const DAY = 86_400_000;

export default function Cockpit() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [leadsReady, setLeadsReady] = useState(true);
  const [crm, setCrm] = useState<CrmData | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [week, setWeek] = useState<TrafficResponse | null>(null);
  const [month, setMonth] = useState<TrafficResponse | null>(null);
  const [content, setContent] = useState<ContentStats | null>(null);

  const load = (fresh = false) => {
    const q = fresh ? '&refresh=1' : '';
    loadLeads().then((r) => {
      setLeads(r.leads);
      setLeadsReady(r.schemaReady);
    });
    loadCrm().then(setCrm);
    adminApi<HealthResponse>(`/api/admin/health${fresh ? '?refresh=1' : ''}`).then(setHealth).catch(() => null);
    adminApi<TrafficResponse>(`/api/admin/traffic?days=7${q}`).then(setWeek).catch(() => null);
    adminApi<TrafficResponse>(`/api/admin/traffic?days=30${q}`).then(setMonth).catch(() => null);
    loadContent().then(setContent);
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
  const report = week?.report;
  const checks = health?.checks ?? [];
  const sitesUp = checks.filter((c) => c.state === 'up' || c.state === 'slow').length;
  const latestProd = health?.deployments?.find((d) => d.target === 'production') ?? null;

  // ── Attention list ───────────────────────────────────────────
  const attention: Array<{ severity: Severity; text: string; href: string }> = [];
  for (const check of checks) for (const issue of siteIssues(check)) attention.push({ severity: issue.severity, text: `${check.name}: ${issue.text}`, href: '/admin/sites' });
  if (latestProd && latestProd.state === 'ERROR') attention.push({ severity: 'critical', text: `Son yayın başarısız: “${latestProd.message}”`, href: 'https://vercel.com/mgs-projects-8dc47200/yoca-web' });
  if (waiting.length) attention.push({ severity: 'warning', text: `${waiting.length} lead 24 saatten uzun süredir yanıt bekliyor`, href: '/admin/submissions?status=new' });
  if (lateFollowUps.length) attention.push({ severity: 'warning', text: `${lateFollowUps.length} lead için takip tarihi geçti`, href: '/admin/submissions' });
  if (lateTasks.length) attention.push({ severity: 'warning', text: `${lateTasks.length} görevin tarihi geçti`, href: '/admin/clients' });
  if (leads && !leadsReady) attention.push({ severity: 'neutral', text: 'Kokpit veritabanı kurulumu bekliyor (SQL v8) — lead durumu, CRM ve spam kaydı için', href: '/admin/submissions' });
  if (week && week.configured === false) attention.push({ severity: 'neutral', text: 'Trafik için Vercel anahtarı eklenmedi', href: '/admin/traffic' });
  const order: Record<Severity, number> = { critical: 0, warning: 1, neutral: 2, good: 3 };
  attention.sort((a, b) => order[a.severity] - order[b.severity]);
  const loadingAll = !leads || !health;

  const greeting = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' }).format(new Date());

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">{greeting}</p>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">Kokpit</h1>
        </div>
        <button type="button" onClick={() => load(true)} className="admin-btn">
          ↻ Yenile
        </button>
      </header>

      {/* What needs attention now */}
      <Card title="Şimdi ilgilenilmesi gerekenler">
        {loadingAll ? (
          <div className="h-10 animate-pulse rounded-sm bg-surface" />
        ) : attention.length === 0 ? (
          <p className="flex items-center gap-2 text-[14px] text-soft">
            <StatusBadge kind="good">Her şey yolunda</StatusBadge> Siteler çalışıyor, bekleyen lead ya da geciken iş yok.
          </p>
        ) : (
          <ul className="grid gap-2">
            {attention.map((item) => (
              <li key={item.text} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5 text-[14px] text-soft">
                  <StatusBadge kind={item.severity}>{{ critical: 'Acil', warning: 'Dikkat', neutral: 'Kurulum', good: 'Tamam' }[item.severity]}</StatusBadge>
                  <span className="min-w-0">{item.text}</span>
                </span>
                {item.href.startsWith('http') ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className="flex-none text-[12px] font-bold text-subtle hover:text-yoca-lime">
                    Aç ↗
                  </a>
                ) : (
                  <Link href={item.href} className="flex-none text-[12px] font-bold text-subtle hover:text-yoca-lime">
                    Aç →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* The week in numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Ziyaretçi · 7 gün" value={week ? (report ? fmtNumber(report.totals.visitors) : '–') : null} deltaPct={report ? delta(report.totals.visitors, report.previous.visitors) : null} deltaLabel="önceki 7 gün" href="/admin/traffic" />
        <StatTile label="Yeni lead · 7 gün" value={leads ? String(leads7) : null} deltaPct={leads ? delta(leads7, leadsPrev7) : null} deltaLabel="önceki 7 gün" hint={leads && !delta(leads7, leadsPrev7) ? `önceki 7 gün: ${leadsPrev7}` : undefined} href="/admin/submissions" />
        <StatTile label="Açık lead" value={leads ? String(openLeads.length) : null} hint={waiting.length ? `${waiting.length} yanıt bekliyor` : 'bekleyen yok'} tone={waiting.length ? 'alert' : 'default'} href="/admin/submissions" />
        <StatTile label="Açık fırsat" value={crm ? (pipeline.length ? money(pipeline[0].value, pipeline[0].currency) : '–') : null} hint={crm && !crm.ready ? 'CRM kurulmadı' : pipeline.length > 1 ? `+ ${pipeline.slice(1).map((p) => money(p.value, p.currency)).join(' + ')}` : undefined} href="/admin/clients" />
        <StatTile label="Siteler" value={health ? `${sitesUp}/${checks.length}` : null} hint="çalışıyor" tone={health && sitesUp < checks.length ? 'alert' : 'default'} href="/admin/sites" />
        <StatTile label="Engellenen spam · 7 gün" value={content ? (content.spam7 === null ? '–' : String(content.spam7)) : null} hint="kayda geçmeden atıldı" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Traffic */}
        <Card title="Ziyaretçi · son 30 gün" action={<CardLink href="/admin/traffic">Trafik detayı</CardLink>}>
          {month?.configured === false ? (
            <TokenHelp />
          ) : month?.report ? (
            <>
              <DailyBars data={month.report.daily.map((d) => ({ date: d.date, value: d.visitors }))} label="Ziyaretçi" />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[12px] font-bold text-subtle">En çok bakılan</p>
                  <ul className="grid gap-1 text-[13px]">
                    {month.report.pages.slice(0, 4).map((p) => (
                      <li key={p.label} className="flex justify-between gap-3">
                        <span className="truncate text-soft">{p.label}</span>
                        <span className="font-bold tabular-nums">{fmtNumber(p.pageviews)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-[12px] font-bold text-subtle">Kaynaklar</p>
                  <ul className="grid gap-1 text-[13px]">
                    {month.report.referrers.slice(0, 4).map((r) => (
                      <li key={r.label} className="flex justify-between gap-3">
                        <span className="truncate text-soft">{r.label === '—' ? 'Doğrudan' : r.label}</span>
                        <span className="font-bold tabular-nums">{fmtNumber(r.visitors)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : month && !month.ok ? (
            <p className="text-[13px] text-subtle">Vercel verisi alınamadı: {month.error}</p>
          ) : (
            <div className="h-44 animate-pulse rounded-sm bg-surface" />
          )}
        </Card>

        {/* Leads */}
        <Card title="Son leadler" action={<CardLink href="/admin/submissions">Tümü</CardLink>}>
          {!leads ? (
            <div className="h-44 animate-pulse rounded-sm bg-surface" />
          ) : real.length === 0 ? (
            <p className="text-[13px] text-subtle">Henüz lead yok.</p>
          ) : (
            <ul className="grid gap-2.5">
              {real.slice(0, 6).map((lead) => (
                <li key={`${lead.type}:${lead.id}`}>
                  <Link href={`/admin/submissions?status=all&id=${lead.id}`} className="flex items-center justify-between gap-3 rounded-sm px-1 py-0.5 hover:bg-surface">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-bold">{lead.name || '—'}</span>
                      <span className="block truncate text-[12px] text-subtle">
                        {lead.type === 'checkup' ? `Check-Up · skor ${lead.score ?? '–'}` : 'İletişim formu'} · {timeAgo(lead.createdAt)}
                      </span>
                    </span>
                    <span className={`flex-none rounded-sm border px-2 py-0.5 text-[11px] font-bold ${LEAD_PILL[lead.status]}`}>{LEAD_LABEL[lead.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Client sites */}
        <Card title="Müşteri siteleri" action={<CardLink href="/admin/sites">Detay</CardLink>}>
          {!health ? (
            <div className="h-32 animate-pulse rounded-sm bg-surface" />
          ) : (
            <ul className="grid gap-2">
              {checks.map((c) => {
                const issues = siteIssues(c);
                const worst = issues[0];
                return (
                  <li key={c.url} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-bold">{c.name}</span>
                    {worst ? (
                      <StatusBadge kind={worst.severity}>{worst.text.length > 28 ? `${worst.text.slice(0, 27)}…` : worst.text}</StatusBadge>
                    ) : (
                      <StatusBadge kind="good">Çalışıyor{c.ms !== null ? ` · ${(c.ms / 1000).toFixed(1)} sn` : ''}</StatusBadge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Tasks */}
        <Card title="Yapılacaklar" action={<CardLink href="/admin/clients">CRM</CardLink>}>
          {!crm ? (
            <div className="h-32 animate-pulse rounded-sm bg-surface" />
          ) : !crm.ready ? (
            <p className="text-[13px] text-subtle">CRM için SQL v8 kurulumu bekleniyor.</p>
          ) : openTasks.length === 0 && lateFollowUps.length === 0 ? (
            <p className="text-[13px] text-subtle">Açık görev yok.</p>
          ) : (
            <ul className="grid gap-2 text-[13px]">
              {openTasks.slice(0, 5).map((task) => (
                <li key={task.id} className="flex justify-between gap-3">
                  <Link href={`/admin/clients?id=${task.client_id}`} className="min-w-0 truncate text-soft hover:text-white">
                    {task.body}
                  </Link>
                  <span className={`flex-none tabular-nums ${task.due_on && task.due_on < today() ? 'font-bold text-amber-300' : 'text-subtle'}`}>{task.due_on ? fmtDate(task.due_on, false) : '—'}</span>
                </li>
              ))}
              {lateFollowUps.slice(0, 3).map((lead) => (
                <li key={`f-${lead.id}`} className="flex justify-between gap-3">
                  <Link href={`/admin/submissions?status=all&id=${lead.id}`} className="min-w-0 truncate text-soft hover:text-white">
                    Takip: {lead.name}
                  </Link>
                  <span className="flex-none font-bold tabular-nums text-amber-300">{lead.followUpOn ? fmtDate(lead.followUpOn, false) : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Site health */}
        <Card title="Site sağlığı">
          <ul className="grid gap-2 text-[13px]">
            <li className="flex items-center justify-between gap-3">
              <span className="text-subtle">Son yayın</span>
              {!health ? (
                <span className="h-4 w-24 animate-pulse rounded-sm bg-surface" />
              ) : latestProd ? (
                <StatusBadge kind={latestProd.state === 'READY' ? 'good' : latestProd.state === 'ERROR' ? 'critical' : 'warning'}>
                  {latestProd.state === 'READY' ? 'Yayında' : latestProd.state === 'ERROR' ? 'Hata' : 'Hazırlanıyor'} · {timeAgo(new Date(latestProd.createdAt).toISOString())}
                </StatusBadge>
              ) : (
                <span className="text-subtle">{health.vercelConfigured ? '—' : 'Vercel anahtarı yok'}</span>
              )}
            </li>
            {latestProd && <li className="truncate text-[12px] text-subtle">“{latestProd.message}”</li>}
            <li className="flex justify-between gap-3">
              <span className="text-subtle">Taslak / incelemede yazı</span>
              <Link href="/admin/insights" className="font-bold hover:text-yoca-lime">
                {content ? content.drafts : '…'}
              </Link>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-subtle">Zamanlanmış yazı</span>
              <span className="font-bold">{content ? content.scheduled : '…'}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-subtle">Gizli bölüm</span>
              <Link href="/admin/sections" className="font-bold hover:text-yoca-lime">
                {content ? content.hiddenSections : '…'}
              </Link>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-subtle">Work projesi</span>
              <Link href="/admin/work" className="font-bold hover:text-yoca-lime">
                {content ? (content.work || '4 (koddan)') : '…'}
              </Link>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-subtle">Ekip üyesi</span>
              <Link href="/admin/team" className="font-bold hover:text-yoca-lime">
                {content ? content.team : '…'}
              </Link>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

async function loadContent(): Promise<ContentStats> {
  const supabase = getAdminClient();
  const empty = { drafts: 0, scheduled: 0, hiddenSections: 0, work: 0, team: 0, spam7: null };
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
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [drafts, scheduled, hiddenSections, work, team, spam7] = await Promise.all([
    count('insights', (q) => q.in('status', ['DRAFT', 'IN_REVIEW'])),
    count('insights', (q) => q.eq('status', 'SCHEDULED')),
    count('sections', (q) => q.eq('is_active', false)),
    count('case_studies'),
    count('team_members'),
    count('spam_log', (q) => q.gte('created_at', since)),
  ]);
  return { drafts: drafts ?? 0, scheduled: scheduled ?? 0, hiddenSections: hiddenSections ?? 0, work: work ?? 0, team: team ?? 0, spam7 };
}
