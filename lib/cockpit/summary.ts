import { checkSites, DEFAULT_SITES, type MonitoredSite } from '@/lib/cockpit/monitor';
import { siteIssues } from '@/lib/cockpit/issues';
import { istanbulDate } from '@/lib/cockpit/settings';
import { trafficReport, vercelConfigured } from '@/lib/cockpit/vercel';
import { escapeHtml } from '@/lib/notify';
import { buttons, emailLayout, emptyLine, kicker, section, stats, statusList, title, type TelegramButton, type Tone } from '@/lib/notifyTemplates';
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
  /** Full e-mail document. */
  email: string;
  telegram: string;
  keyboard: TelegramButton[][];
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

  // ── Sections: one list for e-mail (status rows) and Telegram (bullets) ──
  type Line = { tone: Tone; title: string; detail?: string; href?: string };
  const leadLine = (l: SummaryLead, detail?: string): Line => ({
    tone: l.type === 'checkup' ? 'lime' : 'green',
    title: [l.name || '—', l.company].filter(Boolean).join(' · '),
    detail: [l.type === 'checkup' ? `Check-Up ${l.score ?? '–'}/100` : 'Proje formu', l.fit ? `uygunluk ${l.fit}/5` : '', detail ?? ''].filter(Boolean).join(' · '),
    href: `${SITE}/admin/submissions?id=${encodeURIComponent(l.id)}`,
  });
  const sections: Array<{ title: string; note?: string; lines: Line[]; empty?: string; icon: string }> = [
    { icon: '✉️', title: 'Yeni leadler', note: 'son 24 saat', lines: fresh.slice(0, 8).map((l) => leadLine(l)), empty: 'Yeni lead yok.' },
    {
      icon: '📌',
      title: 'Bugün takip',
      lines: [
        ...due.map((l) => leadLine(l, l.followUpOn! < today ? `takip gecikti (${l.followUpOn})` : 'takip bugün')),
        ...dueTasks.map((t): Line => ({
          tone: t.dueOn < today ? 'red' : 'amber',
          title: t.body,
          detail: [t.client, t.dueOn < today ? `gecikti (${t.dueOn})` : 'bugün'].filter(Boolean).join(' · '),
          href: `${SITE}/admin/clients`,
        })),
      ],
      empty: 'Bugüne planlı takip veya görev yok.',
    },
    ...(waiting.length ? [{ icon: '⏳', title: 'Yanıt bekleyen', note: '24 saatten eski', lines: waiting.slice(0, 5).map((l) => leadLine(l)) }] : []),
    {
      icon: '🌐',
      title: 'Siteler',
      lines: issues.map((i): Line => ({ tone: i.severity === 'critical' ? 'red' : 'amber', title: i.site, detail: i.text, href: `${SITE}/admin/sites` })),
      empty: `${checks.length} sitenin hepsi çalışıyor.`,
    },
    ...(traffic
      ? [
          {
            icon: '📈',
            title: 'Trafik',
            lines: [
              // Vercel counts whole UTC days: "Dün" is the UTC day with yesterday's date (03:00–03:00 Istanbul); calculation unchanged
              {
                tone: 'muted' as Tone,
                title: traffic.yesterday ? `Dün (UTC) ${traffic.yesterday.visitors} ziyaretçi` : 'Dün (UTC): veri yok',
                detail: [traffic.yesterday ? `${traffic.yesterday.pageviews} sayfa görüntüleme` : '', 'UTC günü: Türkiye saatiyle 03:00–03:00'].filter(Boolean).join(' · '),
              },
              {
                tone: (traffic.week >= traffic.prev ? 'green' : 'amber') as Tone,
                title: `Son 7 gün (UTC, bugün dahil) ${traffic.week} ziyaretçi`,
                detail: `önceki 7 gün ${traffic.prev}${traffic.prev ? ` · ${traffic.week >= traffic.prev ? '+' : ''}${Math.round(((traffic.week - traffic.prev) / traffic.prev) * 100)}%` : ''}`,
              },
            ],
          },
        ]
      : []),
  ];

  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' }).format(now);
  const headline = [
    fresh.length ? `${fresh.length} yeni lead` : null,
    counts.due ? `${counts.due} takip` : null,
    issues.length ? `${issues.length} site uyarısı` : null,
  ].filter(Boolean);
  const subject = `Günaydın — ${headline.length ? headline.join(', ') : 'sakin bir gün'} (${date})`;

  const email = emailLayout({
    preheader: headline.length ? `Bugün: ${headline.join(', ')}.` : 'Bugün sakin görünüyor.',
    label: 'Sabah özeti',
    body:
      kicker(`Sabah özeti · ${date}`) +
      title(headline.length ? 'Bugün seni bekleyenler' : 'Sakin bir gün') +
      stats([
        { label: 'Yeni lead', value: fresh.length, tone: fresh.length ? 'lime' : 'muted' },
        { label: 'Takip', value: counts.due, tone: counts.due ? 'amber' : 'muted' },
        { label: 'Yanıt bekleyen', value: waiting.length, tone: waiting.length ? 'amber' : 'muted' },
        { label: 'Site uyarısı', value: issues.length, tone: issues.length ? 'red' : 'muted' },
      ]) +
      sections.map((sec) => section(sec.title, sec.lines.length ? statusList(sec.lines) : emptyLine(sec.empty ?? ''), sec.note)).join('') +
      (spamCount ? emptyLine(`Son 24 saatte ${spamCount} spam mesaj engellendi.`) : '') +
      `<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>` +
      buttons([{ label: 'Kokpiti aç', href: `${SITE}/admin`, primary: true }, { label: 'Leadler', href: `${SITE}/admin/submissions` }]),
  });

  const telegram =
    `☀️ <b>GÜNAYDIN</b>  ·  ${escapeHtml(date)}\n━━━━━━━━━━━━━━\n` +
    `✉️ <b>${fresh.length}</b> yeni   📌 <b>${counts.due}</b> takip   ⏳ <b>${waiting.length}</b> bekleyen   🌐 <b>${issues.length}</b> uyarı\n\n` +
    sections
      .map(
        (sec) =>
          `${sec.icon} <b>${escapeHtml(sec.title)}</b>${sec.note ? ` <i>· ${escapeHtml(sec.note)}</i>` : ''}\n` +
          (sec.lines.length
            ? sec.lines.slice(0, 6).map((l) => `   • ${escapeHtml(l.title)}${l.detail ? ` — <i>${escapeHtml(l.detail)}</i>` : ''}`).join('\n')
            : `   <i>${escapeHtml(sec.empty ?? '')}</i>`),
      )
      .join('\n\n') +
    (spamCount ? `\n\n🛡 <i>${spamCount} spam engellendi</i>` : '');
  const keyboard: TelegramButton[][] = [[{ text: 'Kokpiti aç →', url: `${SITE}/admin` }, { text: 'Leadler', url: `${SITE}/admin/submissions` }]];

  return { subject, heading: `Günaydın — ${date}`, email, telegram, keyboard, counts };
}
