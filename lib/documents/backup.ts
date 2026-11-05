/**
 * Yoca — Teklifler ve Belgeler: browser backup of unsaved editor changes.
 *
 * Stored in localStorage, one entry per (signed-in user, document):
 *   key   "yoca-doc-unsaved:<user id>:<document id>"
 *   value { v: 2, user, doc, base, at, title, clientId, content }
 * An entry is only ever read back for the same user AND the same document
 * (both checked inside the value as well as in the key). All entries are
 * removed when someone signs out, and other users' entries are removed when a
 * user signs in, so a shared browser never offers one person's unsaved text to
 * another. "Sil" in the editor removes the entry; saving removes it too.
 * Nothing here leaves the browser.
 */

import type { DocContent } from '@/lib/documents/model';

export const DOC_BACKUP_PREFIX = 'yoca-doc-unsaved:';

export interface DocBackup {
  v: 2;
  user: string;
  doc: string;
  /** updated_at of the saved document the changes were made on. */
  base: string;
  at: string;
  title: string;
  clientId: string | null;
  content: DocContent;
}

export const docBackupKey = (user: string, doc: string) => `${DOC_BACKUP_PREFIX}${user}:${doc}`;

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function readDocBackup(user: string, doc: string): DocBackup | null {
  const s = storage();
  if (!s || !user || !doc) return null;
  try {
    const raw = s.getItem(docBackupKey(user, doc));
    if (!raw) return null;
    const b = JSON.parse(raw) as DocBackup;
    return b && b.v === 2 && b.user === user && b.doc === doc && b.content ? b : null;
  } catch { return null; }
}

export function writeDocBackup(user: string, doc: string, data: Omit<DocBackup, 'v' | 'user' | 'doc'> | null): void {
  const s = storage();
  if (!s || !user || !doc) return;
  try {
    if (data) s.setItem(docBackupKey(user, doc), JSON.stringify({ v: 2, user, doc, ...data }));
    else s.removeItem(docBackupKey(user, doc));
  } catch { /* storage full or blocked: the beforeunload warning still applies */ }
}

/** Removes document backups: all of them, or all except those of `keepUser`. Returns how many were removed. */
export function clearDocBackups(keepUser?: string): number {
  const s = storage();
  if (!s) return 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k && k.startsWith(DOC_BACKUP_PREFIX) && !(keepUser && k.startsWith(`${DOC_BACKUP_PREFIX}${keepUser}:`))) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
    return keys.length;
  } catch { return 0; }
}
