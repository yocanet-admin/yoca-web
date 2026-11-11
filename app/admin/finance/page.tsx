'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminTable, Badge, Empty, Flash, PageHead, fmtDate, small } from '@/components/admin/ops/ui';
import { MonthPicker, monthName } from '@/components/admin/fin/MonthPicker';
import { FinanceNav } from '@/components/admin/fin/FinanceNav';
import { TotalsCard } from '@/components/admin/fin/parts';
import { loadFinance, type FinData } from '@/lib/fin/data';
import { loadIncome, type IncomeData } from '@/lib/fin/incomeData';
import { CASH_SOURCE_LABEL, COLLECTION_KIND_LABEL, buildIncomeItems, cashFlow, incomeOverview } from '@/lib/fin/income';
import { MONTH_RE, PAYMENT_KIND_LABEL, buildItems, overview } from '@/lib/fin/model';
import { istanbulDay } from '@/lib/ops/model';
import { formatMinor, formatTotals } from '@/lib/ops/money';

/**
 * Yoca Finans — Genel bakış. Two views of the selected month, kept apart:
 *   Nakit hareketi — money that really came in / went out, by the real
 *     collection / payment date (refunds subtract; adjustments are corrections,
 *     listed but not money). Net nakit farkı = giren − çıkan; it is NOT profit.
 *   Dönem takibi — the income / expense that belongs to the month and how much
 *     of it is collected / paid, whatever the date.
 * Example: November rent paid in December → November period, December cash.
 * Currencies are never added together (no exchange rate is defined).
 */

function OverviewPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [fin, setFin] = useState<FinData | null>(null);
  const [inc, setInc] = useState<IncomeData | null>(null);
  const today = istanbulDay();
  const thisMonth = today.slice(0, 7);
  useEffect(() => { void loadFinance().then(setFin); void loadIncome().then(setInc); }, []);
  const month = MONTH_RE.test(params.get('ay') ?? '') ? (params.get('ay') as string) : thisMonth;
  const goMonth = (m: string) => router.replace(m === thisMonth ? '/admin/finance' : `/admin/finance?ay=${m}`, { scroll: false });

  const expenseItems = useMemo(() => (fin?.ready ? buildItems({ ...fin, today }) : []), [fin, today]);
  const incomeItems = useMemo(() => (inc?.ready ? buildIncomeItems({ ...inc, today }) : []), [inc, today]);
  const exp = useMemo(() => overview(expenseItems, today, month), [expenseItems, today, month]);
  const income = useMemo(() => incomeOverview(incomeItems, today, month), [incomeItems, today, month]);
  const cash = useMemo(() => cashFlow({ month, expenseItems, incomeItems, opsOut: fin?.opsPayments ?? [], opsIn: inc?.opsCollections ?? [] }), [month, expenseItems, incomeItems, fin, inc]);

  if (!fin || !inc) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!fin.ready) return <Flash tone="bad" message={fin.error ?? 'Giderler yüklenemedi.'} />;
  if (!inc.ready) return <Flash tone="bad" message={inc.error ?? 'Gelirler yüklenemedi.'} />;
  const mName = monthName(month);
  const netNegative = Object.values(cash.net).some((v) => v < BigInt(0));

  return (
    <div className="grid gap-6">
      <PageHead kicker="Finans" title="Genel bakış" sub="Tahsilat, ödeme ve dönem takibi. Kayıt ve takip içindir; banka işlemi veya muhasebe kaydı değildir." />
      <FinanceNav active="overview" />
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker value={month} onChange={goMonth} thisMonth={thisMonth} />
        {month !== thisMonth && <button type="button" className={small} onClick={() => goMonth(thisMonth)}>Bu aya dön</button>}
      </div>

      <section aria-labelledby="cash-h" className="grid gap-3">
        <div>
          <h2 id="cash-h" className="text-[15px] font-extrabold">Nakit hareketi · {mName}</h2>
          <p className="text-[12px] text-subtle">Gerçek tahsilat ve ödeme tarihine göre {mName} içinde giren ve çıkan para. İadeler düşülür; düzeltme kayıtları para hareketi değildir, ayrıca listelenir.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <TotalsCard title={`Tahsilat (giren) · ${mName}`} totals={cash.in} sub="Gelirler + Operasyon müşteri tahsilatları, müşteriye iadeler düşülmüş" tone="ok" />
          <TotalsCard title={`Ödeme (çıkan) · ${mName}`} totals={cash.out} sub="Giderler + Operasyon sağlayıcı ödemeleri, gelen iadeler düşülmüş" />
          <TotalsCard title={`Net nakit farkı · ${mName}`} totals={cash.net} sub="Giren − çıkan, her para birimi ayrı. Kâr değildir." tone={netNegative ? 'warn' : undefined} />
        </div>
        <p className="text-[12px] text-subtle">Net nakit farkı kâr veya zarar değildir: tahakkuk, vergi, kur farkı ve dönem ayrımı içermez. Farklı para birimleri kur tanımlanmadığı için toplanmaz.{cash.adjustments ? ` Bu ay ${cash.adjustments} düzeltme kaydı var; nakit toplamlarına katılmadı.` : ''}</p>
      </section>

      <section aria-labelledby="period-h" className="grid gap-3">
        <div>
          <h2 id="period-h" className="text-[15px] font-extrabold">Dönem takibi · {mName}</h2>
          <p className="text-[12px] text-subtle">{mName} dönemine ait alacak ve giderler; tahsilat/ödeme tarihi farklı ay olabilir (ör. Kasım kirası Aralık’ta ödenirse burada Kasım’da ödendi görünür, nakit olarak Aralık’tadır).</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid gap-2 admin-box p-3">
            <div className="flex items-center justify-between"><h3 className="text-[13px] font-extrabold">Gelirler</h3><Link href={`/admin/finance/income${month === thisMonth ? '' : `?ay=${month}`}`} className={small}>Gelirler →</Link></div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
              <TotalsCard title="Beklenen alacak" totals={income.total} sub={`${income.count} kayıt${income.unknownCount ? ` · ${income.unknownCount} tutarı bekleniyor` : ''}`} />
              <TotalsCard title="Tahsil edilen" totals={income.collected} sub={`net${Object.keys(income.over).length ? ` · ${formatTotals(income.over)} fazla dahil` : ''}`} />
              <TotalsCard title="Kalan alacak" totals={income.remaining} sub={`${income.remainingCount} kayıt`} />
            </div>
          </div>
          <div className="grid gap-2 admin-box p-3">
            <div className="flex items-center justify-between"><h3 className="text-[13px] font-extrabold">Giderler</h3><Link href={`/admin/expenses${month === thisMonth ? '' : `?ay=${month}`}`} className={small}>Giderler →</Link></div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
              <TotalsCard title="Gider" totals={exp.total} sub={`${exp.count} dönem${exp.unknownCount ? ` · ${exp.unknownCount} tutarı bekleniyor` : ''}`} />
              <TotalsCard title="Ödenen" totals={exp.paid} sub={`net${Object.keys(exp.over).length ? ` · ${formatTotals(exp.over)} fazla dahil` : ''}`} />
              <TotalsCard title="Kalan" totals={exp.remaining} sub={`${exp.remainingCount} dönem`} />
            </div>
            {exp.reviewCount > 0 && <p className="text-[12px] text-yellow-200">Kaynakta “Ödendi” işaretli, ödeme tarihi beklenen {exp.reviewCount} dönem ({formatTotals(exp.review)}): ödeme sayılmaz, kalan veya gecikmiş borca girmez.</p>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TotalsCard title="Geciken alacak · Tüm aylar · bugün itibarıyla" totals={income.overdue} sub={`${income.overdueCount} kayıt`} tone={income.overdueCount ? 'bad' : undefined} />
          <TotalsCard title="Geciken gider · Tüm aylar · bugün itibarıyla" totals={exp.overdue} sub={`${exp.overdueCount} dönem · ödeme tarihi bekleyen ve tutarı bilinmeyenler hariç`} tone={exp.overdueCount ? 'bad' : undefined} />
        </div>
      </section>

      <section aria-labelledby="mov-h" className="grid gap-2">
        <h2 id="mov-h" className="text-[15px] font-extrabold">{mName} para hareketleri <span className="text-subtle">({cash.movements.length})</span></h2>
        {cash.movements.length === 0 ? <Empty text={`${mName} içinde kayıtlı tahsilat veya ödeme yok.`} /> : (
          <AdminTable head={['Tarih', 'Yön', 'Kaynak', 'Açıklama', 'Tür', 'Tutar']} min={760} label={`${mName} para hareketleri`}>
            {cash.movements.map((m) => (
              <tr key={m.id}>
                <td className="tabular-nums">{fmtDate(m.date)}</td>
                <td>{m.direction === 'in' ? <Badge tone="ok">Giren</Badge> : <Badge tone="info">Çıkan</Badge>}</td>
                <td className="text-subtle">{CASH_SOURCE_LABEL[m.source]}</td>
                <td data-primary><Link href={m.href} className="admin-link">{m.title}</Link></td>
                <td>{(m.direction === 'in' ? COLLECTION_KIND_LABEL : PAYMENT_KIND_LABEL)[m.kind] ?? m.kind}{m.kind === 'adjustment' && <span className="block text-[11px] text-subtle">nakit değil</span>}</td>
                <td className="tabular-nums">{m.kind === 'refund' ? '−' : ''}{formatMinor(m.amount, m.currency)}</td>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="text-[14px] text-subtle">Yükleniyor…</p>}><OverviewPage /></Suspense>;
}
