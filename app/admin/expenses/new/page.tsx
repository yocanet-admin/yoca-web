'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flash, PageHead } from '@/components/admin/ops/ui';
import { ExpenseForm } from '@/components/admin/fin/ExpenseForm';
import { createExpense, loadFinance, type FinData, type ExpenseInput } from '@/lib/fin/data';

/** Yoca — yeni gider (düzenli veya tek seferlik). The first period is created by the database. */
export default function NewExpensePage() {
  const router = useRouter();
  const [data, setData] = useState<FinData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void loadFinance().then(setData); }, []);

  const save = async (input: ExpenseInput) => {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await createExpense(input);
    if (r.error || !r.id) { setBusy(false); setError(r.error ?? 'Kaydedilemedi.'); return; }
    router.push(`/admin/expenses/${r.id}?created=1`);
  };

  if (!data) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Giderler yüklenemedi.'} />;
  const opsProviders = Array.from(new Set(data.opsPeriods.map((p) => p.provider_name).filter((n): n is string => Boolean(n))));
  return (
    <div className="grid max-w-4xl gap-6">
      <PageHead kicker="Finans" title="Yeni gider" sub="Düzenli giderde ilk dönem hemen, sonraki dönemler vadesi yaklaştıkça oluşur; hiçbir dönem kendiliğinden “ödendi” sayılmaz." />
      <Flash tone="bad" message={error} onClose={() => setError(null)} />
      <div className="admin-card p-5">
        <ExpenseForm parties={data.parties} opsProviders={opsProviders} busy={busy} onSubmit={(i) => void save(i)} onCancel={() => router.push('/admin/expenses')} />
      </div>
    </div>
  );
}
