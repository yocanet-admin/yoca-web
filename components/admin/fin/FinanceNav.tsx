import Link from 'next/link';

/** Finans sections: one row of links, the same on the three screens. */
export function FinanceNav({ active }: { active: 'overview' | 'income' | 'expenses' }) {
  const items = [['overview', '/admin/finance', 'Genel bakış'], ['income', '/admin/finance/income', 'Gelirler'], ['expenses', '/admin/expenses', 'Giderler']] as const;
  return (
    <nav aria-label="Finans bölümleri" className="admin-tabs">
      {items.map(([k, href, t]) => (
        <Link key={k} href={href} aria-current={active === k ? 'page' : undefined} className="admin-tab">{t}</Link>
      ))}
    </nav>
  );
}
