'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flash, PageHead } from '@/components/admin/ops/ui';
import { ReceivableForm } from '@/components/admin/fin/ReceivableForm';
import { createReceivable, loadIncome, type IncomeData } from '@/lib/fin/incomeData';

/** Yoca Finans — new income / receivable (no Operasyon or customer link required). */
export default function NewIncomePage() {
  const router = useRouter();
  const [data, setData] = useState<IncomeData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void loadIncome().then(setData); }, []);
  if (!data) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Gelirler yüklenemedi.'} />;
  return (
    <div className="grid gap-6">
      <div className="text-[13px]"><Link href="/admin/finance/income" className="text-subtle hover:text-white">← Gelirler</Link></div>
      <PageHead kicker="Finans" title="Yeni gelir / alacak" sub="Operasyon’a veya müşteriye bağlamak zorunlu değildir. Operasyon’daki hizmet tahsilatlarını burada tekrar açmayın; onlar Gelirler’de kendiliğinden görünür." />
      {error && <Flash tone="bad" message={error} onClose={() => setError(null)} />}
      <ReceivableForm clients={data.clients} busy={busy} onCancel={() => router.push('/admin/finance/income')} onSubmit={async (input) => {
        setBusy(true); setError(null);
        const r = await createReceivable(input);
        setBusy(false);
        if (r.error || !r.id) { setError(r.error ?? 'Kaydedilemedi.'); return; }
        router.push(`/admin/finance/income/${r.id}`);
      }} />
    </div>
  );
}
