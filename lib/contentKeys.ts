import type { Dict } from '@/lib/i18n';

/**
 * Yoca — admin-editable content keys (client-safe module).
 * Shared by the server content layer (lib/content.ts) and the admin panel.
 */

/**
 * Keys editable from the admin panel (dot paths into Dict) + Turkish labels.
 * contact.description, checkup.description and checkup.introSub are NOT here:
 * they come from Ayarlar → Yanıt süreleri (lib/responseCopy.ts), so an old
 * override can never re-introduce an unapproved response-time promise.
 */
export const CONTENT_KEYS: Array<{ key: string; label: string; multiline?: boolean }> = [
  { key: 'hero.eyebrow', label: 'Hero — üst etiket' },
  { key: 'hero.title', label: 'Hero — ana başlık', multiline: true },
  { key: 'hero.description', label: 'Hero — açıklama', multiline: true },
  { key: 'hero.primaryCta', label: 'Hero — birincil buton' },
  { key: 'hero.secondaryCta', label: 'Hero — ikincil buton' },
  { key: 'hero.line', label: 'Hero — alt satır' },
  { key: 'services.heading', label: 'Hizmetler — başlık', multiline: true },
  { key: 'services.sub', label: 'Hizmetler — alt metin', multiline: true },
  { key: 'systems.heading', label: 'Sistem kartları — başlık', multiline: true },
  { key: 'systems.sub', label: 'Sistem kartları — alt metin', multiline: true },
  { key: 'clients.heading', label: 'Müşteriler — başlık' },
  { key: 'partners.heading', label: 'Partnerler — başlık', multiline: true },
  { key: 'partners.sub', label: 'Partnerler — alt metin', multiline: true },
  { key: 'team.heading', label: 'Ekip — başlık' },
  { key: 'team.sub', label: 'Ekip — alt metin', multiline: true },
  { key: 'clocks.active', label: 'Saat şeridi — durum metni' },
  { key: 'cta.heading', label: 'CTA — başlık' },
  { key: 'cta.body', label: 'CTA — metin', multiline: true },
  { key: 'cta.button', label: 'CTA — buton' },
  { key: 'footer.message', label: 'Footer — mesaj', multiline: true },
  { key: 'checkup.title', label: 'Check-Up — başlık' },
  { key: 'about.heading', label: 'Hakkımızda — başlık' },
  { key: 'about.sub', label: 'Hakkımızda — alt metin', multiline: true },
  { key: 'about.story1', label: 'Hakkımızda — hikâye 1', multiline: true },
  { key: 'about.story2', label: 'Hakkımızda — hikâye 2', multiline: true },
  { key: 'about.story3', label: 'Hakkımızda — hikâye 3', multiline: true },
  { key: 'contact.heading', label: 'İletişim — başlık' },
  { key: 'contact.calendlyUrl', label: 'İletişim — Calendly linki (https://calendly.com/…)' },
  { key: 'footer.hook', label: 'Footer — kapanış kancası', multiline: true },
  { key: 'footer.hookCta', label: 'Footer — kanca butonu' },
  { key: 'checkup.introTitle', label: 'Check-Up — intro başlık' },
];

export const ALLOWED_CONTENT_KEYS = new Set(CONTENT_KEYS.map((entry) => entry.key));

/** Read a dot-path value from the dictionary (for admin placeholders). */
export function getDictValue(dict: Dict, dotKey: string): string {
  let node: unknown = dict;
  for (const part of dotKey.split('.')) {
    if (typeof node !== 'object' || node === null) return '';
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : '';
}

