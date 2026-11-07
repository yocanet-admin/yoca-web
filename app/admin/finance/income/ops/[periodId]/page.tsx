'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Details, Flash, PageHead, fmtDate } from '@/components/admin/ops/ui';
import { FinDocs, FinHistory, PaymentForm, PaymentList, SourceBadge, money } from '@/components/admin/fin/parts';
import { addOpsCollection, loadIncome, voidOpsCollection, type IncomeData } from '@/lib/fin/incomeData';
import { buildIncomeItems, incomeStateText } from '@/lib/fin/income';
import { FIN_STATE_TONE } from '@/lib/fin/model';
import { dueText, istanbulDay } from '@/lib/ops/model';
import { formatAmount } from '@/lib/ops/money';
import { getAdminClient } from '@/lib/adminClient';

/**
 * Yoca Finans — an Operasyon customer collection period seen from Gelirler.
 * The record lives in Operasyon (ops_periods / ops_payments 'in'); this page
 * shows only what finance needs and records / voids the collection in that SAME
 * record (fin_ops_collect / fin_ops_collect_void), so there is no second copy
 * and no double total. Cost, notes, login hints and contact data are not shown.
 */
export default function OpsReceivablePage() {
  const { periodId } = useParams<{ periodId: string }>();
  const [data, setData] = useState<IncomeData | null>(null);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const today = istanbulDay();
  const reload = useCallback(() => loadIncome().then(setData), []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { void getAdminClient()?.rpc('is_admin').then((r) => setIsAdmin(r.data === true)); }, []);

  const per = data?.opsReceivables.find((p) => p.id === periodId) ?? null;
  const it = useMemo(() => (data?.ready ? buildIncomeItems({ ...data, today }).find((x) => x.source === 'ops' && x.id === periodId) ?? null : null), [data, periodId, today]);

  if (!data) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Gelirler yüklenemedi.'} />;
  if (!it || !per) return <Flash tone="bad" message="Operasyon tahsilat dönemi bulunamadı (ya da bu hesabın erişimi yok)." />;
  const s = it.summary;

  return (
    <div className="grid gap-6">
      <div className="text-[13px]"><Link href="/admin/finance/income?src=ops&kapsam=tum" className="text-subtle hover:text-white">← Gelirler</Link></div>
      <PageHead kicker="Finans" title={per.service_name} sub={`${it.categoryText}${per.client_names ? ` · ${per.client_names}` : ''}`} actions={isAdmin ? <Link href={`/admin/ops/services/${per.service_id}`} className="admin-btn">Operasyon’da aç</Link> : undefined} />
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}
      <section className="admin-card grid gap-3 p-5 text-[13px]">
        <div className="flex flex-wrap items-center gap-2"><SourceBadge source="ops" income /><Badge tone={FIN_STATE_TONE[s.state]}>{incomeStateText(s)}</Badge>{per.service_archived && <span className="text-subtle">Hizmet arşivde</span>}</div>
        <p className="text-subtle">Bu tahsilat Operasyon’daki hizmet kaydına aittir (“Ödemeler ve yenilemeler”). Burada eklediğiniz tahsilat, Operasyon’daki aynı ödeme kaydıdır: ikinci kayıt oluşmaz, toplamlarda bir kez sayılır. Hizmetin yenilenmesi veya teklif/proforma hazırlanması tahsilat oluşturmaz.</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Hizmet dönemi</span>{per.starts_on ? fmtDate(per.starts_on) : '?'} → {per.ends_on ? fmtDate(per.ends_on) : '?'}</p>
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Müşteriden tahsilat vadesi</span>{per.due_on ? `${fmtDate(per.due_on)} · ${dueText(per.due_on, today)}` : 'Bilinmiyor'}</p>
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Beklenen tahsilat</span>{per.amount ? formatAmount(per.amount, per.currency) : 'Tutar bilinmiyor'}</p>
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Tahsil edilen (net) / kalan</span>{money(s.paid, per.currency)} / {s.remaining === null ? '—' : money(s.remaining, per.currency)}</p>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-[15px] font-extrabold">Müşteri tahsilatı</h2>
        {per.currency ? <PaymentForm ops income currency={per.currency} suggested={s.remaining} onSave={async (p, key) => {
          const r = await addOpsCollection(per.id, p, key);
          if (r.error) return r.error;
          setFlash({ tone: 'ok', text: 'Tahsilat Operasyon kaydına işlendi.' });
          void reload();
          return null;
        }} /> : <p className="text-[13px] text-yellow-200">Bu dönemin satış para birimi Operasyon’da girilmemiş; tahsilat kaydı için önce yöneticinin hizmette satış fiyatını tanımlaması gerekir.</p>}
        <PaymentList income payments={it.payments} docEntity="ops_collection" onVoid={async (pid, why) => { const e = await voidOpsCollection(pid, why); if (!e) { setFlash({ tone: 'ok', text: 'Tahsilat gerekçeyle iptal edildi; Operasyon’da da iptal edildi olarak görünür.' }); void reload(); } return e; }} />
      </section>

      <Details title="Fatura ve dekontlar (finans belgeleri)" open>
        <FinDocs entity="ops_receivable" entityId={per.id} />
      </Details>

      <Details title="İşlem geçmişi" hint="Bu dönemin müşteri tahsilatları ve finans belgeleri; yönetici dahil kim, ne zaman, ne yaptı.">
        <FinHistory ids={[per.id, ...it.payments.map((p) => p.id)]} refreshKey={it.payments.map((p) => `${p.id}:${p.voided_at ?? ''}`).join(',')} />
      </Details>
    </div>
  );
}
