'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Flash, PageHead, field, label, small, toList } from '@/components/admin/ops/ui';
import { adminApi, adminPost } from '@/lib/cockpit/client';
import { DEFAULT_OPS, LICENSE_ACTIONS, LICENSE_ACTION_LABEL, type LicenseAction, type OpsSettings } from '@/lib/ops/settings';

/**
 * Yoca Operasyon — ayarlar (cockpit_settings "ops", via /api/admin/ops/settings).
 * Reminder days, the daily digest, the customer-notification master switch
 * (off by default; a service must ALSO be switched on; test / preview
 * deployments never send to real people) and license permissions per action.
 */

interface Env { send: { email: boolean; telegram: boolean; reason: string }; licenseApi: { configured: boolean; missing: string[] }; cronSecret: boolean }
interface GetRes { ok?: boolean; error?: string; ready?: boolean; settings?: OpsSettings; me?: string | null; environment?: Env; team?: { email: string | null; telegram: boolean; telegramName: string | null; lastDigest?: { day: string; status: string; attempts: number; note: string | null; sentAt: string | null; email: string | null; telegram: string | null } | null } }
interface PostRes { ok?: boolean; error?: string; settings?: OpsSettings }

interface Draft { reminderDays: string; cancelReminderDays: string; digest: boolean; customerNotifications: boolean; customerFrom: string; perms: Record<LicenseAction, string> }

const toDraft = (s: OpsSettings): Draft => ({
  reminderDays: s.reminderDays.join(', '), cancelReminderDays: s.cancelReminderDays.join(', '), digest: s.digest,
  customerNotifications: s.customerNotifications, customerFrom: s.customerFrom ?? '',
  perms: Object.fromEntries(LICENSE_ACTIONS.map((a) => [a, (s.licensePermissions[a] ?? []).join('\n')])) as Record<LicenseAction, string>,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseDays(text: string): { days: number[]; bad: string[] } {
  const parts = toList(text);
  const bad = parts.filter((p) => !/^\d+$/.test(p) || Number(p) < 1 || Number(p) > 365);
  const days = Array.from(new Set(parts.filter((p) => !bad.includes(p)).map(Number))).sort((a, b) => b - a);
  return { days, bad };
}

const CH_LABEL: Record<string, string> = { sent: 'gönderildi', failed: 'gönderilemedi (yeniden denenecek)', unknown: 'sonuç belirsiz', pending: 'bekliyor', skipped: 'kanal yok' };
const CH_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted'> = { sent: 'ok', failed: 'bad', unknown: 'warn', pending: 'muted', skipped: 'muted' };

export default function OpsSettingsPage() {
  const [res, setRes] = useState<GetRes | null>(null);
  const [saved, setSaved] = useState<OpsSettings | null>(null);
  const [d, setD] = useState<Draft>(toDraft(DEFAULT_OPS));
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'bad' | 'warn' } | null>(null);

  const load = async () => {
    const r = await adminApi<GetRes>('/api/admin/ops/settings');
    setRes(r);
    if (r.ok !== false && r.settings) { setSaved(r.settings); setD(toDraft(r.settings)); }
  };
  useEffect(() => { void load(); }, []);

  const env = res?.environment;
  const me = res?.me ?? null;
  const dirty = saved ? JSON.stringify(d) !== JSON.stringify(toDraft(saved)) : false;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const rem = parseDays(d.reminderDays);
    const can = parseDays(d.cancelReminderDays);
    const problems: string[] = [];
    if (rem.bad.length) problems.push(`Hatırlatma günleri geçersiz: ${rem.bad.join(', ')} (1–365 arası tam sayı).`);
    if (can.bad.length) problems.push(`İptal hatırlatma günleri geçersiz: ${can.bad.join(', ')}.`);
    if (rem.days.length > 8 || can.days.length > 8) problems.push('En çok 8 hatırlatma günü girilebilir.');
    const perms = Object.fromEntries(LICENSE_ACTIONS.map((a) => [a, Array.from(new Set(toList(d.perms[a]).map((x) => x.toLowerCase())))])) as Record<LicenseAction, string[]>;
    LICENSE_ACTIONS.forEach((a) => {
      const bad = perms[a].filter((x) => !EMAIL.test(x));
      if (bad.length) problems.push(`${LICENSE_ACTION_LABEL[a]}: geçersiz e-posta ${bad.join(', ')}.`);
    });
    if (problems.length) { setFlash({ text: problems.join(' '), tone: 'bad' }); return; }

    const settings: OpsSettings = {
      reminderDays: rem.days, cancelReminderDays: can.days, digest: d.digest,
      // automatic customer e-mails are permanently off
      customerNotifications: false, customerFrom: null, licensePermissions: perms,
    };
    setBusy(true); setFlash(null);
    const r = await adminPost<PostRes>('/api/admin/ops/settings', { settings });
    setBusy(false);
    if (!r.ok || !r.settings) { setFlash({ text: r.error ?? 'Kaydedilemedi.', tone: 'bad' }); return; }
    const changed = JSON.stringify(r.settings) !== JSON.stringify(settings);
    setSaved(r.settings);
    setD(toDraft(r.settings));
    setFlash({ text: changed ? 'Kaydedildi. Sunucu bazı değerleri düzeltti (ör. tekrar eden veya geçersiz değerler çıkarıldı); kaydedilen hâli gösteriliyor.' : 'Kaydedildi.', tone: changed ? 'warn' : 'ok' });
  };

  const addMe = (a: LicenseAction) => {
    if (!me) return;
    const list = toList(d.perms[a]);
    if (list.map((x) => x.toLowerCase()).includes(me.toLowerCase())) return;
    setD({ ...d, perms: { ...d.perms, [a]: [...list, me].join('\n') } });
  };

  if (!res) return <div className="grid gap-6"><PageHead title="Operasyon ayarları" /><p className="text-[13px] text-subtle">Yükleniyor…</p></div>;
  if (res.ok === false) return <div className="grid gap-6"><PageHead title="Operasyon ayarları" /><Flash tone="bad" message={res.error ?? 'Ayarlar okunamadı.'} /><button type="button" className="admin-btn justify-self-start" onClick={() => void load()}>Tekrar dene</button></div>;

  return (
    <div className="grid gap-6">
      <PageHead title="Operasyon ayarları" sub="Ekip içi hatırlatmalar, günlük özet ve lisans işlem yetkileri." />
      {res.ready === false && <Flash tone="warn" message="Kayıtlı ayarlar okunamadı (cockpit_settings tablosu veya sunucu anahtarı yok). Varsayılanlar gösteriliyor; kaydetme başarısız olabilir." />}
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}

      <form onSubmit={save} className="grid gap-5">
        <section className="admin-card grid gap-4 !p-4">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Ekip hatırlatmaları</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Varsayılan hatırlatma günleri (bitişten önce)
              <input className={field} value={d.reminderDays} onChange={(e) => setD({ ...d, reminderDays: e.target.value })} placeholder="30, 14, 7, 1" inputMode="numeric" />
              <span className="text-[12px] font-normal text-subtle">Virgülle; 1–365, en çok 8 değer. Hizmette kendi günleri yazılıysa o geçerli.</span>
            </label>
            <label className={label}>İptal / bildirim son günü hatırlatmaları
              <input className={field} value={d.cancelReminderDays} onChange={(e) => setD({ ...d, cancelReminderDays: e.target.value })} placeholder="14, 3" inputMode="numeric" />
              <span className="text-[12px] font-normal text-subtle">Hizmetteki “son iptal günü”nden önce.</span>
            </label>
          </div>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" className="mt-1" checked={d.digest} onChange={(e) => setD({ ...d, digest: e.target.checked })} />
            <span>Günlük özet (yalnızca ekibe): bugünün hatırlatmaları, bitişi geçen / doğrulama bekleyen yenilemeler, geciken tahsilat ve sağlayıcı ödemeleri, geciken görevler. Takip edilecek bir şey yoksa e-posta gitmez.</span>
          </label>
        </section>

        <section className="admin-card grid gap-3 !p-4" aria-label="Bildirimlerin akışı">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Bildirimlerin akışı</h2>
          <ul className="grid list-disc gap-1 ps-5 text-[12px] text-soft">
            <li><strong>Ekip içi günlük özet:</strong> her gün 09:00 (İstanbul); 15:00’te yalnızca gönderilemeyen kanal (e-posta veya Telegram) yeniden denenir; başarılı kanala aynı özet tekrar gitmez. Günde en çok bir özet; takip edilecek iş yoksa gönderilmez.</li>
            <li><strong>Alıcı:</strong> kokpit bildirim adresi {res.team?.email ? <strong className="text-white">{res.team.email}</strong> : 'tanımlı değil'}{res.team?.telegram ? ` ve ekip Telegram grubu${res.team.telegramName ? ` (${res.team.telegramName})` : ''}` : ''}. Değiştirmek için <Link className="underline" href="/admin/settings">Ayarlar → Bildirimler</Link>.</li>
            <li><strong>Sabah özeti</strong> (08:30) ayrıdır: leadler, takipler, site izleme ve trafik. Operasyon özeti bunları tekrar etmez.</li>
            <li><strong>Müşteriye otomatik e-posta yoktur.</strong> Müşteri kaydındaki e-posta gönderim izni değildir. Müşteriye veya başka bir adrese bildirmek için hizmet sayfasında “E-postayla ilet” kullanılır: alıcı, konu, mesaj ve ekler elle belirlenir, “Gönder” denmeden hiçbir şey gitmez.</li>
          </ul>
          <div className="grid gap-1 border-t border-line pt-2 text-[12px]">
            <span className="text-muted">Son ekip özeti</span>
            {res.team?.lastDigest ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums">{res.team.lastDigest.day}</span>
                <Badge tone={CH_TONE[res.team.lastDigest.email ?? ''] ?? 'muted'}>E-posta: {CH_LABEL[res.team.lastDigest.email ?? ''] ?? '—'}</Badge>
                <Badge tone={CH_TONE[res.team.lastDigest.telegram ?? ''] ?? 'muted'}>Telegram: {CH_LABEL[res.team.lastDigest.telegram ?? ''] ?? '—'}</Badge>
                <span className="text-subtle">{res.team.lastDigest.attempts} deneme</span>
              </span>
            ) : <span className="text-subtle">Henüz özet gönderilmedi (takip edilecek iş olmayan günlerde özet gitmez).</span>}
            {res.team?.lastDigest?.note && <span className="text-yellow-200">{res.team.lastDigest.note}</span>}
          </div>
          {env && (
            <p className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-muted">Bu ortam:</span>
              <Badge tone={env.send.email ? 'ok' : 'muted'}>E-posta {env.send.email ? 'gönderebilir' : 'gönderemez'}</Badge>
              <Badge tone={env.send.telegram ? 'ok' : 'muted'}>Telegram {env.send.telegram ? 'gönderebilir' : 'gönderemez'}</Badge>
              <span className="text-subtle">({env.send.reason === 'production' ? 'canlı ortam' : env.send.reason})</span>
            </p>
          )}
        </section>

        <section className="admin-card grid gap-4 !p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Lisans işlem yetkileri</h2>
            <span className="text-[12px] text-subtle">Oturumdaki yönetici: <strong className="text-white">{me ?? 'bilinmiyor'}</strong></span>
          </div>
          <p className="text-[12px] text-muted">Her işlem ayrı yetkidir; listede e-postası olmayan yönetici o işlemi yapamaz (varsayılan: kimse). Bir satıra bir e-posta veya virgülle.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {LICENSE_ACTIONS.map((a) => (
              <label key={a} className={label}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>{LICENSE_ACTION_LABEL[a]}</span>
                  {me && <button type="button" className={small} onClick={() => addMe(a)}>Beni ekle</button>}
                </span>
                <textarea className={field} rows={2} value={d.perms[a]} onChange={(e) => setD({ ...d, perms: { ...d.perms, [a]: e.target.value } })} placeholder="ad@yoca.net" />
                {a === 'revoke' && <span className="text-[12px] font-normal text-red-300">İptal geri alınamaz; bu yetkiyi olabildiğince az kişiye verin.</span>}
                {me && toList(d.perms[a]).map((x) => x.toLowerCase()).includes(me.toLowerCase()) && <span className="text-[12px] font-normal text-yoca-green">Siz bu işlemi yapabilirsiniz.</span>}
              </label>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy || !dirty} className="admin-btn-primary">{busy ? 'Kaydediliyor…' : dirty ? 'Ayarları kaydet' : 'Kaydedildi'}</button>
          {dirty && saved && <button type="button" className="admin-btn" onClick={() => setD(toDraft(saved))}>Değişiklikleri geri al</button>}
        </div>
      </form>

      {env && (
        <section className="admin-card grid gap-3 !p-4" aria-label="Ortam">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Ortam (yalnızca okunur)</h2>
          <dl className="grid gap-2 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
              <dt className="text-muted">Lisans API’si (license.yoca.net)</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {env.licenseApi.configured ? <Badge tone="ok">Yapılandırıldı</Badge> : <><Badge tone="warn">Bağlı değil</Badge><span className="text-[12px] text-subtle">Eksik: {env.licenseApi.missing.map((m) => <code key={m} className="ms-1 text-yoca-lime">{m}</code>)}</span></>}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
              <dt className="text-muted">CRON_SECRET (zamanlanmış hatırlatmalar)</dt>
              <dd>{env.cronSecret ? <Badge tone="ok">Tanımlı</Badge> : <Badge tone="warn">Tanımlı değil (en az 32 karakter) — hatırlatmalar çalışmaz</Badge>}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
              <dt className="text-muted">Gerçek alıcılara gönderim</dt>
              <dd className="text-[12px]">{env.send.reason === 'production' ? 'Canlı ortam: açık' : env.send.reason}</dd>
            </div>
          </dl>
          <p className="text-[12px] text-subtle">Değerler gösterilmez, yalnızca var olup olmadıkları. Lisans işlemleri için <Link className="underline" href="/admin/ops/licenses">Lisanslar</Link>.</p>
        </section>
      )}
    </div>
  );
}
