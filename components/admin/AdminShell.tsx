'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/adminClient';
import AdminPrivacyNotice from '@/components/admin/AdminPrivacyNotice';
import { clearDocBackups } from '@/lib/documents/backup';
import { groupOfPath, navStorageKey, openCurrent, parseOpenGroups, resolveOpenGroups, toggleGroup, type OpenGroups } from '@/lib/admin/navState';

/**
 * Yoca — admin shell (Client Component).
 * Handles Supabase Auth (email + password), renders the login screen when
 * signed out and the sidebar + content layout when signed in.
 *
 * Roles (v25, /api/admin/me): an admin sees every section; a finance user
 * ("Finans sorumlusu") sees only Finans (Genel bakış, Gelirler, Giderler). The menu is not the protection:
 * the database (RLS: is_admin() / can_finance()) and the admin API routes
 * (requireAdmin) refuse a finance user everywhere else.
 *
 * Menu: "Kokpit" (/admin) stays visible above the groups (Genel, Operasyon,
 * Finans, Site içeriği, Sistem); every group folds open/closed from its
 * title. First visit: only the current page's group is open; later the user's
 * own choices come back (this browser, per user). See lib/admin/navState.ts.
 */

const NAV_GROUPS: Array<{ title: string; items: Array<{ href: string; label: string; icon: string }> }> = [
  {
    // "Genel": the cockpit's own pages. Its first item (/admin, "Kokpit") is the
    // always-visible home link above the groups, not repeated inside the group.
    title: 'Genel',
    items: [
      { href: '/admin', label: 'Kokpit', icon: '▦' },
      { href: '/admin/submissions', label: 'Leadler', icon: '✉' },
      { href: '/admin/clients', label: 'CRM · fırsatlar', icon: '◎' },
      { href: '/admin/traffic', label: 'Trafik', icon: '↗' },
      { href: '/admin/sites', label: 'Siteler', icon: '◍' },
    ],
  },
  {
    title: 'Operasyon',
    items: [
      { href: '/admin/ops', label: 'Genel bakış', icon: '◈' },
      { href: '/admin/ops/clients', label: 'Müşteriler ve firmalar', icon: '◎' },
      { href: '/admin/ops/services', label: 'Hizmetler ve varlıklar', icon: '▤' },
      { href: '/admin/ops/finance', label: 'Ödemeler ve yenilemeler', icon: '₺' },
      { href: '/admin/documents', label: 'Teklifler ve Belgeler', icon: '❐' },
      { href: '/admin/ops/providers', label: 'Sağlayıcılar', icon: '⌂' },
      { href: '/admin/ops/licenses', label: 'Lisanslar', icon: '⚿' },
      { href: '/admin/ops/settings', label: 'Operasyon ayarları', icon: '⚙' },
    ],
  },
  {
    title: 'Finans',
    items: [
      { href: '/admin/finance', label: 'Genel bakış', icon: '≡' },
      { href: '/admin/finance/income', label: 'Gelirler', icon: '⊕' },
      { href: '/admin/expenses', label: 'Giderler', icon: '⊖' },
    ],
  },
  {
    title: 'Site içeriği',
    items: [
      { href: '/admin/sections', label: 'Bölümler', icon: '◧' },
      { href: '/admin/menus', label: 'Menüler', icon: '≡' },
      { href: '/admin/content', label: 'Metinler', icon: '¶' },
      { href: '/admin/work', label: 'Work / Projeler', icon: '▣' },
      { href: '/admin/insights', label: 'İçerik / Insights', icon: '✎' },
      { href: '/admin/newsletter', label: 'Bülten', icon: '❏' },
      { href: '/admin/team', label: 'Ekip', icon: '◉' },
      { href: '/admin/signature', label: 'İmza', icon: '✦' },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { href: '/admin/company', label: 'Şirket bilgileri', icon: '§' },
      { href: '/admin/activity', label: 'İşlem geçmişi', icon: '↺' },
      { href: '/admin/settings', label: 'Ayarlar', icon: '⚙' },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
// Always-visible home link (admin only); the rest of its group folds like the others.
const HOME_ITEM = NAV_ITEMS[0];
const ADMIN_GROUPS = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => item.href !== HOME_ITEM.href) })).filter(
  (group) => group.items.length > 0,
);
// Finance user: the Finans section only (Genel bakış, Gelirler, Giderler).
const FINANCE_HOME = '/admin/finance';
const FINANCE_ROOTS = ['/admin/finance', '/admin/expenses'];
const FINANCE_GROUPS = NAV_GROUPS.filter((group) => group.title === 'Finans');
const financePath = (pathname: string) => FINANCE_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));

// Section roots that have their own sub-pages in the menu match exactly.
const EXACT = new Set(['/admin', '/admin/ops', '/admin/finance']);
const isActive = (href: string, pathname: string) => (EXACT.has(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

const NOT_ALLOWED = 'Bu hesabın yönetim paneline erişim izni yok. Yetkili bir hesapla giriş yapın.';
const CHECK_FAILED = 'Yönetici kontrolü yapılamadı (veritabanındaki is_admin() fonksiyonu yok ya da erişilemiyor). Güvenlik için panel açılmadı.';

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getAdminClient();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Optional ADMIN_EMAILS allowlist, checked on the server (the list itself is never sent here).
  const [access, setAccess] = useState<{ userId: string; allowed: boolean; role: 'admin' | 'finance' | null } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const userId = session?.user.id ?? null;
  const token = session?.access_token ?? null;

  useEffect(() => {
    if (!userId || !token || !supabase) return;
    if (access?.userId === userId) return;
    let cancelled = false;
    (async () => {
      // A network error keeps the shell open: it is only the UI layer — the API routes
      // and the database policies (v12) enforce the same admin rule on every request.
      let allowed = true;
      let reason: string | undefined;
      let role: 'admin' | 'finance' | null = null;
      try {
        const response = await fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const body = (await response.json().catch(() => null)) as { ok?: boolean; allowed?: boolean; role?: string; reason?: string; warnings?: string[] } | null;
        if (!cancelled) setWarnings(Array.isArray(body?.warnings) ? body.warnings : []);
        if (body?.role === 'admin' || body?.role === 'finance') role = body.role;
        if (response.ok && body?.ok && body.allowed === false) {
          allowed = false;
          reason = body.reason;
        }
      } catch {
        /* network error: see above */
      }
      if (cancelled) return;
      setAccess({ userId, allowed, role });
      if (!allowed) {
        setError(reason === 'check_failed' ? CHECK_FAILED : NOT_ALLOWED);
        await supabase.auth.signOut();
        setAccess(null); // a later sign-in is checked again
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, token, supabase, access?.userId]);

  // A finance user outside Finans goes to the Finans overview (the data is closed to them anyway).
  const isFinance = access?.role === 'finance';
  useEffect(() => {
    if (isFinance && !financePath(pathname)) router.replace(FINANCE_HOME);
  }, [isFinance, pathname, router]);

  // Menu groups: which are open (per user, this browser).
  const groups = isFinance ? FINANCE_GROUPS : ADMIN_GROUPS;
  const groupTitles = groups.map((group) => group.title);
  const titlesKey = groupTitles.join('|');
  const currentGroup = groupOfPath(groups, pathname, isActive);
  const navKey = userId && access?.userId === userId ? navStorageKey(userId) : null;
  const [nav, setNav] = useState<{ key: string | null; open: OpenGroups }>({ key: null, open: {} });
  useEffect(() => {
    if (!navKey) return;
    let stored: OpenGroups | null = null;
    try {
      stored = parseOpenGroups(window.localStorage.getItem(navKey));
    } catch {
      /* storage blocked: first-visit behaviour */
    }
    setNav({ key: navKey, open: resolveOpenGroups(titlesKey.split('|'), stored, currentGroup) });
    // currentGroup is applied by the navigation effect below afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey, titlesKey]);
  useEffect(() => {
    setNav((prev) => (prev.key ? { ...prev, open: openCurrent(prev.open, currentGroup) } : prev));
  }, [pathname, currentGroup]);
  useEffect(() => {
    if (!nav.key || nav.key !== navKey) return;
    try {
      window.localStorage.setItem(nav.key, JSON.stringify(nav.open));
    } catch {
      /* storage blocked: the menu still works for this visit */
    }
  }, [nav, navKey]);
  const openGroups = nav.key === navKey ? nav.open : resolveOpenGroups(groupTitles, null, currentGroup);
  const toggle = (title: string) => setNav((prev) => ({ key: prev.key, open: toggleGroup(prev.key === navKey ? prev.open : openGroups, title) }));

  // The mobile menu closes on navigation and with Escape.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    // Unsaved-document backups in this browser belong to one user: other users'
    // entries are removed when someone is signed in, all of them on sign-out.
    const scopeBackups = (s: Session | null) => clearDocBackups(s?.user.id);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) scopeBackups(data.session);
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') clearDocBackups();
      else if (newSession) scopeBackups(newSession);
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setSigningIn(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError('Giriş başarısız. E-posta veya şifre hatalı.');
    }
    setSigningIn(false);
  };

  const handleLogout = async () => {
    if (!supabase) return;
    setMenuOpen(false);
    clearDocBackups();
    await supabase.auth.signOut();
  };

  // ── Missing configuration ────────────────────────────────────
  if (!supabase) {
    return (
      <div className="relative z-[7] flex min-h-screen items-center justify-center p-6">
        <div className="glass max-w-md rounded-md p-8 text-center">
          <h1 className="text-xl font-extrabold">Yapılandırma eksik</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            Supabase ortam değişkenleri tanımlı değil. Vercel&apos;de
            <code className="mx-1 rounded-sm bg-surface px-1.5 py-0.5 text-[12px] text-yoca-lime">
              NEXT_PUBLIC_SUPABASE_URL
            </code>
            ve
            <code className="mx-1 rounded-sm bg-surface px-1.5 py-0.5 text-[12px] text-yoca-lime">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>
            değerlerini ekleyin.
          </p>
        </div>
      </div>
    );
  }

  // ── Loading (session, then the allowlist check) ─────────────
  const checkingAccess = Boolean(session) && access?.userId !== session?.user.id;
  if (loading || checkingAccess || (session && access && !access.allowed) || (isFinance && !financePath(pathname))) {
    return (
      <div className="relative z-[7] flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-yoca-lime" />
      </div>
    );
  }

  // ── Login screen ─────────────────────────────────────────────
  if (!session) {
    return (
      <div className="relative z-[7] flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <img
            src="/brand/yoca-logo-primary.svg"
            alt="Yoca"
            width={148}
            height={37}
            className="mx-auto h-9 w-auto"
          />
          <form onSubmit={handleLogin} className="glass mt-8 grid gap-4 rounded-md p-7">
            <h1 className="text-lg font-extrabold">Yönetim Paneli</h1>
            <label className="grid gap-1.5 text-[13px] font-semibold text-muted">
              E-posta
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="admin-input"
              />
            </label>
            <label className="grid gap-1.5 text-[13px] font-semibold text-muted">
              Şifre
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="admin-input"
              />
            </label>
            {error && (
              <p role="alert" className="text-[13px] font-semibold text-red-400">
                {error}
              </p>
            )}
            <button type="submit" disabled={signingIn} className="btn-primary w-full">
              {signingIn ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </button>
            <p className="text-[12px] leading-relaxed text-subtle">
              Kullanıcılar Supabase panelindeki <strong>Authentication → Users</strong> ekranından
              tanımlanır.
            </p>
          </form>
          <AdminPrivacyNotice />
        </div>
      </div>
    );
  }

  // ── Authenticated layout ─────────────────────────────────────
  const home = isFinance ? FINANCE_HOME : '/admin';
  const current = NAV_ITEMS.find((item) => isActive(item.href, pathname));

  const linkClass = (active: boolean, variant: 'sidebar' | 'drawer') =>
    `flex items-center gap-2.5 whitespace-nowrap rounded-sm px-3 text-[14px] font-semibold motion-safe:transition-colors ${variant === 'drawer' ? 'py-2.5' : 'py-2'} ${
      active ? 'bg-yoca-lime text-black' : 'text-muted hover:bg-surface hover:text-white'
    }`;

  const navLink = (item: (typeof NAV_ITEMS)[number], variant: 'sidebar' | 'drawer') => {
    const active = isActive(item.href, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        // The drawer also closes when the current page is chosen again (no navigation).
        onClick={variant === 'drawer' ? () => setMenuOpen(false) : undefined}
        className={linkClass(active, variant)}
      >
        <span aria-hidden="true" className="text-[13px]">
          {item.icon}
        </span>
        {item.label}
      </Link>
    );
  };

  const navLinks = (variant: 'sidebar' | 'drawer') => (
    <nav aria-label="Admin" className="grid gap-3">
      {!isFinance && <div className="grid">{navLink(HOME_ITEM, variant)}</div>}
      {groups.map((group) => {
        const open = openGroups[group.title] === true;
        const listId = `admin-nav-${variant}-${group.title.toLocaleLowerCase('tr').replace(/[^a-z0-9]+/g, '-')}`;
        const hidesCurrent = !open && currentGroup === group.title;
        return (
          <div key={group.title} className="grid gap-1">
            <button
              type="button"
              onClick={() => toggle(group.title)}
              aria-expanded={open}
              aria-controls={listId}
              className={`flex w-full items-center gap-2 rounded-sm px-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] motion-safe:transition-colors ${
                variant === 'drawer' ? 'min-h-11 py-2.5' : 'min-h-9 py-2'
              } ${hidesCurrent ? 'text-soft' : 'text-subtle'} hover:bg-surface hover:text-white`}
            >
              <span lang="tr" className="min-w-0 flex-1 truncate">{group.title}</span>
              {hidesCurrent && (
                <>
                  <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-yoca-lime" />
                  <span className="sr-only">(geçerli sayfa bu grupta)</span>
                </>
              )}
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className={`h-3.5 w-3.5 flex-none motion-safe:transition-transform ${open ? 'rotate-180' : ''}`}
              >
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* `hidden` alone would lose to the grid class: hide with the class as well */}
            <div id={listId} hidden={!open} className={open ? 'grid gap-1' : 'hidden'}>
              {group.items.map((item) => navLink(item, variant))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const accountBlock = (
    <div className="grid gap-2">
      <p className="truncate text-[12px] text-subtle">{session.user.email}{isFinance ? ' · Finans sorumlusu' : ''}</p>
      <div className="flex gap-2">
        <Link
          href="/"
          className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-bold text-muted transition-colors hover:text-white"
        >
          Siteye Dön
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-bold text-muted transition-colors hover:border-red-400 hover:text-red-400"
        >
          Çıkış
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative z-[7] flex min-h-screen max-lg:flex-col">
      {/* Mobile / tablet: compact top bar + slide-down menu */}
      <div className="sticky top-0 z-40 lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-line bg-surface-deep/95 px-4 backdrop-blur">
          <Link href={home} className="flex-none" aria-label={isFinance ? 'Finans' : 'Kokpit'}>
            <img src="/brand/yoca-logo-primary.svg" alt="Yoca" width={104} height={26} className="h-6 w-auto" />
          </Link>
          <span className="min-w-0 flex-1 truncate text-center text-[13px] font-bold text-soft">{current?.label ?? 'Yönetim'}</span>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-menu"
            className="flex-none rounded-sm border border-line px-3 py-1.5 text-[13px] font-bold text-muted transition-colors hover:text-white"
          >
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span> {menuOpen ? 'Kapat' : 'Menü'}
          </button>
        </div>
        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Menüyü kapat"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-x-0 bottom-0 top-14 z-0 cursor-default bg-black/60"
            />
            <div
              id="admin-mobile-menu"
              className="absolute inset-x-0 top-full z-10 grid max-h-[calc(100dvh-3.5rem)] gap-6 overflow-y-auto border-b border-line bg-surface-deep p-5 shadow-2xl"
            >
              {navLinks('drawer')}
              <div className="border-t border-line pt-4">{accountBlock}</div>
            </div>
          </>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-none flex-col border-r border-line bg-surface-deep/90 p-5 lg:flex">
        <Link href={home} className="mb-6 block flex-none">
          <img src="/brand/yoca-logo-primary.svg" alt="Yoca" width={120} height={30} className="h-7 w-auto" />
        </Link>
        {navLinks('sidebar')}
        <div className="mt-auto pt-6">{accountBlock}</div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-10">
        {warnings.length > 0 && (
          <div role="alert" className="mb-6 grid gap-2 rounded-sm border border-red-400/60 bg-red-500/10 p-4 text-[14px] leading-relaxed text-red-200">
            <p className="font-bold text-red-300">Yapılandırma hatası</p>
            {warnings.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        )}
        {children}
        <AdminPrivacyNotice />
      </main>
    </div>
  );
}
