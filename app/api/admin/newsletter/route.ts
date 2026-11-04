import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { SITE } from '@/lib/notifyTemplates';
import { articleUrl, asLocale, chunk, NEWSLETTER_LOCALES, pickVersion, sanitizeCopy, TEST_VALID_MS, unsubscribeUrl, type EmailCopy, type NewsletterLocale, type PublishedVersion } from '@/lib/newsletter/core';
import { issueEmail } from '@/lib/newsletter/template';
import { mailerReady, sendBatch, sendOne, type OutgoingEmail } from '@/lib/newsletter/mailer';

/**
 * Yoca — newsletter for admins.
 * GET                 subscribers + recent sends (panel page)
 * GET ?groupId=…      what one article's send looks like: active subscribers
 *                     per language, published versions, the send record
 * POST { action: 'save_copy', insightId, copy }  e-mail text per language
 *                     (subject, preview line, teaser). Saving clears the test,
 *                     so the next send needs a fresh test with the new text.
 * POST { action: 'test', insightId }  every published language version to
 *                     the signed-in admin's own address ("[Deneme]")
 * POST { action: 'send', insightId }  to every active subscriber, each in
 *                     their language (fallback EN → source). Requires a test
 *                     e-mail in the last 24 h. One send per article group;
 *                     calling it again only continues an unfinished send
 *                     (each subscriber is delivered once, per row).
 * Nothing here runs automatically; publishing an article never sends mail.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH = 50;
const TIME_BUDGET_MS = 240_000;
const VERSION_COLUMNS = 'id, locale, slug, title, excerpt, cover_url, cover_alt, reading_minutes, source_insight_id, group_id, status, publish_at';

type Db = NonNullable<ReturnType<typeof getSupabaseServiceRole>>;

async function publishedVersions(db: Db, groupId: string): Promise<PublishedVersion[]> {
  const { data } = await db.from('insights').select(VERSION_COLUMNS).eq('group_id', groupId).eq('status', 'PUBLISHED').lte('publish_at', new Date().toISOString());
  return ((data ?? []) as Array<PublishedVersion & { locale: string }>).map((v) => ({ ...v, locale: asLocale(v.locale) }));
}

async function counts(db: Db) {
  const out = { active: { en: 0, tr: 0, az: 0, ar: 0 } as Record<string, number>, pending: 0, unsubscribed: 0 };
  const { data } = await db.from('newsletter_subscribers').select('locale, status').limit(50_000);
  for (const r of (data ?? []) as Array<{ locale: string; status: string }>) {
    if (r.status === 'active') out.active[r.locale] = (out.active[r.locale] ?? 0) + 1;
    else if (r.status === 'pending') out.pending += 1;
    else out.unsubscribed += 1;
  }
  return out;
}

async function groupOf(db: Db, insightId: string): Promise<string | null> {
  const { data } = await db.from('insights').select('group_id').eq('id', insightId).maybeSingle();
  return (data as { group_id: string } | null)?.group_id ?? null;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const db = getSupabaseServiceRole();
  if (!db) return NextResponse.json({ ok: false, error: 'Sunucu anahtarı yok.' }, { status: 503 });
  const groupId = request.nextUrl.searchParams.get('groupId');
  const probe = await db.from('newsletter_sends').select('id').limit(1);
  if (probe.error) return NextResponse.json({ ok: false, code: 'not_installed', error: 'Bülten tabloları yok (supabase/upgrade-v16-newsletter.sql çalıştırılmalı).' }, { status: 503 });

  if (groupId && /^[0-9a-f-]{36}$/.test(groupId)) {
    const [c, versions, send] = await Promise.all([
      counts(db),
      publishedVersions(db, groupId),
      db.from('newsletter_sends').select('*').eq('group_id', groupId).maybeSingle(),
    ]);
    return NextResponse.json({ ok: true, mailer: mailerReady(), counts: c, versions: versions.map((v) => v.locale), published: versions.map((v) => ({ id: v.id, locale: v.locale, title: v.title, excerpt: v.excerpt })), send: send.data ?? null });
  }

  const [c, subs, sends] = await Promise.all([
    counts(db),
    db.from('newsletter_subscribers').select('id, email, locale, status, source, created_at, confirmed_at, unsubscribed_at').order('created_at', { ascending: false }).limit(500),
    db.from('newsletter_sends').select('id, group_id, insight_id, status, test_sent_at, started_at, finished_at, recipients, sent, failed, created_by').order('created_at', { ascending: false }).limit(30),
  ]);
  const ids = ((sends.data ?? []) as Array<{ insight_id: string | null }>).map((s) => s.insight_id).filter(Boolean) as string[];
  const titles = ids.length ? (((await db.from('insights').select('id, title').in('id', ids)).data ?? []) as Array<{ id: string; title: string }>) : [];
  return NextResponse.json({ ok: true, mailer: mailerReady(), counts: c, subscribers: subs.data ?? [], sends: (sends.data ?? []).map((s) => ({ ...s, title: titles.find((x) => x.id === (s as { insight_id: string }).insight_id)?.title ?? null })) });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const db = getSupabaseServiceRole();
  if (!db) return NextResponse.json({ ok: false, error: 'Sunucu anahtarı yok.' }, { status: 503 });
  if (!mailerReady()) return NextResponse.json({ ok: false, error: 'E-posta gönderimi kurulu değil (RESEND_API_KEY).' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; insightId?: string; copy?: unknown };
  if (!/^[0-9a-f-]{36}$/.test(String(body.insightId ?? ''))) return NextResponse.json({ ok: false, error: 'insightId gerekli.' }, { status: 400 });
  const groupId = await groupOf(db, String(body.insightId));
  if (!groupId) return NextResponse.json({ ok: false, error: 'İçerik bulunamadı.' }, { status: 404 });
  const versions = await publishedVersions(db, groupId);
  if (!versions.length) return NextResponse.json({ ok: false, error: 'Bu yazının yayınlanmış bir dili yok. Önce yayınlayın.' }, { status: 422 });
  const site = process.env.VERCEL_ENV === 'production' ? SITE : request.nextUrl.origin;

  const { data: existing } = await db.from('newsletter_sends').select('*').eq('group_id', groupId).maybeSingle();
  let send = existing as { id: string; status: string; test_sent_at: string | null; recipients: number; copy?: unknown } | null;
  const copy = sanitizeCopy(send?.copy);
  const copyFor = (l: NewsletterLocale): EmailCopy | null => copy[l] ?? null;

  if (body.action === 'save_copy') {
    if (send && send.status !== 'draft') return NextResponse.json({ ok: false, error: 'Gönderim başladıktan sonra e-posta metni değiştirilemez.' }, { status: 409 });
    const next = sanitizeCopy((body as { copy?: unknown }).copy);
    const now = new Date().toISOString();
    const res = send
      ? await db.from('newsletter_sends').update({ copy: next, test_sent_at: null, test_sent_to: null, updated_at: now }).eq('id', send.id)
      : await db.from('newsletter_sends').insert({ group_id: groupId, insight_id: body.insightId, status: 'draft', copy: next, created_by: admin.email ?? admin.id });
    if (res.error) return NextResponse.json({ ok: false, error: res.error.message.includes('copy') ? 'v17 SQL çalıştırılmalı (newsletter_sends.copy).' : res.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, copy: next });
  }

  if (body.action === 'test') {
    const to = admin.email;
    if (!to) return NextResponse.json({ ok: false, error: 'Hesabınızın e-posta adresi okunamadı.' }, { status: 400 });
    const results: string[] = [];
    for (const v of versions) {
      const mail = issueEmail({ locale: v.locale, version: v, url: articleUrl(site, v), unsubscribeUrl: unsubscribeUrl(site, '0'.repeat(48)), copy: copyFor(v.locale), test: true });
      const r = await sendOne({ to, ...mail });
      results.push(`${v.locale.toUpperCase()}: ${r.ok ? 'gönderildi' : r.error}`);
    }
    const now = new Date().toISOString();
    if (send) await db.from('newsletter_sends').update({ test_sent_at: now, test_sent_to: to, updated_at: now }).eq('id', send.id);
    else await db.from('newsletter_sends').insert({ group_id: groupId, insight_id: body.insightId, status: 'draft', test_sent_at: now, test_sent_to: to, created_by: to });
    return NextResponse.json({ ok: true, to, results });
  }

  if (body.action !== 'send') return NextResponse.json({ ok: false, error: 'Geçersiz işlem.' }, { status: 400 });
  if (!send?.test_sent_at || Date.now() - Date.parse(send.test_sent_at) > TEST_VALID_MS) {
    return NextResponse.json({ ok: false, error: 'Önce “Bana deneme gönder” ile e-postayı kendinize gönderip kontrol edin (son 24 saat içinde).' }, { status: 422 });
  }
  if (send.status === 'sent') return NextResponse.json({ ok: false, error: 'Bu yazı bültenle zaten gönderildi.' }, { status: 409 });

  const startedAt = Date.now();
  if (send.status === 'draft') {
    // Claim the send (a second click or tab finds status ≠ draft and only continues).
    const { data: claimed } = await db.from('newsletter_sends').update({ status: 'sending', started_at: new Date().toISOString(), insight_id: body.insightId, created_by: admin.email ?? admin.id }).eq('id', send.id).eq('status', 'draft').select('id').maybeSingle();
    if (claimed) {
      let from = 0;
      let total = 0;
      for (;;) {
        const { data: page } = await db.from('newsletter_subscribers').select('id, locale').eq('status', 'active').order('created_at').range(from, from + 999);
        const rows = (page ?? []) as Array<{ id: string; locale: string }>;
        if (!rows.length) break;
        await db.from('newsletter_deliveries').upsert(rows.map((r) => ({ send_id: send!.id, subscriber_id: r.id, locale: r.locale })), { onConflict: 'send_id,subscriber_id', ignoreDuplicates: true });
        total += rows.length;
        if (rows.length < 1000) break;
        from += 1000;
      }
      await db.from('newsletter_sends').update({ recipients: total }).eq('id', send.id);
      send = { ...send, status: 'sending', recipients: total };
    }
  } else if (send.status === 'partial') {
    await db.from('newsletter_deliveries').update({ status: 'queued', error: null }).eq('send_id', send.id).eq('status', 'failed');
    await db.from('newsletter_sends').update({ status: 'sending' }).eq('id', send.id);
  }

  // Deliver queued rows in batches until done or the time budget is used.
  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const { data: queued } = await db
      .from('newsletter_deliveries')
      .select('id, locale, subscriber:newsletter_subscribers(email, status, unsubscribe_token)')
      .eq('send_id', send.id)
      .eq('status', 'queued')
      .order('id')
      .limit(BATCH);
    const rows = (queued ?? []) as unknown as Array<{ id: number; locale: string; subscriber: { email: string; status: string; unsubscribe_token: string } | null }>;
    if (!rows.length) break;
    const skip = rows.filter((r) => !r.subscriber || r.subscriber.status !== 'active');
    if (skip.length) await db.from('newsletter_deliveries').update({ status: 'skipped' }).in('id', skip.map((r) => r.id));
    const live = rows.filter((r) => r.subscriber && r.subscriber.status === 'active');
    if (!live.length) continue;
    const mails: OutgoingEmail[] = live.map((r) => {
      const v = pickVersion(asLocale(r.locale), versions) as PublishedVersion;
      const unsub = unsubscribeUrl(site, r.subscriber!.unsubscribe_token);
      return { to: r.subscriber!.email, ...issueEmail({ locale: asLocale(r.locale), version: v, url: articleUrl(site, v), unsubscribeUrl: unsub, copy: copyFor(v.locale) }), unsubscribeUrl: unsub };
    });
    const results = await sendBatch(mails, `nl-${send.id}-${live[0].id}-${live[live.length - 1].id}`);
    const now = new Date().toISOString();
    for (const part of chunk(live.map((r, i) => ({ r, res: results[i] })), 25)) {
      await Promise.all(part.map(({ r, res }) => db.from('newsletter_deliveries').update(res.ok ? { status: 'sent', provider_id: res.id ?? null, sent_at: now, error: null } : { status: 'failed', error: res.error ?? 'hata' }).eq('id', r.id)));
    }
    if (results.every((x) => !x.ok)) break; // provider refused the whole batch: stop, report
    await new Promise((r) => setTimeout(r, 600)); // stay under the provider's request rate
  }

  const stat = async (status: string) => (await db.from('newsletter_deliveries').select('id', { count: 'exact', head: true }).eq('send_id', send!.id).eq('status', status)).count ?? 0;
  const [sentN, failedN, queuedN] = await Promise.all([stat('sent'), stat('failed'), stat('queued')]);
  const done = queuedN === 0;
  await db.from('newsletter_sends').update({ sent: sentN, failed: failedN, status: done ? (failedN ? 'partial' : 'sent') : 'sending', ...(done ? { finished_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() }).eq('id', send.id);
  return NextResponse.json({ ok: true, recipients: send.recipients, sent: sentN, failed: failedN, remaining: queuedN, status: done ? (failedN ? 'partial' : 'sent') : 'sending', locales: NEWSLETTER_LOCALES });
}
