'use client';

import { useState } from 'react';
import { CURRENCY_LABEL, OTHER_CURRENCIES, PRIMARY_CURRENCIES, UNIT_OPTIONS } from '@/lib/documents/model';

/** Currency options: TRY, USD, EUR first; the other supported currencies (GBP, AZN) stay selectable in a group below. */
export function CurrencyOptions({ codes = false }: { codes?: boolean }) {
  return (
    <>
      {PRIMARY_CURRENCIES.map((x) => <option key={x} value={x}>{codes ? x : CURRENCY_LABEL[x]}</option>)}
      <optgroup label="Diğer para birimleri">
        {OTHER_CURRENCIES.map((x) => <option key={x} value={x}>{codes ? x : CURRENCY_LABEL[x]}</option>)}
      </optgroup>
    </>
  );
}

/**
 * "Birim" picker: common units, a unit written earlier that is not in the list
 * stays selectable as it is, "Diğer…" switches to free text. For a monthly /
 * yearly line the unit is the period and fixed (`fixed`).
 */
export function UnitField({ value, onChange, fixed, className, ariaLabel }: { value: string; onChange: (v: string) => void; fixed?: string; className: string; ariaLabel?: string }) {
  const known = (UNIT_OPTIONS as readonly string[]).includes(value);
  const [free, setFree] = useState(false);
  if (fixed) return <select aria-label={ariaLabel} className={className} value={fixed} disabled title="Aylık / yıllık kalemde birim dönemdir"><option value={fixed}>{fixed}</option></select>;
  if (free) {
    return (
      <span className="flex gap-1">
        <input aria-label={ariaLabel} autoFocus className={`${className} min-w-0`} value={value} onChange={(e) => onChange(e.target.value.slice(0, 30))} placeholder="ör. bin kelime" />
        <button type="button" className="admin-btn admin-btn-sm" onClick={() => setFree(false)} aria-label="Birim listesine dön">Liste</button>
      </span>
    );
  }
  return (
    <select aria-label={ariaLabel} className={className} value={value} onChange={(e) => { if (e.target.value === '__other') { setFree(true); return; } onChange(e.target.value); }}>
      <option value="">—</option>
      {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
      {!known && value ? <option value={value}>{value}</option> : null}
      <option value="__other">Diğer…</option>
    </select>
  );
}
