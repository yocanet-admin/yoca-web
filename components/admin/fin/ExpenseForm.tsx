'use client';

import { useMemo, useState } from 'react';
import { field, label } from '@/components/admin/ops/ui';
import type { ExpenseInput } from '@/lib/fin/data';
import { CATEGORIES, CATEGORY_LABEL, METHODS, METHOD_LABEL, RECURRENCES, RECURRENCE_LABEL, RECURRING_HINT, defaultFirstDue, type Category, type Expense, type FinParty, type Recurrence } from '@/lib/fin/model';
import { istanbulDay } from '@/lib/ops/model';
import { CURRENCIES, minorToDb, parseAmount } from '@/lib/ops/money';

/**
 * Gider tanımı formu (yeni / düzenle). For a recurring expense the schedule
 * (kind, frequency, first due date) is fixed once its first period exists —
 * the database refuses changing it; changing the amount only affects periods
 * created from now on (existing periods keep their own amount).
 */

interface Props {
  initial?: Expense;
  parties: FinParty[];
  /** names of Operasyon providers: a matching provider gets a "no double entry" hint */
  opsProviders: string[];
  locked?: boolean;
  busy?: boolean;
  onSubmit: (input: ExpenseInput) => void;
  onCancel?: () => void;
}

const amountText = (v: string | null) => (v ? v.replace('.', ',') : '');

export function ExpenseForm({ initial, parties, opsProviders, locked = false, busy = false, onSubmit, onCancel }: Props) {
  const today = istanbulDay();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<Category>(initial?.category ?? 'rent');
  const [kind, setKind] = useState<'recurring' | 'once'>(initial?.kind ?? 'recurring');
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? 'monthly');
  const [firstDue, setFirstDue] = useState(initial?.first_due_on ?? defaultFirstDue(today, 1));
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? '');
  const [amount, setAmount] = useState(amountText(initial?.amount ?? null));
  const [currency, setCurrency] = useState(initial?.currency ?? 'TRY');
  const [providerId, setProviderId] = useState(initial?.provider_id ?? '');
  const [vendor, setVendor] = useState(initial?.vendor_name ?? '');
  const [owner, setOwner] = useState(initial?.owner_email ?? '');
  const [account, setAccount] = useState(initial?.pay_account ?? '');
  const [method, setMethod] = useState(initial?.pay_method ?? '');
  const [autoDebit, setAutoDebit] = useState(initial?.auto_debit ?? false);
  const [note, setNote] = useState(initial?.note ?? '');

  const parsed = parseAmount(amount);
  const providerName = providerId ? parties.find((p) => p.id === providerId)?.name ?? '' : vendor;
  const opsHint = useMemo(() => {
    const n = providerName.trim().toLocaleLowerCase('tr-TR');
    return n.length >= 3 && opsProviders.some((p) => p.toLocaleLowerCase('tr-TR').includes(n) || n.includes(p.toLocaleLowerCase('tr-TR')));
  }, [providerName, opsProviders]);
  const problems = [
    !title.trim() ? 'Açıklama gerekli.' : '',
    parsed === undefined ? 'Tutar geçersiz.' : parsed !== null && parsed <= BigInt(0) ? 'Tutar sıfırdan büyük olmalı.' : '',
    !firstDue ? (kind === 'once' ? 'Vade gerekli.' : 'İlk vade gerekli.') : '',
    kind === 'recurring' && endsOn && endsOn < firstDue ? 'Bitiş, ilk vadeden önce olamaz.' : '',
    owner && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(owner.trim()) ? 'Sorumlu e-postası geçersiz.' : '',
  ].filter(Boolean);

  const submit = () => {
    if (problems.length || busy) return;
    onSubmit({
      title: title.trim(), category, kind, recurrence: kind === 'recurring' ? recurrence : null,
      first_due_on: firstDue, ends_on: kind === 'recurring' && endsOn ? endsOn : null,
      amount: parsed === null || parsed === undefined ? null : minorToDb(parsed), currency,
      provider_id: providerId || null, vendor_name: providerId ? null : vendor.trim() || null,
      owner_email: owner.trim().toLowerCase() || null, pay_account: account.trim() || null,
      pay_method: (method || null) as ExpenseInput['pay_method'], auto_debit: autoDebit, note: note.trim() || null,
    });
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Açıklama<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="ör. Ofis kirası" /></label>
        <label className={label}>Kategori
          <select className={field} value={category} onChange={(e) => { const c = e.target.value as Category; setCategory(c); if (!initial) setKind(RECURRING_HINT.includes(c) ? 'recurring' : 'once'); }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
      </div>

      <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Tür
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as 'recurring' | 'once')}>
            <option value="recurring">Düzenli</option><option value="once">Tek seferlik</option>
          </select>
        </label>
        {kind === 'recurring' && (
          <label className={label}>Sıklık
            <select className={field} value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {RECURRENCES.map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
            </select>
          </label>
        )}
        <label className={label}>{kind === 'recurring' ? 'İlk vade (takibe başlanan dönem)' : 'Vade'}<input type="date" className={field} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} /></label>
        {locked && <p className="text-[12px] text-subtle sm:col-span-3">Dönemi oluşmuş giderin türü, sıklığı ve ilk vadesi değiştirilemez (geçmiş korunur). Takvim değişecekse bitiş tarihi verip yeni gider açın.</p>}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Tutar{kind === 'recurring' ? ' (dönem başına)' : ''}<input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bilinmiyorsa boş bırakın" /></label>
        <label className={label}>Para birimi
          <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={locked}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {kind === 'recurring' && <label className={label}>Bitiş (isteğe bağlı)<input type="date" className={field} value={endsOn} min={firstDue} onChange={(e) => setEndsOn(e.target.value)} /></label>}
      </div>
      {initial && kind === 'recurring' && <p className="-mt-2 text-[12px] text-subtle">Tutar değişikliği yalnızca bundan sonra oluşacak dönemlere uygulanır; oluşmuş dönemler kendi tutarını korur (ödemesiz bir dönemin tutarı dönem satırından düzeltilebilir).</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Sağlayıcı / firma (kayıtlı)
          <select className={field} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            <option value="">— Kayıtlı firma değil —</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {!providerId && <label className={label}>Firma / kişi adı<input className={field} value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={200} placeholder="ör. bina yönetimi" /></label>}
      </div>
      {opsHint && <p className="-mt-2 border border-sky-400/40 p-2 text-[12px] text-sky-100">Bu sağlayıcının Operasyon’da kayıtlı hizmet maliyetleri var. Hizmet (hosting, alan adı vb.) ödemeleri Giderler’de zaten “Kaynak: Operasyon” olarak görünür; aynı ödemeyi burada ayrıca gider olarak açmayın.</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Sorumlu (e-posta)<input className={field} type="email" value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={200} /></label>
        <label className={label}>Ödeme hesabı<input className={field} value={account} onChange={(e) => setAccount(e.target.value)} maxLength={200} placeholder="ör. şirket kartı / banka hesabı adı" /></label>
        <label className={label}>Ödeme yöntemi
          <select className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">—</option>{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2 text-[13px] text-muted">
        <input type="checkbox" className="mt-1" checked={autoDebit} onChange={(e) => setAutoDebit(e.target.checked)} />
        <span>Otomatik ödeme talimatı var (bilgi amaçlı). Dönem yine de ödeme kaydı girilene kadar “Bekliyor” görünür; sistem kendiliğinden “ödendi” saymaz.</span>
      </label>
      <label className={label}>Not<textarea className={field} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} /></label>
      <p className="text-[12px] text-subtle">Banka hesap numarası, kart numarası veya şifre yazmayın; hesap için yalnızca tanıyıcı bir ad kullanın.</p>

      {problems.length > 0 && <ul className="list-disc ps-5 text-[12px] text-yellow-200">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="admin-btn admin-btn-primary" disabled={busy || problems.length > 0} onClick={submit}>{busy ? 'Kaydediliyor…' : initial ? 'Değişiklikleri kaydet' : 'Gideri kaydet'}</button>
        {onCancel && <button type="button" className="admin-btn" onClick={onCancel} disabled={busy}>Vazgeç</button>}
      </div>
    </div>
  );
}
