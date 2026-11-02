'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Card, Notice, StatusBadge } from '@/components/admin/cockpit/Widgets';
import { adminApi, adminPost, fmtDate } from '@/lib/cockpit/client';

/**
 * Yoca Admin — Ayarlar (bildirimler ve entegrasyonlar).
 * Shows which integrations are set up (env vars, never their values),
 * links the Telegram chat, sets the alert e-mail and switches, and sends
 * test messages.
 */

interface Settings {
  ready: boolean;
  email_to: string;
  telegram_chat_id: string | null;
  telegram_chat_name?: string | null;
  lead_alerts: boolean;
  site_alerts: boolean;
  morning_summary: boolean;
}

interface Status {
  ok: boolean;
  error?: string;
  integrations: {
    telegram: boolean;
    telegramBot: string | null;
    telegramTokenValid: boolean | null;
    email: boolean;
    emailFrom: string;
    openai: boolean;
    cronSecret: boolean;
  };
  settings: Settings;
  state: { morning_last?: string; morning_last_at?: string; sites_last_at?: string };
}

type Channel = 'sent' | 'skipped' | 'error';
const CHANNEL: Record<Channel, string> = { sent: 'gönderildi', skipped: 'kurulu değil / kapalı', error: 'hata' };

function Row({ label, ok, children }: { label: string; ok: boolean | null; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2.5 text-[13px] last:border-0">
      <span className="font-bold text-white">{label}</span>
      <span className="flex items-center gap-2 text-subtle">
        {children}
        <StatusBadge kind={ok === null ? 'neutral' : ok ? 'good' : 'warning'}>{ok === null ? 'İsteğe bağlı' : ok ? 'Hazır' : 'Kurulmadı'}</StatusBadge>
      </span>
    </li>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-soft">{children}</ol>;
}

const code = (text: string) => <code className="text-yoca-lime">{text}</code>;

export default function AdminSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    const result = await adminApi<Status>('/api/admin/notify');
    setStatus(result);
    if (result.ok) setDraft(result.settings);
  };

  useEffect(() => {
    load();
  }, []);

  const say = (tone: 'ok' | 'error', text: string) => {
    setFlash({ tone, text });
    setTimeout(() => setFlash(null), 6000);
  };

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    const result = await adminPost<{ ok: boolean; error?: string; sent?: { email: Channel; telegram: Channel }; chat?: { name: string } }>('/api/admin/notify', { action, ...extra });
    setBusy(null);
    if (!result.ok) return say('error', result.error ?? 'İşlem başarısız.');
    if (result.sent) say('ok', `Telegram: ${CHANNEL[result.sent.telegram]} · E-posta: ${CHANNEL[result.sent.email]}`);
    else if (result.chat) say('ok', `Telegram bağlandı: ${result.chat.name}. Sohbete onay mesajı gitti.`);
    else say('ok', 'Kaydedildi.');
    load();
  };

  const save = (patch: Partial<Settings>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    act('save', { settings: { email_to: next.email_to, lead_alerts: next.lead_alerts, site_alerts: next.site_alerts, morning_summary: next.morning_summary } });
  };

  const i = status?.integrations;
  const s = status?.settings;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Ayarlar</h1>
          <p className="mt-1.5 text-[14px] text-muted">Bildirimler, sabah özeti ve yapay zekâ bağlantıları.</p>
        </div>
        {flash && (
          <span role="status" className={`text-[13px] font-bold ${flash.tone === 'ok' ? 'text-yoca-lime' : 'text-amber-300'}`}>
            {flash.text}
          </span>
        )}
      </header>

      {status && !status.ok && <Notice tone="warning">Ayarlar okunamadı: {status.error ?? 'oturum süresi dolmuş olabilir'}.</Notice>}
      {s && !s.ready && (
        <Notice tone="warning">
          Bildirim ayarlarını kaydetmek için Supabase’de {code('supabase/upgrade-v9-cockpit-phase2.sql')} dosyasını bir kez çalıştırın.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Bağlantılar">
          {!i ? (
            <div className="h-40 animate-pulse rounded-md bg-surface" />
          ) : (
            <ul>
              <Row label="Telegram botu" ok={i.telegram && i.telegramTokenValid !== false}>
                {i.telegramBot ? `@${i.telegramBot}` : i.telegram ? 'token geçersiz' : ''}
              </Row>
              <Row label="Telegram sohbeti" ok={Boolean(s?.telegram_chat_id)}>
                {s?.telegram_chat_name ?? ''}
              </Row>
              <Row label="E-posta (Resend)" ok={i.email}>
                {i.email ? s?.email_to : ''}
              </Row>
              <Row label="Yapay zekâ (OpenAI)" ok={i.openai}>
                {i.openai ? 'lead özeti, yanıt taslağı' : ''}
              </Row>
              <Row label="Zamanlanmış görev şifresi" ok={i.cronSecret ? true : null}>
                {i.cronSecret ? 'CRON_SECRET' : ''}
              </Row>
            </ul>
          )}
          {status?.state && (
            <p className="mt-3 text-[12px] text-subtle">
              Son site kontrolü: {status.state.sites_last_at ? fmtDate(status.state.sites_last_at) : 'henüz yok'} · Son sabah özeti:{' '}
              {status.state.morning_last_at ? fmtDate(status.state.morning_last_at) : 'henüz yok'}
            </p>
          )}
        </Card>

        <Card title="Ne zaman haber verilsin">
          {draft ? (
            <div className="grid gap-3">
              {(
                [
                  ['lead_alerts', 'Yeni lead', 'İletişim formu veya Check-Up gelince anında.'],
                  ['site_alerts', 'Site uyarıları', 'Bir müşteri sitesi çöker, askıya alınır veya imzası kalkarsa (15 dakikada bir kontrol; iki başarısız kontrolden sonra).'],
                  ['morning_summary', 'Sabah özeti', 'Her gün 08:30: yeni leadler, takipler, görevler, site uyarıları, dünkü trafik.'],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="flex cursor-pointer items-start gap-3 rounded-sm border border-line p-3">
                  <input type="checkbox" checked={draft[key]} disabled={!draft.ready || busy !== null} onChange={(e) => save({ [key]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-yoca-lime" />
                  <span>
                    <span className="block text-[13px] font-bold text-white">{label}</span>
                    <span className="block text-[12px] text-subtle">{hint}</span>
                  </span>
                </label>
              ))}
              <form
                className="grid gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  save({});
                }}
              >
                <label htmlFor="email-to" className="text-[12px] font-bold text-subtle">
                  Bildirim e-postası (virgülle birden fazla)
                </label>
                <div className="flex gap-2">
                  <input id="email-to" value={draft.email_to} onChange={(e) => setDraft({ ...draft, email_to: e.target.value })} className="admin-input flex-1 text-[13px]" disabled={!draft.ready} />
                  <button type="submit" className="admin-btn" disabled={!draft.ready || busy !== null}>
                    Kaydet
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="h-40 animate-pulse rounded-md bg-surface" />
          )}
        </Card>
      </div>

      <Card title="Dene">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-btn-primary" disabled={busy !== null} onClick={() => act('test')}>
            {busy === 'test' ? 'Gönderiliyor…' : 'Test bildirimi gönder'}
          </button>
          <button type="button" className="admin-btn" disabled={busy !== null} onClick={() => act('morning')}>
            {busy === 'morning' ? 'Hazırlanıyor…' : 'Sabah özetini şimdi gönder'}
          </button>
        </div>
        <p className="mt-2 text-[12px] text-subtle">Test, açık/kapalı ayarlarından bağımsız olarak kurulu tüm kanallara gider.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Telegram kurulumu">
          <Steps>
            <li>Telegram’da {code('@BotFather')}’ı açın, {code('/newbot')} yazın; bota bir ad (ör. Yoca Kokpit) ve {code('_bot')} ile biten bir kullanıcı adı verin.</li>
            <li>
              BotFather’ın verdiği token’ı Vercel → yoca-web → Settings → Environment Variables’a {code('TELEGRAM_BOT_TOKEN')} adıyla ekleyin (Production, Sensitive), sonra Redeploy.
            </li>
            <li>Telegram’da botunuzu açıp {code('/start')} yazın. Bir gruba bağlamak için botu gruba ekleyip grupta bir mesaj yazın.</li>
            <li>Aşağıdaki düğmeye basın; bot sohbete onay mesajı gönderir.</li>
          </Steps>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="admin-btn-primary" disabled={!i?.telegram || busy !== null} onClick={() => act('telegram-link')}>
              {busy === 'telegram-link' ? 'Bağlanıyor…' : s?.telegram_chat_id ? 'Yeniden bağla' : 'Telegram’ı bağla'}
            </button>
            {s?.telegram_chat_id && (
              <button type="button" className="admin-btn" disabled={busy !== null} onClick={() => act('telegram-unlink')}>
                Bağlantıyı kaldır
              </button>
            )}
          </div>
        </Card>

        <Card title="E-posta kurulumu">
          <Steps>
            <li>resend.com’da hesap açın → Domains → Add Domain → {code('yoca.net')}.</li>
            <li>Resend’in gösterdiği DNS kayıtlarını yoca.net’in DNS’ine ekleyin; durum “Verified” olunca hazır.</li>
            <li>
              API Keys → Create API Key (Sending access) → Vercel’e {code('RESEND_API_KEY')} adıyla ekleyin, sonra Redeploy.
            </li>
          </Steps>
          <p className="mt-3 text-[12px] text-subtle">Gönderen: {i?.emailFrom ?? 'Yoca <noreply@yoca.net>'}</p>
        </Card>

        <Card title="Yapay zekâ kurulumu">
          <Steps>
            <li>platform.openai.com → API keys → Create new secret key.</li>
            <li>
              Vercel’e {code('OPENAI_API_KEY')} adıyla ekleyin, sonra Redeploy. Aynı anahtar İçerik / Insights editöründeki yapay zekâyı da açar.
            </li>
            <li>Leadler sayfasında bir lead’i açıp “Özetle” veya “Yanıt taslağı”na basın.</li>
          </Steps>
          <p className="mt-3 text-[12px] text-subtle">Kullanım ücreti OpenAI hesabınıza yansır. Yapay zekâ hiçbir şeyi kendiliğinden göndermez; taslakları siz gönderirsiniz.</p>
        </Card>
      </div>
    </div>
  );
}
