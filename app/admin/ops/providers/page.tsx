'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Badge, DateOr, Details, Documents, Empty, EntityLink, Flash, PageHead, field, label, small } from '@/components/admin/ops/ui';
import { archiveRow, loadOps, saveRow, type OpsData, type Party, type ProviderAccount } from '@/lib/ops/data';
import { KIND_LABEL, SERVICE_STATUS_LABEL, dueText, istanbulDay } from '@/lib/ops/model';

/**
 * Yoca Operasyon — Sağlayıcılar (registrars, hosting, cloud, SaaS…).
 * A provider is a public.clients row with the role 'provider' — the same firm
 * can also be a customer. Accounts never hold secrets: secret_ref only says
 * WHERE the secret is kept. Panel / website addresses are plain links.
 */

const SECRET_HINT = 'Şifreyi buraya yazmayın; yalnızca nerede saklandığını yazın (ör. 1Password › Yoca › Hetzner)';
const norm = (v: string | null | undefined) => (v ?? '').trim().toLocaleLowerCase('tr');
const nz = (v: string) => (v.trim() ? v.trim() : null);

function safeHref(u: string | null | undefined): string | null {
  const v = (u ?? '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return `https://${v}`;
  return null;
}

/** Looks like a password / API key rather than a place name (no spaces, mixed letters+digits, or a known key prefix). */
function looksSecret(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (/^(sk|pk|rk)[-_]|^gh[pousr]_|^AKIA|^xox[bp]-|^eyJ/i.test(s)) return true;
  return !/\s/.test(s) && s.length >= 8 && /\d/.test(s) && /[A-Za-z]/.test(s) && !/[›>/\\|]/.test(s);
}

function similar(parties: Party[], name: string): Party[] {
  const n = norm(name);
  if (n.length < 2) return [];
  return parties.filter((p) => [p.name, p.brand_name, p.legal_name].some((v) => {
    const x = norm(v);
    return x && (x === n || (n.length >= 3 && (x.includes(n) || n.includes(x))));
  })).slice(0, 6);
}

export default function ProvidersPage() {
  return <Suspense fallback={<p className="text-[13px] text-subtle">Yükleniyor…</p>}><Providers /></Suspense>;
}

function Providers() {
  const sp = useSearchParams();
  const router = useRouter();
  const selectedId = sp.get('id');
  const [data, setData] = useState<OpsData | null>(null);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'bad' | 'warn' } | null>(null);
  const say = (text: string, tone: 'ok' | 'bad' | 'warn' = 'ok') => setFlash({ text, tone });
  const reload = async () => setData(await loadOps());
  useEffect(() => { void reload(); }, []);
  const select = (id: string | null) => router.replace(id ? `/admin/ops/providers?id=${id}` : '/admin/ops/providers', { scroll: false });

  const providers = useMemo(() => (data?.parties ?? []).filter((p) => p.roles.includes('provider')), [data]);
  const visible = providers.filter((p) => (showArchived || !p.archived_at) && (!norm(q) || [p.name, p.brand_name, p.legal_name, p.website, p.support_contact].some((v) => norm(v).includes(norm(q)))));
  const selected = providers.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="grid gap-6">
      <PageHead
        title="Sağlayıcılar"
        sub="Domain, hosting, sunucu, e-posta ve yazılım sağlayıcıları; hesapları (şifresiz) ve onlardan alınan hizmetler. Aynı firma müşteri de olabilir."
        actions={<Link href="/admin/ops/clients" className="admin-btn">Tüm firmalar</Link>}
      />
      {data?.error && <Flash tone="bad" message={data.error} />}
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}

      {data?.ready && <CreateProvider parties={data.parties} onDone={async (id, m) => { say(m); await reload(); select(id); }} onError={(m) => say(m, 'bad')} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${field} flex-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sağlayıcı ara…" aria-label="Sağlayıcı ara" />
            <label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arşivdekiler</label>
          </div>
          {!data ? <p className="text-[13px] text-subtle">Yükleniyor…</p> : providers.length === 0 ? (
            <Empty text="Henüz sağlayıcı yok. Yukarıdan ekleyin veya mevcut bir firmaya sağlayıcı rolü verin." />
          ) : visible.length === 0 ? <Empty text="Aramaya uyan sağlayıcı yok." /> : (
            <ul className="grid gap-2">
              {visible.map((p) => {
                const svc = data.services.filter((s) => s.provider_id === p.id && !s.archived_at).length;
                const acc = data.accounts.filter((a) => a.provider_id === p.id && !a.archived_at).length;
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => select(p.id)} aria-current={p.id === selectedId ? 'true' : undefined}
                      className={`grid w-full gap-1 rounded-md border p-3 text-left transition-colors ${p.id === selectedId ? 'border-yoca-lime bg-surface' : 'border-line bg-surface-deep/80 hover:border-yoca-lime/50'}`}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white">{p.name}</span>
                        {p.roles.filter((r) => r !== 'provider').map((r) => <Badge key={r}>{r === 'customer' ? 'Müşteri de' : 'Partner de'}</Badge>)}
                        {p.archived_at && <Badge tone="warn">Arşivde</Badge>}
                      </span>
                      <span className="text-[12px] text-subtle">{svc} hizmet · {acc} hesap{p.website ? ` · ${p.website}` : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="grid content-start gap-4">
          {selectedId && data && !selected && <Empty text="Bu sağlayıcı bulunamadı." />}
          {!selectedId && data && providers.length > 0 && <p className="text-[13px] text-subtle">Ayrıntı için listeden bir sağlayıcı seçin.</p>}
          {selected && data && <ProviderDetail key={selected.id} p={selected} data={data} onChange={async (m) => { say(m); await reload(); }} onError={(m) => say(m, 'bad')} onClose={() => select(null)} />}
        </div>
      </div>
    </div>
  );
}

/* ── Yeni sağlayıcı (çift kayıt kontrolü / mevcut firmaya rol) ─────── */

function CreateProvider({ parties, onDone, onError }: { parties: Party[]; onDone: (id: string, m: string) => void; onError: (m: string) => void }) {
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [existing, setExisting] = useState('');
  const [busy, setBusy] = useState(false);
  const dupes = useMemo(() => similar(parties, name), [parties, name]);
  const others = parties.filter((p) => !p.roles.includes('provider') && !p.archived_at);

  const addRole = async (p: Party) => {
    setBusy(true);
    const r = await saveRow<Partial<Party>>('clients', { id: p.id, roles: Array.from(new Set([...p.roles, 'provider'])), updated_at: new Date().toISOString() });
    setBusy(false);
    if (r.error) onError(r.error); else { setName(''); setExisting(''); onDone(p.id, `“${p.name}” artık sağlayıcı da.`); }
  };
  const create = async (e: React.FormEvent, force = false) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { onError('Görünen ad gerekli.'); return; }
    if (dupes.length && !force) { onError('Benzer kayıt var: mevcut firmayı kullanın ya da “Yine de yeni oluştur” deyin.'); return; }
    setBusy(true);
    const r = await saveRow<Partial<Party>>('clients', { name: n, party_type: 'company', roles: ['provider'], status: 'active', source_type: 'manual', website: website.trim() });
    setBusy(false);
    if (!r.row) { onError(r.error ?? 'Kaydedilemedi.'); return; }
    setName(''); setWebsite('');
    onDone(r.row.id, `“${n}” sağlayıcı olarak eklendi.`);
  };

  return (
    <section className="admin-card grid gap-3 !p-4" aria-label="Sağlayıcı ekle">
      <form onSubmit={(e) => create(e)} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className={label}>Yeni sağlayıcı adı *<input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Hetzner, Natro, Google Workspace" /></label>
        <label className={label}>Web sitesi <span className="font-normal text-subtle">(isteğe bağlı)</span><input className={field} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" /></label>
        <button type="submit" disabled={busy} className="admin-btn-primary">{busy ? 'Ekleniyor…' : '+ Ekle'}</button>
      </form>
      {dupes.length > 0 && (
        <div className="grid gap-1.5 border border-yellow-400/40 bg-yellow-400/5 p-3 text-[13px] text-yellow-100">
          <p>Benzer adla kayıt var — çift kayıt açmamak için mevcut firmayı kullanın:</p>
          <ul className="grid gap-1">
            {dupes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <EntityLink href={`/admin/ops/clients/${p.id}`}>{p.name}</EntityLink>
                {p.roles.includes('provider')
                  ? <button type="button" className={small} onClick={() => onDone(p.id, `“${p.name}” zaten sağlayıcı.`)}>Zaten sağlayıcı — aç</button>
                  : <button type="button" className={small} disabled={busy} onClick={() => addRole(p)}>Bu firmaya sağlayıcı rolü ekle</button>}
                {p.archived_at && <Badge tone="warn">Arşivde</Badge>}
              </li>
            ))}
          </ul>
          <button type="button" className={`${small} justify-self-start`} disabled={busy} onClick={(e) => create(e as unknown as React.FormEvent, true)}>Yine de yeni oluştur</button>
        </div>
      )}
      {others.length > 0 && (
        <Details title="Mevcut bir firmayı sağlayıcı yap" hint="müşteri kaydı tekrar açılmaz">
          <div className="flex flex-wrap items-end gap-2">
            <label className={`${label} min-w-[14rem] flex-1`}>Firma
              <select className={field} value={existing} onChange={(e) => setExisting(e.target.value)}>
                <option value="">Seçin…</option>
                {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <button type="button" className="admin-btn" disabled={!existing || busy} onClick={() => { const p = others.find((x) => x.id === existing); if (p) void addRole(p); }}>Sağlayıcı rolü ekle</button>
          </div>
        </Details>
      )}
    </section>
  );
}

/* ── Ayrıntı ─────────────────────────────────────────────────────── */

function ProviderDetail({ p, data, onChange, onError, onClose }: { p: Party; data: OpsData; onChange: (m: string) => void; onError: (m: string) => void; onClose: () => void }) {
  const init = { name: p.name, website: p.website ?? '', support_contact: p.support_contact ?? '', panel_url: p.panel_url ?? '', email: p.email ?? '', phone: p.phone ?? '', note: p.note ?? '' };
  const [d, setD] = useState(init);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(init);
  const services = data.services.filter((s) => s.provider_id === p.id);
  const today = istanbulDay();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.name.trim()) { onError('Görünen ad gerekli.'); return; }
    if (looksSecret(d.note) && !window.confirm('Notta şifre veya anahtar gibi görünen bir değer var. Şifreleri buraya yazmayın. Yine de kaydedilsin mi?')) return;
    setBusy(true);
    const r = await saveRow<Partial<Party>>('clients', {
      id: p.id, name: d.name.trim(), website: d.website.trim(), support_contact: nz(d.support_contact), panel_url: nz(d.panel_url),
      email: d.email.trim(), phone: d.phone.trim(), note: d.note, updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (r.error) onError(r.error); else onChange('Kaydedildi.');
  };
  const dropRole = async () => {
    const rest = p.roles.filter((r) => r !== 'provider');
    if (rest.length === 0) { onError('Bu firmanın başka rolü yok; sağlayıcı rolünü kaldırmak yerine arşivleyin.'); return; }
    if (!window.confirm(`“${p.name}” sağlayıcı listesinden çıkarılsın mı?${services.length ? ` ${services.length} hizmet bu sağlayıcıya bağlı kalır.` : ''} Kayıt silinmez.`)) return;
    const r = await saveRow<Partial<Party>>('clients', { id: p.id, roles: rest, updated_at: new Date().toISOString() });
    if (r.error) onError(r.error); else onChange('Sağlayıcı rolü kaldırıldı.');
  };
  const archive = async () => {
    const to = !p.archived_at;
    if (to && !window.confirm(`“${p.name}” arşivlensin mi? Hizmetler ve geçmiş silinmez.`)) return;
    const err = await archiveRow('clients', p.id, to);
    if (err) onError(err); else onChange(to ? 'Arşivlendi.' : 'Arşivden çıkarıldı.');
  };

  const site = safeHref(p.website);
  const panel = safeHref(p.panel_url);
  return (
    <>
      <section className="admin-card grid gap-3 !p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <h2 className="text-lg font-extrabold">{p.name}</h2>
            <p className="flex flex-wrap gap-3 text-[12px] text-subtle">
              {site && <a className="underline" href={site} target="_blank" rel="noopener noreferrer">Web sitesi</a>}
              {panel && <a className="underline" href={panel} target="_blank" rel="noopener noreferrer">Panel</a>}
              <Link className="underline" href={`/admin/ops/clients/${p.id}`}>Firma kaydının tamamı</Link>
            </p>
          </div>
          <button type="button" className={small} onClick={onClose}>Kapat</button>
        </div>
        <form onSubmit={save} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Görünen ad *<input className={field} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
            <label className={label}>Web sitesi<input className={field} value={d.website} onChange={(e) => setD({ ...d, website: e.target.value })} placeholder="https://…" /></label>
            <label className={label}>Destek iletişimi<input className={field} value={d.support_contact} onChange={(e) => setD({ ...d, support_contact: e.target.value })} placeholder="destek e-postası, telefon, bilet adresi" /></label>
            <label className={label}>Panel adresi<input className={field} value={d.panel_url} onChange={(e) => setD({ ...d, panel_url: e.target.value })} placeholder="https://…" /></label>
          </div>
          <Details title="Diğer" hint={[d.email, d.phone].filter(Boolean).join(' · ') || undefined}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>E-posta<input className={field} type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
              <label className={label}>Telefon<input className={field} value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></label>
            </div>
          </Details>
          <label className={label}>Not<textarea className={field} rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy || !dirty} className="admin-btn-primary">{busy ? 'Kaydediliyor…' : dirty ? 'Kaydet' : 'Kaydedildi'}</button>
            <span className="flex-1" />
            {p.roles.length > 1 && <button type="button" className={small} onClick={dropRole}>Sağlayıcı rolünü kaldır</button>}
            <button type="button" className={small} onClick={archive}>{p.archived_at ? 'Arşivden çıkar' : 'Arşivle'}</button>
          </div>
        </form>
      </section>

      <Accounts provider={p} accounts={data.accounts.filter((a) => a.provider_id === p.id)} services={services} onChange={onChange} onError={onError} />

      <section className="admin-card grid gap-3 !p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Bu sağlayıcıdan alınan hizmetler</h3>
          <Link href={`/admin/ops/services?provider=${p.id}`} className="text-[12px] text-subtle underline">Hizmet listesinde aç →</Link>
        </div>
        {services.length === 0 ? <Empty text="Bu sağlayıcıya bağlı hizmet yok." action={<Link href="/admin/ops/services/new" className={small}>+ Yeni hizmet</Link>} /> : (
          <ul className="grid gap-1 text-[13px]">
            {services.map((s) => {
              const acc = data.accounts.find((a) => a.id === s.provider_account_id);
              const end = data.periods.find((x) => x.service_id === s.id && x.status === 'open')?.ends_on ?? s.end_on;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <EntityLink href={`/admin/ops/services/${s.id}`}>{s.name}</EntityLink>
                    <Badge>{KIND_LABEL[s.kind] ?? s.kind}</Badge>
                    {s.status !== 'active' && <Badge tone="warn">{SERVICE_STATUS_LABEL[s.status] ?? s.status}</Badge>}
                    {s.archived_at && <Badge>Arşivde</Badge>}
                  </span>
                  <span className="text-[12px] text-subtle">{acc ? `Hesap: ${acc.label} · ` : ''}{s.is_perpetual ? 'Süresiz' : <>Bitiş <DateOr value={end} />{end && ` (${dueText(end, today)})`}</>}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="admin-card grid gap-2 !p-4">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Belgeler</h3>
        <Documents entity="provider" entityId={p.id} />
      </section>
    </>
  );
}

/* ── Hesaplar (şifresiz) ─────────────────────────────────────────── */

type AccDraft = { label: string; account_ref: string; login_hint: string; panel_url: string; secret_ref: string; note: string };
const emptyAcc: AccDraft = { label: '', account_ref: '', login_hint: '', panel_url: '', secret_ref: '', note: '' };

function Accounts({ provider, accounts, services, onChange, onError }: { provider: Party; accounts: ProviderAccount[]; services: OpsData['services']; onChange: (m: string) => void; onError: (m: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [d, setD] = useState<AccDraft>(emptyAcc);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = accounts.filter((a) => showArchived || !a.archived_at);

  const start = (a: ProviderAccount | null) => {
    setEditing(a ? a.id : 'new');
    setD(a ? { label: a.label, account_ref: a.account_ref ?? '', login_hint: a.login_hint ?? '', panel_url: a.panel_url ?? '', secret_ref: a.secret_ref ?? '', note: a.note ?? '' } : emptyAcc);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.label.trim()) { onError('Hesap adı gerekli.'); return; }
    const suspicious = (['secret_ref', 'login_hint', 'account_ref', 'note'] as const).filter((k) => looksSecret(d[k]));
    if (suspicious.length && !window.confirm('Bir alanda şifre veya API anahtarı gibi görünen bir değer var. Şifreler buraya yazılmaz; yalnızca nerede saklandığı yazılır. Yine de kaydedilsin mi?')) return;
    if (d.panel_url.trim() && !safeHref(d.panel_url)) { onError('Panel adresi http(s):// ile başlamalı.'); return; }
    setBusy(true);
    const r = await saveRow<Partial<ProviderAccount>>('ops_provider_accounts', {
      ...(editing && editing !== 'new' ? { id: editing } : { provider_id: provider.id }),
      label: d.label.trim(), account_ref: nz(d.account_ref), login_hint: nz(d.login_hint), panel_url: nz(d.panel_url), secret_ref: nz(d.secret_ref), note: nz(d.note),
    });
    setBusy(false);
    if (r.error) { onError(r.error); return; }
    setEditing(null);
    onChange('Hesap kaydedildi.');
  };
  const archive = async (a: ProviderAccount) => {
    const to = !a.archived_at;
    if (to && !window.confirm(`“${a.label}” hesabı arşivlensin mi?`)) return;
    const err = await archiveRow('ops_provider_accounts', a.id, to);
    if (err) onError(err); else onChange(to ? 'Hesap arşivlendi.' : 'Hesap arşivden çıkarıldı.');
  };

  const warn = (v: string) => looksSecret(v) && <p className="text-[12px] font-semibold text-red-300">Bu bir şifre/anahtar gibi görünüyor — buraya yazmayın.</p>;
  const form = (
    <form onSubmit={save} className="grid gap-3 border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Hesap adı *<input className={field} value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="ör. Yoca ana hesap" autoFocus /></label>
        <label className={label}>Hesap / müşteri no<input className={field} value={d.account_ref} onChange={(e) => setD({ ...d, account_ref: e.target.value })} />{warn(d.account_ref)}</label>
        <label className={label}>Giriş ipucu <span className="font-normal text-subtle">(kullanıcı adı / e-posta — şifre değil)</span><input className={field} value={d.login_hint} onChange={(e) => setD({ ...d, login_hint: e.target.value })} />{warn(d.login_hint)}</label>
        <label className={label}>Panel adresi<input className={field} value={d.panel_url} onChange={(e) => setD({ ...d, panel_url: e.target.value })} placeholder="https://…" /></label>
        <label className={`${label} sm:col-span-2`}>Şifre nerede saklanıyor
          <input className={field} value={d.secret_ref} onChange={(e) => setD({ ...d, secret_ref: e.target.value })} placeholder="1Password › Yoca › Hetzner" autoComplete="off" />
          <span className="text-[12px] font-normal text-yellow-200">{SECRET_HINT}</span>
          {warn(d.secret_ref)}
        </label>
        <label className={`${label} sm:col-span-2`}>Not<input className={field} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />{warn(d.note)}</label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="admin-btn-primary">{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        <button type="button" className="admin-btn" onClick={() => setEditing(null)}>Vazgeç</button>
      </div>
    </form>
  );

  return (
    <section className="admin-card grid gap-3 !p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Hesaplar</h3>
        {accounts.some((a) => a.archived_at) && <label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arşivdekiler</label>}
      </div>
      <p className="text-[12px] text-subtle">Aynı sağlayıcıda birden çok hesap olabilir. Şifre, API anahtarı ve kart bilgisi burada tutulmaz.</p>
      {list.length === 0 && editing !== 'new' && <Empty text="Kayıtlı hesap yok." />}
      <ul className="grid gap-2">
        {list.map((a) => {
          const panel = safeHref(a.panel_url);
          const used = services.filter((s) => s.provider_account_id === a.id).length;
          return (
            <li key={a.id}>
              {editing === a.id ? form : (
                <div className="flex flex-wrap items-start justify-between gap-2 border-t border-line pt-2 text-[13px]">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 font-bold text-white">{a.label}{a.archived_at && <Badge>Arşivde</Badge>}<span className="font-normal text-subtle">{used} hizmet</span></span>
                    <span className="text-[12px] text-subtle">
                      {[a.account_ref && `No: ${a.account_ref}`, a.login_hint && `Giriş: ${a.login_hint}`].filter(Boolean).join(' · ')}
                      {panel && <> · <a className="underline" href={panel} target="_blank" rel="noopener noreferrer">Panel</a></>}
                    </span>
                    <span className="text-[12px] text-subtle">Şifre: {a.secret_ref ? a.secret_ref : <span className="italic">nerede saklandığı yazılmadı</span>}</span>
                    {a.note && <span className="text-[12px] text-subtle">{a.note}</span>}
                  </div>
                  <span className="flex gap-1.5">
                    <button type="button" className={small} onClick={() => start(a)}>Düzenle</button>
                    <button type="button" className={small} onClick={() => archive(a)}>{a.archived_at ? 'Geri al' : 'Arşivle'}</button>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {editing === 'new' ? form : <button type="button" className="admin-btn justify-self-start" onClick={() => start(null)}>+ Hesap ekle</button>}
    </section>
  );
}
