'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MONTH_RE, shiftMonth } from '@/lib/fin/model';

/**
 * Yoca Finans — dark month / year picker (shared by Genel bakış, Gelirler and
 * Giderler). The browser's own <input type="month"> opens a white calendar that
 * cannot be themed consistently, so this is a small accessible popover instead:
 *   ‹ [Kasım 2026] ›  — previous / next month buttons stay outside the popover
 *   popover: ‹ 2026 › and a 3×4 month grid; the selected month is lime.
 * Keyboard: Enter / Space / ↓ on the trigger opens it; arrows move between
 * months (←/→ one month, ↑/↓ three), PageUp / PageDown change the year,
 * Home / End jump to January / December, Enter / Space choose, Escape or Tab
 * closes and returns focus to the trigger. A click / tap outside closes it.
 */

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export function MonthPicker({ value, onChange, thisMonth, label = 'Dönem' }: { value: string; onChange: (month: string) => void; thisMonth: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const [focusIdx, setFocusIdx] = useState(Number(value.slice(5, 7)) - 1);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const pop = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const dialogId = useId();

  const show = () => { setYear(Number(value.slice(0, 4))); setFocusIdx(Number(value.slice(5, 7)) - 1); setOpen(true); };
  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  const choose = (y: number, i: number) => { const m = `${y}-${String(i + 1).padStart(2, '0')}`; if (MONTH_RE.test(m)) onChange(m); close(); };

  // keep the popover inside the screen (phones: the trigger can sit near the right edge)
  useLayoutEffect(() => {
    if (!open || !pop.current) { setShift(0); return; }
    const r = pop.current.getBoundingClientRect();
    const left = r.left - shift;
    // the visible width: a popover that sticks out widens a phone's layout viewport (innerWidth) itself
    const max = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth, document.documentElement.clientWidth) - 8;
    setShift(left + r.width > max ? Math.max(8 - left, max - (left + r.width)) : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // focus the active month whenever the popover opens or the focus moves
  useEffect(() => { if (open) cells.current[focusIdx]?.focus(); }, [open, focusIdx, year]);
  // outside click / tap closes (without stealing the focus from where the user clicked)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (delta: number) => {
    let i = focusIdx + delta; let y = year;
    while (i < 0) { i += 12; y -= 1; }
    while (i > 11) { i -= 12; y += 1; }
    setYear(y); setFocusIdx(i);
  };
  const onGridKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowLeft') move(-1);
    else if (k === 'ArrowRight') move(1);
    else if (k === 'ArrowUp') move(-3);
    else if (k === 'ArrowDown') move(3);
    else if (k === 'PageUp') setYear(year - 1);
    else if (k === 'PageDown') setYear(year + 1);
    else if (k === 'Home') setFocusIdx(0);
    else if (k === 'End') setFocusIdx(11);
    else if (k === 'Escape') close();
    else if (k === 'Tab') { close(false); return; }
    else return;
    e.preventDefault();
  };

  const selY = Number(value.slice(0, 4)); const selI = Number(value.slice(5, 7)) - 1;
  const nowY = Number(thisMonth.slice(0, 4)); const nowI = Number(thisMonth.slice(5, 7)) - 1;
  const nav = 'inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--line-2,#343943)] bg-[var(--tile,#15171c)] text-[15px] text-muted transition-colors hover:border-yoca-lime hover:text-yoca-lime focus-visible:outline focus-visible:outline-2 focus-visible:outline-yoca-lime';

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${label} seçimi`}>
      <span className="text-[12px] font-bold text-[var(--ink-2,#c6c9cf)]">{label}</span>
      <button type="button" className={nav} onClick={() => onChange(shiftMonth(value, -1))} aria-label="Önceki ay">‹</button>
      <div ref={wrap} className="relative">
        <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}
          className="inline-flex h-10 min-w-[10.5rem] items-center justify-between gap-3 rounded-[10px] border border-[var(--line-2,#343943)] bg-[var(--inset,#0d0f12)] px-3 text-[14px] font-bold text-soft transition-colors hover:border-yoca-lime focus-visible:outline focus-visible:outline-2 focus-visible:outline-yoca-lime"
          onClick={() => (open ? close() : show())}
          onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); show(); } }}>
          <span>{monthName(value)}</span>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-subtle"><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        </button>
        {open && (
          <div ref={pop} id={dialogId} role="dialog" aria-label="Ay ve yıl seçin" aria-modal="false" style={shift ? { transform: `translateX(${shift}px)` } : undefined}
            className="absolute left-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-[14px] border border-[var(--line-2,#343943)] bg-[var(--tile-2,#1c1f25)] p-3 text-soft shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" className={nav} onClick={() => setYear(year - 1)} aria-label="Önceki yıl">‹</button>
              <span className="text-[14px] font-extrabold tabular-nums" aria-live="polite">{year}</span>
              <button type="button" className={nav} onClick={() => setYear(year + 1)} aria-label="Sonraki yıl">›</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="grid" aria-label={`${year} ayları`} onKeyDown={onGridKey}>
              {MONTHS.map((m, i) => {
                const selected = year === selY && i === selI;
                const current = year === nowY && i === nowI;
                return (
                  <button key={m} ref={(el) => { cells.current[i] = el; }} type="button" role="gridcell"
                    tabIndex={i === focusIdx ? 0 : -1} aria-selected={selected} aria-current={current ? 'date' : undefined}
                    aria-label={`${m} ${year}${current ? ' (bu ay)' : ''}`}
                    onClick={() => choose(year, i)} onFocus={() => setFocusIdx(i)}
                    className={`h-10 rounded-[9px] text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-yoca-lime ${
                      selected ? 'bg-yoca-lime text-black' : `border ${current ? 'border-yoca-lime/60 text-yoca-lime' : 'border-line text-muted'} bg-surface-deep hover:border-yoca-lime hover:text-soft`}`}>
                    {m.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between gap-2 text-[12px]">
              <button type="button" className="text-subtle underline-offset-2 hover:text-yoca-lime hover:underline" onClick={() => choose(nowY, nowI)}>Bu ay</button>
              <button type="button" className="text-subtle underline-offset-2 hover:text-yoca-lime hover:underline" onClick={() => close()}>Kapat</button>
            </div>
          </div>
        )}
      </div>
      <button type="button" className={nav} onClick={() => onChange(shiftMonth(value, 1))} aria-label="Sonraki ay">›</button>
    </div>
  );
}
