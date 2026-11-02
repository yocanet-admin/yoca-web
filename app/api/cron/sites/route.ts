import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cockpit/cron';
import { checkSites, type MonitoredSite, type SiteCheck } from '@/lib/cockpit/monitor';
import { getCronState, saveCronState } from '@/lib/cockpit/settings';
import { escapeHtml, notifyAdmins } from '@/lib/notify';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca cockpit — client site watch (Vercel Cron, every 15 minutes).
 * One alert per incident: a site must fail two checks in a row before
 * "down / suspended" goes out, and one "back up" message follows when it
 * recovers. A removed "Built by YOCA" signature is reported once.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SiteRow extends MonitoredSite {
  id: string;
  fail_count: number;
  alerted: boolean;
  signature_alerted: boolean;
}

const BAD: Array<SiteCheck['state']> = ['down', 'suspended'];
const MIN_GAP_MS = 5 * 60_000;

function problem(check: SiteCheck): string {
  if (check.state === 'suspended') return 'hosting askıya alınmış / park sayfası görünüyor';
  if (check.error) return `erişilemiyor (${check.error})`;
  return `erişilemiyor (HTTP ${check.httpStatus ?? '—'})`;
}

/**
 * SCHEDULED → PUBLISHED for articles whose publish_at has passed. The public
 * site (and its RLS policy) only shows PUBLISHED rows, so without this step a
 * scheduled article would never appear. Returns how many went live (null on error).
 */
async function publishDueInsights(): Promise<number | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('insights')
      .update({ status: 'PUBLISHED' })
      .eq('status', 'SCHEDULED')
      .lte('publish_at', new Date().toISOString())
      .select('id');
    if (error) {
      console.error('cron: scheduled insights publish failed:', error.message);
      return null;
    }
    const count = data?.length ?? 0;
    if (count > 0) console.log(`cron: published ${count} scheduled insight(s)`);
    return count;
  } catch (error) {
    console.error('cron: scheduled insights publish failed:', (error as Error).message);
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // Scheduled Insights go live once their time has come (runs even when the site check is throttled).
  const published = await publishDueInsights();

  const state = await getCronState();
  if (state.sites_last_at && Date.now() - Date.parse(state.sites_last_at) < MIN_GAP_MS) {
    return NextResponse.json({ ok: true, skipped: 'ran less than 5 minutes ago', published });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: 'supabase not configured' }, { status: 503 });
  const { data, error } = await supabase
    .from('monitored_sites')
    .select('id,name,url,expects_signature,hosting_renews_on,fail_count,alerted,signature_alerted')
    .eq('is_active', true)
    .order('order_index');
  if (error || !data) return NextResponse.json({ ok: false, error: 'run supabase/upgrade-v9-cockpit-phase2.sql' }, { status: 500 });
  await saveCronState({ sites_last_at: new Date().toISOString() });

  const rows = data as SiteRow[];
  const checks = await checkSites(rows, { domain: false });
  const down: string[] = [];
  const downNames: string[] = [];
  const recovered: string[] = [];
  const unsigned: string[] = [];

  await Promise.all(
    rows.map(async (row, i) => {
      const check = checks[i];
      const bad = BAD.includes(check.state);
      const patch: Partial<SiteRow> & { last_state: string; last_checked_at: string } = {
        last_state: check.state,
        last_checked_at: check.checkedAt,
        fail_count: bad ? (row.fail_count ?? 0) + 1 : 0,
      };
      if (bad && patch.fail_count! >= 2 && !row.alerted) {
        patch.alerted = true;
        downNames.push(row.name);
        down.push(`<b>${escapeHtml(row.name)}</b> — ${escapeHtml(problem(check))}\n${escapeHtml(row.url)}`);
      }
      if (!bad && row.alerted) {
        patch.alerted = false;
        recovered.push(`<b>${escapeHtml(row.name)}</b> tekrar çalışıyor${check.ms !== null ? ` (${(check.ms / 1000).toFixed(1)} sn)` : ''}`);
      }
      const missing = row.expects_signature && check.signature === false && !bad;
      if (missing && !row.signature_alerted) {
        patch.signature_alerted = true;
        unsigned.push(`<b>${escapeHtml(row.name)}</b> — “Built by YOCA” imzası sitede görünmüyor`);
      }
      if (check.signature === true && row.signature_alerted) patch.signature_alerted = false;
      await supabase.from('monitored_sites').update(patch).eq('id', row.id);
    }),
  );

  let sent = null;
  if (down.length || recovered.length || unsigned.length) {
    const blocks = [
      down.length ? `🔴 <b>Site sorunu</b>\n${down.join('\n\n')}` : '',
      recovered.length ? `🟢 <b>Düzeldi</b>\n${recovered.join('\n')}` : '',
      unsigned.length ? `⚠️ <b>İmza</b>\n${unsigned.join('\n')}` : '',
    ].filter(Boolean);
    const telegram = `${blocks.join('\n\n')}\n\n<a href="https://yoca.net/admin/sites">Siteler</a>`;
    const html = blocks.map((b) => `<p style="margin:0 0 14px 0;white-space:pre-line;">${b.replace(/<b>/g, '<strong style="color:#ffffff;">').replace(/<\/b>/g, '</strong>')}</p>`).join('');
    const subject = down.length
      ? `Site sorunu: ${downNames.join(', ')}`
      : recovered.length
        ? 'Site tekrar çalışıyor'
        : 'İmza uyarısı';
    sent = await notifyAdmins({ kind: 'site', subject, heading: subject, html, telegram });
  }

  return NextResponse.json({ ok: true, published, checked: rows.length, down: down.length, recovered: recovered.length, unsigned: unsigned.length, sent });
}
