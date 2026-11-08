/**
 * Yoca Kokpit SEO — limited technical audit (server only; fetch is injected).
 *
 * Safety limits (enforced here, not in the UI):
 *  - only allowlisted hosts (SEO_AUDIT_HOSTS, default "yoca.net,www.yoca.net");
 *    any other URL is refused, also as a redirect target (not followed);
 *  - URLs come from the site's own sitemap; GET only; robots.txt is honoured;
 *  - page limit default 50, hard max 100; total time budget 40 s; 8 s per
 *    request; at most 3 requests at once; identifiable User-Agent.
 * When a limit stops the run it is stored as "partial" with the reason.
 */

export const AUDIT_HOSTS_ENV = 'SEO_AUDIT_HOSTS';
export const DEFAULT_HOSTS = ['yoca.net', 'www.yoca.net'];
export const AUDIT_LIMITS = { defaultPages: 50, maxPages: 100, budgetMs: 40_000, timeoutMs: 8_000, concurrency: 3, maxRedirects: 5 };
export const USER_AGENT = 'YocaKokpitSEO/1.0 (+https://yoca.net; teknik SEO denetimi, yalnızca yoca.net)';
const UA_TOKEN = 'yocakokpitseo';

export type Severity = 'error' | 'warning' | 'info' | 'ok';
export interface Finding { url: string; check: string; severity: Severity; message: string; detail?: Record<string, unknown> }
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function auditHosts(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env[AUDIT_HOSTS_ENV] ?? '').split(',').map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+$/.test(h));
  return list.length ? list : DEFAULT_HOSTS;
}

export function hostAllowed(url: string, hosts: string[]): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password && hosts.includes(u.hostname.toLowerCase()) && (u.port === '' || u.port === '443' || u.port === '80');
  } catch {
    return false;
  }
}

export const clampPages = (n: unknown) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? Math.min(v, AUDIT_LIMITS.maxPages) : AUDIT_LIMITS.defaultPages;
};

/* ── robots.txt (groups for our token or "*"; longest match wins, Allow on a tie) ── */

export interface Robots { allow: string[]; disallow: string[]; sitemaps: string[] }
export function parseRobots(text: string): Robots {
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[] }> = [];
  const sitemaps: string[] = [];
  let cur: { agents: string[]; allow: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'sitemap') { sitemaps.push(value); continue; }
    if (field === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (field === 'allow' && value) cur.allow.push(value);
    if (field === 'disallow' && value) cur.disallow.push(value);
  }
  const own = groups.filter((g) => g.agents.some((a) => a === UA_TOKEN));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  return { allow: chosen.flatMap((g) => g.allow), disallow: chosen.flatMap((g) => g.disallow), sitemaps };
}

const ruleRe = (rule: string) => new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
export function robotsAllows(robots: Robots, url: string): boolean {
  let path = '/';
  try { const u = new URL(url); path = u.pathname + u.search; } catch { return false; }
  const best = (rules: string[]) => rules.filter((r) => ruleRe(r).test(path)).reduce((a, r) => Math.max(a, r.length), -1);
  const a = best(robots.allow);
  const d = best(robots.disallow);
  return d < 0 || a >= d;
}

export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = (tag: string) => Array.from(xml.matchAll(new RegExp(`<${tag}>[\\s\\S]*?<loc>\\s*([^<\\s]+)\\s*</loc>`, 'g'))).map((m) => m[1].replace(/&amp;/g, '&'));
  return { urls: locs('url'), sitemaps: locs('sitemap') };
}

/* ── fetch with manual redirects that never leave the allowlist ── */

export interface Fetched { url: string; finalUrl: string; status: number; chain: Array<{ url: string; status: number }>; body: string; headers: Headers | null; refused?: string; error?: string }

export async function fetchAllowed(url: string, ctx: { hosts: string[]; fetch: FetchLike; timeoutMs: number }): Promise<Fetched> {
  const chain: Array<{ url: string; status: number }> = [];
  let current = url;
  for (let hop = 0; hop <= AUDIT_LIMITS.maxRedirects; hop += 1) {
    if (!hostAllowed(current, ctx.hosts)) return { url, finalUrl: current, status: 0, chain, body: '', headers: null, refused: `İzin listesi dışında: ${safeHost(current)} (istek yapılmadı)` };
    let res: Response;
    try {
      res = await ctx.fetch(current, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(ctx.timeoutMs) });
    } catch (e) {
      return { url, finalUrl: current, status: 0, chain, body: '', headers: null, error: (e as Error).name === 'TimeoutError' ? `Zaman aşımı (${ctx.timeoutMs / 1000} sn)` : 'Bağlantı hatası' };
    }
    chain.push({ url: current, status: res.status });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    const type = res.headers.get('content-type') ?? '';
    const body = /html|xml|text/.test(type) ? (await res.text()).slice(0, 2_000_000) : '';
    return { url, finalUrl: current, status: res.status, chain, body, headers: res.headers };
  }
  return { url, finalUrl: current, status: 0, chain, body: '', headers: null, error: `Çok fazla yönlendirme (> ${AUDIT_LIMITS.maxRedirects})` };
}
const safeHost = (u: string) => { try { return new URL(u).hostname; } catch { return 'geçersiz adres'; } };

/* ── page checks (pure) ── */

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(2).find((v) => v !== undefined) ?? null;
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
export const normUrl = (u: string) => { try { const x = new URL(u); x.hash = ''; return x.toString().replace(/(.)\/$/, '$1'); } catch { return u; } };

export interface PageFacts { url: string; title: string | null; description: string | null; canonical: string | null; lang: string | null; h1: number; noindex: boolean; alternates: Array<{ lang: string; href: string }>; jsonld: Array<{ ok: boolean; error?: string }> }

export function pageFacts(url: string, html: string, headers?: Headers | null): PageFacts {
  const head = html.slice(0, 300_000);
  const tags = (name: string) => Array.from(head.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))).map((m) => m[0]);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const metas = tags('meta');
  const links = tags('link');
  const description = metas.find((t) => (attr(t, 'name') ?? '').toLowerCase() === 'description');
  const robotsMeta = metas.filter((t) => ['robots', 'googlebot'].includes((attr(t, 'name') ?? '').toLowerCase())).map((t) => attr(t, 'content') ?? '').join(',');
  const canonical = links.find((t) => (attr(t, 'rel') ?? '').toLowerCase() === 'canonical');
  const alternates = links.filter((t) => (attr(t, 'rel') ?? '').toLowerCase() === 'alternate' && attr(t, 'hreflang')).map((t) => ({ lang: (attr(t, 'hreflang') ?? '').toLowerCase(), href: decode(attr(t, 'href') ?? '') }));
  const jsonld = Array.from(html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)).map((m) => {
    try { JSON.parse(m[1]); return { ok: true }; } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 120) }; }
  });
  return {
    url,
    title: title === undefined ? null : decode(title.replace(/\s+/g, ' ')),
    description: description ? decode(attr(description, 'content') ?? '') : null,
    canonical: canonical ? decode(attr(canonical, 'href') ?? '') : null,
    lang: (() => { const t = /<html\b[^>]*>/i.exec(head)?.[0]; return t ? attr(t, 'lang') : null; })(),
    h1: (html.match(/<h1\b/gi) ?? []).length,
    noindex: /noindex/i.test(robotsMeta) || /noindex/i.test(headers?.get('x-robots-tag') ?? ''),
    alternates,
    jsonld,
  };
}

export const TITLE_RANGE = [15, 60] as const;
export const DESCRIPTION_RANGE = [50, 160] as const;

export function checkPage(p: PageFacts, f: Fetched, ctx: { hosts: string[]; inSitemap: Set<string> }): Finding[] {
  const out: Finding[] = [];
  const add = (check: string, severity: Severity, message: string, detail?: Record<string, unknown>) => out.push({ url: p.url, check, severity, message, detail });
  // status + redirect chain
  if (f.chain.length > 1) add('redirect', 'warning', `Yönlendirme zinciri (${f.chain.length - 1} adım): sitemap’te son adres olmalı.`, { chain: f.chain });
  if (f.status >= 400) { add('status', 'error', `HTTP ${f.status}`); return out; }
  add('status', 'ok', `HTTP ${f.status}`);
  // title
  if (!p.title) add('title', 'error', 'Başlık (title) yok.');
  else if (p.title.length < TITLE_RANGE[0] || p.title.length > TITLE_RANGE[1]) add('title', 'warning', `Başlık ${p.title.length} karakter (önerilen ${TITLE_RANGE[0]}–${TITLE_RANGE[1]}).`, { title: p.title });
  else add('title', 'ok', `Başlık ${p.title.length} karakter.`);
  // meta description
  if (p.description === null || !p.description) add('description', 'warning', 'Meta açıklama yok.');
  else if (p.description.length < DESCRIPTION_RANGE[0] || p.description.length > DESCRIPTION_RANGE[1]) add('description', 'warning', `Meta açıklama ${p.description.length} karakter (önerilen ${DESCRIPTION_RANGE[0]}–${DESCRIPTION_RANGE[1]}).`);
  else add('description', 'ok', `Meta açıklama ${p.description.length} karakter.`);
  // canonical
  const final = normUrl(f.finalUrl);
  if (!p.canonical) add('canonical', 'warning', 'Canonical yok.');
  else {
    const c = normUrl(new URL(p.canonical, f.finalUrl).toString());
    if (!hostAllowed(c, ctx.hosts)) add('canonical', 'error', `Canonical başka bir alan adını gösteriyor (${safeHost(c)}).`);
    else if (c !== final) add('canonical', 'warning', `Canonical sayfanın kendisini değil ${c} adresini gösteriyor.`, { canonical: c });
    else add('canonical', 'ok', 'Canonical sayfanın kendisi.');
    if (hostAllowed(c, ctx.hosts) && !ctx.inSitemap.has(c)) add('in_sitemap', 'warning', `Canonical adres sitemap’te yok: ${c}`);
  }
  // html lang vs URL locale
  const locale = (() => { try { return new URL(f.finalUrl).pathname.split('/')[1] ?? ''; } catch { return ''; } })();
  if (!p.lang) add('lang', 'warning', '<html lang> yok.');
  else if (['en', 'tr', 'az', 'ar'].includes(locale) && p.lang.toLowerCase().split('-')[0] !== locale) add('lang', 'warning', `<html lang="${p.lang}"> ama adres /${locale} dilinde.`);
  else add('lang', 'ok', `<html lang="${p.lang}">`);
  // h1
  if (p.h1 === 0) add('h1', 'warning', 'H1 yok.');
  else if (p.h1 > 1) add('h1', 'warning', `${p.h1} adet H1 var (bir tane önerilir).`);
  else add('h1', 'ok', 'Bir H1.');
  // noindex
  if (p.noindex) add('noindex', 'error', 'Sayfa noindex ama sitemap’te: Google dizine eklemez.');
  // JSON-LD
  if (!p.jsonld.length) add('jsonld', 'info', 'Yapılandırılmış veri (JSON-LD) yok.');
  else if (p.jsonld.some((j) => !j.ok)) add('jsonld', 'error', `Geçersiz JSON-LD: ${p.jsonld.find((j) => !j.ok)?.error ?? ''}`);
  else add('jsonld', 'ok', `${p.jsonld.length} JSON-LD bloğu geçerli.`);
  return out;
}

/** hreflang reciprocity across the audited pages: A → B (lang L) needs B → A. */
export function hreflangFindings(pages: PageFacts[], finals: Map<string, string>, inSitemap: Set<string>, hosts: string[]): Finding[] {
  const out: Finding[] = [];
  const byFinal = new Map<string, PageFacts>();
  for (const p of pages) byFinal.set(normUrl(finals.get(p.url) ?? p.url), p);
  for (const p of pages) {
    const self = normUrl(finals.get(p.url) ?? p.url);
    if (!p.alternates.length) { out.push({ url: p.url, check: 'hreflang', severity: 'info', message: 'hreflang alternatifi yok.' }); continue; }
    const missing: string[] = [];
    const notInSitemap: string[] = [];
    for (const a of p.alternates) {
      if (a.lang === 'x-default') continue;
      const target = normUrl(new URL(a.href, self).toString());
      if (target === self) continue;
      if (hostAllowed(target, hosts) && !inSitemap.has(target)) notInSitemap.push(target);
      const other = byFinal.get(target);
      if (!other) continue; // not audited (limit / not in sitemap): cannot be checked
      if (!other.alternates.some((b) => b.lang !== 'x-default' && normUrl(new URL(b.href, target).toString()) === self)) missing.push(`${a.lang}: ${target}`);
    }
    if (missing.length) out.push({ url: p.url, check: 'hreflang', severity: 'warning', message: `hreflang karşılıklı değil (${missing.length}): karşı sayfa bu sayfayı göstermiyor.`, detail: { missing } });
    else out.push({ url: p.url, check: 'hreflang', severity: 'ok', message: `${p.alternates.length} hreflang alternatifi, karşılıklı.` });
    if (notInSitemap.length) out.push({ url: p.url, check: 'in_sitemap', severity: 'warning', message: `hreflang alternatifi sitemap’te yok (${notInSitemap.length}).`, detail: { urls: notInSitemap.slice(0, 10) } });
  }
  return out;
}

export interface AuditResult { status: 'done' | 'partial' | 'failed'; pagesPlanned: number; pagesChecked: number; limitReason: string | null; findings: Finding[]; summary: Record<string, number> }

export async function runAudit(opts: { origin: string; hosts: string[]; fetch: FetchLike; maxPages?: number; budgetMs?: number; timeoutMs?: number; concurrency?: number; now?: () => number }): Promise<AuditResult> {
  const now = opts.now ?? Date.now;
  const started = now();
  const budget = Math.min(opts.budgetMs ?? AUDIT_LIMITS.budgetMs, AUDIT_LIMITS.budgetMs);
  const timeoutMs = Math.min(opts.timeoutMs ?? AUDIT_LIMITS.timeoutMs, AUDIT_LIMITS.timeoutMs);
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? AUDIT_LIMITS.concurrency, AUDIT_LIMITS.concurrency));
  const maxPages = clampPages(opts.maxPages);
  const findings: Finding[] = [];
  const ctx = { hosts: opts.hosts, fetch: opts.fetch, timeoutMs };
  if (!hostAllowed(opts.origin, opts.hosts)) return { status: 'failed', pagesPlanned: 0, pagesChecked: 0, limitReason: 'İzin listesi dışında bir site istendi; hiçbir istek yapılmadı.', findings: [], summary: {} };
  const origin = new URL(opts.origin).origin;

  const robotsRes = await fetchAllowed(`${origin}/robots.txt`, ctx);
  const robots = robotsRes.status === 200 ? parseRobots(robotsRes.body) : { allow: [], disallow: [], sitemaps: [] };
  if (robotsRes.status !== 200) findings.push({ url: `${origin}/robots.txt`, check: 'robots', severity: 'warning', message: `robots.txt okunamadı (${robotsRes.status || robotsRes.error || robotsRes.refused}).` });

  // sitemap(s): robots "Sitemap:" lines on the allowlist, else /sitemap.xml; one level of sitemap index
  const sitemapUrls = robots.sitemaps.filter((s) => hostAllowed(s, opts.hosts));
  const queue = sitemapUrls.length ? sitemapUrls : [`${origin}/sitemap.xml`];
  const urls: string[] = [];
  for (const sm of queue.slice(0, 5)) {
    const r = await fetchAllowed(sm, ctx);
    if (r.status !== 200) { findings.push({ url: sm, check: 'sitemap', severity: 'error', message: `Sitemap okunamadı (${r.status || r.error || r.refused}).` }); continue; }
    const parsed = parseSitemap(r.body);
    urls.push(...parsed.urls);
    for (const child of parsed.sitemaps.filter((s) => hostAllowed(s, opts.hosts)).slice(0, 5)) {
      const c = await fetchAllowed(child, ctx);
      if (c.status === 200) urls.push(...parseSitemap(c.body).urls);
    }
  }
  const inSitemap = new Set(urls.map(normUrl));
  const allowed: string[] = [];
  for (const u of Array.from(new Set(urls))) {
    if (!hostAllowed(u, opts.hosts)) findings.push({ url: u, check: 'allowlist', severity: 'info', message: 'İzin listesi dışında bir alan adı: taranmadı.' });
    else if (!robotsAllows(robots, u)) findings.push({ url: u, check: 'robots', severity: 'warning', message: 'robots.txt bu adresi engelliyor ama sitemap’te: taranmadı.' });
    else allowed.push(u);
  }
  const planned = allowed.slice(0, maxPages);
  let limitReason: string | null = allowed.length > maxPages ? `Sayfa sınırı: sitemap’teki ${allowed.length} adresin ilk ${maxPages} tanesi tarandı.` : null;

  const pages: PageFacts[] = [];
  const finals = new Map<string, string>();
  let next = 0;
  let checked = 0;
  const worker = async () => {
    while (next < planned.length) {
      if (now() - started > budget) { limitReason = `Süre sınırı (${budget / 1000} sn): ${planned.length} sayfanın ${checked} tanesi tarandı.`; return; }
      const url = planned[next++];
      const f = await fetchAllowed(url, ctx);
      checked += 1;
      if (f.refused) { findings.push({ url, check: 'redirect', severity: 'error', message: `Yönlendirme izin listesi dışına gidiyor; izlenmedi. ${f.refused}`, detail: { chain: f.chain } }); continue; }
      if (f.error) { findings.push({ url, check: 'status', severity: 'error', message: f.error, detail: { chain: f.chain } }); continue; }
      finals.set(url, f.finalUrl);
      if (f.status >= 400 || !f.body) { findings.push(...checkPage(pageFacts(url, '', null), f, { hosts: opts.hosts, inSitemap })); continue; }
      const facts = pageFacts(url, f.body, f.headers);
      pages.push(facts);
      findings.push(...checkPage(facts, f, { hosts: opts.hosts, inSitemap }));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  findings.push(...hreflangFindings(pages, finals, inSitemap, opts.hosts));

  const summary: Record<string, number> = { error: 0, warning: 0, info: 0, ok: 0 };
  for (const f of findings) summary[f.severity] += 1;
  return { status: limitReason ? 'partial' : 'done', pagesPlanned: planned.length, pagesChecked: checked, limitReason, findings, summary };
}
