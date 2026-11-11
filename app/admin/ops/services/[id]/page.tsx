'use client';

import Link from 'next/link';
import { LabeledDate } from '@/components/admin/DateField';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ServiceForm, { EMAIL_RE, PAY_TONE, RENEW_TONE, StatusBadges, looksSecret } from '@/components/admin/ops/ServiceForm';
import { Badge, DateOr, Documents, Empty, EntityLink, Flash, PageHead, Unknown, field, fmtDate, fmtDateTime, label as labelCls, small, ScrollArea } from '@/components/admin/ops/ui';
import {
  addPayment,
  archiveRow,
  confirmRenewal,
  currentEmail,
  db,
  loadOps,
  removeLink,
  saveRow,
  voidPayment,
  type DocumentRow,
 type NotificationRow,
  type OpsData,
  type Party,
  type Task,
  type WorkLog,
} from '@/lib/ops/data';
import {
  AUTO_RENEW_LABEL,
  KIND_FIELDS,
  KIND_LABEL,
  PARTY_LABEL,
  PAY_STATE_LABEL,
  PERIOD_LABEL,
  RENEW_STATE_LABEL,
  SERVICE_STATUS_LABEL,
  dueText,
  istanbulDay,
  missingInfo,
  missingText,
  payState,
  renewState,
  suggestNextEnd,
  type PaySummary,
  type Payment,
  type PeriodRow,
  type Service,
} from '@/lib/ops/model';
import { CURRENCIES, formatAmount, formatMinor, formatTotals, minorToDb, parseAmount, type Minor } from '@/lib/ops/money';
import { offsetText } from '@/lib/ops/reminders';
import { FORWARD_OUTCOME_LABEL, isForward } from '@/lib/ops/forward';
import { ForwardDialog } from '@/components/admin/ops/ForwardDialog';
import { adminPost } from '@/lib/cockpit/client';

/**
 * Yoca Operasyon — one service: facts, periods (renewal history), payments,
 * links, documents, maintenance hours, delivery tasks, customer notification
 * and notification history.
 *
 * Collection (in), provider payment (out) and the renewal at the provider are
 * three separate actions; none of them completes another.
 */

const BASE = '/admin/ops/services';
const ZERO = BigInt(0);
const PERIOD_STATUS_LABEL: Record<PeriodRow['status'], string> = { open: 'Açık dönem', renewed: 'Yenilendi', closed: 'Kapandı', cancelled: 'İptal' };
const PAYMENT_KIND_LABEL: Record<Payment['kind'], string> = { payment: 'Ödeme', refund: 'İade', adjustment: 'Düzeltme' };
const DIRECTION_LABEL: Record<Payment['direction'], string> = { in: 'Tahsilat (müşteriden)', out: 'Sağlayıcıya ödeme' };
const NOTE_KIND_LABEL: Record<string, string> = { reminder: 'Ekip hatırlatması', cancel_reminder: 'İptal hatırlatması', customer_reminder: 'Müşteri hatırlatması (eski)', digest: 'Özet' };
const NOTE_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted' }> = {
  pending: { label: 'Bekliyor', tone: 'info' }, sent: { label: 'Gönderildi', tone: 'ok' }, failed: { label: 'Başarısız', tone: 'bad' }, skipped: { label: 'Atlandı', tone: 'muted' }, suppressed: { label: 'Engellendi', tone: 'warn' },
};
const TASK_KIND_LABEL: Record<Task['kind'], string> = { delivery: 'Teslim', handover: 'Devir', task: 'Görev' };
const METHODS = ['Havale/EFT', 'Kredi kartı', 'Nakit', 'Sağlayıcı bakiyesi', 'Çek/senet', 'Diğer'];

interface Extra { logs: WorkLog[]; tasks: Task[]; notes: NotificationRow[]; docs: DocumentRow[]; error?: string }
/** Insert rows have no id yet ({ id?: string } alone is a weak type). */
type AnyRow = { id?: string } & Record<string, unknown>;
type Say = (message: string, tone?: 'ok' | 'bad' | 'warn') => void;

async function loadExtra(id: string): Promise<Extra> {
  try {
    const [logs, tasks, notes, docs] = await Promise.all([
      db().from('ops_work_logs').select('*').eq('service_id', id).order('worked_on', { ascending: false }),
      db().from('ops_tasks').select('*').eq('service_id', id).order('sort').order('created_at'),
      db().from('ops_notifications').select('id,dedupe_key,service_id,kind,offset_days,target_date,audience,status,attempts,last_error,sent_at,created_at,recipients,payload').eq('service_id', id).order('created_at', { ascending: false }).limit(100),
      db().from('ops_documents').select('*').eq('entity', 'service').eq('entity_id', id).is('archived_at', null).order('created_at', { ascending: false }),
    ]);
    return {
      logs: (logs.data ?? []) as WorkLog[], tasks: (tasks.data ?? []) as Task[], notes: (notes.data ?? []) as NotificationRow[], docs: (docs.data ?? []) as DocumentRow[],
      error: logs.error?.message ?? tasks.error?.message ?? notes.error?.message ?? docs.error?.message,
    };
  } catch (e) {
    return { logs: [], tasks: [], notes: [], docs: [], error: (e as Error).message };
  }
}

/** Signed paid totals per currency for one period / direction (voided records ignored). */
function paidByCurrency(payments: Payment[], periodId: string, direction: 'in' | 'out'): Record<string, Minor> {
  const out: Record<string, Minor> = {};
  for (const p of payments) {
    if (p.period_id !== periodId || p.direction !== direction || p.voided_at) continue;
    const a = parseAmount(p.amount);
    if (a === null || a === undefined) continue;
    out[p.currency] = (out[p.currency] ?? ZERO) + (p.kind === 'refund' ? -a : a);
  }
  return out;
}

/** numeric columns arrive as JSON numbers, form values as strings: compare by value. */
const sameAmount = (a: unknown, b: unknown) => parseAmount(a as string | number | null | undefined) === parseAmount(b as string | number | null | undefined);
const sameDate = (a: string | null | undefined, b: string | null | undefined) => (a || null) === (b || null);

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h} sa ${m} dk` : h ? `${h} sa` : `${m} dk`;
}

/* ── Small display pieces ────────────────────────────────────────── */

function Section({ title, id, action, children }: { title: string; id?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="admin-card grid gap-3 !p-4 sm:!p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">{k}</dt>
      <dd className="text-[13px] text-soft">{children}</dd>
    </div>
  );
}

function PayLine({ title, sum, payments, periodId, direction }: { title: string; sum: PaySummary; payments: Payment[]; periodId: string; direction: 'in' | 'out' }) {
  // Without an expected currency the paid amounts are shown per currency (never added together).
  const paid = sum.currency ? formatMinor(sum.paid, sum.currency) : formatTotals(paidByCurrency(payments, periodId, direction));
  return (
    <div className="grid gap-1 admin-box p-2.5 text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-soft">{title}</span>
        <Badge tone={PAY_TONE[sum.state]}>{PAY_STATE_LABEL[sum.state]}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 tabular-nums">
        <span><span className="block text-subtle">Beklenen</span>{sum.expected !== null && sum.currency ? formatMinor(sum.expected, sum.currency) : <Unknown>Tutar bilinmiyor</Unknown>}</span>
        <span><span className="block text-subtle">Ödenen</span>{paid}</span>
        <span><span className="block text-subtle">Kalan</span>{sum.remaining !== null && sum.currency ? formatMinor(sum.remaining, sum.currency) : <Unknown>Bilinmiyor</Unknown>}</span>
      </div>
      {Object.keys(sum.otherCurrencies).length > 0 && <p className="text-yellow-200">Farklı para biriminde (kalandan düşülmedi): {formatTotals(sum.otherCurrencies)}</p>}
    </div>
  );
}

/* ── Forms ───────────────────────────────────────────────────────── */

type PaymentPreset = { direction: 'in' | 'out'; kind: Payment['kind']; correction: boolean };

function PaymentForm({ service, period, preset, clients, say, onDone, onCancel }: { service: Service; period: PeriodRow; preset: PaymentPreset; clients: Party[]; say: Say; onDone: () => Promise<void>; onCancel: () => void }) {
  // One request key per open form: a double click or a retry after a lost connection finds the same record.
  const [requestKey] = useState(() => crypto.randomUUID());
  const [direction, setDirection] = useState(preset.direction);
  const [kind, setKind] = useState<Payment['kind']>(preset.kind);
  const curFor = (d: 'in' | 'out') => (d === 'in' ? period.price_currency ?? service.price_currency : period.cost_currency ?? service.cost_currency) ?? '';
  const [currency, setCurrency] = useState(curFor(preset.direction));
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(istanbulDay());
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const expectedCur = direction === 'in' ? period.price_currency : period.cost_currency;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (running.current) return;
    const minor = parseAmount(amount);
    if (minor === undefined) { setError(`“${amount}” geçerli bir tutar değil (örn. 1.250,00).`); return; }
    if (minor === null) { setError('Tutar girin.'); return; }
    if (kind !== 'adjustment' && minor <= ZERO) { setError('Ödeme ve iade tutarı sıfırdan büyük olmalı.'); return; }
    if (kind === 'adjustment' && minor === ZERO) { setError('Düzeltme tutarı sıfır olamaz (azaltmak için eksi değer girin).'); return; }
    if (!currency) { setError('Para birimi seçin.'); return; }
    if (!paidOn) { setError('Tarih girin.'); return; }
    if (looksSecret(`${note} ${reference}`)) { setError('Not veya referansta şifre/anahtar gibi görünen bir değer var.'); return; }
    running.current = true;
    setBusy(true); setError(null);
    const r = await addPayment({
      period_id: period.id, service_id: service.id, direction, kind, amount: minorToDb(minor), currency, paid_on: paidOn,
      method: method.trim() || null, reference: reference.trim() || null, note: note.trim() || null, client_id: direction === 'in' && clientId ? clientId : null,
    }, requestKey);
    running.current = false;
    setBusy(false);
    if (r.error) { setError(`${r.error} — aynı formla tekrar denerseniz ikinci kayıt oluşmaz.`); return; }
    say(r.existing ? 'Bu kayıt zaten kaydedilmişti; ikinci kayıt oluşturulmadı.' : `${DIRECTION_LABEL[direction]} kaydedildi.`, r.existing ? 'warn' : 'ok');
    await onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-3 border border-yoca-lime/40 p-3" aria-label="Ödeme kaydı">
      <p className="text-[13px] font-bold">{preset.correction ? 'Düzeltme / iade' : DIRECTION_LABEL[direction]} · {period.starts_on || period.ends_on ? `${fmtDate(period.starts_on) || '?'} – ${fmtDate(period.ends_on) || '?'}` : 'tarihleri bilinmeyen dönem'}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {preset.correction && (
          <>
            <label className={labelCls}>Yön
              <select className={field} value={direction} onChange={(e) => { const d = e.target.value as 'in' | 'out'; setDirection(d); setCurrency(curFor(d)); }}>
                <option value="in">{DIRECTION_LABEL.in}</option><option value="out">{DIRECTION_LABEL.out}</option>
              </select>
            </label>
            <label className={labelCls}>Tür
              <select className={field} value={kind} onChange={(e) => setKind(e.target.value as Payment['kind'])}>
                <option value="refund">İade (ödeneni azaltır)</option><option value="adjustment">Düzeltme (+ / −)</option>
              </select>
            </label>
          </>
        )}
        <label className={labelCls}>Tutar
          <input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={kind === 'adjustment' ? 'örn. -50,00' : 'örn. 1.250,00'} autoFocus />
        </label>
        <label className={labelCls}>Para birimi
          <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">Seçin</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <LabeledDate label="Tarih" value={paidOn} onChange={(v) => setPaidOn(v)} />
        <label className={labelCls}>Yöntem
          <input className={field} list="ops-pay-methods" value={method} onChange={(e) => setMethod(e.target.value)} />
          <datalist id="ops-pay-methods">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        <label className={labelCls}>Referans<input className={field} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Dekont / fatura no" /></label>
        {direction === 'in' && clients.length > 0 && (
          <label className={labelCls}>Ödeyen müşteri
            <select className={field} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Belirtilmedi</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <label className={labelCls}>Not<input className={field} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {currency && expectedCur && currency !== expectedCur && <p className="text-[12px] text-yellow-200">Dönemin para birimi {expectedCur}. {currency} kaydı kalan bakiyeden düşülmez; ayrı gösterilir (dönüştürme yok).</p>}
      <p className="text-[12px] text-subtle">{direction === 'in' ? 'Tahsilat, sağlayıcı ödemesini veya yenilemeyi tamamlamaz.' : 'Sağlayıcıya ödeme, yenilemenin yapıldığı anlamına gelmez; yenileme ayrıca doğrulanır.'}</p>
      <Flash tone="bad" message={error} onClose={() => setError(null)} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="admin-btn-primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        <button type="button" className="admin-btn" disabled={busy} onClick={onCancel}>Vazgeç</button>
      </div>
    </form>
  );
}

function RenewalForm({ service, period, say, onDone, onCancel }: { service: Service; period: PeriodRow; say: Say; onDone: () => Promise<void>; onCancel: () => void }) {
  const current = period.ends_on ?? service.end_on;
  const [newEnd, setNewEnd] = useState(suggestNextEnd(current, service) ?? '');
  const [actual, setActual] = useState('');
  const [currency, setCurrency] = useState(period.cost_currency ?? '');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [nextCustomerDue, setNextCustomerDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (running.current) return;
    if (!newEnd) { setError('Yeni bitiş tarihini girin (sağlayıcı panelinde görünen).'); return; }
    if (current && newEnd <= current) { setError(`Yeni bitiş tarihi mevcut bitişten (${fmtDate(current)}) sonra olmalı.`); return; }
    const minor = parseAmount(actual);
    if (minor === undefined) { setError(`“${actual}” geçerli bir tutar değil.`); return; }
    if (minor !== null && minor < ZERO) { setError('Gerçek maliyet negatif olamaz.'); return; }
    if (minor !== null && !currency) { setError('Gerçek maliyet için para birimi seçin.'); return; }
    if (looksSecret(`${note} ${ref}`)) { setError('Not veya referansta şifre/anahtar gibi görünen bir değer var.'); return; }
    running.current = true;
    setBusy(true); setError(null);
    if (minor !== null && currency !== (period.cost_currency ?? '')) {
      if (period.cost_currency) { running.current = false; setBusy(false); setError(`Dönemin alış para birimi ${period.cost_currency}; gerçek maliyet aynı para biriminde girilmeli.`); return; }
      const c = await saveRow('ops_periods', { id: period.id, cost_currency: currency });
      if (c.error) { running.current = false; setBusy(false); setError(c.error); return; }
    }
    const r = await confirmRenewal(period.id, {
      newEnd, actualCost: minor === null ? null : minorToDb(minor), ref: ref.trim() || null, note: note.trim() || null, nextDue: nextDue || null, nextCustomerDue: nextCustomerDue || null,
    });
    running.current = false;
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    say('Yenileme doğrulandı: dönem kapatıldı ve yeni dönem açıldı. Tahsilat ve sağlayıcı ödemesi ayrıca kaydedilir.');
    await onDone();
  };

  return (
    <form onSubmit={submit} role="dialog" aria-label="Sağlayıcıda yenileme doğrulandı" className="admin-box grid gap-3 !border-yoca-lime/40">
      <p className="text-[13px] font-bold">Sağlayıcıda yenileme doğrulandı</p>
      <p className="text-[12px] text-subtle">Yalnızca sağlayıcı panelinde yeni bitiş tarihini gördüyseniz kaydedin. Mevcut bitiş: {current ? fmtDate(current) : 'bilinmiyor'}. Bu işlem açık dönemi kapatır ve yeni dönemi açar (tek işlem); tahsilatı veya sağlayıcı ödemesini tamamlamaz. Kapanan dönemin tarih ve tutarları sonradan değiştirilemez.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledDate label="Yeni bitiş tarihi *" value={newEnd} onChange={(v) => setNewEnd(v)} />
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-muted">Gerçek maliyet (isteğe bağlı)</span>
          <div className="flex gap-2">
            <input className={field} inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Bilinmiyor" aria-label="Gerçek maliyet" />
            <select className={`${field} !w-28`} value={currency} disabled={Boolean(period.cost_currency)} onChange={(e) => setCurrency(e.target.value)} aria-label="Para birimi">
              <option value="">Para birimi</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <label className={labelCls}>Referans (sipariş / fatura no)<input className={field} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <label className={labelCls}>Not<input className={field} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <LabeledDate label="Yeni dönem: sağlayıcı ödeme vadesi" value={nextDue} onChange={(v) => setNextDue(v)} />
        <LabeledDate label="Yeni dönem: müşteri tahsilat vadesi" value={nextCustomerDue} onChange={(v) => setNextCustomerDue(v)} />
      </div>
      <Flash tone="bad" message={error} onClose={() => setError(null)} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="admin-btn-primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Yenilemeyi kaydet'}</button>
        <button type="button" className="admin-btn" disabled={busy} onClick={onCancel}>Vazgeç</button>
      </div>
    </form>
  );
}

/** Open a new period (from the service's dates/amounts) or edit the open one. */
function PeriodForm({ service, period, say, onDone, onCancel }: { service: Service; period: PeriodRow | null; say: Say; onDone: () => Promise<void>; onCancel: () => void }) {
  const src = period ?? {
    starts_on: service.start_on, ends_on: service.is_perpetual ? null : service.end_on, due_on: service.due_on, customer_due_on: null,
    expected_cost: service.cost_amount, cost_currency: service.cost_currency, expected_price: service.price_amount, price_currency: service.price_currency, note: null,
  };
  const [v, setV] = useState({
    starts_on: src.starts_on ?? '', ends_on: src.ends_on ?? '', due_on: src.due_on ?? '', customer_due_on: src.customer_due_on ?? '',
    expected_cost: src.expected_cost ?? '', cost_currency: src.cost_currency ?? '', expected_price: src.expected_price ?? '', price_currency: src.price_currency ?? '', note: src.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (running.current) return;
    const money = (a: string, c: string, what: string): { a: string | null; c: string | null; err?: string } => {
      const m = parseAmount(a);
      if (m === undefined) return { a: null, c: null, err: `${what}: “${a}” geçerli bir tutar değil.` };
      if (m !== null && m < ZERO) return { a: null, c: null, err: `${what} negatif olamaz.` };
      if (m !== null && !c) return { a: null, c: null, err: `${what} için para birimi seçin.` };
      return { a: m === null ? null : minorToDb(m), c: c || null };
    };
    const cost = money(v.expected_cost, v.cost_currency, 'Beklenen alış');
    const price = money(v.expected_price, v.price_currency, 'Beklenen satış');
    if (cost.err || price.err) { setError(cost.err ?? price.err ?? null); return; }
    if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) { setError('Bitiş başlangıçtan önce olamaz.'); return; }
    running.current = true;
    setBusy(true); setError(null);
    const row = {
      starts_on: v.starts_on || null, ends_on: v.ends_on || null, due_on: v.due_on || null, customer_due_on: v.customer_due_on || null,
      expected_cost: cost.a, cost_currency: cost.c, expected_price: price.a, price_currency: price.c, note: v.note.trim() || null,
    };
    const r = period ? await saveRow('ops_periods', { id: period.id, ...row }) : await saveRow<AnyRow>('ops_periods', { ...row, service_id: service.id, status: 'open', created_by: await currentEmail() });
    let warn = '';
    if (!r.error && !service.is_perpetual && (!sameDate(row.ends_on, service.end_on) || !sameDate(row.due_on, service.due_on))) {
      // The service shows the current period's end / due date: keep them the same.
      const s = await saveRow('ops_services', { id: service.id, end_on: row.ends_on, due_on: row.due_on });
      if (s.error) warn = ` Hizmetin bitiş/vade tarihi güncellenemedi: ${s.error}`;
    }
    running.current = false;
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    say(`${period ? 'Açık dönem güncellendi.' : 'Yeni dönem açıldı.'}${warn}`, warn ? 'warn' : 'ok');
    await onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-3 border border-yoca-lime/40 p-3" aria-label={period ? 'Açık dönemi düzenle' : 'Dönem aç'}>
      <p className="text-[13px] font-bold">{period ? 'Açık dönemi düzenle' : 'Dönem aç'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledDate label="Başlangıç" value={v.starts_on} onChange={(v) => set('starts_on', v)} />
        <LabeledDate label="Bitiş" value={v.ends_on} onChange={(v) => set('ends_on', v)} />
        <LabeledDate label="Sağlayıcı ödeme vadesi" value={v.due_on} onChange={(v) => set('due_on', v)} />
        <LabeledDate label="Müşteri tahsilat vadesi" value={v.customer_due_on} onChange={(v) => set('customer_due_on', v)} />
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-muted">Beklenen alış</span>
          <div className="flex gap-2">
            <input className={field} inputMode="decimal" value={v.expected_cost} onChange={(e) => set('expected_cost', e.target.value)} placeholder="Bilinmiyor" aria-label="Beklenen alış" />
            <select className={`${field} !w-28`} value={v.cost_currency} onChange={(e) => set('cost_currency', e.target.value)} aria-label="Alış para birimi"><option value="">—</option>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-muted">Beklenen satış (tahsilat)</span>
          <div className="flex gap-2">
            <input className={field} inputMode="decimal" value={v.expected_price} onChange={(e) => set('expected_price', e.target.value)} placeholder="Bilinmiyor" aria-label="Beklenen satış" />
            <select className={`${field} !w-28`} value={v.price_currency} onChange={(e) => set('price_currency', e.target.value)} aria-label="Satış para birimi"><option value="">—</option>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </div>
        </div>
      </div>
      <label className={labelCls}>Not<input className={field} value={v.note} onChange={(e) => set('note', e.target.value)} /></label>
      <Flash tone="bad" message={error} onClose={() => setError(null)} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="admin-btn-primary" disabled={busy}>{busy ? 'Kaydediliyor…' : period ? 'Kaydet' : 'Dönemi aç'}</button>
        <button type="button" className="admin-btn" disabled={busy} onClick={onCancel}>Vazgeç</button>
      </div>
    </form>
  );
}

/* ── Sections ────────────────────────────────────────────────────── */

type Action = { type: 'pay'; periodId: string; preset: PaymentPreset } | { type: 'renew'; periodId: string } | { type: 'period'; periodId: string | null } | null;

function PeriodsSection({ service, data, clients, today, say, reload }: { service: Service; data: OpsData; clients: Party[]; today: string; say: Say; reload: () => Promise<void> }) {
  const [action, setAction] = useState<Action>(null);
  const periods = data.periods.filter((p) => p.service_id === service.id)
    .sort((a, b) => (b.starts_on ?? b.ends_on ?? '').localeCompare(a.starts_on ?? a.ends_on ?? '') || b.created_at.localeCompare(a.created_at));
  const pays = data.payments.filter((p) => p.service_id === service.id);
  const open = periods.find((p) => p.status === 'open') ?? null;
  const done = async () => { setAction(null); await reload(); };

  const actions = (p: PeriodRow) => (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={small} onClick={() => setAction({ type: 'pay', periodId: p.id, preset: { direction: 'in', kind: 'payment', correction: false } })}>Tahsilat ekle</button>
      <button type="button" className={small} onClick={() => setAction({ type: 'pay', periodId: p.id, preset: { direction: 'out', kind: 'payment', correction: false } })}>Sağlayıcı ödemesi ekle</button>
      <button type="button" className={small} onClick={() => setAction({ type: 'pay', periodId: p.id, preset: { direction: 'in', kind: 'refund', correction: true } })}>Düzeltme/iade</button>
      {p.status === 'open' && !service.is_perpetual && service.period !== 'once' && (
        <button type="button" className={`${small} !border-yoca-lime/60 !text-yoca-lime`} onClick={() => setAction({ type: 'renew', periodId: p.id })}>Sağlayıcıda yenileme doğrulandı</button>
      )}
      {p.status === 'open' && <button type="button" className={small} onClick={() => setAction({ type: 'period', periodId: p.id })}>Dönemi düzenle</button>}
    </div>
  );

  return (
    <Section title="Dönem geçmişi" id="donemler" action={!open && <button type="button" className={small} onClick={() => setAction({ type: 'period', periodId: null })}>Dönem aç</button>}>
      {!open && action?.type !== 'period' && (
        <p className="text-[12px] text-subtle">Açık dönem yok. Tahsilat, sağlayıcı ödemesi ve yenileme bir döneme bağlıdır; “Dönem aç” ile hizmetin tarih ve tutarlarından yeni dönem açabilirsiniz.</p>
      )}
      {action?.type === 'period' && action.periodId === null && <PeriodForm service={service} period={null} say={say} onDone={done} onCancel={() => setAction(null)} />}
      {periods.length === 0 ? <Empty text="Henüz dönem kaydı yok." /> : (
        <ol className="grid gap-3">
          {periods.map((p) => {
            const pin = payState(p, pays, 'in', today);
            const pout = payState(p, pays, 'out', today);
            const rs = p.status === 'open' ? renewState(service, p, pays, today) : null;
            return (
              <li key={p.id} className={`grid gap-2.5 border p-3 ${p.status === 'open' ? 'border-yoca-lime/40' : 'border-line'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-extrabold tabular-nums">
                    {p.starts_on ? fmtDate(p.starts_on) : <Unknown>Başlangıç ?</Unknown>} – {p.ends_on ? fmtDate(p.ends_on) : service.is_perpetual ? 'Süresiz' : <Unknown>Bitiş tarihi bilinmiyor</Unknown>}
                    {p.status === 'open' && p.ends_on && <span className="ms-2 text-[12px] font-normal text-subtle">{dueText(p.ends_on, today)}</span>}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={p.status === 'open' ? 'info' : p.status === 'renewed' ? 'ok' : 'muted'}>{PERIOD_STATUS_LABEL[p.status]}</Badge>
                    {rs && <Badge tone={RENEW_TONE[rs]}>Yenileme: {RENEW_STATE_LABEL[rs]}</Badge>}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Fact k="Beklenen alış">{formatAmount(p.expected_cost, p.cost_currency)}</Fact>
                  <Fact k="Gerçek alış">{p.actual_cost !== null && p.actual_cost !== undefined ? formatAmount(p.actual_cost, p.cost_currency) : <Unknown>Girilmedi</Unknown>}</Fact>
                  <Fact k="Beklenen satış">{formatAmount(p.expected_price, p.price_currency)}</Fact>
                  <Fact k="Sağlayıcı vadesi"><DateOr value={p.due_on} /></Fact>
                  <Fact k="Tahsilat vadesi"><DateOr value={p.customer_due_on ?? p.due_on} /></Fact>
                </dl>
                <div className="grid gap-2 md:grid-cols-2">
                  <PayLine title="Müşteriden tahsilat" sum={pin} payments={pays} periodId={p.id} direction="in" />
                  <PayLine title="Sağlayıcıya ödeme" sum={pout} payments={pays} periodId={p.id} direction="out" />
                </div>
                {p.renewed_at ? (
                  <p className="text-[12px] text-yoca-green">Sağlayıcıda yenileme doğrulandı: {fmtDateTime(p.renewed_at)}{p.renewed_by ? ` · ${p.renewed_by}` : ''}{p.renewal_ref ? ` · Ref: ${p.renewal_ref}` : ''}{p.renewal_note ? ` · ${p.renewal_note}` : ''}</p>
                ) : p.status === 'open' && service.auto_renew === 'on' ? (
                  <p className="text-[12px] text-subtle">Otomatik yenileme açık; yine de yeni bitiş tarihi sağlayıcıda görülüp doğrulanmalı.</p>
                ) : null}
                {p.note && <p className="text-[12px] text-subtle">Not: {p.note}</p>}
                {p.status !== 'open' && <p className="text-[11px] text-subtle">Kapanmış dönemin tarih ve tutarları değiştirilemez; geç gelen ödeme veya düzeltme yine bu döneme eklenebilir.</p>}
                {p.status !== 'cancelled' && actions(p)}
                {action && action.type !== 'period' && action.periodId === p.id && (
                  action.type === 'pay'
                    ? <PaymentForm key={`${p.id}:${action.preset.direction}:${action.preset.kind}`} service={service} period={p} preset={action.preset} clients={clients} say={say} onDone={done} onCancel={() => setAction(null)} />
                    : <RenewalForm service={service} period={p} say={say} onDone={done} onCancel={() => setAction(null)} />
                )}
                {action?.type === 'period' && action.periodId === p.id && <PeriodForm service={service} period={p} say={say} onDone={done} onCancel={() => setAction(null)} />}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function PaymentsSection({ service, data, say, reload }: { service: Service; data: OpsData; say: Say; reload: () => Promise<void> }) {
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [showVoided, setShowVoided] = useState(true);
  const pays = data.payments.filter((p) => p.service_id === service.id && (showVoided || !p.voided_at));
  const periodBy = new Map(data.periods.map((p) => [p.id, p] as const));
  const partyName = (id: string | null) => (id ? data.parties.find((p) => p.id === id)?.name ?? null : null);

  const doVoid = async (id: string) => {
    if (busy) return;
    if (reason.trim().length < 3) { say('İptal nedeni yazın (en az 3 karakter).', 'bad'); return; }
    setBusy(true);
    const err = await voidPayment(id, reason.trim());
    setBusy(false);
    if (err) { say(err, 'bad'); return; }
    setVoiding(null); setReason('');
    say('Kayıt iptal edildi (silinmedi; geçmişte görünür).');
    await reload();
  };

  return (
    <Section title="Ödeme kayıtları" id="odemeler" action={<label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" className="accent-yoca-lime" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />İptal edilenleri göster</label>}>
      {pays.length === 0 ? <p className="text-[13px] text-subtle">Ödeme kaydı yok. Kayıtlar “Dönem geçmişi”ndeki dönemden eklenir.</p> : (
        <ScrollArea label="Ödeme kayıtları">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-subtle">
              <tr><th className="py-1.5 pe-3">Tarih</th><th className="py-1.5 pe-3">Yön</th><th className="py-1.5 pe-3">Tür</th><th className="py-1.5 pe-3 text-right">Tutar</th><th className="py-1.5 pe-3">Yöntem · ref</th><th className="py-1.5 pe-3">Dönem</th><th className="py-1.5 pe-3">Durum</th><th className="py-1.5" /></tr>
            </thead>
            <tbody>
              {pays.map((p) => {
                const per = periodBy.get(p.period_id);
                return (
                  <tr key={p.id} className={`border-t border-line align-top ${p.voided_at ? 'text-subtle' : ''}`}>
                    <td className="py-1.5 pe-3 tabular-nums">{fmtDate(p.paid_on)}</td>
                    <td className="py-1.5 pe-3">{DIRECTION_LABEL[p.direction]}{partyName(p.client_id) && <span className="block text-subtle">{partyName(p.client_id)}</span>}</td>
                    <td className="py-1.5 pe-3">{PAYMENT_KIND_LABEL[p.kind]}</td>
                    <td className={`py-1.5 pe-3 text-right tabular-nums ${p.voided_at ? 'line-through' : ''}`}>{p.kind === 'refund' ? '−' : ''}{formatAmount(p.amount, p.currency)}</td>
                    <td className="py-1.5 pe-3">{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}{p.note && <span className="block text-subtle">{p.note}</span>}</td>
                    <td className="py-1.5 pe-3">{per ? `${fmtDate(per.starts_on) || '?'} – ${fmtDate(per.ends_on) || '?'}` : '—'}</td>
                    <td className="py-1.5 pe-3">
                      {p.voided_at ? <span className="inline-block"><Badge tone="bad">İptal edildi</Badge><span className="block">{p.void_reason}</span><span className="block">{fmtDateTime(p.voided_at)}</span></span> : <Badge tone="ok">Geçerli</Badge>}
                      <span className="block text-subtle">{p.created_by ?? ''}</span>
                    </td>
                    <td className="py-1.5">
                      {!p.voided_at && (voiding === p.id ? (
                        <span className="grid gap-1">
                          <input className={`${field} !py-1 text-[12px]`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="İptal nedeni" aria-label="İptal nedeni" autoFocus />
                          <span className="flex gap-1">
                            <button type="button" className={small} disabled={busy} onClick={() => doVoid(p.id)}>{busy ? '…' : 'İptal et'}</button>
                            <button type="button" className={small} disabled={busy} onClick={() => { setVoiding(null); setReason(''); }}>Vazgeç</button>
                          </span>
                        </span>
                      ) : <button type="button" className={small} onClick={() => { setVoiding(p.id); setReason(''); }}>İptal et (void)</button>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}
      <p className="text-[11px] text-subtle">Ödeme kayıtları silinmez; yanlış kayıt “İptal et (void)” ile nedeni yazılarak iptal edilir ya da düzeltme/iade kaydı eklenir.</p>
    </Section>
  );
}

function LinksSection({ service, data, say, reload }: { service: Service; data: OpsData; say: Say; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [relNote, setRelNote] = useState('');
  const links = data.links.filter((l) => l.service_id === service.id);
  const clientLinks = links.filter((l) => l.client_id);
  const projectLinks = links.filter((l) => l.project_id);
  const relations = data.relations.filter((r) => r.service_id === service.id || r.related_id === service.id);
  const party = (id: string | null) => data.parties.find((p) => p.id === id);
  const project = (id: string | null) => data.projects.find((p) => p.id === id);
  const svc = (id: string) => data.services.find((s) => s.id === id);

  const run = async (fn: () => Promise<string | null>, ok: string) => {
    if (busy) return;
    setBusy(true);
    const err = await fn();
    setBusy(false);
    if (err) say(err, 'bad'); else { say(ok); await reload(); }
  };
  const add = (row: Record<string, unknown>, table: 'ops_service_links' | 'ops_service_relations', ok: string) => run(async () => (await saveRow(table, row)).error ?? null, ok);
  const remove = (table: 'ops_service_links' | 'ops_service_relations', id: string, what: string) => {
    if (!window.confirm(`${what} bağlantısı kaldırılsın mı? Yalnızca bağlantı kaldırılır; kayıtların kendisi silinmez.`)) return;
    void run(() => removeLink(table, id), 'Bağlantı kaldırıldı.');
  };

  const freeClients = data.parties.filter((p) => !p.archived_at && !clientLinks.some((l) => l.client_id === p.id));
  const freeProjects = data.projects.filter((p) => !p.archived_at && !projectLinks.some((l) => l.project_id === p.id));
  const freeServices = data.services.filter((s) => s.id !== service.id && !s.archived_at && !relations.some((r) => r.service_id === s.id || r.related_id === s.id));

  const row = (key: string, content: ReactNode, onRemove: () => void) => (
    <li key={key} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5 text-[13px]">
      <span className="min-w-0">{content}</span>
      <button type="button" className={small} disabled={busy} onClick={onRemove}>Bağlantıyı kaldır</button>
    </li>
  );
  const adder = (title: string, options: Array<{ id: string; label: string }>, onPick: (id: string) => void) => (
    options.length > 0 && (
      <select className={field} value="" disabled={busy} aria-label={title} onChange={(e) => { if (e.target.value) onPick(e.target.value); }}>
        <option value="">+ {title}…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    )
  );

  return (
    <Section title="Bağlantılar" id="baglantilar">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid content-start gap-2">
          <h3 className="text-[13px] font-bold">Müşteriler</h3>
          {clientLinks.length ? <ul>{clientLinks.map((l) => row(l.id, party(l.client_id) ? <EntityLink href={`/admin/ops/clients/${l.client_id}`}>{party(l.client_id)?.name}</EntityLink> : <Unknown>Silinmiş kayıt</Unknown>, () => remove('ops_service_links', l.id, party(l.client_id)?.name ?? 'Müşteri')))}</ul> : <p className="text-[12px] text-subtle">Bağlı müşteri yok.</p>}
          {adder('Müşteri bağla', freeClients.map((p) => ({ id: p.id, label: p.name })), (id) => add({ service_id: service.id, client_id: id }, 'ops_service_links', 'Müşteri bağlandı.'))}
        </div>
        <div className="grid content-start gap-2">
          <h3 className="text-[13px] font-bold">Projeler</h3>
          {projectLinks.length ? <ul>{projectLinks.map((l) => row(l.id, project(l.project_id) ? <span><EntityLink href={`/admin/ops/projects/${l.project_id}`}>{project(l.project_id)?.name}</EntityLink>{party(project(l.project_id)?.client_id ?? null) && <span className="text-subtle"> · {party(project(l.project_id)?.client_id ?? null)?.name}</span>}</span> : <Unknown>Silinmiş kayıt</Unknown>, () => remove('ops_service_links', l.id, project(l.project_id)?.name ?? 'Proje')))}</ul> : <p className="text-[12px] text-subtle">Bağlı proje yok.</p>}
          {adder('Proje bağla', freeProjects.map((p) => ({ id: p.id, label: p.name })), (id) => add({ service_id: service.id, project_id: id }, 'ops_service_links', 'Proje bağlandı.'))}
        </div>
        <div className="grid content-start gap-2">
          <h3 className="text-[13px] font-bold">İlişkili hizmetler</h3>
          {relations.length ? <ul>{relations.map((r) => {
            const other = svc(r.service_id === service.id ? r.related_id : r.service_id);
            return row(r.id, other ? <span><EntityLink href={`${BASE}/${other.id}`}>{other.name}</EntityLink> <span className="text-subtle">· {KIND_LABEL[other.kind]}{r.note ? ` · ${r.note}` : ''}</span></span> : <Unknown>Silinmiş kayıt</Unknown>, () => remove('ops_service_relations', r.id, other?.name ?? 'İlişki'));
          })}</ul> : <p className="text-[12px] text-subtle">İlişkili hizmet yok (örn. domain ↔ hosting ↔ SSL).</p>}
          {freeServices.length > 0 && <input className={field} value={relNote} onChange={(e) => setRelNote(e.target.value)} placeholder="İlişki notu (isteğe bağlı)" aria-label="İlişki notu" />}
          {adder('Hizmet ilişkilendir', freeServices.map((s) => ({ id: s.id, label: `${s.name} · ${KIND_LABEL[s.kind]}` })), (id) => { void add({ service_id: service.id, related_id: id, note: relNote.trim() || null }, 'ops_service_relations', 'Hizmet ilişkilendirildi.'); setRelNote(''); })}
        </div>
      </div>
    </Section>
  );
}

function parseDuration(v: string): number | null {
  const s = v.trim().replace(',', '.');
  let m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:\.\d+)?)\s*(sa|saat|h)$/i.exec(s);
  if (m) return Math.round(Number(m[1]) * 60);
  m = /^(\d+)\s*(dk|dakika|m)?$/i.exec(s);
  if (m) return Number(m[1]);
  return null;
}

function MaintenanceSection({ service, open, logs, say, reload }: { service: Service; open: PeriodRow | null; logs: WorkLog[]; say: Say; reload: () => Promise<void> }) {
  const [day, setDay] = useState(istanbulDay());
  const [dur, setDur] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const includedRaw = Number(service.details?.included_hours);
  const included = Number.isFinite(includedRaw) && includedRaw > 0 ? includedRaw : null;
  const inPeriod = (d: string) => Boolean(open) && (!open?.starts_on || d >= open.starts_on) && (!open?.ends_on || d <= open.ends_on);
  const periodLogs = open ? logs.filter((l) => inPeriod(l.worked_on)) : [];
  const used = periodLogs.reduce((a, l) => a + l.minutes, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (running.current) return;
    const minutes = parseDuration(dur);
    if (!minutes || minutes <= 0 || minutes > 24 * 60) { setError('Süreyi dakika (90), saat:dakika (1:30) veya saat (1,5 sa) olarak girin; en çok 24 saat.'); return; }
    if (!day) { setError('Tarih girin.'); return; }
    if (looksSecret(note)) { setError('Notta şifre/anahtar gibi görünen bir değer var.'); return; }
    running.current = true;
    setBusy(true); setError(null);
    const r = await saveRow<AnyRow>('ops_work_logs', { service_id: service.id, worked_on: day, minutes, note: note.trim() || null, created_by: await currentEmail() });
    running.current = false;
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setDur(''); setNote('');
    say('Çalışma kaydı eklendi.');
    await reload();
  };

  return (
    <Section title="Bakım" id="bakim">
      <div className="grid gap-1 text-[13px]">
        {open ? (
          <p>
            Bu dönem ({open.starts_on ? fmtDate(open.starts_on) : 'başlangıç ?'} – {open.ends_on ? fmtDate(open.ends_on) : 'bitiş ?'}): <b className="tabular-nums">{fmtMinutes(used)}</b>
            {' '}/ dahil {included !== null ? <b>{included} sa</b> : <Unknown>bilinmiyor</Unknown>}
            {included !== null && (used > included * 60
              ? <span className="ms-2"><Badge tone="bad">Aşım: {fmtMinutes(used - Math.round(included * 60))}</Badge></span>
              : <span className="ms-2"><Badge tone="ok">Kalan: {fmtMinutes(Math.round(included * 60) - used)}</Badge></span>)}
          </p>
        ) : <p className="text-subtle">Açık dönem yok; dönem içi süre hesaplanamıyor. Toplam kayıt: {fmtMinutes(logs.reduce((a, l) => a + l.minutes, 0))}.</p>}
        {included === null && <p className="text-[12px] text-subtle">Dahil çalışma süresi “Düzenle › Türe özel alanlar”dan girilir.</p>}
        {open && (!open.starts_on || !open.ends_on) && <p className="text-[12px] text-yellow-200">Açık dönemin tarihlerinden biri bilinmiyor; o yönde sınır uygulanmadı.</p>}
      </div>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[auto_8rem_minmax(0,1fr)_auto] sm:items-end">
        <LabeledDate label="Tarih" value={day} onChange={(v) => setDay(v)} />
        <label className={labelCls}>Süre<input className={field} value={dur} onChange={(e) => setDur(e.target.value)} placeholder="1:30" /></label>
        <label className={labelCls}>Not<input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ne yapıldı" /></label>
        <button type="submit" className="admin-btn-primary" disabled={busy}>{busy ? 'Ekleniyor…' : 'Çalışma ekle'}</button>
      </form>
      <Flash tone="bad" message={error} onClose={() => setError(null)} />
      {logs.length === 0 ? <p className="text-[12px] text-subtle">Çalışma kaydı yok.</p> : (
        <ul className="grid gap-0.5 text-[12px]">
          {logs.slice(0, 50).map((l) => (
            <li key={l.id} className="flex flex-wrap justify-between gap-2 border-t border-line py-1.5">
              <span><span className="tabular-nums">{fmtDate(l.worked_on)}</span> · <b>{fmtMinutes(l.minutes)}</b>{l.note ? ` · ${l.note}` : ''}</span>
              <span className="text-subtle">{inPeriod(l.worked_on) ? 'bu dönem · ' : ''}{l.created_by ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TasksSection({ service, tasks, say, reload }: { service: Service; tasks: Task[]; say: Say; reload: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Task['kind']>('delivery');
  const [due, setDue] = useState('');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const sorted = [...tasks].sort((a, b) => Number(a.status === 'done' || a.status === 'skipped') - Number(b.status === 'done' || b.status === 'skipped') || a.sort - b.sort);

  const act = async (fn: () => Promise<string | null>, ok?: string) => {
    if (running.current) return;
    running.current = true; setBusy(true);
    const err = await fn();
    running.current = false; setBusy(false);
    if (err) say(err, 'bad'); else { if (ok) say(ok); await reload(); }
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { say('Görev başlığı girin.', 'bad'); return; }
    if (owner.trim() && !EMAIL_RE.test(owner.trim())) { say('Sorumlu e-posta adresi geçersiz.', 'bad'); return; }
    void act(async () => {
      const r = await saveRow<AnyRow>('ops_tasks', { service_id: service.id, kind, title: title.trim(), due_on: due || null, owner_email: owner.trim() || null, sort: tasks.reduce((m, t) => Math.max(m, t.sort), 0) + 1 });
      if (!r.error) { setTitle(''); setDue(''); }
      return r.error ?? null;
    }, 'Görev eklendi.');
  };

  return (
    <Section title="Teslim / devir görevleri" id="gorevler">
      {sorted.length === 0 ? <p className="text-[12px] text-subtle">Görev yok. Örn. “DNS kayıtları müşteriye iletildi”, “Panel erişimi devredildi”.</p> : (
        <ul className="grid gap-0.5 text-[13px]">
          {sorted.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
              <label className="flex min-w-0 items-start gap-2">
                <input type="checkbox" className="mt-1 accent-yoca-lime" disabled={busy} checked={t.status === 'done'} onChange={(e) => act(async () => (await saveRow('ops_tasks', { id: t.id, status: e.target.checked ? 'done' : 'todo', done_at: e.target.checked ? new Date().toISOString() : null })).error ?? null)} />
                <span>
                  <Badge>{TASK_KIND_LABEL[t.kind]}</Badge> <span className={t.status === 'done' ? 'text-subtle line-through' : ''}>{t.title}</span>
                  <span className="block text-[11px] text-subtle">{[t.due_on ? `Son gün ${fmtDate(t.due_on)}` : '', t.owner_email ?? '', t.done_at ? `Tamamlandı ${fmtDateTime(t.done_at)}` : ''].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
              <button type="button" className={small} disabled={busy} onClick={() => { if (window.confirm(`“${t.title}” görevi kaldırılsın mı?`)) void act(() => removeLink('ops_tasks', t.id), 'Görev kaldırıldı.'); }}>Kaldır</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto_minmax(0,12rem)_auto] sm:items-end">
        <label className={labelCls}>Tür
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as Task['kind'])}>
            {(['delivery', 'handover', 'task'] as const).map((k) => <option key={k} value={k}>{TASK_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className={labelCls}>Görev<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ne yapılacak" /></label>
        <LabeledDate label="Son gün" value={due} onChange={(v) => setDue(v)} />
        <label className={labelCls}>Sorumlu<input className={field} type="email" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e-posta" /></label>
        <button type="submit" className="admin-btn" disabled={busy}>Ekle</button>
      </form>
    </Section>
  );
}

/**
 * Reminders go to the TEAM only (daily Operasyon digest). Nothing here sends by
 * itself: a customer gets an e-mail only through "E-postayla ilet", with the
 * recipient typed or picked by hand and "Gönder" pressed in the dialog.
 */
function ForwardSection({ service, end, today, onForward }: { service: Service; end: string | null; today: string; onForward: (target: string | null, offset: number) => void }) {
  const noReminders = service.is_perpetual || service.period === 'once' || service.status === 'cancelled';
  return (
    <Section title="Hatırlatma ve iletme" id="iletme">
      <div className="grid gap-1.5 text-[12px] text-soft">
        <p>Yenileme hatırlatmaları yalnızca <strong>ekip içi</strong> günlük Operasyon özetine girer (09:00, kokpit bildirim adresi). Müşteriye otomatik e-posta gönderilmez; kayıttaki e-posta adresi gönderim izni değildir.</p>
        <p className="text-subtle">Müşteriye veya başka bir adrese bildirmek gerekirse “E-postayla ilet” ile alıcıyı, konuyu, mesajı ve ekleri kendiniz belirleyip gönderirsiniz. Kaydetmek, yenilemeyi onaylamak veya bir bildirimi kapatmak e-posta göndermez.</p>
        {noReminders && <p className="text-yellow-200">Bu hizmet {service.is_perpetual ? 'süresiz' : service.period === 'once' ? 'tek seferlik' : 'iptal edilmiş'}; yenileme hatırlatması planlanmaz.</p>}
        {!end && !noReminders && <p className="text-yellow-200">Bitiş tarihi bilinmiyor; tarih girilene kadar hatırlatma planlanmaz.</p>}
      </div>
      <div><button type="button" className="admin-btn" onClick={() => onForward(end, end ? Math.max(-1, daysBetween(today, end)) : 0)}>E-postayla ilet</button></div>
    </Section>
  );
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

function NotificationsSection({ notes, error, today, onForward, say, reload }: { notes: NotificationRow[]; error?: string; today: string; onForward: (target: string | null, offset: number, reminderId: string) => void; say: Say; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = async (n: NotificationRow) => {
    setBusy(n.id);
    const r = await adminPost<{ ok: boolean; status?: string; error?: string }>('/api/admin/ops/forward', { action: 'status', id: n.id });
    setBusy(null);
    say(r.ok ? `Durum: ${FORWARD_OUTCOME_LABEL[r.status ?? ''] ?? r.status}` : r.error ?? 'Durum okunamadı.', r.ok ? 'ok' : 'warn');
    await reload();
  };
  return (
    <Section title="Bildirim geçmişi" id="bildirimler">
      {error && <Flash tone="warn" message={`Bazı kayıtlar okunamadı: ${error}`} />}
      {notes.length === 0 ? <p className="text-[12px] text-subtle">Bu hizmet için planlanmış, gönderilmiş veya iletilmiş bildirim yok.</p> : (
        <ScrollArea label="Bildirim geçmişi">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-subtle">
              <tr><th className="py-1.5 pe-3">Tür</th><th className="py-1.5 pe-3">Zaman</th><th className="py-1.5 pe-3">Hedef tarih</th><th className="py-1.5 pe-3">Durum</th><th className="py-1.5 pe-3">Ayrıntı</th><th className="py-1.5 pe-3">Gönderildi</th><th className="py-1.5" /></tr>
            </thead>
            <tbody>
              {notes.map((n) => {
                const manual = isForward(n.dedupe_key);
                const p = (n.payload ?? {}) as { subject?: string; sent_by?: string; cc?: string[]; outcome?: string; delivery?: string; attachments?: Array<{ name: string }>; status_checked_at?: string };
                const state = manual ? (p.delivery ?? p.outcome ?? n.status) : null;
                return (
                  <tr key={n.id} className="border-t border-line align-top">
                    <td className="py-1.5 pe-3">{manual ? 'Elle iletildi' : NOTE_KIND_LABEL[n.kind] ?? n.kind}<span className="block text-subtle">{manual ? 'dış alıcı' : n.audience === 'customer' ? 'müşteri' : 'ekip'}</span></td>
                    <td className="py-1.5 pe-3">{n.offset_days === null ? '—' : offsetText(n.offset_days)}</td>
                    <td className="py-1.5 pe-3 tabular-nums">{n.target_date ? fmtDate(n.target_date) : '—'}</td>
                    <td className="py-1.5 pe-3">{manual
                      ? <Badge tone={state === 'delivered' ? 'ok' : state === 'accepted' || state === 'sending' || state === 'delayed' ? 'info' : state === 'unknown' ? 'warn' : 'bad'}>{FORWARD_OUTCOME_LABEL[state ?? ''] ?? state}</Badge>
                      : <Badge tone={NOTE_STATUS[n.status]?.tone ?? 'muted'}>{NOTE_STATUS[n.status]?.label ?? n.status}</Badge>}</td>
                    <td className="py-1.5 pe-3">{manual ? (
                      <span className="grid gap-0.5">
                        <span>Alıcı: {(n.recipients ?? []).join(', ')}{p.cc?.length ? ` · CC: ${p.cc.join(', ')}` : ''}</span>
                        <span className="text-muted">Konu: {p.subject}</span>
                        {p.attachments?.length ? <span className="text-muted">Ek: {p.attachments.map((a) => a.name).join(', ')}</span> : null}
                        <span className="text-subtle">Gönderen: {p.sent_by ?? '—'}{p.status_checked_at ? ` · durum kontrolü ${fmtDateTime(p.status_checked_at)}` : ''}</span>
                        {n.last_error && <span className="text-red-300">{n.last_error}</span>}
                      </span>
                    ) : <span className="text-red-300">{n.last_error ?? ''}{n.attempts > 1 ? <span className="block text-subtle">{n.attempts} deneme</span> : null}</span>}</td>
                    <td className="py-1.5 pe-3">{n.sent_at ? fmtDateTime(n.sent_at) : '—'}</td>
                    <td className="py-1.5">
                      {manual && n.status === 'sent' && <button type="button" className={small} disabled={busy === n.id} onClick={() => void refresh(n)}>{busy === n.id ? '…' : 'Durumu yenile'}</button>}
                      {!manual && n.audience === 'team' && n.kind !== 'digest' && n.status !== 'skipped' && n.target_date && (
                        // days left counted from today (the stored offset is when the reminder was planned)
                        <button type="button" className={small} onClick={() => onForward(n.target_date, Math.max(-1, daysBetween(today, n.target_date as string)), n.id)}>E-postayla ilet</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </Section>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

function ServiceDetailInner({ id }: { id: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<OpsData | null>(null);
  const [extra, setExtra] = useState<Extra>({ logs: [], tasks: [], notes: [], docs: [] });
  const [forward, setForward] = useState<{ target: string | null; offset: number; reminderId: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<{ message: string; tone: 'ok' | 'bad' | 'warn' } | null>(null);
  const [archBusy, setArchBusy] = useState(false);
  const today = istanbulDay();
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say: Say = (message, tone = 'ok') => {
    setFlash({ message, tone });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (tone === 'ok') flashTimer.current = setTimeout(() => setFlash(null), 4000);
  };
  const reload = async () => {
    const [d, x] = await Promise.all([loadOps(), loadExtra(id)]);
    setData(d);
    setExtra(x);
  };
  useEffect(() => {
    void reload();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (params.get('created')) {
      const warn = params.get('warn');
      say(warn ? `Hizmet oluşturuldu. Uyarı: ${warn}` : 'Hizmet oluşturuldu.', warn ? 'warn' : 'ok');
      router.replace(`${BASE}/${id}`, { scroll: false });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const service = data?.services.find((s) => s.id === id) ?? null;
  const view = useMemo(() => {
    if (!data || !service) return null;
    const open = data.periods.find((p) => p.service_id === id && p.status === 'open') ?? null;
    const pays = data.payments.filter((p) => p.service_id === id);
    const links = data.links.filter((l) => l.service_id === id);
    const clients = links.map((l) => data.parties.find((p) => p.id === l.client_id)).filter((x): x is Party => Boolean(x));
    const projects = links.map((l) => data.projects.find((p) => p.id === l.project_id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
    const provider = data.parties.find((p) => p.id === service.provider_id) ?? null;
    const account = data.accounts.find((a) => a.id === service.provider_account_id) ?? null;
    const end = service.is_perpetual ? null : open?.ends_on ?? service.end_on;
    return {
      open, pays, clients, projects, provider, account, end,
      renew: renewState(service, open, pays, today),
      pin: open ? payState(open, pays, 'in', today) : null,
      pout: open ? payState(open, pays, 'out', today) : null,
      missing: missingInfo(service).map((m) => missingText(m, open?.ends_on)),
      licenses: data.licenses.filter((l) => l.service_id === id),
    };
  }, [data, service, id, today]);

  if (!data) return <p className="text-[14px] text-muted">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Veriler yüklenemedi.'} />;
  if (!service || !view) return <Empty text="Hizmet bulunamadı (silinmiş veya bağlantı hatalı olabilir)." action={<Link href={BASE} className="admin-btn">← Hizmetler</Link>} />;

  const partyName = (id2: string | null) => (id2 ? data.parties.find((p) => p.id === id2)?.name ?? null : null);
  const partyText = (party: string, clientId: string | null) => `${PARTY_LABEL[party] ?? party}${party === 'client' && partyName(clientId) ? ` (${partyName(clientId)})` : ''}`;
  const panelOk = Boolean(service.panel_url && /^https?:\/\//i.test(service.panel_url));

  const saveEdit = async (payload: Partial<Service>) => {
    const r = await saveRow('ops_services', { id: service.id, ...payload });
    if (r.error) return r.error;
    // Keep the open period in step with the dates/amounts just changed on the service.
    const open = view.open;
    let synced = '';
    if (open) {
      const patch: Record<string, unknown> = {};
      if (!sameDate(payload.end_on, service.end_on) || payload.is_perpetual !== service.is_perpetual) patch.ends_on = payload.end_on ?? null;
      if (!sameDate(payload.due_on, service.due_on)) patch.due_on = payload.due_on ?? null;
      if (!sameAmount(payload.cost_amount, service.cost_amount) || (payload.cost_currency ?? null) !== (service.cost_currency ?? null)) { patch.expected_cost = payload.cost_amount ?? null; patch.cost_currency = payload.cost_currency ?? null; }
      if (!sameAmount(payload.price_amount, service.price_amount) || (payload.price_currency ?? null) !== (service.price_currency ?? null)) { patch.expected_price = payload.price_amount ?? null; patch.price_currency = payload.price_currency ?? null; }
      if (Object.keys(patch).length) {
        const p = await saveRow('ops_periods', { id: open.id, ...patch });
        synced = p.error ? ` Açık dönem güncellenemedi: ${p.error}` : ' Açık dönem de güncellendi.';
      }
    }
    setEditing(false);
    say(`Kaydedildi.${synced}`, synced.includes('güncellenemedi') ? 'warn' : 'ok');
    await reload();
    return null;
  };

  const toggleArchive = async () => {
    if (archBusy) return;
    const to = !service.archived_at;
    if (to && !window.confirm(`“${service.name}” arşivlensin mi? Kayıt silinmez; dönem ve ödeme geçmişi korunur, listelerde ve hatırlatmalarda görünmez.`)) return;
    setArchBusy(true);
    const err = await archiveRow('ops_services', service.id, to);
    setArchBusy(false);
    if (err) { say(err, 'bad'); return; }
    say(to ? 'Arşivlendi.' : 'Arşivden çıkarıldı.');
    await reload();
  };

  const detailFacts = KIND_FIELDS[service.kind].filter((k) => service.details?.[k.key] !== undefined && service.details?.[k.key] !== '' && service.details?.[k.key] !== null);
  const detailText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Evet' : 'Hayır') : String(v));

  return (
    <div className="grid gap-5">
      <PageHead
        title={service.name}
        sub={`${KIND_LABEL[service.kind]}${view.provider ? ` · ${view.provider.name}` : ''}${view.clients.length ? ` · ${view.clients.map((c) => c.name).join(', ')}` : ''}`}
        actions={<>
          <Link href={BASE} className="admin-btn">← Hizmetler</Link>
          <button type="button" className="admin-btn" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>{editing ? 'Düzenlemeyi kapat' : 'Düzenle'}</button>
          <Link href={`${BASE}/new?copy=${service.id}`} className="admin-btn" title="Ödemeler, dönemler, belgeler ve lisanslar kopyalanmaz">Çoğalt</Link>
          <button type="button" className="admin-btn" disabled={archBusy} onClick={toggleArchive}>{service.archived_at ? 'Arşivden çıkar' : 'Arşivle'}</button>
        </>}
      />

      {service.archived_at && <Flash tone="warn" message={`Bu hizmet ${fmtDateTime(service.archived_at)} tarihinde arşivlendi. Geçmiş korunur; hatırlatma gönderilmez.`} />}
      <StatusBadges status={service.status} collection={view.pin?.state ?? null} provider={view.pout?.state ?? null} renew={view.renew} />
      {view.missing.length > 0 && <p className="text-[13px] text-yellow-200">Eksik bilgi: {view.missing.join(', ')}. <button type="button" className="underline" onClick={() => setEditing(true)}>Şimdi ekle</button></p>}

      {editing && (
        <Section title="Hizmeti düzenle">
          <ServiceForm key={service.updated_at} data={data} mode="edit" initial={service} onSubmit={(p) => saveEdit(p)} onCancel={() => setEditing(false)} />
        </Section>
      )}

      <Section title="Özet">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact k="Bitiş">
            {service.is_perpetual ? 'Süresiz' : view.end ? <span><span className="tabular-nums">{fmtDate(view.end)}</span> <span className="text-subtle">· {dueText(view.end, today)}</span></span> : service.period === 'once' ? 'Tek seferlik' : <Unknown>Bitiş tarihi bilinmiyor</Unknown>}
          </Fact>
          <Fact k="Başlangıç"><DateOr value={service.start_on} /></Fact>
          <Fact k="Sağlayıcı ödeme vadesi"><DateOr value={view.open?.due_on ?? service.due_on} /></Fact>
          <Fact k="İptal / bildirim son günü"><DateOr value={service.cancel_by} unknown="Girilmedi" /></Fact>
          <Fact k="Yenileme dönemi">{service.period ? `${PERIOD_LABEL[service.period]}${service.period === 'custom' && service.period_months ? ` (${service.period_months} ay)` : ''}` : <Unknown />}</Fact>
          <Fact k="Otomatik yenileme">{AUTO_RENEW_LABEL[service.auto_renew]}</Fact>
          <Fact k="Alış bedeli">{formatAmount(service.cost_amount, service.cost_currency)}</Fact>
          <Fact k="Satış bedeli">{formatAmount(service.price_amount, service.price_currency)}</Fact>
          <Fact k="Sağlayıcı">{view.provider ? <EntityLink href={`/admin/ops/providers?id=${view.provider.id}`}>{view.provider.name}</EntityLink> : <Unknown />}{view.account && <span className="block text-subtle">Hesap: {view.account.label}{view.account.account_ref ? ` (${view.account.account_ref})` : ''}</span>}</Fact>
          <Fact k="Panel">{panelOk ? <a href={service.panel_url ?? '#'} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:text-yoca-lime">Panele git ↗</a> : service.panel_url ? <span className="text-red-300">Geçersiz bağlantı</span> : <Unknown>Girilmedi</Unknown>}</Fact>
          <Fact k="Ekip sorumlusu">{service.team_owner || <Unknown>Atanmadı</Unknown>}</Fact>
          <Fact k="Sahip · ödeyen · yenileyen">{partyText(service.owner_party, service.owner_client_id)} · {partyText(service.payer_party, service.payer_client_id)} · {PARTY_LABEL[service.renewer_party] ?? service.renewer_party}</Fact>
          <Fact k="Müşteriler">{view.clients.length ? view.clients.map((c, i) => <span key={c.id}>{i > 0 && ', '}<EntityLink href={`/admin/ops/clients/${c.id}`}>{c.name}</EntityLink></span>) : <Unknown>Bağlı değil</Unknown>}</Fact>
          <Fact k="Projeler">{view.projects.length ? view.projects.map((p, i) => <span key={p.id}>{i > 0 && ', '}<EntityLink href={`/admin/ops/projects/${p.id}`}>{p.name}</EntityLink></span>) : <Unknown>Bağlı değil</Unknown>}</Fact>
          {detailFacts.map((k) => <Fact key={k.key} k={k.label}>{detailText(service.details[k.key])}</Fact>)}
          {service.custom_fields.map((c, i) => <Fact key={`c${i}`} k={c.label}>{c.value || <Unknown>—</Unknown>}</Fact>)}
          {service.tags.length > 0 && <Fact k="Etiketler">{service.tags.join(', ')}</Fact>}
          <Fact k="Hatırlatma günleri">{service.reminder_days?.length ? service.reminder_days.join(', ') : 'Genel ayar'}{service.cancel_reminder_days?.length ? ` · iptal: ${service.cancel_reminder_days.join(', ')}` : ''}</Fact>
        </dl>
        {service.note && <p className="whitespace-pre-wrap border-t border-line pt-2 text-[13px] text-soft">{service.note}</p>}
        <p className="text-[11px] text-subtle">Oluşturuldu {fmtDateTime(service.created_at)}{service.created_by ? ` · ${service.created_by}` : ''} · Son değişiklik {fmtDateTime(service.updated_at)}</p>
      </Section>

      <PeriodsSection service={service} data={data} clients={view.clients} today={today} say={say} reload={reload} />
      <PaymentsSection service={service} data={data} say={say} reload={reload} />
      <LinksSection service={service} data={data} say={say} reload={reload} />
      <Section title="Belgeler" id="belgeler"><Documents entity="service" entityId={service.id} /></Section>
      {service.kind === 'maintenance' && <MaintenanceSection service={service} open={view.open} logs={extra.logs} say={say} reload={reload} />}
      <TasksSection service={service} tasks={extra.tasks} say={say} reload={reload} />
      <ForwardSection service={service} end={view.end} today={today} onForward={(target, offset) => setForward({ target, offset, reminderId: null })} />
      <NotificationsSection notes={extra.notes} error={extra.error} today={today} say={say} reload={reload} onForward={(target, offset, reminderId) => setForward({ target, offset, reminderId })} />
      {forward && (
        <ForwardDialog service={service} target={forward.target} offset={forward.offset} reminderId={forward.reminderId}
          clientName={view.clients[0]?.name ?? partyName(service.owner_client_id)}
          contacts={[
            // the firm record's own e-mail and its contacts: offered as buttons, added only when clicked
            ...[...view.clients, ...data.parties.filter((p) => p.id === service.owner_client_id && !view.clients.some((c) => c.id === p.id))]
              .filter((p) => p.email).map((p) => ({ id: `party-${p.id}`, client_id: p.id, name: p.name, role: 'firma kaydı', email: p.email, phone: null, is_primary: false, note: null })),
            ...data.contacts.filter((c) => view.clients.some((p) => p.id === c.client_id) || c.client_id === service.owner_client_id),
          ]}
          documents={extra.docs}
          onClose={() => { setForward(null); void reload(); }} onSent={() => void reload()} />
      )}

      <Section title="Lisanslar" id="lisanslar" action={<Link href="/admin/ops/licenses" className={small}>Lisanslar sayfası</Link>}>
        {view.licenses.length === 0 ? <p className="text-[12px] text-subtle">Bu hizmete bağlı lisans yok.</p> : (
          <ul className="grid gap-0.5 text-[13px]">
            {view.licenses.map((l) => {
              const snap = (l.snapshot ?? {}) as Record<string, unknown>;
              return (
                <li key={l.id} className="flex flex-wrap justify-between gap-2 border-t border-line py-1.5">
                  <span>{l.label || l.license_id} <span className="text-subtle">· {l.license_id}</span>{typeof snap.status === 'string' && <span className="ms-2"><Badge>{snap.status}</Badge></span>}</span>
                  <span className="text-[12px] text-subtle">{l.last_synced_at ? `Son okuma ${fmtDateTime(l.last_synced_at)} (canlı değil)` : 'Hiç okunmadı'}{l.sync_error && <span className="block text-red-300">{l.sync_error}</span>}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-subtle">Lisansların asıl kaydı lisans sistemindedir; burada yalnızca bağlantı ve son okunan özet görünür.</p>
      </Section>

      {flash && (
        <div className="fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:right-6 sm:max-w-md">
          <Flash message={flash.message} tone={flash.tone} onClose={() => setFlash(null)} />
        </div>
      )}
    </div>
  );
}

export default function ServiceDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Yükleniyor…</p>}>
      <ServiceDetailInner id={params.id} />
    </Suspense>
  );
}
