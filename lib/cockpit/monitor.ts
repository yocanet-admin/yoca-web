import { promises as dns } from 'node:dns';
import tls from 'node:tls';
import type { SiteProblem } from '@/lib/cockpit/issues';

export type { SiteProblem } from '@/lib/cockpit/issues';

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

/**
 * up / slow: the site answered. down: evidence the SITE is broken (HTTP error status,
 * domain does not resolve, invalid certificate). suspended: hosting/parking page.
 * unknown: the CHECK could not finish (timeout, connection reset/refused …) — the
 * site may still open elsewhere; it is never reported as "up".
 */
export type SiteState = 'up' | 'down' | 'suspended' | 'slow' | 'unknown';

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
  /** What exactly failed (null when the site answered normally); labels in lib/cockpit/issues.ts. */
  problem: SiteProblem | null;
  /** Short reason (Turkish) for the panel and alerts. */
  error: string | null;
  checkedAt: string;
}

const SUSPENDED = /account suspended|suspendedpage|this account has been suspended|domain (is )?for sale|parked (free|domain)|hesap ask[ıi]ya al[ıi]nd[ıi]/i;
const SIGNATURE = /yoca-credit|built by\s*yoca|href=["']https?:\/\/(www\.)?yoca\.net/i;

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / 86_400_000);
}

function sslExpiry(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    // rejectUnauthorized:false so an expired / invalid certificate still reports its date
    // (the expiry is then flagged by siteIssues as "süresi geçti").
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 8000, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      const expires = cert?.valid_to ? new Date(cert.valid_to) : null;
      resolve(expires && !Number.isNaN(expires.getTime()) ? expires.toISOString() : null);
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

const CERT_CODE = /^(CERT_|ERR_TLS_CERT|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|DEPTH_ZERO_SELF_SIGNED|SELF_SIGNED_CERT)/;

/** The first error code in the cause chain (fetch wraps the socket error: TypeError("fetch failed") → cause). */
export function errorCode(error: unknown): string | null {
  let current = error as { code?: unknown; cause?: unknown } | null | undefined;
  for (let i = 0; i < 4 && current; i += 1) {
    if (typeof current.code === 'string' && current.code) return current.code;
    current = current.cause as typeof current;
  }
  return null;
}

export interface Failure {
  state: 'down' | 'unknown';
  problem: SiteProblem;
  reason: string;
}

/**
 * A failed page request (no HTTP response), as evidence. Only a certificate problem
 * is a property of the site itself; timeouts and connection errors only say this
 * check did not finish from the monitor's location. A DNS "not found" is passed to
 * dnsFailure() first — getaddrinfo cannot tell NXDOMAIN from a resolver problem.
 */
export function classifyFetchError(error: unknown): Failure {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') return { state: 'unknown', problem: 'check_incomplete', reason: 'Zaman aşımı (10 sn)' };
  const code = errorCode(error);
  if (code && CERT_CODE.test(code)) return { state: 'down', problem: 'tls', reason: `Sertifika doğrulanamadı (${code})` };
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return { state: 'unknown', problem: 'check_incomplete', reason: 'Bağlantı zaman aşımı' };
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET' || code === 'EPIPE') return { state: 'unknown', problem: 'check_incomplete', reason: 'Bağlantı karşı taraftan kesildi' };
  if (code === 'ECONNREFUSED') return { state: 'unknown', problem: 'check_incomplete', reason: 'Bağlantı reddedildi' };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { state: 'unknown', problem: 'check_incomplete', reason: 'DNS çözümlemesi başarısız (sonuç belirsiz)' };
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return { state: 'unknown', problem: 'check_incomplete', reason: 'Sunucuya ağ üzerinden ulaşılamadı' };
  if (code && /TLS|SSL|EPROTO/.test(code)) return { state: 'unknown', problem: 'check_incomplete', reason: `TLS bağlantısı kurulamadı (${code})` };
  const message = (error as { message?: string } | null)?.message?.slice(0, 140);
  return { state: 'unknown', problem: 'check_incomplete', reason: code ? `Bağlantı hatası (${code})` : message || 'Kontrol tamamlanamadı' };
}

type Lookup = (hostname: string) => Promise<string[]>;
const DNS_TIMEOUT_MS = 5000;
const withTimeout = <T>(p: Promise<T>): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS))]);

/**
 * After getaddrinfo said "not found": ask DNS directly (A and AAAA). Only an
 * authoritative "name does not exist" (ENOTFOUND from the resolver = NXDOMAIN) on
 * both is reported as "domain not found"; "exists but no address" (ENODATA) is told
 * apart; anything else (SERVFAIL, timeout, an address after all) stays "check incomplete".
 */
export async function dnsFailure(hostname: string, resolve4: Lookup = (h) => withTimeout(dns.resolve4(h)), resolve6: Lookup = (h) => withTimeout(dns.resolve6(h))): Promise<Failure> {
  const [a, aaaa] = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const found = [a, aaaa].some((r) => r.status === 'fulfilled' && r.value.length > 0);
  if (found) return { state: 'unknown', problem: 'check_incomplete', reason: 'DNS sonucu tutarsız (adres var, bağlantı çözümlemesi başarısız)' };
  const codes = [a, aaaa].map((r) => (r.status === 'rejected' ? errorCode(r.reason) : 'EMPTY'));
  if (codes.every((c) => c === 'ENOTFOUND')) return { state: 'down', problem: 'dns_nxdomain', reason: 'DNS yanıtı: NXDOMAIN' };
  if (codes.every((c) => c === 'ENODATA' || c === 'EMPTY')) return { state: 'down', problem: 'dns_no_address', reason: 'DNS yanıtı: A/AAAA kaydı yok' };
  return { state: 'unknown', problem: 'check_incomplete', reason: `DNS çözümleyici hatası (${codes.filter((c) => c && c !== 'ENOTFOUND').join(', ') || 'belirsiz'})` };
}

/** An HTTP answer with an error status. 401/403/429 mean the check was refused, not that the site is down. */
export function classifyHttpStatus(status: number): Failure | null {
  if (status < 400) return null;
  if (status === 401 || status === 403 || status === 429) return { state: 'unknown', problem: 'restricted', reason: `HTTP ${status}` };
  if (status === 404) return { state: 'down', problem: 'not_found', reason: 'HTTP 404' };
  if (status >= 500) return { state: 'down', problem: 'server_error', reason: `HTTP ${status}` };
  return { state: 'down', problem: 'http_error', reason: `HTTP ${status}` };
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

/** `domain: false` skips the RDAP lookup (frequent uptime checks don't need it). */
export async function checkSite(site: MonitoredSite, options: { domain?: boolean } = {}): Promise<SiteCheck> {
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
    problem: null,
    error: null,
    checkedAt: new Date().toISOString(),
  };

  const [page, ssl, domain] = await Promise.all([
    fetchPage(site.url).catch((error: unknown) => error as Error),
    sslExpiry(hostname),
    options.domain === false ? Promise.resolve(null) : domainExpiry(hostname),
  ]);

  base.sslExpires = ssl;
  base.sslDaysLeft = daysUntil(ssl);
  base.domainExpires = domain;
  base.domainDaysLeft = daysUntil(domain);

  if (page instanceof Error) {
    const first = classifyFetchError(page);
    const failure = errorCode(page) === 'ENOTFOUND' ? await dnsFailure(hostname).catch(() => first) : first;
    base.state = failure.state;
    base.problem = failure.problem;
    base.error = failure.reason;
    return base;
  }

  base.httpStatus = page.status;
  base.ms = page.ms;
  base.finalUrl = page.finalUrl;
  const httpFailure = classifyHttpStatus(page.status);
  base.signature = httpFailure ? null : SIGNATURE.test(page.html);
  if (SUSPENDED.test(page.html) || /suspendedpage\.cgi/i.test(page.finalUrl)) {
    base.state = 'suspended';
    base.problem = 'suspended';
  } else if (httpFailure) {
    base.state = httpFailure.state;
    base.problem = httpFailure.problem;
    base.error = httpFailure.reason;
  } else if (page.ms > 4000) base.state = 'slow';
  else base.state = 'up';
  return base;
}

/** A check result for a site that could not be checked at all (bad URL, unexpected failure): unknown, never "up". */
function failedCheck(site: MonitoredSite, message: string): SiteCheck {
  return {
    name: site.name,
    url: site.url,
    state: 'unknown',
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
    problem: 'check_incomplete',
    error: message,
    checkedAt: new Date().toISOString(),
  };
}

/** One broken entry (e.g. an invalid URL) is reported as that site's error; the others are still checked. */
export async function checkSites(sites: MonitoredSite[], options: { domain?: boolean } = {}): Promise<SiteCheck[]> {
  return Promise.all(
    sites.map(async (site) => {
      try {
        return await checkSite(site, options);
      } catch (error) {
        const message = error instanceof TypeError && /url/i.test(error.message) ? 'Geçersiz adres' : (error as Error)?.message?.slice(0, 140) || 'Kontrol başarısız';
        return failedCheck(site, message);
      }
    }),
  );
}
