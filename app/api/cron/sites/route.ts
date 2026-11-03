import { NextRequest, NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cockpit/cron';
import { checkSites, type MonitoredSite, type SiteCheck } from '@/lib/cockpit/monitor';
import { getCronState, saveCronState } from '@/lib/cockpit/settings';
import { escapeHtml, notifyAdmins } from '@/lib/notify';
import { SITE, buttons, emailLayout, istanbulTime, kicker, section, statusList, tgHead, title, type Tone } from '@/lib/notifyTemplates';
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
  const auth = cronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

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
  type Item = { name: string; url: string; detail: string };
  const down: Item[] = [];
  const recovered: Item[] = [];
  const unsigned: Item[] = [];

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
        down.push({ name: row.name, url: row.url, detail: problem(check) });
      }
      if (!bad && row.alerted) {
        patch.alerted = false;
        recovered.push({ name: row.name, url: row.url, detail: `tekrar çalışıyor${check.ms !== null ? ` · ${(check.ms / 1000).toFixed(1)} sn` : ''}` });
      }
      const missing = row.expects_signature && check.signature === false && !bad;
      if (missing && !row.signature_alerted) {
        patch.signature_alerted = true;
        unsigned.push({ name: row.name, url: row.url, detail: '“Built by YOCA” imzası sitede görünmüyor' });
      }
      if (check.signature === true && row.signature_alerted) patch.signature_alerted = false;
      await supabase.from('monitored_sites').update(patch).eq('id', row.id);
    }),
  );

  let sent = null;
  if (down.length || recovered.length || unsigned.length) {
    const when = istanbulTime();
    const groups: Array<{ items: Item[]; tone: Tone; heading: string; icon: string }> = [
      { items: down, tone: 'red', heading: 'Erişilemiyor', icon: '🔴' },
      { items: recovered, tone: 'green', heading: 'Düzeldi', icon: '🟢' },
      { items: unsigned, tone: 'amber', heading: 'İmza eksik', icon: '🟠' },
    ].filter((g) => g.items.length) as Array<{ items: Item[]; tone: Tone; heading: string; icon: string }>;
    const subject = down.length
      ? `Site sorunu: ${down.map((d) => d.name).join(', ')}`
      : recovered.length
        ? `Tekrar çalışıyor: ${recovered.map((d) => d.name).join(', ')}`
        : `İmza uyarısı: ${unsigned.map((d) => d.name).join(', ')}`;
    const lead = down.length ? 'Site sorunu' : recovered.length ? 'Site tekrar çalışıyor' : 'İmza uyarısı';
    const email = emailLayout({
      preheader: subject,
      label: lead,
      body:
        kicker(lead, down.length ? 'red' : recovered.length ? 'green' : 'amber') +
        title(down.length ? `${down.length} site erişilemiyor` : recovered.length ? `${recovered.length} site tekrar ayakta` : 'İmza bulunamadı') +
        groups
          .map((g) => section(g.heading, statusList(g.items.map((it) => ({ tone: g.tone, title: it.name, detail: `${it.detail} · ${it.url.replace(/^https?:\/\//, '')}`, href: it.url })))))
          .join('') +
        `<p style="margin:14px 0 18px 0;font:400 12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#6E6E6E;">Kontrol: ${escapeHtml(when)} · iki kontrol üst üste başarısız olunca haber verilir.</p>` +
        buttons([{ label: 'Siteleri aç', href: `${SITE}/admin/sites`, primary: true }]),
    });
    const telegram =
      `${tgHead(down.length ? '🔴' : recovered.length ? '🟢' : '🟠', lead, when)}\n\n` +
      groups
        .map((g) => g.items.map((it) => `${g.icon} <b>${escapeHtml(it.name)}</b>\n     ${escapeHtml(it.detail)}\n     <a href="${escapeHtml(it.url)}">${escapeHtml(it.url.replace(/^https?:\/\//, ''))}</a>`).join('\n\n'))
        .join('\n\n');
    sent = await notifyAdmins({ kind: 'site', subject, email, telegram, keyboard: [[{ text: 'Siteleri aç →', url: `${SITE}/admin/sites` }]] });
  }

  return NextResponse.json({ ok: true, published, checked: rows.length, down: down.length, recovered: recovered.length, unsigned: unsigned.length, sent });
}
