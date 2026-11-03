'use client';

import { useEffect, useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import { CONTENT_KEYS, getDictValue } from '@/lib/contentKeys';
import { getDict } from '@/lib/i18n';
import type { Locale, SiteContentRow } from '@/types';

/**
 * Yoca Admin — site metinleri (4 dil).
 * Each key shows which text the site uses: the saved override ("Özel metin")
 * or the code default from lib/i18n.ts ("Varsayılan"). The default is always
 * visible under the field; "Varsayılana dön" deletes the override.
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
  // What is stored in site_content right now (= what the site uses), separate from the unsaved field values.
  const [saved, setSaved] = useState<Record<string, string>>({});
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
      setSaved(map);
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
    const stored: Record<string, string | null> = {};
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
        } else {
          stored[sk] = value.length === 0 ? null : value;
        }
      } catch (error) {
        failed.add(sk);
        lastError = (error as Error)?.message ?? '';
      }
    }
    // Only the keys that failed stay marked as unsaved, so a retry sends just those.
    setDirty(failed);
    setSaved((prev) => {
      const next = { ...prev };
      for (const [sk, value] of Object.entries(stored)) {
        if (value === null) delete next[sk];
        else next[sk] = value;
      }
      return next;
    });
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

  /** Drop the override of one key in the active language, so the code default is used again. */
  const resetToDefault = async (key: string, label: string) => {
    const sk = storageKey(key, activeLocale);
    const hasSaved = (saved[sk] ?? '').trim().length > 0;
    const question = hasSaved
      ? `“${label}” için özel metin silinsin ve koddaki varsayılan metin kullanılsın mı? Site anında güncellenir; bu geri alınamaz.`
      : `“${label}” alanındaki kaydedilmemiş metin temizlensin mi?`;
    if (!window.confirm(question)) return;
    if (hasSaved) {
      if (!supabase) return;
      let errorText = '';
      try {
        const { error } = await supabase.from('site_content').delete().eq('key', key).eq('locale', activeLocale);
        if (error) errorText = error.message;
      } catch (error) {
        errorText = (error as Error)?.message || 'bilinmeyen hata';
      }
      if (errorText) {
        setMessage({ tone: 'error', text: `Varsayılana dönülemedi (${errorText}). Oturumunuzu kontrol edip tekrar deneyin.` });
        return;
      }
      setSaved((prev) => {
        const next = { ...prev };
        delete next[sk];
        return next;
      });
      setMessage({ tone: 'ok', text: 'Varsayılan metne dönüldü.' });
      setTimeout(() => setMessage(null), 2500);
    }
    setValues((prev) => {
      const next = { ...prev };
      delete next[sk];
      return next;
    });
    setDirty((prev) => {
      const next = new Set(prev);
      next.delete(sk);
      return next;
    });
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Metinler</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            Her alanda sitede hangi metnin kullanıldığı yazar: “Özel metin” (buradan girilen) veya
            “Varsayılan” (koddaki metin). Varsayılan metin her alanın altında görünür; “Varsayılana dön”
            özel metni siler.
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
            const isOverride = (saved[sk] ?? '').trim().length > 0;
            const isDirty = dirty.has(sk);
            return (
              <div key={entry.key} className="admin-card grid gap-2 !p-4">
                <label
                  htmlFor={`content-${entry.key}`}
                  className="flex flex-wrap items-baseline justify-between gap-2"
                >
                  <span className="flex flex-wrap items-center gap-2 text-[13px] font-extrabold">
                    {entry.label}
                    <span
                      className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        isOverride ? 'border-yoca-lime/50 text-yoca-lime' : 'border-line text-subtle'
                      }`}
                      title="Sitede şu an kullanılan metnin kaynağı"
                    >
                      Sitede: {isOverride ? 'Özel metin' : 'Varsayılan'}
                    </span>
                    {isDirty && <span className="text-[11px] font-bold text-amber-300">kaydedilmemiş değişiklik</span>}
                  </span>
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-[12px]">
                    <p className="font-bold text-subtle">
                      Varsayılan metin (kod){isOverride ? ' — şu an kullanılmıyor' : ' — şu an sitede bu kullanılıyor'}:
                    </p>
                    <p className={`mt-0.5 whitespace-pre-wrap ${isOverride ? 'text-subtle' : 'text-muted'}`}>
                      {placeholder || '(varsayılan metin boş)'}
                    </p>
                  </div>
                  {(isOverride || current.trim().length > 0) && (
                    <button
                      type="button"
                      className="admin-btn flex-none !px-3 !py-1"
                      onClick={() => resetToDefault(entry.key, entry.label)}
                    >
                      Varsayılana dön
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
