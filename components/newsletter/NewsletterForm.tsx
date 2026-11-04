'use client';

import { useRef, useState } from 'react';
import type { NewsletterCopy } from '@/lib/newsletter/copy';

/**
 * Yoca — newsletter sign-up (double opt-in). E-mail + an explicit consent
 * box (never pre-ticked). The server answers the same way for new and
 * existing addresses; the visitor is told to confirm from their inbox.
 */

interface Props {
  locale: string;
  copy: NewsletterCopy['form'];
  privacyHref?: string | null;
  source: 'footer' | 'insights';
  variant?: 'footer' | 'panel';
}

export default function NewsletterForm({ locale, copy, privacyHref, source, variant = 'panel' }: Props) {
  const openedAt = useRef(Date.now());
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const id = `nl-${source}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state === 'sending') return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setState('error'); setMessage(copy.errorEmail); return; }
    if (!consent) { setState('error'); setMessage(copy.errorConsent); return; }
    setState('sending');
    setMessage('');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale, consent, website, elapsed: Date.now() - openedAt.current, source }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && json.ok) { setState('done'); setMessage(json.message ?? copy.success); setEmail(''); }
      else { setState('error'); setMessage(json.error ?? copy.errorGeneric); }
    } catch {
      setState('error');
      setMessage(copy.errorGeneric);
    }
  };

  const panel = variant === 'panel';
  return (
    <div className={panel ? 'border border-line bg-surface p-6 sm:p-8' : ''}>
      <p className={`font-extrabold tracking-tight ${panel ? 'text-[clamp(20px,2.2vw,28px)] leading-snug' : 'text-[18px]'}`}>{copy.heading}</p>
      <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-muted">{copy.sub}</p>
      {state === 'done' ? (
        <p role="status" className="mt-5 border border-yoca-green/40 bg-yoca-green/10 px-4 py-3 text-[14px] text-yoca-green">{message}</p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-5 grid gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`${id}-email`} className="sr-only">{copy.emailLabel}</label>
            <input
              id={`${id}-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={copy.placeholder}
              dir="ltr"
              className="min-h-[46px] flex-1 rounded-sm border border-line bg-surface-deep px-4 text-[15px] text-white placeholder:text-subtle focus:border-yoca-lime focus:outline-none"
            />
            <button type="submit" disabled={state === 'sending'} className="btn-primary min-h-[46px] justify-center !px-6 disabled:opacity-60">
              {state === 'sending' ? copy.sending : copy.submit}
            </button>
          </div>
          {/* Honeypot: hidden from people, filled by bots. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          </div>
          <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 flex-none accent-[#A2FF00]" />
            <span>
              {copy.consent}
              {privacyHref ? <> <a href={privacyHref} className="underline hover:text-yoca-lime">{copy.privacy}</a></> : null}
            </span>
          </label>
          {state === 'error' && message && <p role="alert" className="text-[13px] text-red-300">{message}</p>}
        </form>
      )}
    </div>
  );
}
