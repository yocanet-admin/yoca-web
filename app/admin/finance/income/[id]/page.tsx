'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Details, Flash, PageHead, field, fmtDate, fmtDateTime, small } from '@/components/admin/ops/ui';
import { ReceivableForm } from '@/components/admin/fin/ReceivableForm';
import { FinDocs, FinHistory, PaymentForm, PaymentList, SourceBadge, money } from '@/components/admin/fin/parts';
import { monthName } from '@/components/admin/fin/MonthPicker';
import { addCollection, cancelReceivable, loadIncome, updateReceivable, voidCollection, type IncomeData } from '@/lib/fin/incomeData';
import { buildIncomeItems, incomeStateText } from '@/lib/fin/income';
import { FIN_STATE_TONE, METHOD_LABEL } from '@/lib/fin/model';
import { dueText, istanbulDay } from '@/lib/ops/model';
import { formatAmount } from '@/lib/ops/money';

/**
 * Yoca Finans — one manual receivable: expected amount vs. real collections.
 * Collections are never edited or deleted (void with a reason). The amount is
 * fixed once a valid collection exists; a receivable is cancelled with a reason
 * (only without valid collections), never deleted. History shows every actor.
 */
export default function ReceivablePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<IncomeData | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [why, setWhy] = useState('');
  const today = istanbulDay();
  const reload = useCallback(() => loadIncome().then(setData), []);
  useEffect(() => { void reload(); }, [reload]);

  const rec = data?.receivables.find((r) => r.id === id) ?? null;
  const it = useMemo(() => (data?.ready ? buildIncomeItems({ ...data, today }).find((x) => x.source === 'fin' && x.id === id) ?? null : null), [data, id, today]);

  if (!data) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Gelirler yüklenemedi.'} />;
  if (!rec || !it) return <Flash tone="bad" message="Gelir kaydı bulunamadı (ya da bu hesabın erişimi yok)." />;
  const s = it.summary;
  const hasValid = it.payments.some((p) => !p.voided_at);
  const cancelled = rec.status === 'cancelled';

  return (
    <div className="grid gap-6">
      <div className="text-[13px]"><Link href={`/admin/finance/income?ay=${rec.period_month}`} className="text-subtle hover:text-white">← Gelirler</Link></div>
      <PageHead kicker="Finans" title={rec.title} sub={`${it.categoryText}${it.party ? ` · ${it.party}` : ''} · ${monthName(rec.period_month)}`}
        actions={!cancelled ? <button type="button" className="admin-btn" onClick={() => setEditing(!editing)}>{editing ? 'Düzenlemeyi kapat' : 'Düzenle'}</button> : undefined} />
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}

      <section className="admin-card grid gap-3 p-5 text-[13px]">
        <div className="flex flex-wrap items-center gap-2"><SourceBadge source="fin" income /><Badge tone={FIN_STATE_TONE[s.state]}>{incomeStateText(s)}</Badge></div>
        <div className="grid gap-2 sm:grid-cols-4">
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Ait olduğu dönem</span>{monthName(rec.period_month)}</p>
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Beklenen tahsilat tarihi</span>{rec.due_on ? `${fmtDate(rec.due_on)} · ${dueText(rec.due_on, today)}` : 'Girilmedi'}</p>
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Beklenen tutar</span>{rec.amount ? formatAmount(rec.amount, rec.currency) : 'Tutar bekleniyor'}</p>
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Tahsil edilen (net) / kalan</span>{money(s.paid, rec.currency)} / {s.remaining === null ? '—' : money(s.remaining, rec.currency)}</p>
        </div>
        {s.state === 'over' && s.remaining !== null && <p className="text-yellow-200">Beklenenden {money(-s.remaining, rec.currency)} fazla tahsil edildi. Tutar değiştirilmedi; gerekiyorsa müşteriye iade veya düzeltme kaydı ekleyin.</p>}
        <p className="text-subtle">{[rec.pay_account && `Hesap: ${rec.pay_account}`, rec.pay_method && `Yöntem: ${METHOD_LABEL[rec.pay_method] ?? rec.pay_method}`, rec.owner_email && `Sorumlu: ${rec.owner_email}`].filter(Boolean).join(' · ') || 'Hesap / yöntem girilmedi.'}</p>
        {rec.note && <p className="whitespace-pre-line">{rec.note}</p>}
        <p className="text-[12px] text-subtle">Ekleyen: {rec.created_by ?? '—'} · {fmtDateTime(rec.created_at)}{cancelled ? ` · İptal: ${rec.cancelled_by ?? '—'} · ${fmtDateTime(rec.cancelled_at)} · Gerekçe: ${rec.cancel_reason ?? ''}` : ''}</p>
        {!cancelled && (cancelling ? (
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${field} max-w-md`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="İptal gerekçesi (zorunlu)" maxLength={300} />
            <button type="button" className="admin-btn" disabled={why.trim().length < 3} onClick={async () => { const e = await cancelReceivable(rec.id, why.trim()); if (e) setFlash({ tone: 'bad', text: e }); else { setCancelling(false); setFlash({ tone: 'ok', text: 'Alacak gerekçeyle iptal edildi; kayıt geçmişte duruyor.' }); void reload(); } }}>İptali kaydet</button>
            <button type="button" className={small} onClick={() => setCancelling(false)}>Vazgeç</button>
          </div>
        ) : <button type="button" className={`${small} justify-self-start`} disabled={hasValid} title={hasValid ? 'Geçerli tahsilatı olan alacak iptal edilemez; önce tahsilatı gerekçeyle iptal edin.' : undefined} onClick={() => { setCancelling(true); setWhy(''); }}>Alacağı iptal et</button>)}
      </section>

      {editing && !cancelled && (
        <ReceivableForm initial={rec} clients={data.clients} amountLocked={hasValid} busy={busy} onCancel={() => setEditing(false)} onSubmit={async (input) => {
          setBusy(true);
          const e = await updateReceivable(rec.id, input);
          setBusy(false);
          if (e) { setFlash({ tone: 'bad', text: e }); return; }
          setEditing(false); setFlash({ tone: 'ok', text: 'Kaydedildi. Değişiklik işlem geçmişinde görünür.' }); void reload();
        }} />
      )}

      <section className="grid gap-3">
        <h2 className="text-[15px] font-extrabold">Tahsilatlar</h2>
        {!cancelled && <PaymentForm income currency={rec.currency} suggested={s.remaining} defaultAccount={rec.pay_account ?? ''} defaultMethod={rec.pay_method ?? ''} onSave={async (p, key) => {
          const r = await addCollection(rec.id, p, key);
          if (r.error) return r.error;
          setFlash({ tone: r.existing ? 'bad' : 'ok', text: r.existing ? 'Bu kayıt zaten kaydedilmişti; ikinci kayıt oluşturulmadı.' : 'Tahsilat kaydedildi.' });
          void reload();
          return null;
        }} />}
        <PaymentList income payments={it.payments} docEntity="collection" onVoid={async (pid, reason) => { const e = await voidCollection(pid, reason); if (!e) { setFlash({ tone: 'ok', text: 'Tahsilat gerekçeyle iptal edildi; kayıt geçmişte duruyor.' }); void reload(); } return e; }} />
      </section>

      <Details title="Fatura, sözleşme ve dekontlar (finans belgeleri)" open>
        <FinDocs entity="receivable" entityId={rec.id} />
      </Details>

      <Details title="İşlem geçmişi" hint="Bu alacak, tahsilatları ve belgeleri; yönetici dahil kim, ne zaman, ne yaptı. Değiştirilemez.">
        <FinHistory ids={[rec.id, ...it.payments.map((p) => p.id)]} refreshKey={`${rec.updated_at}|${it.payments.map((p) => `${p.id}:${p.voided_at ?? ''}`).join(',')}`} />
      </Details>
    </div>
  );
}
