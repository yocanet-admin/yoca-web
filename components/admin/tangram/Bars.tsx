'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtDay, fmtNumber } from '@/lib/cockpit/client';
import s from './tangram.module.css';

/**
 * Tek seri sütun grafik (Tangram dili: yuvarlak uçlu kalın sütunlar, ince
 * taban çizgisi, seyrek eksen etiketi). Son gün (sürüyor) lime, diğerleri gri;
 * değerler fareyle VE klavye odağıyla görünür, ekran okuyucu için gizli tablo.
 */
export default function Bars({ data, label, lastIsPartial = true }: { data: Array<{ date: string; value: number }>; label: string; lastIsPartial?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setW(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (data.length === 0) return <p className={s.note}>Bu aralıkta veri yok.</p>;

  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = max <= 10 ? 10 : max <= 50 ? Math.ceil(max / 10) * 10 : Math.ceil(max / 50) * 50;
  const H = W < 420 ? 170 : 210;
  const pad = { l: 34, r: 4, t: 10, b: 24 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / data.length;
  const barW = Math.max(4, Math.min(22, band * 0.62));
  const ticks = [0, niceMax / 2, niceMax];
  const labelEvery = Math.ceil(data.length / Math.max(3, Math.floor(plotW / 78)));
  const last = data.length - 1;
  const active = hover !== null ? data[hover] : null;

  return (
    <figure ref={box} className={s.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label}: günlük sütun grafik, ${data.length} gün`}>
        {ticks.map((t) => {
          const y = pad.t + plotH - (t / niceMax) * plotH;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke={t === 0 ? '#3a3f48' : '#20242a'} strokeWidth={1} />
              <text x={pad.l - 8} y={y + 3} textAnchor="end" fontSize="11" fill="#a3a6ae">{fmtNumber(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = d.value === 0 ? 0 : Math.max(3, (d.value / niceMax) * plotH);
          const x = pad.l + i * band + (band - barW) / 2;
          const y = pad.t + plotH - h;
          const r = Math.min(6, barW / 2, h);
          const path = h === 0 ? '' : `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`;
          const isLast = i === last && lastIsPartial;
          const fill = hover === i ? '#d7ff8f' : isLast ? '#a2ff00' : '#4a505b';
          return (
            <g key={d.date}>
              {path && <path d={path} fill={fill} />}
              {(i % labelEvery === 0 || i === last) && (
                <text x={pad.l + i * band + band / 2} y={H - 6} textAnchor={i === last ? 'end' : 'middle'} fontSize="11" fill={i === last ? '#f4f4f1' : '#a3a6ae'} fontWeight={i === last ? 700 : 400}>
                  {i === last && lastIsPartial ? 'Bugün' : fmtDay(d.date)}
                </text>
              )}
              <rect
                x={pad.l + i * band} y={pad.t} width={band} height={plotH} fill="transparent" tabIndex={0}
                aria-label={`${fmtDay(d.date)}${isLast ? ' (bugün, gün sürüyor)' : ''}: ${d.value} ${label.toLocaleLowerCase('tr')}`}
                onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                className={s.chartBar}
              />
              {hover === i && <rect x={pad.l + i * band + 1} y={pad.t} width={band - 2} height={plotH} fill="none" stroke="#a2ff00" strokeOpacity={0.5} rx={4} pointerEvents="none" />}
            </g>
          );
        })}
      </svg>
      {active && hover !== null && (
        <div className={s.chartTip} style={{ left: `${Math.min(78, Math.max(0, ((pad.l + hover * band) / W) * 100 - 6))}%` }}>
          <strong className={s.num}>{fmtNumber(active.value)}</strong>
          <span>{label} · {fmtDay(active.date)}{hover === last && lastIsPartial ? ' · gün sürüyor' : ''}</span>
        </div>
      )}
      <div className={s.srOnly}>
        <table>
          <caption>{label}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}><th scope="row">{d.date}</th><td>{d.value}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
