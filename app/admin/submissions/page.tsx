'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, DailyBars, Notice, StatTile } from '@/components/admin/cockpit/Widgets';
import { LEAD_LABEL, LEAD_PILL, LEAD_STATUSES, OPEN_STATUSES, fmtDate, istanbulToday, timeAgo, type LeadStatus } from '@/lib/cockpit/client';
import { LEAD_LIMIT, deleteLead, deleteLeads, loadLeads, replyHref, updateLead, updateLeads, weeklyCounts, type Lead } from '@/lib/cockpit/leads';
import { clientFromLead } from '@/lib/cockpit/crm';
import { LeadAI } from '@/components/admin/cockpit/LeadAI';
import { adminApi } from '@/lib/cockpit/client';
import { DEFAULT_RESPONSE_TIMES, dueBusinessDay, sanitizeResponseTimes, type ResponseTimes } from '@/lib/responseCopy';

/**
 * Yoca Admin — Lead merkezi.
 * Contact form + Digital Check-Up leads in one pipeline:
 * Yeni → Görüşülüyor → Teklif → Kazanıldı / Kaybedildi (+ Spam).
 * Note, follow-up date, ready-made reply and "make client" (CRM) per lead.
 * Bulk: tick rows (or "select all" in the current filter) → change status or delete.
 * New leads show an internal "hedef" date: the reply target from Ayarlar →
 * Yanıt süreleri, counted in Istanbul business days (Mon–Fri, no holiday data
 * except the admin's own list). It is never shown to visitors.
 */

type TypeFilter = 'all' | 'contact' | 'checkup';
type StatusFilter = 'all' | 'open' | LeadStatus;

function statusParam(value: string | null): StatusFilter {
  return value === 'all' || value === 'open' || (LEAD_STATUSES as readonly string[]).includes(value ?? '') ? (value as StatusFilter) : 'open';
}

/** Refetch on window focus at most this often. */
const FOCUS_REFRESH_MS = 30_000;

function LeadsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>(statusParam(searchParams.get('status')));
  const [type, setType] = useState<TypeFilter>(searchParams.get('tab') === 'checkup' ? 'checkup' : 'all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(searchParams.get('id'));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [targets, setTargets] = useState<ResponseTimes>(DEFAULT_RESPONSE_TIMES);
  const lastLoad = useRef(0);
  const scrolledTo = useRef<string | null>(null);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    setRefreshing(true);
    try {
      const result = await loadLeads();
      setLeads(result.leads);
      setReady(result.schemaReady);
      setError(result.error);
      setCapped(result.capped);
    } catch (err) {
      setError((err as Error)?.message || 'Leadler okunamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reply targets for the internal due date (falls back to 1 / 3 business days).
  useEffect(() => {
    adminApi<{ ok: boolean; responseTimes?: ResponseTimes }>('/api/admin/site-settings')
      .then((r) => { if (r.ok && r.responseTimes) setTargets(sanitizeResponseTimes(r.responseTimes)); })
      .catch(() => undefined);
  }, []);

  // New leads arrive while the tab is open: refetch when the window regains focus.
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastLoad.current > FOCUS_REFRESH_MS) load();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const say = (text: string) => {
    setFlash(text);
    setTimeout(() => setFlash(null), 2200);
  };

  const counts = useMemo(() => {
    const map = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
    for (const lead of leads) map[lead.status] += 1;
    return map;
  }, [leads]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return leads.filter((lead) => {
      if (type !== 'all' && lead.type !== type) return false;
      if (status === 'open' && !OPEN_STATUSES.includes(lead.status)) return false;
      if (status !== 'open' && status !== 'all' && lead.status !== status) return false;
      if (q && ![lead.name, lead.company, lead.email, lead.message].some((v) => v.toLocaleLowerCase('tr').includes(q))) return false;
      return true;
    });
  }, [leads, status, type, query]);

  // A new filter starts with a clean selection, so a bulk action never touches rows you cannot see.
  useEffect(() => setSelected(new Set()), [status, type, query]);

  // Deep link (?id=…): make sure the lead is in the current filter, scroll to it and highlight it once.
  useEffect(() => {
    const target = searchParams.get('id');
    if (!target || loading || scrolledTo.current === target) return;
    const lead = leads.find((l) => l.id === target);
    if (!lead) return;
    if (!visible.some((l) => l.id === target)) {
      setStatus('all');
      setType('all');
      setQuery('');
      return;
    }
    scrolledTo.current = target;
    setOpenId(target);
    setHighlightId(target);
    requestAnimationFrame(() => document.getElementById(`lead-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [searchParams, leads, visible, loading]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const keyOf = (lead: Lead) => `${lead.type}:${lead.id}`;
  const picked = visible.filter((lead) => selected.has(keyOf(lead)));
  const allPicked = visible.length > 0 && picked.length === visible.length;
  const toggle = (lead: Lead) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(keyOf(lead))) next.delete(keyOf(lead));
      else next.add(keyOf(lead));
      return next;
    });
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(visible.map(keyOf)));

  const bulkStatus = async (next: LeadStatus) => {
    if (!ready || picked.length === 0) return;
    setBusy(true);
    const ok = await updateLeads(picked, { status: next });
    setBusy(false);
    if (!ok) return say('Bazı kayıtlar güncellenemedi.');
    const keys = new Set(picked.map(keyOf));
    setLeads((current) => current.map((l) => (keys.has(keyOf(l)) ? { ...l, status: next } : l)));
    setSelected(new Set());
    say(`${keys.size} lead → ${LEAD_LABEL[next]}`);
  };

  const bulkDelete = async (targets: Lead[]) => {
    if (targets.length === 0) return;
    if (!window.confirm(`${targets.length} lead kalıcı olarak silinsin mi? Bu geri alınamaz.`)) return;
    setBusy(true);
    const ok = await deleteLeads(targets);
    setBusy(false);
    if (!ok) {
      say('Bazı kayıtlar silinemedi.');
      return load();
    }
    const keys = new Set(targets.map(keyOf));
    setLeads((current) => current.filter((l) => !keys.has(keyOf(l))));
    setSelected(new Set());
    say(`${keys.size} lead silindi.`);
  };

  const weekAgo = Date.now() - 7 * 86_400_000;
  const real = leads.filter((l) => l.status !== 'spam');
  const lastWeek = real.filter((l) => new Date(l.createdAt).getTime() >= weekAgo).length;
  const waiting = real.filter((l) => l.status === 'new' && Date.now() - new Date(l.createdAt).getTime() > 86_400_000).length;
  const decided = counts.won + counts.lost;
  const winRate = decided ? Math.round((counts.won / decided) * 100) : null;

  const change = async (lead: Lead, patch: Parameters<typeof updateLead>[1]) => {
    if (!ready) return;
    const ok = await updateLead(lead, patch);
    if (!ok) return say('Kaydedilemedi.');
    setLeads((current) =>
      current.map((l) =>
        l.id === lead.id && l.type === lead.type
          ? { ...l, ...(patch.status ? { status: patch.status } : {}), ...(patch.note !== undefined ? { note: patch.note } : {}), ...(patch.follow_up_on !== undefined ? { followUpOn: patch.follow_up_on } : {}) }
          : l,
      ),
    );
    say('Kaydedildi.');
  };

  // Note saves for one lead run one after another (blur-save, then "AI özetini nota ekle"),
  // so an older text can never land after a newer one.
  const noteQueue = useRef<Record<string, Promise<unknown>>>({});
  const saveNote = (lead: Lead, text: string) => {
    const k = keyOf(lead);
    const run = (noteQueue.current[k] ?? Promise.resolve()).then(() => change(lead, { note: text }));
    noteQueue.current[k] = run.catch(() => undefined);
    return run;
  };

  const remove = async (lead: Lead) => {
    if (!window.confirm(`${lead.name} kalıcı olarak silinsin mi?`)) return;
    if (await deleteLead(lead)) {
      setLeads((current) => current.filter((l) => !(l.id === lead.id && l.type === lead.type)));
      say('Silindi.');
    } else say('Silinemedi — oturumunuzu kontrol edin.');
  };

  const makeClient = async (lead: Lead) => {
    const client = await clientFromLead(lead);
    if (!client) return say('Müşteri oluşturulamadı — CRM tabloları (SQL v8) kurulu mu?');
    if (client.matched) {
      if (lead.status === 'new') await change(lead, { status: 'contacted' });
      say(`Aynı e-posta ya da firma adıyla kayıtlı müşteri bulundu (${client.name}) — yeni kayıt açılmadı, talep o kayda not olarak eklendi.`);
      return router.push(`/admin/clients?id=${client.id}`);
    }
    if (client.existing) {
      say('Bu lead zaten müşteri — mevcut kayıt açılıyor.');
      return router.push(`/admin/clients?id=${client.id}`);
    }
    if (lead.status === 'new') await change(lead, { status: 'contacted' });
    router.push(`/admin/clients?id=${client.id}`);
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Leadler</h1>
          <p className="mt-1.5 text-[14px] text-muted">İletişim formu ve Digital Check-Up başvuruları — tek akışta.</p>
        </div>
        <div className="flex items-center gap-3">
          {flash && <span role="status" className="text-[13px] font-bold text-yoca-lime">{flash}</span>}
          <button type="button" onClick={load} disabled={refreshing} className="admin-btn">
            {refreshing && !loading ? 'Yenileniyor…' : '↻ Yenile'}
          </button>
        </div>
      </header>

      {error && !loading && (
        <Notice tone="warning">
          Leadler okunamadı: {error}{' '}
          <button type="button" onClick={load} className="font-bold underline">
            Tekrar dene
          </button>
        </Notice>
      )}
      {capped && (
        <Notice tone="warning">
          Liste en yeni {LEAD_LIMIT} kayıtla sınırlı — daha eski leadler burada görünmüyor. Eski spam kayıtlarını silerek listeyi küçültebilirsiniz.
        </Notice>
      )}

      {!ready && !loading && (
        <Notice tone="warning">
          Durum, not ve takip tarihi için Supabase’de <code className="text-yoca-lime">supabase/upgrade-v8-cockpit.sql</code> dosyasını bir kez
          çalıştırın. O zamana kadar tüm leadler “Yeni” görünür ve değişiklikler kaydedilmez.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Son 7 gün" value={loading ? null : String(lastWeek)} hint="yeni lead (spam hariç)" />
        <StatTile label="Yanıt bekleyen" value={loading ? null : String(waiting)} hint="24 saatten eski, durumu Yeni" tone={waiting ? 'alert' : 'default'} />
        <StatTile label="Açık fırsat" value={loading ? null : String(counts.new + counts.contacted + counts.proposal)} hint="Yeni + Görüşülüyor + Teklif" />
        <StatTile label="Kazanma oranı" value={loading ? null : winRate === null ? '–' : `%${winRate}`} hint={`${counts.won} kazanıldı · ${counts.lost} kaybedildi`} />
      </div>

      <Card title="Haftalık lead">
        <DailyBars data={weeklyCounts(leads, 12)} label="Lead (hafta başı)" />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['open', `Açık (${counts.new + counts.contacted + counts.proposal})`],
            ['all', `Tümü (${leads.length})`],
            ...LEAD_STATUSES.map((s) => [s, `${LEAD_LABEL[s]} (${counts[s]})`]),
          ] as Array<[typeof status, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            aria-pressed={status === key}
            className={`rounded-sm border px-3 py-1.5 text-[12px] font-bold transition-colors ${status === key ? 'border-yoca-lime bg-yoca-lime text-black' : 'border-line text-muted hover:text-white'}`}
          >
            {label}
          </button>
        ))}
        <select value={type} onChange={(e) => setType(e.target.value as TypeFilter)} className="admin-input !w-auto !py-1.5 text-[12px]" aria-label="Lead türü">
          <option value="all">Tüm kaynaklar</option>
          <option value="contact">İletişim formu</option>
          <option value="checkup">Digital Check-Up</option>
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ara: isim, şirket, e-posta…" className="admin-input !w-auto min-w-[220px] flex-1 !py-1.5 text-[12px]" aria-label="Lead ara" />
      </div>

      {!loading && visible.length > 0 && (
        <div className="sticky top-14 z-10 -my-2 lg:top-0 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-deep/95 px-4 py-2.5 backdrop-blur">
          <label className="flex items-center gap-2 text-[12px] font-bold text-soft">
            <input
              type="checkbox"
              checked={allPicked}
              ref={(el) => {
                if (el) el.indeterminate = picked.length > 0 && !allPicked;
              }}
              onChange={toggleAll}
              className="h-4 w-4 accent-yoca-lime"
            />
            {picked.length > 0 ? `${picked.length} seçili` : `Tümünü seç (${visible.length})`}
          </label>
          {picked.length > 0 ? (
            <>
              <select
                value=""
                disabled={!ready || busy}
                onChange={(e) => e.target.value && bulkStatus(e.target.value as LeadStatus)}
                aria-label="Seçilenlerin durumunu değiştir"
                className="admin-input !w-auto !py-1 text-[12px]"
              >
                <option value="">Durumu değiştir…</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_LABEL[s]}
                  </option>
                ))}
              </select>
              {status !== 'spam' && (
                <button type="button" disabled={!ready || busy} onClick={() => bulkStatus('spam')} className="admin-btn !py-1 text-[12px]">
                  Spam olarak işaretle
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => bulkDelete(picked)} className="admin-btn !py-1 text-[12px] hover:!border-red-400 hover:!text-red-400">
                Seçilenleri sil
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] text-subtle hover:text-white">
                Seçimi kaldır
              </button>
            </>
          ) : (
            status === 'spam' && (
              <button type="button" disabled={busy} onClick={() => bulkDelete(visible)} className="admin-btn ml-auto !py-1 text-[12px] hover:!border-red-400 hover:!text-red-400">
                Tüm spamı sil ({visible.length})
              </button>
            )
          )}
          {busy && <span className="text-[12px] text-subtle">İşleniyor…</span>}
        </div>
      )}

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : visible.length === 0 ? (
        <p className="text-[14px] text-muted">Bu filtrede lead yok.</p>
      ) : (
        <ul className="grid gap-2">
          {visible.map((lead) => {
            const key = keyOf(lead);
            const open = openId === lead.id;
            const overdue = lead.followUpOn && lead.followUpOn < istanbulToday() && OPEN_STATUSES.includes(lead.status);
            return (
              <li
                key={key}
                id={`lead-${lead.id}`}
                className={`scroll-mt-24 rounded-md border bg-surface-deep/80 transition-shadow duration-500 ${highlightId === lead.id ? 'ring-2 ring-yoca-lime/70' : ''} ${open ? 'border-yoca-lime/40' : selected.has(key) ? 'border-yoca-lime/25' : 'border-line'}`}
              >
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => toggle(lead)}
                    aria-label={`${lead.name || lead.email} seç`}
                    className="h-4 w-4 flex-none accent-yoca-lime"
                  />
                  <button type="button" onClick={() => setOpenId(open ? null : lead.id)} className="flex min-w-[12rem] flex-1 items-center gap-3 text-left" aria-expanded={open}>
                    {lead.type === 'checkup' ? (
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-sm border border-line text-[13px] font-extrabold tabular-nums text-white" title="Check-Up skoru">
                        {lead.score ?? '–'}
                      </span>
                    ) : (
                      <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-sm border border-line text-[14px] text-subtle">
                        ✉
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-extrabold">{lead.name || '—'}</span>
                      <span className="block truncate text-[12px] text-subtle">
                        {lead.company ? `${lead.company} · ` : ''}
                        {lead.email}
                      </span>
                    </span>
                  </button>
                  <span className="text-[12px] text-subtle" title={fmtDate(lead.createdAt)}>
                    {lead.type === 'checkup' ? 'Check-Up · ' : 'Form · '}
                    {timeAgo(lead.createdAt)}
                  </span>
                  {overdue && <span className="text-[11px] font-bold text-amber-300">▲ takip gecikti</span>}
                  {lead.status === 'new' && (() => {
                    const due = dueBusinessDay(new Date(lead.createdAt), lead.type === 'checkup' ? targets.checkupDays : targets.contactDays, targets.holidays);
                    const late = due < istanbulToday();
                    return (
                      <span className={`text-[11px] font-bold ${late ? 'text-amber-300' : 'text-subtle'}`} title="İç yanıt hedefi (İstanbul iş günü, hafta sonu hariç). Ziyaretçiye gösterilmez.">
                        hedef {due.slice(8, 10)}.{due.slice(5, 7)}{late ? ' · geçti' : ''}
                      </span>
                    );
                  })()}
                  {lead.aiSummary && (
                    <span className="text-[11px] font-bold text-subtle" title={lead.aiSummary.ozet}>
                      AI {lead.aiSummary.uygunluk}/5
                    </span>
                  )}
                  <select
                    value={lead.status}
                    disabled={!ready}
                    onChange={(e) => change(lead, { status: e.target.value as LeadStatus })}
                    aria-label={`${lead.name} durumu`}
                    className={`rounded-sm border bg-surface px-2 py-1 text-[12px] font-bold ${LEAD_PILL[lead.status]}`}
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>

                {open && (
                  <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <div>
                      {lead.type === 'contact' ? (
                        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-soft">{lead.message}</p>
                      ) : (
                        <dl className="grid gap-1.5">
                          {lead.answers.map(([k, answer]) => (
                            <div key={k} className="grid grid-cols-[150px_1fr] gap-3 text-[13px]">
                              <dt className="text-subtle">{k}</dt>
                              <dd className="text-soft">{answer?.v ?? ''}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <p className="mt-3 text-[12px] text-subtle">
                        {fmtDate(lead.createdAt)} · dil: {lead.locale || '—'}
                        {lead.phone ? ` · ${lead.phone}` : ''}
                      </p>
                      <div className="mt-4">
                        <LeadAI
                          lead={lead}
                          onSummary={(summary, at) =>
                            setLeads((current) => current.map((l) => (keyOf(l) === key ? { ...l, aiSummary: summary, aiSummaryAt: at } : l)))
                          }
                          currentNote={notes[key] ?? lead.note}
                          onNote={(text) => {
                            setNotes((n) => ({ ...n, [key]: text }));
                            saveNote(lead, text);
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid content-start gap-3">
                      <label className="grid gap-1 text-[12px] font-bold text-subtle">
                        Not
                        <textarea
                          rows={3}
                          disabled={!ready}
                          value={notes[key] ?? lead.note}
                          onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                          onBlur={() => notes[key] !== undefined && notes[key] !== lead.note && saveNote(lead, notes[key])}
                          className="admin-input text-[13px]"
                          placeholder="Görüşme notu, bütçe, beklenti…"
                        />
                      </label>
                      <label className="grid gap-1 text-[12px] font-bold text-subtle">
                        Takip tarihi
                        <input
                          type="date"
                          disabled={!ready}
                          value={lead.followUpOn ?? ''}
                          onChange={(e) => change(lead, { follow_up_on: e.target.value || null })}
                          className="admin-input !w-auto text-[13px]"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <a href={replyHref(lead)} className="admin-btn-primary">
                          Yanıtla
                        </a>
                        <button type="button" onClick={() => makeClient(lead)} className="admin-btn">
                          Müşteri yap →
                        </button>
                        {lead.status !== 'spam' && (
                          <button type="button" disabled={!ready} onClick={() => change(lead, { status: 'spam' })} className="admin-btn">
                            Spam
                          </button>
                        )}
                        <button type="button" onClick={() => remove(lead)} className="admin-btn hover:!border-red-400 hover:!text-red-400">
                          Sil
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[12px] text-subtle">
        Spam filtresinin engelledikleri <Link href="/admin" className="underline">Kokpit</Link>’te sayılır; engellenenler buraya hiç düşmez.
      </p>
    </div>
  );
}

export default function AdminLeads() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Yükleniyor…</p>}>
      <LeadsInner />
    </Suspense>
  );
}
