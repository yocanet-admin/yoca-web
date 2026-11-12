'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PASSWORD_MIN, passwordProblem } from '@/lib/admin/roles';

/**
 * Yoca Admin — davet: the invitee sets their OWN password.
 * The one-time token is read from the link fragment (#t=…): browsers never
 * send it to the server in the request line or Referer; it is posted to
 * /api/admin/invite only, and removed from the address bar at once.
 * No session is needed here; after setting the password the person signs in
 * on /admin like everyone else.
 */

type Check = { ok: boolean; state?: string; message?: string; email?: string; name?: string; role?: string; expiresAt?: string; error?: string };

async function post(body: Record<string, unknown>): Promise<Check> {
  try {
    const r = await fetch('/api/admin/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const j = (await r.json().catch(() => null)) as Check | null;
    return j ?? { ok: false, error: 'Sunucu yanıt vermedi.' };
  } catch {
    return { ok: false, error: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.' };
  }
}

export default function InvitePage() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<Check | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const read = (first: boolean) => {
      const t = new URLSearchParams(window.location.hash.slice(1)).get('t');
      if (t === null && !first) return; // a hash change without a link token: nothing to check
      // keep the token out of the address bar / history from now on
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
      setToken(t ?? '');
      setInfo(null); setDone(null); setError(null);
      void post({ token: t ?? '' }).then(setInfo);
    };
    read(true);
    const onHash = () => read(false);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const submit = async () => {
    setError(null);
    if (!info?.email || !token) return;
    const problem = passwordProblem(pw, info.email);
    if (problem) return setError(problem);
    if (pw !== pw2) return setError('Şifreler aynı değil.');
    setBusy(true);
    const r = await post({ token, password: pw });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'Şifre kaydedilemedi.');
    setPw(''); setPw2('');
    setDone(r.email ?? info.email);
  };

  return (
    <div className="grid gap-5">
      <img src="/brand/yoca-logo-primary.svg" alt="Yoca" width={120} height={32} />
      <div className="admin-card grid gap-4 !p-5 sm:!p-6">
        <div className="grid gap-1">
          <p className="admin-kicker">Yönetim paneli daveti</p>
          <h1 className="admin-h1 !text-[26px]">Şifreni belirle</h1>
        </div>
        {!info ? (
          <p className="text-[14px] text-muted" role="status">Davet kontrol ediliyor…</p>
        ) : done ? (
          <div className="grid gap-3" role="status">
            <p className="admin-notice admin-notice-good text-[14px]"><span>Şifren kaydedildi ve hesabın açıldı. Artık <b className="break-all">{done}</b> ve yeni şifrenle giriş yapabilirsin.</span></p>
            <Link href="/admin" className="admin-btn-primary justify-self-start">Girişe git</Link>
          </div>
        ) : !info.ok ? (
          <p role="alert" className="admin-notice admin-notice-bad text-[14px]">{info.error ?? 'Davet kontrol edilemedi.'}</p>
        ) : info.state !== 'valid' ? (
          <div className="grid gap-3">
            <p role="alert" className="admin-notice admin-notice-bad text-[14px]">{info.message}</p>
            {info.state === 'used' && <Link href="/admin" className="admin-btn justify-self-start">Girişe git</Link>}
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <dl className="grid gap-1 rounded-[12px] border border-[var(--line,#262a31)] bg-[var(--inset,#0d0f12)] p-3 text-[13px]">
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-subtle">Ad</dt><dd className="font-semibold text-white">{info.name}</dd></div>
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-subtle">E-posta</dt><dd className="break-all font-semibold text-white">{info.email}</dd></div>
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-subtle">Rol</dt><dd className="font-semibold text-white">{info.role}</dd></div>
            </dl>
            {/* the username field helps password managers save the new credential for the right account */}
            <input type="email" name="username" autoComplete="username" value={info.email ?? ''} readOnly hidden />
            <label className="admin-label">Yeni şifre
              <input className="admin-input" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} maxLength={72} required aria-describedby="pw-rule" />
            </label>
            <label className="admin-label">Yeni şifre (tekrar)
              <input className="admin-input" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} maxLength={72} required />
            </label>
            <label className="admin-check flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-yoca-lime" /> Şifreyi göster</label>
            <p id="pw-rule" className="admin-hint">En az {PASSWORD_MIN} karakter; e-posta adını içermesin. Şifreni kimseyle paylaşma.</p>
            {error && <p role="alert" className="admin-notice admin-notice-bad text-[13px]">{error}</p>}
            <button type="submit" className="admin-btn-primary justify-self-start" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Şifremi kaydet ve hesabımı aç'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
