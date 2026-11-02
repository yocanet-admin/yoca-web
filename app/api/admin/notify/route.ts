import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/cockpit/auth';
import { getCronState, getNotifySettings, integrations, saveNotifySettings, type NotifySettings } from '@/lib/cockpit/settings';
import { buildMorningSummary } from '@/lib/cockpit/summary';
import { escapeHtml, notifyAdmins, sendTelegram, telegramApi } from '@/lib/notify';

/**
 * Yoca cockpit — notification settings API (admin only).
 * GET  → which integrations are set up, current settings, last cron runs.
 * POST { action: 'save', settings } | 'telegram-link' | 'telegram-unlink' | 'test' | 'morning'
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const unauthorized = () => NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized();
  const [settings, state] = await Promise.all([getNotifySettings(), getCronState()]);
  const env = integrations();
  const bot = env.telegram ? await telegramApi<{ username: string }>('getMe') : null;
  return NextResponse.json({
    ok: true,
    integrations: { ...env, telegramBot: bot?.ok ? bot.result?.username ?? null : null, telegramTokenValid: env.telegram ? Boolean(bot?.ok) : null },
    settings,
    state,
  });
}

interface TelegramUpdate {
  update_id: number;
  message?: { date: number; chat: { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string } };
  my_chat_member?: { date: number; chat: { id: number; type: string; title?: string } };
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { action?: string; settings?: Partial<NotifySettings> };

  switch (body.action) {
    case 'save': {
      const input = body.settings ?? {};
      const patch: Partial<NotifySettings> = {};
      if (typeof input.email_to === 'string') {
        const list = input.email_to.split(',').map((x) => x.trim()).filter(Boolean);
        if (list.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) return NextResponse.json({ ok: false, error: 'Geçersiz e-posta adresi.' }, { status: 422 });
        patch.email_to = list.join(', ');
      }
      for (const key of ['lead_alerts', 'site_alerts', 'morning_summary'] as const) {
        if (typeof input[key] === 'boolean') patch[key] = input[key];
      }
      const ok = await saveNotifySettings(patch);
      return NextResponse.json({ ok, error: ok ? undefined : 'Kaydedilemedi — upgrade-v9 SQL çalıştırıldı mı?' });
    }

    case 'telegram-link': {
      if (!integrations().telegram) return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN tanımlı değil.' });
      const updates = await telegramApi<TelegramUpdate[]>('getUpdates', { limit: 50, allowed_updates: ['message', 'my_chat_member'] });
      if (!updates?.ok) return NextResponse.json({ ok: false, error: `Telegram yanıt vermedi: ${updates?.description ?? 'token geçersiz olabilir'}` });
      const chats = (updates.result ?? [])
        .map((u) => u.message ?? u.my_chat_member)
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .sort((a, b) => b.date - a.date);
      const chat = chats[0]?.chat as (TelegramUpdate['message'] & object)['chat'] | undefined;
      if (!chat) return NextResponse.json({ ok: false, error: 'Bota henüz mesaj gelmemiş. Telegram’da botu açıp /start yazın, sonra tekrar deneyin.' });
      const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id);
      const saved = await saveNotifySettings({ telegram_chat_id: String(chat.id), telegram_chat_name: name });
      if (!saved) return NextResponse.json({ ok: false, error: 'Kaydedilemedi — upgrade-v9 SQL çalıştırıldı mı?' });
      await sendTelegram(String(chat.id), `✅ <b>Yoca kokpit bağlandı.</b>\nYeni lead, site uyarıları ve sabah özeti buraya gelecek.\n\nBağlayan: ${escapeHtml(admin.email ?? 'admin')}`);
      return NextResponse.json({ ok: true, chat: { id: String(chat.id), name } });
    }

    case 'telegram-unlink': {
      const ok = await saveNotifySettings({ telegram_chat_id: null, telegram_chat_name: null });
      return NextResponse.json({ ok });
    }

    case 'test': {
      const sent = await notifyAdmins({
        kind: 'test',
        force: true,
        subject: 'Yoca kokpit — test bildirimi',
        heading: 'Test bildirimi',
        html: `<p style="margin:0;">Bu bir test. Bildirimler bu adrese ulaşıyor.</p><p style="margin:8px 0 0 0;">Gönderen: ${escapeHtml(admin.email ?? 'admin')}</p>`,
        telegram: `🔔 <b>Test bildirimi</b>\nBildirimler bu sohbete ulaşıyor.\nGönderen: ${escapeHtml(admin.email ?? 'admin')}`,
      });
      return NextResponse.json({ ok: true, sent });
    }

    case 'morning': {
      const summary = await buildMorningSummary();
      const sent = await notifyAdmins({ kind: 'summary', force: true, subject: summary.subject, heading: summary.heading, html: summary.html, telegram: summary.telegram });
      return NextResponse.json({ ok: true, sent, counts: summary.counts });
    }

    default:
      return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
  }
}
