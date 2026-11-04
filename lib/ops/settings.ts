/**
 * Yoca Operasyon — settings (cockpit_settings key "ops"); pure sanitizer +
 * defaults (unit-tested). Read/write happens in app/api/admin/ops/settings.
 *
 * Customer notifications are OFF by default and stay off until an admin
 * turns the global switch on here AND on the individual service.
 * License actions are separate permissions per admin e-mail; nobody has them
 * until they are granted here.
 */

export const LICENSE_ACTIONS = ['create', 'extend', 'suspend', 'resume', 'revoke'] as const;
export type LicenseAction = (typeof LICENSE_ACTIONS)[number];
export const LICENSE_ACTION_LABEL: Record<LicenseAction, string> = { create: 'Lisans oluşturma', extend: 'Uzatma', suspend: 'Askıya alma', resume: 'Askıdan çıkarma', revoke: 'İptal (geri alınamaz)' };

export interface OpsSettings {
  reminderDays: number[];
  cancelReminderDays: number[];
  digest: boolean;
  customerNotifications: boolean;
  customerFrom: string | null;
  licensePermissions: Record<LicenseAction, string[]>;
}

export const DEFAULT_OPS: OpsSettings = {
  reminderDays: [30, 14, 7, 1],
  cancelReminderDays: [14, 3],
  digest: true,
  customerNotifications: false,
  customerFrom: null,
  licensePermissions: { create: [], extend: [], suspend: [], resume: [], revoke: [] },
};

const days = (v: unknown, fallback: number[]) => {
  if (!Array.isArray(v)) return fallback;
  const out = Array.from(new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 365))).sort((a, b) => b - a);
  return out.slice(0, 8);
};
const emails = (v: unknown) => (Array.isArray(v) ? Array.from(new Set(v.map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))).slice(0, 50) : []);

export function sanitizeOps(input: unknown): OpsSettings {
  const v = (input && typeof input === 'object' ? input : {}) as Partial<OpsSettings> & Record<string, unknown>;
  const perms = (v.licensePermissions && typeof v.licensePermissions === 'object' ? v.licensePermissions : {}) as Record<string, unknown>;
  return {
    reminderDays: days(v.reminderDays, DEFAULT_OPS.reminderDays),
    cancelReminderDays: days(v.cancelReminderDays, DEFAULT_OPS.cancelReminderDays),
    digest: v.digest === undefined ? DEFAULT_OPS.digest : v.digest === true,
    customerNotifications: v.customerNotifications === true,
    customerFrom: typeof v.customerFrom === 'string' && v.customerFrom.trim() ? v.customerFrom.trim().slice(0, 200) : null,
    licensePermissions: Object.fromEntries(LICENSE_ACTIONS.map((a) => [a, emails(perms[a])])) as Record<LicenseAction, string[]>,
  };
}

export function canLicense(settings: OpsSettings, email: string | null | undefined, action: LicenseAction): boolean {
  return Boolean(email && settings.licensePermissions[action].includes(email.toLowerCase()));
}

/** Messages from a test / preview deployment never reach real people. */
export function realSendAllowed(env: { VERCEL_ENV?: string; NOTIFY_RESEND_ENDPOINT?: string; NOTIFY_TELEGRAM_API?: string }): { email: boolean; telegram: boolean; reason: string } {
  if (env.VERCEL_ENV === 'production') return { email: true, telegram: true, reason: 'production' };
  // Test capture endpoints (not real inboxes) may receive messages outside production.
  return { email: Boolean(env.NOTIFY_RESEND_ENDPOINT), telegram: Boolean(env.NOTIFY_TELEGRAM_API), reason: 'test/önizleme ortamı: gerçek alıcılara gönderim kapalı' };
}
