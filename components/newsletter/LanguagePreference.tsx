'use client';

import { useState } from 'react';
import { LANGUAGE_NAMES } from '@/lib/newsletter/copy';

/** Yoca — newsletter language on the preferences page (/newsletter?u=<token>). */
export default function LanguagePreference({ token, current, label, save, saved, errorText, working }: { token: string; current: string; label: string; save: string; saved: string; errorText: string; working: string }) {
  const [value, setValue] = useState(current);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  return (
    <div className="grid w-full max-w-[420px] justify-items-center gap-3">
      <label className="grid w-full gap-1.5 text-start text-[13px] font-semibold text-muted">
        {label}
        <select value={value} onChange={(e) => { setValue(e.target.value); setState('idle'); }} className="min-h-[46px] rounded-sm border border-line bg-surface px-3 text-[15px] text-white focus:border-yoca-lime focus:outline-none">
          {Object.entries(LANGUAGE_NAMES).map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
        </select>
      </label>
      <button
        type="button"
        disabled={state === 'busy' || (value === current && state !== 'error')}
        className="btn-primary px-8 py-3 disabled:opacity-50"
        onClick={async () => {
          setState('busy');
          const res = await fetch('/api/newsletter/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, locale: value }) }).catch(() => null);
          const json = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean }) : {};
          setState(res?.ok && json.ok ? 'done' : 'error');
        }}
      >
        {state === 'busy' ? working : save}
      </button>
      {state === 'done' && <p role="status" className="text-[13px] text-yoca-green">{saved}</p>}
      {state === 'error' && <p role="alert" className="text-[13px] text-red-300">{errorText}</p>}
    </div>
  );
}
