'use client';

import type { ReactNode } from 'react';

/**
 * A collapsible editor group. Closing a group only hides its fields: the values
 * live in the editor's state, so nothing typed is lost (and the editor keeps a
 * local backup of unsaved changes as well).
 */
export function Group({ id, title, summary, open, onToggle, children, tone, actions }: {
  id: string; title: string; summary?: ReactNode; open: boolean; onToggle: (id: string) => void; children: ReactNode;
  tone?: 'warn'; actions?: ReactNode;
}) {
  return (
    <section className={`admin-card grid ${open ? 'gap-4' : 'gap-0'} p-0`} aria-labelledby={`g-${id}`}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open} aria-controls={`gp-${id}`} onClick={() => onToggle(id)}>
          <span aria-hidden className={`inline-block w-3 text-subtle transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          <h2 id={`g-${id}`} className="text-[15px] font-extrabold">{title}</h2>
          {summary ? <span className={`min-w-0 truncate text-[12px] ${tone === 'warn' ? 'text-yellow-200' : 'text-subtle'}`}>{summary}</span> : null}
        </button>
        {actions}
      </div>
      {open ? <div id={`gp-${id}`} className="grid gap-4 px-4 pb-4">{children}</div> : null}
    </section>
  );
}
