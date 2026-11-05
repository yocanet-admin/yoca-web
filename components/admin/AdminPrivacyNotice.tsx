'use client';

import { useEffect, useState } from 'react';

/**
 * Yoca — admin panel: storage / cookie notice (Turkish, in the page flow).
 *
 * What the panel itself uses (all strictly necessary, nothing sent to third
 * parties):
 *  - localStorage "yoca-admin-auth": the Supabase sign-in session;
 *  - localStorage "yoca-insight-unsaved:*", "yoca-doc-unsaved:*" and the
 *    translation job list: backups of unsaved work on this device;
 *  - localStorage "yoca_consent": this choice.
 * The panel sets no cookies of its own (the "yoca_locale" cookie belongs to
 * the public site), loads no Google Analytics and drops its Vercel Web
 * Analytics events (cookieless) before they are sent.
 *
 * The public site's choice mechanism is kept: the buttons store the same
 * "yoca_consent" value the visitor banner uses (optional analytics on the
 * public site only). The notice sits at the end of the page, never over a
 * form, and only until a choice exists.
 */

const KEY = 'yoca_consent';

export default function AdminPrivacyNotice() {
  const [show, setShow] = useState(false);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    try { setShow(window.localStorage.getItem(KEY) === null); } catch { setShow(false); }
  }, []);
  if (!show) return null;
  const decide = (analytics: boolean) => {
    try { window.localStorage.setItem(KEY, JSON.stringify({ analytics, ts: Date.now() })); } catch { /* storage unavailable: ask again next time */ }
    setShow(false);
  };
  return (
    <section aria-label="Çerez ve tarayıcı depolama bilgisi" className="mt-10 grid gap-3 rounded-sm border border-line bg-surface-deep/60 p-4 text-[13px] leading-relaxed text-muted">
      <p>
        <b className="text-soft">Çerezler:</b> Yönetim paneli yalnızca çalışması için gerekli tarayıcı depolamasını kullanır (oturum bilgisi ve kaydedilmemiş taslakların bu cihazdaki yedeği). Panelde analiz veya reklam çerezi çalışmaz.
        Aşağıdaki seçim yalnızca ziyaretçi sitesindeki isteğe bağlı analiz çerezleri içindir.
      </p>
      {details && (
        <ul className="list-disc ps-5 text-[12px] text-subtle">
          <li><code>yoca-admin-auth</code> — oturum (gerekli, bu tarayıcıda saklanır)</li>
          <li><code>yoca-doc-unsaved:*</code>, <code>yoca-insight-unsaved:*</code> — kaydedilmemiş değişikliklerin yedeği (gerekli, yalnızca bu cihazda)</li>
          <li><code>yoca_consent</code> — bu tercih</li>
          <li>Vercel Web Analytics çerez kullanmaz; panel sayfaları raporlanmaz. Google Analytics panelde hiç yüklenmez.</li>
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="admin-btn !px-3 !py-1.5 !text-[12px]" onClick={() => decide(false)}>Yalnızca gerekli</button>
        <button type="button" className="admin-btn !px-3 !py-1.5 !text-[12px]" onClick={() => decide(true)}>Sitede analiz çerezlerine izin ver</button>
        <button type="button" className="text-[12px] text-subtle underline underline-offset-2 hover:text-white" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? 'Ayrıntıları gizle' : 'Ayrıntılar'}</button>
      </div>
    </section>
  );
}
