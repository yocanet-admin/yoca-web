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
        const name = g.billing === 'monthly' ? `Aylık · ${g.startYear > 1 ? `${g.startYear}. yıldan itibaren` : 'başlangıçtan itibaren'}` : g.startYear > 1 ? `Yıllık yenileme · ${g.startYear}. yıldan itibaren` : 'Yıllık · başlangıçtan itibaren';
        const totalLabel = g.billing === 'monthly' ? 'Aylık toplam' : g.startYear > 1 ? 'Yıllık yenileme' : 'Yıllık toplam';
        return (
          <div key={g.key} className="grid gap-0.5 border-t border-line pt-1.5" data-group={g.key}>
            <p className="text-muted">{name} <span className="text-subtle">({g.totals.lines.length} kalem)</span></p>
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-0.5">
              <span className="text-muted">{totalLabel} <span className="text-subtle">(KDV dahil)</span></span>
              <span className="tabular-nums font-semibold text-white">{g.totals.grand !== null ? `${money(g.totals.grand)} / ${per}` : <span className="text-yellow-200">fiyat eksik</span>}</span>
            </div>
            {g.term !== null && g.termTotal !== null && (
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-0.5">
                <span className="text-muted">{g.term} {g.billing === 'monthly' ? 'aylık' : 'yıllık'} hizmet toplamı <span className="text-subtle">(KDV dahil)</span></span>
                <span className="tabular-nums font-semibold text-white">{money(g.termTotal)}</span>
              </div>
            )}
            <p className="text-[12px] text-subtle">
              {g.totals.grand !== null ? `Net ${money(g.totals.net)} + KDV ${money(g.totals.tax)}. ` : ''}
              {g.term === null && g.billing === 'monthly' && g.startYear === 1 ? 'Süre belirtilmedi: hizmet sürdükçe her ay faturalanır; dönem toplamı hesaplanmadı. ' : ''}
              {g.startYear > 1 ? `İlk dönem toplamlarına dahil değildir; ${g.startYear}. yıldan itibaren ayrıca faturalanır. ` : ''}
              {g.billing === 'monthly' ? 'Aylık birim fiyat, toplam aylık hizmet bedelidir.' : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}
