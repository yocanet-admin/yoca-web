'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/insightsAdmin';

/**
 * Yoca Admin — "Bülten" box on a published article.
 * 1. "Bana deneme gönder": every published language version to your own
 *    address, marked [Deneme]. Check how it looks.
 * 2. "Bültene gönder": to every active subscriber, in their language
 *    (EN, otherwise the source article, when their language is not
 *    published). Possible once per article, within 24 h of a test.
 * Publishing never sends e-mail by itself.
 */

interface SendRow {
  status: 'draft' | 'sending' | 'sent' | 'partial';
  test_sent_at: string | null;
  test_sent_to: string | null;
  recipients: number;
  sent: number;
  failed: number;
  finished_at: string | null;
}
interface Info {
  mailer: boolean;
  counts: { active: Record<string, number>; pending: number; unsubscribed: number };
  versions: string[];
  send: SendRow | null;
}

const DAY = 24 * 60 * 60 * 1000;

export default function NewsletterBox({ insightId, groupId, dirty }: { insightId: string; groupId: string; dirty: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminFetch<Info & { code?: string }>(`/api/admin/newsletter?groupId=${groupId}`);
    if (!r.ok) { setError(r.error ?? 'Bülten bilgisi okunamadı.'); return; }
    setError(null);
    setInfo(r);
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <p className="text-[12px] text-yellow-300">{error}</p>;
  if (!info) return <p className="text-[12px] text-subtle">Bülten bilgisi yükleniyor…</p>;

  const active = Object.values(info.counts.active).reduce((a, b) => a + b, 0);
  const perLang = Object.entries(info.counts.active).filter(([, n]) => n > 0).map(([l, n]) => `${l.toUpperCase()} ${n}`).join(' · ');
  const fallback = Object.entries(info.counts.active).filter(([l, n]) => n > 0 && !info.versions.includes(l)).map(([l]) => l.toUpperCase());
  const testOk = Boolean(info.send?.test_sent_at && Date.now() - Date.parse(info.send.test_sent_at) < DAY);
  const status = info.send?.status;

  const test = async () => {
    setBusy('Deneme e-postası gönderiliyor…'); setNote(null);
    const r = await adminFetch<{ to?: string; results?: string[] }>('/api/admin/newsletter', { json: { action: 'test', insightId } });
    setBusy(null);
    setNote(r.ok ? `Deneme ${r.to} adresine gönderildi: ${(r.results ?? []).join(' · ')}. Gelen kutunuzu (ve gereksiz klasörünü) kontrol edin.` : r.error ?? 'Gönderilemedi.');
    await load();
  };

  const send = async () => {
    if (!window.confirm(`Bu yazı ${active} aktif aboneye e-postayla gönderilsin mi? Gönderim geri alınamaz.${fallback.length ? ` ${fallback.join(', ')} aboneleri, kendi dilleri yayında olmadığı için İngilizce (yoksa kaynak) sürümü alır.` : ''}`)) return;
    setBusy('Bülten gönderiliyor… (sayfayı kapatmayın)'); setNote(null);
    const r = await adminFetch<{ sent?: number; failed?: number; remaining?: number; status?: string }>('/api/admin/newsletter', { json: { action: 'send', insightId } });
    setBusy(null);
    setNote(r.ok ? `Gönderildi: ${r.sent ?? 0}${r.failed ? ` · başarısız: ${r.failed}` : ''}${r.remaining ? ` · kalan: ${r.remaining} (devam etmek için tekrar tıklayın)` : ''}.` : r.error ?? 'Gönderilemedi.');
    await load();
  };

  const small = 'admin-btn !px-2.5 !py-1 !text-[12px]';
  return (
    <div className="grid gap-2 text-[13px]">
      <p className="text-muted">
        Aktif abone: <strong className="text-white">{active}</strong>{perLang ? ` (${perLang})` : ''} · onay bekleyen: {info.counts.pending} · ayrılan: {info.counts.unsubscribed}
      </p>
      {!info.mailer && <p className="text-[12px] text-yellow-300">E-posta gönderimi kurulu değil (RESEND_API_KEY).</p>}
      {!info.versions.length ? (
        <p className="text-[12px] text-subtle">Bülten, yazı yayınlandıktan sonra gönderilebilir.</p>
      ) : status === 'sent' ? (
        <p className="text-[12px] text-yoca-green">Bu yazı bültenle gönderildi: {info.send?.sent} kişi{info.send?.finished_at ? ` · ${new Date(info.send.finished_at).toLocaleString('tr-TR')}` : ''}.</p>
      ) : (
        <>
          <p className="text-[12px] text-subtle">Yayındaki diller: {info.versions.map((l) => l.toUpperCase()).join(', ') || '—'}. Her abone kendi dilindeki sürümü alır.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={small} disabled={!!busy || dirty || !info.mailer} onClick={test}>Bana deneme gönder</button>
            <button type="button" className="admin-btn-primary !px-3 !py-1 !text-[12px]" disabled={!!busy || dirty || !info.mailer || !testOk || active === 0} onClick={send} title={!testOk ? 'Önce son 24 saat içinde kendinize deneme gönderin.' : undefined}>
              {status === 'sending' || status === 'partial' ? 'Gönderime devam et' : 'Bültene gönder'}
            </button>
          </div>
          {info.send?.test_sent_at && <p className="text-[11px] text-subtle">Son deneme: {new Date(info.send.test_sent_at).toLocaleString('tr-TR')} → {info.send.test_sent_to}{testOk ? '' : ' (24 saati geçti; yeniden deneme gönderin)'}</p>}
          {(status === 'sending' || status === 'partial') && <p className="text-[12px] text-yellow-300">Gönderim yarım kaldı: {info.send?.sent}/{info.send?.recipients} gönderildi{info.send?.failed ? `, ${info.send.failed} başarısız` : ''}. Devam ettiğinizde kimseye ikinci kopya gitmez.</p>}
        </>
      )}
      {busy && <p role="status" className="text-[12px] text-yoca-lime">{busy}</p>}
      {note && <p className="text-[12px] text-muted">{note}</p>}
    </div>
  );
}
