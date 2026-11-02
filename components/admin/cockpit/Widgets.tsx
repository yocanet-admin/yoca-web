'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmtDay, fmtNumber } from '@/lib/cockpit/client';

/**
 * Yoca cockpit — shared widgets.
 * Dark-only admin surface. Chart rules: one series per chart, thin marks with
 * rounded data-ends, a hairline baseline, values on hover/focus AND in the
 * hidden table, text in text tokens (never the series colour).
 */

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-line bg-surface-deep/80 p-5 lg:p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[12px] font-bold text-subtle transition-colors hover:text-yoca-lime">
      {children} →
    </Link>
  );
}

/** Stat tile: label · value · optional delta vs a named period · hint. */
export function StatTile({
  label,
  value,
  deltaPct,
  deltaLabel,
  hint,
  href,
  tone = 'default',
}: {
  label: string;
  value: string | null;
  deltaPct?: number | null;
  deltaLabel?: string;
  hint?: string;
  href?: string;
  tone?: 'default' | 'alert';
}) {
  const body = (
    <>
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className={`mt-2 text-[30px] font-extrabold leading-none tabular-nums tracking-[-0.02em] ${tone === 'alert' ? 'text-amber-300' : 'text-white'}`}>
        {value ?? <span className="inline-block h-7 w-14 animate-pulse rounded-sm bg-surface" />}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[12px] text-subtle">
        {deltaPct !== undefined && deltaPct !== null && (
          <span className={`font-bold ${deltaPct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            <span aria-hidden="true">{deltaPct >= 0 ? '▲' : '▼'}</span> {Math.abs(deltaPct)}%
            <span className="sr-only">{deltaPct >= 0 ? ' artış' : ' düşüş'}</span>
          </span>
        )}
        {deltaPct !== undefined && deltaPct !== null && deltaLabel && <span>{deltaLabel}</span>}
        {hint && <span>{hint}</span>}
      </p>
    </>
  );
  const cls = 'block rounded-md border border-line bg-surface-deep/80 p-5 transition-colors';
  return href ? (
    <Link href={href} className={`${cls} hover:border-yoca-lime/50`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Column chart over time, one series (visitors, page views, leads per week …). */
export function DailyBars({ data, label }: { data: Array<{ date: string; value: number }>; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Render at the real pixel width so text and bars keep their size at any layout width.
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setW(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  if (data.length === 0) return <p className="text-[13px] text-subtle">Bu aralıkta veri yok.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = max <= 4 ? 4 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
  const H = 170;
  const pad = { l: 34, r: 4, t: 8, b: 22 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / data.length;
  const barW = Math.max(3, Math.min(24, band - 2));
  const ticks = [0, niceMax / 2, niceMax];
  const labelEvery = Math.ceil(data.length / Math.max(3, Math.floor(plotW / 70)));
  const active = hover !== null ? data[hover] : null;

  return (
    <figure ref={box} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={`${label}: günlük grafik`}>
        {ticks.map((t) => {
          const y = pad.t + plotH - (t / niceMax) * plotH;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke={t === 0 ? '#3a3f4a' : '#23272f'} strokeWidth={1} />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#8b909b">
                {fmtNumber(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const value = d.value;
          const h = value === 0 ? 0 : Math.max(2, (value / niceMax) * plotH);
          const x = pad.l + i * band + (band - barW) / 2;
          const y = pad.t + plotH - h;
          const r = Math.min(4, barW / 2, h);
          const path =
            h === 0
              ? ''
              : `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`;
          return (
            <g key={d.date}>
              {path && <path d={path} fill={hover === i ? '#c4ff5c' : '#A2FF00'} />}
              {i % labelEvery === 0 && (
                <text x={pad.l + i * band + band / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#8b909b">
                  {fmtDay(d.date)}
                </text>
              )}
              <rect
                x={pad.l + i * band}
                y={pad.t}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${fmtDay(d.date)}: ${value} ${label.toLowerCase()}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="cursor-default outline-none"
              />
            </g>
          );
        })}
      </svg>
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-sm border border-line bg-surface px-3 py-2 text-[12px] shadow-lg"
          style={{ left: `${Math.min(80, ((pad.l + hover * band) / W) * 100)}%` }}
        >
          <p className="text-[15px] font-extrabold tabular-nums text-white">{fmtNumber(active.value)}</p>
          <p className="text-subtle">
            {label} · {fmtDay(active.date)}
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Ranked list with thin proportional bars (top pages, referrers, countries). */
export function RankList({ rows, empty = 'Veri yok.', format }: { rows: Array<{ label: string; value: number }>; empty?: string; format?: (label: string) => string }) {
  if (rows.length === 0) return <p className="text-[13px] text-subtle">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-2.5">
      {rows.map((row) => (
        <li key={row.label} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-soft" title={row.label}>
              {format ? format(row.label) : row.label}
            </span>
            <span className="flex-none font-bold tabular-nums text-white">{fmtNumber(row.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface">
            <div className="h-full rounded-full bg-yoca-green" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Status badge — icon + label, never colour alone. */
export function StatusBadge({ kind, children }: { kind: 'good' | 'warning' | 'critical' | 'neutral'; children: ReactNode }) {
  const style = {
    good: 'border-[#0ca30c]/50 text-[#5fd35f]',
    warning: 'border-[#fab219]/50 text-[#fab219]',
    critical: 'border-[#d03b3b]/60 text-[#ff7b7b]',
    neutral: 'border-line text-subtle',
  }[kind];
  const icon = { good: '●', warning: '▲', critical: '✕', neutral: '○' }[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-[11px] font-bold ${style}`}>
      <span aria-hidden="true">{icon}</span>
      {children}
    </span>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <div className={`rounded-md border px-4 py-3 text-[13px] leading-relaxed ${tone === 'warning' ? 'border-amber-400/40 bg-amber-400/5 text-amber-100' : 'border-line bg-surface text-soft'}`}>
      {children}
    </div>
  );
}
