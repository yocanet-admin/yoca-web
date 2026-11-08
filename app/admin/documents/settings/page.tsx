'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Flash, PageHead, field, label, small } from '@/components/admin/ops/ui';
import { docAction, loadList } from '@/lib/documents/client';
import { localId, type Issuer } from '@/lib/documents/model';
import { CurrencyOptions } from '@/components/admin/documents/fields';
import { docSettingsProblems, formatIban, ibanValid, type BankAccount, type DocSettings } from '@/lib/documents/settings';

/**
 * Yoca — Belge ayarları: bank accounts, defaults and the default signatory.
 * Company facts (legal name, address, phone, e-mail, tax, MERSİS) are NOT
 * edited here: they come from "Şirket bilgileri", the single source. Every
 * change of either setting creates a new company profile revision; the next
 * PDF download uses it.
 */

const ISSUER_LABEL: Array<[keyof Issuer, string]> = [
  ['legalName', 'Ticari unvan'], ['address', 'Resmî adres'], ['phone', 'Telefon'], ['email', 'E-posta'], ['website', 'Web sitesi'],
  ['taxOffice', 'Vergi dairesi'], ['taxNumber', 'Vergi no'], ['mersis', 'MERSİS'], ['tradeRegistry', 'Ticaret sicil'], ['kep', 'KEP'],
];

export default function DocumentSettingsPage() {
  const [value, setValue] = useState<DocSettings | null>(null);
  const [issuer, setIssuer] = useState<Issuer | null>(null);
  const [revision, setRevision] = useState(0);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void loadList().then((r) => { if (r.ok) { setValue(r.settings); setIssuer(r.issuer); setRevision(r.companyRevision); } else setFlash({ tone: 'bad', text: r.error ?? 'Ayarlar okunamadı.' }); }); }, []);
  if (!value || !issuer) return flash ? <Flash tone="bad" message={flash.text} /> : <p className="text-[13px] text-subtle">Yükleniyor…</p>;

  const set = (patch: Partial<DocSettings>) => setValue({ ...value, ...patch });
  const setBank = (i: number, patch: Partial<BankAccount>) => set({ bankAccounts: value.bankAccounts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const problems = docSettingsProblems(value);

  const save = async () => {
    setBusy(true);
    const r = await docAction<{ settings: DocSettings }>({ action: 'settings', value });
    setBusy(false);
    if (!r.ok) return setFlash({ tone: 'bad', text: r.error ?? 'Kaydedilemedi.' });
    setValue(r.settings as DocSettings);
    setFlash({ tone: 'ok', text: 'Kaydedildi. Sonraki PDF indirmeleri bu ayarları kullanır; daha önce üretilmiş PDF’ler değişmez.' });
    const l = await loadList();
    if (l.ok) setRevision(l.companyRevision);
  };

  return (
    <div className="grid gap-5">
      <PageHead title="Belge ayarları" sub="Banka hesapları, varsayılanlar ve imza yetkilisi. Şirket bilgileri ayrı ekrandan yönetilir." actions={<Link href="/admin/documents" className="admin-btn">← Belgeler</Link>} />
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}

      <section className="admin-card grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-extrabold">Belgelerde görünen şirket bilgileri</h2>
          <Link href="/admin/company" className="admin-btn">Şirket bilgilerini düzenle</Link>
        </div>
        <p className="text-[12px] text-subtle">Kaynak: Şirket bilgileri (profil revizyonu r{revision}). Boş alanlar belgede hiç görünmez; etiket veya yer tutucu basılmaz. Yapay zekâ bu alanları doldurmaz.</p>
        <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
          {ISSUER_LABEL.map(([k, l]) => (
            <div key={k} className="flex gap-2 border-t border-line py-1"><dt className="w-32 shrink-0 text-subtle">{l}</dt><dd className="min-w-0 break-words">{issuer[k] ? String(issuer[k]) : <span className="italic text-subtle">boş — basılmaz</span>}</dd></div>
          ))}
        </dl>
      </section>

      <section className="admin-card grid gap-4 p-4">
        <h2 className="text-[15px] font-extrabold">Varsayılanlar</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className={label}>Para birimi<select className={field} value={value.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value as DocSettings['defaultCurrency'] })}><CurrencyOptions codes /></select></label>
          <label className={label}>Dil<select className={field} value={value.defaultLocale} onChange={(e) => set({ defaultLocale: e.target.value === 'en' ? 'en' : 'tr' })}><option value="tr">Türkçe</option><option value="en">English</option></select></label>
          <label className={label}>Teklif geçerliliği (gün)<input className={field} inputMode="numeric" value={String(value.validityDays)} onChange={(e) => set({ validityDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
          <label className={label}>Yeni kalemlerde KDV %<input className={field} inputMode="decimal" value={value.defaultTaxRate} onChange={(e) => set({ defaultTaxRate: e.target.value })} /></label>
        </div>
        <p className="text-[12px] text-subtle">KDV oranı yalnızca yeni kalemlerin başlangıç değeridir; her kalemde değiştirilebilir. Vergi tavsiyesi değildir.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Varsayılan imza yetkilisi<input className={field} value={value.signatoryName} onChange={(e) => set({ signatoryName: e.target.value })} /></label>
          <label className={label}>Unvanı<input className={field} value={value.signatoryTitle} onChange={(e) => set({ signatoryTitle: e.target.value })} /></label>
        </div>
        <label className={label}>Proforma notu (isteğe bağlı)<textarea className={field} rows={2} value={value.proformaNote} onChange={(e) => set({ proformaNote: e.target.value })} placeholder="Tekliften oluşturulan proformaların not bölümüne eklenir." /></label>
      </section>

      <section className="admin-card grid gap-3 p-4">
        <h2 className="text-[15px] font-extrabold">Banka hesapları</h2>
        <p className="text-[12px] text-subtle">Teklif ve proformada isteğe bağlı seçilir. IBAN kontrol hanesi doğrulanır; geçersiz IBAN kaydedilmez.</p>
        {value.bankAccounts.map((a, i) => (
          <div key={a.id} className="grid gap-2 border border-line p-3 sm:grid-cols-3">
            <label className={label}>Etiket<input className={field} value={a.label} onChange={(e) => setBank(i, { label: e.target.value })} placeholder="TL hesabı" /></label>
            <label className={label}>Banka<input className={field} value={a.bank} onChange={(e) => setBank(i, { bank: e.target.value })} /></label>
            <label className={label}>Hesap sahibi<input className={field} value={a.holder} onChange={(e) => setBank(i, { holder: e.target.value })} /></label>
            <label className={`${label} sm:col-span-2`}>IBAN<input className={`${field} font-mono`} value={a.iban} onChange={(e) => setBank(i, { iban: e.target.value })} />{a.iban && <span className={`text-[12px] font-normal ${ibanValid(a.iban) ? 'text-yoca-green' : 'text-red-300'}`}>{ibanValid(a.iban) ? `Geçerli · ${formatIban(a.iban)}` : 'Kontrol hanesi tutmuyor'}</span>}</label>
            <label className={label}>Para birimi<select className={field} value={a.currency} onChange={(e) => setBank(i, { currency: e.target.value })}><option value="">—</option><CurrencyOptions codes /></select></label>
            <label className={label}>SWIFT (isteğe bağlı)<input className={field} value={a.swift} onChange={(e) => setBank(i, { swift: e.target.value })} /></label>
            <label className={label}>Şube (isteğe bağlı)<input className={field} value={a.branch} onChange={(e) => setBank(i, { branch: e.target.value })} /></label>
            <div className="flex items-end"><button type="button" className={small} onClick={() => set({ bankAccounts: value.bankAccounts.filter((_, j) => j !== i) })}>Hesabı kaldır</button></div>
          </div>
        ))}
        <button type="button" className="admin-btn justify-self-start" onClick={() => set({ bankAccounts: [...value.bankAccounts, { id: localId('bank'), label: '', bank: '', holder: '', iban: '', currency: 'TRY', swift: '', branch: '' }] })}>+ Banka hesabı</button>
      </section>

      {problems.length > 0 && <Flash tone="bad" message={problems.join(' ')} />}
      <div><button type="button" className="admin-btn admin-btn-primary" disabled={busy || problems.length > 0} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
    </div>
  );
}
