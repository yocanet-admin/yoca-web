'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatTr, inBounds, isIso, longTr, monthGrid, monthTitle, moveFocus, TR_DAYS, TR_DAYS_SHORT, addMonthsIso, clampIso, validateTyped, type Bounds } from '@/lib/admin/calendar';

/**
 * Yoca admin — dark Turkish date field (dd.MM.yyyy). Replaces <input type="date">,
 * whose white browser calendar cannot be themed and follows the browser locale.
 *
 *  - Type the date (gg.aa.yyyy) or open the calendar (button, or Alt+↓ in the field).
 *  - Calendar: Turkish month / day names, weeks start Monday, today marked,
 *    selected day lime, days outside min / max disabled.
 *  - Keyboard in the grid: arrows ±1 day / ±1 week, PageUp / PageDown ±1 month,
 *    Home / End week start / end, Enter or Space selects, Escape closes and
 *    returns focus to the calendar button; Tab closes. Outside click closes.
 */

export function DateField({ label, value, onChange, min, max, today: todayProp, id }: { label: string; value: string; onChange: (iso: string) => void; min?: string | null; max?: string | null; today: string; id?: string }) {
  // the page may render before the server's "today" arrives: fall back to the browser's UTC day
  const today = isIso(todayProp) ? todayProp : new Date().toISOString().slice(0, 10);
  const bounds: Bounds = { min: isIso(min) ? min : null, max: isIso(max) ? max : null };
  const auto = useId();
  const inputId = id ?? `${auto}-input`;
  const errId = `${auto}-err`;
  const dialogId = `${auto}-dialog`;
  const titleId = `${auto}-title`;
  const [text, setText] = useState(formatTr(value));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [focusRaw, setFocus] = useState(value || today);
  const focus = isIso(focusRaw) ? focusRaw : today;
  const [shift, setShift] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLTableElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(formatTr(value)); setError(null); }, [value]);

  const start = () => clampIso(isIso(value) ? value : today, bounds);
  const show = () => { setFocus(start()); setOpen(true); };
  const close = (refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); };
  const choose = (d: string) => {
    if (!inBounds(d, bounds)) return;
    onChange(d);
    setText(formatTr(d));
    setError(null);
    close();
  };
  const commitTyped = () => {
    // an emptied field clears the date (optional dates must stay clearable)
    if (!text.trim()) { setError(null); if (value) onChange(''); return; }
    const v = validateTyped(text, bounds);
    if (!v.ok) { setError(v.error); return; }
    setError(null);
    if (v.value !== value) onChange(v.value);
  };

  useLayoutEffect(() => {
    if (!open || !pop.current) { setShift(0); return; }
    const r = pop.current.getBoundingClientRect();
    const left = r.left - shift;
    const maxX = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth, document.documentElement.clientWidth) - 8;
    setShift(left + r.width > maxX ? Math.max(8 - left, maxX - (left + r.width)) : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>(`button[data-date="${focus}"]`)?.focus();
  }, [open, focus]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onGridKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { close(false); return; }
    const next = moveFocus(focus, e.key, bounds);
    if (next) { e.preventDefault(); setFocus(next); }
  };

  const weeks = monthGrid(focus);
  const nav = 'inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--line-2,#343943)] text-[15px] text-muted transition-colors hover:border-yoca-lime hover:text-yoca-lime focus-visible:outline focus-visible:outline-2 focus-visible:outline-yoca-lime disabled:opacity-40';
  const prevMonth = clampIso(addMonthsIso(focus, -1), bounds);
  const nextMonth = clampIso(addMonthsIso(focus, 1), bounds);

  return (
    <div ref={wrap} className="relative min-w-0">
      <label htmlFor={inputId} className="sr-only">{label} (gg.aa.yyyy)</label>
      <div className={`flex h-10 items-stretch rounded-[10px] border bg-[var(--inset,#0d0f12)] ${error ? 'border-red-500/70' : 'border-[var(--line-2,#343943)] focus-within:border-yoca-lime focus-within:shadow-[0_0_0_1px_#a2ff00]'}`}>
        <input id={inputId} type="text" inputMode="numeric" autoComplete="off" placeholder="gg.aa.yyyy" value={text} title={label}
          aria-invalid={Boolean(error)} aria-describedby={error ? errId : undefined}
          className="w-full min-w-[6.5rem] flex-1 bg-transparent px-3 text-[13px] font-semibold tabular-nums text-soft outline-none placeholder:text-subtle"
          onChange={(e) => setText(e.target.value)} onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitTyped(); }
            if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); show(); }
          }} />
        <button ref={button} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} aria-label={`${label}: takvimi aç`}
          className="flex w-10 flex-none items-center justify-center rounded-r-[10px] border-l border-[var(--line-2,#343943)] text-subtle hover:text-yoca-lime focus-visible:outline focus-visible:outline-2 focus-visible:outline-yoca-lime"
          onClick={() => (open ? close() : show())}
          onKeyDown={(e) => { if (e.key === 'ArrowDown' && e.altKey && !open) { e.preventDefault(); show(); } }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        </button>
      </div>
      {error && <p id={errId} role="alert" className="mt-1 max-w-[16rem] text-[11px] text-red-300">{error}</p>}
      {open && (
        <div ref={pop} id={dialogId} role="dialog" aria-modal="false" aria-labelledby={titleId} data-testid="date-dialog" style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          className="absolute left-0 top-full z-50 mt-1 w-[min(19rem,calc(100vw-2rem))] rounded-[14px] border border-[var(--line-2,#343943)] bg-[var(--tile-2,#1c1f25)] p-3 text-soft shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
          <p className="sr-only">{label}</p>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className={nav} aria-label="Önceki ay" disabled={prevMonth.slice(0, 7) === focus.slice(0, 7)} onClick={() => setFocus(prevMonth)}>‹</button>
            <span id={titleId} className="text-[14px] font-extrabold" aria-live="polite">{monthTitle(focus)}</span>
            <button type="button" className={nav} aria-label="Sonraki ay" disabled={nextMonth.slice(0, 7) === focus.slice(0, 7)} onClick={() => setFocus(nextMonth)}>›</button>
          </div>
          <table ref={grid} role="grid" aria-labelledby={titleId} className="w-full border-separate border-spacing-0.5 text-center" onKeyDown={onGridKey}>
            <thead>
              <tr>{TR_DAYS_SHORT.map((d, i) => <th key={d} scope="col" abbr={TR_DAYS[i]} className="pb-1 text-[11px] font-bold text-subtle">{d}</th>)}</tr>
            </thead>
            <tbody>
              {weeks.map((w, wi) => (
                <tr key={wi}>
                  {w.map(({ date, inMonth }) => {
                    const selected = date === value;
                    const isToday = date === today;
                    const disabled = !inBounds(date, bounds);
                    return (
                      <td key={date} role="gridcell" aria-selected={selected}>
                        <button type="button" data-date={date} tabIndex={date === focus ? 0 : -1} disabled={disabled} aria-disabled={disabled}
                          aria-current={isToday ? 'date' : undefined} aria-label={`${longTr(date)}${isToday ? ' (bugün)' : ''}`}
                          onClick={() => choose(date)} onFocus={() => setFocus(date)}
                          className={`h-8 w-full rounded-[8px] text-[13px] font-bold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-yoca-lime disabled:cursor-not-allowed disabled:opacity-25 ${
                            selected ? 'bg-yoca-lime text-black' : `${isToday ? 'border border-yoca-lime/70 text-yoca-lime' : inMonth ? 'text-soft' : 'text-subtle/60'} hover:bg-surface-deep`}`}>
                          {Number(date.slice(8, 10))}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex justify-between gap-2 text-[12px]">
            <button type="button" className="text-subtle underline-offset-2 hover:text-yoca-lime hover:underline disabled:opacity-40" disabled={!inBounds(today, bounds)} onClick={() => choose(today)}>Bugün</button>
            <button type="button" className="text-subtle underline-offset-2 hover:text-yoca-lime hover:underline" onClick={() => close()}>Kapat</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A DateField with the panel's visible field label above it (forms and
 * filters). The visible label is decorative; the field keeps its own
 * accessible name ("<label> (gg.aa.yyyy)").
 */
export function LabeledDate({ label, className = '', ...rest }: { label: string; value: string; onChange: (iso: string) => void; min?: string | null; max?: string | null; today?: string; id?: string; className?: string }) {
  return (
    <div className={`admin-label ${className}`}>
      <span aria-hidden="true">{label}</span>
      <DateField label={label.replace(/\s*\*$/, '')} today={rest.today ?? ''} {...rest} />
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/**
 * Local date + time (the value of an <input type="datetime-local">:
 * "yyyy-MM-ddTHH:mm", the browser's local time). The date is the dark Turkish
 * DateField; hour and minute are two selects. The value is emitted only when
 * date, hour and minute are all chosen (otherwise ''), exactly like the native
 * field, so callers convert it as before (e.g. localInputToIso).
 */
export function DateTimeField({ label, value, onChange, id }: { label: string; value: string; onChange: (local: string) => void; id?: string }) {
  const auto = useId();
  const base = id ?? auto;
  const [d, setD] = useState(value.slice(0, 10));
  const [h, setH] = useState(value.slice(11, 13));
  const [m, setM] = useState(value.slice(14, 16));
  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) { setD(value.slice(0, 10)); setH(value.slice(11, 13)); setM(value.slice(14, 16)); }
  }, [value]);
  const emit = (nd: string, nh: string, nm: string) => onChange(isIso(nd) && nh && nm ? `${nd}T${nh}:${nm}` : '');
  const sel = 'h-10 rounded-[10px] border border-[var(--line-2,#343943)] bg-[var(--inset,#0d0f12)] px-2 text-[13px] font-semibold tabular-nums text-soft outline-none focus:border-yoca-lime focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yoca-lime';
  return (
    <div className="admin-label" role="group" aria-labelledby={`${base}-legend`}>
      <span id={`${base}-legend`}>{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[11rem] flex-1">
          <DateField label={`${label}: tarih`} today="" value={d} onChange={(v) => { setD(v); emit(v, h, m); }} />
        </div>
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor={`${base}-h`}>{label}: saat</label>
          <select id={`${base}-h`} className={sel} value={h} onChange={(e) => { setH(e.target.value); emit(d, e.target.value, m); }}>
            <option value="">sa</option>
            {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <span aria-hidden="true" className="font-bold text-subtle">:</span>
          <label className="sr-only" htmlFor={`${base}-m`}>{label}: dakika</label>
          <select id={`${base}-m`} className={sel} value={m} onChange={(e) => { setM(e.target.value); emit(d, h, e.target.value); }}>
            <option value="">dk</option>
            {MINUTES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
