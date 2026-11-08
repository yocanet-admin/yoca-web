'use client';

import type { RecurringGroup } from '@/lib/documents/calc';
import { fmtMoney } from '@/lib/documents/calc';
import type { DocCurrency } from '@/lib/documents/model';

/**
 * Recurring and later-period fees, one row per group (monthly from the start,
 * yearly from year 2 …), each with its own period total. Never added to the
 * one-time total; the payment plan is for the one-time total only.
 */
export function RecurringSummary({ groups, currency, compact = false }: { groups: RecurringGroup[]; currency: DocCurrency; compact?: boolean }) {
  if (!groups.length) return null;
  const money = (m: bigint) => fmtMoney(m, currency, 'tr');
  return (
    <div className={`grid gap-1.5 border border-line p-3 text-[13px] ${compact ? '' : 'mt-1'}`} data-testid="recurring-summary">
      <p className="font-bold text-white">Tekrarlayan ve sonraki dönem ücretleri</p>
      <p className="text-[12px] text-subtle">Tek seferlik toplama ve ödeme planına dahil değildir; kendi dönemlerinde faturalanır.</p>
      {groups.map((g) => {
        const per = g.billing === 'monthly' ? 'ay' : 'yıl';
        const name = `${g.billing === 'monthly' ? 'Aylık' : 'Yıllık'} · ${g.startYear > 1 ? `${g.startYear}. yıldan itibaren` : 'başlangıçtan itibaren'}`;
        return (
          <div key={g.key} className="grid gap-0.5 border-t border-line pt-1.5" data-group={g.key}>
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-0.5">
              <span className="text-muted">{name} <span className="text-subtle">({g.totals.lines.length} kalem)</span></span>
              <span className="tabular-nums font-semibold text-white">{g.totals.grand !== null ? `${money(g.totals.grand)} / ${per}` : <span className="text-yellow-200">fiyat eksik</span>}</span>
            </div>
            <p className="text-[12px] text-subtle">
              {g.totals.grand !== null ? `KDV dahil (net ${money(g.totals.net)} + KDV ${money(g.totals.tax)}). ` : ''}
              {g.term !== null && g.termTotal !== null ? `${g.term} ${per} için toplam ${money(g.termTotal)} (bilgi amaçlı; tek seferlik toplama dahil değil).` : g.billing === 'monthly' && g.startYear === 1 ? 'Süre belirtilmedi: hizmet sürdükçe her ay faturalanır.' : g.startYear > 1 ? 'Bugünkü toplama dahil değil.' : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}
