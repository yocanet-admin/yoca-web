'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dict } from '@/lib/i18n';
import type { Locale } from '@/types';
import FlowDiagram from '@/components/ui/FlowDiagram';
import Honeypot from '@/components/ui/Honeypot';
import { track } from '@vercel/analytics';

/** Yoca — contact form (client): validates, posts to /api/contact. */

interface ContactFormProps {
  locale: Locale;
  t: Dict['contact'];
  errorRequired: string;
  errorEmail: string;
  errorGeneric: string;
}

type Status = 'idle' | 'submitting' | 'success';

export default function ContactForm({
  locale,
  t,
  errorRequired,
  errorEmail,
  errorGeneric,
}: ContactFormProps) {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', phone: '', website: '' });
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [budget, setBudget] = useState<string>('');
  const [launch, setLaunch] = useState<string>('');
  const [consent, setConsent] = useState(false);
  // Spam screening: a real hidden honeypot + how long the form was open.
  const [honeypot, setHoneypot] = useState('');
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const toggleSystem = (system: string) => {
    setSelectedSystems((current) =>
      current.includes(system)
        ? current.filter((item) => item !== system)
        : [...current, system],
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!form.name.trim() || !form.email.trim() || !form.message.trim() || !consent) {
      setError(errorRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError(errorEmail);
      return;
    }

    // Project-planner selections travel inside the message body.
    const plannerLines: string[] = [];
    if (selectedSystems.length > 0) {
      plannerLines.push(`[${t.plannerSystems}] ${selectedSystems.join(', ')}`);
    }
    if (budget) {
      plannerLines.push(`[${t.plannerBudget}] ${budget}`);
    }
    if (launch) {
      plannerLines.push(`[${t.launchLabel}] ${launch}`);
    }
    if (form.website.trim()) {
      plannerLines.push(`[${t.website}] ${form.website.trim()}`);
    }
    if (form.phone.trim()) {
      plannerLines.push(`[${t.phone}] ${form.phone.trim()}`);
    }
    const fullMessage =
      plannerLines.length > 0
        ? `${plannerLines.join('\n')}\n\n${form.message.trim()}`
        : form.message.trim();

    setStatus('submitting');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          company: form.company.trim(),
          message: fullMessage,
          locale,
          website: honeypot, // honeypot — empty for people
          elapsed: openedAt.current ? Date.now() - openedAt.current : 0,
        }),
      });
      const result = (await response.json()) as { ok: boolean; message?: string; error?: string };
      if (response.ok && result.ok) {
        track('contact_submit', { locale });
        setSuccessMessage(result.message || t.success);
        setStatus('success');
      } else {
        setStatus('idle');
        setError(result.error || errorGeneric);
      }
    } catch {
      setStatus('idle');
      setError(errorGeneric);
    }
  };

  if (status === 'success') {
    // Stronger confirmation: message + the three next steps drawn as one short flow.
    return (
      <div role="status" className="grid justify-items-start gap-6 border border-yoca-green bg-yoca-green/5 p-8 lg:p-10">
        <span aria-hidden="true" className="slant grid h-10 w-11 place-items-center bg-yoca-green text-xl font-extrabold text-black">
          ✓
        </span>
        <p className="max-w-[40ch] text-[clamp(20px,2vw,26px)] font-extrabold leading-snug tracking-[-0.02em] text-white">{successMessage}</p>
        <div className="w-full">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">{t.nextTitle}</p>
          <div className="mt-4">
            <FlowDiagram steps={t.nextSteps} />
          </div>
        </div>
      </div>
    );
  }

  const inputClass =
    'min-h-12 w-full rounded-sm border border-line bg-surface-secondary px-3.5 text-[15px] text-white transition-colors focus:border-yoca-lime focus:outline-none';

  return (
    <form onSubmit={submit} noValidate className="relative grid gap-5">
      <Honeypot id="cf-homepage" value={honeypot} onChange={setHoneypot} />
      {error && (
        <div
          role="alert"
          className="rounded-sm border border-red-500 bg-red-500/10 px-4 py-3 text-[14px] font-semibold text-red-400"
        >
          {error}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="cf-name" className="text-[13px] font-bold text-soft">
            {t.name} <span className="text-yoca-lime">*</span>
          </label>
          <input
            id="cf-name"
            required
            maxLength={190}
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="cf-email" className="text-[13px] font-bold text-soft">
            {t.email} <span className="text-yoca-lime">*</span>
          </label>
          <input
            id="cf-email"
            type="email"
            required
            maxLength={190}
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="cf-company" className="text-[13px] font-bold text-soft">
            {t.company}
          </label>
          <input
            id="cf-company"
            maxLength={190}
            autoComplete="organization"
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="cf-phone" className="text-[13px] font-bold text-soft">
            {t.phone}
          </label>
          <input
            id="cf-phone"
            type="tel"
            maxLength={60}
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <label htmlFor="cf-website" className="text-[13px] font-bold text-soft">
          {t.website}
        </label>
        <input
          id="cf-website"
          type="text"
          maxLength={300}
          autoComplete="url"
          value={form.website}
          onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          className={inputClass}
        />
      </div>

      {/* ── Interactive Project Planner ─────────────────────────── */}
      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="text-[13px] font-bold text-soft">{t.plannerSystems}</legend>
        <div className="flex flex-wrap gap-2.5">
          {t.systems.map((system) => {
            const active = selectedSystems.includes(system);
            return (
              <button
                key={system}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSystem(system)}
                className={`min-h-[44px] rounded-sm border px-4 py-2 text-[13px] font-bold transition-colors ${
                  active
                    ? 'border-yoca-lime bg-yoca-lime text-black'
                    : 'border-line bg-surface-secondary text-muted hover:border-subtle hover:text-white'
                }`}
              >
                {system}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="text-[13px] font-bold text-soft">{t.plannerBudget}</legend>
        <div className="flex flex-wrap gap-2.5">
          {t.budgets.map((option) => {
            const active = budget === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setBudget(active ? '' : option)}
                className={`min-h-[44px] rounded-sm border px-4 py-2 text-[13px] font-bold transition-colors ${
                  active
                    ? 'border-yoca-lime bg-yoca-lime text-black'
                    : 'border-line bg-surface-secondary text-muted hover:border-subtle hover:text-white'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="text-[13px] font-bold text-soft">{t.launchLabel}</legend>
        <div className="flex flex-wrap gap-2.5">
          {t.launches.map((option) => {
            const active = launch === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setLaunch(active ? '' : option)}
                className={`min-h-[44px] rounded-sm border px-4 py-2 text-[13px] font-bold transition-colors ${
                  active
                    ? 'border-yoca-lime bg-yoca-lime text-black'
                    : 'border-line bg-surface-secondary text-muted hover:border-subtle hover:text-white'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <label htmlFor="cf-message" className="text-[13px] font-bold text-soft">
          {t.message} <span className="text-yoca-lime">*</span>
        </label>
        <textarea
          id="cf-message"
          required
          rows={6}
          maxLength={5000}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          className={`${inputClass} min-h-[140px] resize-y py-3`}
        />
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-[14px] text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-[18px] w-[18px] flex-none accent-yoca-lime"
          required
        />
        <span>{t.consent}</span>
      </label>
      <div>
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="btn-primary px-8 py-4 text-base disabled:opacity-60"
        >
          {status === 'submitting' ? '…' : t.submit}
        </button>
      </div>
    </form>
  );
}
