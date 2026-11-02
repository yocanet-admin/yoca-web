'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/adminClient';

/**
 * Yoca — admin shell (Client Component).
 * Handles Supabase Auth (email + password), renders the login screen when
 * signed out and the sidebar + content layout when signed in.
 */

const NAV: Array<{ href: string; label: string; icon: string }> = [
  { href: '/admin', label: 'Panel', icon: '▦' },
  { href: '/admin/sections', label: 'Bölümler', icon: '◧' },
  { href: '/admin/menus', label: 'Menüler', icon: '≡' },
  { href: '/admin/content', label: 'Metinler', icon: '¶' },
  { href: '/admin/work', label: 'Work / Projeler', icon: '▣' },
  { href: '/admin/insights', label: 'İçerik / Insights', icon: '✎' },
  { href: '/admin/team', label: 'Ekip', icon: '◉' },
  { href: '/admin/submissions', label: 'Başvurular', icon: '✉' },
  { href: '/admin/signature', label: 'İmza', icon: '✦' },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const supabase = getAdminClient();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
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

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
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
        </div>
      </div>
    );
  }

  // ── Authenticated layout ─────────────────────────────────────
  return (
    <div className="relative z-[7] flex min-h-screen max-lg:flex-col">
      <aside className="flex w-64 flex-none flex-col border-r border-line bg-surface-deep/90 p-5 max-lg:w-full max-lg:flex-row max-lg:items-center max-lg:justify-between max-lg:gap-4 max-lg:overflow-x-auto">
        <Link href="/admin" className="mb-6 block flex-none max-lg:mb-0">
          <img src="/brand/yoca-logo-primary.svg" alt="Yoca" width={120} height={30} className="h-7 w-auto" />
        </Link>
        <nav aria-label="Admin" className="grid gap-1 max-lg:flex max-lg:gap-1.5">
          {NAV.map((item) => {
            const active =
              item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-sm px-3 py-2 text-[14px] font-semibold transition-colors ${
                  active ? 'bg-yoca-lime text-black' : 'text-muted hover:bg-surface hover:text-white'
                }`}
              >
                <span aria-hidden="true" className="text-[13px]">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-2 pt-6 max-lg:mt-0 max-lg:pt-0">
          <p className="truncate text-[12px] text-subtle max-lg:hidden">{session.user.email}</p>
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
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-10">{children}</main>
    </div>
  );
}
