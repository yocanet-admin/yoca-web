'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Empty, Flash, PageHead, field, fmtDate, small } from '@/components/admin/ops/ui';
import { MonthPicker, monthName } from '@/components/admin/fin/MonthPicker';
import { FinanceNav } from '@/components/admin/fin/FinanceNav';
import { SourceBadge, TotalsCard, money } from '@/components/admin/fin/parts';
import { loadIncome, type IncomeData } from '@/lib/fin/incomeData';
import {
  INCOME_CATEGORIES, INCOME_CATEGORY_LABEL, INCOME_CSV_HEADER, INCOME_STATE_LABEL, buildIncomeItems, filterIncome, incomeCsvRows, incomeOverview, incomeStateText,
  type IncomeItem,
} from '@/lib/fin/income';
import { FIN_STATE_TONE, MONTH_RE, type Totals } from '@/lib/fin/model';
import { toCsv } from '@/lib/ops/csv';
import { dueText, istanbulDay } from '@/lib/ops/model';
import { formatAmount, formatTotals } from '@/lib/ops/money';

/**
 * Yoca Finans — Gelirler. Manual receivables (not tied to Operasyon or to a
 * customer) and Operasyon customer collection periods (shown once, "Kaynak:
 * Operasyon"). The cards and the list follow the selected month (?ay=YYYY-MM):
 * an item belongs to its period month (Operasyon: the month of its collection
 * due date). "Tahsil edilen" = net collections on those items, whatever the
 * collection date; the cash view by real date is on Finans › Genel bakış.
 * Filters live in the URL: ?ay=&kapsam=tum&cat=&state=&src=&q=
 */

const BASE = '/admin/finance/income';
const STATE_OPTIONS: Array<[string, string]> = [['open', 'Tahsil edilmemiş'], ['', 'Tümü'], ['pending', INCOME_STATE_LABEL.pending], ['partial', INCOME_STATE_LABEL.partial], ['overdue', INCOME_STATE_LABEL.overdue], ['paid', INCOME_STATE_LABEL.paid], ['over', INCOME_STATE_LABEL.over], ['unknown', INCOME_STATE_LABEL.unknown], ['cancelled', INCOME_STATE_LABEL.cancelled]];

function listTotals(items: IncomeItem[]) {
  const t = { amount: {} as Totals, collected: {} as Totals, remaining: {} as Totals, unknown: 0 };
  const add = (x: Totals, c: string, v: bigint) => { x[c] = (x[c] ?? BigInt(0)) + v; };
  for (const it of items) {
    const s = it.summary;
    if (s.state === 'cancelled') continue;
    if (it.currency && s.paid !== BigInt(0)) add(t.collected, it.currency, s.paid);
    if (s.expected === null || !it.currency) { t.unknown += 1; continue; }
    add(t.amount, it.currency, s.expected);
    if (s.remaining !== null && s.remaining > BigInt(0)) add(t.remaining, it.currency, s.remaining);
  }
  return t;
}

function IncomePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<IncomeData | null>(null);
  const today = istanbulDay();
  const thisMonth = today.slice(0, 7);
  useEffect(() => { void loadIncome().then(setData); }, []);

  const month = MONTH_RE.test(params.get('ay') ?? '') ? (params.get('ay') as string) : thisMonth;
  const allMonths = params.get('kapsam') === 'tum';
  const stateRaw = params.get('state') ?? 'open';
  const f = { month: allMonths ? '' : month, category: params.get('cat') ?? '', state: stateRaw === 'all' ? '' : stateRaw, source: (params.get('src') ?? '') as 'fin' | 'ops' | '', q: params.get('q') ?? '' };
  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (patch.state === '') next.set('state', 'all');
    router.replace(`${BASE}?${next.toString()}`, { scroll: false });
  };
  const goMonth = (m: string) => setParam({ ay: m === thisMonth ? '' : m, kapsam: '' });

  const items = useMemo(() => (data?.ready ? buildIncomeItems({ ...data, today }) : []), [data, today]);
  const shown = useMemo(() => filterIncome(items, f), [items, f.month, f.category, f.state, f.source, f.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const ov = useMemo(() => incomeOverview(items, today, month), [items, today, month]);
  const totals = useMemo(() => listTotals(shown), [shown]);
  const noMonth = items.filter((i) => i.month === null && i.summary.state !== 'cancelled').length;

  const exportCsv = () => {
    const blob = new Blob([toCsv(INCOME_CSV_HEADER, incomeCsvRows(shown))], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yoca-gelirler-${allMonths ? 'tum' : month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Gelirler yüklenemedi.'} />;
  const mName = monthName(month);

  return (
    <div className="grid gap-6">
      <PageHead kicker="Finans" title="Gelirler"
        sub="Elle eklenen gelir ve alacaklar ile Operasyon’daki müşteri tahsilatları. Kayıt ve takip içindir; banka işlemi yapmaz, müşteriye mesaj göndermez."
        actions={<>
          <Link href={`${BASE}/new`} className="admin-btn admin-btn-primary">Yeni gelir</Link>
          <button type="button" className="admin-btn" onClick={exportCsv} disabled={!shown.length}>CSV indir ({shown.length})</button>
        </>}
      />
      <FinanceNav active="income" />
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker value={month} onChange={goMonth} thisMonth={thisMonth} />
        {month !== thisMonth && <button type="button" className={small} onClick={() => goMonth(thisMonth)}>Bu aya dön</button>}
      </div>

      <section aria-label="Gelir dönem takibi" className="-mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TotalsCard title={`Beklenen · ${mName}`} totals={ov.total} sub={`${ov.count} kayıt${ov.unknownCount ? ` · ${ov.unknownCount} kaydın tutarı bekleniyor` : ''}`} />
        <TotalsCard title={`Tahsil edilen · ${mName}`} totals={ov.collected} sub={`${mName} gelirlerine kaydedilen net tahsilat (iadeler düşülür); tahsilat tarihine göre değil${Object.keys(ov.over).length ? ` · ${formatTotals(ov.over)} fazla tahsilat dahil` : ''}${Object.keys(ov.collectedUnknown).length ? ` · ${formatTotals(ov.collectedUnknown)} tutarı bilinmeyen kayıtlara` : ''}`} tone="ok" />
        <TotalsCard title={`Kalan alacak · ${mName}`} totals={ov.remaining} sub={`${ov.remainingCount} kayıt`} />
        <TotalsCard title="Geciken alacak · Tüm aylar · bugün itibarıyla" totals={ov.overdue} sub={`${ov.overdueCount} kayıt · tutarı bilinmeyenler hariç`} tone={ov.overdueCount ? 'bad' : undefined} />
      </section>
      <p className="-mt-3 text-[12px] text-subtle">Dönem takibi: kartlar yalnızca {mName} dönemine ait gelirleri sayar (Operasyon: müşteri tahsilat vadesinin ayı). Gerçek tahsilat tarihine göre giren para Finans › Genel bakış’taki nakit hareketindedir. Para birimleri ayrı toplanır; kur dönüşümü yapılmaz. Tutarı bilinmeyen kayıtlar toplamlara 0 olarak eklenmez.{noMonth ? ` Vadesi girilmemiş ${noMonth} Operasyon kaydı aylara dahil değil (Tüm aylar’da görünür).` : ''}</p>

      <section aria-label="Filtreler" className="grid grid-cols-2 gap-3 border border-line p-3 lg:grid-cols-4">
        <label className="grid gap-1 text-[12px] font-semibold text-muted">Kategori
          <select className={field} value={f.category} onChange={(e) => setParam({ cat: e.target.value })}>
            <option value="">Tümü</option>{INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{INCOME_CATEGORY_LABEL[c]}</option>)}<option value="ops">{INCOME_CATEGORY_LABEL.ops}</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-muted">Durum
          <select className={field} value={f.state} onChange={(e) => setParam({ state: e.target.value })}>
            {STATE_OPTIONS.map(([v, t]) => <option key={v || 'all'} value={v}>{t}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-muted">Kaynak
          <select className={field} value={f.source} onChange={(e) => setParam({ src: e.target.value })}>
            <option value="">Tümü</option><option value="fin">Gelirler</option><option value="ops">Operasyon</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-muted">Ara<input className={field} value={f.q} onChange={(e) => setParam({ q: e.target.value })} placeholder="açıklama, müşteri…" /></label>
      </section>

      <div className="flex flex-wrap gap-3 text-[13px]">
        <span className="font-semibold">{allMonths ? 'Tüm aylar' : mName}</span>
        <span className="text-subtle">{shown.length} kayıt</span>
        <span>Beklenen: <strong className="tabular-nums">{formatTotals(totals.amount)}</strong></span>
        <span>Tahsil edilen: <strong className="tabular-nums">{formatTotals(totals.collected)}</strong></span>
        <span>Kalan: <strong className="tabular-nums">{formatTotals(totals.remaining)}</strong></span>
        {totals.unknown > 0 && <span className="text-yellow-200">{totals.unknown} kaydın tutarı bekleniyor (toplama katılmadı)</span>}
        <span className="ms-auto flex flex-wrap gap-2">
          <button type="button" className={small} onClick={() => setParam({ kapsam: '' })}>Seçili ay</button>
          <button type="button" className={small} onClick={() => setParam({ kapsam: 'tum' })}>Tüm aylar</button>
          <button type="button" className={small} onClick={() => setParam({ state: 'overdue', kapsam: 'tum' })}>Gecikenler</button>
          <button type="button" className={small} onClick={() => router.replace(month === thisMonth ? BASE : `${BASE}?ay=${month}`)}>Filtreleri temizle</button>
        </span>
      </div>

      {shown.length === 0 ? <Empty text={items.length ? 'Bu filtrelere uyan kayıt yok.' : 'Henüz gelir yok. “Yeni gelir” ile ilk alacağı ekleyin; Operasyon’daki müşteri tahsilatları burada kendiliğinden görünür.'} /> : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead className="bg-surface text-[11px] uppercase tracking-[0.06em] text-subtle">
              <tr>{['Dönem / vade', 'Gelir / hizmet', 'Kategori', 'Müşteri / ödeyen', 'Beklenen', 'Tahsil edilen', 'Kalan', 'Durum', ''].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>{shown.map((it) => <Row key={it.key} it={it} today={today} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const href = (it: IncomeItem) => (it.source === 'ops' ? `${BASE}/ops/${it.id}` : `${BASE}/${it.id}`);

function Row({ it, today }: { it: IncomeItem; today: string }) {
  const td = 'px-3 py-2.5 align-top';
  const s = it.summary;
  return (
    <tr className="border-t border-line">
      <td className={td}>{it.month ? monthName(it.month) : <span className="text-subtle">Ay yok</span>}<span className="block text-[11px] text-subtle">{it.dueOn ? `${fmtDate(it.dueOn)} · ${dueText(it.dueOn, today)}` : 'vade yok'}</span></td>
      <td className={td}><Link href={href(it)} className="font-bold hover:text-yoca-lime">{it.title}</Link><span className="mt-1 flex flex-wrap items-center gap-1"><SourceBadge source={it.source} income />{it.periodText && it.source === 'ops' && <span className="text-[11px] text-subtle">{it.periodText}</span>}</span></td>
      <td className={td}>{it.categoryText}</td>
      <td className={td}>{it.party ?? <span className="text-subtle">—</span>}</td>
      <td className={`${td} tabular-nums`}>{it.amount ? formatAmount(it.amount, it.currency) : <span className="text-subtle">Tutar bekleniyor</span>}</td>
      <td className={`${td} tabular-nums`}>{money(s.paid, it.currency)}</td>
      <td className={`${td} tabular-nums`}>{s.remaining === null ? '—' : money(s.remaining, it.currency)}</td>
      <td className={td}><Badge tone={FIN_STATE_TONE[s.state]}>{incomeStateText(s)}</Badge></td>
      <td className={td}><Link href={href(it)} className={small}>{s.state === 'cancelled' ? 'Aç' : 'Tahsilat kaydet'}</Link></td>
    </tr>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="text-[14px] text-subtle">Yükleniyor…</p>}><IncomePage /></Suspense>;
}
