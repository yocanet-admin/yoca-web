/**
 * Yoca — possible existing clients for a new client or a lead (pure, unit-tested).
 *
 * CRM and Operasyon share one clients table, but a similar name is NOT proof
 * that two entries are the same client. These helpers only produce
 * CANDIDATES with the reason they were suggested; the admin decides (link to
 * one of them, or create a new client). Nothing is linked or merged here.
 * When the e-mail and the firm name point at different records, the
 * candidate carries a conflict note and must never be linked automatically.
 */

export interface PartyLike {
  id: string;
  name: string;
  brand_name?: string | null;
  legal_name?: string | null;
  email?: string | null;
  roles?: string[] | null;
  archived_at?: string | null;
}

export interface ContactLike {
  client_id: string;
  email?: string | null;
}

export interface Candidate<T extends PartyLike = PartyLike> {
  client: T;
  /** Why it is suggested (shown to the admin). */
  reasons: string[];
  /** Set when e-mail and firm information disagree — never link without a look. */
  conflict: string | null;
  emailMatch: boolean;
  nameMatch: boolean;
}

const FOLD: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u', ə: 'e' };
const LEGAL = new Set(['as', 'a s', 'ltd', 'sti', 'limited', 'sirketi', 'inc', 'llc', 'gmbh', 'co', 'company', 'san', 'tic', 've', 'and', 'the', 'mmc', 'llp', 'plc', 'bv', 'sa', 'srl']);

/** Lower-case, Turkish/Azerbaijani letters folded, punctuation and legal suffixes removed. */
export function normName(value: string | null | undefined): string {
  const s = String(value ?? '')
    .toLocaleLowerCase('tr')
    .replace(/[ışğüöçâîûə]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/a\.\s?ş\.?|a\.s\./g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return s.split(' ').filter((t) => t && !LEGAL.has(t)).join(' ');
}

const tokens = (s: string) => s.split(' ').filter((t) => t.length >= 3);

/** Similar enough to suggest (not to merge): same, one contains the other, or most words shared. */
export function nameSimilar(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 4 && (` ${long} `).includes(` ${short} `)) return true;
  const ta = new Set(tokens(na)), tb = new Set(tokens(nb));
  if (!ta.size || !tb.size) return false;
  const shared = Array.from(ta).filter((t) => tb.has(t)).length;
  return shared / Math.min(ta.size, tb.size) >= 0.6 && shared / Math.max(ta.size, tb.size) >= 0.5;
}

const sameEmail = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase() && a.includes('@'));
const namesOf = (c: PartyLike) => [c.name, c.brand_name, c.legal_name].filter((x): x is string => Boolean(x && x.trim()));

/**
 * Candidates for { name (person or firm), company (firm, optional), email }.
 * Archived records are left out. Sorted: e-mail + name, e-mail, name.
 */
export function clientCandidates<T extends PartyLike>(input: { name?: string | null; company?: string | null; email?: string | null }, clients: T[], contacts: ContactLike[] = []): Candidate<T>[] {
  const firm = (input.company ?? '').trim();
  const person = (input.name ?? '').trim();
  const email = (input.email ?? '').trim();
  const active = clients.filter((c) => !c.archived_at);
  const out: Candidate<T>[] = [];
  for (const c of active) {
    const reasons: string[] = [];
    const ownEmail = sameEmail(c.email, email);
    const contactEmail = !ownEmail && contacts.some((k) => k.client_id === c.id && sameEmail(k.email, email));
    if (ownEmail) reasons.push('aynı e-posta');
    if (contactEmail) reasons.push('e-posta bu kaydın bir kişisinde');
    const firmMatch = Boolean(firm) && namesOf(c).some((n) => nameSimilar(n, firm));
    const personMatch = !firmMatch && Boolean(person) && namesOf(c).some((n) => nameSimilar(n, person));
    if (firmMatch) reasons.push('benzer firma adı');
    if (personMatch) reasons.push('benzer ad');
    if (!reasons.length) continue;
    out.push({ client: c, reasons, conflict: null, emailMatch: ownEmail || contactEmail, nameMatch: firmMatch || personMatch });
  }
  // E-mail and firm information pointing at different records → conflict on both sides.
  const byEmail = out.filter((x) => x.emailMatch);
  const byFirm = out.filter((x) => firm && x.nameMatch && !x.emailMatch);
  for (const x of byEmail) {
    if (firm && !namesOf(x.client).some((n) => nameSimilar(n, firm))) {
      x.conflict = byFirm.length
        ? `E-posta bu kayıtta, ama firma adı (“${firm}”) başka bir kayda benziyor: ${byFirm.map((y) => y.client.name).join(', ')}.`
        : `E-posta bu kayıtta, ama başvurudaki firma adı (“${firm}”) bu kayıtla uyuşmuyor.`;
    }
  }
  if (byEmail.length) for (const y of byFirm) y.conflict = `Firma adı benziyor, ama başvurunun e-postası başka bir kayda ait: ${byEmail.map((x) => x.client.name).join(', ')}.`;
  const rank = (x: Candidate<T>) => (x.emailMatch && x.nameMatch ? 0 : x.emailMatch ? 1 : 2) + (x.conflict ? 0.5 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || a.client.name.localeCompare(b.client.name, 'tr')).slice(0, 8);
}
