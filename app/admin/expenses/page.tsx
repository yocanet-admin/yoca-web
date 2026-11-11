'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Empty, Flash, fmtDate } from '@/components/admin/ops/ui';
import { ImportPanel } from '@/components/admin/fin/ImportPanel';
import { MonthPicker } from '@/components/admin/fin/MonthPicker';
import { FinanceNav } from '@/components/admin/fin/FinanceNav';
import { DateField } from '@/components/admin/DateField';
import { Chevron, Status, type Tone } from '@/components/admin/tangram/ui';
import t from '@/components/admin/tangram/tangram.module.css';
import { loadFinance, type FinData } from '@/lib/fin/data';
import {
  CATEGORIES, CATEGORY_LABEL, CSV_HEADER, FIN_STATE_LABEL, MONTH_RE, RECURRENCE_LABEL, buildItems, csvRows, filterItems, listTotals, monthBounds, overview, stateText,
  type FinState, type Filter, type Item, type Totals,
} from '@/lib/fin/model';
import { toCsv } from '@/lib/ops/csv';
import { daysUntil, dueText, istanbulDay } from '@/lib/ops/model';
import { formatAmount, formatMinor, formatTotals } from '@/lib/ops/money';

/**
 * Yoca — Giderler (overview + list). Recurring and one-off expenses together
 * with the Operasyon provider costs (shown once, "Kaynak: Operasyon").
 * Totals are per currency; a period without an amount is counted, not added.
 * Monthly figures and the list follow ONE selected month (?ay=YYYY-MM, default
 * this month): a period belongs to the month of its due date, so periods created
 * ahead of time for the next month never enter this month's totals. "Geciken"
 * is the only point-in-time card (as of today, every month).
 * Filters live in the URL (shareable): ?ay=&kapsam=tum&cat=&state=&prov=&from=&to=&src=&q=&view=
 *
 * Layout: approved Tangram design (components/admin/tangram). Calculations,
 * data and actions unchanged: a payment is recorded on the period's own page
 * ("Ödeme kaydet" opens it). Red overdue styling only for the "overdue" state;
 * a period awaiting a payment date or without an amount reads "Vade tarihi geçti".
 */

const BASE = '/admin/expenses';
const STATE_OPTIONS: Array<[string, string]> = [['open', 'Ödenmemiş'], ['', 'Tümü'], ['pending', FIN_STATE_LABEL.pending], ['partial', FIN_STATE_LABEL.partial], ['overdue', FIN_STATE_LABEL.overdue], ['paid', FIN_STATE_LABEL.paid], ['review', FIN_STATE_LABEL.review], ['over', FIN_STATE_LABEL.over], ['unknown', FIN_STATE_LABEL.unknown], ['cancelled', FIN_STATE_LABEL.cancelled]];
const STATE_TONE: Record<FinState, Tone> = { pending: 'info', partial: 'warn', paid: 'good', overdue: 'bad', over: 'warn', unknown: 'muted', review: 'warn', cancelled: 'muted' };
const STATE_ICON: Record<FinState, string> = { pending: '○', partial: '½', paid: '●', overdue: '✕', over: '▲', unknown: '?', review: '◷', cancelled: '–' };
const lines = (x: Totals) => { const keys = Object.keys(x).sort(); return keys.length ? keys.map((c) => formatMinor(x[c], c)) : ['—']; };
const money = (v: bigint | null, currency: string | null) => (v !== null && currency ? formatMinor(v, currency) : '—');
const fmtShort = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

function ExpensesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<FinData | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const today = istanbulDay();
  useEffect(() => { void loadFinance().then(setData); }, []);

  const f: Filter = {
    category: params.get('cat') ?? '', state: params.get('state') ?? 'open', provider: params.get('prov') ?? '',
    from: params.get('from') ?? '', to: params.get('to') ?? '', source: (params.get('src') ?? '') as Filter['source'], q: params.get('q') ?? '',
  };
  const view = params.get('view') === 'defs' ? 'defs' : params.get('view') === 'import' ? 'import' : 'periods';
  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (patch.state === '') next.set('state', 'all');
    router.replace(`${BASE}?${next.toString()}`, { scroll: false });
  };
  if (f.state === 'all') f.state = '';
  const thisMonth = today.slice(0, 7);
  const month = MONTH_RE.test(params.get('ay') ?? '') ? (params.get('ay') as string) : thisMonth;
  // List scope: a custom due-date range if given, otherwise the selected month (or every month on request).
  const custom = Boolean(f.from || f.to);
  const allMonths = !custom && params.get('kapsam') === 'tum';
  const userFrom = f.from ?? '', userTo = f.to ?? '';
  if (!custom && !allMonths) { const b = monthBounds(month); f.from = b.from; f.to = b.to; }

  const items = useMemo(() => (data?.ready ? buildItems({ ...data, today }) : []), [data, today]);
  const shown = useMemo(() => filterItems(items, f), [items, f.category, f.state, f.provider, f.from, f.to, f.source, f.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const ov = useMemo(() => overview(items, today, month), [items, today, month]);
  const providers = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) if (it.provider) m.set(it.providerId ?? it.provider, it.provider);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  }, [items]);
  const shownTotals = useMemo(() => listTotals(shown), [shown]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(CSV_HEADER, csvRows(shown))], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yoca-giderler-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <p className="text-[14px] text-subtle">Yükleniyor…</p>;
  if (!data.ready) return <Flash tone="bad" message={data.error ?? 'Giderler yüklenemedi.'} />;

  const monthText = (m: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
  const monthName = monthText(month);
  const goMonth = (m: string) => setParam({ ay: m === thisMonth ? '' : m, from: '', to: '', kapsam: '' });
  const scopeText = custom ? `Vade ${userFrom ? fmtDate(userFrom) : '…'} – ${userTo ? fmtDate(userTo) : '…'}` : allMonths ? 'Tüm aylar' : monthName;
  const listOverdue = () => setParam({ view: '', state: 'overdue', from: '', to: '', kapsam: 'tum' });
  const activeLabels = [
    f.category ? CATEGORY_LABEL[f.category as keyof typeof CATEGORY_LABEL] ?? f.category : '',
    params.get('state') && params.get('state') !== 'open' ? (STATE_OPTIONS.find(([v]) => v === (f.state ?? ''))?.[1] ?? '') : '',
    f.provider ? providers.find(([id]) => id === f.provider)?.[1] ?? f.provider : '',
    f.source ? (f.source === 'ops' ? 'Operasyon' : 'Giderler') : '',
    custom ? `Vade ${userFrom ? fmtShort(userFrom) : '…'}–${userTo ? fmtShort(userTo) : '…'}` : '',
    f.q ? `“${f.q.length > 12 ? `${f.q.slice(0, 12)}…` : f.q}”` : '',
  ].filter(Boolean);
  const isOverdueView = f.state === 'overdue' && allMonths;
  const explanation = `Aylık kartlar yalnızca vadesi ${monthName} içinde olan dönemleri sayar; sonraki ay için önceden açılan dönemler o ayın toplamına girer. “Ödenen”, bu dönemlere kaydedilen net ödemedir (iadeler düşülür); ödemenin hangi tarihte yapıldığına bakılmaz. Fazla ödeme olduğu gibi gösterilir, toplamlar eşitlensin diye değiştirilmez. Para birimleri ayrı toplanır; kur dönüşümü yapılmaz. Operasyon sağlayıcı ödemeleri tek kayıt olarak sayılır; vadesi bilinmeyen kayıtlar aylık toplamlara girmez. Tutarı beklenen dönemler toplamlara katılmaz.${ov.reviewCount ? ` Kaynakta “Ödendi” işaretli ama ödeme tarihi beklenen ${ov.reviewCount} dönem (${formatTotals(ov.review)}) ayrı gösterilir: ödeme sayılmaz, gecikmeye girmez.` : ''}`;
  const paidSub = `${monthName} dönemlerine kaydedilen net ödemeler (iadeler düşülür); ödeme tarihine göre değil${Object.keys(ov.over).length ? ` · ${formatTotals(ov.over)} fazla ödeme dahil` : ''}${Object.keys(ov.paidUnknown).length ? ` · ${formatTotals(ov.paidUnknown)} tutarı bilinmeyen dönemlere` : ''}`;

  return (
    <div className={t.screen}>
      <header className={t.head}>
        <div className={t.headText}>
          <p className={t.kicker}>Finans</p>
          <h1 className={t.h1}>Giderler</h1>
          <p className={t.lede}>Düzenli ve tek seferlik giderler ile Operasyon’daki sağlayıcı ödemeleri. Kayıt ve takip içindir; banka işlemi veya otomatik ödeme yapmaz.</p>
        </div>
        <div className={t.headActions}>
          <button type="button" className={t.btn} onClick={exportCsv} disabled={!shown.length}>CSV indir ({shown.length})</button>
          <Link href={`${BASE}/new`} className={`${t.btn} ${t.btnPrimary}`}>+ Yeni gider</Link>
        </div>
      </header>

      <div className={t.finNav}>
        <div className={t.finNavSkin}><FinanceNav active="expenses" /></div>
        <div className={`${t.periodRow} ${t.pickerSkin}`}>
          <MonthPicker value={month} onChange={goMonth} thisMonth={thisMonth} />
          {month !== thisMonth && <button type="button" className={`${t.btn} ${t.btnSmall} ${t.btnGhost}`} onClick={() => goMonth(thisMonth)}>Bu aya dön</button>}
        </div>
      </div>

      <section aria-label="Genel bakış" className={`${t.money} ${ov.reviewCount ? '' : t.money4} ${t.moneyDesk}`}>
        <MoneyCard title={`Gider · ${monthName}`} totals={ov.total} sub={`${ov.count} dönem${ov.unknownCount ? ` · ${ov.unknownCount} dönemin tutarı bekleniyor` : ''}`} />
        <MoneyCard title={`Ödenen · ${monthName}`} totals={ov.paid} sub={paidSub} />
        <MoneyCard title={`Kalan · ${monthName}`} totals={ov.remaining} sub={`${ov.remainingCount} dönem`} />
        {ov.reviewCount > 0 && <MoneyCard tone="warn" icon="◷" title="Ödendi işaretli · tarih bekleniyor" totals={ov.review} sub={`${ov.reviewCount} dönem · ödeme sayılmaz, gecikmeye girmez`} />}
        <MoneyCard last tone={ov.overdueCount ? 'bad' : undefined} icon={ov.overdueCount ? '✕' : undefined} title="Geciken · Tüm aylar · bugün itibarıyla" totals={ov.overdue}
          sub={`${ov.overdueCount} dönem · ödeme tarihi bekleyen ve tutarı bilinmeyen dönemler hariç`}
          action={ov.overdueCount ? <button type="button" className={`${t.btn} ${t.btnSmall}`} onClick={listOverdue}>Gecikenleri listele</button> : null} />
      </section>

      {/* phones: the same figures, compact; the long explanations stay in the disclosure below */}
      <section aria-label="Genel bakış (özet)" className={t.sumMob}>
        <div className={t.sumHead}>
          <span>{monthName}</span>
          {view === 'periods' && <a href="#giderler-kayitlar" className={t.sumJump} onClick={(e) => { e.preventDefault(); const el = document.getElementById('giderler-kayitlar'); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }); }}>Kayıtlara geç ({shown.length}) ↓</a>}
        </div>
        <div className={t.sumGrid}>
          <SumCell title="Gider" totals={ov.total} sub={`${ov.count} dönem${ov.unknownCount ? ` · ${ov.unknownCount} tutarı yok` : ''}`} />
          <SumCell title="Ödenen" totals={ov.paid} sub="net · dönem esası" />
          <SumCell title="Kalan" totals={ov.remaining} sub={`${ov.remainingCount} dönem`} />
        </div>
        {ov.reviewCount > 0 && (
          <div className={`${t.sumRow} ${t.sumWarn}`}>
            <span className={t.sumRowTitle}><span aria-hidden="true">◷</span> Ödendi işaretli · tarih bekleniyor</span>
            <strong className={t.num}>{formatTotals(ov.review)}</strong>
            <small>{ov.reviewCount} dönem · ödeme sayılmaz, gecikmeye girmez</small>
          </div>
        )}
        <div className={`${t.sumRow} ${ov.overdueCount ? t.sumBad : ''}`}>
          <span className={t.sumRowTitle}>{ov.overdueCount > 0 && <span aria-hidden="true">✕</span>} Geciken · tüm aylar · bugün itibarıyla</span>
          <strong className={t.num}>{formatTotals(ov.overdue)}</strong>
          <small>{ov.overdueCount} dönem</small>
          {ov.overdueCount > 0 && <button type="button" className={`${t.btn} ${t.btnSmall} ${t.sumRowBtn}`} onClick={listOverdue}>Listele</button>}
        </div>
      </section>

      <details className={t.explain}>
        <summary><Chevron /> Bu kartlar nasıl hesaplanır?</summary>
        <ul className={t.explainList}>
          <li><strong>“Gider” kartı ({monthName}):</strong> {ov.count} dönem{ov.unknownCount ? `; ${ov.unknownCount} dönemin tutarı bekleniyor (toplama katılmaz)` : ''}.</li>
          <li><strong>“Ödenen” kartı ({monthName}):</strong> {paidSub}.</li>
          <li><strong>“Kalan” kartı ({monthName}):</strong> {ov.remainingCount} dönem.</li>
          {ov.reviewCount > 0 && <li><strong>“Ödendi işaretli” kartı:</strong> {ov.reviewCount} dönem ({formatTotals(ov.review)}); ödeme sayılmaz, gecikmeye girmez.</li>}
          <li><strong>“Geciken” kartı (tüm aylar, bugün itibarıyla):</strong> {ov.overdueCount} dönem; ödeme tarihi bekleyen ve tutarı bilinmeyen dönemler hariç.</li>
        </ul>
        <p>{explanation}</p>
      </details>

      <div className={t.seg} role="tablist" aria-label="Giderler görünümü" style={{ justifySelf: 'start' }}>
        {([['periods', 'Dönemler ve ödemeler'], ['defs', 'Gider tanımları'], ['import', 'Aktarım']] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={t.segBtn} onClick={() => setParam({ view: k === 'periods' ? '' : k })}>{label}</button>
        ))}
      </div>

      {view === 'import' ? <ImportPanel onApplied={() => void loadFinance().then(setData)} /> : view === 'defs' ? <Definitions data={data} items={items} /> : (
        <>
          <button type="button" className={`${t.btn} ${t.btnSmall} ${t.filterToggle}`} aria-expanded={filtersOpen} aria-controls="giderler-filtreler" onClick={() => setFiltersOpen((v) => !v)}>
            <Chevron className={filtersOpen ? t.chevOpen : ''} />
            <span className={t.filterToggleText}>Filtreler{activeLabels.length ? ` · ${activeLabels.length}: ${activeLabels.join(', ')}` : ''}</span>
          </button>
          <section id="giderler-filtreler" aria-label="Filtreler" className={`${t.filters} ${filtersOpen ? '' : t.filtersCollapsed}`}>
            <label className={t.field}>Kategori
              <select className={`${t.input} ${f.category ? t.filterActive : ''}`} value={f.category} onChange={(e) => setParam({ cat: e.target.value })}>
                <option value="">Tümü</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}<option value="ops">{CATEGORY_LABEL.ops}</option>
              </select>
            </label>
            <label className={t.field}>Durum
              <select className={`${t.input} ${f.state !== 'open' ? t.filterActive : ''}`} value={f.state} onChange={(e) => setParam({ state: e.target.value })}>
                {STATE_OPTIONS.map(([v, label]) => <option key={v || 'all'} value={v}>{label}</option>)}
              </select>
            </label>
            <label className={t.field}>Sağlayıcı / firma
              <select className={`${t.input} ${f.provider ? t.filterActive : ''}`} value={f.provider} onChange={(e) => setParam({ prov: e.target.value })}>
                <option value="">Tümü</option>{providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className={t.field}>Kaynak
              <select className={`${t.input} ${f.source ? t.filterActive : ''}`} value={f.source ?? ''} onChange={(e) => setParam({ src: e.target.value })}>
                <option value="">Tümü</option><option value="fin">Giderler</option><option value="ops">Operasyon</option>
              </select>
            </label>
            {/* as before: the fields show the effective range (the month's bounds unless a custom range is set) */}
            <div className={`${t.field} ${t.dateWrap} ${custom && userFrom ? t.dateActive : ''}`}><span aria-hidden="true">Vade başı</span><DateField label="Vade başı" value={f.from ?? ''} max={f.to || null} today={today} onChange={(v) => setParam({ from: v, to: f.to ?? '', kapsam: '' })} /></div>
            <div className={`${t.field} ${t.dateWrap} ${custom && userTo ? t.dateActive : ''}`}><span aria-hidden="true">Vade sonu</span><DateField label="Vade sonu" value={f.to ?? ''} min={f.from || null} today={today} onChange={(v) => setParam({ to: v, from: f.from ?? '', kapsam: '' })} /></div>
            <label className={`${t.field} ${t.filterWide}`}>Ara<input className={`${t.input} ${f.q ? t.filterActive : ''}`} value={f.q} onChange={(e) => setParam({ q: e.target.value })} placeholder="açıklama, firma…" /></label>
          </section>

          <div id="giderler-kayitlar" tabIndex={-1} className={t.resultBar}>
            <span className={t.resultScope}>{scopeText}</span>
            <span className={t.resultMuted}>{shown.length} dönem</span>
            <span>Tutar: <strong className={t.num}>{formatTotals(shownTotals.amount)}</strong></span>
            <span>Kalan: <strong className={t.num}>{formatTotals(shownTotals.remaining)}</strong></span>
            {Object.keys(shownTotals.review).length > 0 && <span>Ödeme tarihi bekleyen: <strong className={t.num}>{formatTotals(shownTotals.review)}</strong></span>}
            {shownTotals.unknown > 0 && <span className={t.resultWarn}><span aria-hidden="true">? </span>{shownTotals.unknown} dönemin tutarı bekleniyor (toplama katılmadı)</span>}
            <span className={t.quick}>
              <button type="button" className={`${t.btn} ${t.btnSmall} ${!custom && !allMonths ? t.quickOn : ''}`} aria-pressed={!custom && !allMonths} onClick={() => setParam({ from: '', to: '', kapsam: '' })}>Seçili ay</button>
              <button type="button" className={`${t.btn} ${t.btnSmall} ${allMonths && !isOverdueView ? t.quickOn : ''}`} aria-pressed={allMonths && !isOverdueView} onClick={() => setParam({ from: '', to: '', kapsam: 'tum' })}>Tüm aylar</button>
              <button type="button" className={`${t.btn} ${t.btnSmall} ${isOverdueView ? t.quickOn : ''}`} aria-pressed={isOverdueView} onClick={() => setParam({ state: 'overdue', from: '', to: '', kapsam: 'tum' })}>Gecikenler</button>
              <button type="button" className={`${t.btn} ${t.btnSmall} ${t.btnGhost}`} onClick={() => router.replace(month === thisMonth ? BASE : `${BASE}?ay=${month}`)}>Filtreleri temizle</button>
            </span>
          </div>

          {shown.length === 0 ? (
            <div className={t.empty}>
              <span className={t.emptyIcon} aria-hidden="true">∅</span>
              <p>{items.length ? 'Bu filtrelere uyan dönem yok.' : 'Henüz gider yok. “Yeni gider” ile ilk düzenli veya tek seferlik gideri ekleyin.'}</p>
              {items.length > 0 && <button type="button" className={`${t.btn} ${t.btnSmall}`} onClick={() => router.replace(month === thisMonth ? BASE : `${BASE}?ay=${month}`)}>Filtreleri temizle</button>}
            </div>
          ) : (
            <>
              <div className={`${t.tableWrap} ${t.desktopOnly}`}>
                <table className={t.table}>
                  <colgroup>
                    <col style={{ width: 104 }} /><col /><col style={{ width: 128 }} />
                    <col style={{ width: 112 }} /><col style={{ width: 104 }} /><col style={{ width: 108 }} /><col style={{ width: 140 }} /><col style={{ width: 140 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Vade</th><th scope="col">Gider / hizmet · kategori</th><th scope="col">Sağlayıcı / firma</th>
                      <th scope="col" className={t.right}>Tutar</th><th scope="col" className={t.right}>Ödenen</th><th scope="col" className={t.right}>Kalan</th><th scope="col">Durum</th><th scope="col"><span className="sr-only">İşlem</span></th>
                    </tr>
                  </thead>
                  <tbody>{shown.map((it) => <Row key={it.key} it={it} today={today} />)}</tbody>
                </table>
              </div>
              <ul className={`${t.cards} ${t.mobileOnly}`}>
                {shown.map((it) => <MobileCard key={it.key} it={it} today={today} />)}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

const href = (it: Item) => (it.source === 'ops' ? `${BASE}/ops/${it.periodId}` : `${BASE}/${it.expenseId}?period=${it.periodId}`);
const canPay = (it: Item) => !['paid', 'over', 'cancelled'].includes(it.summary.state) && it.summary.state !== 'unknown';

function MoneyCard({ title, totals, sub, tone, icon, last, action }: { title: string; totals: Totals; sub?: string; tone?: 'warn' | 'bad'; icon?: string; last?: boolean; action?: ReactNode }) {
  return (
    <div className={`${t.moneyCard} ${tone === 'bad' ? t.moneyBad : tone === 'warn' ? t.moneyWarn : ''} ${last ? t.moneyLast : ''}`}>
      <span className={t.moneyTitle}>{icon && <span aria-hidden="true" style={{ color: tone === 'bad' ? 'var(--bad)' : 'var(--warn)' }}>{icon}</span>}<span>{title}</span></span>
      <ul className={`${t.moneyLines} ${t.num}`} aria-label={`${title}: para birimine göre`}>
        {lines(totals).map((l) => <li key={l}>{l}</li>)}
      </ul>
      {sub && <p className={t.moneySub}>{sub}</p>}
      {action}
    </div>
  );
}

function SumCell({ title, totals, sub }: { title: string; totals: Totals; sub: string }) {
  return (
    <div className={t.sumCell}>
      <span className={t.sumCellTitle}>{title}</span>
      <ul className={`${t.sumLines} ${t.num}`} aria-label={`${title}: para birimine göre`}>
        {lines(totals).map((l) => <li key={l}>{l}</li>)}
      </ul>
      <small>{sub}</small>
    </div>
  );
}

function Due({ it, today }: { it: Item; today: string }) {
  const st = it.summary.state;
  const open = !['paid', 'over', 'cancelled'].includes(st);
  if (!it.dueOn) return <span className={t.dueText}>Vade bilinmiyor</span>;
  const d = daysUntil(it.dueOn, today);
  // red only for what the finance rules call overdue; "review" / unknown amount past the date stay neutral
  const note = !open ? null
    : d < 0 ? (st === 'overdue'
      ? <span className={t.dueLateText}><span aria-hidden="true">✕ </span>{dueText(it.dueOn, today)}</span>
      : <span className={t.dueText}>Vade tarihi geçti</span>)
    : <span className={d <= 7 ? t.dueSoonText : t.dueText}>{dueText(it.dueOn, today)}</span>;
  return (
    <span className={t.dueCell}>
      <strong>{fmtDate(it.dueOn)}</strong>
      {note}
    </span>
  );
}

function Meta({ it, withCategory = false }: { it: Item; withCategory?: boolean }) {
  return (
    <span className={t.cellMeta}>
      {it.source === 'ops'
        ? <span className={`${t.srcTag} ${t.srcOps}`} title="Kayıt Operasyon'daki sağlayıcı ödemesidir; burada ikinci kez tutulmaz.">Kaynak: Operasyon</span>
        : <span className={t.srcTag}>Giderler</span>}
      <span>{[withCategory ? it.categoryText : '', it.recurrence ? RECURRENCE_LABEL[it.recurrence as keyof typeof RECURRENCE_LABEL] : it.source === 'fin' ? 'Tek seferlik' : '', it.periodText].filter(Boolean).join(' · ')}</span>
    </span>
  );
}

function Row({ it, today }: { it: Item; today: string }) {
  const st = it.summary;
  return (
    <tr className={st.state === 'cancelled' ? t.rowCancelled : undefined}>
      <td><Due it={it} today={today} /></td>
      <td><span className={t.cellTitle}><Link href={href(it)} className="underline-offset-2 hover:underline"><strong>{it.title}</strong></Link><Meta it={it} withCategory /></span></td>
      <td>{it.provider ?? <span className={t.dueText}>—</span>}</td>
      <td className={t.right}>{it.amount ? <span className={t.amt}>{formatAmount(it.amount, it.currency)}</span> : <span className={`${t.amt} ${t.amtMuted}`}>Tutar bekleniyor</span>}</td>
      <td className={t.right}><span className={`${t.amt} ${st.paid === BigInt(0) ? t.amtMuted : ''}`}>{money(st.paid, it.currency)}</span></td>
      <td className={t.right}><span className={`${t.amt} ${st.remaining === null ? t.amtMuted : ''}`}>{st.remaining === null ? '—' : money(st.remaining, it.currency)}</span></td>
      <td className={t.statusCell}><Status tone={STATE_TONE[st.state]} icon={STATE_ICON[st.state]}>{stateText(st)}</Status></td>
      <td className={t.actionCell}><Link href={href(it)} className={`${t.btn} ${t.btnSmall}`}>{canPay(it) ? 'Ödeme kaydet' : 'Aç'}</Link></td>
    </tr>
  );
}

function MobileCard({ it, today }: { it: Item; today: string }) {
  const [open, setOpen] = useState(false);
  const st = it.summary;
  const id = `gider-kart-${it.key.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <li className={t.card}>
      <div className={t.cardTop}>
        <Link href={href(it)}><strong>{it.title}</strong></Link>
        <Status tone={STATE_TONE[st.state]} icon={STATE_ICON[st.state]}>{stateText(st)}</Status>
      </div>
      <Due it={it} today={today} />
      <div className={t.cardAmounts}>
        <div className={t.cardAmount}><span>Tutar</span>{it.amount ? <b className={t.amt}>{formatAmount(it.amount, it.currency)}</b> : <b className={`${t.amt} ${t.amtMuted}`}>Tutar bekleniyor</b>}</div>
        <div className={t.cardAmount}><span>Kalan</span><b className={`${t.amt} ${st.remaining === null ? t.amtMuted : ''}`}>{st.remaining === null ? '—' : money(st.remaining, it.currency)}</b></div>
      </div>
      {open && (
        <dl id={id} className={t.details}>
          <div><dt>Ödenen</dt><dd className={t.num}>{money(st.paid, it.currency)}</dd></div>
          <div><dt>Kategori</dt><dd>{it.categoryText}</dd></div>
          <div><dt>Sağlayıcı / firma</dt><dd>{it.provider ?? '—'}</dd></div>
          <div><dt>Kaynak</dt><dd>{it.source === 'ops' ? 'Operasyon (burada ikinci kez tutulmaz)' : 'Giderler'}</dd></div>
          <div><dt>Tür / dönem</dt><dd>{[it.recurrence ? RECURRENCE_LABEL[it.recurrence as keyof typeof RECURRENCE_LABEL] : it.source === 'fin' ? 'Tek seferlik' : '', it.periodText].filter(Boolean).join(' · ') || '—'}</dd></div>
        </dl>
      )}
      <div className={t.cardActions}>
        <button type="button" className={`${t.btn} ${t.btnSmall} ${t.btnGhost}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          <Chevron className={open ? t.chevOpen : ''} /> {open ? 'Ayrıntıyı gizle' : 'Ayrıntılar'}
        </button>
        <Link href={href(it)} className={`${t.btn} ${t.btnSmall}`}>{canPay(it) ? 'Ödeme kaydet' : 'Aç'}</Link>
      </div>
    </li>
  );
}

function Definitions({ data, items }: { data: FinData; items: Item[] }) {
  const [showArchived, setShowArchived] = useState(false);
  const partyBy = new Map(data.parties.map((p) => [p.id, p.name] as const));
  const list = data.expenses.filter((e) => showArchived || !e.archived_at);
  return (
    <section className="grid gap-3">
      <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arşivlenenleri göster</label>
      {list.length === 0 ? <Empty text="Gider tanımı yok." /> : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="bg-surface text-[11px] uppercase tracking-[0.06em] text-subtle">
              <tr>{['Gider', 'Kategori', 'Tür', 'Tutar (yeni dönemler)', 'Sağlayıcı / firma', 'Açık dönem', 'Sorumlu'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const open = items.filter((it) => it.expenseId === e.id && !['paid', 'over', 'cancelled'].includes(it.summary.state)).length;
                return (
                  <tr key={e.id} className="border-t border-line">
                    <td className="px-3 py-2.5"><Link href={`${BASE}/${e.id}`} className="font-semibold text-soft hover:underline">{e.title}</Link>{e.archived_at && <> <Badge>Arşivde</Badge></>}</td>
                    <td className="px-3 py-2.5">{CATEGORY_LABEL[e.category]}</td>
                    <td className="px-3 py-2.5">{e.kind === 'recurring' ? `${RECURRENCE_LABEL[e.recurrence ?? 'monthly']}${e.ends_on ? ` · ${fmtDate(e.ends_on)} bitiş` : ''}` : 'Tek seferlik'}</td>
                    <td className="px-3 py-2.5 tabular-nums">{e.amount ? formatAmount(e.amount, e.currency) : <span className="text-subtle">Bilinmiyor</span>}</td>
                    <td className="px-3 py-2.5">{(e.provider_id ? partyBy.get(e.provider_id) : null) ?? e.vendor_name ?? '—'}</td>
                    <td className="px-3 py-2.5">{open}</td>
                    <td className="px-3 py-2.5">{e.owner_email ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="text-[14px] text-subtle">Yükleniyor…</p>}><ExpensesPage /></Suspense>;
}
