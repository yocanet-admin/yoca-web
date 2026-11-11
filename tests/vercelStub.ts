// TEST ONLY: a stand-in for the Vercel Web Analytics API (global fetch stub). No request leaves the machine.
// Scenarios: 'full' (every day), 'gaps' (some days return no row, incl. today), 'zero' (rows with 0, today 0).
export type Scenario = 'full' | 'gaps' | 'zero';
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function stubVercel(scenario: Scenario) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname !== 'api.vercel.com') throw new Error(`unexpected fetch ${url.hostname}`);
    const since = Date.parse(`${url.searchParams.get('since')}T00:00:00Z`), until = Date.parse(`${url.searchParams.get('until')}T00:00:00Z`);
    const by = url.searchParams.getAll('by');
    const days: Array<{ timestamp: string; visitors: number; pageviews: number }> = [];
    for (let at = since; at < until; at += DAY) {
      const ago = Math.round((t0 - at) / DAY);
      if (ago < 0) continue;
      if (scenario === 'gaps' && [0, 3, 4, 12].includes(ago)) continue; // no row for these days (today included)
      const v = scenario === 'zero' && (ago === 0 || ago === 2 || ago === 9) ? 0 : 60 + ((ago * 37) % 90);
      days.push({ timestamp: `${iso(at)}T00:00:00.000Z`, visitors: v, pageviews: v * 3 });
    }
    if (url.pathname.endsWith('/visits/count')) {
      const s = days.reduce((a, d) => a + d.visitors, 0);
      return json({ data: { visitors: Math.round(s * 0.8), pageviews: days.reduce((a, d) => a + d.pageviews, 0) } });
    }
    if (url.pathname.endsWith('/visits/aggregate') && by[0] === 'day') return json({ data: days });
    if (url.pathname.endsWith('/visits/aggregate') && by[0] === 'requestPath') return json({ data: [{ requestPath: '/tr', visitors: 300, pageviews: 900 }, { requestPath: '/en/work', visitors: 120, pageviews: 360 }] });
    if (url.pathname.endsWith('/visits/aggregate') && by[0] === 'referrerHostname') return json({ data: [{ referrerHostname: '', visitors: 400, pageviews: 0 }, { referrerHostname: 'google.com', visitors: 250, pageviews: 0 }] });
    return json({ data: [] });
  }) as typeof fetch;
}
