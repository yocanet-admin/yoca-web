'use client';

import { useState } from 'react';
import { LabeledDate } from '@/components/admin/DateField';
import { field, label } from '@/components/admin/ops/ui';
import { MonthPicker } from '@/components/admin/fin/MonthPicker';
import type { ReceivableInput } from '@/lib/fin/incomeData';
import { INCOME_CATEGORIES, INCOME_CATEGORY_LABEL, type FinClient, type IncomeCategory, type Receivable } from '@/lib/fin/income';
import { METHODS, METHOD_LABEL } from '@/lib/fin/model';
import { istanbulDay } from '@/lib/ops/model';
import { CURRENCIES, minorToDb, parseAmount } from '@/lib/ops/money';

/**
 * Gelir / alacak formu (yeni / düzenle). Not tied to Operasyon or to a customer:
 * a registered customer, a free-text payer, or neither. An empty amount stays
 * "Tutar bekleniyor" (never 0). Once a valid collection exists, the amount and
 * currency are fixed (the database refuses it; corrections are recorded as
 * collections / adjustments, nothing is rewritten silently).
 */

interface Props {
  initial?: Receivable;
  clients: FinClient[];
  amountLocked?: boolean;
  busy?: boolean;
  onSubmit: (input: ReceivableInput) => void;
  onCancel?: () => void;
}

const amountText = (v: string | null) => (v ? v.replace('.', ',') : '');

export function ReceivableForm({ initial, clients, amountLocked = false, busy = false, onSubmit, onCancel }: Props) {
  const thisMonth = istanbulDay().slice(0, 7);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<IncomeCategory>(initial?.category ?? 'service');
  const [clientId, setClientId] = useState(initial?.client_id ?? '');
  const [payer, setPayer] = useState(initial?.payer_name ?? '');
  const [month, setMonth] = useState(initial?.period_month ?? thisMonth);
  const [dueOn, setDueOn] = useState(initial?.due_on ?? '');
  const [amount, setAmount] = useState(amountText(initial?.amount ?? null));
  const [currency, setCurrency] = useState(initial?.currency ?? 'TRY');
  const [owner, setOwner] = useState(initial?.owner_email ?? '');
  const [account, setAccount] = useState(initial?.pay_account ?? '');
  const [method, setMethod] = useState(initial?.pay_method ?? '');
  const [note, setNote] = useState(initial?.note ?? '');

  const parsed = parseAmount(amount);
  const problems = [
    !title.trim() ? 'Açıklama gerekli.' : '',
    parsed === undefined ? 'Tutar geçersiz.' : parsed !== null && parsed <= BigInt(0) ? 'Tutar sıfırdan büyük olmalı (bilinmiyorsa boş bırakın).' : '',
  ].filter(Boolean);

  const submit = () => {
    if (problems.length || busy) return;
    onSubmit({
      title: title.trim(), category, client_id: clientId || null, payer_name: clientId ? null : payer.trim() || null,
      period_month: month, due_on: dueOn || null, amount: parsed ? minorToDb(parsed) : null, currency,
      owner_email: owner.trim() || null, pay_account: account.trim() || null, pay_method: method || null, note: note.trim() || null,
    });
  };

  return (
    <div className="admin-card grid gap-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Açıklama<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="ör. Web sitesi bakımı — Kasım" /></label>
        <label className={label}>Kategori
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value as IncomeCategory)}>
            {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{INCOME_CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Müşteri (isteğe bağlı)
          <select className={field} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Kayıtlı müşteri yok —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={label}>Ödeyen (kayıtlı değilse, isteğe bağlı)<input className={field} value={clientId ? '' : payer} disabled={Boolean(clientId)} onChange={(e) => setPayer(e.target.value)} maxLength={200} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
        <div className="grid gap-1"><span className="text-[12px] font-semibold text-muted">Ait olduğu dönem</span><MonthPicker value={month} onChange={setMonth} thisMonth={thisMonth} label="Dönem" /></div>
        <LabeledDate label="Beklenen tahsilat tarihi (vade, isteğe bağlı)" value={dueOn} onChange={(v) => setDueOn(v)} />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className={label}>Beklenen tutar<input className={field} inputMode="decimal" value={amount} disabled={amountLocked} onChange={(e) => setAmount(e.target.value)} placeholder="bilinmiyorsa boş" /></label>
          <label className={label}>Para birimi
            <select className={field} value={currency} disabled={amountLocked} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </div>
      {amountLocked && <p className="text-[12px] text-subtle">Geçerli tahsilatı olduğu için tutar burada değiştirilmez: yanlış girilen beklenen tutarı sayfadaki “Beklenen tutarı düzelt” ile gerekçe yazarak düzeltin (tahsilatlar değişmez, eski → yeni tutar geçmişte kalır). Para birimi tahsilattan sonra değiştirilemez.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Tahsilat hesabı<input className={field} value={account} onChange={(e) => setAccount(e.target.value)} maxLength={200} placeholder="ör. şirket TL hesabı" /></label>
        <label className={label}>Yöntem
          <select className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">—</option>{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
        </label>
        <label className={label}>Sorumlu (e-posta, isteğe bağlı)<input className={field} value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={200} /></label>
      </div>
      <label className={label}>Not<textarea className={`${field} min-h-[70px]`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} /></label>
      <p className="text-[12px] text-subtle">Tutar bilinmiyorsa boş bırakın: “Tutar bekleniyor” olarak görünür, toplamlara 0 olarak eklenmez. Tahsilat, gerçekleştiğinde ve gerçek tarihiyle ayrıca kaydedilir.</p>
      {problems.length > 0 && (title || amount) && <p className="text-[12px] text-yellow-200">{problems.join(' ')}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="admin-btn admin-btn-primary" disabled={busy || problems.length > 0} onClick={submit}>{busy ? 'Kaydediliyor…' : initial ? 'Değişiklikleri kaydet' : 'Geliri kaydet'}</button>
        {onCancel && <button type="button" className="admin-btn" onClick={onCancel}>Vazgeç</button>}
      </div>
    </div>
  );
}
