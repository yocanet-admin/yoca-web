'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Details, Flash, PageHead, fmtDate } from '@/components/admin/ops/ui';
import { FinDocs, PaymentForm, PaymentList, SourceBadge, StateBadge, money } from '@/components/admin/fin/parts';
import { addOpsPayment, loadFinance, voidOpsPayment, type FinData } from '@/lib/fin/data';
import { buildItems } from '@/lib/fin/model';
import { dueText, istanbulDay } from '@/lib/ops/model';
import { formatAmount } from '@/lib/ops/money';
import { getAdminClient } from '@/lib/adminClient';

/**
 * Yoca — an Operasyon provider cost seen from Giderler. The record lives in
 * Operasyon (ops_periods / ops_payments); this page shows only what finance
 * needs and records / voids the provider payment in that SAME record, so there
 * is no second copy and no double total.
 */
export default function OpsCostPage() {
  const { periodId } = useParams<{ periodId: string }>();
  const [data, setData] = useState<FinData | null>(null);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const today = istanbulDay();
  const reload = useCallback(() => loadFinance().then(setData), []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { void getAdminClient()?.rpc('is_admin').then((r) => setIsAdmin(r.data === true)); }, []);

  const it = useMemo(() => (data?.ready ? buildItems({ ...data, today }).find((x) => x.source === 'ops' && x.periodId === periodId) ?? null : null), [data, periodId, today]);
  const per = data?.opsPeriods.find((p) => p.id === periodId) ?? null;

  if (!data) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Giderler yüklenemedi.'} />;
  if (!it || !per) return <Flash tone="bad" message="Operasyon dönemi bulunamadı (ya da bu hesabın erişimi yok)." />;

  return (
    <div className="grid gap-6">
      <div className="text-[13px]"><Link href="/admin/expenses?src=ops" className="text-subtle hover:text-white">← Giderler</Link></div>
      <PageHead kicker="Finans" title={per.service_name} sub={`${it.categoryText}${per.provider_name ? ` · ${per.provider_name}` : ''}`} actions={isAdmin ? <Link href={`/admin/ops/services/${per.service_id}`} className="admin-btn">Operasyon’da aç</Link> : undefined} />
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}
      <section className="admin-card grid gap-3 p-5 text-[13px]">
        <div className="flex flex-wrap items-center gap-2"><SourceBadge source="ops" /><StateBadge s={it.summary} />{per.service_archived && <span className="text-subtle">Hizmet arşivde</span>}</div>
        <p className="text-subtle">Bu sağlayıcı maliyeti Operasyon’daki hizmet kaydına aittir. Burada eklediğiniz ödeme, Operasyon’daki aynı ödeme kaydıdır (ikinci kayıt oluşmaz, toplamlarda bir kez sayılır). Müşteri, satış fiyatı ve iç notlar bu ekranda gösterilmez.</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Dönem</span>{per.starts_on ? fmtDate(per.starts_on) : '?'} → {per.ends_on ? fmtDate(per.ends_on) : '?'}</p>
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Sağlayıcıya son ödeme</span>{per.due_on ? `${fmtDate(per.due_on)} · ${dueText(per.due_on, today)}` : 'Bilinmiyor'}</p>
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Maliyet</span>{per.amount ? formatAmount(per.amount, per.currency) : 'Tutar bilinmiyor'}</p>
          <p className="grid"><span className="text-[11px] font-bold uppercase text-subtle">Ödenen / kalan</span>{money(it.summary.paid, per.currency)} / {money(it.summary.remaining, per.currency)}</p>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-[15px] font-extrabold">Sağlayıcı ödemesi</h2>
        {per.currency ? <PaymentForm ops currency={per.currency} suggested={it.summary.remaining} onSave={async (p, key) => {
          const r = await addOpsPayment(per.id, p, key);
          if (r.error) return r.error;
          setFlash({ tone: 'ok', text: 'Sağlayıcı ödemesi Operasyon kaydına işlendi.' });
          void reload();
          return null;
        }} /> : <p className="text-[13px] text-yellow-200">Bu dönemin maliyet para birimi Operasyon’da girilmemiş; ödeme kaydı için önce yöneticinin hizmette maliyeti tanımlaması gerekir.</p>}
        <PaymentList payments={it.payments} docEntity="ops_payment" onVoid={async (pid, why) => { const e = await voidOpsPayment(pid, why); if (!e) { setFlash({ tone: 'ok', text: 'Ödeme gerekçeyle iptal edildi; kayıt geçmişte duruyor.' }); void reload(); } return e; }} />
      </section>

      <Details title="Fatura ve dekontlar (finans belgeleri)" open>
        <FinDocs entity="ops_period" entityId={per.id} />
      </Details>
    </div>
  );
}
