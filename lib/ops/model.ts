/**
 * Yoca Operasyon — data shapes, labels and the status rules (pure; no I/O;
 * unit-tested in tests/ops.test.ts). Tables: supabase/upgrade-v18-operations.sql.
 *
 * Three things are tracked separately and never complete each other:
 *   1. collection from the customer      (payments direction 'in')
 *   2. payment to the provider           (payments direction 'out')
 *   3. the renewal itself at the provider (period.renewed_at + new end date)
 * Unknown values stay unknown: a missing amount is not 0, a missing end date
 * is not "süresiz" (only is_perpetual = true is).
 */

import { parseAmount, type Minor } from '@/lib/ops/money';

const ZERO = BigInt(0);

export const SERVICE_KINDS = ['domain', 'hosting', 'vps', 'server', 'email', 'ssl', 'saas', 'maintenance', 'other'] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export const KIND_LABEL: Record<ServiceKind, string> = {
  domain: 'Domain', hosting: 'Hosting', vps: 'VPS', server: 'Fiziksel/dedike sunucu', email: 'E-posta hizmeti',
  ssl: 'SSL', saas: 'Yazılım/SaaS aboneliği', maintenance: 'Bakım/destek hizmeti', other: 'Diğer',
};

export const SERVICE_STATUSES = ['active', 'pending', 'suspended', 'cancelled', 'expired', 'unknown'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = { active: 'Aktif', pending: 'Kurulum bekliyor', suspended: 'Askıda', cancelled: 'İptal edildi', expired: 'Süresi doldu', unknown: 'Bilinmiyor' };

export const PERIODS = ['monthly', 'quarterly', 'yearly', 'custom', 'once'] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = { monthly: 'Aylık', quarterly: 'Üç aylık', yearly: 'Yıllık', custom: 'Özel', once: 'Tek seferlik' };

export const PARTY_LABEL: Record<string, string> = { yoca: 'Yoca', client: 'Müşteri', provider_auto: 'Sağlayıcı (otomatik)', other: 'Diğer', unknown: 'Bilinmiyor' };
export const AUTO_RENEW_LABEL: Record<string, string> = { on: 'Açık', off: 'Kapalı', unknown: 'Bilinmiyor' };

/** Type-specific optional fields (stored in ops_services.details). */
export const KIND_FIELDS: Record<ServiceKind, Array<{ key: string; label: string; type?: 'text' | 'number' | 'list' | 'bool' | 'textarea' }>> = {
  domain: [
    { key: 'domain', label: 'Alan adı' }, { key: 'registrar', label: 'Kayıt firması' }, { key: 'registrant', label: 'Kayıtlı sahibi' },
    { key: 'nameservers', label: 'Nameserver’lar', type: 'list' }, { key: 'transfer_lock', label: 'Transfer kilidi', type: 'bool' },
    { key: 'manager', label: 'Hesabı yöneten kişi' }, { key: 'handover', label: 'Sahiplik / devir durumu' },
  ],
  hosting: [
    { key: 'plan', label: 'Paket' }, { key: 'disk', label: 'Disk' }, { key: 'traffic', label: 'Trafik' },
    { key: 'control_panel', label: 'Kontrol paneli' }, { key: 'backup', label: 'Yedekleme bilgisi', type: 'textarea' }, { key: 'handover', label: 'Sahiplik / devir durumu' },
  ],
  vps: [
    { key: 'cpu', label: 'CPU' }, { key: 'ram', label: 'RAM' }, { key: 'disk', label: 'Disk' }, { key: 'os', label: 'İşletim sistemi' },
    { key: 'ip', label: 'IP adresleri', type: 'list' }, { key: 'location', label: 'Lokasyon' },
  ],
  server: [
    { key: 'cpu', label: 'CPU' }, { key: 'ram', label: 'RAM' }, { key: 'disk', label: 'Disk' }, { key: 'os', label: 'İşletim sistemi' },
    { key: 'ip', label: 'IP adresleri', type: 'list' }, { key: 'location', label: 'Lokasyon' },
  ],
  email: [{ key: 'domain', label: 'Bağlı domain' }, { key: 'users', label: 'Kullanıcı sayısı', type: 'number' }, { key: 'storage', label: 'Depolama' }],
  ssl: [{ key: 'domains', label: 'Bağlı domainler', type: 'list' }, { key: 'issuer', label: 'Sağlayıcı / CA' }, { key: 'renew_method', label: 'Yenileme yöntemi' }],
  saas: [{ key: 'plan', label: 'Plan' }, { key: 'seats', label: 'Kullanıcı sayısı', type: 'number' }, { key: 'usage_limit', label: 'Kullanım limiti' }],
  maintenance: [
    { key: 'scope', label: 'Kapsam', type: 'textarea' }, { key: 'included_hours', label: 'Dahil çalışma süresi (saat/dönem)', type: 'number' },
    { key: 'contract', label: 'Sözleşme (no / belge adı)' },
  ],
  other: [],
};

export interface Service {
  id: string;
  name: string;
  kind: ServiceKind;
  status: ServiceStatus;
  provider_id: string | null;
  provider_account_id: string | null;
  panel_url: string | null;
  start_on: string | null;
  end_on: string | null;
  is_perpetual: boolean;
  due_on: string | null;
  cancel_by: string | null;
  period: Period | null;
  period_months: number | null;
  auto_renew: 'on' | 'off' | 'unknown';
  owner_party: string;
  owner_client_id: string | null;
  payer_party: string;
  payer_client_id: string | null;
  renewer_party: string;
  team_owner: string | null;
  cost_amount: string | null;
  cost_currency: string | null;
  price_amount: string | null;
  price_currency: string | null;
  details: Record<string, unknown>;
  custom_fields: Array<{ label: string; value: string }>;
  reminder_days: number[] | null;
  cancel_reminder_days: number[] | null;
  customer_notify: boolean;
  customer_recipients: string[];
  tags: string[];
  note: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeriodRow {
  id: string;
  service_id: string;
  starts_on: string | null;
  ends_on: string | null;
  due_on: string | null;
  customer_due_on: string | null;
  status: 'open' | 'renewed' | 'closed' | 'cancelled';
  expected_cost: string | null;
  actual_cost: string | null;
  cost_currency: string | null;
  expected_price: string | null;
  price_currency: string | null;
  renewed_at: string | null;
  renewed_by: string | null;
  renewal_ref: string | null;
  renewal_note: string | null;
  next_period_id: string | null;
  note: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  period_id: string;
  service_id: string;
  direction: 'in' | 'out';
  kind: 'payment' | 'refund' | 'adjustment';
  amount: string;
  currency: string;
  paid_on: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  client_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
}

/* ── Dates (Istanbul calendar days as YYYY-MM-DD) ───────────────── */

export function istanbulDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

const dayNum = (d: string) => Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000);

/** Whole days from `today` to `date` (both YYYY-MM-DD); negative = past. */
export function daysUntil(date: string, today: string): number {
  return dayNum(date) - dayNum(today);
}

export function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + days));
  return d.toISOString().slice(0, 10);
}

/** Calendar months; the 31st becomes the month's last day (Jan 31 + 1 → Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1, d = Number(date.slice(8, 10));
  const target = new Date(Date.UTC(y, m + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function periodMonths(s: Pick<Service, 'period' | 'period_months'>): number | null {
  switch (s.period) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'yearly': return 12;
    case 'custom': return s.period_months ?? null;
    default: return null;
  }
}

/** Suggested end of the next period after a renewal (the admin confirms/edits it). */
export function suggestNextEnd(currentEnd: string | null, s: Pick<Service, 'period' | 'period_months'>): string | null {
  const months = periodMonths(s);
  if (!currentEnd || !months) return null;
  return addMonths(currentEnd, months);
}

/* ── Status rules ────────────────────────────────────────────────── */

export type PayState = 'unknown' | 'pending' | 'partial' | 'paid' | 'overdue' | 'over';
export const PAY_STATE_LABEL: Record<PayState, string> = {
  unknown: 'Tutar bilinmiyor', pending: 'Bekliyor', partial: 'Kısmen ödendi', paid: 'Ödendi', overdue: 'Gecikti', over: 'Fazla ödendi',
};

export interface PaySummary {
  state: PayState;
  currency: string | null;
  expected: Minor | null;
  paid: Minor;
  remaining: Minor | null;
  /** Payments in another currency than expected: shown separately, never subtracted. */
  otherCurrencies: Record<string, Minor>;
}

/**
 * Collection (in) or provider payment (out) for one period. Refunds reduce,
 * adjustments are signed, voided records are ignored. Without an expected
 * amount the state is "unknown" (even when something was paid) — the
 * remaining balance cannot be known.
 */
export function payState(period: PeriodRow, payments: Payment[], direction: 'in' | 'out', today: string): PaySummary {
  const expectedRaw = direction === 'in' ? period.expected_price : (period.actual_cost ?? period.expected_cost);
  const currency = direction === 'in' ? period.price_currency : period.cost_currency;
  const expected = parseAmount(expectedRaw) ?? null;
  const due = direction === 'in' ? (period.customer_due_on ?? period.due_on) : period.due_on;
  let paid = ZERO;
  const other: Record<string, Minor> = {};
  for (const p of payments) {
    if (p.period_id !== period.id || p.direction !== direction || p.voided_at) continue;
    const amt = parseAmount(p.amount);
    if (amt === null || amt === undefined) continue;
    const signed = p.kind === 'refund' ? -amt : amt;
    if (currency && p.currency !== currency) { other[p.currency] = (other[p.currency] ?? ZERO) + signed; continue; }
    paid += signed;
  }
  if (expected === null || !currency) return { state: 'unknown', currency: currency ?? null, expected: null, paid, remaining: null, otherCurrencies: other };
  const remaining = expected - paid;
  let state: PayState;
  if (remaining < ZERO) state = 'over';
  else if (remaining === ZERO) state = 'paid';
  else if (due && daysUntil(due, today) < 0) state = 'overdue';
  else if (paid > ZERO) state = 'partial';
  else state = 'pending';
  return { state, currency, expected, paid, remaining, otherCurrencies: other };
}

export type RenewState = 'none' | 'not_due' | 'upcoming' | 'awaiting_verification' | 'overdue' | 'verified' | 'perpetual' | 'unknown_date' | 'once' | 'cancelled';
export const RENEW_STATE_LABEL: Record<RenewState, string> = {
  none: 'Dönem yok', not_due: 'Zamanı gelmedi', upcoming: 'Yaklaşıyor', awaiting_verification: 'Yenileme doğrulaması bekliyor',
  overdue: 'Bitiş tarihi geçti', verified: 'Yenilendi (doğrulandı)', perpetual: 'Süresiz', unknown_date: 'Bitiş tarihi bilinmiyor', once: 'Tek seferlik', cancelled: 'İptal / kapatıldı',
};

/**
 * Renewal of the open period. A collection or provider payment does NOT make
 * it "renewed": only period.renewed_at (verified at the provider) does.
 * `awaiting_verification`: money moved (or auto-renew is on) and the end date
 * is near/past, but nobody confirmed the new end date yet.
 */
export function renewState(service: Pick<Service, 'end_on' | 'is_perpetual' | 'period' | 'auto_renew' | 'status'>, open: PeriodRow | null, payments: Payment[], today: string, horizonDays = 30): RenewState {
  if (service.status === 'cancelled') return 'cancelled';
  if (service.is_perpetual) return 'perpetual';
  if (service.period === 'once') return 'once';
  if (open?.renewed_at) return 'verified';
  const end = open?.ends_on ?? service.end_on;
  if (!end) return 'unknown_date';
  const left = daysUntil(end, today);
  const moved = open ? payments.some((p) => p.period_id === open.id && !p.voided_at && p.kind === 'payment') : false;
  if (left < 0) return moved || service.auto_renew === 'on' ? 'awaiting_verification' : 'overdue';
  if (left <= horizonDays) return moved || service.auto_renew === 'on' ? 'awaiting_verification' : 'upcoming';
  return 'not_due';
}

/** What is missing on a service record (for "eksik bilgi" lists). */
export function missingInfo(s: Pick<Service, 'end_on' | 'is_perpetual' | 'period' | 'team_owner' | 'provider_id' | 'kind'>): string[] {
  const out: string[] = [];
  if (!s.end_on && !s.is_perpetual && s.period !== 'once') out.push('Bitiş tarihi');
  if (!s.team_owner) out.push('Ekip sorumlusu');
  if (!s.provider_id && s.kind !== 'maintenance') out.push('Sağlayıcı');
  return out;
}

/**
 * Display text of one missingInfo() item. "Bitiş tarihi" is the service
 * record's own end date (Bitiş — dönem sonu). Lists show the open period's end
 * first, so when the record's date is empty but the open period has one, the
 * text says which date is missing. The rule itself (missingInfo) is unchanged.
 */
export function missingText(item: string, openPeriodEnd: string | null | undefined): string {
  return item === 'Bitiş tarihi' && openPeriodEnd ? 'Hizmet kaydında bitiş tarihi' : item;
}

/** "Kalan 12 gün" / "3 gün geçti" / "Bugün". */
export function dueText(date: string | null, today: string): string {
  if (!date) return 'Tarih bilinmiyor';
  const d = daysUntil(date, today);
  if (d === 0) return 'Bugün';
  return d > 0 ? `${d} gün kaldı` : `${-d} gün geçti`;
}

export const DEFAULT_REMINDER_DAYS = [30, 14, 7, 1];

/** Fields a "Çoğalt" copies: never payments, periods, licenses or documents. */
export const DUPLICATE_FIELDS: Array<keyof Service> = [
  'name', 'kind', 'status', 'provider_id', 'provider_account_id', 'panel_url', 'period', 'period_months', 'auto_renew',
  'owner_party', 'owner_client_id', 'payer_party', 'payer_client_id', 'renewer_party', 'team_owner',
  'cost_amount', 'cost_currency', 'price_amount', 'price_currency', 'details', 'custom_fields', 'reminder_days',
  'cancel_reminder_days', 'tags', 'note',
];

export function duplicateService(s: Service): Partial<Service> {
  const out: Partial<Service> = {};
  for (const k of DUPLICATE_FIELDS) (out as Record<string, unknown>)[k] = s[k];
  out.name = `${s.name} (kopya)`;
  // Dates, customer notification and recipients belong to the original; the copy starts without them.
  out.customer_notify = false;
  out.customer_recipients = [];
  return out;
}
