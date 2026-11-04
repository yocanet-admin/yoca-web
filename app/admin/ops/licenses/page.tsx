'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Details, Empty, EntityLink, Flash, PageHead, field, fmtDate, fmtDateTime, label, small } from '@/components/admin/ops/ui';
import { adminApi, adminPost } from '@/lib/cockpit/client';
import { db, loadOps, saveRow, type LicenseLink, type OpsData } from '@/lib/ops/data';
import { daysUntil, dueText, istanbulDay } from '@/lib/ops/model';
import { LICENSE_ACTIONS, LICENSE_ACTION_LABEL, type LicenseAction } from '@/lib/ops/settings';

/**
 * Yoca Operasyon — Lisanslar. license.yoca.net is the source of truth:
 *  - not configured → said plainly, missing env NAMES listed, actions disabled
 *    with the reason; the cockpit-side link table stays usable;
 *  - configured → the list as read NOW with "Son eşitleme"; a failed read shows
 *    the error and never an older list as current;
 *  - every action form gets ONE request key (crypto.randomUUID) that is reused
 *    on retry; an unknown outcome is checked with the same key, never re-sent
 *    blindly. Revoke needs an extra confirmation (it is final).
 */

/** Shape of lib/ops/licenseApi.ts RemoteLicense (that file is server-only). */
interface RemoteLicense {
  id: string;
  product: { id: string; name: string; slug?: string } | null;
  customer: { id: string; name: string; email?: string } | null;
  key_masked: string | null;
  status: 'active' | 'suspended' | 'revoked';
  activation_limit: number | null;
  expires_at: string | null; // null = perpetual (in the license system)
  issued_at: string | null;
  suspended_at: string | null;
  revoked_at: string | null;
  notes: string | null;
  activations?: Array<{ domain: string; environment: string; status: string; last_validated_at: string | null }>;
}

interface LicGet {
  ok?: boolean; error?: string; configured?: boolean; missing?: string[];
  permissions?: Partial<Record<LicenseAction, boolean>>;
  licenses?: RemoteLicense[] | null; fetchedAt?: string; errorKind?: string;
}
interface LicPost { ok?: boolean; result?: unknown; replay?: boolean; code?: string; error?: string }

const STATUS_LABEL: Record<RemoteLicense['status'], string> = { active: 'Aktif', suspended: 'Askıda', revoked: 'İptal edildi' };
const STATUS_TONE: Record<RemoteLicense['status'], 'ok' | 'warn' | 'bad'> = { active: 'ok', suspended: 'warn', revoked: 'bad' };
const BUTTON: Record<LicenseAction, string> = { create: '+ Yeni lisans', extend: 'Uzat', suspend: 'Askıya al', resume: 'Askıdan çıkar', revoke: 'İptal et' };

interface ActionState {
  action: LicenseAction;
  licenseId?: string;
  title: string;
  key: string;
  form: Record<string, string>;
  perpetual: boolean;
  confirmRevoke: boolean;
  sent: Record<string, unknown> | null; // payload sent with this key (locked while the outcome is open)
  status: 'idle' | 'running' | 'done' | 'failed' | 'unknown' | 'in_progress';
  message: string | null;
  linkClient: string;
  linkProject: string;
}

const newKey = () => crypto.randomUUID();

export default function LicensesPage() {
  const [remote, setRemote] = useState<LicGet | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OpsData | null>(null);
  const [q, setQ] = useState('');
  const [act, setAct] = useState<ActionState | null>(null);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'bad' | 'warn' } | null>(null);
  const [linkPrefill, setLinkPrefill] = useState<string | null>(null);
  const today = istanbulDay();
  const say = (text: string, tone: 'ok' | 'bad' | 'warn' = 'ok') => setFlash({ text, tone });

  const loadRemote = async () => {
    setLoading(true);
    const r = await adminApi<LicGet>('/api/admin/ops/licenses');
    setRemote(r);
    setLoading(false);
  };
  const reloadOps = async () => setData(await loadOps());
  useEffect(() => { void loadRemote(); void reloadOps(); }, []);

  const configured = remote?.configured === true;
  const list = remote?.ok !== false && configured && Array.isArray(remote?.licenses) ? remote.licenses : null;
  const linkByLicense = useMemo(() => {
    const m = new Map<string, LicenseLink>();
    (data?.licenses ?? []).forEach((l) => m.set(l.license_id, l));
    return m;
  }, [data]);

  /** Why an action is not available right now (null = available). */
  const reason = (a: LicenseAction): string | null => {
    if (loading && !remote) return 'Durum yükleniyor.';
    if (!remote || remote.ok === false) return `Lisans durumu okunamadı${remote?.error ? `: ${remote.error}` : '.'}`;
    if (!configured) return `Lisans sistemi bağlı değil (${(remote.missing ?? []).join(', ') || 'yapılandırma eksik'}).`;
    if (!remote.permissions?.[a]) return 'Bu işlem için yetkiniz yok (Operasyon ayarları → Lisans yetkileri).';
    if (a !== 'create' && !list) return 'Lisans listesi okunamadı; önce listeyi yenileyin.';
    return null;
  };

  const open = (action: LicenseAction, lic?: RemoteLicense) => {
    if (act && (act.status === 'running' || act.status === 'unknown' || act.status === 'in_progress') && !window.confirm('Açık bir işlemin sonucu henüz belli değil. Yine de kapatıp yenisini açmak istiyor musunuz?')) return;
    const title = lic ? `${LICENSE_ACTION_LABEL[action]}: ${lic.product?.name ?? 'Lisans'} · ${lic.customer?.name ?? lic.id}` : LICENSE_ACTION_LABEL[action];
    setAct({
      action, licenseId: lic?.id, title, key: newKey(), form: action === 'extend' && lic?.expires_at ? { expires_at: lic.expires_at.slice(0, 10) } : {},
      perpetual: false, confirmRevoke: false, sent: null, status: 'idle', message: null, linkClient: '', linkProject: '',
    });
  };

  const buildPayload = (s: ActionState): { payload?: Record<string, unknown>; error?: string } => {
    const f = s.form;
    const t = (k: string) => (f[k] ?? '').trim();
    switch (s.action) {
      case 'create': {
        if (!t('product_id')) return { error: 'Ürün gerekli.' };
        if (!t('customer_name') && !t('customer_email')) return { error: 'Müşteri adı veya e-postası gerekli.' };
        if (!s.perpetual && !t('expires_at')) return { error: 'Bitiş tarihi girin ya da “Süresiz” seçin.' };
        const limit = t('activation_limit');
        if (limit && !(Number.isInteger(Number(limit)) && Number(limit) > 0)) return { error: 'Aktivasyon limiti pozitif tam sayı olmalı.' };
        return { payload: { product_id: t('product_id'), customer: { name: t('customer_name') || null, email: t('customer_email') || null }, expires_at: s.perpetual ? null : t('expires_at'), activation_limit: limit ? Number(limit) : null, notes: t('notes') || null } };
      }
      case 'extend':
        if (!t('expires_at')) return { error: 'Yeni bitiş tarihi gerekli.' };
        return { payload: { expires_at: t('expires_at'), note: t('note') || null } };
      case 'suspend':
        return { payload: { reason: t('reason') || null } };
      case 'resume':
        return { payload: { note: t('note') || null } };
      case 'revoke':
        if (!t('reason')) return { error: 'İptal nedeni gerekli.' };
        if (!s.confirmRevoke) return { error: 'İptalin geri alınamaz olduğunu onaylayın.' };
        return { payload: { reason: t('reason') } };
    }
  };

  const submit = async () => {
    if (!act || act.status === 'running') return;
    const blocked = reason(act.action);
    if (blocked) { setAct({ ...act, status: 'failed', message: blocked }); return; }
    let payload = act.sent;
    if (!payload) {
      const b = buildPayload(act);
      if (b.error) { setAct({ ...act, message: b.error, status: 'idle' }); return; }
      payload = b.payload ?? {};
    }
    if (act.action === 'revoke' && !window.confirm('Lisans KALICI olarak iptal edilecek. Bu işlem geri alınamaz. Devam edilsin mi?')) return;
    const running: ActionState = { ...act, sent: payload, status: 'running', message: null };
    setAct(running);
    const r = await adminPost<LicPost>('/api/admin/ops/licenses', { action: act.action, requestKey: act.key, licenseId: act.licenseId, payload });
    if (r.ok) {
      const msg = r.replay ? 'Bu istek daha önce tamamlanmıştı; ikinci kez gönderilmedi.' : 'İşlem lisans sisteminde tamamlandı.';
      setAct({ ...running, status: 'done', message: msg });
      // A new license: link it here (client / project) when the license system returned its id.
      const created = act.action === 'create' && r.result && typeof r.result === 'object' ? (r.result as { id?: unknown; license?: { id?: unknown } }) : null;
      const newId = created ? String(created.id ?? created.license?.id ?? '') : '';
      if (newId && (act.linkClient || act.linkProject)) {
        const l = await saveRow<Partial<LicenseLink>>('ops_license_links', { license_id: newId, client_id: act.linkClient || null, project_id: act.linkProject || null });
        if (l.error) say(`Lisans oluşturuldu ama bağlantı kaydedilemedi: ${l.error}`, 'warn'); else await reloadOps();
      } else if (newId) setLinkPrefill(newId);
      void loadRemote();
      return;
    }
    const transport = !r.code && /ulaşılamadı|zaman aşımı|zamanında yanıt|HTTP 50[234]/i.test(r.error ?? '');
    if (r.code === 'unknown' || transport) {
      setAct({ ...running, status: 'unknown', message: `${r.error ?? 'Sonuç bilinmiyor.'} İşlem gerçekleşmiş olabilir. “Kontrol et ve tekrar dene” aynı istek anahtarıyla önce lisans sistemine sorar; ikinci bir lisans oluşturmaz.` });
    } else if (r.code === 'in_progress') {
      setAct({ ...running, status: 'in_progress', message: r.error ?? 'Bu işlem zaten sürüyor; birkaç saniye sonra kontrol edin.' });
    } else {
      // Rejected / not allowed: the key is spent; a corrected attempt is a NEW request.
      setAct({ ...running, status: 'failed', sent: null, key: newKey(), message: `${r.error ?? 'İşlem yapılamadı.'} Düzeltip yeniden gönderebilirsiniz (yeni istek).` });
    }
  };

  const visible = (list ?? []).filter((l) => {
    const n = q.trim().toLocaleLowerCase('tr');
    if (!n) return true;
    return [l.id, l.product?.name, l.customer?.name, l.customer?.email, l.key_masked, linkByLicense.get(l.id)?.label].some((v) => (v ?? '').toLocaleLowerCase('tr').includes(n));
  });
  const products = useMemo(() => {
    const m = new Map<string, string>();
    (list ?? []).forEach((l) => { if (l.product) m.set(l.product.id, l.product.name); });
    return Array.from(m.entries());
  }, [list]);

  return (
    <div className="grid gap-6">
      <PageHead
        title="Lisanslar"
        sub="Lisansların asıl kaynağı license.yoca.net. Burada liste canlı okunur, işlemler lisans sistemine gönderilir ve lisanslar müşteri/proje/hizmetle eşleştirilir."
        actions={<>
          <a href="https://license.yoca.net" target="_blank" rel="noopener noreferrer" className="admin-btn">license.yoca.net ↗</a>
          <button type="button" className="admin-btn" disabled={loading} onClick={() => void loadRemote()}>{loading ? 'Okunuyor…' : 'Listeyi yenile'}</button>
        </>}
      />
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}

      {/* ── Bağlantı durumu ── */}
      <section className="admin-card grid gap-3 !p-4" aria-live="polite">
        {loading && !remote ? <p className="text-[13px] text-subtle">Lisans sistemi kontrol ediliyor…</p> : !remote || remote.ok === false ? (
          <Flash tone="bad" message={`Lisans durumu okunamadı: ${remote?.error ?? 'bilinmeyen hata'}`} />
        ) : !configured ? (
          <div className="grid gap-2 text-[13px]">
            <p className="text-base font-bold text-yellow-200">Lisans sistemi bağlı değil</p>
            <p className="text-muted">Bu ortamda lisans yönetim API’si yapılandırılmadı. Lisans listesi okunamaz; oluşturma, uzatma, askıya alma, askıdan çıkarma ve iptal kapalı. Lisansları şimdilik doğrudan <a className="underline" href="https://license.yoca.net" target="_blank" rel="noopener noreferrer">license.yoca.net</a> üzerinden yönetin.</p>
            <p className="text-muted">Eksik ortam değişkenleri (yalnızca adları):</p>
            <ul className="flex flex-wrap gap-2">{(remote.missing ?? []).map((m) => <li key={m}><code className="border border-line px-1.5 py-0.5 text-[12px] text-yoca-lime">{m}</code></li>)}</ul>
            <p className="text-[12px] text-subtle">Aşağıdaki bağlantı tablosu (lisans ↔ müşteri/proje/hizmet) yine kullanılabilir.</p>
          </div>
        ) : remote.error || !list ? (
          <div className="grid gap-2">
            <Flash tone="bad" message={`Lisans listesi okunamadı: ${remote.error ?? 'bilinmeyen hata'}`} />
            <p className="text-[12px] text-subtle">Eski bir liste güncelmiş gibi gösterilmez. Bağlantı tablosundaki anlık görüntüler en son okundukları zamanla birlikte durur.</p>
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-[13px]"><Badge tone="ok">Bağlı</Badge> Son eşitleme: <strong>{fmtDateTime(remote.fetchedAt)}</strong> · {list.length} lisans</p>
        )}

        <Details title="İşlem yetkileri" hint={configured ? 'Operasyon ayarlarından verilir' : 'kapalı'} open={!configured}>
          <ul className="grid gap-1 text-[13px]">
            {LICENSE_ACTIONS.map((a) => {
              const why = reason(a);
              return (
                <li key={a} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
                  <span>{LICENSE_ACTION_LABEL[a]}</span>
                  {why ? <span className="text-[12px] text-subtle">Kapalı — {why}</span> : <Badge tone="ok">Açık</Badge>}
                </li>
              );
            })}
          </ul>
          <Link href="/admin/ops/settings" className="text-[12px] text-subtle underline">Operasyon ayarları → Lisans yetkileri</Link>
        </Details>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="admin-btn-primary" disabled={Boolean(reason('create'))} onClick={() => open('create')} title={reason('create') ?? undefined}>{BUTTON.create}</button>
          {reason('create') && <span className="text-[12px] text-subtle">{reason('create')}</span>}
        </div>
      </section>

      {act && <ActionPanel act={act} setAct={setAct} onSubmit={submit} onClose={() => { if ((act.status === 'unknown' || act.status === 'in_progress') && !window.confirm('Bu işlemin sonucu henüz bilinmiyor. Kapatırsanız aynı istek anahtarıyla kontrol edemezsiniz. Yine de kapatılsın mı?')) return; setAct(null); }}products={products} data={data} />}

      {/* ── Canlı liste ── */}
      {list && (
        <section className="grid gap-3" aria-label="Lisans listesi">
          <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün, müşteri, anahtar veya bağlantı adı ara…" aria-label="Lisans ara" />
          {list.length === 0 ? <Empty text="Lisans sisteminde lisans yok." /> : visible.length === 0 ? <Empty text="Aramaya uyan lisans yok." /> : (
            <ul className="grid gap-2">
              {visible.map((l) => {
                const link = linkByLicense.get(l.id);
                const exp = l.expires_at ? l.expires_at.slice(0, 10) : null;
                const soon = exp && daysUntil(exp, today) <= 30;
                const actions: LicenseAction[] = l.status === 'revoked' ? [] : l.status === 'suspended' ? ['resume', 'extend', 'revoke'] : ['extend', 'suspend', 'revoke'];
                return (
                  <li key={l.id} className="grid gap-2 rounded-md border border-line bg-surface-deep/80 p-3 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white">{l.product?.name ?? 'Ürün bilinmiyor'}</span>
                      <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status] ?? l.status}</Badge>
                      {soon && l.status !== 'revoked' && <Badge tone="warn">{dueText(exp, today)}</Badge>}
                      <span className="font-mono text-[12px] text-subtle">{l.key_masked ?? l.id}</span>
                    </div>
                    <div className="grid gap-x-4 gap-y-0.5 text-[12px] text-muted sm:grid-cols-2">
                      <span>Müşteri (lisans sisteminde): {l.customer ? `${l.customer.name}${l.customer.email ? ` · ${l.customer.email}` : ''}` : '—'}</span>
                      <span>Bitiş: {exp ? fmtDate(exp) : 'Süresiz (lisans sisteminde)'}</span>
                      <span>Aktivasyon: {(l.activations ?? []).filter((a) => a.status === 'active').length}{l.activation_limit !== null ? ` / ${l.activation_limit}` : ''}</span>
                      <span>Verildi: {l.issued_at ? fmtDate(l.issued_at) : '—'}</span>
                      <span className="sm:col-span-2">
                        Bağlantı: {link ? <>{link.label || 'adsız'}{clientName(data, link.client_id) && <> · <EntityLink href={`/admin/ops/clients/${link.client_id}`}>{clientName(data, link.client_id)}</EntityLink></>}</> : <button type="button" className="underline" onClick={() => setLinkPrefill(l.id)}>müşteri/projeye bağla</button>}
                      </span>
                    </div>
                    {actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {actions.map((a) => {
                          const why = reason(a);
                          return <button key={a} type="button" className={small} disabled={Boolean(why)} title={why ?? undefined} onClick={() => open(a, l)}>{BUTTON[a]}</button>;
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <LinkTable data={data} list={list} fetchedAt={remote?.fetchedAt ?? null} prefill={linkPrefill} clearPrefill={() => setLinkPrefill(null)} onChange={async (m) => { say(m); await reloadOps(); }} onError={(m) => say(m, 'bad')} />
    </div>
  );
}

function clientName(data: OpsData | null, id: string | null): string | null {
  if (!id || !data) return null;
  return data.parties.find((p) => p.id === id)?.name ?? null;
}

/* ── İşlem formu (tek istek anahtarı) ─────────────────────────────── */

function ActionPanel({ act, setAct, onSubmit, onClose, products, data }: { act: ActionState; setAct: (s: ActionState) => void; onSubmit: () => void; onClose: () => void; products: Array<[string, string]>; data: OpsData | null }) {
  const locked = act.sent !== null && act.status !== 'failed';
  const f = (k: string) => act.form[k] ?? '';
  const set = (k: string, v: string) => setAct({ ...act, form: { ...act.form, [k]: v } });
  const input = (k: string, text: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={label}>{text}<input className={field} value={f(k)} disabled={locked} onChange={(e) => set(k, e.target.value)} {...props} /></label>
  );
  const busy = act.status === 'running';
  const done = act.status === 'done';

  return (
    <section className={`admin-card grid gap-3 !p-4 ${act.action === 'revoke' ? '!border-red-500/50' : ''}`} aria-label={act.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-[15px] font-extrabold">{act.title}</h2>
        <button type="button" className={small} disabled={busy} onClick={onClose}>Kapat</button>
      </div>
      <p className="text-[11px] text-subtle">İstek anahtarı: <code>{act.key}</code> — tekrar denemede aynı anahtar kullanılır, işlem iki kez yapılmaz.</p>

      {!done && (
        <div className="grid gap-3 sm:grid-cols-2">
          {act.action === 'create' && <>
            <label className={label}>Ürün *
              <input className={field} list="ops-lic-products" value={f('product_id')} disabled={locked} onChange={(e) => set('product_id', e.target.value)} placeholder="ürün kimliği" />
              <datalist id="ops-lic-products">{products.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</datalist>
            </label>
            {input('customer_name', 'Müşteri adı (lisans sisteminde)')}
            {input('customer_email', 'Müşteri e-postası', { type: 'email' })}
            {input('activation_limit', 'Aktivasyon limiti', { inputMode: 'numeric' })}
            <div className="grid gap-1.5">
              {!act.perpetual && input('expires_at', 'Bitiş tarihi *', { type: 'date' })}
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={act.perpetual} disabled={locked} onChange={(e) => setAct({ ...act, perpetual: e.target.checked })} /> Süresiz lisans</label>
            </div>
            {input('notes', 'Not')}
            {data && (
              <>
                <label className={label}>Burada bağla: müşteri
                  <select className={field} value={act.linkClient} onChange={(e) => setAct({ ...act, linkClient: e.target.value })}>
                    <option value="">—</option>
                    {data.parties.filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className={label}>Burada bağla: proje
                  <select className={field} value={act.linkProject} onChange={(e) => setAct({ ...act, linkProject: e.target.value })}>
                    <option value="">—</option>
                    {data.projects.filter((p) => !p.archived_at && (!act.linkClient || p.client_id === act.linkClient)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </>
            )}
          </>}
          {act.action === 'extend' && <>{input('expires_at', 'Yeni bitiş tarihi *', { type: 'date' })}{input('note', 'Not')}</>}
          {act.action === 'suspend' && input('reason', 'Askıya alma nedeni')}
          {act.action === 'resume' && input('note', 'Not')}
          {act.action === 'revoke' && <>
            {input('reason', 'İptal nedeni *')}
            <div className="grid gap-2 border border-red-500/50 bg-red-500/10 p-3 text-[13px] text-red-100 sm:col-span-2">
              <p className="font-bold">İptal kalıcıdır ve geri alınamaz. Lisans tüm sitelerde çalışmayı durdurur; aynı lisans yeniden açılamaz.</p>
              <label className="flex items-center gap-2"><input type="checkbox" checked={act.confirmRevoke} disabled={locked} onChange={(e) => setAct({ ...act, confirmRevoke: e.target.checked })} /> Geri alınamayacağını anlıyorum.</label>
            </div>
          </>}
        </div>
      )}

      {act.message && <Flash tone={done ? 'ok' : act.status === 'unknown' || act.status === 'in_progress' ? 'warn' : 'bad'} message={act.message} />}

      <div className="flex flex-wrap gap-2">
        {done ? <button type="button" className="admin-btn" onClick={onClose}>Tamam</button>
          : act.status === 'unknown' || act.status === 'in_progress' ? (
            <button type="button" className="admin-btn-primary" disabled={busy} onClick={onSubmit}>{busy ? 'Kontrol ediliyor…' : 'Kontrol et ve tekrar dene'}</button>
          ) : (
            <button type="button" className={act.action === 'revoke' ? 'admin-btn !border-red-500 !text-red-300' : 'admin-btn-primary'} disabled={busy || (act.action === 'revoke' && !act.confirmRevoke)} onClick={onSubmit}>
              {busy ? 'Gönderiliyor…' : act.action === 'revoke' ? 'Kalıcı olarak iptal et' : `${LICENSE_ACTION_LABEL[act.action]} — gönder`}
            </button>
          )}
      </div>
    </section>
  );
}

/* ── Bağlantı tablosu (ops_license_links) ─────────────────────────── */

type LinkDraft = { license_id: string; label: string; client_id: string; project_id: string; service_id: string };
const emptyLink: LinkDraft = { license_id: '', label: '', client_id: '', project_id: '', service_id: '' };

function LinkTable({ data, list, fetchedAt, prefill, clearPrefill, onChange, onError }: { data: OpsData | null; list: RemoteLicense[] | null; fetchedAt: string | null; prefill: string | null; clearPrefill: () => void; onChange: (m: string) => void; onError: (m: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [d, setD] = useState<LinkDraft>(emptyLink);
  const [busy, setBusy] = useState(false);
  const today = istanbulDay();
  const start = (l: LicenseLink | null) => {
    setEditing(l ? l.id : 'new');
    setD(l ? { license_id: l.license_id, label: l.label ?? '', client_id: l.client_id ?? '', project_id: l.project_id ?? '', service_id: l.service_id ?? '' } : emptyLink);
  };

  useEffect(() => {
    if (!prefill || !data) return;
    const existing = data.licenses.find((l) => l.license_id === prefill);
    if (existing) start(existing); else { setEditing('new'); setD({ ...emptyLink, license_id: prefill }); }
    clearPrefill();
  }, [prefill, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  if (data.error) return <Flash tone="bad" message={data.error} />;
  const rows = data.licenses;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.license_id.trim()) { onError('Lisans kimliği gerekli.'); return; }
    setBusy(true);
    const r = await saveRow<Partial<LicenseLink>>('ops_license_links', {
      ...(editing && editing !== 'new' ? { id: editing } : {}),
      license_id: d.license_id.trim(), label: d.label.trim() || null, client_id: d.client_id || null, project_id: d.project_id || null, service_id: d.service_id || null,
    });
    setBusy(false);
    if (r.error) { onError(r.error); return; }
    setEditing(null);
    onChange('Lisans bağlantısı kaydedildi.');
  };
  const remove = async (l: LicenseLink) => {
    if (!window.confirm(`“${l.label || l.license_id}” bağlantısı kaldırılsın mı? Lisansın kendisi license.yoca.net’te kalır; yalnızca buradaki eşleştirme silinir.`)) return;
    const { error } = await db().from('ops_license_links').delete().eq('id', l.id);
    if (error) onError(error.message); else onChange('Bağlantı kaldırıldı.');
  };
  const syncSnapshots = async () => {
    if (!list || !fetchedAt) return;
    setBusy(true);
    const byId = new Map<string, RemoteLicense>();
    list.forEach((l) => byId.set(l.id, l));
    const results = await Promise.all(rows.map((row) => {
      const lic = byId.get(row.license_id);
      const patch = lic
        ? { snapshot: { status: lic.status, expires_at: lic.expires_at, product: lic.product?.name ?? null, customer: lic.customer?.name ?? null, key_masked: lic.key_masked }, last_synced_at: fetchedAt, sync_error: null }
        : { sync_error: `Lisans sisteminde bulunamadı (${fmtDateTime(fetchedAt)})` };
      return db().from('ops_license_links').update(patch).eq('id', row.id);
    }));
    setBusy(false);
    const failed = results.filter((r) => r.error).length;
    if (failed) onError(`${failed} bağlantı güncellenemedi.`); else onChange('Bağlantıların anlık görüntüsü bu listeden güncellendi.');
  };

  const name = (arr: Array<{ id: string; name: string }>, id: string | null) => (id ? arr.find((x) => x.id === id)?.name ?? '—' : null);
  const form = (
    <form onSubmit={save} className="grid gap-3 border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Lisans kimliği (license.yoca.net) *<input className={`${field} font-mono`} value={d.license_id} onChange={(e) => setD({ ...d, license_id: e.target.value })} /></label>
        <label className={label}>Etiket<input className={field} value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="ör. Kuzey Mimarlık — WP eklentisi" /></label>
        <label className={label}>Müşteri
          <select className={field} value={d.client_id} onChange={(e) => setD({ ...d, client_id: e.target.value })}>
            <option value="">—</option>
            {data.parties.filter((p) => !p.archived_at || p.id === d.client_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className={label}>Proje
          <select className={field} value={d.project_id} onChange={(e) => setD({ ...d, project_id: e.target.value })}>
            <option value="">—</option>
            {data.projects.filter((p) => (!p.archived_at || p.id === d.project_id) && (!d.client_id || p.client_id === d.client_id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className={label}>Hizmet
          <select className={field} value={d.service_id} onChange={(e) => setD({ ...d, service_id: e.target.value })}>
            <option value="">—</option>
            {data.services.filter((s) => !s.archived_at || s.id === d.service_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="admin-btn-primary">{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        <button type="button" className="admin-btn" onClick={() => setEditing(null)}>Vazgeç</button>
      </div>
    </form>
  );

  return (
    <section className="admin-card grid gap-3 !p-4" aria-label="Lisans bağlantıları">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Bağlantılar (cockpit tarafı)</h2>
        {list && rows.length > 0 && <button type="button" className={small} disabled={busy} onClick={syncSnapshots}>Anlık görüntüleri bu listeden güncelle</button>}
      </div>
      <p className="text-[12px] text-subtle">Lisans kimliğini müşteri, proje veya hizmetle eşleştirir. Lisans verisi kopyalanmaz; “anlık görüntü” yalnızca en son okunan durumdur ve okunduğu zamanla gösterilir.</p>
      {rows.length === 0 && editing !== 'new' && <Empty text="Henüz bağlantı yok." />}
      <ul className="grid gap-2">
        {rows.map((l) => {
          const snap = (l.snapshot ?? {}) as Record<string, unknown>;
          const exp = typeof snap.expires_at === 'string' ? snap.expires_at.slice(0, 10) : null;
          return (
            <li key={l.id}>
              {editing === l.id ? form : (
                <div className="flex flex-wrap items-start justify-between gap-2 border-t border-line pt-2 text-[13px]">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-bold text-white">{l.label || 'Etiketsiz'}</span><span className="font-mono text-[12px] text-subtle">{l.license_id}</span></span>
                    <span className="text-[12px] text-muted">
                      {l.client_id && <>Müşteri: <EntityLink href={`/admin/ops/clients/${l.client_id}`}>{name(data.parties, l.client_id)}</EntityLink> · </>}
                      {l.project_id && <>Proje: <EntityLink href={`/admin/ops/projects/${l.project_id}`}>{name(data.projects, l.project_id)}</EntityLink> · </>}
                      {l.service_id && <>Hizmet: <EntityLink href={`/admin/ops/services/${l.service_id}`}>{name(data.services, l.service_id)}</EntityLink></>}
                      {!l.client_id && !l.project_id && !l.service_id && 'Eşleşme yok'}
                    </span>
                    <span className="text-[12px] text-subtle">
                      {l.last_synced_at
                        ? <>Anlık görüntü ({fmtDateTime(l.last_synced_at)}): {typeof snap.status === 'string' ? (STATUS_LABEL[snap.status as RemoteLicense['status']] ?? snap.status) : '—'}{' · '}{exp ? `bitiş ${fmtDate(exp)} (${dueText(exp, today)})` : 'bitiş yok/süresiz'}</>
                        : 'Henüz anlık görüntü yok.'}
                    </span>
                    {l.sync_error && <span className="text-[12px] text-yellow-200">{l.sync_error}</span>}
                  </div>
                  <span className="flex gap-1.5">
                    <button type="button" className={small} onClick={() => start(l)}>Düzenle</button>
                    <button type="button" className={small} onClick={() => remove(l)}>Kaldır</button>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {editing === 'new' ? form : <button type="button" className="admin-btn justify-self-start" onClick={() => start(null)}>+ Bağlantı ekle</button>}
    </section>
  );
}
