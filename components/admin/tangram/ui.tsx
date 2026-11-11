import type { ReactNode } from 'react';
import s from './tangram.module.css';

/** Durum etiketi: simge + metin; renk yalnız destekler. */
export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'muted' | 'lime';
const TONE: Record<Tone, string> = { good: s.stGood, warn: s.stWarn, bad: s.stBad, info: s.stInfo, muted: s.stMuted, lime: s.stLime };

export function Status({ tone, icon, children, title }: { tone: Tone; icon: string; children: ReactNode; title?: string }) {
  return (
    <span className={`${s.st} ${TONE[tone]}`} title={title}>
      <span aria-hidden="true" className={s.stIcon}>{icon}</span>
      <span className={s.stText}>{children}</span>
    </span>
  );
}

export function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`${s.chev} ${className}`}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
