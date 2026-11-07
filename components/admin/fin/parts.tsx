'use client';

import { useEffect, useState } from 'react';
import { Badge, field, fmtDate, fmtDateTime, label, small } from '@/components/admin/ops/ui';
import { newKey } from '@/lib/documents/client';
import { archiveFinDocument, finDocumentUrl, listFinDocuments, loadFinHistory, uploadFinDocument, type FinAuditRow, type FinDocEntity, type FinDocument, type PaymentInput } from '@/lib/fin/data';
import { FIN_STATE_TONE, METHODS, METHOD_LABEL, PAYMENT_KIND_LABEL, stateText, type FinPayment, type Item, type StateSummary } from '@/lib/fin/model';
import { istanbulDay } from '@/lib/ops/model';
import { formatAmount, formatMinor, formatTotals, parseAmount } from '@/lib/ops/money';

/**
 * Yoca Giderler — shared pieces: state badge, payment form (one request key
 * per form), payment history with void-with-reason, and private documents.
 * Nothing here deletes a payment or a file, and nothing sends money.
 */

export function StateBadge({ s }: { s: StateSummary }) {
  return <Badge tone={FIN_STATE_TONE[s.state]}>{stateText(s)}</Badge>;
}

export function SourceBadge({ source, income = false }: { source: 'fin' | 'ops'; income?: boolean }) {
  return source === 'ops'
    ? <Badge tone="info" title={income ? "Kayıt Operasyon'daki müşteri tahsilatıdır; burada ikinci kez tutulmaz." : "Kayıt Operasyon'daki sağlayıcı ödemesidir; burada ikinci kez tutulmaz."}>Kaynak: Operasyon</Badge>
    : <Badge tone="muted">{income ? 'Gelirler' : 'Giderler'}</Badge>;
}

export const money = (v: bigint | null, currency: string | null) => (v !== null && currency ? formatMinor(v, currency) : '—');

export function Remaining({ it }: { it: Item }) {
  if (it.summary.remaining === null) return <span className="text-subtle">—</span>;
  return <span className="tabular-nums">{money(it.summary.remaining, it.currency)}</span>;
}

/** Payment / refund / adjustment form. The key is fixed per form: a double click or retry is one record. */
export function PaymentForm({ currency, suggested, ops = false, income = false, defaultAccount = '', defaultMethod = '', onSave }: {
  currency: string; suggested: bigint | null; ops?: boolean; income?: boolean; defaultAccount?: string; defaultMethod?: string;
  onSave: (p: PaymentInput, key: string) => Promise<string | null>;
}) {
  const [key, setKey] = useState(newKey);
  const [kind, setKind] = useState<PaymentInput['kind']>('payment');
  const [amount, setAmount] = useState(suggested && suggested > BigInt(0) ? formatMinor(suggested, 'XXX').replace(' XXX', '') : '');
  const [paidOn, setPaidOn] = useState(istanbulDay());
  const [method, setMethod] = useState(defaultMethod);
  const [account, setAccount] = useState(defaultAccount);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 5000); return () => clearTimeout(t); }, [msg]);
  const parsed = parseAmount(amount);
  const problem = parsed === undefined ? 'Tutar geçersiz.' : parsed === null ? 'Tutar gerekli.' : kind !== 'adjustment' && parsed <= BigInt(0) ? 'Tutar sıfırdan büyük olmalı.' : parsed === BigInt(0) ? 'Düzeltme tutarı sıfır olamaz.' : !paidOn ? 'Tarih gerekli.' : null;

  const save = async () => {
    if (busy || problem || parsed === null || parsed === undefined) return;
    setBusy(true); setMsg(null);
    const dbAmount = `${parsed < BigInt(0) ? '-' : ''}${(parsed < BigInt(0) ? -parsed : parsed) / BigInt(100)}.${String((parsed < BigInt(0) ? -parsed : parsed) % BigInt(100)).padStart(2, '0')}`;
    const err = await onSave({ kind, amount: dbAmount, currency, paid_on: paidOn, method: method || null, account: account.trim() || null, reference: reference.trim() || null, note: note.trim() || null }, key);
    setBusy(false);
    if (err) { setMsg({ tone: 'bad', text: err }); return; }
    setMsg({ tone: 'ok', text: 'Kaydedildi.' });
    setKey(newKey()); setAmount(''); setReference(''); setNote('');
  };

  return (
    <div className="grid gap-3 border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className={label}>Tür
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as PaymentInput['kind'])}>
            {income
              ? <><option value="payment">Tahsilat</option><option value="refund">İade (müşteriye geri ödenen)</option><option value="adjustment">Düzeltme (+/−)</option></>
              : <><option value="payment">Ödeme</option><option value="refund">İade (geri gelen)</option><option value="adjustment">Düzeltme (+/−)</option></>}
          </select>
        </label>
        <label className={label}>Tutar ({currency})<input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></label>
        <label className={label}>{income ? 'Tahsilat tarihi' : 'Tarih'}<input type="date" className={field} value={paidOn} max={istanbulDay()} onChange={(e) => setPaidOn(e.target.value)} /></label>
        <label className={label}>Yöntem
          <select className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">—</option>{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
        </label>
      </div>
      <div className={`grid gap-3 ${ops ? 'sm:grid-cols-1' : 'sm:grid-cols-3'}`}>
        {!ops && <label className={label}>{income ? 'Tahsilat hesabı' : 'Ödeme hesabı'}<input className={field} value={account} onChange={(e) => setAccount(e.target.value)} placeholder={income ? 'ör. şirket TL hesabı' : 'ör. şirket kartı'} maxLength={200} /></label>}
        <label className={label}>Dekont / referans no<input className={field} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} /></label>
        {!ops && <label className={label}>Not<input className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></label>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="admin-btn admin-btn-primary" disabled={busy || Boolean(problem)} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : 'Kaydı ekle'}</button>
        {problem && amount && <span className="text-[12px] text-yellow-200">{problem}</span>}
        {msg && <span className={`text-[12px] ${msg.tone === 'ok' ? 'text-yoca-green' : 'text-red-300'}`}>{msg.text}</span>}
        <span className="text-[12px] text-subtle">Bu yalnızca kayıttır; banka işlemi yapılmaz. Tarih gerçek {income ? 'tahsilat' : 'ödeme'} tarihidir. Dekontu kaydettikten sonra aşağıdan ekleyin.</span>
      </div>
    </div>
  );
}

/** Payment history: voided rows stay visible with who / when / why. */
export function PaymentList({ payments, onVoid, docEntity, income = false }: { payments: FinPayment[]; onVoid: (id: string, reason: string) => Promise<string | null>; docEntity: 'payment' | 'ops_payment' | 'collection' | 'ops_collection'; income?: boolean }) {
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [openDocs, setOpenDocs] = useState<string | null>(null);
  if (!payments.length) return <p className="text-[13px] text-subtle">{income ? 'Tahsilat kaydı yok.' : 'Ödeme kaydı yok.'}</p>;
  return (
    <ul className="grid gap-1 text-[13px]">
      {payments.map((p) => (
        <li key={p.id} className={`grid gap-1 border-t border-line py-2 ${p.voided_at ? 'opacity-70' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{fmtDate(p.paid_on)}</span>
            <Badge tone={p.kind === 'payment' ? 'ok' : p.kind === 'refund' ? 'warn' : 'info'}>{(income ? INCOME_KIND_LABEL : PAYMENT_KIND_LABEL)[p.kind] ?? p.kind}</Badge>
            <strong className={`tabular-nums ${p.voided_at ? 'line-through' : ''}`}>{p.kind === 'refund' ? '−' : ''}{formatAmount(p.amount, p.currency)}</strong>
            {p.method && <span className="text-subtle">{METHOD_LABEL[p.method] ?? p.method}</span>}
            {p.account && <span className="text-subtle">· {p.account}</span>}
            {p.reference && <span className="text-subtle">· Ref: {p.reference}</span>}
            {p.voided_at && <Badge tone="bad">İptal edildi</Badge>}
            <span className="ms-auto flex gap-2">
              <button type="button" className={small} onClick={() => setOpenDocs(openDocs === p.id ? null : p.id)}>{openDocs === p.id ? 'Belgeleri gizle' : 'Dekont / belge'}</button>
              {!p.voided_at && <button type="button" className={small} onClick={() => { setVoiding(p.id); setReason(''); setErr(null); }}>İptal et</button>}
            </span>
          </div>
          {p.note && <p className="text-subtle">{p.note}</p>}
          <p className="text-[12px] text-subtle">Kaydeden: {p.created_by ?? '—'} · {fmtDateTime(p.created_at)}{p.voided_at ? ` · İptal${p.voided_by ? `: ${p.voided_by}` : ''} · ${fmtDateTime(p.voided_at)} · Gerekçe: ${p.void_reason ?? ''}` : ''}</p>
          {voiding === p.id && (
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${field} max-w-md`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="İptal gerekçesi (zorunlu)" maxLength={300} />
              <button type="button" className="admin-btn" disabled={reason.trim().length < 3} onClick={async () => { const e = await onVoid(p.id, reason.trim()); if (e) setErr(e); else setVoiding(null); }}>İptali kaydet</button>
              <button type="button" className={small} onClick={() => setVoiding(null)}>Vazgeç</button>
              <span className="text-[12px] text-subtle">Kayıt silinmez; iptal edildi olarak kalır ve toplamlara katılmaz.</span>
              {err && <span className="text-[12px] text-red-300">{err}</span>}
            </div>
          )}
          {openDocs === p.id && <FinDocs entity={docEntity} entityId={p.id} />}
        </li>
      ))}
    </ul>
  );
}

/** Files of one record: private bucket "fin-docs", 60-second links, archive instead of delete. */
export function FinDocs({ entity, entityId }: { entity: FinDocEntity; entityId: string }) {
  const [docs, setDocs] = useState<FinDocument[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const load = () => listFinDocuments([{ entity, id: entityId }]).then(setDocs).catch(() => setDocs([]));
  useEffect(() => { void load(); }, [entity, entityId]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = (docs ?? []).filter((d) => showArchived || !d.archived_at);
  const archivedCount = (docs ?? []).filter((d) => d.archived_at).length;
  return (
    <div className="grid gap-2 text-[13px]">
      {docs === null ? <p className="text-subtle">Belgeler yükleniyor…</p> : visible.length === 0 ? <p className="text-subtle">Belge yok.</p> : (
        <ul className="grid gap-1">
          {visible.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
              <span className="min-w-0 truncate">{d.name} <span className="text-subtle">· {Math.ceil((d.size_bytes ?? 0) / 1024)} KB · {fmtDate(d.created_at)} · {d.uploaded_by ?? '—'}{d.archived_at ? ` · arşivlendi (${d.archived_by ?? '—'})` : ''}</span></span>
              <span className="flex gap-2">
                <button type="button" className={small} onClick={async () => { const u = await finDocumentUrl(d.path); if (u) window.open(u, '_blank', 'noopener'); else setError('Bağlantı oluşturulamadı.'); }}>Aç</button>
                <button type="button" className={small} onClick={async () => { const e = await archiveFinDocument(d.id, !d.archived_at); if (e) setError(e); else void load(); }}>{d.archived_at ? 'Arşivden çıkar' : 'Arşivle'}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {archivedCount > 0 && <button type="button" className="justify-self-start text-[12px] text-subtle underline" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Arşivlenenleri gizle' : `Arşivlenen ${archivedCount} belgeyi göster`}</button>}
      {error && <p className="text-[12px] text-red-300">{error}</p>}
      <label className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span>Fatura / dekont ekle (PDF, görsel, metin, CSV, Word, Excel · en çok 20 MB):</span>
        <input type="file" disabled={busy} className="text-[12px]" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true); setError(null);
          const r = await uploadFinDocument(entity, entityId, f);
          setBusy(false);
          e.target.value = '';
          if (r.error) setError(r.error); else void load();
        }} />
        {busy && <span>Yükleniyor…</span>}
      </label>
    </div>
  );
}

const INCOME_KIND_LABEL: Record<string, string> = { payment: 'Tahsilat', refund: 'İade (müşteriye)', adjustment: 'Düzeltme' };
const ENTITY_LABEL: Record<string, string> = { fin_expenses: 'Gider', fin_periods: 'Dönem', fin_payments: 'Ödeme', fin_documents: 'Belge', ops_payments: 'Operasyon ödemesi', fin_receivables: 'Alacak', fin_collections: 'Tahsilat' };
const ACTION_LABEL: Record<string, string> = { insert: 'ekledi', update: 'değiştirdi', delete: 'sildi' };
const FIELD_LABEL: Record<string, string> = {
  title: 'açıklama', category: 'kategori', amount: 'tutar', currency: 'para birimi', due_on: 'vade', ends_on: 'bitiş', owner_email: 'sorumlu',
  pay_account: 'ödeme hesabı', pay_method: 'yöntem', vendor_name: 'firma', provider_id: 'kayıtlı firma', note: 'not', archived_at: 'arşiv',
  status: 'durum', cancel_reason: 'iptal gerekçesi', voided_at: 'iptal', void_reason: 'iptal gerekçesi', auto_debit: 'otomatik talimat',
  paid_on: 'ödeme tarihi', kind: 'tür', reference: 'referans', method: 'yöntem',
  period_month: 'dönem', payer_name: 'ödeyen', client_id: 'müşteri', amount_note: 'tutar düzeltme gerekçesi',
};
const QUIET = new Set(['updated_at', 'cancelled_at', 'cancelled_by', 'voided_by', 'archived_by']);
const short = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v).length > 40 ? `${String(v).slice(0, 40)}…` : String(v));

/** Who did what on these records (read-only; nobody can edit this history). */
export function FinHistory({ ids, refreshKey = '' }: { ids: string[]; refreshKey?: string }) {
  const [rows, setRows] = useState<FinAuditRow[] | null>(null);
  const key = ids.join(',');
  useEffect(() => { void loadFinHistory(ids).then(setRows); }, [key, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (rows === null) return <p className="text-[13px] text-subtle">İşlem geçmişi yükleniyor…</p>;
  if (!rows.length) return <p className="text-[13px] text-subtle">Kayıt yok.</p>;
  return (
    <ul className="grid gap-1 text-[12px]">
      {rows.map((r) => {
        const changed = Object.entries(r.changes ?? {}).filter(([k]) => !QUIET.has(k));
        return (
          <li key={r.id} className="grid gap-0.5 border-t border-line py-1.5">
            <span><span className="tabular-nums text-subtle">{fmtDateTime(r.at)}</span> · <strong>{r.actor ?? '—'}</strong> {ENTITY_LABEL[r.entity] ?? r.entity} {r.label ? `“${r.label}” ` : ''}{ACTION_LABEL[r.action] ?? r.action}</span>
            {changed.length > 0 && <span className="text-subtle">{changed.slice(0, 6).map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${short(v?.from)} → ${short(v?.to)}`).join(' · ')}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** One overview card: totals per currency (never converted), a short explanation underneath. */
export function TotalsCard({ title, totals, sub, tone }: { title: string; totals: Record<string, bigint>; sub?: string; tone?: 'bad' | 'warn' | 'ok' }) {
  return (
    <div className={`grid content-start gap-0.5 border px-3 py-2.5 ${tone === 'bad' ? 'border-red-500/50' : tone === 'warn' ? 'border-yellow-400/40' : tone === 'ok' ? 'border-yoca-lime/40' : 'border-line'}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">{title}</span>
      <span className="text-[16px] font-extrabold tabular-nums">{formatTotals(totals)}</span>
      {sub && <span className="text-[12px] text-subtle">{sub}</span>}
    </div>
  );
}
