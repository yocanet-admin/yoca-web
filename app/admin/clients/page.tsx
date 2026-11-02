'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Notice, StatTile } from '@/components/admin/cockpit/Widgets';
import { fmtDate, timeAgo } from '@/lib/cockpit/client';
import {
  ACTIVITY_ICON,
  ACTIVITY_KINDS,
  ACTIVITY_LABEL,
  CLIENT_LABEL,
  CLIENT_STATUSES,
  CURRENCIES,
  DEAL_LABEL,
  DEAL_STAGES,
  OPEN_STAGES,
  addActivity,
  deleteActivity,
  deleteClient,
  deleteDeal,
  loadCrm,
  money,
  pipelineByCurrency,
  saveClient,
  saveDeal,
  setTaskDone,
  type Activity,
  type ActivityKind,
  type Client,
  type ClientStatus,
  type CrmData,
  type Currency,
  type Deal,
  type DealStage,
} from '@/lib/cockpit/crm';

/**
 * Yoca Admin — Müşteriler (CRM).
 * Clients (prospect → active → past), deals with value and stage, and one
 * activity timeline per client (notes, calls, e-mails, meetings, dated tasks).
 */

const today = () => new Date().toISOString().slice(0, 10);

function ClientsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<CrmData>({ ready: true, clients: [], deals: [], activities: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | ClientStatus>('all');
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const selectedId = searchParams.get('id');

  const reload = async () => {
    setData(await loadCrm());
    setLoading(false);
  };
  useEffect(() => {
    reload();
  }, []);

  const say = (text: string) => {
    setFlash(text);
    setTimeout(() => setFlash(null), 2200);
  };
  const select = (id: string | null) => router.replace(id ? `/admin/clients?id=${id}` : '/admin/clients', { scroll: false });

  const openTasks = data.activities.filter((a) => a.kind === 'task' && !a.done).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
  const overdue = openTasks.filter((a) => a.due_on && a.due_on < today()).length;
  const pipeline = pipelineByCurrency(data.deals);
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const wonThisYear = pipelineByCurrency(data.deals.filter((d) => d.updated_at >= yearStart), ['won']);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return data.clients.filter((c) => (filter === 'all' || c.status === filter) && (!q || [c.name, c.contact_name, c.email].some((v) => v.toLocaleLowerCase('tr').includes(q))));
  }, [data.clients, filter, query]);

  const selected = data.clients.find((c) => c.id === selectedId) ?? null;
  const clientName = (id: string) => data.clients.find((c) => c.id === id)?.name ?? '—';

  const createClient = async () => {
    const name = window.prompt('Firma / marka adı');
    if (!name?.trim()) return;
    const client = await saveClient({ name: name.trim(), status: 'prospect', source_type: 'manual' });
    if (!client) return say('Oluşturulamadı.');
    await reload();
    select(client.id);
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Müşteriler</h1>
          <p className="mt-1.5 text-[14px] text-muted">Adaylar, aktif müşteriler, fırsatlar ve yapılacaklar.</p>
        </div>
        <div className="flex items-center gap-3">
          {flash && <span role="status" className="text-[13px] font-bold text-yoca-lime">{flash}</span>}
          <button type="button" onClick={createClient} disabled={!data.ready} className="admin-btn-primary">
            + Yeni müşteri
          </button>
        </div>
      </header>

      {!data.ready && !loading && (
        <Notice tone="warning">
          CRM tabloları henüz yok. Supabase SQL editöründe <code className="text-yoca-lime">supabase/upgrade-v8-cockpit.sql</code> dosyasını bir kez çalıştırın.
          Leadler sayfasındaki “Müşteri yap” da bundan sonra çalışır.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Aktif müşteri" value={loading ? null : String(data.clients.filter((c) => c.status === 'active').length)} hint={`${data.clients.filter((c) => c.status === 'prospect').length} aday`} />
        <StatTile
          label="Açık fırsat değeri"
          value={loading ? null : pipeline.length ? money(pipeline[0].value, pipeline[0].currency) : '–'}
          hint={pipeline.length > 1 ? pipeline.slice(1).map((p) => money(p.value, p.currency)).join(' + ') : `${data.deals.filter((d) => OPEN_STAGES.includes(d.stage)).length} fırsat`}
        />
        <StatTile label="Bu yıl kazanılan" value={loading ? null : wonThisYear.length ? money(wonThisYear[0].value, wonThisYear[0].currency) : '–'} hint={wonThisYear.length > 1 ? wonThisYear.slice(1).map((p) => money(p.value, p.currency)).join(' + ') : undefined} />
        <StatTile label="Açık görev" value={loading ? null : String(openTasks.length)} hint={overdue ? `${overdue} gecikmiş` : 'gecikmiş yok'} tone={overdue ? 'alert' : 'default'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid content-start gap-4">
          <div className="flex flex-wrap gap-2">
            {(['all', ...CLIENT_STATUSES] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
                className={`rounded-sm border px-3 py-1.5 text-[12px] font-bold ${filter === s ? 'border-yoca-lime bg-yoca-lime text-black' : 'border-line text-muted hover:text-white'}`}
              >
                {s === 'all' ? 'Tümü' : CLIENT_LABEL[s]}
              </button>
            ))}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ara…" aria-label="Müşteri ara" className="admin-input !w-auto flex-1 !py-1.5 text-[12px]" />
          </div>
          {loading ? (
            <p className="text-[14px] text-muted">Yükleniyor…</p>
          ) : visible.length === 0 ? (
            <p className="text-[14px] text-muted">
              Henüz müşteri yok. <Link href="/admin/submissions" className="underline">Leadler</Link>’den “Müşteri yap” ile ya da “Yeni müşteri” ile ekleyin.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {visible.map((client) => {
                const open = pipelineByCurrency(data.deals.filter((d) => d.client_id === client.id));
                const tasks = data.activities.filter((a) => a.client_id === client.id && a.kind === 'task' && !a.done).length;
                return (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={() => select(client.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition-colors ${selectedId === client.id ? 'border-yoca-lime/60 bg-surface' : 'border-line bg-surface-deep/80 hover:border-line hover:bg-surface'}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-extrabold">{client.name}</span>
                        <span className="block truncate text-[12px] text-subtle">
                          {CLIENT_LABEL[client.status]}
                          {client.contact_name ? ` · ${client.contact_name}` : ''}
                        </span>
                      </span>
                      <span className="flex-none text-right text-[12px]">
                        {open[0] && <span className="block font-bold tabular-nums text-white">{money(open[0].value, open[0].currency)}</span>}
                        {tasks > 0 && <span className="block text-subtle">{tasks} görev</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <Card title="Yapılacaklar">
            {openTasks.length === 0 ? (
              <p className="text-[13px] text-subtle">Açık görev yok.</p>
            ) : (
              <ul className="grid gap-2">
                {openTasks.slice(0, 12).map((task) => (
                  <li key={task.id} className="flex items-start gap-2.5 text-[13px]">
                    <input
                      type="checkbox"
                      aria-label="Tamamlandı"
                      className="mt-0.5 accent-yoca-lime"
                      onChange={async () => {
                        if (await setTaskDone(task.id, true)) reload();
                      }}
                    />
                    <button type="button" onClick={() => select(task.client_id)} className="min-w-0 flex-1 text-left">
                      <span className="block text-soft">{task.body}</span>
                      <span className={`text-[12px] ${task.due_on && task.due_on < today() ? 'font-bold text-amber-300' : 'text-subtle'}`}>
                        {clientName(task.client_id)}
                        {task.due_on ? ` · ${fmtDate(task.due_on, false)}${task.due_on < today() ? ' (gecikti)' : ''}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {selected ? (
          <ClientDetail
            key={selected.id}
            client={selected}
            deals={data.deals.filter((d) => d.client_id === selected.id)}
            activities={data.activities.filter((a) => a.client_id === selected.id)}
            onChange={reload}
            onDeleted={() => {
              select(null);
              reload();
            }}
            say={say}
          />
        ) : (
          <div className="hidden rounded-md border border-dashed border-line p-10 text-center text-[14px] text-subtle xl:block">Soldan bir müşteri seçin.</div>
        )}
      </div>
    </div>
  );
}

function ClientDetail({
  client,
  deals,
  activities,
  onChange,
  onDeleted,
  say,
}: {
  client: Client;
  deals: Deal[];
  activities: Activity[];
  onChange: () => void;
  onDeleted: () => void;
  say: (text: string) => void;
}) {
  const [form, setForm] = useState(client);
  const [kind, setKind] = useState<ActivityKind>('note');
  const [body, setBody] = useState('');
  const [due, setDue] = useState('');
  const [newDeal, setNewDeal] = useState({ title: '', value: '', currency: 'TRY' as Currency });
  const dirty = JSON.stringify(form) !== JSON.stringify(client);

  const field = (key: keyof Client, label: string, type = 'text') => (
    <label className="grid gap-1 text-[12px] font-bold text-subtle">
      {label}
      <input type={type} value={(form[key] as string) ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="admin-input text-[13px]" />
    </label>
  );

  return (
    <div className="grid content-start gap-4">
      <Card
        title="Müşteri"
        action={
          <button
            type="button"
            onClick={async () => {
              if (window.confirm(`${client.name} ve tüm fırsat/aktiviteleri kalıcı olarak silinsin mi?`) && (await deleteClient(client.id))) onDeleted();
            }}
            className="text-[12px] font-bold text-subtle hover:text-red-400"
          >
            Sil
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {field('name', 'Firma / marka')}
          {field('contact_name', 'Yetkili')}
          {field('email', 'E-posta', 'email')}
          {field('phone', 'Telefon', 'tel')}
          {field('website', 'Web sitesi', 'url')}
          <label className="grid gap-1 text-[12px] font-bold text-subtle">
            Durum
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })} className="admin-input text-[13px]">
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[12px] font-bold text-subtle sm:col-span-2">
            Not
            <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="admin-input text-[13px]" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!dirty}
            onClick={async () => {
              const { id, name, contact_name, email, phone, website, status, note } = form;
              if (await saveClient({ id, name, contact_name, email, phone, website, status, note })) {
                say('Kaydedildi.');
                onChange();
              } else say('Kaydedilemedi.');
            }}
            className="admin-btn-primary"
          >
            Kaydet
          </button>
          {client.email && (
            <a href={`mailto:${encodeURIComponent(client.email)}`} className="admin-btn">
              E-posta yaz
            </a>
          )}
          {client.source_type && client.source_type !== 'manual' && (
            <Link href={`/admin/submissions?status=all&id=${client.source_id}`} className="admin-btn">
              Kaynak lead
            </Link>
          )}
          <span className="text-[12px] text-subtle">Eklendi: {fmtDate(client.created_at, false)}</span>
        </div>
      </Card>

      <Card title="Fırsatlar">
        {deals.length > 0 && (
          <ul className="mb-4 grid gap-2">
            {deals.map((deal) => (
              <li key={deal.id} className="grid gap-2 rounded-sm border border-line p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                <span className="min-w-0 truncate text-[14px] font-bold">{deal.title}</span>
                <span className="text-[14px] font-extrabold tabular-nums">{money(deal.value, deal.currency)}</span>
                <select
                  value={deal.stage}
                  aria-label="Aşama"
                  onChange={async (e) => {
                    if (await saveDeal({ id: deal.id, client_id: deal.client_id, title: deal.title, stage: e.target.value as DealStage })) {
                      if (e.target.value === 'won' && client.status === 'prospect') await saveClient({ id: client.id, name: client.name, status: 'active' });
                      onChange();
                    }
                  }}
                  className="admin-input !w-auto !py-1 text-[12px]"
                >
                  {DEAL_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {DEAL_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Fırsatı sil"
                  onClick={async () => {
                    if (window.confirm('Fırsat silinsin mi?') && (await deleteDeal(deal.id))) onChange();
                  }}
                  className="text-[12px] text-subtle hover:text-red-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newDeal.title.trim()) return;
            const saved = await saveDeal({ client_id: client.id, title: newDeal.title.trim(), value: Number(newDeal.value) || 0, currency: newDeal.currency, stage: 'discovery' });
            if (saved) {
              setNewDeal({ title: '', value: '', currency: newDeal.currency });
              onChange();
            } else say('Fırsat eklenemedi.');
          }}
        >
          <input value={newDeal.title} onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })} placeholder="Fırsat (ör. Web sitesi + SEO)" aria-label="Fırsat adı" className="admin-input min-w-[180px] flex-1 !py-1.5 text-[13px]" />
          <input value={newDeal.value} onChange={(e) => setNewDeal({ ...newDeal, value: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder="Tutar" aria-label="Tutar" className="admin-input !w-28 !py-1.5 text-[13px]" />
          <select value={newDeal.currency} onChange={(e) => setNewDeal({ ...newDeal, currency: e.target.value as Currency })} aria-label="Para birimi" className="admin-input !w-auto !py-1.5 text-[13px]">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button type="submit" className="admin-btn">
            + Ekle
          </button>
        </form>
      </Card>

      <Card title="Aktivite">
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            const saved = await addActivity({ client_id: client.id, kind, body: body.trim(), due_on: kind === 'task' && due ? due : null });
            if (saved) {
              setBody('');
              setDue('');
              onChange();
            } else say('Eklenemedi.');
          }}
        >
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`rounded-sm border px-2.5 py-1 text-[12px] font-bold ${kind === k ? 'border-yoca-lime text-yoca-lime' : 'border-line text-muted hover:text-white'}`}
              >
                <span aria-hidden="true">{ACTIVITY_ICON[k]}</span> {ACTIVITY_LABEL[k]}
              </button>
            ))}
          </div>
          <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === 'task' ? 'Ne yapılacak?' : 'Ne konuşuldu / ne oldu?'} aria-label="Aktivite metni" className="admin-input text-[13px]" />
          <div className="flex flex-wrap items-center gap-2">
            {kind === 'task' && <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Son tarih" className="admin-input !w-auto !py-1.5 text-[13px]" />}
            <button type="submit" className="admin-btn-primary">
              Ekle
            </button>
          </div>
        </form>

        <ol className="mt-5 grid gap-3 border-l border-line pl-4">
          {activities.length === 0 && <li className="text-[13px] text-subtle">Henüz aktivite yok.</li>}
          {activities.map((a) => (
            <li key={a.id} className="relative">
              <span aria-hidden="true" className="absolute -left-[22px] top-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-line bg-surface-deep" />
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-subtle">
                <span>
                  <span aria-hidden="true">{ACTIVITY_ICON[a.kind]}</span> {ACTIVITY_LABEL[a.kind]} · {timeAgo(a.created_at)}
                  {a.created_by ? ` · ${a.created_by}` : ''}
                </span>
                <span className="flex items-center gap-3">
                  {a.kind === 'task' && (
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={a.done}
                        onChange={async (e) => {
                          if (await setTaskDone(a.id, e.target.checked)) onChange();
                        }}
                        className="accent-yoca-lime"
                      />
                      {a.done ? 'tamamlandı' : a.due_on ? `son tarih ${fmtDate(a.due_on, false)}` : 'açık'}
                    </label>
                  )}
                  <button
                    type="button"
                    aria-label="Aktiviteyi sil"
                    onClick={async () => {
                      if (window.confirm('Silinsin mi?') && (await deleteActivity(a.id))) onChange();
                    }}
                    className="hover:text-red-400"
                  >
                    ✕
                  </button>
                </span>
              </div>
              <p className={`mt-1 whitespace-pre-wrap text-[13px] leading-relaxed ${a.kind === 'task' && a.done ? 'text-subtle line-through' : 'text-soft'}`}>{a.body}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

export default function AdminClients() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Yükleniyor…</p>}>
      <ClientsInner />
    </Suspense>
  );
}
