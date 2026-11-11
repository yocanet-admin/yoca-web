'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import type { Dict } from '@/lib/i18n';
import type { Locale } from '@/types';
import { EASE_YOCA } from '@/lib/motion';
import { staticCaseStudies } from '@/lib/workData';
import BrandMark from '@/components/ui/BrandMark';
import LanguageMenu from '@/components/ui/LanguageMenu';
import { brandText } from '@/components/ui/BrandText';

/**
 * Yoca — Overview shell (the only client boundary of /overview).
 * · Data-driven scenes (progress, menu, hash and analytics all derive from
 *   the same list — add/remove a scene in one place).
 * · CSS scroll-snap container (mandatory on desktop, proximity on small
 *   screens so long scenes never trap); wheel/trackpad/touch native.
 * · Keyboard: ↓/→/PageDown/Space next · ↑/←/PageUp previous · Esc closes menu.
 * · IntersectionObserver marks the active scene → progress "03 / 11", hash
 *   (replaceState), one analytics view per scene per session.
 * · Reduced motion: no reveals, no scene transitions, everything readable.
 */

type SceneId = 'intro' | 'yoca' | 'why' | 'systems' | 'services' | 'process' | 'work' | 'products' | 'about' | 'global' | 'contact';

interface ShellProps {
  locale: Locale;
  base: string;
  address: string;
  t: {
    overview: Dict['overview'];
    hero: { title: string; line: string; primaryCta: string };
    systems: Dict['systems'];
    services: { items: Array<{ name: string; changes: string }> };
    process: Array<{ name: string; desc: string }>;
    products: Array<{ key: string; name: string; category: string }>;
    clocks: Dict['clocks'];
    nav: Dict['nav'];
    workLabels: Record<'client' | 'concept' | 'product' | 'experimental' | 'venture', string>;
  };
}

const SCENES: SceneId[] = ['intro', 'yoca', 'why', 'systems', 'services', 'process', 'work', 'products', 'about', 'global', 'contact'];

function track(event: string, params: Record<string, unknown> = {}) {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.('event', event, params);
}

export default function OverviewShell({ locale, base, address, t }: ShellProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const seen = useRef<Set<number>>(new Set());
  const ov = t.overview;
  const isRtl = locale === 'ar';
  const total = SCENES.length;

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(total - 1, index));
    document.getElementById(`scene-${SCENES[clamped]}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  // Active scene detection + analytics + hash (replaceState — no history spam).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = SCENES.indexOf((entry.target as HTMLElement).dataset.scene as SceneId);
          if (index < 0) continue;
          setActive(index);
          if (!seen.current.has(index)) {
            seen.current.add(index);
            if (index === 0) track('overview_started', { locale });
            track('overview_scene_view', { scene_number: index + 1, scene_name: SCENES[index], locale });
            if (index === total - 1) track('overview_completed', { locale });
          }
          window.history.replaceState(null, '', `#${SCENES[index]}`);
        }
      },
      { root, threshold: 0.55 },
    );
    root.querySelectorAll('[data-scene]').forEach((el) => io.observe(el));
    // Deep link (#services) on load
    const hash = window.location.hash.replace('#', '') as SceneId;
    if (SCENES.includes(hash)) setTimeout(() => goTo(SCENES.indexOf(hash)), 50);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard navigation (never inside inputs; Space only when nothing focused).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (typing) return;
      if (e.key === 'Escape') { setMenuOpen(false); return; }
      const next = ['ArrowDown', 'PageDown', isRtl ? 'ArrowLeft' : 'ArrowRight'];
      const prev = ['ArrowUp', 'PageUp', isRtl ? 'ArrowRight' : 'ArrowLeft'];
      if (next.includes(e.key) || (e.key === ' ' && !(target && /^(BUTTON|A)$/.test(target.tagName)))) { e.preventDefault(); goTo(active + 1); }
      else if (prev.includes(e.key)) { e.preventDefault(); goTo(active - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isRtl]);

  const cta = (event: string) => () => track(event, { locale });
  const studies = useMemo(() => staticCaseStudies(locale).slice(0, 4), [locale]);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Final CTA paths — numbering is generated, never hand-typed.
  const paths: Array<{ href: string; label: string; sub?: string; event: string; tone: 'lime' | 'surface' | 'ghost' }> = [
    { href: `${base}/contact`, label: ov.pathProject, event: 'overview_contact_click', tone: 'lime' },
    { href: `${base}/checkup`, label: ov.pathCheckupSub, sub: ov.pathCheckup, event: 'overview_checkup_click', tone: 'surface' },
    { href: base, label: ov.pathSite, event: 'overview_fullsite_click', tone: 'ghost' },
  ];

  return (
    <div ref={rootRef} className="ov-root h-[100svh] overflow-y-auto overscroll-y-contain bg-surface-deep text-white">
      {/* ── Presentation chrome ─────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between px-5 py-4 sm:px-8 lg:px-12" style={{ background: 'linear-gradient(180deg, rgba(13,14,18,0.9), rgba(13,14,18,0))' }}>
        <Link href={base} aria-label="Yoca" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/yoca-logo-primary.svg" alt="Yoca" width={96} height={26} className="h-6 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <p className="text-[12px] font-extrabold tabular-nums tracking-[0.12em] text-muted">
            <span className="sr-only" aria-live="polite">{ov.sceneOf.replace('{n}', String(active + 1)).replace('{total}', String(total))}</span>
            <span aria-hidden="true">{pad(active + 1)} <span className="text-subtle">/ {pad(total)}</span></span>
          </p>
          <LanguageMenu current={locale} path={`/overview#${SCENES[active]}`} ariaLabel="Language" />
          <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-controls="ov-menu" aria-label={ov.menuLabel} className="min-h-[38px] border border-line px-3 text-[12px] font-bold uppercase tracking-[0.1em] text-soft transition-colors hover:border-yoca-lime">
            {menuOpen ? '✕' : ov.menuLabel}
          </button>
        </div>
      </header>

      {/* Progress rail (desktop) */}
      <ol aria-label={ov.scene} className="fixed end-4 top-1/2 z-[60] hidden -translate-y-1/2 flex-col gap-2 lg:flex">
        {SCENES.map((id, i) => (
          <li key={id}>
            <button type="button" onClick={() => goTo(i)} aria-label={`${pad(i + 1)} ${ov.menu[i]}`} aria-current={i === active ? 'step' : undefined} className="block h-2 w-2">
              <span className={`slant block h-2 w-2.5 transition-colors ${i === active ? 'bg-yoca-lime' : i < active ? 'bg-yoca-green/70' : 'bg-line'}`} />
            </button>
          </li>
        ))}
      </ol>

      {/* Menu overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav id="ov-menu" aria-label={ov.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="fixed inset-0 z-[55] grid content-center bg-surface-deep/95 px-6 backdrop-blur-sm">
            <ol className="mx-auto grid w-full max-w-[720px] gap-1">
              {SCENES.map((id, i) => (
                <li key={id}>
                  <button type="button" onClick={() => { setMenuOpen(false); goTo(i); }} className={`flex w-full items-baseline gap-4 border-b border-line py-3 text-start transition-colors hover:text-yoca-lime ${i === active ? 'text-yoca-lime' : 'text-soft'}`}>
                    <span className="w-8 text-[12px] font-extrabold tracking-[0.1em]">{pad(i + 1)}</span>
                    <span className="text-[clamp(18px,2.4vw,26px)] font-extrabold tracking-[-0.02em]">{ov.menu[i]}</span>
                  </button>
                </li>
              ))}
            </ol>
            <Link href={base} className="mx-auto mt-8 inline-flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.1em] text-muted hover:text-white">
              {ov.backToSite} <span aria-hidden="true" className="icon-arrow">→</span>
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* ── Scenes ──────────────────────────────────────────── */}
      <Scene id="intro" index={0} tone="dark">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center">
          <div className="grid gap-8">
            <Reveal reduced={!!reduced} delay={0}><p className="eyebrow">YOCA <span className="ms-2 text-subtle normal-case tracking-normal">{ov.identity}</span></p></Reveal>
            <Reveal reduced={!!reduced} delay={0.12}>
              <h1 className="max-w-[14ch] text-[clamp(36px,5.6vw,84px)] font-extrabold leading-[1.02] tracking-[-0.035em]">
                {ov.coverLines.map((line) => <span key={line} className="block">{line}</span>)}
              </h1>
            </Reveal>
            <Reveal reduced={!!reduced} delay={0.3}>
              <button type="button" onClick={() => goTo(1)} className="inline-flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.12em] text-yoca-lime">
                {ov.cue} <span aria-hidden="true" className={reduced ? '' : 'motion-safe:animate-bounce'}>↓</span>
              </button>
            </Reveal>
          </div>
          <div className="pointer-events-none hidden justify-end lg:flex" aria-hidden="true">
            <Reveal reduced={!!reduced} delay={0.2}><BrandMark className="h-[min(48vh,440px)] w-auto opacity-90" /></Reveal>
          </div>
        </div>
      </Scene>

      <Scene id="yoca" index={1} tone="dark">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center">
          <div>
            <Reveal reduced={!!reduced}><h2 className="max-w-[16ch] text-[clamp(32px,4.8vw,68px)] font-extrabold leading-[1.04] tracking-[-0.03em]">{ov.whatHeading}</h2></Reveal>
            <Reveal reduced={!!reduced} delay={0.15}><p className="mt-6 max-w-[48ch] text-[16px] leading-relaxed text-muted lg:text-[18px]">{ov.whatSub}</p></Reveal>
          </div>
          {/* Words connect into the mark */}
          <div className="grid gap-3">
            {ov.whatWords.map((word, i) => (
              <Reveal key={word} reduced={!!reduced} delay={0.1 + i * 0.09}>
                <div className="flex items-center gap-4">
                  <span className={`slant block h-3 w-3.5 flex-none ${i === ov.whatWords.length - 1 ? 'bg-yoca-lime' : 'bg-yoca-green'}`} aria-hidden="true" />
                  <span className="text-[clamp(20px,2.4vw,32px)] font-extrabold tracking-[-0.02em]">{word}</span>
                  <span aria-hidden="true" className="ms-auto hidden h-px flex-1 bg-line sm:block" />
                </div>
              </Reveal>
            ))}
            <Reveal reduced={!!reduced} delay={0.7}><div className="mt-2 flex items-center gap-4"><BrandMark variant="modules" className="h-9 w-auto" /><span className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-subtle">= YOCA</span></div></Reveal>
          </div>
        </div>
      </Scene>

      <Scene id="why" index={2} tone="light">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:items-center">
          <div className="grid gap-2">
            {ov.whyLines.map((line, i) => (
              <Reveal key={line} reduced={!!reduced} delay={i * 0.12}><p className="text-[clamp(22px,3vw,40px)] font-extrabold leading-[1.15] tracking-[-0.025em] text-[rgba(5,5,5,0.55)]">{line}</p></Reveal>
            ))}
            <Reveal reduced={!!reduced} delay={0.55}><p className="mt-6 max-w-[22ch] text-[clamp(26px,3.6vw,48px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#050505]">{ov.whyConclusion}</p></Reveal>
          </div>
          {/* Scattered → connected */}
          <div className="relative mx-auto aspect-square w-full max-w-[420px]" aria-hidden="true">
            {[['0%', '10%'], ['70%', '0%'], ['40%', '45%'], ['0%', '80%'], ['72%', '78%']].map(([left, top], i) => (
              <motion.span
                key={i}
                className={`absolute block h-14 w-16 ${i === 2 ? 'bg-yoca-lime' : 'bg-[#050505]'}`}
                style={{ left, top, clipPath: 'polygon(7.75% 0, 100% 0, 92.25% 100%, 0 100%)' }}
                initial={reduced ? false : { opacity: 0.35, scale: 0.9, x: (i - 2) * 26, y: i % 2 ? -26 : 26 }}
                whileInView={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.08, ease: EASE_YOCA }}
              />
            ))}
            <motion.svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" initial={reduced ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: 0.8, delay: 0.7 }}>
              <path d="M 8 17 L 48 52 M 78 7 L 48 52 M 8 87 L 48 52 M 80 85 L 48 52" fill="none" stroke="rgba(5,5,5,0.35)" strokeWidth="0.8" strokeDasharray="2 2" />
            </motion.svg>
          </div>
        </div>
      </Scene>

      <Scene id="systems" index={3} tone="dark">
        <SystemsScene names={t.systems.items.slice(0, 3).map((s) => s.name)} systems={ov.systems} caption={ov.systemsCaption} reduced={!!reduced} />
      </Scene>

      <Scene id="services" index={4} tone="dark">
        <Reveal reduced={!!reduced}><p className="eyebrow mb-8">{t.nav.services}</p></Reveal>
        <ol className="grid gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.services.items.map((s, i) => (
            <Reveal key={s.name} reduced={!!reduced} delay={0.05 * i}>
              <li className="group border-t border-line py-4" tabIndex={0}>
                <p className="flex items-baseline gap-3">
                  <span className="text-[12px] font-extrabold tracking-[0.1em] text-yoca-lime">{pad(i + 1)}</span>
                  <span className="text-[clamp(18px,1.9vw,26px)] font-extrabold tracking-[-0.02em] transition-colors group-hover:text-yoca-lime">{s.name}</span>
                </p>
                {/* One semantic instance: always visible ≤lg, revealed on hover/focus ≥lg (visibility stays in the a11y tree via opacity only) */}
                <p className="mt-2 max-w-[38ch] text-[14px] leading-relaxed text-muted transition-opacity duration-300 lg:opacity-40 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">{s.changes}</p>
              </li>
            </Reveal>
          ))}
        </ol>
        <Reveal reduced={!!reduced} delay={0.4}>
          <Link href={`${base}/services`} onClick={cta('overview_services_click')} className="btn-ghost mt-10">{ov.servicesCta} <span aria-hidden="true" className="icon-arrow">→</span></Link>
        </Reveal>
      </Scene>

      <Scene id="process" index={5} tone="light">
        <Reveal reduced={!!reduced}><p className="flex items-center gap-2.5 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[rgba(5,5,5,0.55)]"><span className="slant block h-2.5 w-3 bg-[#050505]" aria-hidden="true" />{ov.processHeading}</p></Reveal>
        <ol className="relative mt-10 grid gap-8 sm:grid-cols-2 lg:mt-14 lg:grid-cols-5 lg:gap-4">
          <motion.span aria-hidden="true" className="absolute inset-x-0 top-[9px] hidden h-px origin-left bg-yoca-green rtl:origin-right lg:block" initial={reduced ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 1.2, ease: EASE_YOCA }} />
          {t.process.map((step, i) => (
            <Reveal key={step.name} reduced={!!reduced} delay={0.15 + i * 0.14}>
              <li>
                <span aria-hidden="true" className={`slant relative z-10 block h-[19px] w-[22px] ${i === t.process.length - 1 ? 'bg-yoca-lime' : i === 0 ? 'bg-[#050505]' : 'bg-yoca-green'}`} />
                <span className="mt-5 block text-[clamp(40px,4.6vw,64px)] font-extrabold leading-none tracking-[-0.05em] text-[rgba(5,5,5,0.16)]">{pad(i + 1)}</span>
                <h3 className="mt-2 text-[20px] font-extrabold tracking-[-0.02em] text-[#050505]">{step.name}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-[rgba(5,5,5,0.62)]">{ov.processLines[i] ?? step.desc}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </Scene>

      <Scene id="work" index={6} tone="dark">
        <Reveal reduced={!!reduced}><p className="eyebrow mb-8">{ov.workLabel}</p></Reveal>
        <ol className="border-t border-line">
          {studies.map((w, i) => (
            <Reveal key={w.slug} reduced={!!reduced} delay={0.08 * i}>
              <li>
                <Link href={`${base}/work/${w.slug}`} onClick={cta('overview_work_click')} className="group flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-line py-5 lg:py-6">
                  <span className="text-[clamp(28px,4.4vw,64px)] font-extrabold uppercase leading-[1] tracking-[-0.03em] text-soft transition-all duration-300 group-hover:translate-x-1 group-hover:text-white rtl:group-hover:-translate-x-1" lang="en">{w.name}</span>
                  <span className="flex items-center gap-4 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle"><span>{w.sector}</span><span className="slant bg-surface-elevated px-2.5 py-1 text-[10px] font-extrabold text-soft">{t.workLabels[w.kind]}</span></span>
                </Link>
              </li>
            </Reveal>
          ))}
        </ol>
        <Reveal reduced={!!reduced} delay={0.4}><Link href={`${base}/work`} onClick={cta('overview_work_click')} className="btn-ghost mt-10">{ov.workCta} <span aria-hidden="true" className="icon-arrow">→</span></Link></Reveal>
      </Scene>

      <Scene id="products" index={7} tone="dark">
        <ProductsScene t={t.products} open={ov.productsOpen} reveal={ov.productsReveal} cta={ov.productsCta} base={base} onCta={cta('overview_products_click')} reduced={!!reduced} />
      </Scene>

      <Scene id="about" index={8} tone="light">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <div>
            <Reveal reduced={!!reduced}><p className="flex items-center gap-2.5 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[rgba(5,5,5,0.55)]"><span className="slant block h-2.5 w-3 bg-[#050505]" aria-hidden="true" />{ov.whoHeading}</p></Reveal>
            <div className="mt-6 grid gap-1">
              {ov.whoLines.map((line, i) => <Reveal key={line} reduced={!!reduced} delay={0.1 + i * 0.12}><p className="text-[clamp(30px,4.6vw,66px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#050505]">{line}</p></Reveal>)}
            </div>
          </div>
          <div className="grid gap-4">
            <Reveal reduced={!!reduced} delay={0.4}><ul className="flex flex-wrap gap-2">{ov.whoTraits.map((tr) => <li key={tr} className="border border-[rgba(5,5,5,0.3)] px-3 py-1.5 text-[13px] font-bold text-[#050505]">{tr}</li>)}</ul></Reveal>
            <Reveal reduced={!!reduced} delay={0.5}><p className="text-[clamp(16px,1.6vw,20px)] font-extrabold tracking-[-0.01em] text-[rgba(5,5,5,0.7)]">{ov.whoFormula}</p></Reveal>
          </div>
        </div>
      </Scene>

      <Scene id="global" index={9} tone="dark">
        <GlobalScene locale={locale} address={address} clocks={t.clocks} line={ov.globalLine} reduced={!!reduced} />
      </Scene>

      <Scene id="contact" index={10} tone="dark" last>
        <div className="grid gap-10">
          <div>
            <Reveal reduced={!!reduced}><p className="eyebrow">{ov.finalSmall}</p></Reveal>
            <Reveal reduced={!!reduced} delay={0.12}><h2 className="mt-6 text-[clamp(40px,7vw,104px)] font-extrabold leading-[0.98] tracking-[-0.04em]">{ov.finalLarge}</h2></Reveal>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {paths.map((p, i) => (
              <Reveal key={p.href} reduced={!!reduced} delay={0.25 + i * 0.07}>
                <li className="h-full">
                  <Link href={p.href} onClick={cta(p.event)} className={`flex h-full flex-col justify-between gap-8 p-7 transition-colors ${p.tone === 'lime' ? 'bg-yoca-lime text-black hover:bg-yoca-green' : p.tone === 'surface' ? 'border border-line bg-surface hover:border-yoca-lime/60' : 'border border-line/60 hover:border-line'}`}>
                    <span className={`text-[13px] font-bold ${p.tone === 'lime' ? 'text-black/70' : 'text-subtle'}`}>{pad(i + 1)}</span>
                    <span className="grid gap-1">
                      {p.sub ? <span className="text-[13px] text-muted">{p.sub}</span> : null}
                      <span className={`text-xl font-extrabold tracking-tight ${p.tone === 'lime' ? '' : p.tone === 'surface' ? 'text-soft' : 'text-muted'}`}>{p.label} <span aria-hidden="true" className="icon-arrow">→</span></span>
                    </span>
                  </Link>
                </li>
              </Reveal>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/yoca-logo-primary.svg" alt="Yoca" width={140} height={38} className="h-9 w-auto" />
            <p className="text-[13px] text-subtle" dir="ltr">Made to move forward.</p>
          </div>
        </div>
      </Scene>
    </div>
  );
}

/* ── Primitives ─────────────────────────────────────────────── */

function Scene({ id, index, tone, last = false, children }: { id: SceneId; index: number; tone: 'dark' | 'light'; last?: boolean; children: React.ReactNode }) {
  return (
    <section
      id={`scene-${id}`}
      data-scene={id}
      aria-label={`${String(index + 1).padStart(2, '0')}`}
      className={`relative flex min-h-[100svh] items-center py-24 ${tone === 'light' ? 'section-light' : 'bg-surface-deep text-white'} ${last ? '' : ''}`}
      style={{ scrollSnapAlign: 'start' }}
    >
      <div className="container-y relative w-full">{children}</div>
    </section>
  );
}

function Reveal({ children, delay = 0, reduced }: { children: React.ReactNode; delay?: number; reduced: boolean }) {
  return (
    <motion.div data-reveal initial={reduced ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.55, delay, ease: EASE_YOCA }}>
      {children}
    </motion.div>
  );
}

/* Systems: one localized data structure, one renderer — 01 → 02 → 03 resolve into BRAND → GROWTH → SCALE */
function SystemsScene({ names, systems, caption, reduced }: { names: string[]; systems: Dict['overview']['systems']; caption: string; reduced: boolean }) {
  const [active, setActive] = useState(0);
  const items = systems.map((sys, i) => ({ ...sys, name: names[i] ?? sys.short }));
  const current = items[active] ?? items[0];
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
      <div>
        <Reveal reduced={reduced}><h2 className="max-w-[14ch] text-[clamp(30px,4.2vw,58px)] font-extrabold leading-[1.06] tracking-[-0.03em]">{caption}</h2></Reveal>
        <ol className="mt-8 grid gap-1">
          {items.map((sys, i) => (
            <li key={sys.name}>
              <button type="button" onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} aria-pressed={active === i} className={`flex w-full items-baseline gap-4 border-b border-line py-3 text-start transition-colors ${active === i ? 'text-white' : 'text-subtle hover:text-soft'}`}>
                <span className={`text-[12px] font-extrabold tracking-[0.1em] ${active === i ? 'text-yoca-lime' : ''}`}>{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[clamp(18px,1.9vw,24px)] font-extrabold tracking-[-0.02em]">{sys.name}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-6">
        <div className="min-h-[130px]">
          <AnimatePresence mode="wait">
            <motion.div key={active} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE_YOCA }}>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-subtle">{current.descriptor}</p>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[clamp(20px,2.4vw,32px)] font-extrabold tracking-[-0.02em]">
                {current.steps.map((w, i) => <span key={w} className="flex items-center gap-3">{w}{i < current.steps.length - 1 && <span aria-hidden="true" className="icon-arrow text-yoca-lime">→</span>}</span>)}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
        {/* Signature: BRAND → GROWTH → SCALE (semantic order 01→02→03; visual direction follows the reading direction) */}
        <ol className="grid grid-cols-3 items-center gap-2 border-t border-line pt-6" aria-label="01 → 02 → 03">
          {items.map((sys, i) => (
            <li key={sys.name} className="relative">
              <motion.span aria-hidden="true" className={`slant block h-3.5 w-4 ${i === 0 ? 'bg-white' : i === 1 ? 'bg-yoca-green' : 'bg-yoca-lime'}`} initial={false} animate={{ opacity: i <= active ? 1 : 0.25 }} transition={{ duration: 0.3 }} />
              <motion.p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.14em]" initial={false} animate={{ opacity: i <= active ? 1 : 0.35 }}>{sys.short}</motion.p>
              {i < 2 && <motion.span aria-hidden="true" className="absolute start-6 top-[6px] h-px origin-left bg-yoca-green rtl:origin-right" style={{ width: 'calc(100% - 2rem)' }} initial={false} animate={{ scaleX: active > i ? 1 : 0.15, opacity: active > i ? 1 : 0.3 }} transition={{ duration: 0.4 }} />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* Products: "We build for clients." → "We build for ourselves too." → ecosystem */
function ProductsScene({ t, open, reveal, cta, base, onCta, reduced }: { t: Array<{ key: string; name: string; category: string }>; open: string; reveal: string; cta: string; base: string; onCta: () => void; reduced: boolean }) {
  const [active, setActive] = useState(0);
  return (
    <div className="grid gap-10">
      <div>
        <Reveal reduced={reduced}><p className="text-[clamp(20px,2.4vw,32px)] font-extrabold tracking-[-0.02em] text-subtle">{open}</p></Reveal>
        <Reveal reduced={reduced} delay={0.35}><p className="mt-1 text-[clamp(30px,4.6vw,66px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{reveal}</p></Reveal>
      </div>
      <ol className="grid gap-1 lg:grid-cols-5 lg:gap-3">
        {t.map((p, i) => (
          <Reveal key={p.key} reduced={reduced} delay={0.5 + i * 0.07}>
            <li>
              <button type="button" onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} aria-pressed={active === i} className={`flex w-full flex-col gap-2 border-t border-line py-4 text-start transition-colors lg:min-h-[140px] ${active === i ? 'text-white' : 'text-subtle hover:text-soft'}`}>
                <span className={`text-[12px] font-extrabold tracking-[0.1em] ${active === i ? 'text-yoca-lime' : ''}`}>{String(i + 1).padStart(2, '0')}</span>
                <span className={`font-extrabold tracking-[-0.02em] transition-all duration-300 ${active === i ? 'text-[clamp(22px,2.4vw,30px)]' : 'text-[clamp(18px,1.8vw,22px)]'}`}>{p.name}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">{brandText(p.category)}</span>
              </button>
            </li>
          </Reveal>
        ))}
      </ol>
      <Reveal reduced={reduced} delay={0.9}><Link href={`${base}/products`} onClick={onCta} className="btn-ghost w-fit">{cta} <span aria-hidden="true" className="icon-arrow">→</span></Link></Reveal>
    </div>
  );
}

/* Global: Istanbul + address, working cities with live time */
function GlobalScene({ locale, address, clocks, line, reduced }: { locale: Locale; address: string; clocks: Dict['clocks']; line: string; reduced: boolean }) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer); }, []);
  const time = (tz: string) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(now);
  const cities: Array<[string, string]> = [[clocks.baku, 'Asia/Baku'], [clocks.london, 'Europe/London'], [clocks.dubai, 'Asia/Dubai']];
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:items-end">
      <div>
        <Reveal reduced={reduced}><p className="text-[clamp(40px,7vw,104px)] font-extrabold uppercase leading-[0.95] tracking-[-0.04em]">{clocks.istanbul}</p></Reveal>
        <Reveal reduced={reduced} delay={0.15}><p className="mt-3 text-[clamp(28px,4vw,56px)] font-extrabold tabular-nums tracking-[-0.03em] text-yoca-lime" suppressHydrationWarning>{time('Europe/Istanbul')}</p></Reveal>
        <Reveal reduced={reduced} delay={0.25}><address className="mt-6 text-[15px] not-italic text-muted" dir="ltr">{address}</address></Reveal>
        <Reveal reduced={reduced} delay={0.35}><p className="mt-6 max-w-[36ch] text-[16px] font-bold text-soft">{line}</p></Reveal>
      </div>
      <ol className="grid divide-y divide-line border-y border-line">
        {cities.map(([name, tz], i) => (
          <Reveal key={tz} reduced={reduced} delay={0.3 + i * 0.1}>
            <li className="flex items-center justify-between py-4">
              <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-subtle">{name}</span>
              <span className="text-[clamp(20px,2.4vw,32px)] font-extrabold tabular-nums tracking-[-0.02em]" suppressHydrationWarning>{time(tz)}</span>
            </li>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
