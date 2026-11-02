import tls from 'node:tls';

/**
 * Yoca — client site monitor (server only).
 * For each site: is it up (status, response time, final URL), does it look
 * suspended/parked, does it carry the "Built by YOCA" signature, when does
 * its SSL certificate expire, and (via RDAP) when does the domain expire.
 * Read-only HTTP checks; nothing is stored.
 */

export interface MonitoredSite {
  id?: string;
  name: string;
  url: string;
  expects_signature: boolean;
  hosting_renews_on?: string | null;
  note?: string;
}

export const DEFAULT_SITES: MonitoredSite[] = [
  { name: 'Yoca', url: 'https://yoca.net', expects_signature: false },
  { name: 'Prime Wash Car', url: 'https://primewashcar.com', expects_signature: true },
  { name: 'SP Medya', url: 'https://www.spmedya.com', expects_signature: true },
  { name: 'SunSoft', url: 'https://sunsoft.az', expects_signature: true },
  { name: 'Cleova', url: 'https://thecleova.com', expects_signature: false },
];

export type SiteState = 'up' | 'down' | 'suspended' | 'slow';

export interface SiteCheck {
  name: string;
  url: string;
  state: SiteState;
  httpStatus: number | null;
  ms: number | null;
  finalUrl: string | null;
  signature: boolean | null;
  expectsSignature: boolean;
  sslExpires: string | null;
  sslDaysLeft: number | null;
  domainExpires: string | null;
  domainDaysLeft: number | null;
  hostingRenewsOn: string | null;
  error: string | null;
  checkedAt: string;
}

const SUSPENDED = /account suspended|suspendedpage|this account has been suspended|domain (is )?for sale|parked (free|domain)|hesap ask[ıi]ya al[ıi]nd[ıi]/i;
const SIGNATURE = /yoca-credit|built by\s*yoca|href=["']https?:\/\/(www\.)?yoca\.net/i;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / 86_400_000);
}

function sslExpiry(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert?.valid_to ? new Date(cert.valid_to).toISOString() : null);
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

/** Registrable domain, good enough for the TLDs we host (.com, .net, .az, .com.tr …). */
function registrableDomain(hostname: string): string {
  const parts = hostname.replace(/^www\./, '').split('.');
  const twoLevel = ['com.tr', 'org.tr', 'net.tr', 'com.az', 'co.uk'];
  const lastTwo = parts.slice(-2).join('.');
  return twoLevel.includes(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

/** RDAP endpoints asked directly (rdap.org is only a redirector and can refuse datacentre traffic). */
const RDAP_DIRECT: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/domain/',
  net: 'https://rdap.verisign.com/net/v1/domain/',
  org: 'https://rdap.publicinterestregistry.org/rdap/domain/',
};

async function rdapExpiry(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/rdap+json, application/json', 'User-Agent': 'YocaCockpit/1.0 (+https://yoca.net)' },
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { events?: Array<{ eventAction?: string; eventDate?: string }> };
    return data.events?.find((e) => e.eventAction === 'expiration')?.eventDate ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function domainExpiry(hostname: string): Promise<string | null> {
  const domain = registrableDomain(hostname);
  const direct = RDAP_DIRECT[domain.split('.').pop() ?? ''];
  return (direct ? await rdapExpiry(direct + domain) : null) ?? (await rdapExpiry(`https://rdap.org/domain/${domain}`));
}

async function fetchPage(url: string): Promise<{ status: number; ms: number; finalUrl: string; html: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'User-Agent': 'YocaCockpitMonitor/1.0 (+https://yoca.net)' },
    });
    const html = (await response.text()).slice(0, 600_000);
    return { status: response.status, ms: Date.now() - started, finalUrl: response.url, html };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkSite(site: MonitoredSite): Promise<SiteCheck> {
  const hostname = new URL(site.url).hostname;
  const base: SiteCheck = {
    name: site.name,
    url: site.url,
    state: 'down',
    httpStatus: null,
    ms: null,
    finalUrl: null,
    signature: null,
    expectsSignature: site.expects_signature,
    sslExpires: null,
    sslDaysLeft: null,
    domainExpires: null,
    domainDaysLeft: null,
    hostingRenewsOn: site.hosting_renews_on ?? null,
    error: null,
    checkedAt: new Date().toISOString(),
  };

  const [page, ssl, domain] = await Promise.all([
    fetchPage(site.url).catch((error: unknown) => error as Error),
    sslExpiry(hostname),
    domainExpiry(hostname),
  ]);

  base.sslExpires = ssl;
  base.sslDaysLeft = daysUntil(ssl);
  base.domainExpires = domain;
  base.domainDaysLeft = daysUntil(domain);

  if (page instanceof Error) {
    base.error = page.name === 'AbortError' ? 'Zaman aşımı (10 sn)' : page.message.slice(0, 140);
    return base;
  }

  base.httpStatus = page.status;
  base.ms = page.ms;
  base.finalUrl = page.finalUrl;
  base.signature = SIGNATURE.test(page.html);
  if (SUSPENDED.test(page.html) || /suspendedpage\.cgi/i.test(page.finalUrl)) base.state = 'suspended';
  else if (page.status >= 400) base.state = 'down';
  else if (page.ms > 4000) base.state = 'slow';
  else base.state = 'up';
  return base;
}

export async function checkSites(sites: MonitoredSite[]): Promise<SiteCheck[]> {
  return Promise.all(sites.map((site) => checkSite(site)));
}
