'use client';

import { useMemo, useState } from 'react';
import { Flash, field, label } from '@/components/admin/ops/ui';
import { adminPost } from '@/lib/cockpit/client';
import { newKey } from '@/lib/documents/client';
import { documentEmailHtml, EMAIL_LOGO, EMAIL_LOGO_DARK, EMAIL_THEME_LABEL, EMAIL_THEMES, parseAddresses, SITE, type EmailTheme } from '@/lib/documents/mail';
import type { DocKind, DocLocale, Issuer } from '@/lib/documents/model';
import { formatIban, type BankChange } from '@/lib/documents/settings';

/**
 * "E-postayla gönder": recipient, CC, subject, message and the finalized
 * version whose PDF is attached are all visible and editable before sending.
 * Nothing is sent until "Gönder". One dialog = one request key: a double click
 * or "Yeniden dene" after an unclear result never sends a second copy. The
 * result is shown as it is: "servis kabul etti" is not "teslim edildi"; a
 * failure is never shown as success.
 *
 * Theme "Açık" (default) / "Koyu" changes only the e-mail body; the preview is
 * the same HTML the server sends (same function, same company profile, same
 * attachment note). The attached PDF is identical in both themes.
 */

type Result = { ok: boolean; status?: string; error?: string; emailId?: string; needsBankDecision?: boolean; bankChanges?: BankChange[]; version?: number; replay?: boolean };

export function EmailDialog({ docId, number, kind, versionTitles, versions, defaultVersion, defaults, from, replyTo, issuer, locale, themeReady, onClose, onSent }: {
  docId: string; number: string; versions: Array<{ version: number; finalized_at: string }>; defaultVersion: number;
  defaults: { to: string; subject: string; body: string }; from: string; replyTo: string;
  /** current company profile and the version's language: the preview uses what the server uses */
  issuer: Issuer; locale: DocLocale;
  /** document type and the title of each finalized version (shown in the dark theme) */
  kind: DocKind; versionTitles: Record<number, string>;
  /** false until v22 is applied: only the light theme can be sent */
  themeReady: boolean;
  onClose: () => void; onSent: () => void;
}) {
  const [to, setTo] = useState(defaults.to);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(defaults.subject);
  const [message, setMessage] = useState(defaults.body);
  const [version, setVersion] = useState(defaultVersion);
  const [theme, setTheme] = useState<EmailTheme>('light');
  const [keepBank, setKeepBank] = useState(false);
  const [bankAsk, setBankAsk] = useState<BankChange[] | null>(null);
  // One key per send: kept for retries of an unclear result, renewed when the content changes after a definite failure.
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const locked = Boolean(result && (result.status === 'unknown' || result.status === 'sending'));
  const done = Boolean(result?.ok);

  const toP = parseAddresses(to);
  const ccP = parseAddresses(cc);
  const problems = [
    !toP.list.length ? 'En az bir alıcı adresi yazın.' : '',
    toP.invalid.length || ccP.invalid.length ? `Geçersiz adres: ${[...toP.invalid, ...ccP.invalid].join(', ')}` : '',
    toP.tooMany || ccP.tooMany ? 'En fazla 10 alıcı ve 10 CC adresi.' : '',
    !subject.trim() ? 'Konu boş olamaz.' : '',
    !message.trim() ? 'Mesaj boş olamaz.' : '',
  ].filter(Boolean);

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    // After a definite failure a changed e-mail is a new send (new key); an unclear one stays locked.
    if (result && result.status === 'failed') { setKey(newKey()); setResult(null); }
  };

  const pdfName = `${number}-v${version}.pdf`;
  // In the preview the logo comes from this site (same file as in the e-mail), so it also shows on a preview deployment.
  const preview = useMemo(() => documentEmailHtml({
    issuer, locale, kind, number, docTitle: versionTitles[version] ?? '', subject, body: message.trim() || ' ', pdfName, theme,
    logoUrl: typeof window !== 'undefined' ? `${window.location.origin}${(theme === 'dark' ? EMAIL_LOGO_DARK : EMAIL_LOGO).slice(SITE.length)}` : undefined,
  }), [issuer, locale, kind, number, versionTitles, version, subject, message, pdfName, theme]);

  const send = async () => {
    if (busy || done) return;
    setBusy(true);
    const r = await adminPost<Result>('/api/admin/documents/email', { action: 'send', id: docId, version, to, cc, subject, message, theme, keepBank, requestKey: key });
    setBusy(false);
    if (r.needsBankDecision) { setBankAsk(r.bankChanges ?? []); setResult(null); return; }
    // No answer at all (connection dropped): the outcome is unclear, not a failure and not a success.
    // (our route always says "status" once a send was attempted; a missing answer, a timeout page or a
    // platform error has none → unclear; a validation error before sending → nothing was sent)
    const status = r.status ?? (r.ok ? 'accepted' : r.emailId || /ulaşılamadı|zaman aşımı|Sunucu hatası/i.test(r.error ?? '') ? 'unknown' : 'failed');
    setResult({ ...r, status });
    if (r.ok) onSent();
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="email-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="admin-card grid max-h-[92vh] w-full max-w-2xl gap-4 overflow-y-auto p-5">
        <div>
          <h2 id="email-title" className="text-[17px] font-extrabold">E-postayla gönder · {number}</h2>
          <p className="mt-1 text-[12px] text-subtle">Gönderen: {from}{replyTo ? ` · yanıtlar: ${replyTo}` : ''}. Siz “Gönder” demeden hiçbir şey gönderilmez.</p>
        </div>

        <fieldset disabled={busy || locked || done} className="grid gap-3">
          <label className={label}>Alıcı (virgülle birden fazla)<input className={field} value={to} onChange={(e) => edit(setTo)(e.target.value)} placeholder="ornek@firma.com" autoComplete="off" /></label>
          <label className={label}>Bilgi (CC, isteğe bağlı)<input className={field} value={cc} onChange={(e) => edit(setCc)(e.target.value)} autoComplete="off" /></label>
          <label className={label}>Konu<input className={field} value={subject} onChange={(e) => edit(setSubject)(e.target.value)} maxLength={300} /></label>
          <label className={label}>Mesaj<textarea className={field} rows={9} value={message} onChange={(e) => edit(setMessage)(e.target.value)} /></label>
          <label className={label}>Eklenecek PDF
            <select className={field} value={version} onChange={(e) => { edit(setVersion)(Number(e.target.value)); setKeepBank(false); setBankAsk(null); }}>
              {versions.map((v) => <option key={v.version} value={v.version}>Sürüm {v.version}{v.version === defaultVersion ? ' (son sürüm)' : ''}</option>)}
            </select>
          </label>
          <p className="text-[12px] text-subtle">Ek: <span className="font-mono">{pdfName}</span> — “PDF indir” ile aynı dosya: sürümün sabit içeriği, güncel şirket bilgileri ve onaylı şablon. Gönderilen dosya saklanır ve gönderim geçmişinden “Gönderilen PDF” ile açılabilir.</p>
          <div className="grid gap-2">
            <span className={label}>E-posta teması</span>
            <div role="radiogroup" aria-label="E-posta teması" className="flex flex-wrap gap-2">
              {EMAIL_THEMES.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={theme === t} disabled={t === 'dark' && !themeReady}
                  className={`admin-btn ${theme === t ? '!border-yoca-lime !text-white' : ''}`} onClick={() => edit(setTheme)(t)}>
                  {EMAIL_THEME_LABEL[t]}{t === 'light' ? ' (varsayılan)' : ''}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-subtle">Tema yalnızca e-posta gövdesini değiştirir; ekteki PDF’in tasarımı aynı kalır. Seçilen tema gönderim kaydında saklanır.{!themeReady ? ' Koyu tema için veritabanı güncellemesi (v22) henüz uygulanmadı.' : ''}</p>
          </div>
        </fieldset>

        <div className="grid gap-1.5">
          <p className="text-[12px] font-bold">Önizleme · {EMAIL_THEME_LABEL[theme]}</p>
          <iframe title={`E-posta önizleme (${EMAIL_THEME_LABEL[theme]})`} srcDoc={preview} sandbox="" className="h-[440px] w-full border border-line" style={{ background: theme === 'dark' ? '#050505' : '#F3F5EF' }} />
          <p className="text-[11px] text-subtle">Gönderilecek HTML’in kendisidir. Bazı e-posta uygulamaları (ör. koyu modda Gmail / Outlook) renkleri kendi kurallarıyla değiştirebilir.</p>
        </div>

        {bankAsk && (
          <div className="grid gap-2 border border-yellow-400/40 p-3 text-[13px]" role="alert">
            <p className="font-bold text-yellow-100">Bu sürümdeki banka bilgisi güncel ayarlardan farklı</p>
            <ul className="grid gap-1 text-muted">{bankAsk.map((c) => <li key={c.id}>{c.old.bank || 'Hesap'}: <span className="font-mono">{formatIban(c.old.iban)}</span> {c.change === 'removed' ? '— ayarlardan kaldırılmış' : `— şimdi ${formatIban(c.now?.iban ?? '')}`}</li>)}</ul>
            <p className="text-[12px] text-subtle">Gönderirseniz PDF bu sürümde basılı (eski) banka bilgisini içerir. Güncel bilgiyle göndermek için pencereyi kapatıp “Güncel banka bilgileriyle revize et” ile yeni sürüm oluşturun.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="admin-btn" onClick={() => { setKeepBank(true); setBankAsk(null); }}>Sürümdeki bilgilerle göndermeyi seç</button>
              <button type="button" className="admin-btn" onClick={onClose}>Vazgeç</button>
            </div>
          </div>
        )}
        {keepBank && !bankAsk && <p className="text-[12px] text-yellow-200">Seçildi: PDF, sürümdeki (eski) banka bilgisiyle gönderilecek.</p>}

        {problems.length > 0 && !result && <ul className="list-disc ps-5 text-[12px] text-yellow-200">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

        {result && (
          result.ok ? (
            <Flash tone="ok" message={`Servis kabul etti${result.replay ? ' (bu gönderim daha önce yapılmıştı; ikinci e-posta gönderilmedi)' : ''}. Bu, alıcıya teslim edildiği anlamına gelmez; teslim durumunu gönderim geçmişinden “Durumu yenile” ile görebilirsiniz.`} />
          ) : result.status === 'unknown' || result.status === 'sending' ? (
            <div className="grid gap-2">
              <Flash tone="warn" message={`Sonuç belirsiz: ${result.error ?? 'servis yanıt vermedi.'} E-posta gitmiş de olabilir, gitmemiş de. “Yeniden dene” aynı gönderimi tekrarlar; ikinci kopya gönderilmez.`} />
            </div>
          ) : (
            <Flash tone="bad" message={`Gönderilemedi: ${result.error ?? 'bilinmeyen hata'}. Hiçbir e-posta gönderilmedi.`} />
          )
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>{done ? 'Kapat' : 'Vazgeç'}</button>
          {!done && (
            <button type="button" className="admin-btn admin-btn-primary" disabled={busy || (!locked && problems.length > 0) || Boolean(bankAsk)} onClick={() => void send()}>
              {busy ? 'Gönderiliyor…' : locked ? 'Yeniden dene (aynı gönderim)' : 'Gönder'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
