'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { LabeledDate } from '@/components/admin/DateField';
import { CURRENCIES, minorToDb, parseAmount } from '@/lib/ops/money';
import {
  AUTO_RENEW_LABEL,
  KIND_FIELDS,
  KIND_LABEL,
  PARTY_LABEL,
  PAY_STATE_LABEL,
  PERIOD_LABEL,
  PERIODS,
  RENEW_STATE_LABEL,
  SERVICE_KINDS,
  SERVICE_STATUS_LABEL,
  SERVICE_STATUSES,
  type PayState,
  type Period,
  type RenewState,
  type Service,
  type ServiceKind,
  type ServiceStatus,
} from '@/lib/ops/model';
import type { OpsData } from '@/lib/ops/data';
import { Badge, Details, Flash, field, label as labelCls, small, toList } from '@/components/admin/ops/ui';

/**
 * Yoca Operasyon — service create / edit form.
 * Only "Kayıt adı" and "Tür" are required; every other field sits in a
 * collapsible section and can be filled later. Blank amounts stay unknown
 * (null), never 0. No passwords or keys: the panel URL is only a link.
 *
 * Also exports the small status-badge helpers the service and finance
 * pages share (tone per state; text is always shown next to the colour).
 */

/* ── Shared status badges ───────────────────────────────────────── */

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';
export const PAY_TONE: Record<PayState, Tone> = { unknown: 'muted', pending: 'info', partial: 'warn', paid: 'ok', overdue: 'bad', over: 'warn' };
export const RENEW_TONE: Record<RenewState, Tone> = {
  none: 'muted', not_due: 'muted', upcoming: 'info', awaiting_verification: 'warn', overdue: 'bad', verified: 'ok', perpetual: 'ok', unknown_date: 'warn', once: 'muted', cancelled: 'muted',
};
export const STATUS_TONE: Record<ServiceStatus, Tone> = { active: 'ok', pending: 'info', suspended: 'warn', cancelled: 'muted', expired: 'bad', unknown: 'muted' };

export function StatusBadges({ status, collection, provider, renew, compact = false }: { status: ServiceStatus; collection: PayState | null; provider: PayState | null; renew: RenewState; compact?: boolean }) {
  const p = (text: string) => (compact ? '' : `${text}: `);
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone={STATUS_TONE[status]} title="Hizmet durumu">{p('Hizmet')}{SERVICE_STATUS_LABEL[status]}</Badge>
      <Badge tone={collection ? PAY_TONE[collection] : 'muted'} title="Müşteriden tahsilat (açık dönem)">{compact ? 'Tahsilat: ' : p('Tahsilat')}{collection ? PAY_STATE_LABEL[collection] : 'Dönem yok'}</Badge>
      <Badge tone={provider ? PAY_TONE[provider] : 'muted'} title="Sağlayıcıya ödeme (açık dönem)">{compact ? 'Sağlayıcı: ' : p('Sağlayıcı ödemesi')}{provider ? PAY_STATE_LABEL[provider] : 'Dönem yok'}</Badge>
      <Badge tone={RENEW_TONE[renew]} title="Yenileme (sağlayıcıda doğrulama)">{p('Yenileme')}{RENEW_STATE_LABEL[renew]}</Badge>
    </span>
  );
}

/* ── Validation helpers ─────────────────────────────────────────── */

/** Obvious secrets typed into a free-text field ("şifre: …", "api_key=…"). */
const SECRET_RE = /(şifre|sifre|parola|password|passwd|pwd|api[\s_-]?key|secret|token|private[\s_-]?key)\s*[:=]/i;
export const looksSecret = (v: string) => SECRET_RE.test(v) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v);

export function checkPanelUrl(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(s); } catch { return 'Panel adresi geçerli bir bağlantı değil (https://… ile başlamalı).'; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Panel adresi http(s) olmalı.';
  if (u.username || u.password) return 'Panel adresinde kullanıcı adı/şifre olamaz. Yalnızca bağlantıyı girin.';
  if (/[?&](pass(word)?|pwd|token|key|secret)=/i.test(u.search)) return 'Panel adresinde şifre veya anahtar parametresi olamaz.';
  return null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseDays(v: string, labelText: string): { days: number[] | null; error?: string } {
  const parts = v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { days: null };
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 365) return { days: null, error: `${labelText}: “${p}” geçerli bir gün sayısı değil (0–365).` };
    if (!out.includes(n)) out.push(n);
  }
  return { days: out.sort((a, b) => b - a) };
}

/* ── Form state ─────────────────────────────────────────────────── */

type Party = 'yoca' | 'client' | 'other' | 'unknown';
const PARTIES: Party[] = ['unknown', 'yoca', 'client', 'other'];
const RENEWERS = ['unknown', 'yoca', 'client', 'provider_auto', 'other'];

interface FormState {
  name: string;
  kind: ServiceKind | '';
  status: ServiceStatus;
  clientIds: string[];
  projectIds: string[];
  provider_id: string;
  provider_account_id: string;
  panel_url: string;
  start_on: string;
  end_on: string;
  is_perpetual: boolean;
  due_on: string;
  cancel_by: string;
  period: Period | '';
  period_months: string;
  auto_renew: 'on' | 'off' | 'unknown';
  owner_party: string;
  owner_client_id: string;
  payer_party: string;
  payer_client_id: string;
  renewer_party: string;
  team_owner: string;
  cost_amount: string;
  cost_currency: string;
  price_amount: string;
  price_currency: string;
  details: Record<string, string>;
  custom: Array<{ label: string; value: string }>;
  tags: string;
  note: string;
  reminder_days: string;
  cancel_reminder_days: string;
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function detailsToStrings(details: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(details ?? {})) {
    if (Array.isArray(v)) out[k] = v.map(String).join(', ');
    else if (typeof v === 'boolean') out[k] = v ? 'true' : 'false';
    else out[k] = s(v);
  }
  return out;
}

function initialState(initial: Partial<Service> | undefined, links: { clients: string[]; projects: string[] } | undefined): FormState {
  const i = initial ?? {};
  return {
    name: s(i.name),
    kind: (i.kind as ServiceKind) ?? '',
    status: (i.status as ServiceStatus) ?? 'active',
    clientIds: links?.clients ?? [],
    projectIds: links?.projects ?? [],
    provider_id: s(i.provider_id),
    provider_account_id: s(i.provider_account_id),
    panel_url: s(i.panel_url),
    start_on: s(i.start_on),
    end_on: s(i.end_on),
    is_perpetual: Boolean(i.is_perpetual),
    due_on: s(i.due_on),
    cancel_by: s(i.cancel_by),
    period: (i.period as Period) ?? '',
    period_months: s(i.period_months),
    auto_renew: i.auto_renew ?? 'unknown',
    owner_party: i.owner_party ?? 'unknown',
    owner_client_id: s(i.owner_client_id),
    payer_party: i.payer_party ?? 'unknown',
    payer_client_id: s(i.payer_client_id),
    renewer_party: i.renewer_party ?? 'unknown',
    team_owner: s(i.team_owner),
    cost_amount: s(i.cost_amount),
    cost_currency: s(i.cost_currency),
    price_amount: s(i.price_amount),
    price_currency: s(i.price_currency),
    details: detailsToStrings(i.details),
    custom: (i.custom_fields ?? []).map((c) => ({ label: s(c.label), value: s(c.value) })),
    tags: (i.tags ?? []).join(', '),
    note: s(i.note),
    reminder_days: (i.reminder_days ?? []).join(', '),
    cancel_reminder_days: (i.cancel_reminder_days ?? []).join(', '),
  };
}

/* ── Small pieces ───────────────────────────────────────────────── */

interface Option { id: string; label: string }

/** Several values: chips with "×" plus a select to add one more. */
export function MultiPick({ title, options, value, onChange, emptyText, hint }: { title: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; emptyText: string; hint?: ReactNode }) {
  const rest = options.filter((o) => !value.includes(o.id));
  const name = (id: string) => options.find((o) => o.id === id)?.label ?? 'Bilinmeyen kayıt';
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-semibold text-muted">{title}</span>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 border border-line px-2 py-0.5 text-[12px]">
              {name(id)}
              <button type="button" aria-label={`${name(id)} kaldır`} className="px-1 text-subtle hover:text-red-300" onClick={() => onChange(value.filter((x) => x !== id))}>×</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-[12px] text-subtle">{emptyText}</p>}
      {rest.length > 0 && (
        <select className={field} value="" aria-label={`${title} ekle`} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }}>
          <option value="">+ Ekle…</option>
          {rest.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
      {hint && <p className="text-[12px] text-subtle">{hint}</p>}
    </div>
  );
}

function CurrencySelect({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
  return (
    <select className={`${field} !w-28`} value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
      <option value="">Para birimi</option>
      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

/* ── The form ───────────────────────────────────────────────────── */

export interface ServiceFormProps {
  data: OpsData;
  initial?: Partial<Service>;
  initialLinks?: { clients: string[]; projects: string[] };
  mode: 'create' | 'edit';
  /** Returns an error message, or null when saved (the parent navigates / closes). */
  onSubmit: (payload: Partial<Service>, links: Array<{ client_id?: string; project_id?: string }>) => Promise<string | null>;
  onCancel?: () => void;
  submitLabel?: string;
}

export default function ServiceForm({ data, initial, initialLinks, mode, onSubmit, onCancel, submitLabel }: ServiceFormProps) {
  const [f, setF] = useState<FormState>(() => initialState(initial, initialLinks));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const parties = useMemo(() => data.parties.filter((p) => !p.archived_at), [data.parties]);
  const providers = useMemo(() => {
    const list = parties.filter((p) => p.roles.includes('provider'));
    // A provider already chosen on this record stays selectable even without the role.
    if (f.provider_id && !list.some((p) => p.id === f.provider_id)) {
      const cur = data.parties.find((p) => p.id === f.provider_id);
      if (cur) list.push(cur);
    }
    return list;
  }, [parties, data.parties, f.provider_id]);
  const accounts = data.accounts.filter((a) => a.provider_id === f.provider_id && (!a.archived_at || a.id === f.provider_account_id));
  const clientOptions: Option[] = parties.filter((p) => p.roles.includes('customer') || p.roles.includes('partner') || f.clientIds.includes(p.id)).map((p) => ({ id: p.id, label: p.name }));
  const projectOptions: Option[] = data.projects.filter((p) => !p.archived_at || f.projectIds.includes(p.id)).map((p) => {
    const c = data.parties.find((x) => x.id === p.client_id);
    return { id: p.id, label: c ? `${p.name} · ${c.name}` : p.name };
  });
  const owners = useMemo(() => Array.from(new Set(data.services.map((x) => (x.team_owner ?? '').trim()).filter(Boolean))).sort(), [data.services]);
  const kindFields = f.kind ? KIND_FIELDS[f.kind] : [];

  const has = (...keys: Array<keyof FormState>) => keys.some((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length > 0 : typeof v === 'boolean' ? v : Boolean(v && v !== 'unknown');
  });

  function build(): { payload?: Partial<Service>; links?: Array<{ client_id?: string; project_id?: string }>; error?: string } {
    const name = f.name.trim();
    if (!name) return { error: 'Kayıt adı gerekli.' };
    if (!f.kind) return { error: 'Tür seçin.' };
    const money = (amount: string, currency: string, what: string): { amount: string | null; currency: string | null; error?: string } => {
      const minor = parseAmount(amount);
      if (minor === undefined) return { amount: null, currency: null, error: `${what}: “${amount}” geçerli bir tutar değil (örn. 1.250,00).` };
      if (minor !== null && minor < BigInt(0)) return { amount: null, currency: null, error: `${what} negatif olamaz.` };
      if (minor !== null && !currency) return { amount: null, currency: null, error: `${what} için para birimi seçin.` };
      return { amount: minor === null ? null : minorToDb(minor), currency: currency || null };
    };
    const cost = money(f.cost_amount, f.cost_currency, 'Alış bedeli');
    if (cost.error) return { error: cost.error };
    const price = money(f.price_amount, f.price_currency, 'Satış bedeli');
    if (price.error) return { error: price.error };
    const end = f.is_perpetual ? null : f.end_on || null;
    if (f.start_on && end && end < f.start_on) return { error: 'Bitiş tarihi başlangıçtan önce olamaz.' };
    const urlErr = checkPanelUrl(f.panel_url);
    if (urlErr) return { error: urlErr };
    let months: number | null = null;
    if (f.period === 'custom') {
      if (f.period_months.trim()) {
        months = Number(f.period_months);
        if (!Number.isInteger(months) || months < 1 || months > 120) return { error: 'Özel dönem 1–120 ay arasında olmalı.' };
      }
    }
    const rem = parseDays(f.reminder_days, 'Hatırlatma günleri');
    if (rem.error) return { error: rem.error };
    const crem = parseDays(f.cancel_reminder_days, 'İptal hatırlatma günleri');
    if (crem.error) return { error: crem.error };

    const details: Record<string, unknown> = { ...(initial?.details ?? {}) };
    for (const kf of kindFields) {
      const raw = (f.details[kf.key] ?? '').trim();
      if (!raw) { delete details[kf.key]; continue; }
      if (kf.type === 'number') {
        const n = Number(raw.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) return { error: `${kf.label}: sayı girin.` };
        details[kf.key] = n;
      } else if (kf.type === 'list') details[kf.key] = toList(raw);
      else if (kf.type === 'bool') details[kf.key] = raw === 'true';
      else details[kf.key] = raw;
    }
    const custom = f.custom.map((c) => ({ label: c.label.trim(), value: c.value.trim() })).filter((c) => c.label || c.value);
    if (custom.some((c) => !c.label)) return { error: 'Özel alanların her birine bir ad verin.' };

    const texts = [f.note, ...custom.map((c) => `${c.label}: ${c.value}`), ...Object.values(details).map((v) => (typeof v === 'string' ? v : ''))];
    if (texts.some((t) => looksSecret(t))) return { error: 'Şifre veya anahtar gibi görünen bir değer var. Buraya şifre/anahtar yazılmaz; yalnızca nerede saklandığını (örn. “1Password › Hosting”) not edin.' };

    const payload: Partial<Service> = {
      name,
      kind: f.kind,
      status: f.status,
      provider_id: f.provider_id || null,
      provider_account_id: f.provider_id && f.provider_account_id ? f.provider_account_id : null,
      panel_url: f.panel_url.trim() || null,
      start_on: f.start_on || null,
      end_on: end,
      is_perpetual: f.is_perpetual,
      due_on: f.due_on || null,
      cancel_by: f.cancel_by || null,
      period: f.period || null,
      period_months: f.period === 'custom' ? months : null,
      auto_renew: f.auto_renew,
      owner_party: f.owner_party,
      owner_client_id: f.owner_party === 'client' && f.owner_client_id ? f.owner_client_id : null,
      payer_party: f.payer_party,
      payer_client_id: f.payer_party === 'client' && f.payer_client_id ? f.payer_client_id : null,
      renewer_party: f.renewer_party,
      team_owner: f.team_owner.trim() || null,
      cost_amount: cost.amount,
      cost_currency: cost.currency,
      price_amount: price.amount,
      price_currency: price.currency,
      details,
      custom_fields: custom,
      tags: toList(f.tags),
      note: f.note.trim() || null,
      reminder_days: rem.days,
      cancel_reminder_days: crem.days,
    };
    const links = [...f.clientIds.map((id) => ({ client_id: id })), ...f.projectIds.map((id) => ({ project_id: id }))];
    return { payload, links };
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    const r = build();
    if (r.error || !r.payload) { setError(r.error ?? 'Form eksik.'); return; }
    submitting.current = true;
    setBusy(true);
    setError(null);
    const err = await onSubmit(r.payload, r.links ?? []);
    // A created record navigates away: keep the button disabled so a second click can't create a copy.
    if (!err && mode === 'create') return;
    submitting.current = false;
    setBusy(false);
    if (err) setError(err);
  };

  const partySelect = (k: 'owner_party' | 'payer_party', clientKey: 'owner_client_id' | 'payer_client_id', title: string) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className={labelCls}>{title}
        <select className={field} value={f[k]} onChange={(e) => set(k, e.target.value)}>
          {PARTIES.map((p) => <option key={p} value={p}>{PARTY_LABEL[p]}</option>)}
        </select>
      </label>
      {f[k] === 'client' && (
        <label className={labelCls}>Hangi müşteri (isteğe bağlı)
          <select className={field} value={f[clientKey]} onChange={(e) => set(clientKey, e.target.value)}>
            <option value="">Belirtilmedi</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-4" aria-label={mode === 'create' ? 'Yeni hizmet' : 'Hizmeti düzenle'}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className={labelCls}>Kayıt adı <span className="text-[11px] font-normal text-subtle">(zorunlu)</span>
          <input className={field} value={f.name} maxLength={200} autoFocus={mode === 'create'} onChange={(e) => set('name', e.target.value)} placeholder="Örn. ornek.com domain" required />
        </label>
        <label className={labelCls}>Tür <span className="text-[11px] font-normal text-subtle">(zorunlu)</span>
          <select className={field} value={f.kind} onChange={(e) => set('kind', e.target.value as ServiceKind)} required>
            <option value="">Tür seçin…</option>
            {SERVICE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      <p className="text-[12px] text-subtle">Diğer her şey isteğe bağlıdır; bilinmeyen alanları boş bırakın, sonra ekleyebilirsiniz. Boş tutar “Tutar bilinmiyor” olarak görünür (0 değil).</p>

      <Details title="Durum" hint={SERVICE_STATUS_LABEL[f.status]} open={mode === 'edit' && f.status !== 'active'}>
        <label className={labelCls}>Hizmet durumu
          <select className={field} value={f.status} onChange={(e) => set('status', e.target.value as ServiceStatus)}>
            {SERVICE_STATUSES.map((x) => <option key={x} value={x}>{SERVICE_STATUS_LABEL[x]}</option>)}
          </select>
        </label>
        <p className="text-[12px] text-subtle">Hizmet durumu; tahsilat, sağlayıcı ödemesi ve yenileme durumundan ayrıdır.</p>
      </Details>

      {mode === 'create' ? (
        <Details title="Bağlantılar" hint="müşteriler ve projeler" open={f.clientIds.length + f.projectIds.length > 0}>
          <MultiPick title="Müşteriler" options={clientOptions} value={f.clientIds} onChange={(v) => set('clientIds', v)} emptyText="Bağlı müşteri yok." hint="Bir hizmet birden çok müşteriye bağlanabilir." />
          <MultiPick title="Projeler" options={projectOptions} value={f.projectIds} onChange={(v) => set('projectIds', v)} emptyText="Bağlı proje yok." />
        </Details>
      ) : (
        <p className="text-[12px] text-subtle">Müşteri, proje ve ilişkili hizmet bağlantıları detay sayfasındaki “Bağlantılar” bölümünden düzenlenir.</p>
      )}

      <Details title="Sağlayıcı ve hesap" open={has('provider_id', 'panel_url')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>Sağlayıcı
            <select className={field} value={f.provider_id} onChange={(e) => setF((p) => ({ ...p, provider_id: e.target.value, provider_account_id: '' }))}>
              <option value="">Bilinmiyor / yok</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className={labelCls}>Hesap
            <select className={field} value={f.provider_account_id} disabled={!f.provider_id} onChange={(e) => set('provider_account_id', e.target.value)}>
              <option value="">{f.provider_id ? (accounts.length ? 'Belirtilmedi' : 'Bu sağlayıcıda kayıtlı hesap yok') : 'Önce sağlayıcı seçin'}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}{a.account_ref ? ` (${a.account_ref})` : ''}</option>)}
            </select>
          </label>
        </div>
        {providers.length === 0 && <p className="text-[12px] text-subtle">Sağlayıcı listesi boş: firmalar sayfasında bir kaydı “sağlayıcı” rolüyle işaretleyin.</p>}
        <label className={labelCls}>Panel adresi
          <input className={field} type="url" inputMode="url" value={f.panel_url} onChange={(e) => set('panel_url', e.target.value)} placeholder="https://panel.saglayici.com" />
        </label>
        <p className="text-[12px] text-subtle">Yalnızca bağlantı. Şifre, API anahtarı veya giriş bilgisi buraya ya da notlara yazılmaz.</p>
      </Details>

      <Details title="Tarihler" open={has('start_on', 'end_on', 'is_perpetual', 'due_on', 'cancel_by')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledDate label="Başlangıç" value={f.start_on} onChange={(v) => set('start_on', v)} />
          {f.is_perpetual ? (
            <div className={labelCls}>Bitiş (dönem sonu)
              <input className={field} value="Süresiz" disabled aria-label="Bitiş (dönem sonu): süresiz" readOnly />
            </div>
          ) : <LabeledDate label="Bitiş (dönem sonu)" value={f.end_on} onChange={(v) => set('end_on', v)} />}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-soft">
          <input type="checkbox" className="accent-yoca-lime" checked={f.is_perpetual} onChange={(e) => set('is_perpetual', e.target.checked)} />
          Süresiz (bitiş tarihi yok)
        </label>
        <p className="text-[12px] text-subtle">Bitiş boş ve “Süresiz” işaretli değilse “Bitiş tarihi bilinmiyor” görünür.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledDate label="Sağlayıcıya ödeme vadesi" value={f.due_on} onChange={(v) => set('due_on', v)} />
          <LabeledDate label="İptal / bildirim son günü" value={f.cancel_by} onChange={(v) => set('cancel_by', v)} />
        </div>
      </Details>

      <Details title="Yenileme" open={has('period', 'auto_renew')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>Dönem
            <select className={field} value={f.period} onChange={(e) => set('period', e.target.value as Period | '')}>
              <option value="">Bilinmiyor</option>
              {PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
            </select>
          </label>
          {f.period === 'custom' && (
            <label className={labelCls}>Kaç ayda bir
              <input className={field} type="number" min={1} max={120} value={f.period_months} onChange={(e) => set('period_months', e.target.value)} />
            </label>
          )}
          <label className={labelCls}>Otomatik yenileme
            <select className={field} value={f.auto_renew} onChange={(e) => set('auto_renew', e.target.value as FormState['auto_renew'])}>
              {(['unknown', 'on', 'off'] as const).map((a) => <option key={a} value={a}>{AUTO_RENEW_LABEL[a]}</option>)}
            </select>
          </label>
        </div>
        {f.auto_renew === 'on' && <p className="text-[12px] text-subtle">Otomatik yenileme açık olsa da yenileme, sağlayıcıda doğrulanana kadar “doğrulama bekliyor” görünür.</p>}
      </Details>

      <Details title="Taraflar" hint="sahip · ödeyen · yenileyen" open={has('owner_party', 'payer_party', 'renewer_party')}>
        {partySelect('owner_party', 'owner_client_id', 'Hesabın / varlığın sahibi')}
        {partySelect('payer_party', 'payer_client_id', 'Sağlayıcıya kim ödüyor')}
        <label className={labelCls}>Yenilemeyi kim yapıyor
          <select className={field} value={f.renewer_party} onChange={(e) => set('renewer_party', e.target.value)}>
            {RENEWERS.map((p) => <option key={p} value={p}>{PARTY_LABEL[p]}</option>)}
          </select>
        </label>
      </Details>

      <Details title="Ekip sorumlusu" open={has('team_owner')}>
        <label className={labelCls}>Sorumlu (e-posta veya ad)
          <input className={field} list="ops-team-owners" value={f.team_owner} onChange={(e) => set('team_owner', e.target.value)} placeholder="ornek@yoca.net" />
          <datalist id="ops-team-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
        </label>
      </Details>

      <Details title="Tutarlar" hint="boş = bilinmiyor" open={has('cost_amount', 'price_amount')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-muted">Alış bedeli (sağlayıcıya)</span>
            <div className="flex gap-2">
              <input className={field} inputMode="decimal" value={f.cost_amount} onChange={(e) => set('cost_amount', e.target.value)} placeholder="Bilinmiyor" aria-label="Alış bedeli" />
              <CurrencySelect value={f.cost_currency} onChange={(v) => set('cost_currency', v)} ariaLabel="Alış para birimi" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-muted">Satış bedeli (müşteriye)</span>
            <div className="flex gap-2">
              <input className={field} inputMode="decimal" value={f.price_amount} onChange={(e) => set('price_amount', e.target.value)} placeholder="Bilinmiyor" aria-label="Satış bedeli" />
              <CurrencySelect value={f.price_currency} onChange={(v) => set('price_currency', v)} ariaLabel="Satış para birimi" />
            </div>
          </div>
        </div>
        <p className="text-[12px] text-subtle">Örn. 1.250,00 veya 1250.00. Para birimleri dönüştürülmez; toplamlar her para birimi için ayrı gösterilir.</p>
      </Details>

      {f.kind && kindFields.length > 0 && (
        <Details title={`Türe özel alanlar · ${KIND_LABEL[f.kind]}`} open={kindFields.some((k) => (f.details[k.key] ?? '') !== '')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {kindFields.map((kf) => {
              const v = f.details[kf.key] ?? '';
              const setV = (nv: string) => setF((p) => ({ ...p, details: { ...p.details, [kf.key]: nv } }));
              if (kf.type === 'bool') return (
                <label key={kf.key} className={labelCls}>{kf.label}
                  <select className={field} value={v} onChange={(e) => setV(e.target.value)}>
                    <option value="">Bilinmiyor</option><option value="true">Evet</option><option value="false">Hayır</option>
                  </select>
                </label>
              );
              if (kf.type === 'textarea') return (
                <label key={kf.key} className={`${labelCls} sm:col-span-2`}>{kf.label}
                  <textarea className={field} rows={3} value={v} onChange={(e) => setV(e.target.value)} />
                </label>
              );
              return (
                <label key={kf.key} className={labelCls}>{kf.label}{kf.type === 'list' && <span className="text-[11px] font-normal text-subtle">virgülle ayırın</span>}
                  <input className={field} inputMode={kf.type === 'number' ? 'decimal' : undefined} value={v} onChange={(e) => setV(e.target.value)} />
                </label>
              );
            })}
          </div>
        </Details>
      )}

      <Details title="Özel alanlar" hint="ad + değer" open={f.custom.length > 0}>
        {f.custom.map((c, idx) => (
          <div key={idx} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
            <input className={field} aria-label="Alan adı" placeholder="Alan adı" value={c.label} onChange={(e) => set('custom', f.custom.map((x, j) => (j === idx ? { ...x, label: e.target.value } : x)))} />
            <input className={field} aria-label="Değer" placeholder="Değer" value={c.value} onChange={(e) => set('custom', f.custom.map((x, j) => (j === idx ? { ...x, value: e.target.value } : x)))} />
            <button type="button" className={small} onClick={() => set('custom', f.custom.filter((_, j) => j !== idx))}>Kaldır</button>
          </div>
        ))}
        <button type="button" className={`${small} justify-self-start`} onClick={() => set('custom', [...f.custom, { label: '', value: '' }])}>+ Alan ekle</button>
      </Details>

      <Details title="Etiketler ve not" open={has('tags', 'note')}>
        <label className={labelCls}>Etiketler<input className={field} value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="virgülle ayırın" /></label>
        <label className={labelCls}>Not<textarea className={field} rows={3} value={f.note} onChange={(e) => set('note', e.target.value)} /></label>
      </Details>

      <Details title="Hatırlatmalar" hint="ekip için" open={has('reminder_days', 'cancel_reminder_days')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>Bitişten kaç gün önce
            <input className={field} value={f.reminder_days} onChange={(e) => set('reminder_days', e.target.value)} placeholder="Boş = genel ayar (varsayılan 30, 14, 7, 1)" />
          </label>
          <label className={labelCls}>İptal son gününden kaç gün önce
            <input className={field} value={f.cancel_reminder_days} onChange={(e) => set('cancel_reminder_days', e.target.value)} placeholder="örn. 14, 3" />
          </label>
        </div>
        <p className="text-[12px] text-subtle">Gün sayılarını virgülle ayırın. İptal hatırlatması için “İptal / bildirim son günü” tarihi de girilmeli. Müşteriye bildirim ayrıdır ve detay sayfasından açılır (varsayılan kapalı).</p>
      </Details>

      <Flash message={error} tone="bad" onClose={() => setError(null)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="admin-btn-primary" disabled={busy}>{busy ? 'Kaydediliyor…' : submitLabel ?? (mode === 'create' ? 'Hizmeti kaydet' : 'Değişiklikleri kaydet')}</button>
        {onCancel && <button type="button" className="admin-btn" disabled={busy} onClick={onCancel}>Vazgeç</button>}
      </div>
    </form>
  );
}
