/**
 * Yoca Operasyon — manual "E-postayla ilet" (pure parts; unit-tested).
 *
 * A reminder is forwarded to a customer (or any other address) ONLY by an
 * admin, from the dialog, with the recipient typed or explicitly picked, the
 * subject / message / attachments visible and editable, and "Gönder" pressed.
 * Saving a service, confirming a renewal or closing a notice never sends.
 *
 * The record is a row of ops_notifications (no new table):
 *   dedupe_key 'forward:<requestKey>'  one dialog = one key → one e-mail
 *   kind 'customer_reminder', audience 'customer', recipients = To
 *   payload { manual: true, subject, body, cc, attachments, sent_by, outcome, provider_id, delivery … }
 * The team cron never selects these rows.
 */

import type { Service } from '@/lib/ops/model';
import type { Issuer } from '@/lib/documents/model';
import { brandedEmailHtml, brandedEmailText } from '@/lib/documents/mail';

export const FORWARD_PREFIX = 'forward:';
export const forwardKey = (requestKey: string) => `${FORWARD_PREFIX}${requestKey}`;
export const isForward = (dedupeKey: string | null | undefined) => Boolean(dedupeKey && dedupeKey.startsWith(FORWARD_PREFIX));

export interface ForwardPayload {
  manual: true;
  subject: string;
  body: string;
  cc: string[];
  reply_to: string | null;
  attachments: Array<{ id: string; name: string; size: number; sha256: string }>;
  sent_by: string | null;
  /** sending | accepted | failed (refused, nothing sent) | unknown (may or may not have gone) */
  outcome: 'sending' | 'accepted' | 'failed' | 'unknown';
  provider_id?: string | null;
  delivery?: string | null;
  last_event?: string | null;
  status_checked_at?: string | null;
  reminder_id?: string | null;
}

export const FORWARD_OUTCOME_LABEL: Record<string, string> = {
  sending: 'Gönderiliyor', accepted: 'Servis kabul etti (teslim henüz bilinmiyor)', failed: 'Gönderilemedi', unknown: 'Sonuç belirsiz',
  delivered: 'Alıcı sunucusuna teslim edildi', delayed: 'Teslimat gecikiyor', bounced: 'Geri döndü (teslim edilemedi)', complained: 'Alıcı istenmeyen olarak işaretledi',
};

const SECRET_WORDS = /(şifre|parola|password|passwd|api[ _-]?key|token|secret|gizli anahtar|ftp|ssh|cpanel|panel girişi|kullanıcı adı)/i;
const MONEY = /(\d[\d.,]*\s*(₺|tl|try|usd|\$|eur|€|gbp|£))|((₺|\$|€|£)\s*\d)/i;

/**
 * Warnings shown before sending when the message seems to carry internal data.
 * Nothing is removed automatically and nothing blocks sending: the admin sees
 * the warning and decides. The default text never contains these.
 */
export function forwardWarnings(text: string, service: Pick<Service, 'note' | 'cost_amount' | 'price_amount' | 'details'> & { secret_ref?: string | null }): string[] {
  const out: string[] = [];
  const t = text.toLocaleLowerCase('tr-TR');
  const note = (service.note ?? '').trim();
  if (note.length >= 12 && t.includes(note.slice(0, 40).toLocaleLowerCase('tr-TR'))) out.push('Mesajda hizmetin iç notundan metin var.');
  const cost = String(service.cost_amount ?? '').trim();
  if (cost && cost !== '0' && text.includes(cost)) out.push('Mesajda sağlayıcı maliyeti görünen bir tutar var.');
  if (MONEY.test(text)) out.push('Mesajda tutar var; maliyet, kâr veya iç fiyat bilgisi olmadığını kontrol edin.');
  if (SECRET_WORDS.test(text)) out.push('Mesajda erişim bilgisi (şifre, kullanıcı adı, anahtar, panel girişi) olabilecek bir ifade var.');
  if (service.secret_ref && t.includes(String(service.secret_ref).toLocaleLowerCase('tr-TR'))) out.push('Mesajda erişim bilgisinin saklandığı yer (secret_ref) geçiyor.');
  return out;
}

/**
 * The external e-mail. By its signature it can only contain what the admin
 * typed (subject, message), the names of the files they ticked and the public
 * company profile (legal name, address, phone, e-mail, tax facts, website — the
 * same footer as every document e-mail). It takes NO service, period, payment,
 * provider or note data, so cost, profit, internal notes and access details
 * cannot be added by the system.
 */
export function forwardEmail(input: { issuer: Issuer; subject: string; body: string; attachmentNames: string[] }): { html: string; text: string } {
  const mail = { issuer: input.issuer, locale: 'tr' as const, preheader: input.subject, body: input.body, ...(input.attachmentNames.length ? { note: `Ek: ${input.attachmentNames.join(', ')}` } : {}) };
  return { html: brandedEmailHtml(mail), text: brandedEmailText(mail) };
}

/** Starting text of the dialog: service NAME, date and customer name only (nothing else is passed in). */
export function forwardDefaults(input: { serviceName: string; target: string | null; offset: number; clientName: string | null }): { subject: string; text: string } {
  const hello = `Merhaba${input.clientName ? ` ${input.clientName}` : ''},`;
  if (!input.target) return { subject: `${input.serviceName} hakkında`, text: `${hello}\n\n\n\nYoca` };
  const date = new Date(`${input.target}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
  if (input.offset < 0) {
    return { subject: `Hatırlatma: ${input.serviceName} dönemi sona erdi (${date})`, text: `${hello}\n\n${input.serviceName} hizmetinizin dönemi ${date} tarihinde sona erdi. Yenileme ile ilgili bir sorunuz varsa bu e-postaya yanıt verebilirsiniz.\n\nYoca` };
  }
  const when = input.offset === 0 ? 'bugün' : input.offset === 1 ? 'yarın' : `${input.offset} gün sonra`;
  return { subject: `Hatırlatma: ${input.serviceName} ${when} yenilenecek (${date})`, text: `${hello}\n\n${input.serviceName} hizmetinizin dönemi ${date} tarihinde (${when}) sona eriyor. Yenileme ile ilgili bir sorunuz varsa bu e-postaya yanıt verebilirsiniz.\n\nYoca` };
}
