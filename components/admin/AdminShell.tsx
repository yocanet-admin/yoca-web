'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/adminClient';
import AdminPrivacyNotice from '@/components/admin/AdminPrivacyNotice';
import { clearDocBackups } from '@/lib/documents/backup';
import { groupOfPath, navStorageKey, openCurrent, parseOpenGroups, patchOpenGroups, resolveOpenGroups, toggleGroup, type OpenGroups } from '@/lib/admin/navState';
import t from '@/components/admin/tangram/tangram.module.css';
import { PanelRoleContext } from '@/lib/admin/roleContext';
import { canOpen, isPanelRole, isPublicAdminPath, ROLE_GROUPS, ROLE_HOME, ROLE_LABEL, visibleHref, type PanelRole } from '@/lib/admin/roles';

/**
 * Yoca — admin shell (Client Component).
 * Handles Supabase Auth (email + password), renders the login screen when
 * signed out and the sidebar + content layout when signed in.
 *
 * Roles (/api/admin/me, lib/admin/roles.ts): an admin sees every section; a
 * finance user ("Finans sorumlusu") only Finans; a content editor (v30) only
 * Site içeriği (Bölümler, Menüler, Metinler, Work, Insights, Ekip). A page
 * outside the role is never rendered (redirect to the role's home). The menu is
 * not the protection: the database (RLS: is_admin() / can_finance() /
 * can_content()) and the API routes (requireAdmin / requireRole) refuse
 * everything else on every request.
 * The role is checked again on focus, every minute and on navigation: a role
 * change applies to an open panel, and a disabled account is signed out.
 * /admin/davet (invite: set your own password) renders without a session.
 *
 * Menu: "Kokpit" (/admin) stays visible above the groups (Genel, Operasyon,
 * Finans, Site içeriği, Sistem); every group folds open/closed from its
 * title. First visit: only the current page's group is open; later the user's
 * own choices come back (this browser, per user). See lib/admin/navState.ts.
 *
 * Look (approved Tangram design, components/admin/tangram): a separate island
 * sidebar on desktop, a top bar + slide-down menu on phones, black canvas.
 * Only the frame changed; the screens inside keep their own markup.
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
      { href: '/admin/seo', label: 'SEO', icon: '⌕' },
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
      { href: '/admin/users', label: 'Kullanıcılar', icon: '☺' },
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
// Finance user / content editor: only their groups, only the items inside their roots.
const groupsFor = (role: Exclude<PanelRole, 'admin'>) =>
  NAV_GROUPS.filter((group) => ROLE_GROUPS[role].includes(group.title))
    .map((group) => ({ ...group, items: group.items.filter((item) => visibleHref(role, item.href)) }))
    .filter((group) => group.items.length > 0);
const ROLE_NAV: Record<Exclude<PanelRole, 'admin'>, typeof NAV_GROUPS> = { finance: groupsFor('finance'), editor: groupsFor('editor') };

// Section roots that have their own sub-pages in the menu match exactly.
const EXACT = new Set(['/admin', '/admin/ops', '/admin/finance']);
const isActive = (href: string, pathname: string) => (EXACT.has(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

const NOT_ALLOWED = 'Bu hesabın yönetim paneline erişim izni yok. Yetkili bir hesapla giriş yapın.';
const CHECK_FAILED = 'Yönetici kontrolü yapılamadı (veritabanındaki is_admin() fonksiyonu yok ya da erişilemiyor). Güvenlik için panel açılmadı.';

const ACCESS_CLOSED = 'Bu hesabın panel erişimi kapatıldı veya artık geçerli değil. Bir yöneticiyle görüşün.';
const ROLE_CHANGED = 'Hesabınızın rolü değişti; menü ve erişiminiz yeni role göre güncellendi.';

type MeBody = { ok?: boolean; allowed?: boolean; role?: string; reason?: string; warnings?: string[] };

/** Invite page: no session, no menu (the token in the link is the credential). */
function PublicFrame({ children }: { children: ReactNode }) {
  return <div className={t.shell}><main className="relative z-[7] mx-auto grid min-h-screen w-full max-w-[460px] content-center p-4 sm:p-6">{children}</main></div>;
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isPublicAdminPath(pathname)) return <PublicFrame>{children}</PublicFrame>;
  return <PanelShell>{children}</PanelShell>;
}

function PanelShell({ children }: { children: ReactNode }) {
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
  const [access, setAccess] = useState<{ userId: string; allowed: boolean; role: PanelRole | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
      let role: PanelRole | null = null;
      try {
        const response = await fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const body = (await response.json().catch(() => null)) as MeBody | null;
        if (!cancelled) setWarnings(Array.isArray(body?.warnings) ? body.warnings : []);
        if (isPanelRole(body?.role)) role = body.role;
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

  // Live re-check: the database is the source of truth; a changed role or a closed account
  // must not keep its old menu (its requests are already refused by the API and RLS).
  const accessRole = access?.role ?? null;
  const accessOk = Boolean(access?.allowed && access.userId === userId);
  const recheckRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!accessOk || !token || !supabase || !userId) return;
    let stopped = false;
    const closeSession = async () => {
      setError(ACCESS_CLOSED);
      setAccess(null);
      await supabase.auth.signOut();
    };
    const recheck = async () => {
      let response: Response;
      try {
        response = await fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      } catch {
        return; // offline / network problem: keep the current state (requests are checked anyway)
      }
      if (stopped) return;
      if (response.status === 401) return void closeSession();
      const body = (await response.json().catch(() => null)) as MeBody | null;
      if (stopped || !response.ok || !body?.ok) return; // temporary problem: keep the current state
      if (body.allowed === false) return void closeSession();
      const next = isPanelRole(body.role) ? body.role : null;
      if (next !== accessRole) {
        setNotice(ROLE_CHANGED);
        setAccess({ userId, allowed: true, role: next });
      }
    };
    recheckRef.current = () => void recheck();
    const onFocus = () => document.visibilityState === 'visible' && void recheck();
    const timer = window.setInterval(() => void recheck(), 60_000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      stopped = true;
      recheckRef.current = () => {};
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [accessOk, accessRole, token, supabase, userId]);
  // …and on every navigation inside the panel.
  useEffect(() => {
    recheckRef.current();
  }, [pathname]);

  // A finance user / editor outside their screens goes to their home (the data is closed to them anyway).
  const restricted = accessRole && accessRole !== 'admin' ? accessRole : null;
  const outside = Boolean(restricted && !canOpen(restricted, pathname));
  useEffect(() => {
    if (restricted && outside) router.replace(ROLE_HOME[restricted]);
  }, [restricted, outside, router]);
  const isFinance = restricted === 'finance';

  // Menu groups: which are open (per user, this browser).
  const groups = restricted ? ROLE_NAV[restricted] : ADMIN_GROUPS;
  const groupTitles = groups.map((group) => group.title);
  const titlesKey = groupTitles.join('|');
  const currentGroup = groupOfPath(groups, pathname, isActive);
  const navKey = userId && access?.userId === userId ? navStorageKey(userId) : null;
  const [nav, setNav] = useState<{ key: string | null; open: OpenGroups }>({ key: null, open: {} });
  // Writes only the groups that changed, so another admin tab's choices stay as they are.
  const savePatch = (key: string, patch: OpenGroups) => {
    try {
      window.localStorage.setItem(key, patchOpenGroups(window.localStorage.getItem(key), patch));
    } catch {
      /* storage blocked: the menu still works for this visit */
    }
  };
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
  // After a navigation the current page's group is opened (and remembered as open).
  useEffect(() => {
    if (!navKey || !currentGroup) return;
    savePatch(navKey, { [currentGroup]: true });
    setNav((prev) => (prev.key === navKey ? { ...prev, open: openCurrent(prev.open, currentGroup) } : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentGroup, navKey]);
  // Another tab of the same user changed a group: follow it (this page's group stays open).
  useEffect(() => {
    if (!navKey) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== navKey) return;
      setNav((prev) => (prev.key === navKey ? { key: navKey, open: resolveOpenGroups(titlesKey.split('|'), parseOpenGroups(event.newValue), currentGroup) } : prev));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [navKey, titlesKey, currentGroup]);
  const openGroups = nav.key === navKey ? nav.open : resolveOpenGroups(groupTitles, null, currentGroup);
  const toggle = (title: string) => {
    const next = !openGroups[title];
    if (navKey) savePatch(navKey, { [title]: next });
    setNav((prev) => ({ key: prev.key, open: { ...toggleGroup(prev.key === navKey ? prev.open : openGroups, title), [title]: next } }));
  };

  // The mobile menu closes on navigation and with Escape.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Phones / tablets: the top bar is sticky (58 px), so anchor jumps and keyboard focus keep clear of it.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const root = document.documentElement;
    const apply = () => { root.style.scrollPaddingTop = mq.matches ? '72px' : ''; };
    apply();
    mq.addEventListener('change', apply);
    return () => { mq.removeEventListener('change', apply); root.style.scrollPaddingTop = ''; };
  }, []);

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
        <div className="admin-card max-w-md !p-8 text-center">
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
  if (loading || checkingAccess || (session && access && !access.allowed) || outside) {
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
          <form onSubmit={handleLogin} className="admin-card mt-8 grid gap-4 !p-7">
            <h1 className="text-lg font-extrabold">Yönetim Paneli</h1>
            <label className="admin-label">
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
            <label className="admin-label">
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
  const home = restricted ? ROLE_HOME[restricted] : '/admin';
  const current = NAV_ITEMS.find((item) => isActive(item.href, pathname));

  const navLink = (item: (typeof NAV_ITEMS)[number], variant: 'sidebar' | 'drawer') => {
    const active = isActive(item.href, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        // The drawer also closes when the current page is chosen again (no navigation).
        onClick={variant === 'drawer' ? () => setMenuOpen(false) : undefined}
        className={`${t.navItem} ${active ? t.navItemActive : ''}`}
      >
        <span aria-hidden="true" className={t.navIcon}>
          {item.icon}
        </span>
        <span className={t.navItemLabel}>{item.label}</span>
      </Link>
    );
  };

  const navLinks = (variant: 'sidebar' | 'drawer') => (
    <nav aria-label="Admin" className={t.nav}>
      {!restricted && <div className={t.navGroup}>{navLink(HOME_ITEM, variant)}</div>}
      {groups.map((group) => {
        const open = openGroups[group.title] === true;
        const listId = `admin-nav-${variant}-${group.title.toLocaleLowerCase('tr').replace(/[^a-z0-9]+/g, '-')}`;
        const hidesCurrent = !open && currentGroup === group.title;
        return (
          <div key={group.title} className={t.navGroup}>
            <button
              type="button"
              onClick={() => toggle(group.title)}
              aria-expanded={open}
              aria-controls={listId}
              className={`${t.groupBtn} ${hidesCurrent ? t.groupBtnCurrent : ''}`}
            >
              <span lang="tr" className={t.groupLabel}>{group.title}</span>
              {hidesCurrent && (
                <>
                  <span aria-hidden="true" className={t.groupDot} />
                  <span className="sr-only">(geçerli sayfa bu grupta)</span>
                </>
              )}
              <svg aria-hidden="true" viewBox="0 0 16 16" className={`${t.chev} ${open ? t.chevOpen : ''}`}>
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div id={listId} hidden={!open} className={open ? t.groupList : 'hidden'}>
              {group.items.map((item) => navLink(item, variant))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const userEmail = session.user.email ?? '';
  const accountBlock = (
    <div className={t.account}>
      <div className={t.accountWho}>
        <span aria-hidden="true" className={t.avatar}>{userEmail.slice(0, 2).toLocaleUpperCase('tr') || '··'}</span>
        <span className={t.accountText}>
          <strong title={userEmail}>{userEmail}</strong>
          {access?.role && <span>{ROLE_LABEL[access.role]}</span>}
        </span>
      </div>
      <div className={t.accountActions}>
        <Link href="/" className={`${t.btn} ${t.btnSmall}`}>
          Siteye Dön
        </Link>
        <button type="button" onClick={handleLogout} className={`${t.btn} ${t.btnSmall}`}>
          Çıkış
        </button>
      </div>
    </div>
  );

  return (
    <div className={t.shell}>
      {/* Mobile / tablet: compact top bar + slide-down menu */}
      <div className={t.topbar}>
        <div className={t.topbarRow}>
          <Link href={home} className="flex-none" aria-label={isFinance ? 'Finans' : restricted === 'editor' ? 'İçerik' : 'Kokpit'}>
            <img src="/brand/yoca-logo-primary.svg" alt="Yoca" width={96} height={26} />
          </Link>
          <span className={t.topbarTitle}>{current?.label ?? 'Yönetim'}</span>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-menu"
            className={`${t.btn} ${t.btnSmall}`}
          >
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span> {menuOpen ? 'Kapat' : 'Menü'}
          </button>
        </div>
        {menuOpen && (
          <>
            <button type="button" aria-label="Menüyü kapat" onClick={() => setMenuOpen(false)} className={t.scrim} />
            <div id="admin-mobile-menu" className={t.drawer}>
              {navLinks('drawer')}
              {accountBlock}
            </div>
          </>
        )}
      </div>

      <div className={t.frame}>
        {/* Desktop island sidebar */}
        <aside className={t.island}>
          <div className={t.brand}>
            <Link href={home}>
              <img src="/brand/yoca-logo-primary.svg" alt="Yoca" width={104} height={28} />
            </Link>
          </div>
          <div className={t.navScroll}>{navLinks('sidebar')}</div>
          {accountBlock}
        </aside>
        <main className={t.main}>
          {warnings.length > 0 && (
            <div role="alert" className="admin-notice admin-notice-bad mb-6 grid gap-2 text-[14px]">
              <p className="font-bold text-red-300">Yapılandırma hatası</p>
              {warnings.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </div>
          )}
          {notice && (
            <div role="status" className="admin-notice admin-notice-warn mb-6 flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <span>{notice}</span>
              <button type="button" className="admin-btn admin-btn-sm" onClick={() => setNotice(null)}>Tamam</button>
            </div>
          )}
          <PanelRoleContext.Provider value={access?.role ?? null}>{children}</PanelRoleContext.Provider>
          <AdminPrivacyNotice />
        </main>
      </div>
    </div>
  );
}
