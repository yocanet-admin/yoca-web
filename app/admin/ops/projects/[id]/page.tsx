'use client';

import Link from 'next/link';
import { LabeledDate } from '@/components/admin/DateField';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Badge, DateOr, Details, Documents, Empty, EntityLink, Flash, PageHead, field, fmtDate, fmtDateTime, label, small } from '@/components/admin/ops/ui';
import { archiveRow, db, loadOps, removeLink, saveRow, type OpsData, type Project, type Task } from '@/lib/ops/data';
import { KIND_LABEL, PARTY_LABEL, SERVICE_STATUS_LABEL, dueText, istanbulDay } from '@/lib/ops/model';
import { DEFAULT_CASE_STUDY_SLUGS } from '@/lib/workData';

/**
 * Yoca Operasyon — one project: client, dates, optional portfolio slug,
 * important links, linked services (with domain/hosting ownership and
 * handover state from the services themselves), the delivery / handover
 * checklist, documents. Projects are archived, never deleted.
 */

const STATUS: Record<Project['status'], string> = { active: 'Sürüyor', paused: 'Beklemede', done: 'Tamamlandı' };
const TASK_KIND: Record<Task['kind'], string> = { delivery: 'Teslim', handover: 'Devir', task: 'Görev' };
const TASK_STATUS: Record<Task['status'], string> = { todo: 'Yapılacak', doing: 'Sürüyor', done: 'Tamam', skipped: 'Atlandı' };

const TEMPLATE: Array<{ kind: Task['kind']; title: string }> = [
  { kind: 'delivery', title: 'Site / uygulama canlıya alındı ve kontrol edildi' },
  { kind: 'delivery', title: 'Müşteriye yönetim paneli eğitimi verildi' },
  { kind: 'delivery', title: 'Teslim belgeleri ve erişim listesi gönderildi' },
  { kind: 'handover', title: 'Domain sahipliği / yöneticisi netleşti' },
  { kind: 'handover', title: 'Hosting / sunucu erişimi devredildi veya Yoca’da kaldığı yazıldı' },
  { kind: 'handover', title: 'Son yedek alındı, yeri yazıldı' },
];

const nz = (v: string) => (v.trim() ? v.trim() : null);

function safeHref(u: string): string | null {
  const v = u.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return `https://${v}`;
  return null;
}

interface Draft { name: string; client_id: string; status: Project['status']; start_on: string; delivered_on: string; work_slug: string; note: string; links: Array<{ label: string; url: string }> }
const toDraft = (p: Project): Draft => ({
  name: p.name, client_id: p.client_id ?? '', status: p.status, start_on: p.start_on ?? '', delivered_on: p.delivered_on ?? '',
  work_slug: p.work_slug ?? '', note: p.note ?? '', links: Array.isArray(p.links) ? p.links.map((l) => ({ label: l.label ?? '', url: l.url ?? '' })) : [],
});

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const [data, setData] = useState<OpsData | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [taskErr, setTaskErr] = useState<string | null>(null);
  const [slugs, setSlugs] = useState<string[]>(DEFAULT_CASE_STUDY_SLUGS);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'bad' | 'warn' } | null>(null);
  const say = (text: string, tone: 'ok' | 'bad' | 'warn' = 'ok') => setFlash({ text, tone });

  const reload = async () => setData(await loadOps());
  const reloadTasks = async () => {
    try {
      const { data: rows, error } = await db().from('ops_tasks').select('*').eq('project_id', id).order('sort').order('created_at');
      if (error) { setTaskErr(error.message); setTasks([]); return; }
      setTaskErr(null);
      setTasks((rows ?? []) as Task[]);
    } catch (e) { setTaskErr((e as Error).message); setTasks([]); }
  };
  useEffect(() => {
    void reload();
    void reloadTasks();
    (async () => {
      try {
        const { data: rows } = await db().from('case_studies').select('slug');
        const extra = ((rows ?? []) as Array<{ slug: string }>).map((r) => r.slug).filter(Boolean);
        setSlugs(Array.from(new Set([...DEFAULT_CASE_STUDY_SLUGS, ...extra])).sort());
      } catch { /* code slugs only */ }
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const project = data?.projects.find((p) => p.id === id) ?? null;
  const today = istanbulDay();

  if (!data) return <p className="text-[13px] text-subtle">Yükleniyor…</p>;
  if (data.error) return <div className="grid gap-4"><PageHead title="Proje" /><Flash tone="bad" message={data.error} /></div>;
  if (!project) return <div className="grid gap-4"><PageHead title="Proje bulunamadı" /><Empty text="Bu proje bulunamadı." action={<Link className="admin-btn" href="/admin/ops/clients">Müşterilere dön</Link>} /></div>;

  const client = data.parties.find((p) => p.id === project.client_id) ?? null;

  const toggleArchive = async () => {
    const to = !project.archived_at;
    if (to && !window.confirm(`“${project.name}” arşivlensin mi? Proje, görevleri ve bağlantıları silinmez.`)) return;
    const err = await archiveRow('ops_projects', project.id, to);
    if (err) say(err, 'bad'); else { say(to ? 'Arşivlendi.' : 'Arşivden çıkarıldı.'); await reload(); }
  };

  return (
    <div className="grid gap-5">
      <PageHead
        title={project.name}
        sub={[client ? `Müşteri: ${client.name}` : 'Müşteri atanmadı', STATUS[project.status]].join(' · ')}
        actions={<>
          {client && <Link href={`/admin/ops/clients/${client.id}?tab=projeler`} className="admin-btn">← {client.name}</Link>}
          <Link href={`/admin/ops/services/new?${client ? `client=${client.id}&` : ''}project=${project.id}`} className="admin-btn-primary">+ Yeni hizmet</Link>
        </>}
      />
      {project.archived_at && <Flash tone="warn" message={`Bu proje arşivde (${fmtDateTime(project.archived_at)}).`} />}
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}

      <ProjectForm project={project} data={data} slugs={slugs} onSaved={async () => { say('Kaydedildi.'); await reload(); }} onError={(m) => say(m, 'bad')} onArchive={toggleArchive} />
      <LinkedServices project={project} data={data} today={today} onChange={async (m) => { say(m); await reload(); }} onError={(m) => say(m, 'bad')} />
      <Checklist projectId={project.id} tasks={tasks} error={taskErr} today={today} onChange={reloadTasks} onError={(m) => say(m, 'bad')} />

      {data.licenses.some((l) => l.project_id === project.id) && (
        <section className="admin-card grid gap-2 !p-4">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Lisanslar</h2>
          <ul className="grid gap-1 text-[13px]">
            {data.licenses.filter((l) => l.project_id === project.id).map((l) => (
              <li key={l.id} className="border-t border-line py-1.5">{l.label || l.license_id} <span className="font-mono text-[12px] text-subtle">{l.license_id}</span>{l.last_synced_at && <span className="text-[12px] text-subtle"> · anlık görüntü {fmtDateTime(l.last_synced_at)}</span>}</li>
            ))}
          </ul>
          <Link href="/admin/ops/licenses" className="text-[12px] text-subtle underline">Lisanslar sayfası →</Link>
        </section>
      )}

      <section className="admin-card grid gap-2 !p-4">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Belgeler</h2>
        <Documents entity="project" entityId={project.id} />
      </section>
    </div>
  );
}

/* ── Proje bilgileri + önemli bağlantılar ─────────────────────────── */

function ProjectForm({ project, data, slugs, onSaved, onError, onArchive }: { project: Project; data: OpsData; slugs: string[]; onSaved: () => void; onError: (m: string) => void; onArchive: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(project));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setD(toDraft(project)); }, [project]);
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(project));
  const clients = data.parties.filter((p) => !p.archived_at || p.id === project.client_id);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.name.trim()) { onError('Proje adı gerekli.'); return; }
    const links = d.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.url || l.label);
    const bad = links.find((l) => !l.url || !safeHref(l.url));
    if (bad) { onError(`Geçersiz bağlantı: “${bad.label || bad.url || 'boş'}”. Adres http(s):// ile başlamalı.`); return; }
    if (d.start_on && d.delivered_on && d.delivered_on < d.start_on) { onError('Teslim tarihi başlangıçtan önce olamaz.'); return; }
    setBusy(true);
    const r = await saveRow<Partial<Project>>('ops_projects', {
      id: project.id, name: d.name.trim(), client_id: d.client_id || null, status: d.status, start_on: d.start_on || null, delivered_on: d.delivered_on || null,
      work_slug: nz(d.work_slug), note: nz(d.note), links: links.map((l) => ({ label: l.label || l.url, url: safeHref(l.url) as string })),
    });
    setBusy(false);
    if (r.error) onError(r.error); else onSaved();
  };

  const setLink = (i: number, k: 'label' | 'url', v: string) => setD((x) => ({ ...x, links: x.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const knownSlug = d.work_slug && slugs.includes(d.work_slug.trim());

  return (
    <form onSubmit={save} className="admin-card grid gap-4 !p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Proje adı *<input className={field} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required /></label>
        <label className={label}>Müşteri
          <select className={field} value={d.client_id} onChange={(e) => setD({ ...d, client_id: e.target.value })}>
            <option value="">Atanmadı</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.archived_at ? ' (arşivde)' : ''}</option>)}
          </select>
        </label>
        <label className={label}>Durum
          <select className={field} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as Project['status'] })}>
            {(Object.keys(STATUS) as Project['status'][]).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <LabeledDate label="Başlangıç" value={d.start_on} onChange={(v) => setD({ ...d, start_on: v })} />
          <LabeledDate label="Teslim" value={d.delivered_on} onChange={(v) => setD({ ...d, delivered_on: v })} />
        </div>
      </div>

      <Details title="Portfolyo bağlantısı" hint={d.work_slug || 'yok'}>
        <label className={label}>Portfolyo slug’ı (isteğe bağlı)
          <input className={field} list="ops-work-slugs" value={d.work_slug} onChange={(e) => setD({ ...d, work_slug: e.target.value })} placeholder="ör. prime-wash-car" />
          <datalist id="ops-work-slugs">{slugs.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <p className="text-[12px] text-subtle">
          {!d.work_slug ? 'Sitedeki bir Work projesiyle eşleştirmek için slug seçin.' : knownSlug
            ? <>Sitedeki sayfa: <a className="underline" href={`/work/${encodeURIComponent(d.work_slug.trim())}`} target="_blank" rel="noopener noreferrer">/work/{d.work_slug.trim()}</a> · <Link className="underline" href="/admin/work">Work yönetimi</Link></>
            : 'Bu slug bilinen Work projeleri arasında yok (yine de kaydedilebilir).'}
        </p>
      </Details>

      <Details title="Önemli bağlantılar" hint={`${d.links.filter((l) => l.url).length} bağlantı`} open={d.links.length > 0}>
        {d.links.length === 0 && <p className="text-[12px] text-subtle">Canlı site, test ortamı, tasarım dosyası, depo… (şifre yazmayın).</p>}
        {d.links.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
            <label className={label}>Ad<input className={field} value={l.label} onChange={(e) => setLink(i, 'label', e.target.value)} placeholder="ör. Canlı site" /></label>
            <label className={label}>Adres<input className={field} value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} placeholder="https://…" /></label>
            <span className="flex gap-1.5">
              {safeHref(l.url) && <a className={small} href={safeHref(l.url) as string} target="_blank" rel="noopener noreferrer">Aç</a>}
              <button type="button" className={small} onClick={() => setD((x) => ({ ...x, links: x.links.filter((_, j) => j !== i) }))}>Kaldır</button>
            </span>
          </div>
        ))}
        <button type="button" className={`${small} justify-self-start`} onClick={() => setD((x) => ({ ...x, links: [...x.links, { label: '', url: '' }] }))}>+ Bağlantı ekle</button>
      </Details>

      <label className={label}>Not<textarea className={field} rows={3} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || !dirty} className="admin-btn-primary">{busy ? 'Kaydediliyor…' : dirty ? 'Kaydet' : 'Kaydedildi'}</button>
        {dirty && <button type="button" className="admin-btn" onClick={() => setD(toDraft(project))}>Geri al</button>}
        <span className="flex-1" />
        <button type="button" className="admin-btn" onClick={onArchive}>{project.archived_at ? 'Arşivden çıkar' : 'Arşivle'}</button>
      </div>
    </form>
  );
}

/* ── Bağlı hizmetler, sahiplik ve devir ───────────────────────────── */

function LinkedServices({ project, data, today, onChange, onError }: { project: Project; data: OpsData; today: string; onChange: (m: string) => void; onError: (m: string) => void }) {
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const links = data.links.filter((l) => l.project_id === project.id);
  const linked = links.map((l) => ({ link: l, s: data.services.find((s) => s.id === l.service_id) })).filter((x) => x.s);
  const available = useMemo(() => data.services.filter((s) => !s.archived_at && !links.some((l) => l.service_id === s.id)), [data.services, links]);
  const partyName = (cid: string | null) => (cid ? data.parties.find((p) => p.id === cid)?.name ?? null : null);

  const addLink = async () => {
    if (!pick) return;
    setBusy(true);
    const { error } = await db().from('ops_service_links').insert({ service_id: pick, project_id: project.id });
    setBusy(false);
    if (error) onError(/duplicate|unique/i.test(error.message) ? 'Bu hizmet zaten bağlı.' : error.message);
    else { setPick(''); onChange('Hizmet projeye bağlandı.'); }
  };
  const unlink = async (linkId: string, name: string) => {
    if (!window.confirm(`“${name}” bu projeden ayrılsın mı? Hizmetin kendisi ve geçmişi silinmez.`)) return;
    const err = await removeLink('ops_service_links', linkId);
    if (err) onError(err); else onChange('Bağlantı kaldırıldı.');
  };

  return (
    <section className="admin-card grid gap-3 !p-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Hizmetler, sahiplik ve devir</h2>
      {linked.length === 0 ? <Empty text="Bu projeye bağlı hizmet yok (domain, hosting, e-posta, bakım…)." /> : (
        <ul className="grid gap-2 text-[13px]">
          {linked.map(({ link, s }) => {
            if (!s) return null;
            const det = (s.details ?? {}) as Record<string, unknown>;
            const handover = typeof det.handover === 'string' && det.handover.trim() ? det.handover : null;
            const ownerName = partyName(s.owner_client_id);
            const end = data.periods.find((p) => p.service_id === s.id && p.status === 'open')?.ends_on ?? s.end_on;
            return (
              <li key={link.id} className="grid gap-1 border-t border-line pt-2">
                <span className="flex flex-wrap items-center gap-2">
                  <EntityLink href={`/admin/ops/services/${s.id}`}>{s.name}</EntityLink>
                  <Badge>{KIND_LABEL[s.kind] ?? s.kind}</Badge>
                  <Badge tone={s.status === 'active' ? 'ok' : 'muted'}>{SERVICE_STATUS_LABEL[s.status] ?? s.status}</Badge>
                  <span className="flex-1" />
                  <button type="button" className={small} onClick={() => unlink(link.id, s.name)}>Projeden ayır</button>
                </span>
                <span className="grid gap-x-4 gap-y-0.5 text-[12px] text-muted sm:grid-cols-3">
                  <span>Sahibi: {s.owner_party === 'unknown' ? <span className="italic text-subtle">Bilinmiyor</span> : `${PARTY_LABEL[s.owner_party] ?? s.owner_party}${ownerName ? ` (${ownerName})` : ''}`}</span>
                  <span>Devir durumu: {handover ?? <span className="italic text-subtle">Yazılmadı</span>}</span>
                  <span>Bitiş: {s.is_perpetual ? 'Süresiz' : <><DateOr value={end} />{end && ` · ${dueText(end, today)}`}</>}</span>
                  {s.kind === 'domain' && typeof det.registrant === 'string' && det.registrant && <span>Kayıtlı sahibi: {det.registrant}</span>}
                  {typeof det.manager === 'string' && det.manager && <span>Hesabı yöneten: {det.manager}</span>}
                  <span>Ödeyen: {PARTY_LABEL[s.payer_party] ?? s.payer_party}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${label} min-w-[14rem] flex-1`}>Mevcut hizmeti bağla
          <select className={field} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Seçin…</option>
            {available.map((s) => <option key={s.id} value={s.id}>{s.name} · {KIND_LABEL[s.kind] ?? s.kind}</option>)}
          </select>
        </label>
        <button type="button" className="admin-btn" disabled={!pick || busy} onClick={addLink}>{busy ? 'Bağlanıyor…' : 'Bağla'}</button>
        <Link href={`/admin/ops/services/new?${project.client_id ? `client=${project.client_id}&` : ''}project=${project.id}`} className="admin-btn">+ Yeni hizmet</Link>
      </div>
      <p className="text-[12px] text-subtle">Sahiplik ve devir bilgisi hizmetin kendisinde tutulur (hizmet sayfası → türe özel alanlar “Sahiplik / devir durumu”).</p>
    </section>
  );
}

/* ── Teslim / devir listesi ───────────────────────────────────────── */

function Checklist({ projectId, tasks, error, today, onChange, onError }: { projectId: string; tasks: Task[] | null; error: string | null; today: string; onChange: () => void; onError: (m: string) => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Task['kind']>('delivery');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { onError('Madde başlığı gerekli.'); return; }
    setBusy('new');
    const r = await saveRow<Partial<Task>>('ops_tasks', { project_id: projectId, kind, title: title.trim(), owner_email: nz(owner)?.toLowerCase() ?? null, due_on: due || null, sort: (tasks?.length ?? 0) + 1 });
    setBusy(null);
    if (r.error) { onError(r.error); return; }
    setTitle(''); setOwner(''); setDue('');
    onChange();
  };
  const addTemplate = async () => {
    setBusy('tpl');
    const { error: err } = await db().from('ops_tasks').insert(TEMPLATE.map((t, i) => ({ project_id: projectId, kind: t.kind, title: t.title, sort: i + 1 })));
    setBusy(null);
    if (err) onError(err.message); else onChange();
  };
  const setStatus = async (t: Task, status: Task['status']) => {
    setBusy(t.id);
    const r = await saveRow<Partial<Task>>('ops_tasks', { id: t.id, status, done_at: status === 'done' ? new Date().toISOString() : null });
    setBusy(null);
    if (r.error) onError(r.error); else onChange();
  };
  const remove = async (t: Task) => {
    if (!window.confirm(`“${t.title}” maddesi silinsin mi?`)) return;
    const err = await removeLink('ops_tasks', t.id);
    if (err) onError(err); else onChange();
  };

  const done = (tasks ?? []).filter((t) => t.status === 'done' || t.status === 'skipped').length;
  return (
    <section className="admin-card grid gap-3 !p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Teslim ve devir listesi</h2>
        {tasks && tasks.length > 0 && <span className="text-[12px] text-subtle">{done}/{tasks.length} tamam</span>}
      </div>
      {error && <Flash tone="warn" message={`Liste okunamadı: ${error}`} />}
      {tasks === null ? <p className="text-[13px] text-subtle">Yükleniyor…</p> : tasks.length === 0 ? (
        <Empty text="Henüz madde yok." action={<button type="button" className={small} disabled={busy === 'tpl'} onClick={addTemplate}>{busy === 'tpl' ? 'Ekleniyor…' : 'Standart teslim/devir maddelerini ekle'}</button>} />
      ) : (
        <ul className="grid gap-1 text-[13px]">
          {tasks.map((t) => {
            const late = t.due_on && t.status !== 'done' && t.status !== 'skipped' && t.due_on < today;
            return (
              <li key={t.id} className="grid gap-1 border-t border-line py-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <label className="flex min-w-0 items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={t.status === 'done'} disabled={busy === t.id} onChange={(e) => setStatus(t, e.target.checked ? 'done' : 'todo')} aria-label={`${t.title}: tamamlandı`} />
                  <span className={`min-w-0 ${t.status === 'done' || t.status === 'skipped' ? 'text-subtle line-through' : ''}`}>
                    {t.title}
                    <span className="ms-2 inline-flex flex-wrap gap-1 align-middle no-underline">
                      <Badge>{TASK_KIND[t.kind]}</Badge>
                      {late && <Badge tone="bad">Gecikti</Badge>}
                    </span>
                    <span className="block text-[12px] text-subtle no-underline">
                      {t.owner_email ?? 'sorumlu yok'} · {t.due_on ? `${fmtDate(t.due_on)} (${dueText(t.due_on, today)})` : 'tarih yok'}{t.done_at && ` · tamamlandı ${fmtDateTime(t.done_at)}`}
                    </span>
                  </span>
                </label>
                <span className="flex gap-1.5">
                  <select className={`${field} !w-auto !py-1 !text-[12px]`} value={t.status} disabled={busy === t.id} onChange={(e) => setStatus(t, e.target.value as Task['status'])} aria-label="Durum">
                    {(Object.keys(TASK_STATUS) as Task['status'][]).map((k) => <option key={k} value={k}>{TASK_STATUS[k]}</option>)}
                  </select>
                  <button type="button" className={small} onClick={() => remove(t)}>Sil</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)_auto_auto] sm:items-end">
        <label className={label}>Yeni madde<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ör. DNS kayıtları müşteriye bildirildi" /></label>
        <label className={label}>Tür
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as Task['kind'])}>
            {(Object.keys(TASK_KIND) as Task['kind'][]).map((k) => <option key={k} value={k}>{TASK_KIND[k]}</option>)}
          </select>
        </label>
        <label className={label}>Sorumlu (e-posta)<input type="email" className={field} value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
        <LabeledDate label="Tarih" value={due} onChange={(v) => setDue(v)} />
        <button type="submit" disabled={busy === 'new'} className="admin-btn">{busy === 'new' ? 'Ekleniyor…' : '+ Ekle'}</button>
      </form>
    </section>
  );
}
