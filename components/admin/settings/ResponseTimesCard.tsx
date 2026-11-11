'use client';

import { useEffect, useState } from 'react';
import { Card, Notice } from '@/components/admin/cockpit/Widgets';
import { adminApi, adminPost } from '@/lib/cockpit/client';
import { buildResponseCopy, type ResponseTimes } from '@/lib/responseCopy';
import { getDict } from '@/lib/i18n';

/**
 * Yoca Admin — Ayarlar → Yanıt süreleri.
 * "Süreleri sitede göster (sahip onayı)" is OFF by default: the site then shows neutral
 * copy without durations. Turning it on switches the contact and Check-Up
 * texts (4 languages) to the timed versions with these business days.
 */

interface Data {
  ok: boolean;
  error?: string;
  ready?: boolean;
  responseTimes?: ResponseTimes;
  preview?: { now: string; contactDue: string; checkupDue: string };
}

const fmt = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export default function ResponseTimesCard() {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<ResponseTimes | null>(null);
  const [holidayText, setHolidayText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await adminApi<Data>('/api/admin/site-settings');
    setData(r);
    if (r.ok && r.responseTimes) {
      setDraft(r.responseTimes);
      setHolidayText(r.responseTimes.holidays.join('\n'));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (next: ResponseTimes) => {
    if (next.approved && !draft?.approved && !window.confirm(`Sitede “${next.contactDays} iş günü” (iletişim) ve “${next.checkupDays} iş günü” (Check-Up) yanıt süresi taahhüdü yayınlanacak. Bu süreleri gerçekten karşılayabileceğinizi onaylıyor musunuz?`)) return;
    setBusy(true);
    const r = await adminPost<{ ok: boolean; error?: string }>('/api/admin/site-settings', { key: 'site_copy', value: { ...next, holidays: holidayText.split(/\s+/).filter(Boolean) } });
    setBusy(false);
    setMsg(r.ok ? 'Kaydedildi.' : r.error ?? 'Kaydedilemedi.');
    setTimeout(() => setMsg(null), 4000);
    load();
  };

  if (!data) return <Card title="Yanıt süreleri"><div className="h-24 animate-pulse rounded-md bg-surface" /></Card>;
  if (!data.ok || !draft) return <Card title="Yanıt süreleri"><Notice tone="warning">Okunamadı: {data.error ?? 'bilinmeyen hata'}</Notice></Card>;
  const tr = buildResponseCopy('tr', draft, getDict('tr').checkup.questions.length);

  return (
    <Card title="Yanıt süreleri" action={msg ? <span className="text-[12px] font-bold text-yoca-lime">{msg}</span> : undefined}>
      <div className="grid gap-3 text-[13px]">
        {!data.ready && <Notice tone="warning">Ayar tablosu okunamıyor (SUPABASE_SERVICE_ROLE_KEY / v9). Site nötr metinleri kullanıyor.</Notice>}
        <label className="flex cursor-pointer items-start gap-3 admin-box p-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-yoca-lime" checked={draft.approved} disabled={busy} onChange={(e) => save({ ...draft, approved: e.target.checked })} />
          <span>
            <span className="block font-bold text-white">Süreleri sitede göster (sahip onayı)</span>
            <span className="block text-[12px] text-subtle">Varsayılan: kapalı. Kapalıyken sitede süre verilmez (nötr metinler). Açınca aşağıdaki iş günü süreleri 4 dilde iletişim ve Check-Up metinlerine girer. Ziyaretçiye tarih gösterilmez; hedef tarih yalnızca Leadler sayfasında görünür.{draft.approved && draft.approvedAt ? ` Onaylayan: ${draft.approvedBy ?? '—'} · ${new Date(draft.approvedAt).toLocaleString('tr-TR')}` : ''}</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="admin-label">İletişim formu (iş günü)
            <input type="number" min={1} max={30} value={draft.contactDays} onChange={(e) => setDraft({ ...draft, contactDays: Number(e.target.value) })} className="admin-input" />
          </label>
          <label className="admin-label">Check-Up (iş günü)
            <input type="number" min={1} max={30} value={draft.checkupDays} onChange={(e) => setDraft({ ...draft, checkupDays: Number(e.target.value) })} className="admin-input" />
          </label>
        </div>
        <label className="admin-label">Tatil günleri (iş günü sayılmaz; her satıra YYYY-AA-GG — kendiniz girin, hazır liste yok)
          <textarea rows={3} value={holidayText} onChange={(e) => setHolidayText(e.target.value)} className="admin-input font-mono text-[12px]" placeholder="2027-01-01" />
        </label>
        <button type="button" className="admin-btn w-fit" disabled={busy} onClick={() => save(draft)}>Süreleri kaydet</button>
        {data.preview && (
          <p className="text-[12px] text-subtle">İş günleri İstanbul saatine göre, hafta sonu hariç sayılır; resmî tatil verisi yok, yukarıya girdiğiniz günler düşülür. Bugün gelen bir mesaj için hedef tarih: iletişim {fmt(data.preview.contactDue)}, Check-Up {fmt(data.preview.checkupDue)}.</p>
        )}
        <details className="text-[12px]">
          <summary className="cursor-pointer font-bold text-white">Sitede şu an görünecek metin (Türkçe)</summary>
          <ul className="mt-2 grid gap-1.5 text-muted">
            <li><b>İletişim açıklaması:</b> {tr.contactDescription}</li>
            <li><b>İletişim onayı:</b> {tr.contactSuccess}</li>
            <li><b>Check-Up açıklaması:</b> {tr.checkupDescription}</li>
            <li><b>Check-Up onayı:</b> {tr.checkupSuccess}</li>
            <li><b>Not:</b> {tr.receiptNote}</li>
          </ul>
        </details>
      </div>
    </Card>
  );
}
