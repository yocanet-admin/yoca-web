'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Empty, EntityLink, Flash, PageHead, field, label, small } from '@/components/admin/ops/ui';
import { loadOps, saveRow, type OpsData, type Party } from '@/lib/ops/data';

/**
 * Yoca Operasyon — Müşteriler ve firmalar.
 * One list for every firm / person (public.clients): customers, providers,
 * partners — a firm can hold several roles. Quick create needs only the name.
 */

const ROLE_LABEL: Record<string, string> = { customer: 'Müşteri', provider: 'Sağlayıcı', partner: 'Partner' };
const TYPE_LABEL: Record<string, string> = { company: 'Firma', individual: 'Kişi' };

const norm = (v: string | null | undefined) => (v ?? '').trim().toLocaleLowerCase('tr');

/** Possible duplicates: same or containing name / brand / legal name (case-insensitive). */
function similar(parties: Party[], name: string): Party[] {
  const n = norm(name);
  if (n.length < 2) return [];
  return parties.filter((p) => [p.name, p.brand_name, p.legal_name].some((v) => {
    const x = norm(v);
    return x && (x === n || (n.length >= 3 && (x.includes(n) || n.includes(x))));
  })).slice(0, 5);
}

export default function OpsClients() {
  const router = useRouter();
  const [data, setData] = useState<OpsData | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'all' | 'customer' | 'provider' | 'partner'>('all');
  const [ptype, setPtype] = useState<'all' | 'company' | 'individual'>('all');
  const [owner, setOwner] = useState('all');
  const [arch, setArch] = useState<'active' | 'archived' | 'all'>('active');

  const [name, setName] = useState('');
  const [newType, setNewType] = useState<'company' | 'individual'>('company');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadOps().then(setData); }, []);

  const counts = useMemo(() => {
    const projects = new Map<string, number>();
    const services = new Map<string, Set<string>>();
    const provided = new Map<string, number>();
    if (!data) return { projects, services, provided };
    const projectClient = new Map<string, string>();
    data.projects.forEach((p) => {
      if (!p.client_id) return;
      projectClient.set(p.id, p.client_id);
      if (!p.archived_at) projects.set(p.client_id, (projects.get(p.client_id) ?? 0) + 1);
    });
    const archived = new Set(data.services.filter((s) => s.archived_at).map((s) => s.id));
    data.links.forEach((l) => {
      if (archived.has(l.service_id)) return;
      const cid = l.client_id ?? (l.project_id ? projectClient.get(l.project_id) : undefined);
      if (!cid) return;
      const set = services.get(cid) ?? new Set<string>();
      set.add(l.service_id);
      services.set(cid, set);
    });
    data.services.forEach((s) => { if (s.provider_id && !s.archived_at) provided.set(s.provider_id, (provided.get(s.provider_id) ?? 0) + 1); });
    return { projects, services, provided };
  }, [data]);

  const owners = useMemo(() => Array.from(new Set((data?.parties ?? []).map((p) => p.owner_email).filter((x): x is string => Boolean(x)))).sort(), [data]);
  const contactsOf = useMemo(() => {
    const m = new Map<string, string[]>();
    (data?.contacts ?? []).forEach((c) => m.set(c.client_id, [...(m.get(c.client_id) ?? []), c.name, c.email ?? '', c.phone ?? '']));
    return m;
  }, [data]);

  const visible = useMemo(() => {
    const n = norm(q);
    return (data?.parties ?? []).filter((p) => {
      if (arch === 'active' && p.archived_at) return false;
      if (arch === 'archived' && !p.archived_at) return false;
      if (role !== 'all' && !p.roles.includes(role)) return false;
      if (ptype !== 'all' && p.party_type !== ptype) return false;
      if (owner === 'none' && p.owner_email) return false;
      if (owner !== 'all' && owner !== 'none' && p.owner_email !== owner) return false;
      if (!n) return true;
      return [p.name, p.brand_name, p.legal_name, p.contact_name, p.email, p.phone, ...p.tags, ...(contactsOf.get(p.id) ?? [])].some((v) => norm(v).includes(n));
    });
  }, [data, q, role, ptype, owner, arch, contactsOf]);

  const dupes = useMemo(() => similar(data?.parties ?? [], name), [data, name]);

  const create = async (e: React.FormEvent, force = false) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setError('Görünen ad gerekli.'); return; }
    if (dupes.length && !force) { setError('Benzer kayıt var. Aşağıdan açın ya da “Yine de oluştur” deyin.'); return; }
    setBusy(true); setError(null);
    const r = await saveRow<Partial<Party>>('clients', { name: n, party_type: newType, roles: ['customer'], source_type: 'manual' });
    setBusy(false);
    if (!r.row) { setError(r.error ?? 'Kaydedilemedi.'); return; }
    router.push(`/admin/ops/clients/${r.row.id}`);
  };

  return (
    <div className="grid gap-6">
      <PageHead
        title="Müşteriler ve firmalar"
        sub="Müşteriler, sağlayıcılar ve partnerler tek listede. Bir firma aynı anda hem müşteri hem sağlayıcı olabilir."
        actions={<Link href="/admin/ops/providers" className="admin-btn">Sağlayıcılar</Link>}
      />

      {data?.error && <Flash tone="bad" message={data.error} />}

      <form onSubmit={(e) => create(e)} className="admin-card grid gap-3 !p-4" aria-label="Hızlı ekle">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <label className={label}>
            Görünen ad <span className="font-normal text-subtle">(zorunlu olan tek alan)</span>
            <input className={field} value={name} maxLength={160} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="Örn. Kuzey Mimarlık veya Ayşe Yılmaz" />
          </label>
          <label className={label}>
            Tür
            <select className={field} value={newType} onChange={(e) => setNewType(e.target.value as 'company' | 'individual')}>
              <option value="company">Firma</option>
              <option value="individual">Kişi</option>
            </select>
          </label>
          <button type="submit" disabled={busy || !data?.ready} className="admin-btn-primary">{busy ? 'Ekleniyor…' : '+ Ekle'}</button>
        </div>
        {dupes.length > 0 && (
          <div className="grid gap-1.5 border border-yellow-400/40 bg-yellow-400/5 p-3 text-[13px] text-yellow-100">
            <p>Benzer adla kayıt var — aynı firma olabilir:</p>
            <ul className="grid gap-1">
              {dupes.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <EntityLink href={`/admin/ops/clients/${p.id}`}>{p.name}</EntityLink>
                  {p.roles.map((r) => <Badge key={r}>{ROLE_LABEL[r] ?? r}</Badge>)}
                  {p.archived_at && <Badge tone="muted">Arşivde</Badge>}
                </li>
              ))}
            </ul>
            <button type="button" className={`${small} justify-self-start`} disabled={busy} onClick={(e) => create(e as unknown as React.FormEvent, true)}>Yine de yeni kayıt oluştur</button>
          </div>
        )}
        {error && <p role="alert" className="text-[13px] font-semibold text-red-300">{error}</p>}
        <p className="text-[12px] text-subtle">Müşteri rolüyle eklenir. İletişim, fatura, ekip sorumlusu ve diğer bilgiler kayıt sayfasında isteğe bağlıdır.</p>
      </form>

      <div className="flex flex-wrap items-end gap-2">
        <label className={`${label} min-w-[12rem] flex-1`}>
          Ara
          <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, marka, ticari unvan, kişi, e-posta, etiket…" />
        </label>
        <label className={label}>
          Rol
          <select className={field} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="all">Tümü</option>
            <option value="customer">Müşteri</option>
            <option value="provider">Sağlayıcı</option>
            <option value="partner">Partner</option>
          </select>
        </label>
        <label className={label}>
          Tür
          <select className={field} value={ptype} onChange={(e) => setPtype(e.target.value as typeof ptype)}>
            <option value="all">Tümü</option>
            <option value="company">Firma</option>
            <option value="individual">Kişi</option>
          </select>
        </label>
        <label className={label}>
          Ekip sorumlusu
          <select className={field} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">Tümü</option>
            <option value="none">Atanmamış</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className={label}>
          Durum
          <select className={field} value={arch} onChange={(e) => setArch(e.target.value as typeof arch)}>
            <option value="active">Arşivde olmayanlar</option>
            <option value="archived">Arşivdekiler</option>
            <option value="all">Tümü</option>
          </select>
        </label>
      </div>

      {!data ? <p className="text-[13px] text-subtle">Yükleniyor…</p> : data.ready && data.parties.length === 0 ? (
        <Empty text="Henüz kayıt yok. Yukarıdan ilk müşteriyi ekleyin; yalnızca görünen ad yeterli." />
      ) : visible.length === 0 ? (
        <Empty text="Bu filtrelere uyan kayıt yok." action={<button type="button" className={small} onClick={() => { setQ(''); setRole('all'); setPtype('all'); setOwner('all'); setArch('active'); }}>Filtreleri temizle</button>} />
      ) : (
        <ul className="grid gap-2" aria-label="Kayıtlar">
          <li className="text-[12px] text-subtle">{visible.length} kayıt</li>
          {visible.map((p) => {
            const proj = counts.projects.get(p.id) ?? 0;
            const svc = counts.services.get(p.id)?.size ?? 0;
            const prov = counts.provided.get(p.id) ?? 0;
            return (
              <li key={p.id}>
                <Link href={`/admin/ops/clients/${p.id}`} className="grid gap-1.5 rounded-md border border-line bg-surface-deep/80 p-3 transition-colors hover:border-yoca-lime/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span className="grid min-w-0 gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-white">{p.name}</span>
                      <Badge>{TYPE_LABEL[p.party_type] ?? p.party_type}</Badge>
                      {p.roles.map((r) => <Badge key={r} tone={r === 'provider' ? 'info' : 'muted'}>{ROLE_LABEL[r] ?? r}</Badge>)}
                      {p.archived_at && <Badge tone="warn">Arşivde</Badge>}
                    </span>
                    <span className="truncate text-[12px] text-subtle">
                      {[p.brand_name && p.brand_name !== p.name ? p.brand_name : null, p.legal_name, p.contact_name || null, p.email || null].filter(Boolean).join(' · ') || 'Ek bilgi yok'}
                      {p.tags.length > 0 && ` · #${p.tags.join(' #')}`}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
                    <span>{proj} proje</span>
                    <span>{svc} hizmet</span>
                    {prov > 0 && <span>{prov} sağlanan hizmet</span>}
                    <span>{p.owner_email ? p.owner_email : <span className="italic text-subtle">sorumlu yok</span>}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
