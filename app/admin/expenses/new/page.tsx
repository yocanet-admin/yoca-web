'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Flash, PageHead } from '@/components/admin/ops/ui';
import { ExpenseForm } from '@/components/admin/fin/ExpenseForm';
import { createExpense, getImportRow, loadFinance, resolveImportRow, type FinData, type ExpenseInput, type ImportRowRecord } from '@/lib/fin/data';
import type { Expense } from '@/lib/fin/model';

/** Yoca — yeni gider (düzenli veya tek seferlik). The first period is created by the database. */
function NewExpense() {
  const router = useRouter();
  const importId = useSearchParams().get('import');
  const [row, setRow] = useState<ImportRowRecord | null | undefined>(importId ? undefined : null);
  useEffect(() => { if (importId) void getImportRow(importId).then(setRow); }, [importId]);
  const [data, setData] = useState<FinData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void loadFinance().then(setData); }, []);

  const save = async (input: ExpenseInput) => {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await createExpense(input);
    if (r.error || !r.id) { setBusy(false); setError(r.error ?? 'Kaydedilemedi.'); return; }
    if (row) await resolveImportRow(row.id, 'Gider olarak açıldı', r.id);
    router.push(`/admin/expenses/${r.id}?created=1`);
  };

  if (!data || row === undefined) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Giderler yüklenemedi.'} />;
  const opsProviders = Array.from(new Set(data.opsPeriods.map((p) => p.provider_name).filter((n): n is string => Boolean(n))));
  return (
    <div className="grid max-w-4xl gap-6">
      <PageHead kicker="Finans" title="Yeni gider" sub="Düzenli giderde ilk dönem hemen, sonraki dönemler vadesi yaklaştıkça oluşur; hiçbir dönem kendiliğinden “ödendi” sayılmaz." />
      <Flash tone="bad" message={error} onClose={() => setError(null)} />
      <div className="admin-card p-5">
        {row && <p className="mb-4 border border-sky-400/40 p-2 text-[12px] text-sky-100">Excel aktarımından: {row.file_name} · {row.sheet} · satır {row.source_row}. Eksik bilgiler (tutar, vade, yöntem) uydurulmadı; bildiklerinizi girin. Tutar bilinmiyorsa boş bırakın, dönem “Tutar bekleniyor” açılır.</p>}
        <ExpenseForm prefill={row ? prefillOf(row) : undefined} parties={data.parties} opsProviders={opsProviders} busy={busy} onSubmit={(i) => void save(i)} onCancel={() => router.push('/admin/expenses')} />
      </div>
    </div>
  );
}

/** Values the imported row really had — nothing invented (no due date or amount when the source had none). */
function prefillOf(row: ImportRowRecord): Partial<Expense> {
  const plan = row.plan as { name?: string; category?: string; amount?: string | null; due?: string | null; method?: string | null; note?: string | null; recurrence?: string | null; variable?: boolean };
  const variable = Boolean(plan.variable);
  return {
    title: plan.name ?? String((row.payload as { name?: string }).name ?? ''),
    category: (plan.category ?? 'other') as Expense['category'],
    kind: plan.recurrence === 'monthly' || variable ? 'recurring' : 'once',
    recurrence: plan.recurrence === 'monthly' || variable ? 'monthly' : null,
    amount: variable ? null : plan.amount ?? null,
    first_due_on: plan.due ?? '',
    currency: 'TRY',
    pay_method: (plan.method ?? null) as Expense['pay_method'],
    note: plan.note ?? null,
  };
}

export default function NewExpensePage() {
  return <Suspense fallback={<p className="text-[14px] text-subtle">Yükleniyor…</p>}><NewExpense /></Suspense>;
}
