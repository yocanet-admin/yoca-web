/**
 * Yoca — Vercel data for the admin cockpit (server only).
 * Web Analytics (official query API) + recent deployments.
 *
 * Env:
 *   VERCEL_API_TOKEN   access token created in Vercel → Account Settings → Tokens
 *                      (scope: the team that owns the project). Never exposed to the browser.
 *   VERCEL_ANALYTICS_PROJECT_ID  optional — defaults to the yoca-web project
 *   VERCEL_ANALYTICS_TEAM_ID     optional — defaults to the yoca-web team
 * Date ranges: `until` behaves as exclusive at day granularity, so "today"
 * is covered by passing tomorrow's date.
 */

const API = 'https://api.vercel.com';
const PROJECT_ID = process.env.VERCEL_ANALYTICS_PROJECT_ID || 'prj_CGGe1EWekeeimazf4cvUePxc6Zu7';
const TEAM_ID = process.env.VERCEL_ANALYTICS_TEAM_ID || 'team_QMaMcqDL6i74ZhEUmACEAAVI';

export function vercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN);
}

type Query = Record<string, string | number | string[] | undefined>;

async function get<T>(path: string, query: Query): Promise<T> {
  const url = new URL(API + path);
  url.searchParams.set('teamId', TEAM_ID);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
    else url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Vercel ${response.status}: ${text.slice(0, 160)}`);
  }
  return (await response.json()) as T;
}

// ── Web Analytics ─────────────────────────────────────────────────

interface Visits {
  pageviews: number;
  visitors: number;
}
interface CountResponse {
  data: Visits;
}
interface AggregateResponse<T> {
  data: Array<T & Visits>;
}

export interface TrafficReport {
  range: { days: number; since: string; until: string };
  totals: Visits;
  previous: Visits;
  daily: Array<{ date: string } & Visits>;
  pages: Array<{ label: string } & Visits>;
  referrers: Array<{ label: string } & Visits>;
  countries: Array<{ label: string } & Visits>;
  devices: Array<{ label: string } & Visits>;
  events: Array<{ name: string; count: number; visitors: number }>;
  /** "Built by YOCA" signature visits per client site (signature_visit event). */
  signatures: Array<{ label: string; count: number; visitors: number }>;
}

function day(offset: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Conversion events sent with track() from the public site. */
export const CONVERSION_EVENTS = ['cta_click', 'checkup_start', 'checkup_submit', 'contact_submit'] as const;

export async function trafficReport(days: number): Promise<TrafficReport> {
  // `until` is inclusive and day-granular: tomorrow (UTC) covers today.
  const since = day(-(days - 1));
  const until = day(1);
  const prevSince = day(-(2 * days - 1));
  const prevUntil = since;
  const base = { projectId: PROJECT_ID, since, until };
  const top = (by: string, limit = 8) =>
    get<AggregateResponse<Record<string, string>>>('/v1/query/web-analytics/visits/aggregate', { ...base, by: [by], limit });

  const [totals, previous, daily, pages, referrers, countries, devices, events, signatures] = await Promise.all([
    get<CountResponse>('/v1/query/web-analytics/visits/count', base),
    get<CountResponse>('/v1/query/web-analytics/visits/count', { projectId: PROJECT_ID, since: prevSince, until: prevUntil }),
    get<AggregateResponse<{ timestamp: string }>>('/v1/query/web-analytics/visits/aggregate', { ...base, by: ['day'] }),
    top('requestPath'),
    top('referrerHostname'),
    top('country'),
    top('deviceType', 4),
    get<{ data: Array<{ eventName: string; count: number; visitors: number }> }>('/v1/query/web-analytics/events/aggregate', {
      ...base,
      by: ['eventName'],
      limit: 20,
    }).catch(() => ({ data: [] })),
    get<{ data: Array<Record<string, string | number>> }>('/v1/query/web-analytics/events/aggregate', {
      ...base,
      by: ['eventData/site'],
      filter: "eventName eq 'signature_visit'",
      limit: 50,
    }).catch(() => ({ data: [] })),
  ]);

  // Sorted by the figure the cockpit shows: page views for pages, visitors for the rest.
  const rows = (list: AggregateResponse<Record<string, string>>, key: string, sortBy: keyof Visits = 'visitors') =>
    (list.data ?? [])
      .map((row) => ({ label: row[key] || '—', pageviews: row.pageviews ?? 0, visitors: row.visitors ?? 0 }))
      .sort((a, b) => b[sortBy] - a[sortBy]);

  return {
    range: { days, since, until },
    totals: totals.data ?? { pageviews: 0, visitors: 0 },
    previous: previous.data ?? { pageviews: 0, visitors: 0 },
    daily: (daily.data ?? [])
      .map((row) => ({ date: row.timestamp.slice(0, 10), pageviews: row.pageviews ?? 0, visitors: row.visitors ?? 0 }))
      .filter((row) => row.date < until),
    pages: rows(pages, 'requestPath', 'pageviews'),
    referrers: rows(referrers, 'referrerHostname'),
    countries: rows(countries, 'country'),
    devices: rows(devices, 'deviceType'),
    events: (events.data ?? []).map((row) => ({ name: row.eventName, count: row.count ?? 0, visitors: row.visitors ?? 0 })),
    signatures: (signatures.data ?? [])
      .map((row) => {
        // the dimension comes back under its own key (e.g. "eventData/site"); take the first text value
        const label = Object.entries(row).find(([key, value]) => typeof value === 'string' && key !== 'timestamp')?.[1];
        return { label: String(label || '—'), count: Number(row.count ?? 0), visitors: Number(row.visitors ?? 0) };
      })
      .filter((row) => row.label !== '—' && row.count > 0)
      .sort((a, b) => b.count - a.count),
  };
}

// ── Deployments ───────────────────────────────────────────────────

export interface DeploymentInfo {
  id: string;
  state: string;
  target: string | null;
  createdAt: number;
  message: string;
  branch: string;
  url: string;
}

export async function recentDeployments(limit = 6): Promise<DeploymentInfo[]> {
  const result = await get<{
    deployments: Array<{
      uid: string;
      state?: string;
      readyState?: string;
      target?: string | null;
      created: number;
      url: string;
      meta?: { githubCommitMessage?: string; githubCommitRef?: string };
    }>;
  }>('/v6/deployments', { projectId: PROJECT_ID, limit });
  return (result.deployments ?? []).map((d) => ({
    id: d.uid,
    state: d.state ?? d.readyState ?? 'UNKNOWN',
    target: d.target ?? null,
    createdAt: d.created,
    message: (d.meta?.githubCommitMessage ?? '').split('\n')[0].slice(0, 90),
    branch: d.meta?.githubCommitRef ?? '',
    url: d.url,
  }));
}
