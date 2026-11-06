'use client';

import { useEffect, useState } from 'react';
import { Flash, field, label, small } from '@/components/admin/ops/ui';
import { adminPost } from '@/lib/cockpit/client';
import { newKey } from '@/lib/documents/client';
import { parseAddresses } from '@/lib/documents/mail';
import type { Contact, DocumentRow } from '@/lib/ops/data';
import type { Service } from '@/lib/ops/model';
import { customerReminderText } from '@/lib/ops/reminders';

/**
 * "E-postayla ilet": a reminder goes out of the team ONLY from here.
 *  - The recipient field starts EMPTY. Contact addresses are offered as
 *    buttons; an address is added only when clicked.
 *  - Subject and message start from a neutral text (service name and date
 *    only) and are editable. Attachments: the service's files, none ticked.
 *  - "Kurumsal dille düzenle" asks the AI for a suggestion of the message
 *    only; nothing changes until "Uygula".
 *  - The preview is the exact e-mail the server will send.
 *  - Nothing is sent until "Gönder". One dialog = one request key: a double
 *    click or "Yeniden dene" never sends a second copy.
 */

type Result = { ok: boolean; status?: string; error?: string; id?: string; replay?: boolean };
interface Preview { ok: boolean; html?: string; warnings?: string[]; from?: string; replyTo?: string; error?: string; mailReady?: boolean }

export function ForwardDialog({ service, target, offset, clientName, contacts, documents, reminderId, onClose, onSent }: {
  service: Service;
  /** reminder target date (end / cancellation deadline) and offset; null when the end date is unknown */
  target: string | null; offset: number;
  clientName: string | null;
  contacts: Contact[];
  documents: DocumentRow[];
  reminderId?: string | null;
  onClose: () => void; onSent: () => void;
}) {
  const initial = target ? customerReminderText(service, target, offset, clientName) : { subject: `${service.name} hakkında`, text: `Merhaba${clientName ? ` ${clientName}` : ''},\n\n\n\nYoca` };
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(initial.subject);
  const [message, setMessage] = useState(initial.text);
  const [attach, setAttach] = useState<string[]>([]);
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ai, setAi] = useState<{ busy: boolean; text?: string; changes?: string[]; warnings?: string[]; error?: string }>({ busy: false });
  const locked = Boolean(result && (result.status === 'unknown' || result.status === 'sending'));
  const done = Boolean(result?.ok);

  const toP = parseAddresses(to);
  const ccP = parseAddresses(cc);
  const problems = [
    !toP.list.length ? 'Alıcı adresini yazın veya aşağıdan seçin.' : '',
    toP.invalid.length || ccP.invalid.length ? `Geçersiz adres: ${[...toP.invalid, ...ccP.invalid].join(', ')}` : '',
    toP.tooMany || ccP.tooMany ? 'En fazla 10 alıcı ve 10 CC adresi.' : '',
    !subject.trim() ? 'Konu boş olamaz.' : '',
    !message.trim() ? 'Mesaj boş olamaz.' : '',
  ].filter(Boolean);

  // After a definite failure an edited e-mail is a new send (new key); an unclear one stays locked.
  const edit = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); if (result && result.status === 'failed') { setKey(newKey()); setResult(null); } };

  // The exact e-mail (server-side), refreshed shortly after each change.
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await adminPost<Preview>('/api/admin/ops/forward', { action: 'preview', serviceId: service.id, subject, message, attachmentIds: attach });
      setPreview(r);
    }, 400);
    return () => clearTimeout(t);
  }, [service.id, subject, message, attach]);

  const pick = (email: string) => {
    const list = parseAddresses(to).list;
    if (list.some((x) => x.toLowerCase() === email.toLowerCase())) return;
    edit(setTo)([...list, email].join(', '));
  };

  const askAi = async () => {
    if (ai.busy || !message.trim()) return;
    setAi({ busy: true });
    const r = await adminPost<{ ok: boolean; error?: string; suggestion?: { text: string; changes?: string[]; warnings?: string[] } }>('/api/admin/documents/ai', { mode: 'rewrite', op: 'formal', locale: 'tr', text: message, requestKey: newKey() });
    setAi(r.ok && r.suggestion ? { busy: false, text: r.suggestion.text, changes: r.suggestion.changes, warnings: r.suggestion.warnings } : { busy: false, error: r.error ?? 'Yapay zekâ yanıt vermedi; mesajınız değişmedi.' });
  };

  const send = async () => {
    if (busy || done) return;
    setBusy(true);
    const r = await adminPost<Result>('/api/admin/ops/forward', { action: 'send', serviceId: service.id, to, cc, subject, message, attachmentIds: attach, targetDate: target, offsetDays: target ? offset : null, reminderId: reminderId ?? null, requestKey: key });
    setBusy(false);
    // No answer (connection dropped, timeout page): unclear, not a failure and not a success.
    const status = r.status ?? (r.ok ? 'accepted' : r.id || /ulaşılamadı|zaman aşımı|Sunucu hatası/i.test(r.error ?? '') ? 'unknown' : 'failed');
    setResult({ ...r, status });
    if (r.ok) onSent();
  };

  const contactEmails = contacts.filter((c) => c.email).map((c) => ({ email: c.email as string, who: [c.name, c.role].filter(Boolean).join(' · ') }));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="forward-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="admin-card grid max-h-[92vh] w-full max-w-3xl gap-4 overflow-y-auto p-5">
        <div>
          <h2 id="forward-title" className="text-[17px] font-extrabold">E-postayla ilet · {service.name}</h2>
          <p className="mt-1 text-[12px] text-subtle">Elle iletme: yalnızca yazdığınız veya seçtiğiniz adrese, siz “Gönder” deyince gider. Müşteri adresi kendiliğinden eklenmez. {preview?.from ? `Gönderen: ${preview.from}${preview.replyTo ? ` · yanıtlar: ${preview.replyTo}` : ''}.` : ''}</p>
        </div>

        <fieldset disabled={busy || locked || done} className="grid gap-3">
          <label className={label}>Alıcı (virgülle birden fazla)<input className={field} value={to} onChange={(e) => edit(setTo)(e.target.value)} placeholder="Adresi yazın veya aşağıdan seçin" autoComplete="off" /></label>
          {contactEmails.length > 0 && (
            <div className="grid gap-1.5 text-[12px]">
              <span className="text-subtle">Müşteri kişileri (tıklayınca alıcıya eklenir):</span>
              <div className="flex flex-wrap gap-1.5">{contactEmails.map((c) => <button key={c.email} type="button" className={small} onClick={() => pick(c.email)}>{c.email}{c.who ? ` · ${c.who}` : ''}</button>)}</div>
            </div>
          )}
          <label className={label}>Bilgi (CC, isteğe bağlı)<input className={field} value={cc} onChange={(e) => edit(setCc)(e.target.value)} autoComplete="off" /></label>
          <label className={label}>Konu<input className={field} value={subject} onChange={(e) => edit(setSubject)(e.target.value)} maxLength={300} /></label>
          <label className={label}>Mesaj<textarea className={field} rows={8} value={message} onChange={(e) => edit(setMessage)(e.target.value)} /></label>

          <div className="grid gap-2 border border-line p-3 text-[12px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-soft">Yapay zekâ</span>
              <button type="button" className={small} disabled={ai.busy || !message.trim()} onClick={() => void askAi()}>{ai.busy ? 'Hazırlanıyor…' : 'Kurumsal dille düzenle'}</button>
            </div>
            <p className="text-subtle">Yalnızca yukarıdaki mesaj metni gönderilir; hizmetin maliyeti, notları veya erişim bilgileri yapay zekâya verilmez. “Uygula” demeden mesaj değişmez.</p>
            {ai.error && <p className="text-yellow-200">{ai.error}</p>}
            {ai.text && (
              <div className="grid gap-2">
                <pre className="whitespace-pre-wrap border border-line p-2 font-sans text-soft">{ai.text}</pre>
                {ai.warnings?.map((w) => <p key={w} className="text-yellow-200">{w}</p>)}
                <div className="flex gap-2">
                  <button type="button" className={small} onClick={() => { edit(setMessage)(ai.text ?? message); setAi({ busy: false }); }}>Uygula</button>
                  <button type="button" className={small} onClick={() => setAi({ busy: false })}>Vazgeç</button>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-1.5 text-[12px]">
            <span className="font-semibold text-muted">Ekler (isteğe bağlı, hiçbiri kendiliğinden eklenmez)</span>
            {documents.length === 0 ? <p className="text-subtle">Bu hizmette dosya yok.</p> : documents.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-soft">
                <input type="checkbox" checked={attach.includes(d.id)} onChange={(e) => edit(setAttach)(e.target.checked ? [...attach, d.id] : attach.filter((x) => x !== d.id))} />
                {d.name}{d.size_bytes ? <span className="text-subtle"> · {Math.max(1, Math.round(d.size_bytes / 1024))} KB</span> : null}
              </label>
            ))}
            <p className="text-subtle">Fatura, maliyet veya iç belge gibi dosyaları müşteriye göndermeden önce kontrol edin.</p>
          </div>
        </fieldset>

        {preview?.warnings && preview.warnings.length > 0 && !result && (
          <div className="grid gap-1 border border-yellow-400/40 p-3 text-[12px] text-yellow-100" role="alert">
            <p className="font-bold">Göndermeden önce kontrol edin</p>
            {preview.warnings.map((w) => <p key={w}>{w}</p>)}
          </div>
        )}

        <div className="grid gap-1.5">
          <p className="text-[12px] font-bold">Önizleme (gönderilecek e-postanın kendisi)</p>
          {preview?.ok && preview.html ? <iframe title="E-posta önizleme" srcDoc={preview.html} sandbox="" className="h-[380px] w-full border border-line bg-white" />
            : <p className="text-[12px] text-subtle">{preview?.error ?? 'Önizleme hazırlanıyor…'}</p>}
        </div>

        {problems.length > 0 && !result && <ul className="list-disc ps-5 text-[12px] text-yellow-200">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

        {result && (
          result.ok ? (
            <Flash tone="ok" message={`Servis kabul etti${result.replay ? ' (bu gönderim daha önce yapılmıştı; ikinci e-posta gönderilmedi)' : ''}. Bu, alıcıya teslim edildiği anlamına gelmez; teslim durumunu bildirim geçmişinden “Durumu yenile” ile görebilirsiniz.`} />
          ) : result.status === 'unknown' || result.status === 'sending' ? (
            <Flash tone="warn" message={`Sonuç belirsiz: ${result.error ?? 'servis yanıt vermedi.'} E-posta gitmiş de olabilir, gitmemiş de. “Yeniden dene” aynı gönderimi tekrarlar; ikinci kopya gönderilmez.`} />
          ) : (
            <Flash tone="bad" message={`Gönderilemedi: ${result.error ?? 'bilinmeyen hata'}. Hiçbir e-posta gönderilmedi.`} />
          )
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>{done ? 'Kapat' : 'Vazgeç'}</button>
          {!done && (
            <button type="button" className="admin-btn admin-btn-primary" disabled={busy || (!locked && problems.length > 0)} onClick={() => void send()}>
              {busy ? 'Gönderiliyor…' : locked ? 'Yeniden dene (aynı gönderim)' : 'Gönder'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
