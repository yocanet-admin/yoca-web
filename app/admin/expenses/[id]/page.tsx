'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Badge, Details, Flash, PageHead, field, fmtDate, fmtDateTime, small } from '@/components/admin/ops/ui';
import { ExpenseForm } from '@/components/admin/fin/ExpenseForm';
import { FinDocs, FinHistory, PaymentForm, PaymentList, StateBadge, money } from '@/components/admin/fin/parts';
import { addPayment, archiveExpense, cancelPeriod, clearReview, importRowsOfExpense, loadFinance, updateExpense, updatePeriod, voidPayment, type ExpenseInput, type FinData, type ImportRowRecord } from '@/lib/fin/data';
import { CATEGORY_LABEL, METHOD_LABEL, RECURRENCE_LABEL, buildItems, type Item } from '@/lib/fin/model';
import { dueText, istanbulDay } from '@/lib/ops/model';
import { formatAmount, minorToDb, parseAmount } from '@/lib/ops/money';

/**
 * Yoca — gider ayrıntısı: tanım, dönemler (her biri kendi tutarıyla), ödeme
 * geçmişi (iptaller görünür kalır), belgeler. Payments are never edited or
 * deleted; a wrong one is voided with a reason and a new one is added.
 */

function ExpenseDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [data, setData] = useState<FinData | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(params.get('created') ? { tone: 'ok', text: 'Gider kaydedildi; ilk dönemi oluşturuldu.' } : null);
  const [openPeriod, setOpenPeriod] = useState<string | null>(params.get('period'));
  const today = istanbulDay();
  const reload = useCallback(() => loadFinance().then(setData), []);
  useEffect(() => { void reload(); }, [reload]);
  const [sources, setSources] = useState<ImportRowRecord[]>([]);
  useEffect(() => { void importRowsOfExpense(id).then(setSources).catch(() => setSources([])); }, [id]);

  const expense = data?.expenses.find((e) => e.id === id) ?? null;
  const items = useMemo(() => (data?.ready ? buildItems({ ...data, today }).filter((it) => it.expenseId === id) : []), [data, id, today]);
  const ordered = useMemo(() => {
    const open = items.filter((it) => !['paid', 'over', 'cancelled'].includes(it.summary.state)).sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''));
    const done = items.filter((it) => ['paid', 'over', 'cancelled'].includes(it.summary.state)).sort((a, b) => (b.dueOn ?? '').localeCompare(a.dueOn ?? ''));
    return [...open, ...done];
  }, [items]);
  useEffect(() => { if (!openPeriod && ordered[0]) setOpenPeriod(ordered[0].periodId); }, [ordered, openPeriod]);

  if (!data) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Giderler yüklenemedi.'} />;
  if (!expense) return <Flash tone="bad" message="Gider bulunamadı (ya da bu hesabın erişimi yok)." />;

  const provider = (expense.provider_id ? data.parties.find((p) => p.id === expense.provider_id)?.name : null) ?? expense.vendor_name;
  const opsProviders = Array.from(new Set(data.opsPeriods.map((p) => p.provider_name).filter((n): n is string => Boolean(n))));
  const locked = data.periods.some((p) => p.expense_id === expense.id);

  const save = async (input: ExpenseInput) => {
    setBusy(true);
    const patch: Partial<ExpenseInput> = { ...input };
    if (locked) { delete patch.kind; delete patch.recurrence; delete patch.first_due_on; delete patch.currency; }
    const err = await updateExpense(expense.id, patch);
    setBusy(false);
    if (err) { setFlash({ tone: 'bad', text: err }); return; }
    setEditing(false);
    setFlash({ tone: 'ok', text: 'Gider güncellendi. Oluşmuş dönemlerin tutarı değişmedi.' });
    void reload();
  };

  return (
    <div className="grid gap-6">
      <div className="text-[13px]"><Link href="/admin/expenses" className="text-subtle hover:text-white">← Giderler</Link></div>
      <PageHead kicker="Finans"
        title={expense.title}
        sub={`${CATEGORY_LABEL[expense.category]} · ${expense.kind === 'recurring' ? `${RECURRENCE_LABEL[expense.recurrence ?? 'monthly']} gider` : 'Tek seferlik gider'}${provider ? ` · ${provider}` : ''}`}
        actions={<>
          <button type="button" className="admin-btn" onClick={() => setEditing(!editing)}>{editing ? 'Düzenlemeyi kapat' : 'Düzenle'}</button>
          <button type="button" className="admin-btn" disabled={busy} onClick={async () => { const e = await archiveExpense(expense.id, !expense.archived_at); if (e) setFlash({ tone: 'bad', text: e }); else { setFlash({ tone: 'ok', text: expense.archived_at ? 'Arşivden çıkarıldı.' : 'Arşivlendi: yeni dönem oluşmaz; geçmiş korunur.' }); void reload(); } }}>{expense.archived_at ? 'Arşivden çıkar' : 'Arşivle'}</button>
        </>}
      />
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}
      {sources.map((src) => <p key={src.id} className="text-[12px] text-subtle">Kaynak: Excel aktarımı — {src.file_name} · {src.sheet} · satır {src.source_row} · {src.created_by ?? '—'} · {fmtDate(src.created_at)}{src.changed_payload ? ' · dosyanın sonraki sürümünde bu satır değişmiş (uygulanmadı; Aktarım sekmesinde)' : ''}</p>)}

      {editing ? (
        <div className="admin-card p-5">
          <ExpenseForm initial={expense} parties={data.parties} opsProviders={opsProviders} locked={locked} busy={busy} onSubmit={(i) => void save(i)} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <section className="admin-card grid gap-2 p-5 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
          <Field k="Tutar (yeni dönemler)" v={expense.amount ? formatAmount(expense.amount, expense.currency) : 'Bilinmiyor'} />
          <Field k={expense.kind === 'recurring' ? 'İlk vade' : 'Vade'} v={fmtDate(expense.first_due_on)} />
          {expense.kind === 'recurring' && <Field k="Bitiş" v={expense.ends_on ? fmtDate(expense.ends_on) : 'Yok (devam ediyor)'} />}
          <Field k="Sağlayıcı / firma" v={provider ?? '—'} />
          <Field k="Sorumlu" v={expense.owner_email ?? '—'} />
          <Field k="Ödeme hesabı / yöntemi" v={[expense.pay_account, expense.pay_method ? METHOD_LABEL[expense.pay_method] : null].filter(Boolean).join(' · ') || '—'} />
          {expense.auto_debit && <Field k="Otomatik talimat" v="Var — yine de ödeme kaydı girilene kadar “Bekliyor”" />}
          <Field k="Kaydeden" v={`${expense.created_by ?? '—'} · ${fmtDateTime(expense.created_at)}`} />
          {expense.archived_at && <Field k="Durum" v={`Arşivde (${fmtDate(expense.archived_at)})`} />}
          {expense.note && <p className="text-subtle sm:col-span-2 lg:col-span-3">{expense.note}</p>}
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="text-[15px] font-extrabold">Dönemler</h2>
        {expense.kind === 'recurring' && <p className="-mt-2 text-[12px] text-subtle">Sonraki dönem, vadesine 45 gün kala kendiliğinden oluşur (yeni tutarla). Aynı dönem iki kez oluşmaz; yeni dönem ödeme kaydı girilene kadar “Bekliyor”dur.</p>}
        {ordered.map((it) => (
          <PeriodCard key={it.periodId} it={it} data={data} today={today} open={openPeriod === it.periodId} onToggle={() => setOpenPeriod(openPeriod === it.periodId ? null : it.periodId)}
            onDone={(text, tone = 'ok') => { setFlash({ tone, text }); void reload(); }} />
        ))}
      </section>

      <Details title="Gider belgeleri (sözleşme, fatura vb.)" open>
        <FinDocs entity="expense" entityId={expense.id} />
      </Details>

      <Details title="İşlem geçmişi" hint="Bu gider, dönemleri, ödemeleri ve belgeleri; kim, ne zaman, ne yaptı. Değiştirilemez.">
        <FinHistory ids={[expense.id, ...items.map((it) => it.periodId), ...items.flatMap((it) => it.payments.map((p) => p.id))]} refreshKey={[...data.payments.map((p) => `${p.id}:${p.voided_at ?? ''}`), ...data.periods.map((p) => `${p.id}:${p.status}:${p.amount}`), expense.updated_at].join(',')} />
      </Details>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return <p className="grid"><span className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">{k}</span><span>{v}</span></p>;
}

function PeriodCard({ it, data, today, open, onToggle, onDone }: { it: Item; data: FinData; today: string; open: boolean; onToggle: () => void; onDone: (text: string, tone?: 'ok' | 'bad') => void }) {
  const per = data.periods.find((p) => p.id === it.periodId)!;
  const valid = it.payments.some((p) => !p.voided_at);
  const [mode, setMode] = useState<'none' | 'edit' | 'cancel'>('none');
  const [amount, setAmount] = useState(per.amount ? per.amount.replace('.', ',') : '');
  const [due, setDue] = useState(per.due_on);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const cancelled = per.status === 'cancelled';
  return (
    <div id={`period-${per.id}`} className={`admin-card grid gap-3 p-4 ${open ? 'ring-1 ring-yoca-lime/40' : ''}`}>
      <button type="button" className="flex flex-wrap items-center gap-3 text-left" onClick={onToggle} aria-expanded={open}>
        <strong className="text-[14px]">{it.periodText ?? fmtDate(per.due_on)}</strong>
        <span className="text-[13px] text-subtle">Vade {fmtDate(per.due_on)}{!cancelled && !['paid', 'over'].includes(it.summary.state) ? ` · ${dueText(per.due_on, today)}` : ''}</span>
        <span className="tabular-nums text-[13px]">{per.amount ? formatAmount(per.amount, per.currency) : 'Tutar bekleniyor'}</span>
        <StateBadge s={it.summary} />
        <span className="ms-auto text-[12px] text-subtle">Ödenen {money(it.summary.paid, per.currency)} · Kalan {money(it.summary.remaining, per.currency)}</span>
      </button>
      {open && (
        <div className="grid gap-4">
          {cancelled && <p className="text-[13px] text-subtle">İptal edildi: {per.cancel_reason} · {per.cancelled_by} · {fmtDateTime(per.cancelled_at)}</p>}
          {per.review_note && !cancelled && (
            <div className="flex flex-wrap items-center gap-2 border border-yellow-400/40 p-2 text-[12px] text-yellow-100">
              <span>İnceleme bekliyor: {per.review_note}</span>
              <button type="button" className={small} onClick={async () => { const e = await clearReview(per.id); if (e) setErr(e); else onDone('İnceleme notu kaldırıldı; dönem normal durumuna döndü.'); }}>İncelemeyi kapat</button>
            </div>
          )}
          {!cancelled && <PaymentForm currency={per.currency} suggested={it.summary.remaining} defaultAccount={data.expenses.find((e) => e.id === per.expense_id)?.pay_account ?? ''} defaultMethod={data.expenses.find((e) => e.id === per.expense_id)?.pay_method ?? ''} onSave={async (p, key) => {
            const r = await addPayment(per.id, p, key);
            if (r.error) return r.error;
            onDone(r.existing ? 'Bu ödeme zaten kaydedilmişti; ikinci kayıt oluşturulmadı.' : 'Ödeme kaydı eklendi.');
            return null;
          }} />}
          <div className="grid gap-1">
            <h3 className="text-[13px] font-bold text-muted">Ödeme geçmişi</h3>
            <PaymentList payments={it.payments} docEntity="payment" onVoid={async (pid, why) => { const e = await voidPayment(pid, why); if (!e) onDone('Ödeme kaydı gerekçeyle iptal edildi; kayıt geçmişte duruyor.'); return e; }} />
          </div>
          {!cancelled && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={small} disabled={valid} title={valid ? 'Geçerli ödemesi olan dönemin tutarı/vadesi değiştirilemez; düzeltme kaydı ekleyin.' : undefined} onClick={() => setMode(mode === 'edit' ? 'none' : 'edit')}>Tutar / vade düzelt</button>
              <button type="button" className={small} disabled={valid} title={valid ? 'Önce ödemeleri gerekçeyle iptal edin.' : undefined} onClick={() => setMode(mode === 'cancel' ? 'none' : 'cancel')}>Dönemi iptal et</button>
              {valid && <span className="text-[12px] text-subtle">Ödemesi olan dönemde tutar değişmez; fark için “Düzeltme” kaydı ekleyin.</span>}
            </div>
          )}
          {mode === 'edit' && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[12px] text-muted">Tutar ({per.currency})<input className={field} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <label className="grid gap-1 text-[12px] text-muted">Vade<input type="date" className={field} value={due} onChange={(e) => setDue(e.target.value)} /></label>
              <button type="button" className="admin-btn" onClick={async () => {
                const m = parseAmount(amount);
                if (m === undefined || (m !== null && m <= BigInt(0))) { setErr('Tutar geçersiz.'); return; }
                const e = await updatePeriod(per.id, { amount: m === null ? null : minorToDb(m), due_on: due });
                if (e) setErr(e); else { setMode('none'); onDone('Dönem düzeltildi (yalnızca bu dönem).'); }
              }}>Kaydet</button>
            </div>
          )}
          {mode === 'cancel' && (
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${field} max-w-md`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="İptal gerekçesi (zorunlu), ör. bu ay fatura gelmedi" maxLength={300} />
              <button type="button" className="admin-btn" disabled={reason.trim().length < 3} onClick={async () => { const e = await cancelPeriod(per.id, reason.trim()); if (e) setErr(e); else { setMode('none'); onDone('Dönem gerekçeyle iptal edildi; kayıt korunuyor.'); } }}>İptali kaydet</button>
            </div>
          )}
          {err && <p className="text-[12px] text-red-300">{err}</p>}
          <Details title="Dönem belgeleri (fatura)"><FinDocs entity="period" entityId={per.id} /></Details>
          <p className="text-[11px] text-subtle">Dönem oluşturan: {per.created_by ?? '—'} · {fmtDateTime(per.created_at)}{per.status === 'open' && per.amount ? '' : ''} {it.payments.some((p) => p.voided_at) && <Badge>İptal edilmiş kayıt var</Badge>}</p>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="text-[14px] text-subtle">Yükleniyor…</p>}><ExpenseDetail /></Suspense>;
}
