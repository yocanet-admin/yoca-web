'use client';

import { useState } from 'react';

/** Yoca — "Bültenden ayrıl" button on /newsletter?u=<token> (POST, so link scanners cannot unsubscribe). */
export default function UnsubscribeConfirm({ token, label, working, doneTitle, doneBody, errorText }: { token: string; label: string; working: string; doneTitle: string; doneBody: string; errorText: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  if (state === 'done') {
    return (
      <div role="status" className="grid gap-2">
        <p className="text-xl font-extrabold">{doneTitle}</p>
        <p className="text-muted">{doneBody}</p>
      </div>
    );
  }
  return (
    <div className="grid justify-items-center gap-3">
      <button
        type="button"
        disabled={state === 'busy'}
        className="btn-primary px-8 py-4 text-base disabled:opacity-60"
        onClick={async () => {
          setState('busy');
          const res = await fetch('/api/newsletter/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
          setState(res?.ok ? 'done' : 'error');
        }}
      >
        {state === 'busy' ? working : label}
      </button>
      {state === 'error' && <p role="alert" className="text-[13px] text-red-300">{errorText}</p>}
    </div>
  );
}
