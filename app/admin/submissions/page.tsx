'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, DailyBars, Notice, StatTile } from '@/components/admin/cockpit/Widgets';
import { LEAD_LABEL, LEAD_PILL, LEAD_STATUSES, OPEN_STATUSES, fmtDate, timeAgo, type LeadStatus } from '@/lib/cockpit/client';
import { deleteLead, loadLeads, replyHref, updateLead, weeklyCounts, type Lead } from '@/lib/cockpit/leads';
import { clientFromLead } from '@/lib/cockpit/crm';

/**
 * Yoca Admin — Lead merkezi.
 * Contact form + Digital Check-Up leads in one pipeline:
 * Yeni → Görüşülüyor → Teklif → Kazanıldı / Kaybedildi (+ Spam).
 * Note, follow-up date, ready-made reply and "make client" (CRM) per lead.
 */

type TypeFilter = 'all' | 'contact' | 'checkup';

function LeadsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'all' | 'open' | LeadStatus>((searchParams.get('status') as LeadStatus) || 'open');
  const [type, setType] = useState<TypeFilter>(searchParams.get('tab') === 'checkup' ? 'checkup' : 'all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(searchParams.get('id'));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

  const load = async () => {
    const result = await loadLeads();
    setLeads(result.leads);
    setReady(result.schemaReady);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

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

  const remove = async (lead: Lead) => {
    if (!window.confirm(`${lead.name} kalıcı olarak silinsin mi?`)) return;
    if (await deleteLead(lead)) {
      setLeads((current) => current.filter((l) => !(l.id === lead.id && l.type === lead.type)));
      say('Silindi.');
    }
  };

  const makeClient = async (lead: Lead) => {
    const client = await clientFromLead(lead);
    if (!client) return say('Müşteri oluşturulamadı — CRM tabloları (SQL v8) kurulu mu?');
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
        {flash && <span role="status" className="text-[13px] font-bold text-yoca-lime">{flash}</span>}
      </header>

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

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : visible.length === 0 ? (
        <p className="text-[14px] text-muted">Bu filtrede lead yok.</p>
      ) : (
        <ul className="grid gap-2">
          {visible.map((lead) => {
            const key = `${lead.type}:${lead.id}`;
            const open = openId === lead.id;
            const overdue = lead.followUpOn && lead.followUpOn < new Date().toISOString().slice(0, 10) && OPEN_STATUSES.includes(lead.status);
            return (
              <li key={key} className={`rounded-md border bg-surface-deep/80 ${open ? 'border-yoca-lime/40' : 'border-line'}`}>
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button type="button" onClick={() => setOpenId(open ? null : lead.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
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
                    </div>
                    <div className="grid content-start gap-3">
                      <label className="grid gap-1 text-[12px] font-bold text-subtle">
                        Not
                        <textarea
                          rows={3}
                          disabled={!ready}
                          value={notes[key] ?? lead.note}
                          onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                          onBlur={() => notes[key] !== undefined && notes[key] !== lead.note && change(lead, { note: notes[key] })}
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
