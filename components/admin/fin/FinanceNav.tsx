import Link from 'next/link';

/** Finans sections: one row of links, the same on the three screens. */
export function FinanceNav({ active }: { active: 'overview' | 'income' | 'expenses' }) {
  const items = [['overview', '/admin/finance', 'Genel bakış'], ['income', '/admin/finance/income', 'Gelirler'], ['expenses', '/admin/expenses', 'Giderler']] as const;
  return (
    <nav aria-label="Finans bölümleri" className="-mt-2 flex flex-wrap gap-2">
      {items.map(([k, href, t]) => (
        <Link key={k} href={href} aria-current={active === k ? 'page' : undefined}
          className={`rounded-sm border px-3 py-1.5 text-[13px] font-bold transition-colors ${active === k ? 'border-yoca-lime text-yoca-lime' : 'border-line text-muted hover:border-yoca-lime hover:text-soft'}`}>{t}</Link>
      ))}
    </nav>
  );
}
