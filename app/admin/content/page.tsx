'use client';

import { useEffect, useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import { CONTENT_KEYS, getDictValue } from '@/lib/contentKeys';
import { getDict } from '@/lib/i18n';
import type { Locale, SiteContentRow } from '@/types';

/**
 * Yoca Admin — site metinleri (4 dil).
 * Boş bırakılan alan koddaki varsayılan metne geri döner.
 */

const LOCALES: Array<{ code: Locale; label: string }> = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'az', label: 'Azərbaycanca' },
  { code: 'ar', label: 'العربية' },
];

export default function AdminContent() {
  const supabase = getAdminClient();
  const [activeLocale, setActiveLocale] = useState<Locale>('tr');
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const storageKey = (key: string, locale: Locale) => `${locale}::${key}`;

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data, error } = await supabase.from('site_content').select('id,key,locale,value');
      if (error) setLoadError(error.message);
      const map: Record<string, string> = {};
      for (const row of (data as SiteContentRow[]) ?? []) {
        map[storageKey(row.key, row.locale)] = row.value;
      }
      setValues(map);
      setLoading(false);
    })();
  }, [supabase]);

  useEffect(() => {
    if (dirty.size === 0) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const dict = getDict(activeLocale);

  const setValue = (key: string, value: string) => {
    const sk = storageKey(key, activeLocale);
    setValues((prev) => ({ ...prev, [sk]: value }));
    setDirty((prev) => new Set(prev).add(sk));
  };

  const save = async () => {
    if (!supabase || dirty.size === 0) return;
    setSaving(true);
    const failed = new Set<string>();
    let lastError = '';
    for (const sk of Array.from(dirty)) {
      const [locale, key] = sk.split('::');
      const value = (values[sk] ?? '').trim();
      try {
        const { error } =
          value.length === 0
            ? await supabase.from('site_content').delete().eq('key', key).eq('locale', locale)
            : await supabase.from('site_content').upsert({ key, locale, value }, { onConflict: 'key,locale' });
        if (error) {
          failed.add(sk);
          lastError = error.message;
        }
      } catch (error) {
        failed.add(sk);
        lastError = (error as Error)?.message ?? '';
      }
    }
    // Only the keys that failed stay marked as unsaved, so a retry sends just those.
    setDirty(failed);
    setSaving(false);
    if (failed.size === 0) {
      setMessage({ tone: 'ok', text: 'Kaydedildi — site anında güncellendi.' });
      setTimeout(() => setMessage(null), 2500);
    } else {
      setMessage({
        tone: 'error',
        text: `${failed.size} metin kaydedilemedi${lastError ? ` (${lastError})` : ''}. Oturumunuzu kontrol edip tekrar Kaydet’e basın.`,
      });
    }
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Metinler</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            Alanı boş bırakırsanız koddaki varsayılan metin kullanılır. Gri metinler mevcut
            varsayılanı gösterir.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <p role="status" className={`text-[13px] font-bold ${message.tone === 'ok' ? 'text-yoca-lime' : 'text-amber-300'}`}>
              {message.text}
            </p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || dirty.size === 0}
            className="admin-btn-primary"
          >
            {saving ? 'Kaydediliyor…' : `Kaydet${dirty.size > 0 ? ` (${dirty.size})` : ''}`}
          </button>
        </div>
      </header>

      <div className="flex gap-1 rounded-sm border border-line p-1 sm:w-fit">
        {LOCALES.map((locale) => (
          <button
            key={locale.code}
            type="button"
            onClick={() => setActiveLocale(locale.code)}
            className={`flex-1 rounded-sm px-4 py-1.5 text-[13px] font-bold transition-colors sm:flex-none ${
              activeLocale === locale.code
                ? 'bg-yoca-lime text-black'
                : 'text-muted hover:text-white'
            }`}
          >
            {locale.label}
          </button>
        ))}
      </div>

      {loadError && (
        <p role="alert" className="rounded-md border border-amber-400/40 px-4 py-3 text-[13px] font-bold text-amber-300">
          Kayıtlı metinler okunamadı ({loadError}). Şu an gördüğünüz alanlar boş olabilir; kaydetmeden önce sayfayı yenileyin.
        </p>
      )}

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : (
        <div className="grid gap-3">
          {CONTENT_KEYS.map((entry) => {
            const sk = storageKey(entry.key, activeLocale);
            const current = values[sk] ?? '';
            const placeholder = getDictValue(dict, entry.key);
            return (
              <div key={entry.key} className="admin-card grid gap-2 !p-4">
                <label
                  htmlFor={`content-${entry.key}`}
                  className="flex flex-wrap items-baseline justify-between gap-2"
                >
                  <span className="text-[13px] font-extrabold">{entry.label}</span>
                  <code className="text-[11px] text-subtle">{entry.key}</code>
                </label>
                {entry.multiline ? (
                  <textarea
                    id={`content-${entry.key}`}
                    rows={3}
                    value={current}
                    placeholder={placeholder}
                    onChange={(event) => setValue(entry.key, event.target.value)}
                    className="admin-input resize-y"
                  />
                ) : (
                  <input
                    id={`content-${entry.key}`}
                    value={current}
                    placeholder={placeholder}
                    onChange={(event) => setValue(entry.key, event.target.value)}
                    className="admin-input"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
