// TEST ONLY: builds /api/admin/traffic answers with the REAL server code (lib/cockpit/vercel.ts trafficReport)
// fed by the Vercel stub, for the panel UI test. Output: <out>/traffic-<scenario>-<days>.json
import fs from 'node:fs';
import { stubVercel, type Scenario } from '../../vercelStub';
process.env.VERCEL_API_TOKEN = 'test-only-not-a-token';
const out = process.argv[2] ?? '/tmp/yoca-itest-out';
const { trafficReport } = await import('../../../lib/cockpit/vercel');
for (const scenario of ['full', 'gaps', 'zero'] as Scenario[]) {
  stubVercel(scenario);
  for (const days of [7, 30]) {
    const report = await trafficReport(days);
    fs.writeFileSync(`${out}/traffic-${scenario}-${days}.json`, JSON.stringify({ ok: true, configured: true, report }));
  }
}
console.log('fixtures written');
