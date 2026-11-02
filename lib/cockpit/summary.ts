import { checkSites, DEFAULT_SITES, type MonitoredSite } from '@/lib/cockpit/monitor';
import { siteIssues } from '@/lib/cockpit/issues';
import { istanbulDate } from '@/lib/cockpit/settings';
import { trafficReport, vercelConfigured } from '@/lib/cockpit/vercel';
import { escapeHtml } from '@/lib/notify';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca cockpit — morning summary (server only).
 * What needs attention today, in one message: new leads, follow-ups and
 * tasks due, leads waiting for a reply, site problems and renewals,
 * yesterday's traffic and blocked spam.
 */

type Row = Record<string, unknown>;

interface SummaryLead {
  id: string;
  type: 'contact' | 'checkup';
  name: string;
  company: string;
  status: string;
  followUpOn: string | null;
  createdAt: string;
  score: number | null;
  fit: number | null;
}

const OPEN = ['new', 'contacted', 'proposal'];
const SITE = 'https://yoca.net';

function toLead(row: Row, type: 'contact' | 'checkup'): SummaryLead {
  const info = (type === 'checkup' ? row.contact_info_json : row) as Row;
  const ai = (row.ai_summary ?? null) as { uygunluk?: number } | null;
  return {
    id: String(row.id),
    type,
    name: String(info?.name ?? ''),
    company: String(info?.company ?? ''),
    status: String(row.status ?? 'new'),
    followUpOn: (row.follow_up_on as string | null) ?? null,
    createdAt: String(row.created_at),
    score: type === 'checkup' && typeof info?.score === 'number' ? (info.score as number) : null,
    fit: typeof ai?.uygunluk === 'number' ? ai.uygunluk : null,
  };
}

function who(lead: SummaryLead): string {
  const parts = [lead.name || '—', lead.company].filter(Boolean).join(' · ');
  const tags = [lead.type === 'checkup' ? `Check-Up ${lead.score ?? '–'}/100` : 'Form', lead.fit ? `uygunluk ${lead.fit}/5` : ''].filter(Boolean).join(', ');
  return `${parts} (${tags})`;
}

export interface MorningSummary {
  subject: string;
  heading: string;
  html: string;
  telegram: string;
  counts: { newLeads: number; due: number; waiting: number; siteIssues: number };
}

export async function buildMorningSummary(now = Date.now()): Promise<MorningSummary> {
  const supabase = getSupabaseAdmin();
  const today = istanbulDate(0, now);
  const dayAgo = new Date(now - 86_400_000).toISOString();

  const [contacts, checkups, tasks, spam, sitesRes] = supabase
    ? await Promise.all([
        supabase.from('contact_submissions').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('checkup_submissions').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('activities').select('id,body,due_on,client_id,clients(name)').eq('kind', 'task').eq('done', false).lte('due_on', today).order('due_on'),
        supabase.from('spam_log').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
        supabase.from('monitored_sites').select('id,name,url,expects_signature,hosting_renews_on').eq('is_active', true).order('order_index'),
      ])
    : [null, null, null, null, null];

  const leads = [
    ...(((contacts?.data as Row[]) ?? []).map((r) => toLead(r, 'contact'))),
    ...(((checkups?.data as Row[]) ?? []).map((r) => toLead(r, 'checkup'))),
  ].filter((l) => l.status !== 'spam');

  const fresh = leads.filter((l) => l.createdAt >= dayAgo);
  const due = leads.filter((l) => OPEN.includes(l.status) && l.followUpOn && l.followUpOn <= today);
  const waiting = leads.filter((l) => l.status === 'new' && Date.parse(l.createdAt) < now - 86_400_000);
  const dueTasks = ((tasks?.data as Row[]) ?? []).map((t) => ({
    body: String(t.body ?? ''),
    dueOn: String(t.due_on ?? ''),
    client: String(((t.clients as Row | null)?.name as string) ?? ''),
  }));

  const sites = (sitesRes?.data as MonitoredSite[] | undefined)?.length ? (sitesRes!.data as MonitoredSite[]) : DEFAULT_SITES;
  const checks = await checkSites(sites);
  const issues = checks.flatMap((c) => siteIssues(c).filter((i) => i.severity !== 'good').map((i) => ({ site: c.name, ...i })));

  let traffic: { yesterday: { visitors: number; pageviews: number } | null; week: number; prev: number } | null = null;
  if (vercelConfigured()) {
    try {
      const report = await trafficReport(7);
      const yesterday = istanbulDate(-1, now);
      const day = report.daily.find((d) => d.date === yesterday) ?? null;
      traffic = { yesterday: day, week: report.totals.visitors, prev: report.previous.visitors };
    } catch {
      traffic = null;
    }
  }

  const spamCount = spam?.count ?? 0;
  const counts = { newLeads: fresh.length, due: due.length + dueTasks.length, waiting: waiting.length, siteIssues: issues.length };

  // ── Sections (plain lines; rendered for e-mail and Telegram) ──
  const sections: Array<{ title: string; lines: string[]; empty?: string }> = [
    { title: `Yeni leadler (son 24 saat): ${fresh.length}`, lines: fresh.slice(0, 8).map(who), empty: 'Yeni lead yok.' },
    {
      title: `Bugün takip: ${due.length + dueTasks.length}`,
      lines: [
        ...due.map((l) => `${who(l)} — takip ${l.followUpOn! < today ? `gecikti (${l.followUpOn})` : 'bugün'}`),
        ...dueTasks.map((t) => `Görev: ${t.body}${t.client ? ` (${t.client})` : ''}${t.dueOn < today ? ` — gecikti (${t.dueOn})` : ''}`),
      ],
      empty: 'Bugüne planlı takip veya görev yok.',
    },
    ...(waiting.length ? [{ title: `Yanıt bekleyen: ${waiting.length}`, lines: waiting.slice(0, 5).map(who) }] : []),
    {
      title: `Siteler: ${issues.length ? `${issues.length} uyarı` : 'sorun yok'}`,
      lines: issues.map((i) => `${i.severity === 'critical' ? '🔴' : '🟠'} ${i.site}: ${i.text}`),
      empty: `${checks.length} sitenin hepsi çalışıyor.`,
    },
    ...(traffic
      ? [
          {
            title: 'Trafik',
            lines: [
              traffic.yesterday ? `Dün: ${traffic.yesterday.visitors} ziyaretçi, ${traffic.yesterday.pageviews} görüntüleme` : 'Dün: veri yok',
              `Son 7 gün: ${traffic.week} ziyaretçi (önceki 7 gün: ${traffic.prev})`,
            ],
          },
        ]
      : []),
    { title: `Engellenen spam (24 saat): ${spamCount}`, lines: [] },
  ];

  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' }).format(now);
  const headline = [
    fresh.length ? `${fresh.length} yeni lead` : null,
    counts.due ? `${counts.due} takip` : null,
    issues.length ? `${issues.length} site uyarısı` : null,
  ].filter(Boolean);
  const subject = `Günaydın — ${headline.length ? headline.join(', ') : 'sakin bir gün'} (${date})`;

  const html =
    sections
      .map(
        (s) =>
          `<p style="margin:18px 0 6px 0;"><strong style="color:#ffffff;">${escapeHtml(s.title)}</strong></p>` +
          (s.lines.length
            ? `<ul style="margin:0;padding-left:18px;">${s.lines.map((l) => `<li style="margin:0 0 4px 0;">${escapeHtml(l)}</li>`).join('')}</ul>`
            : s.empty
              ? `<p style="margin:0;">${escapeHtml(s.empty)}</p>`
              : ''),
      )
      .join('') +
    `<p style="margin:22px 0 0 0;"><a href="${SITE}/admin" style="display:inline-block;background:#A2FF00;color:#000000;font-weight:bold;text-decoration:none;padding:10px 16px;border-radius:4px;">Kokpiti aç</a></p>`;

  const telegram =
    `☀️ <b>Günaydın</b> — ${escapeHtml(date)}\n\n` +
    sections
      .map((s) => `<b>${escapeHtml(s.title)}</b>${s.lines.length ? `\n${s.lines.slice(0, 8).map((l) => `• ${escapeHtml(l)}`).join('\n')}` : s.empty ? `\n${escapeHtml(s.empty)}` : ''}`)
      .join('\n\n') +
    `\n\n<a href="${SITE}/admin">Kokpiti aç</a>`;

  return { subject, heading: `Günaydın — ${date}`, html, telegram, counts };
}
