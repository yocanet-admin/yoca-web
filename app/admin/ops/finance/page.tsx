'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PAY_TONE, RENEW_TONE } from '@/components/admin/ops/ServiceForm';
import { Badge, Empty, EntityLink, Flash, PageHead, Unknown, field, fmtDate, small } from '@/components/admin/ops/ui';
import { loadOps, type OpsData, type Party } from '@/lib/ops/data';
import {
  KIND_LABEL,
  PAY_STATE_LABEL,
  RENEW_STATE_LABEL,
  daysUntil,
  dueText,
  istanbulDay,
  payState,
  renewState,
  type PaySummary,
  type Payment,
  type PeriodRow,
  type RenewState,
  type Service,
} from '@/lib/ops/model';
import { CURRENCIES, formatAmount, formatMinor, formatTotals, parseAmount, totalsByCurrency, type Minor, type MoneyLine } from '@/lib/ops/money';

/**
 * Yoca Operasyon — Ödemeler ve yenilemeler.
 * ?view=renewals|collections|costs|payments|calendar. Totals are always per
 * currency (no conversion); records with an unknown amount are counted, not
 * added as 0. Collection, provider payment and renewal are shown separately.
 */

const BASE = '/admin/ops/finance';
const SVC = '/admin/ops/services';
const ZERO = BigInt(0);
const VIEWS: Array<[string, string]> = [['renewals', 'Yenilemeler'], ['collections', 'Tahsilatlar'], ['costs', 'Sağlayıcı maliyetleri'], ['payments', 'Ödeme kayıtları'], ['calendar', 'Takvim']];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const monthOf = (d: string) => d.slice(0, 7);
const validMonth = (m: string | null) => (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null);
function shiftMonth(ym: string, delta: number): string {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

function addTo(acc: Record<string, Minor>, currency: string | null, v: Minor | null) {
  if (!currency || v === null) return;
  acc[currency] = (acc[currency] ?? ZERO) + v;
}

/** "₺1.000,00 · $50,00 · 3 kayıt tutarı bilinmiyor" — per currency, never mixed. */
function TotalsLine({ title, lines, totals, unknown }: { title: string; lines?: MoneyLine[]; totals?: Record<string, Minor>; unknown?: number }) {
  const t = lines ? totalsByCurrency(lines) : { totals: totals ?? {}, unknown: unknown ?? 0 };
  return (
    <div className="grid gap-0.5 border border-line px-3 py-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">{title}</span>
      <span className="text-[15px] font-extrabold tabular-nums">{formatTotals(t.totals)}</span>
      {t.unknown > 0 && <span className="text-[12px] text-yellow-200">{t.unknown} kayıt tutarı bilinmiyor</span>}
    </div>
  );
}

interface Ctx {
  data: OpsData;
  today: string;
  live: Service[];
  openBy: Map<string, PeriodRow>;
  paysBy: Map<string, Payment[]>;
  clientsOf: (serviceId: string) => Party[];
  partyName: (id: string | null) => string | null;
  serviceBy: Map<string, Service>;
}

function buildCtx(data: OpsData, today: string): Ctx {
  const openBy = new Map<string, PeriodRow>();
  for (const p of data.periods) if (p.status === 'open') openBy.set(p.service_id, p);
  const paysBy = new Map<string, Payment[]>();
  for (const p of data.payments) paysBy.set(p.service_id, [...(paysBy.get(p.service_id) ?? []), p]);
  const partyBy = new Map(data.parties.map((p) => [p.id, p] as const));
  const linkBy = new Map<string, Party[]>();
  for (const l of data.links) {
    const p = l.client_id ? partyBy.get(l.client_id) : undefined;
    if (p) linkBy.set(l.service_id, [...(linkBy.get(l.service_id) ?? []), p]);
  }
  return {
    data, today, openBy, paysBy,
    live: data.services.filter((s) => !s.archived_at),
    clientsOf: (id) => linkBy.get(id) ?? [],
    partyName: (id) => (id ? partyBy.get(id)?.name ?? null : null),
    serviceBy: new Map(data.services.map((s) => [s.id, s] as const)),
  };
}

function ServiceCell({ s, ctx }: { s: Service; ctx: Ctx }) {
  const clients = ctx.clientsOf(s.id);
  return (
    <span className="grid">
      <EntityLink href={`${SVC}/${s.id}`}>{s.name}</EntityLink>
      <span className="text-[12px] text-subtle">{KIND_LABEL[s.kind]}{clients.length ? ` · ${clients.map((c) => c.name).join(', ')}` : ''}</span>
    </span>
  );
}

function DateCell({ date, today }: { date: string | null; today: string }) {
  if (!date) return <Unknown>Bilinmiyor</Unknown>;
  const d = daysUntil(date, today);
  return (
    <span className="grid">
      <span className="tabular-nums">{fmtDate(date)}</span>
      <span className={`text-[11px] ${d < 0 ? 'text-red-300' : d <= 7 ? 'text-yellow-200' : 'text-subtle'}`}>{dueText(date, today)}</span>
    </span>
  );
}

function Table({ head, children, min = 820 }: { head: string[]; children: ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full text-left text-[13px]" style={{ minWidth: min }}>
        <thead className="bg-surface text-[11px] uppercase tracking-[0.06em] text-subtle">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const td = 'px-3 py-2.5 align-top';
const remainingText = (sum: PaySummary) => (sum.remaining !== null && sum.currency ? formatMinor(sum.remaining, sum.currency) : <Unknown>Bilinmiyor</Unknown>);

/* ── Renewals ────────────────────────────────────────────────────── */

function Renewals({ ctx, within, state }: { ctx: Ctx; within: number; state: string }) {
  const rows = useMemo(() => ctx.live
    .filter((s) => s.status !== 'cancelled' && !s.is_perpetual && s.period !== 'once')
    .map((s) => {
      const open = ctx.openBy.get(s.id) ?? null;
      const pays = ctx.paysBy.get(s.id) ?? [];
      return {
        s, open, end: open?.ends_on ?? s.end_on,
        rs: renewState(s, open, pays, ctx.today, within),
        pin: open ? payState(open, pays, 'in', ctx.today) : null,
        pout: open ? payState(open, pays, 'out', ctx.today) : null,
      };
    })
    .sort((a, b) => (a.end ?? '9999').localeCompare(b.end ?? '9999')), [ctx, within]);
  const unknownDates = rows.filter((r) => r.rs === 'unknown_date').length;
  const groups: Array<{ key: string; title: string; hint: string; rs: RenewState }> = [
    { key: 'awaiting', title: 'Doğrulama bekleyen', hint: 'Bitiş yaklaştı veya geçti; ödeme yapılmış ya da otomatik yenileme açık ama yeni bitiş tarihi sağlayıcıda doğrulanmadı.', rs: 'awaiting_verification' },
    { key: 'overdue', title: 'Geciken', hint: 'Bitiş tarihi geçti; ödeme veya yenileme kaydı yok.', rs: 'overdue' },
    { key: 'upcoming', title: `Yaklaşan (${within} gün içinde)`, hint: 'Henüz ödeme veya doğrulama yok.', rs: 'upcoming' },
  ];
  const shown = groups.filter((g) => !state || g.key === state);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted">Pencere:</span>
        {[7, 30, 90].map((n) => (
          <Link key={n} href={`${BASE}?view=renewals&within=${n}${state ? `&state=${state}` : ''}`} aria-current={within === n ? 'page' : undefined} className={`${small} ${within === n ? '!border-yoca-lime !text-yoca-lime' : ''}`}>{n} gün</Link>
        ))}
        <span className="ms-2 text-muted">Grup:</span>
        <Link href={`${BASE}?view=renewals&within=${within}`} className={`${small} ${!state ? '!border-yoca-lime !text-yoca-lime' : ''}`}>Tümü</Link>
        <Link href={`${BASE}?view=renewals&within=${within}&state=awaiting`} className={`${small} ${state === 'awaiting' ? '!border-yoca-lime !text-yoca-lime' : ''}`}>Doğrulama bekleyen</Link>
        <Link href={`${BASE}?view=renewals&within=${within}&state=overdue`} className={`${small} ${state === 'overdue' ? '!border-yoca-lime !text-yoca-lime' : ''}`}>Geciken</Link>
      </div>
      {unknownDates > 0 && <p className="text-[12px] text-yellow-200">{unknownDates} hizmetin bitiş tarihi bilinmiyor; bu listelerde yer almaz. <Link href={`${SVC}?renew=unknown_date`} className="underline">Listeyi aç</Link></p>}
      {shown.map((g) => {
        const list = rows.filter((r) => r.rs === g.rs);
        return (
          <section key={g.key} className="grid gap-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-extrabold">{g.title} <span className="text-subtle">({list.length})</span></h2>
                <p className="text-[12px] text-subtle">{g.hint}</p>
              </div>
            </div>
            {list.length === 0 ? <p className="text-[13px] text-subtle">Kayıt yok.</p> : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <TotalsLine title="Beklenen sağlayıcı maliyeti" lines={list.map((r) => ({ amount: r.open ? r.open.actual_cost ?? r.open.expected_cost : r.s.cost_amount, currency: r.open ? r.open.cost_currency : r.s.cost_currency }))} />
                  <TotalsLine title="Beklenen müşteri tahsilatı" lines={list.map((r) => ({ amount: r.open ? r.open.expected_price : r.s.price_amount, currency: r.open ? r.open.price_currency : r.s.price_currency }))} />
                </div>
                <Table head={['Hizmet', 'Bitiş', 'Yenileme', 'Tahsilat', 'Sağlayıcı ödemesi', 'Alış / satış']}>
                  {list.map((r) => (
                    <tr key={r.s.id} className="border-t border-line">
                      <td className={td}><ServiceCell s={r.s} ctx={ctx} /></td>
                      <td className={td}><DateCell date={r.end} today={ctx.today} /></td>
                      <td className={td}><Badge tone={RENEW_TONE[r.rs]}>{RENEW_STATE_LABEL[r.rs]}</Badge>{r.s.auto_renew === 'on' && <span className="block text-[11px] text-subtle">otomatik yenileme açık</span>}</td>
                      <td className={td}>{r.pin ? <Badge tone={PAY_TONE[r.pin.state]}>{PAY_STATE_LABEL[r.pin.state]}</Badge> : <Unknown>Dönem yok</Unknown>}</td>
                      <td className={td}>{r.pout ? <Badge tone={PAY_TONE[r.pout.state]}>{PAY_STATE_LABEL[r.pout.state]}</Badge> : <Unknown>Dönem yok</Unknown>}</td>
                      <td className={`${td} tabular-nums`}>
                        {formatAmount(r.open ? r.open.actual_cost ?? r.open.expected_cost : r.s.cost_amount, r.open ? r.open.cost_currency : r.s.cost_currency)}
                        <span className="block text-subtle">{formatAmount(r.open ? r.open.expected_price : r.s.price_amount, r.open ? r.open.price_currency : r.s.price_currency)}</span>
                      </td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── Collections ─────────────────────────────────────────────────── */

function Collections({ ctx, state }: { ctx: Ctx; state: string }) {
  const all = useMemo(() => ctx.data.periods
    .filter((p) => (p.status === 'open' || p.status === 'renewed') && ctx.serviceBy.get(p.service_id) && !ctx.serviceBy.get(p.service_id)?.archived_at)
    .map((p) => ({ p, s: ctx.serviceBy.get(p.service_id) as Service, sum: payState(p, ctx.paysBy.get(p.service_id) ?? [], 'in', ctx.today), due: p.customer_due_on ?? p.due_on })), [ctx]);
  const unknownOpen = all.filter((r) => r.p.status === 'open' && r.sum.state === 'unknown').length;
  const states = state ? [state] : ['overdue', 'partial', 'pending'];
  const rows = all.filter((r) => states.includes(r.sum.state))
    .sort((a, b) => Number(b.sum.state === 'overdue') - Number(a.sum.state === 'overdue') || (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const remaining: Record<string, Minor> = {};
  const overdue: Record<string, Minor> = {};
  for (const r of rows) {
    addTo(remaining, r.sum.currency, r.sum.remaining);
    if (r.sum.state === 'overdue') addTo(overdue, r.sum.currency, r.sum.remaining);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted">Durum:</span>
        {[['', 'Tümü'], ['overdue', 'Gecikti'], ['partial', 'Kısmen ödendi'], ['pending', 'Bekliyor']].map(([k, l]) => (
          <Link key={k} href={`${BASE}?view=collections${k ? `&state=${k}` : ''}`} className={`${small} ${state === k ? '!border-yoca-lime !text-yoca-lime' : ''}`}>{l}</Link>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <TotalsLine title="Kalan tahsilat" totals={remaining} unknown={unknownOpen} />
        <TotalsLine title="Gecikmiş kalan" totals={overdue} />
      </div>
      {unknownOpen > 0 && <p className="text-[12px] text-subtle">Tutar bilinmeyen {unknownOpen} açık dönem toplamlara eklenmedi; satış bedelini hizmet veya dönem üzerinden girin.</p>}
      <p className="text-[12px] text-subtle">Yenilenmiş (kapanmış) dönemlerin ödenmemiş tahsilatları da listelenir: yenileme, tahsilatı tamamlamaz.</p>
      {rows.length === 0 ? <Empty text="Bekleyen tahsilat yok." /> : (
        <Table head={['Hizmet', 'Dönem', 'Tahsilat vadesi', 'Durum', 'Beklenen', 'Ödenen', 'Kalan']}>
          {rows.map((r) => (
            <tr key={r.p.id} className="border-t border-line">
              <td className={td}><ServiceCell s={r.s} ctx={ctx} /></td>
              <td className={`${td} tabular-nums`}>{fmtDate(r.p.starts_on) || '?'} – {fmtDate(r.p.ends_on) || '?'}{r.p.status !== 'open' && <span className="block text-[11px] text-subtle">dönem yenilendi</span>}</td>
              <td className={td}><DateCell date={r.due} today={ctx.today} /></td>
              <td className={td}><Badge tone={PAY_TONE[r.sum.state]}>{PAY_STATE_LABEL[r.sum.state]}</Badge></td>
              <td className={`${td} tabular-nums`}>{r.sum.expected !== null && r.sum.currency ? formatMinor(r.sum.expected, r.sum.currency) : <Unknown>Tutar bilinmiyor</Unknown>}</td>
              <td className={`${td} tabular-nums`}>{r.sum.currency ? formatMinor(r.sum.paid, r.sum.currency) : '—'}{Object.keys(r.sum.otherCurrencies).length > 0 && <span className="block text-[11px] text-yellow-200">+ {formatTotals(r.sum.otherCurrencies)} (farklı para birimi)</span>}</td>
              <td className={`${td} font-bold tabular-nums`}>{remainingText(r.sum)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

/* ── Provider costs (month) ──────────────────────────────────────── */

function Costs({ ctx, month }: { ctx: Ctx; month: string }) {
  const rows = useMemo(() => ctx.data.periods
    .filter((p) => p.status === 'open' && ((p.due_on && monthOf(p.due_on) === month) || (p.ends_on && monthOf(p.ends_on) === month)))
    .map((p) => ({ p, s: ctx.serviceBy.get(p.service_id) }))
    .filter((r): r is { p: PeriodRow; s: Service } => Boolean(r.s && !r.s.archived_at && r.s.payer_party !== 'client'))
    .map((r) => ({ ...r, sum: payState(r.p, ctx.paysBy.get(r.s.id) ?? [], 'out', ctx.today), date: r.p.due_on && monthOf(r.p.due_on) === month ? r.p.due_on : r.p.ends_on }))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')), [ctx, month]);
  const remaining: Record<string, Minor> = {};
  for (const r of rows) addTo(remaining, r.sum.currency, r.sum.remaining);
  const nav = (m: string) => `${BASE}?view=costs&month=${m}`;

  return (
    <div className="grid gap-4">
      <MonthNav month={month} href={nav} />
      <div className="grid gap-2 sm:grid-cols-2">
        <TotalsLine title={`${monthLabel(month)} beklenen sağlayıcı maliyeti`} lines={rows.map((r) => ({ amount: r.p.actual_cost ?? r.p.expected_cost, currency: r.p.cost_currency }))} />
        <TotalsLine title="Henüz ödenmemiş" totals={remaining} unknown={rows.filter((r) => r.sum.remaining === null).length} />
      </div>
      <p className="text-[12px] text-subtle">Açık dönemlerden sağlayıcı ödeme vadesi veya bitiş tarihi bu ayda olanlar (sağlayıcıya ödemeyi müşterinin doğrudan yaptığı hizmetler hariç). Sağlayıcıya ödeme yapılması yenilemenin doğrulandığı anlamına gelmez.</p>
      {rows.length === 0 ? <Empty text={`${monthLabel(month)} için beklenen sağlayıcı maliyeti yok.`} /> : (
        <Table head={['Hizmet', 'Sağlayıcı', 'Vade / bitiş', 'Beklenen', 'Ödeme durumu', 'Kalan']}>
          {rows.map((r) => (
            <tr key={r.p.id} className="border-t border-line">
              <td className={td}><ServiceCell s={r.s} ctx={ctx} /></td>
              <td className={td}>{ctx.partyName(r.s.provider_id) ?? <Unknown />}</td>
              <td className={td}>
                <span className="grid text-[12px]">
                  <span>Vade: {r.p.due_on ? fmtDate(r.p.due_on) : <Unknown>bilinmiyor</Unknown>}</span>
                  <span>Bitiş: {r.p.ends_on ? fmtDate(r.p.ends_on) : <Unknown>bilinmiyor</Unknown>}</span>
                </span>
              </td>
              <td className={`${td} tabular-nums`}>{formatAmount(r.p.actual_cost ?? r.p.expected_cost, r.p.cost_currency)}</td>
              <td className={td}><Badge tone={PAY_TONE[r.sum.state]}>{PAY_STATE_LABEL[r.sum.state]}</Badge></td>
              <td className={`${td} font-bold tabular-nums`}>{remainingText(r.sum)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

/* ── Payment records ─────────────────────────────────────────────── */

function Payments({ ctx, dir, currency, from, to, voided, setParams }: { ctx: Ctx; dir: string; currency: string; from: string; to: string; voided: boolean; setParams: (p: Record<string, string | null>) => void }) {
  const rows = useMemo(() => ctx.data.payments
    .filter((p) => (!dir || p.direction === dir) && (!currency || p.currency === currency) && (!from || p.paid_on >= from) && (!to || p.paid_on <= to) && (voided || !p.voided_at))
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at)), [ctx, dir, currency, from, to, voided]);
  const totals: Record<'in' | 'out', Record<string, Minor>> = { in: {}, out: {} };
  for (const p of rows) {
    if (p.voided_at) continue;
    const a = parseAmount(p.amount);
    if (a === null || a === undefined) continue;
    addTo(totals[p.direction], p.currency, p.kind === 'refund' ? -a : a);
  }
  const LIMIT = 300;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="grid gap-1 text-[12px] font-semibold text-muted">Yön
          <select className={`${field} !py-1.5 text-[13px]`} value={dir} onChange={(e) => setParams({ dir: e.target.value || null })}>
            <option value="">Tümü</option><option value="in">Tahsilat (müşteriden)</option><option value="out">Sağlayıcıya ödeme</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-muted">Para birimi
          <select className={`${field} !py-1.5 text-[13px]`} value={currency} onChange={(e) => setParams({ currency: e.target.value || null })}>
            <option value="">Tümü</option>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-muted">Başlangıç<input type="date" className={`${field} !py-1.5 text-[13px]`} value={from} onChange={(e) => setParams({ from: e.target.value || null })} /></label>
        <label className="grid gap-1 text-[12px] font-semibold text-muted">Bitiş<input type="date" className={`${field} !py-1.5 text-[13px]`} value={to} onChange={(e) => setParams({ to: e.target.value || null })} /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-soft"><input type="checkbox" className="accent-yoca-lime" checked={voided} onChange={(e) => setParams({ voided: e.target.checked ? '1' : null })} />İptal edilenler</label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <TotalsLine title="Tahsilat toplamı (net)" totals={totals.in} />
        <TotalsLine title="Sağlayıcıya ödeme toplamı (net)" totals={totals.out} />
      </div>
      <p className="text-[12px] text-subtle">İadeler düşülür, düzeltmeler işaretiyle eklenir, iptal (void) edilen kayıtlar toplamlara girmez. Para birimleri dönüştürülmez.</p>
      {rows.length === 0 ? <Empty text="Bu filtrelere uyan ödeme kaydı yok." /> : (
        <>
          <Table head={['Tarih', 'Hizmet', 'Yön', 'Tür', 'Tutar', 'Yöntem · ref', 'Kaydeden', 'Durum']} min={900}>
            {rows.slice(0, LIMIT).map((p) => {
              const s = ctx.serviceBy.get(p.service_id);
              return (
                <tr key={p.id} className={`border-t border-line ${p.voided_at ? 'text-subtle' : ''}`}>
                  <td className={`${td} tabular-nums`}>{fmtDate(p.paid_on)}</td>
                  <td className={td}>{s ? <ServiceCell s={s} ctx={ctx} /> : <Unknown>—</Unknown>}</td>
                  <td className={td}>{p.direction === 'in' ? 'Tahsilat' : 'Sağlayıcıya ödeme'}{ctx.partyName(p.client_id) && <span className="block text-[11px] text-subtle">{ctx.partyName(p.client_id)}</span>}</td>
                  <td className={td}>{p.kind === 'payment' ? 'Ödeme' : p.kind === 'refund' ? 'İade' : 'Düzeltme'}</td>
                  <td className={`${td} tabular-nums ${p.voided_at ? 'line-through' : ''}`}>{p.kind === 'refund' ? '−' : ''}{formatAmount(p.amount, p.currency)}</td>
                  <td className={td}>{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</td>
                  <td className={`${td} text-[12px]`}>{p.created_by ?? '—'}</td>
                  <td className={td}>{p.voided_at ? <><Badge tone="bad">İptal edildi</Badge><span className="block text-[11px]">{p.void_reason}</span></> : <Badge tone="ok">Geçerli</Badge>}</td>
                </tr>
              );
            })}
          </Table>
          {rows.length > LIMIT && <p className="text-[12px] text-subtle">İlk {LIMIT} kayıt gösteriliyor ({rows.length} kayıt). Tarih aralığını daraltın; toplamlar tüm kayıtları içerir.</p>}
        </>
      )}
    </div>
  );
}

/* ── Calendar ────────────────────────────────────────────────────── */

type EntryKind = 'end' | 'due' | 'collect' | 'cancel';
const ENTRY: Record<EntryKind, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted' }> = {
  end: { label: 'Yenileme', tone: 'info' }, due: { label: 'Ödeme', tone: 'warn' }, collect: { label: 'Tahsilat', tone: 'ok' }, cancel: { label: 'İptal son günü', tone: 'bad' },
};
interface Entry { date: string; kind: EntryKind; s: Service }

function MonthNav({ month, href }: { month: string; href: (m: string) => string }) {
  const current = istanbulDay().slice(0, 7);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href(shiftMonth(month, -1))} className={small} aria-label="Önceki ay">‹ Önceki</Link>
      <span className="min-w-[9rem] text-center text-[15px] font-extrabold">{monthLabel(month)}</span>
      <Link href={href(shiftMonth(month, 1))} className={small} aria-label="Sonraki ay">Sonraki ›</Link>
      {month !== current && <Link href={href(current)} className={small}>Bu ay</Link>}
    </div>
  );
}

function Calendar({ ctx, month }: { ctx: Ctx; month: string }) {
  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (const s of ctx.live) {
      if (s.status === 'cancelled') continue;
      const open = ctx.openBy.get(s.id) ?? null;
      const seen = new Set<string>();
      const push = (date: string | null | undefined, kind: EntryKind) => {
        if (!date || monthOf(date) !== month || seen.has(`${kind}:${date}`)) return;
        seen.add(`${kind}:${date}`);
        out.push({ date, kind, s });
      };
      if (!s.is_perpetual && s.period !== 'once') push(open?.ends_on ?? s.end_on, 'end');
      push(open?.due_on ?? s.due_on, 'due');
      push(open?.customer_due_on, 'collect');
      push(s.cancel_by, 'cancel');
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.s.name.localeCompare(b.s.name, 'tr'));
  }, [ctx, month]);
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const nav = (mm: string) => `${BASE}?view=calendar&month=${mm}`;
  const chip = (e: Entry, i: number) => (
    <li key={`${e.s.id}:${e.kind}:${i}`}>
      <Link href={`${SVC}/${e.s.id}`} className="block truncate border border-line px-1 py-0.5 text-[11px] hover:border-yoca-lime" title={`${ENTRY[e.kind].label}: ${e.s.name}`}>
        <span className={`font-bold ${ENTRY[e.kind].tone === 'bad' ? 'text-red-300' : ENTRY[e.kind].tone === 'warn' ? 'text-yellow-200' : ENTRY[e.kind].tone === 'ok' ? 'text-yoca-green' : 'text-sky-200'}`}>{ENTRY[e.kind].label}</span> · {e.s.name}
      </Link>
    </li>
  );

  return (
    <div className="grid gap-4">
      <MonthNav month={month} href={nav} />
      <div className="flex flex-wrap gap-1.5 text-[12px]">
        {(Object.keys(ENTRY) as EntryKind[]).map((k) => <Badge key={k} tone={ENTRY[k].tone}>{ENTRY[k].label}</Badge>)}
        <span className="text-subtle">Yenileme = dönem sonu · Ödeme = sağlayıcı vadesi · Tahsilat = müşteri vadesi</span>
      </div>
      {entries.length === 0 && <Empty text={`${monthLabel(month)} için tarih yok.`} />}

      {/* Desktop: month grid */}
      <div className="hidden md:grid md:grid-cols-7 md:border-l md:border-t md:border-line">
        {WEEKDAYS.map((w) => <div key={w} className="border-b border-r border-line bg-surface px-2 py-1 text-[11px] font-bold uppercase text-subtle">{w}</div>)}
        {cells.map((d, i) => {
          const list = d ? byDay.get(d) ?? [] : [];
          return (
            <div key={i} className={`min-h-[6.5rem] border-b border-r border-line p-1 ${!d ? 'bg-surface-deep/40' : d === ctx.today ? 'bg-yoca-lime/5' : ''}`}>
              {d && <p className={`mb-1 text-[11px] font-bold tabular-nums ${d === ctx.today ? 'text-yoca-lime' : 'text-subtle'}`}>{Number(d.slice(8, 10))}</p>}
              {list.length > 0 && <ul className="grid gap-0.5">{list.slice(0, 4).map(chip)}{list.length > 4 && <li className="text-[11px] text-subtle">+{list.length - 4} daha</li>}</ul>}
            </div>
          );
        })}
      </div>

      {/* Mobile: list by day */}
      <ol className="grid gap-3 md:hidden">
        {Array.from(byDay.keys()).map((d) => (
          <li key={d} className="grid gap-1">
            <p className={`text-[13px] font-bold ${d === ctx.today ? 'text-yoca-lime' : ''}`}>{fmtDate(d)} <span className="font-normal text-subtle">· {dueText(d, ctx.today)}</span></p>
            <ul className="grid gap-1">{(byDay.get(d) ?? []).map(chip)}</ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

function FinanceInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<OpsData | null>(null);
  useEffect(() => { loadOps().then(setData); }, []);
  const today = istanbulDay();
  const ctx = useMemo(() => (data?.ready ? buildCtx(data, today) : null), [data, today]);

  const viewRaw = params.get('view') ?? 'renewals';
  const view = VIEWS.some(([k]) => k === viewRaw) ? viewRaw : 'renewals';
  const withinRaw = Number(params.get('within'));
  const within = [7, 30, 90].includes(withinRaw) ? withinRaw : 30;
  const stateRaw = params.get('state') ?? '';
  const month = validMonth(params.get('month')) ?? today.slice(0, 7);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${BASE}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="grid gap-5">
      <PageHead title="Ödemeler ve yenilemeler" sub="Müşteriden tahsilat, sağlayıcıya ödeme ve sağlayıcıda yenileme ayrı ayrı izlenir; biri diğerini tamamlamaz. Toplamlar her para birimi için ayrıdır." />
      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Görünüm">
        {VIEWS.map(([k, l]) => (
          <Link key={k} href={`${BASE}?view=${k}`} aria-current={view === k ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-bold ${view === k ? 'border-yoca-lime text-white' : 'border-transparent text-muted hover:text-white'}`}>{l}</Link>
        ))}
      </nav>
      {!data ? <p className="text-[14px] text-muted">Yükleniyor…</p> : !data.ready || !ctx ? <Flash tone="bad" message={data.error ?? 'Veriler yüklenemedi.'} /> : (
        view === 'renewals' ? <Renewals ctx={ctx} within={within} state={['awaiting', 'overdue', 'upcoming'].includes(stateRaw) ? stateRaw : ''} />
          : view === 'collections' ? <Collections ctx={ctx} state={['pending', 'partial', 'overdue'].includes(stateRaw) ? stateRaw : ''} />
          : view === 'costs' ? <Costs ctx={ctx} month={month} />
          : view === 'payments' ? <Payments ctx={ctx} dir={['in', 'out'].includes(params.get('dir') ?? '') ? params.get('dir') ?? '' : ''} currency={(CURRENCIES as readonly string[]).includes(params.get('currency') ?? '') ? params.get('currency') ?? '' : ''} from={params.get('from') ?? ''} to={params.get('to') ?? ''} voided={params.get('voided') === '1'} setParams={setParams} />
          : <Calendar ctx={ctx} month={month} />
      )}
    </div>
  );
}

export default function FinancePage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Yükleniyor…</p>}>
      <FinanceInner />
    </Suspense>
  );
}
