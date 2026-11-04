'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Badge, DateOr, Details, Documents, Empty, EntityLink, Flash, PageHead, field, fmtDate, fmtDateTime, label, small, toList } from '@/components/admin/ops/ui';
import { archiveRow, db, loadOps, removeLink, saveRow, type Contact, type OpsData, type Party, type Project } from '@/lib/ops/data';
import { KIND_LABEL, PAY_STATE_LABEL, RENEW_STATE_LABEL, SERVICE_STATUS_LABEL, dueText, istanbulDay, missingInfo, payState, renewState, type PayState, type Service } from '@/lib/ops/model';
import { formatAmount, formatTotals, type Minor } from '@/lib/ops/money';
import { findClientForLead } from '@/lib/cockpit/crm';
import { loadLeads, type Lead } from '@/lib/cockpit/leads';

/**
 * Yoca Operasyon — one client / firm (public.clients) with its contacts,
 * projects, services, money, licenses, documents and history.
 * The CRM side (deals, activities) stays on /admin/clients?id=…; a lead is
 * only LINKED (source_type / source_id), never copied or deleted.
 */

const ZERO = BigInt(0);
const TABS = [
  ['ozet', 'Özet'], ['kisiler', 'Kişiler'], ['projeler', 'Projeler'], ['hizmetler', 'Hizmetler'],
  ['finans', 'Finans'], ['lisanslar', 'Lisanslar'], ['belgeler', 'Belgeler'], ['gecmis', 'İşlem geçmişi'],
] as const;
type Tab = (typeof TABS)[number][0];

const ROLE_LABEL: Record<string, string> = { customer: 'Müşteri', provider: 'Sağlayıcı', partner: 'Partner' };
const CHANNEL_LABEL: Record<string, string> = { email: 'E-posta', phone: 'Telefon', whatsapp: 'WhatsApp', telegram: 'Telegram', other: 'Diğer' };
const CRM_STATUS: Record<string, string> = { prospect: 'Aday', active: 'Aktif müşteri', past: 'Eski müşteri' };
const PROJECT_STATUS: Record<string, string> = { active: 'Sürüyor', paused: 'Beklemede', done: 'Tamamlandı' };
const LEAD_TYPE: Record<string, string> = { contact: 'İletişim formu', checkup: 'Digital Check-Up', manual: 'Elle eklendi' };
const PAY_TONE: Record<PayState, 'ok' | 'warn' | 'bad' | 'info' | 'muted'> = { unknown: 'muted', pending: 'info', partial: 'warn', paid: 'ok', overdue: 'bad', over: 'warn' };

const nz = (v: string) => (v.trim() ? v.trim() : null);
const add = (m: Record<string, Minor>, c: string, v: Minor) => { m[c] = (m[c] ?? ZERO) + v; };

export default function ClientDetailPage() {
  return (
    <Suspense fallback={<p className="text-[13px] text-subtle">Yükleniyor…</p>}>
      <ClientDetail />
    </Suspense>
  );
}

function ClientDetail() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'ozet') as Tab;
  const [data, setData] = useState<OpsData | null>(null);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'bad' | 'warn' } | null>(null);

  const reload = async () => setData(await loadOps());
  useEffect(() => { void reload(); }, []);

  const say = (text: string, tone: 'ok' | 'bad' | 'warn' = 'ok') => setFlash({ text, tone });
  const party = data?.parties.find((p) => p.id === id) ?? null;
  const today = istanbulDay();

  const rel = useMemo(() => {
    if (!data) return null;
    const projects = data.projects.filter((p) => p.client_id === id);
    const projectIds = new Set(projects.map((p) => p.id));
    const viaProject = new Map<string, string[]>();
    const direct = new Set<string>();
    data.links.forEach((l) => {
      if (l.client_id === id) direct.add(l.service_id);
      if (l.project_id && projectIds.has(l.project_id)) viaProject.set(l.service_id, [...(viaProject.get(l.service_id) ?? []), l.project_id]);
    });
    const services = data.services.filter((s) => direct.has(s.id) || viaProject.has(s.id));
    const serviceIds = new Set(services.map((s) => s.id));
    return {
      projects,
      services,
      serviceIds,
      direct,
      viaProject,
      contacts: data.contacts.filter((c) => c.client_id === id),
      licenses: data.licenses.filter((l) => l.client_id === id),
      provided: data.services.filter((s) => s.provider_id === id && !s.archived_at).length,
    };
  }, [data, id]);

  if (!data) return <p className="text-[13px] text-subtle">Yükleniyor…</p>;
  if (data.error) return <div className="grid gap-4"><PageHead title="Müşteri" /><Flash tone="bad" message={data.error} /></div>;
  if (!party || !rel) {
    return (
      <div className="grid gap-4">
        <PageHead title="Kayıt bulunamadı" />
        <Empty text="Bu müşteri/firma bulunamadı (bağlantı hatalı olabilir)." action={<Link href="/admin/ops/clients" className="admin-btn">Listeye dön</Link>} />
      </div>
    );
  }

  const setTab = (t: Tab) => router.replace(`/admin/ops/clients/${id}${t === 'ozet' ? '' : `?tab=${t}`}`, { scroll: false });
  const toggleArchive = async () => {
    const to = !party.archived_at;
    if (to && !window.confirm(`“${party.name}” arşivlensin mi? Kayıt ve geçmişi silinmez; listelerde varsayılan olarak gizlenir.`)) return;
    const err = await archiveRow('clients', party.id, to);
    if (err) say(err, 'bad'); else { say(to ? 'Arşivlendi.' : 'Arşivden çıkarıldı.'); await reload(); }
  };

  return (
    <div className="grid gap-5">
      <PageHead
        title={party.name}
        sub={[party.party_type === 'individual' ? 'Kişi' : 'Firma', ...party.roles.map((r) => ROLE_LABEL[r] ?? r), party.owner_email ? `Sorumlu: ${party.owner_email}` : null].filter(Boolean).join(' · ')}
        actions={<>
          <Link href="/admin/ops/clients" className="admin-btn">← Liste</Link>
          <Link href={`/admin/clients?id=${party.id}`} className="admin-btn">CRM (fırsatlar, aktiviteler)</Link>
          {party.roles.includes('provider') && <Link href={`/admin/ops/providers?id=${party.id}`} className="admin-btn">Sağlayıcı sayfası</Link>}
        </>}
      />
      {party.archived_at && <Flash tone="warn" message={`Bu kayıt arşivde (${fmtDateTime(party.archived_at)}).`} />}
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}

      <nav aria-label="Bölümler" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1 pb-px">
        {TABS.map(([k, t]) => {
          const count = k === 'kisiler' ? rel.contacts.length : k === 'projeler' ? rel.projects.filter((p) => !p.archived_at).length : k === 'hizmetler' ? rel.services.filter((s) => !s.archived_at).length : k === 'lisanslar' ? rel.licenses.length : null;
          return (
            <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-bold ${tab === k ? 'border-yoca-lime text-white' : 'border-transparent text-muted hover:text-white'}`}>
              {t}{count ? <span className="ms-1 text-subtle">{count}</span> : null}
            </button>
          );
        })}
      </nav>

      {tab === 'ozet' && <Summary party={party} parties={data.parties} onSaved={async (m) => { say(m); await reload(); }} onError={(m) => say(m, 'bad')} onArchive={toggleArchive} provided={rel.provided} />}
      {tab === 'kisiler' && <Contacts clientId={party.id} contacts={rel.contacts} onChange={async (m) => { say(m); await reload(); }} onError={(m) => say(m, 'bad')} />}
      {tab === 'projeler' && <Projects clientId={party.id} projects={rel.projects} links={data.links} onError={(m) => say(m, 'bad')} onCreated={(pid) => router.push(`/admin/ops/projects/${pid}`)} />}
      {tab === 'hizmetler' && <ServicesTab party={party} services={rel.services} direct={rel.direct} viaProject={rel.viaProject} projects={rel.projects} data={data} today={today} provided={rel.provided} />}
      {tab === 'finans' && <Finance services={rel.services} data={data} today={today} clientId={party.id} />}
      {tab === 'lisanslar' && <Licenses rows={rel.licenses} data={data} />}
      {tab === 'belgeler' && <section className="admin-card !p-4"><Documents entity="client" entityId={party.id} /></section>}
      {tab === 'gecmis' && <History clientId={party.id} contactIds={rel.contacts.map((c) => c.id)} projectIds={rel.projects.map((p) => p.id)} />}
    </div>
  );
}

/* ── Özet ─────────────────────────────────────────────────────────── */

interface Draft {
  name: string; party_type: 'company' | 'individual'; roles: string[]; status: string;
  contact_name: string; email: string; phone: string; website: string; preferred_channel: string;
  brand_name: string; legal_name: string; address: string;
  tax_office: string; tax_no: string; billing_address: string; billing_email: string;
  owner_email: string; tags: string; support_contact: string; panel_url: string; note: string;
}

const toDraft = (p: Party): Draft => ({
  name: p.name ?? '', party_type: p.party_type ?? 'company', roles: p.roles ?? ['customer'], status: p.status ?? 'prospect',
  contact_name: p.contact_name ?? '', email: p.email ?? '', phone: p.phone ?? '', website: p.website ?? '', preferred_channel: p.preferred_channel ?? '',
  brand_name: p.brand_name ?? '', legal_name: p.legal_name ?? '', address: p.address ?? '',
  tax_office: p.billing?.tax_office ?? '', tax_no: p.billing?.tax_no ?? '', billing_address: p.billing?.billing_address ?? '', billing_email: p.billing?.billing_email ?? '',
  owner_email: p.owner_email ?? '', tags: (p.tags ?? []).join(', '), support_contact: p.support_contact ?? '', panel_url: p.panel_url ?? '', note: p.note ?? '',
});

function safeHref(u: string | null | undefined): string | null {
  const v = (u ?? '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return `https://${v}`;
  return null;
}

function Summary({ party, parties, onSaved, onError, onArchive, provided }: { party: Party; parties: Party[]; onSaved: (m: string) => void; onError: (m: string) => void; onArchive: () => void; provided: number }) {
  const [d, setD] = useState<Draft>(() => toDraft(party));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setD(toDraft(party)); }, [party]);
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(party));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const dupes = parties.filter((p) => p.id !== party.id && d.name.trim() && p.name.trim().toLocaleLowerCase('tr') === d.name.trim().toLocaleLowerCase('tr'));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.name.trim()) { onError('Görünen ad gerekli.'); return; }
    if (d.roles.length === 0) { onError('En az bir rol seçin (müşteri, sağlayıcı veya partner).'); return; }
    const billing: Record<string, string> = { ...(party.billing ?? {}) };
    (['tax_office', 'tax_no', 'billing_address', 'billing_email'] as const).forEach((k) => { if (d[k].trim()) billing[k] = d[k].trim(); else delete billing[k]; });
    setBusy(true);
    const r = await saveRow<Partial<Party>>('clients', {
      id: party.id, name: d.name.trim(), party_type: d.party_type, roles: d.roles, status: d.status,
      contact_name: d.contact_name.trim(), email: d.email.trim(), phone: d.phone.trim(), website: d.website.trim(), note: d.note,
      preferred_channel: nz(d.preferred_channel), brand_name: nz(d.brand_name), legal_name: nz(d.legal_name), address: nz(d.address),
      billing, owner_email: nz(d.owner_email)?.toLowerCase() ?? null, tags: toList(d.tags), support_contact: nz(d.support_contact), panel_url: nz(d.panel_url),
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (r.error) onError(r.error); else onSaved('Kaydedildi.');
  };

  const site = safeHref(party.website);
  return (
    <div className="grid gap-4">
      <form onSubmit={save} className="admin-card grid gap-4 !p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Görünen ad *<input className={field} value={d.name} maxLength={160} onChange={(e) => set('name', e.target.value)} required /></label>
          <label className={label}>Tür
            <select className={field} value={d.party_type} onChange={(e) => set('party_type', e.target.value as Draft['party_type'])}>
              <option value="company">Firma</option><option value="individual">Kişi</option>
            </select>
          </label>
        </div>
        {dupes.length > 0 && <p className="text-[12px] text-yellow-200">Aynı adla başka kayıt var: {dupes.map((p) => <Link key={p.id} className="underline" href={`/admin/ops/clients/${p.id}`}>{p.name}</Link>)}</p>}
        <fieldset className="grid gap-2">
          <legend className="text-[13px] font-semibold text-muted">Roller <span className="font-normal text-subtle">(bir firma hem müşteri hem sağlayıcı olabilir)</span></legend>
          <div className="flex flex-wrap gap-4 text-[13px]">
            {(['customer', 'provider', 'partner'] as const).map((r) => (
              <label key={r} className="flex items-center gap-2">
                <input type="checkbox" checked={d.roles.includes(r)} onChange={(e) => set('roles', e.target.checked ? [...d.roles, r] : d.roles.filter((x) => x !== r))} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
        </fieldset>

        <Details title="İletişim" hint={[d.contact_name, d.email, d.phone].filter(Boolean).join(' · ') || 'boş'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Yetkili kişi<input className={field} value={d.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></label>
            <label className={label}>E-posta<input className={field} type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></label>
            <label className={label}>Telefon<input className={field} value={d.phone} onChange={(e) => set('phone', e.target.value)} /></label>
            <label className={label}>Web sitesi<input className={field} value={d.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" /></label>
            <label className={label}>Tercih edilen kanal
              <select className={field} value={d.preferred_channel} onChange={(e) => set('preferred_channel', e.target.value)}>
                <option value="">Belirtilmedi</option>
                {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className={label}>CRM durumu
              <select className={field} value={d.status} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(CRM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          {site && <p className="text-[12px] text-subtle">Site: <a href={site} target="_blank" rel="noopener noreferrer" className="underline">{site}</a></p>}
          <p className="text-[12px] text-subtle">Birden çok kişi için “Kişiler” sekmesini kullanın.</p>
        </Details>

        <Details title="Resmî bilgiler ve fatura" hint={d.legal_name || d.tax_no || 'boş'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Marka adı<input className={field} value={d.brand_name} onChange={(e) => set('brand_name', e.target.value)} /></label>
            <label className={label}>Ticari unvan<input className={field} value={d.legal_name} onChange={(e) => set('legal_name', e.target.value)} /></label>
            <label className={`${label} sm:col-span-2`}>Adres<textarea className={field} rows={2} value={d.address} onChange={(e) => set('address', e.target.value)} /></label>
            <label className={label}>Vergi dairesi<input className={field} value={d.tax_office} onChange={(e) => set('tax_office', e.target.value)} /></label>
            <label className={label}>Vergi / TC kimlik no<input className={field} value={d.tax_no} onChange={(e) => set('tax_no', e.target.value)} /></label>
            <label className={label}>Fatura adresi<textarea className={field} rows={2} value={d.billing_address} onChange={(e) => set('billing_address', e.target.value)} placeholder="Adresten farklıysa" /></label>
            <label className={label}>Fatura e-postası<input className={field} type="email" value={d.billing_email} onChange={(e) => set('billing_email', e.target.value)} /></label>
          </div>
        </Details>

        <Details title="Ekip ve etiketler" hint={[d.owner_email, d.tags].filter(Boolean).join(' · ') || 'boş'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Ekip sorumlusu (e-posta)<input className={field} type="email" value={d.owner_email} onChange={(e) => set('owner_email', e.target.value)} /></label>
            <label className={label}>Etiketler (virgülle)<input className={field} value={d.tags} onChange={(e) => set('tags', e.target.value)} placeholder="ör. öncelikli, bakım" /></label>
          </div>
        </Details>

        {d.roles.includes('provider') && (
          <Details title="Sağlayıcı bilgileri" hint={`${provided} hizmet`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Destek iletişimi<input className={field} value={d.support_contact} onChange={(e) => set('support_contact', e.target.value)} placeholder="destek e-postası, telefon, bilet adresi" /></label>
              <label className={label}>Panel adresi<input className={field} value={d.panel_url} onChange={(e) => set('panel_url', e.target.value)} placeholder="https://…" /></label>
            </div>
            <p className="text-[12px] text-subtle">Hesaplar (şifresiz) <Link className="underline" href={`/admin/ops/providers?id=${party.id}`}>Sağlayıcılar</Link> sayfasında.</p>
          </Details>
        )}

        <label className={label}>Not<textarea className={field} rows={3} value={d.note} onChange={(e) => set('note', e.target.value)} /></label>
        <p className="text-[12px] text-subtle">Şifre, API anahtarı veya kart bilgisi yazmayın.</p>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy || !dirty} className="admin-btn-primary">{busy ? 'Kaydediliyor…' : dirty ? 'Kaydet' : 'Kaydedildi'}</button>
          {dirty && <button type="button" className="admin-btn" onClick={() => setD(toDraft(party))}>Değişiklikleri geri al</button>}
          <span className="flex-1" />
          <button type="button" className="admin-btn" onClick={onArchive}>{party.archived_at ? 'Arşivden çıkar' : 'Arşivle'}</button>
        </div>
        <p className="text-[12px] text-subtle">Müşteri kayıtları silinmez (hizmet, ödeme ve proje geçmişi korunur); kullanılmayanlar arşivlenir.</p>
      </form>

      <LeadLink party={party} onSaved={onSaved} onError={onError} />

      <p className="text-[12px] text-subtle">Oluşturma: {fmtDateTime(party.created_at)} · Son güncelleme: {fmtDateTime(party.updated_at)}</p>
    </div>
  );
}

/* ── Lead bağlantısı (kopyalamaz, silmez) ─────────────────────────── */

function LeadLink({ party, onSaved, onError }: { party: Party; onSaved: (m: string) => void; onError: (m: string) => void }) {
  const linked = (party.source_type === 'contact' || party.source_type === 'checkup') && party.source_id;
  const [lead, setLead] = useState<{ name: string; email: string; at: string } | null | undefined>(undefined);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!linked) { setLead(undefined); return; }
    (async () => {
      try {
        if (party.source_type === 'contact') {
          const { data } = await db().from('contact_submissions').select('name, email, created_at').eq('id', party.source_id as string).maybeSingle();
          const r = data as { name?: string; email?: string; created_at: string } | null;
          setLead(r ? { name: r.name ?? '', email: r.email ?? '', at: r.created_at } : null);
        } else {
          const { data } = await db().from('checkup_submissions').select('contact_info_json, created_at').eq('id', party.source_id as string).maybeSingle();
          const r = data as { contact_info_json?: Record<string, unknown>; created_at: string } | null;
          setLead(r ? { name: String(r.contact_info_json?.name ?? ''), email: String(r.contact_info_json?.email ?? ''), at: r.created_at } : null);
        }
      } catch { setLead(null); }
    })();
  }, [linked, party.source_type, party.source_id]);

  const openPicker = async () => {
    setLoadErr(null);
    const r = await loadLeads();
    if (r.error) setLoadErr(r.error);
    setLeads(r.leads);
  };

  const link = async (l: Lead) => {
    setBusy(true);
    const other = await findClientForLead(l);
    if (other && other.id !== party.id) { setBusy(false); onError(`Bu lead zaten “${other.name}” kaydına bağlı. Önce oradaki bağlantıyı kaldırın.`); return; }
    const r = await saveRow<Partial<Party>>('clients', { id: party.id, source_type: l.type, source_id: l.id, updated_at: new Date().toISOString() });
    setBusy(false);
    if (r.error) onError(r.error); else { setLeads(null); onSaved('Lead bağlandı (lead kopyalanmadı).'); }
  };

  const unlink = async () => {
    if (!window.confirm('Lead bağlantısı kaldırılsın mı? Lead silinmez; yalnızca bu kayıtla bağı kalkar.')) return;
    setBusy(true);
    const r = await saveRow<Partial<Party>>('clients', { id: party.id, source_type: 'manual', source_id: null, updated_at: new Date().toISOString() });
    setBusy(false);
    if (r.error) onError(r.error); else onSaved('Lead bağlantısı kaldırıldı.');
  };

  const matches = useMemo(() => {
    if (!leads) return [];
    const n = q.trim().toLocaleLowerCase('tr');
    const mine = [party.email, party.name].map((v) => (v ?? '').toLocaleLowerCase('tr')).filter(Boolean);
    const score = (l: Lead) => (mine.some((m) => m && (l.email.toLocaleLowerCase('tr') === m || l.company.toLocaleLowerCase('tr') === m)) ? 0 : 1);
    return leads
      .filter((l) => !n || [l.name, l.email, l.company].some((v) => v.toLocaleLowerCase('tr').includes(n)))
      .sort((a, b) => score(a) - score(b) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
  }, [leads, q, party.email, party.name]);

  return (
    <section className="admin-card grid gap-3 !p-4" aria-label="Kaynak lead">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Kaynak lead</h2>
      {linked ? (
        <div className="grid gap-2 text-[13px]">
          <p>
            {LEAD_TYPE[party.source_type as string]}:{' '}
            <EntityLink href={`/admin/submissions?id=${party.source_id}&status=all`}>
              {lead === undefined ? 'yükleniyor…' : lead === null ? 'lead bulunamadı (silinmiş olabilir)' : `${lead.name || lead.email || 'adsız'} · ${fmtDate(lead.at)}`}
            </EntityLink>
          </p>
          <button type="button" className={`${small} justify-self-start`} disabled={busy} onClick={unlink}>Bağlantıyı kaldır</button>
        </div>
      ) : (
        <div className="grid gap-2 text-[13px]">
          <p className="text-muted">{party.source_type === 'manual' ? 'Elle eklendi; bağlı lead yok.' : 'Bağlı lead yok.'} Mevcut bir başvuruyu bağlayabilirsiniz (kopyalanmaz, silinmez).</p>
          {leads === null ? (
            <button type="button" className={`${small} justify-self-start`} onClick={openPicker}>Mevcut lead bağla</button>
          ) : (
            <div className="grid gap-2">
              {loadErr && <p className="text-[12px] text-red-300">{loadErr}</p>}
              <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, e-posta veya şirket ara…" aria-label="Lead ara" />
              {matches.length === 0 ? <p className="text-subtle">Eşleşen lead yok.</p> : (
                <ul className="grid gap-1">
                  {matches.map((l) => (
                    <li key={`${l.type}-${l.id}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
                      <span className="min-w-0 truncate">{l.name || '—'} <span className="text-subtle">· {l.email} {l.company && `· ${l.company}`} · {LEAD_TYPE[l.type]} · {fmtDate(l.createdAt)}</span></span>
                      <button type="button" className={small} disabled={busy} onClick={() => link(l)}>Bağla</button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className={`${small} justify-self-start`} onClick={() => setLeads(null)}>Vazgeç</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Kişiler ──────────────────────────────────────────────────────── */

type ContactDraft = { name: string; role: string; email: string; phone: string; is_primary: boolean; note: string };
const emptyContact: ContactDraft = { name: '', role: '', email: '', phone: '', is_primary: false, note: '' };

function Contacts({ clientId, contacts, onChange, onError }: { clientId: string; contacts: Contact[]; onChange: (m: string) => void; onError: (m: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [d, setD] = useState<ContactDraft>(emptyContact);
  const [busy, setBusy] = useState(false);

  const start = (c: Contact | null) => {
    setEditing(c ? c.id : 'new');
    setD(c ? { name: c.name, role: c.role ?? '', email: c.email ?? '', phone: c.phone ?? '', is_primary: c.is_primary, note: c.note ?? '' } : emptyContact);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.name.trim()) { onError('Kişinin adı gerekli.'); return; }
    setBusy(true);
    const r = await saveRow<Partial<Contact>>('client_contacts', {
      ...(editing && editing !== 'new' ? { id: editing } : { client_id: clientId }),
      name: d.name.trim(), role: nz(d.role), email: nz(d.email), phone: nz(d.phone), is_primary: d.is_primary, note: nz(d.note),
    });
    if (!r.error && d.is_primary) {
      const others = contacts.filter((c) => c.is_primary && c.id !== r.row?.id).map((c) => c.id);
      if (others.length) await db().from('client_contacts').update({ is_primary: false }).in('id', others);
    }
    setBusy(false);
    if (r.error) { onError(r.error); return; }
    setEditing(null);
    onChange('Kişi kaydedildi.');
  };
  const remove = async (c: Contact) => {
    if (!window.confirm(`“${c.name}” kişisi silinsin mi? (Yalnızca iletişim kaydı; firma ve geçmişi kalır.)`)) return;
    const err = await removeLink('client_contacts', c.id);
    if (err) onError(err); else onChange('Kişi silindi.');
  };

  const form = (
    <form onSubmit={save} className="grid gap-3 border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Ad *<input className={field} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></label>
        <label className={label}>Görevi / rolü<input className={field} value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })} placeholder="ör. muhasebe, teknik, karar verici" /></label>
        <label className={label}>E-posta<input className={field} type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
        <label className={label}>Telefon<input className={field} value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></label>
        <label className={`${label} sm:col-span-2`}>Not<input className={field} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></label>
      </div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={d.is_primary} onChange={(e) => setD({ ...d, is_primary: e.target.checked })} /> Birincil kişi</label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="admin-btn-primary">{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        <button type="button" className="admin-btn" onClick={() => setEditing(null)}>Vazgeç</button>
      </div>
    </form>
  );

  return (
    <section className="admin-card grid gap-3 !p-4">
      {contacts.length === 0 && editing !== 'new' && <Empty text="Kayıtlı kişi yok." />}
      <ul className="grid gap-2">
        {contacts.map((c) => (
          <li key={c.id}>
            {editing === c.id ? form : (
              <div className="flex flex-wrap items-start justify-between gap-2 border-t border-line pt-2 text-[13px]">
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-bold text-white">{c.name}{c.is_primary && <Badge tone="ok">Birincil</Badge>}{c.role && <span className="font-normal text-muted">{c.role}</span>}</span>
                  <span className="text-[12px] text-subtle">
                    {c.email && <a className="underline" href={`mailto:${c.email}`}>{c.email}</a>}{c.email && c.phone && ' · '}{c.phone && <a className="underline" href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>}
                    {c.note && ` · ${c.note}`}
                  </span>
                </div>
                <span className="flex gap-1.5">
                  <button type="button" className={small} onClick={() => start(c)}>Düzenle</button>
                  <button type="button" className={small} onClick={() => remove(c)}>Sil</button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' ? form : <button type="button" className="admin-btn justify-self-start" onClick={() => start(null)}>+ Kişi ekle</button>}
    </section>
  );
}

/* ── Projeler ─────────────────────────────────────────────────────── */

function Projects({ clientId, projects, links, onError, onCreated }: { clientId: string; projects: Project[]; links: OpsData['links']; onError: (m: string) => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = projects.filter((p) => showArchived || !p.archived_at);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { onError('Proje adı gerekli.'); return; }
    setBusy(true);
    const r = await saveRow<Partial<Project>>('ops_projects', { client_id: clientId, name: name.trim() });
    setBusy(false);
    if (!r.row) { onError(r.error ?? 'Kaydedilemedi.'); return; }
    onCreated(r.row.id);
  };
  return (
    <section className="admin-card grid gap-3 !p-4">
      <form onSubmit={create} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className={label}>Yeni proje adı<input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Kurumsal site 2026" /></label>
        <button type="submit" disabled={busy} className="admin-btn-primary">{busy ? 'Ekleniyor…' : '+ Proje ekle'}</button>
      </form>
      {projects.some((p) => p.archived_at) && (
        <label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arşivdekileri göster</label>
      )}
      {list.length === 0 ? <Empty text="Bu müşteriye bağlı proje yok." /> : (
        <ul className="grid gap-1 text-[13px]">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <EntityLink href={`/admin/ops/projects/${p.id}`}>{p.name}</EntityLink>
                <Badge tone={p.status === 'done' ? 'ok' : p.status === 'paused' ? 'warn' : 'info'}>{PROJECT_STATUS[p.status] ?? p.status}</Badge>
                {p.archived_at && <Badge>Arşivde</Badge>}
                {p.work_slug && <span className="text-[12px] text-subtle">portfolyo: {p.work_slug}</span>}
              </span>
              <span className="text-[12px] text-subtle">
                {links.filter((l) => l.project_id === p.id).length} hizmet · başlangıç <DateOr value={p.start_on} /> · teslim <DateOr value={p.delivered_on} unknown="—" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Hizmetler ────────────────────────────────────────────────────── */

function ServicesTab({ party, services, direct, viaProject, projects, data, today, provided }: { party: Party; services: Service[]; direct: Set<string>; viaProject: Map<string, string[]>; projects: Project[]; data: OpsData; today: string; provided: number }) {
  const [showArchived, setShowArchived] = useState(false);
  const list = services.filter((s) => showArchived || !s.archived_at);
  const projectName = (pid: string) => projects.find((p) => p.id === pid)?.name ?? 'proje';
  return (
    <section className="admin-card grid gap-3 !p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/ops/services/new?client=${party.id}`} className="admin-btn-primary">+ Yeni hizmet</Link>
        <Link href={`/admin/ops/services?client=${party.id}`} className="admin-btn">Hizmet listesinde aç</Link>
        {provided > 0 && <Link href={`/admin/ops/services?provider=${party.id}`} className="admin-btn">Sağlayıcı olarak: {provided} hizmet</Link>}
      </div>
      {services.some((s) => s.archived_at) && (
        <label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arşivdekileri göster</label>
      )}
      {list.length === 0 ? <Empty text="Bu müşteriye (veya projelerine) bağlı hizmet yok." /> : (
        <ul className="grid gap-1 text-[13px]">
          {list.map((s) => {
            const open = data.periods.find((p) => p.service_id === s.id && p.status === 'open') ?? null;
            const rs = renewState(s, open, data.payments, today);
            const end = open?.ends_on ?? s.end_on;
            const miss = missingInfo(s);
            return (
              <li key={s.id} className="grid gap-1 border-t border-line py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <EntityLink href={`/admin/ops/services/${s.id}`}>{s.name}</EntityLink>
                  <Badge>{KIND_LABEL[s.kind] ?? s.kind}</Badge>
                  <Badge tone={s.status === 'active' ? 'ok' : s.status === 'expired' || s.status === 'suspended' ? 'bad' : 'muted'}>{SERVICE_STATUS_LABEL[s.status] ?? s.status}</Badge>
                  {s.archived_at && <Badge>Arşivde</Badge>}
                  {miss.length > 0 && <Badge tone="warn" title={miss.join(', ')}>Eksik: {miss.join(', ')}</Badge>}
                </span>
                <span className="text-[12px] text-muted">
                  {s.is_perpetual ? 'Süresiz' : <>Bitiş <DateOr value={end} /> {end && `(${dueText(end, today)})`}</>} · {RENEW_STATE_LABEL[rs]}
                  <span className="block text-subtle">{direct.has(s.id) ? 'Doğrudan bağlı' : ''}{direct.has(s.id) && viaProject.has(s.id) ? ' · ' : ''}{viaProject.has(s.id) ? `Proje: ${(viaProject.get(s.id) ?? []).map(projectName).join(', ')}` : ''}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Finans ───────────────────────────────────────────────────────── */

function Finance({ services, data, today, clientId }: { services: Service[]; data: OpsData; today: string; clientId: string }) {
  const ids = new Set(services.map((s) => s.id));
  const name = (sid: string) => data.services.find((s) => s.id === sid)?.name ?? 'hizmet';
  const open = data.periods.filter((p) => ids.has(p.service_id) && p.status === 'open');
  const rows = open.map((p) => ({ p, s: payState(p, data.payments, 'in', today) }));
  const expected: Record<string, Minor> = {}, received: Record<string, Minor> = {}, remaining: Record<string, Minor> = {}, other: Record<string, Minor> = {};
  let unknown = 0;
  rows.forEach(({ s }) => {
    Object.keys(s.otherCurrencies).forEach((c) => add(other, c, s.otherCurrencies[c]));
    if (s.state === 'unknown' || !s.currency || s.expected === null) { unknown += 1; if (s.currency && s.paid !== ZERO) add(received, s.currency, s.paid); return; }
    add(expected, s.currency, s.expected);
    add(received, s.currency, s.paid);
    if (s.remaining !== null) add(remaining, s.currency, s.remaining);
  });
  const payments = data.payments.filter((p) => ids.has(p.service_id) || p.client_id === clientId).slice(0, 15);

  if (services.length === 0) return <Empty text="Bağlı hizmet yok; tahsilat ve ödemeler hizmet dönemleri üzerinden takip edilir." action={<Link href={`/admin/ops/services/new?client=${clientId}`} className="admin-btn">+ Yeni hizmet</Link>} />;
  return (
    <div className="grid gap-4">
      <section className="admin-card grid gap-3 !p-4">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Açık dönemlerin tahsilatı (para birimine göre)</h2>
        {open.length === 0 ? <p className="text-[13px] text-subtle">Açık dönem yok.</p> : (
          <>
            <dl className="grid gap-2 text-[13px] sm:grid-cols-3">
              <div><dt className="text-muted">Beklenen</dt><dd className="font-bold tabular-nums">{formatTotals(expected)}</dd></div>
              <div><dt className="text-muted">Alınan</dt><dd className="font-bold tabular-nums">{formatTotals(received)}</dd></div>
              <div><dt className="text-muted">Kalan</dt><dd className="font-bold tabular-nums">{formatTotals(remaining)}</dd></div>
            </dl>
            {unknown > 0 && <p className="text-[12px] text-yellow-200">{unknown} açık dönemin müşteri tutarı bilinmiyor; toplamlara eklenmedi.</p>}
            {Object.keys(other).length > 0 && <p className="text-[12px] text-yellow-200">Beklenenden farklı para biriminde alınan: {formatTotals(other)} (ayrı gösterilir, düşülmez).</p>}
            <ul className="grid gap-1 text-[13px]">
              {rows.map(({ p, s }) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
                  <span className="min-w-0"><EntityLink href={`/admin/ops/services/${p.service_id}`}>{name(p.service_id)}</EntityLink> <span className="text-[12px] text-subtle">· vade <DateOr value={p.customer_due_on ?? p.due_on} /></span></span>
                  <span className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="tabular-nums">{formatAmount(p.expected_price, p.price_currency)}</span>
                    <Badge tone={PAY_TONE[s.state]}>{PAY_STATE_LABEL[s.state]}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link href="/admin/ops/finance?view=collections" className="text-[12px] text-subtle underline">Tüm tahsilatlar →</Link>
      </section>

      <section className="admin-card grid gap-3 !p-4">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Son ödemeler</h2>
        {payments.length === 0 ? <p className="text-[13px] text-subtle">Kayıtlı ödeme yok.</p> : (
          <ul className="grid gap-1 text-[13px]">
            {payments.map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5 ${p.voided_at ? 'opacity-60' : ''}`}>
                <span className="min-w-0">
                  <Badge tone={p.direction === 'in' ? 'ok' : 'info'}>{p.direction === 'in' ? 'Tahsilat' : 'Sağlayıcıya ödeme'}</Badge>{' '}
                  {p.kind !== 'payment' && <Badge tone="warn">{p.kind === 'refund' ? 'İade' : 'Düzeltme'}</Badge>}{' '}
                  <EntityLink href={`/admin/ops/services/${p.service_id}`}>{name(p.service_id)}</EntityLink>
                </span>
                <span className="text-[12px] text-muted">
                  <span className={`tabular-nums ${p.voided_at ? 'line-through' : ''}`}>{formatAmount(p.amount, p.currency)}</span> · {fmtDate(p.paid_on)}{p.voided_at && ' · iptal edildi'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/admin/ops/finance?view=payments" className="text-[12px] text-subtle underline">Tüm ödemeler →</Link>
      </section>
    </div>
  );
}

/* ── Lisanslar ────────────────────────────────────────────────────── */

function Licenses({ rows, data }: { rows: OpsData['licenses']; data: OpsData }) {
  return (
    <section className="admin-card grid gap-3 !p-4">
      <p className="text-[12px] text-subtle">Lisansların asıl kaynağı license.yoca.net. Burada yalnızca bağlantılar ve en son okunan anlık görüntü görünür.</p>
      {rows.length === 0 ? <Empty text="Bu müşteriye bağlı lisans yok." action={<Link href="/admin/ops/licenses" className="admin-btn">Lisans bağla</Link>} /> : (
        <ul className="grid gap-1 text-[13px]">
          {rows.map((l) => {
            const snap = l.snapshot ?? {};
            const exp = typeof snap.expires_at === 'string' ? snap.expires_at : null;
            return (
              <li key={l.id} className="grid gap-0.5 border-t border-line py-1.5">
                <span className="flex flex-wrap items-center gap-2"><span className="font-bold">{l.label || l.license_id}</span><span className="font-mono text-[12px] text-subtle">{l.license_id}</span>{typeof snap.status === 'string' && <Badge>{snap.status}</Badge>}</span>
                <span className="text-[12px] text-subtle">
                  {l.project_id && <>Proje: <Link className="underline" href={`/admin/ops/projects/${l.project_id}`}>{data.projects.find((p) => p.id === l.project_id)?.name ?? 'proje'}</Link> · </>}
                  {l.service_id && <>Hizmet: <Link className="underline" href={`/admin/ops/services/${l.service_id}`}>{data.services.find((s) => s.id === l.service_id)?.name ?? 'hizmet'}</Link> · </>}
                  {l.last_synced_at ? <>Anlık görüntü {fmtDateTime(l.last_synced_at)}{exp ? ` · bitiş ${fmtDate(exp)}` : ''}</> : 'Henüz eşitlenmedi'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/admin/ops/licenses" className="text-[12px] text-subtle underline">Lisanslar sayfası →</Link>
    </section>
  );
}

/* ── İşlem geçmişi ────────────────────────────────────────────────── */

interface AuditEntry { id: number; at: string; actor: string | null; action: string; entity: string; entity_id: string | null; label: string | null; changes: Record<string, unknown> | null }
const ENTITY: Record<string, string> = { clients: 'Kayıt', client_contacts: 'Kişi', ops_projects: 'Proje' };
const VERB: Record<string, string> = { insert: 'eklendi', update: 'güncellendi', delete: 'silindi' };

function History({ clientId, contactIds, projectIds }: { clientId: string; contactIds: string[]; projectIds: string[] }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${clientId}|${contactIds.join(',')}|${projectIds.join(',')}`;
  useEffect(() => {
    (async () => {
      const parts = [`and(entity.eq.clients,entity_id.eq.${clientId})`];
      if (contactIds.length) parts.push(`and(entity.eq.client_contacts,entity_id.in.(${contactIds.join(',')}))`);
      if (projectIds.length) parts.push(`and(entity.eq.ops_projects,entity_id.in.(${projectIds.join(',')}))`);
      try {
        const { data, error: err } = await db().from('audit_log').select('*').or(parts.join(',')).order('at', { ascending: false }).limit(100);
        if (err) { setError(err.message); setRows([]); return; }
        setRows((data ?? []) as AuditEntry[]);
      } catch (e) { setError((e as Error).message); setRows([]); }
    })();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="admin-card grid gap-3 !p-4">
      <p className="text-[12px] text-subtle">Bu kaydın, şu anki kişilerinin ve projelerinin değişiklikleri (en son 100). Silinmiş kişi kayıtları ve hizmet/ödeme değişiklikleri burada yok; hepsi için <Link href="/admin/activity" className="underline">İşlem geçmişi</Link>.</p>
      {error && <Flash tone="warn" message={`Okunamadı: ${error}`} />}
      {rows === null ? <p className="text-[13px] text-subtle">Yükleniyor…</p> : rows.length === 0 ? <p className="text-[13px] text-subtle">Kayıt yok.</p> : (
        <ul className="grid gap-1 text-[13px]">
          {rows.map((e) => (
            <li key={e.id} className="grid gap-0.5 border-t border-line py-1.5">
              <span><span className="text-muted">{ENTITY[e.entity] ?? e.entity} {VERB[e.action] ?? e.action}:</span> {e.label || '—'}</span>
              <span className="text-[12px] text-subtle">
                {e.actor ?? 'sistem'} · {fmtDateTime(e.at)}
                {e.changes && Object.keys(e.changes).length > 0 && e.action === 'update' && ` · değişen: ${Object.keys(e.changes).join(', ')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
