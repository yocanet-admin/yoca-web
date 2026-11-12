'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { adminApi, adminPost } from '@/lib/cockpit/client';
import { getAdminClient } from '@/lib/adminClient';
import { AdminTable, Badge, Empty, Flash, PageHead, fmtDateTime, field, label } from '@/components/admin/ops/ui';
import { accountState, emailProof, generatePassword, INVITE_TTL_HOURS, PASSWORD_MIN, passwordProblem, ROLE_HINT, ROLE_LABEL, ROLES, type PanelRole, type UserRow } from '@/lib/admin/roles';

/**
 * Yoca Admin — Sistem → Kullanıcılar (admin only; the shell, the API and the
 * database functions all refuse other roles).
 * Invite (name, e-mail, role) → the person sets their own password through a
 * one-time link. Or create directly with a temporary password (no e-mail is
 * sent; the person must change it at first sign-in before anything opens).
 * Pending invites: resend / cancel. Accounts: change role, close / reopen
 * access. Every action is written to İşlem geçmişi.
 */

type Row = UserRow;
type ListBody = { ok: boolean; error?: string; users?: Row[]; inviteReady?: boolean; adminEmailsSet?: boolean };
type ActBody = { ok: boolean; error?: string; warning?: string | null; expiresAt?: string };
type Confirm = { title: string; body: ReactNode; action: string; tone?: 'danger'; run: () => Promise<void> };

const TONE = { good: 'ok', warn: 'warn', bad: 'bad', info: 'info' } as const;

function Dialog({ id, title, children, onClose }: { id: string; title: string; children: ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    return () => opener?.focus?.();
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={id} className="admin-backdrop" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div ref={box} className="admin-dialog max-w-lg">
        <h2 id={id} className="text-lg font-extrabold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function RolePicker({ value, onChange, name }: { value: PanelRole | ''; onChange: (r: PanelRole) => void; name: string }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-[13px] font-semibold text-muted">Rol</legend>
      {ROLES.map((r) => (
        <label key={r} className={`grid cursor-pointer gap-0.5 rounded-[10px] border px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-yoca-lime ${value === r ? 'border-yoca-lime bg-yoca-lime/10' : 'border-[var(--line-2,#343943)] bg-[var(--inset,#0d0f12)]'}`}>
          <span className="flex items-center gap-2 text-[14px] font-bold text-white">
            <input type="radio" name={name} value={r} checked={value === r} onChange={() => onChange(r)} className="accent-yoca-lime" />
            {ROLE_LABEL[r]}
          </span>
          <span className="ps-6 text-[12px] text-subtle">{ROLE_HINT[r]}</span>
        </label>
      ))}
    </fieldset>
  );
}

function InviteDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PanelRole | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Ad girin.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Geçerli bir e-posta adresi girin.');
    if (!role) return setError('Rol seçin.');
    setBusy(true);
    const r = await adminPost<ActBody>('/api/admin/users', { action: 'invite', name: name.trim(), email: email.trim(), role });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Davet gönderilemedi.');
      if (/gönderilemedi/.test(r.error ?? '')) onDone(''); // the row exists now (“Davet gönderilemedi”); refresh the list behind
      return;
    }
    onDone(`${email.trim().toLowerCase()} adresine davet gönderildi. Bağlantı ${INVITE_TTL_HOURS} saat geçerli ve tek kullanımlık.`);
  };
  return (
    <Dialog id="invite-title" title="Kullanıcı davet et" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className={label}>Ad soyad<input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" /></label>
        <label className={label}>E-posta<input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" inputMode="email" /></label>
        <RolePicker value={role} onChange={setRole} name="invite-role" />
        <p className="text-[12px] text-subtle">Kişi e-postadaki tek kullanımlık bağlantıyla kendi şifresini belirler ({INVITE_TTL_HOURS} saat geçerli). Şifreyi siz görmez, paylaşmazsınız.</p>
        {error && <p role="alert" className="admin-notice admin-notice-bad text-[13px]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button type="submit" className="admin-btn-primary" disabled={busy}>{busy ? 'Gönderiliyor…' : 'Daveti gönder'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [role, setRole] = useState<PanelRole | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    const mail = email.trim().toLowerCase();
    if (!name.trim()) return setError('Ad / görünen ad girin.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return setError('Geçerli bir e-posta adresi girin.');
    const rule = passwordProblem(password, mail);
    if (rule) return setError(`Geçici şifre: ${rule}`);
    if (!role) return setError('Rol seçin.');
    setBusy(true);
    const r = await adminPost<ActBody>('/api/admin/users', { action: 'create', name: name.trim(), email: mail, password, role });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'Hesap oluşturulamadı.');
    setPassword('');
    onDone(`${mail} hesabı ${ROLE_LABEL[role]} rolüyle oluşturuldu. E-posta gönderilmedi: geçici şifreyi kişiye güvenli bir kanaldan iletin; ilk girişte değiştirmeden hiçbir ekran açılmaz.`);
  };
  return (
    <Dialog id="create-title" title="Kullanıcı oluştur (geçici şifreyle)" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className={label}>Ad / görünen ad<input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" /></label>
        <label className={label}>E-posta (giriş adı)<input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" inputMode="email" /></label>
        <div className="grid gap-1.5">
          <label className={label} htmlFor="temp-pw">Geçici şifre</label>
          <div className="flex flex-wrap gap-2">
            <input id="temp-pw" className={`${field} min-w-0 flex-1 font-mono`} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={72} aria-describedby="temp-pw-hint" />
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => { setPassword(generatePassword()); setShow(true); }}>Güvenli şifre üret</button>
            <button type="button" className="admin-btn admin-btn-sm" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? 'Gizle' : 'Göster'}</button>
          </div>
          <p id="temp-pw-hint" className="admin-hint">En az {PASSWORD_MIN} karakter. Kaydedildikten sonra bir daha gösterilmez veya okunamaz; şimdi not edin ve kişiye güvenli bir kanaldan iletin.</p>
        </div>
        <RolePicker value={role} onChange={setRole} name="create-role" />
        <p className="admin-notice admin-notice-warn text-[12px]"><span>Bu yolla <b>e-posta gönderilmez</b> ve e-posta sahipliği doğrulanmaz (listede “doğrulanmadı” görünür). Kişi ilk girişte şifresini değiştirmeden panelde hiçbir ekran ve işlem açılmaz.</span></p>
        {error && <p role="alert" className="admin-notice admin-notice-bad text-[13px]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button type="submit" className="admin-btn-primary" disabled={busy}>{busy ? 'Oluşturuluyor…' : 'Hesabı oluştur'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function RoleDialog({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (msg: string) => void }) {
  const [role, setRole] = useState<PanelRole | ''>(row.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!role || role === row.role) return onClose();
    setBusy(true); setError(null);
    const r = await adminPost<ActBody>('/api/admin/users', { action: 'role', email: row.email, role });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'Rol değiştirilemedi.');
    onDone(`${row.email}: rol ${ROLE_LABEL[role]} oldu. Açık oturumu bir sonraki işleminde yeni role göre değerlendirilir.`);
  };
  return (
    <Dialog id="role-title" title={`Rolü değiştir — ${row.name || row.email}`} onClose={onClose}>
      <RolePicker value={role} onChange={setRole} name="change-role" />
      {error && <p role="alert" className="admin-notice admin-notice-bad text-[13px]">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" className="admin-btn-primary" onClick={() => void save()} disabled={busy || role === row.role}>{busy ? 'Kaydediliyor…' : 'Rolü kaydet'}</button>
      </div>
    </Dialog>
  );
}

export default function UsersPage() {
  const [data, setData] = useState<ListBody | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; tone: 'ok' | 'bad' | 'warn' } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [roleRow, setRoleRow] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setData(await adminApi<ListBody>('/api/admin/users'));
  }, []);
  useEffect(() => {
    void load();
    void getAdminClient()?.auth.getSession().then(({ data: s }) => setMe(s.session?.user.email?.toLowerCase() ?? null));
  }, [load]);

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    const r = await adminPost<ActBody>('/api/admin/users', body);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) setFlash({ msg: r.error ?? 'İşlem yapılamadı.', tone: 'bad' });
    else setFlash({ msg: r.warning ? `${okMsg} Uyarı: ${r.warning}` : okMsg, tone: r.warning ? 'warn' : 'ok' });
    await load();
  };

  const users = data?.users ?? [];

  return (
    <div className="grid gap-6">
      <PageHead
        kicker="Sistem"
        title="Kullanıcılar"
        sub="Panel hesapları, rolleri ve davetleri. Değişiklikler İşlem geçmişine yazılır; erişimi kapatmak geçmiş kayıtları silmez."
        actions={
          <>
            <button type="button" className="admin-btn" onClick={() => setCreating(true)} disabled={!data?.ok}>Kullanıcı oluştur</button>
            <button type="button" className="admin-btn-primary" onClick={() => setInviting(true)} disabled={!data?.ok}>+ Kullanıcı davet et</button>
          </>
        }
      />
      <Flash message={flash?.msg ?? null} tone={flash?.tone} onClose={() => setFlash(null)} />
      {data?.ok && data.inviteReady === false && (
        <p role="alert" className="admin-notice admin-notice-bad text-[13px]">Davet e-postası gönderilemez: e-posta servisi (RESEND_API_KEY) tanımlı değil. Davetler “gönderilemedi” olarak kalır.</p>
      )}
      {data?.ok && data.adminEmailsSet && (
        <p className="admin-notice admin-notice-warn text-[13px]"><span>Vercel’de <b>ADMIN_EMAILS</b> değişkeni hâlâ tanımlı. Yetki artık yalnız buradaki etkin hesap ve rol bilgisinden gelir; değişken erişimi etkilemez ve yayın planındaki sırayla kaldırılabilir.</span></p>
      )}
      {!data ? (
        <p className="text-[13px] text-subtle">Yükleniyor…</p>
      ) : !data.ok ? (
        <p role="alert" className="admin-notice admin-notice-bad text-[13px]">{data.error ?? 'Kullanıcılar okunamadı.'}</p>
      ) : users.length === 0 ? (
        <Empty text="Henüz kullanıcı yok." />
      ) : (
        <AdminTable head={['Kişi', 'Rol', 'Hesap / davet', 'İşlemler']} min={760} label="Kullanıcılar">
          {users.map((u) => {
            const st = accountState(u);
            const self = me === u.email;
            return (
              <tr key={u.email}>
                <td data-primary>
                  <div className="grid gap-0.5">
                    <span className="font-bold text-white">{u.name || <span className="text-subtle">Ad girilmemiş</span>} {self && <Badge tone="info">Siz</Badge>}</span>
                    <span className="break-all text-[12px] text-muted">{u.email}</span>
                  </div>
                </td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>
                  <div className="grid gap-1">
                    <span><Badge tone={TONE[st.tone]}>{st.label}</Badge></span>
                    {u.status === 'invited' && st.invite === 'sent' && u.invite_expires_at && <span className="text-[12px] text-subtle">{fmtDateTime(u.invite_expires_at)} tarihine kadar geçerli</span>}
                    {u.status === 'invited' && st.invite === 'failed' && <span className="text-[12px] text-subtle">E-posta ulaşmadı; yeniden gönderin veya iptal edin.</span>}
                    {u.status === 'disabled' && u.disabled_at && <span className="text-[12px] text-subtle">{fmtDateTime(u.disabled_at)} kapatıldı</span>}
                    <span className="text-[12px] text-subtle">{emailProof(u)}</span>
                  </div>
                </td>
                <td data-actions>
                  {self ? (
                    <span className="text-[12px] text-subtle">Kendi hesabınız burada değiştirilmez</span>
                  ) : u.status === 'invited' ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="admin-btn admin-btn-sm" disabled={busy} onClick={() => setConfirm({ title: 'Daveti yeniden gönder', body: <p>{u.email} adresine yeni bir bağlantı gönderilir; önceki bağlantı çalışmaz.</p>, action: 'Yeniden gönder', run: () => act({ action: 'resend', email: u.email }, `${u.email} adresine yeni davet gönderildi.`) })}>Yeniden gönder</button>
                      <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" disabled={busy} onClick={() => setConfirm({ title: 'Daveti iptal et', tone: 'danger', body: <p>{u.email} için bekleyen davet iptal edilir; bağlantı çalışmaz ve e-posta yeniden davet edilebilir.</p>, action: 'Daveti iptal et', run: () => act({ action: 'revoke', email: u.email }, `${u.email} daveti iptal edildi.`) })}>Daveti iptal et</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="admin-btn admin-btn-sm" disabled={busy} onClick={() => setRoleRow(u)}>Rolü değiştir</button>
                      {u.status === 'active' ? (
                        <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" disabled={busy} onClick={() => setConfirm({ title: 'Erişimi kapat', tone: 'danger', body: <p>{u.email} panele giremez; açık oturumu bir sonraki işleminde reddedilir. Hesap ve geçmiş kayıtları silinmez; erişim sonra yeniden açılabilir.</p>, action: 'Erişimi kapat', run: () => act({ action: 'access', email: u.email, enabled: false }, `${u.email} erişimi kapatıldı.`) })}>Erişimi kapat</button>
                      ) : (
                        <button type="button" className="admin-btn admin-btn-sm" disabled={busy} onClick={() => setConfirm({ title: 'Erişimi yeniden aç', body: <p>{u.email} {ROLE_LABEL[u.role]} rolüyle yeniden giriş yapabilir.</p>, action: 'Erişimi aç', run: () => act({ action: 'access', email: u.email, enabled: true }, `${u.email} erişimi yeniden açıldı.`) })}>Erişimi yeniden aç</button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}

      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={(msg) => { setCreating(false); setFlash({ msg, tone: 'ok' }); void load(); }} />}
      {inviting && <InviteDialog onClose={() => setInviting(false)} onDone={(msg) => { if (msg) { setInviting(false); setFlash({ msg, tone: 'ok' }); } void load(); }} />}
      {roleRow && <RoleDialog row={roleRow} onClose={() => setRoleRow(null)} onDone={(msg) => { setRoleRow(null); setFlash({ msg, tone: 'ok' }); void load(); }} />}
      {confirm && (
        <Dialog id="confirm-title" title={confirm.title} onClose={() => setConfirm(null)}>
          <div className="text-[14px] text-muted">{confirm.body}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="admin-btn" onClick={() => setConfirm(null)} disabled={busy}>Vazgeç</button>
            <button type="button" className={confirm.tone === 'danger' ? 'admin-btn admin-btn-danger' : 'admin-btn-primary'} onClick={() => void confirm.run()} disabled={busy}>{busy ? 'İşleniyor…' : confirm.action}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
