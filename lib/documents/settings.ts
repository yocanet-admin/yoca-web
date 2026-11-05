/**
 * Yoca — Teklifler ve Belgeler: document settings (pure, client-safe).
 *
 * Stored in cockpit_settings key "documents" (admin-only RLS). Company facts
 * (legal name, official address, tax office/number, MERSİS …) are NOT copied
 * here: they are read from the existing "company_info" setting (Şirket
 * bilgileri) so there is one source. This setting only holds what documents
 * need on top: phone line, bank accounts, defaults and the signatory.
 * Nothing is pre-filled with guessed facts.
 */

import type { CompanyInfo } from '@/lib/companyInfo';
import type { DocCurrency, DocLocale, Issuer } from '@/lib/documents/model';
import { DOC_CURRENCIES } from '@/lib/documents/model';

export interface BankAccount {
  id: string;
  label: string;
  bank: string;
  holder: string;
  iban: string;
  currency: string;
  swift: string;
  branch: string;
}

export interface DocSettings {
  phone: string;
  defaultCurrency: DocCurrency;
  defaultLocale: DocLocale;
  validityDays: number;
  /** Default VAT/KDV for new lines — chosen by the admin; documents can change it per line. */
  defaultTaxRate: string;
  signatoryName: string;
  signatoryTitle: string;
  bankAccounts: BankAccount[];
  /** Printed under the proforma title (fixed wording is added by the template too). */
  proformaNote: string;
}

export const DEFAULT_DOC_SETTINGS: DocSettings = {
  phone: '',
  defaultCurrency: 'TRY',
  defaultLocale: 'tr',
  validityDays: 30,
  defaultTaxRate: '20',
  signatoryName: '',
  signatoryTitle: '',
  bankAccounts: [],
  proformaNote: '',
};

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/** ISO 13616 checksum (mod 97). Pure. */
export function ibanValid(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith('TR') && iban.length !== 26) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of code) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

export function formatIban(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim();
}

export function sanitizeDocSettings(input: unknown): DocSettings {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const accounts = Array.isArray(v.bankAccounts) ? v.bankAccounts.slice(0, 8) : [];
  const days = Number(v.validityDays);
  return {
    phone: s(v.phone, 60),
    defaultCurrency: (DOC_CURRENCIES as readonly string[]).includes(v.defaultCurrency as string) ? (v.defaultCurrency as DocCurrency) : 'TRY',
    defaultLocale: v.defaultLocale === 'en' ? 'en' : 'tr',
    validityDays: Number.isInteger(days) && days >= 1 && days <= 365 ? days : 30,
    defaultTaxRate: /^\d{1,2}([.,]\d{1,2})?$|^100$/.test(s(v.defaultTaxRate, 6)) ? s(v.defaultTaxRate, 6) : '20',
    signatoryName: s(v.signatoryName, 120),
    signatoryTitle: s(v.signatoryTitle, 120),
    proformaNote: s(v.proformaNote, 600),
    bankAccounts: accounts
      .map((raw) => {
        const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const idv = typeof a.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(a.id) ? a.id : `bank${Math.random().toString(36).slice(2, 8)}`;
        return { id: idv, label: s(a.label, 80), bank: s(a.bank, 120), holder: s(a.holder, 200), iban: normalizeIban(s(a.iban, 50)), currency: (DOC_CURRENCIES as readonly string[]).includes(a.currency as string) ? (a.currency as string) : '', swift: s(a.swift, 20).toUpperCase(), branch: s(a.branch, 120) };
      })
      .filter((a) => a.bank || a.iban || a.holder),
  };
}

/** Problems that make the settings unsavable (an IBAN that fails its checksum is never printed). */
export function docSettingsProblems(v: DocSettings): string[] {
  const out: string[] = [];
  v.bankAccounts.forEach((a, i) => {
    const name = a.label || a.bank || `${i + 1}. hesap`;
    if (!a.iban) out.push(`${name}: IBAN boş.`);
    else if (!ibanValid(a.iban)) out.push(`${name}: IBAN geçersiz (kontrol hanesi tutmuyor).`);
    if (!a.holder) out.push(`${name}: hesap sahibi boş.`);
    if (!a.bank) out.push(`${name}: banka adı boş.`);
  });
  return out;
}

/** Issuer block from the existing company settings + document settings. Empty facts stay empty. */
export function issuerFrom(company: CompanyInfo, docs: DocSettings): Issuer {
  return {
    brand: company.brand || 'Yoca',
    legalName: company.controllerName,
    address: company.officialAddress,
    taxOffice: company.taxOffice,
    taxNumber: company.taxNumber,
    mersis: company.mersis,
    tradeRegistry: company.tradeRegistry,
    email: company.generalEmail,
    phone: docs.phone,
    website: company.website,
    kep: company.kep,
  };
}
