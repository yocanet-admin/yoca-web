'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Empty, Flash, PageHead, field, fmtDate, small } from '@/components/admin/ops/ui';
import { Remaining, SourceBadge, StateBadge, money } from '@/components/admin/fin/parts';
import { ImportPanel } from '@/components/admin/fin/ImportPanel';
import { loadFinance, type FinData } from '@/lib/fin/data';
import {
  CATEGORIES, CATEGORY_LABEL, CSV_HEADER, FIN_STATE_LABEL, RECURRENCE_LABEL, buildItems, csvRows, filterItems, overview,
  type Filter, type Item, type Totals,
} from '@/lib/fin/model';
import { toCsv } from '@/lib/ops/csv';
import { daysUntil, dueText, istanbulDay } from '@/lib/ops/model';
import { formatAmount, formatTotals } from '@/lib/ops/money';

/**
 * Yoca — Giderler (overview + list). Recurring and one-off expenses together
 * with the Operasyon provider costs (shown once, "Kaynak: Operasyon").
 * Totals are per currency; a period without an amount is counted, not added.
 * Filters live in the URL (shareable): ?cat=&state=&prov=&from=&to=&src=&q=&view=
 */

const BASE = '/admin/expenses';
const STATE_OPTIONS: Array<[string, string]> = [['open', 'Ödenmemiş'], ['', 'Tümü'], ['pending', FIN_STATE_LABEL.pending], ['partial', FIN_STATE_LABEL.partial], ['overdue', FIN_STATE_LABEL.overdue], ['paid', FIN_STATE_LABEL.paid], ['review', FIN_STATE_LABEL.review], ['over', FIN_STATE_LABEL.over], ['unknown', FIN_STATE_LABEL.unknown], ['cancelled', FIN_STATE_LABEL.cancelled]];

function Card({ title, totals, sub, tone }: { title: string; totals: Totals; sub?: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className={`grid gap-0.5 border px-3 py-2.5 ${tone === 'bad' ? 'border-red-500/50' : tone === 'warn' ? 'border-yellow-400/40' : 'border-line'}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">{title}</span>
      <span className="text-[16px] font-extrabold tabular-nums">{formatTotals(totals)}</span>
      {sub && <span className="text-[12px] text-subtle">{sub}</span>}
    </div>
  );
}

function ExpensesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<FinData | null>(null);
  const today = istanbulDay();
  useEffect(() => { void loadFinance().then(setData); }, []);

  const f: Filter = {
    category: params.get('cat') ?? '', state: params.get('state') ?? 'open', provider: params.get('prov') ?? '',
    from: params.get('from') ?? '', to: params.get('to') ?? '', source: (params.get('src') ?? '') as Filter['source'], q: params.get('q') ?? '',
  };
  const view = params.get('view') === 'defs' ? 'defs' : params.get('view') === 'import' ? 'import' : 'periods';
  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (patch.state === '') next.set('state', 'all');
    router.replace(`${BASE}?${next.toString()}`, { scroll: false });
  };
  if (f.state === 'all') f.state = '';

  const items = useMemo(() => (data?.ready ? buildItems({ ...data, today }) : []), [data, today]);
  const shown = useMemo(() => filterItems(items, f), [items, f.category, f.state, f.provider, f.from, f.to, f.source, f.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const ov = useMemo(() => overview(items, today), [items, today]);
  const providers = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) if (it.provider) m.set(it.providerId ?? it.provider, it.provider);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  }, [items]);
  const shownTotals = useMemo(() => {
    const amount: Totals = {}; const remaining: Totals = {};
    let unknown = 0;
    for (const it of shown) {
      if (it.summary.state === 'cancelled') continue;
      if (it.summary.expected === null || !it.currency) { unknown += 1; continue; }
      amount[it.currency] = (amount[it.currency] ?? BigInt(0)) + it.summary.expected;
      if (it.summary.remaining !== null && it.summary.remaining > BigInt(0)) remaining[it.currency] = (remaining[it.currency] ?? BigInt(0)) + it.summary.remaining;
    }
    return { amount, remaining, unknown };
  }, [shown]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(CSV_HEADER, csvRows(shown))], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yoca-giderler-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Giderler yüklenemedi.'} />;

  const monthName = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date(`${today}T12:00:00Z`));

  return (
    <div className="grid gap-6">
      <PageHead kicker="Finans"
        title="Giderler"
        sub="Düzenli ve tek seferlik giderler ile Operasyon’daki sağlayıcı ödemeleri. Kayıt ve takip içindir; banka işlemi veya otomatik ödeme yapmaz."
        actions={<>
          <Link href={`${BASE}/new`} className="admin-btn admin-btn-primary">Yeni gider</Link>
          <button type="button" className="admin-btn" onClick={exportCsv} disabled={!shown.length}>CSV indir ({shown.length})</button>
        </>}
      />

      <section aria-label="Genel bakış" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title={`Bu ay ödenen · ${monthName}`} totals={ov.paidThisMonth} sub="Geçerli ödeme kayıtları (iadeler düşülür)" />
        <Card title="Bu ay kalan" totals={ov.remainingThisMonth} sub="Bu ay vadesi gelen dönemlerden kalan" />
        <Card title="Geciken" totals={ov.overdue} sub={`${ov.overdueCount} dönem`} tone={ov.overdueCount ? 'bad' : undefined} />
        <Card title="Yaklaşan · 30 gün" totals={ov.upcoming} sub={`${ov.upcomingCount} dönem${ov.unknownCount ? ` · ${ov.unknownCount} dönemin tutarı bekleniyor` : ''}`} tone={ov.upcomingCount ? 'warn' : undefined} />
      </section>
      <p className="-mt-3 text-[12px] text-subtle">Para birimleri ayrı toplanır; kur dönüşümü yapılmaz. Operasyon sağlayıcı ödemeleri tek kayıt olarak sayılır. Tutarı beklenen dönemler toplamlara katılmaz.{ov.reviewCount ? ` İnceleme bekleyen ${ov.reviewCount} dönem (${formatTotals(ov.review)}) ne ödenmiş ne kalan sayılır.` : ''}</p>

      <div className="flex flex-wrap gap-2" role="tablist">
        {([['periods', 'Dönemler ve ödemeler'], ['defs', 'Gider tanımları'], ['import', 'Aktarım']] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={`${small} ${view === k ? '!border-yoca-lime !text-yoca-lime' : ''}`} onClick={() => setParam({ view: k === 'periods' ? '' : k })}>{t}</button>
        ))}
      </div>

      {view === 'import' ? <ImportPanel onApplied={() => void loadFinance().then(setData)} /> : view === 'defs' ? <Definitions data={data} items={items} /> : (
        <>
          <section aria-label="Filtreler" className="grid grid-cols-2 gap-3 border border-line p-3 lg:grid-cols-4 xl:grid-cols-7">
            <label className="grid gap-1 text-[12px] font-semibold text-muted">Kategori
              <select className={field} value={f.category} onChange={(e) => setParam({ cat: e.target.value })}>
                <option value="">Tümü</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}<option value="ops">{CATEGORY_LABEL.ops}</option>
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-muted">Durum
              <select className={field} value={f.state} onChange={(e) => setParam({ state: e.target.value })}>
                {STATE_OPTIONS.map(([v, t]) => <option key={v || 'all'} value={v}>{t}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-muted">Sağlayıcı / firma
              <select className={field} value={f.provider} onChange={(e) => setParam({ prov: e.target.value })}>
                <option value="">Tümü</option>{providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-muted">Vade başı<input type="date" className={field} value={f.from} onChange={(e) => setParam({ from: e.target.value })} /></label>
            <label className="grid gap-1 text-[12px] font-semibold text-muted">Vade sonu<input type="date" className={field} value={f.to} onChange={(e) => setParam({ to: e.target.value })} /></label>
            <label className="grid gap-1 text-[12px] font-semibold text-muted">Kaynak
              <select className={field} value={f.source ?? ''} onChange={(e) => setParam({ src: e.target.value })}>
                <option value="">Tümü</option><option value="fin">Giderler</option><option value="ops">Operasyon</option>
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-muted">Ara<input className={field} value={f.q} onChange={(e) => setParam({ q: e.target.value })} placeholder="açıklama, firma…" /></label>
          </section>

          <div className="flex flex-wrap gap-3 text-[13px]">
            <span className="text-subtle">{shown.length} dönem</span>
            <span>Tutar: <strong className="tabular-nums">{formatTotals(shownTotals.amount)}</strong></span>
            <span>Kalan: <strong className="tabular-nums">{formatTotals(shownTotals.remaining)}</strong></span>
            {shownTotals.unknown > 0 && <span className="text-yellow-200">{shownTotals.unknown} dönemin tutarı bekleniyor (toplama katılmadı)</span>}
            <span className="ms-auto flex gap-2">
              <button type="button" className={small} onClick={() => setParam({ from: `${today.slice(0, 7)}-01`, to: '', state: 'all' })}>Bu ay</button>
              <button type="button" className={small} onClick={() => setParam({ state: 'overdue', from: '', to: '' })}>Gecikenler</button>
              <button type="button" className={small} onClick={() => router.replace(BASE)}>Filtreleri temizle</button>
            </span>
          </div>

          {shown.length === 0 ? <Empty text={items.length ? 'Bu filtrelere uyan dönem yok.' : 'Henüz gider yok. “Yeni gider” ile ilk düzenli veya tek seferlik gideri ekleyin.'} /> : (
            <div className="overflow-x-auto border border-line">
              <table className="w-full min-w-[980px] text-left text-[13px]">
                <thead className="bg-surface text-[11px] uppercase tracking-[0.06em] text-subtle">
                  <tr>{['Vade', 'Gider / hizmet', 'Kategori', 'Sağlayıcı / firma', 'Tutar', 'Ödenen', 'Kalan', 'Durum', ''].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
                </thead>
                <tbody>{shown.map((it) => <Row key={it.key} it={it} today={today} />)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const href = (it: Item) => (it.source === 'ops' ? `${BASE}/ops/${it.periodId}` : `${BASE}/${it.expenseId}?period=${it.periodId}`);

function Row({ it, today }: { it: Item; today: string }) {
  const td = 'px-3 py-2.5 align-top';
  const d = it.dueOn ? daysUntil(it.dueOn, today) : null;
  const open = !['paid', 'over', 'cancelled'].includes(it.summary.state);
  return (
    <tr className="border-t border-line">
      <td className={td}>
        {it.dueOn ? <span className="grid"><span className="tabular-nums">{fmtDate(it.dueOn)}</span>{open && <span className={`text-[11px] ${d !== null && d < 0 ? 'text-red-300' : d !== null && d <= 7 ? 'text-yellow-200' : 'text-subtle'}`}>{dueText(it.dueOn, today)}</span>}</span> : <span className="text-subtle">Vade bilinmiyor</span>}
      </td>
      <td className={td}>
        <span className="grid gap-0.5">
          <Link href={href(it)} className="font-semibold text-soft underline-offset-2 hover:underline">{it.title}</Link>
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-subtle"><SourceBadge source={it.source} />{[it.recurrence ? RECURRENCE_LABEL[it.recurrence as keyof typeof RECURRENCE_LABEL] : it.source === 'fin' ? 'Tek seferlik' : '', it.periodText].filter(Boolean).join(' · ')}</span>
        </span>
      </td>
      <td className={td}>{it.categoryText}</td>
      <td className={td}>{it.provider ?? <span className="text-subtle">—</span>}</td>
      <td className={`${td} tabular-nums`}>{it.amount ? formatAmount(it.amount, it.currency) : <span className="text-subtle">Tutar bekleniyor</span>}</td>
      <td className={`${td} tabular-nums`}>{money(it.summary.paid, it.currency)}</td>
      <td className={td}><Remaining it={it} /></td>
      <td className={td}><StateBadge s={it.summary} /></td>
      <td className={td}>{open && it.summary.state !== 'unknown' ? <Link href={href(it)} className={small}>Ödeme kaydet</Link> : <Link href={href(it)} className={small}>Aç</Link>}</td>
    </tr>
  );
}

function Definitions({ data, items }: { data: FinData; items: Item[] }) {
  const [showArchived, setShowArchived] = useState(false);
  const partyBy = new Map(data.parties.map((p) => [p.id, p.name] as const));
  const list = data.expenses.filter((e) => showArchived || !e.archived_at);
  return (
    <section className="grid gap-3">
      <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arşivlenenleri göster</label>
      {list.length === 0 ? <Empty text="Gider tanımı yok." /> : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="bg-surface text-[11px] uppercase tracking-[0.06em] text-subtle">
              <tr>{['Gider', 'Kategori', 'Tür', 'Tutar (yeni dönemler)', 'Sağlayıcı / firma', 'Açık dönem', 'Sorumlu'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const open = items.filter((it) => it.expenseId === e.id && !['paid', 'over', 'cancelled'].includes(it.summary.state)).length;
                return (
                  <tr key={e.id} className="border-t border-line">
                    <td className="px-3 py-2.5"><Link href={`${BASE}/${e.id}`} className="font-semibold text-soft hover:underline">{e.title}</Link>{e.archived_at && <> <Badge>Arşivde</Badge></>}</td>
                    <td className="px-3 py-2.5">{CATEGORY_LABEL[e.category]}</td>
                    <td className="px-3 py-2.5">{e.kind === 'recurring' ? `${RECURRENCE_LABEL[e.recurrence ?? 'monthly']}${e.ends_on ? ` · ${fmtDate(e.ends_on)} bitiş` : ''}` : 'Tek seferlik'}</td>
                    <td className="px-3 py-2.5 tabular-nums">{e.amount ? formatAmount(e.amount, e.currency) : <span className="text-subtle">Bilinmiyor</span>}</td>
                    <td className="px-3 py-2.5">{(e.provider_id ? partyBy.get(e.provider_id) : null) ?? e.vendor_name ?? '—'}</td>
                    <td className="px-3 py-2.5">{open}</td>
                    <td className="px-3 py-2.5">{e.owner_email ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="text-[14px] text-subtle">Yükleniyor…</p>}><ExpensesPage /></Suspense>;
}
