'use client';

import { useEffect, useState } from 'react';
import { Card, Notice, StatusBadge } from '@/components/admin/cockpit/Widgets';
import { adminApi, adminPost } from '@/lib/cockpit/client';
import type { AboutIntro } from '@/lib/siteSettings';

/**
 * Yoca Admin — Hakkımızda giriş metni (TASLAK).
 * Not shown on the site until "Onayla ve yayınla" is pressed. Languages
 * without a text are simply not shown. The checklist lists the claims in the
 * CURRENT About copy that need evidence before they stay on the site.
 */

const LOCALES = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'az', label: 'Azərbaycanca' },
  { code: 'ar', label: 'العربية' },
] as const;

const CLAIMS = [
  'Hakkımızda: “Kompakt ve kıdemli tek bir ekip olarak…” — ekip yapısı/kıdem kanıtı gerekir.',
  'Hakkımızda “Nasıl kurulduk”: “Kompakt ekip.”, “Kıdemli düşünce.” — kanıt gerekir.',
  'Ekip bölümü alt metni: “Katmansız çalışan kompakt bir kıdemli ekip…” — kanıt gerekir (ekip kartları doğrulanmadan gizli).',
  'Hakkımızda meta: “bağımsız bir yaratıcı büyüme partneri” — şirket yapısıyla doğrulanmalı.',
  'Hakkımızda meta: “…ve ekibi tanıyın” — doğrulanmış ekip kartı yokken sayfada ekip görünmez; ifade çelişir.',
  'Hakkımızda: “şirket içi bir ekibe daha yakın biçimde — gömülü, şeffaf ve hesap verebilir çalışırız” — çalışma modeliyle tutarlı mı kontrol edin.',
  'Değerler: “İşe araştırma, davranış ve performans verisi yön verir” — her projede geçerli mi kontrol edin.',
  'Araç listesi (GA4, Meta CAPI, Semrush, Hotjar…) — gerçekten kullanılanlarla sınırlı tutun.',
];

export default function AboutDraftCard() {
  const [about, setAbout] = useState<AboutIntro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const r = await adminApi<{ ok: boolean; error?: string; about?: AboutIntro }>('/api/admin/site-settings');
    if (r.ok && r.about) setAbout(r.about);
    else setError(r.error ?? 'Okunamadı.');
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (status: 'draft' | 'approved') => {
    if (!about) return;
    if (status === 'approved' && !window.confirm('Metin Hakkımızda sayfasında yayınlanacak. İçindeki her ifadenin doğru olduğunu onaylıyor musunuz?')) return;
    setBusy(true);
    const r = await adminPost<{ ok: boolean; error?: string }>('/api/admin/site-settings', { key: 'about_intro', value: { ...about, status } });
    setBusy(false);
    setMsg(r.ok ? (status === 'approved' ? 'Yayında.' : 'Taslak kaydedildi (sitede görünmez).') : r.error ?? 'Kaydedilemedi.');
    setTimeout(() => setMsg(null), 4000);
    load();
  };

  return (
    <Card title="Hakkımızda — giriş metni (taslak)" action={msg ? <span className="text-[12px] font-bold text-yoca-lime">{msg}</span> : about ? <StatusBadge kind={about.status === 'approved' ? 'good' : 'neutral'}>{about.status === 'approved' ? 'Yayında' : 'Taslak — sitede yok'}</StatusBadge> : undefined}>
      {error ? <Notice tone="warning">{error}</Notice> : !about ? <div className="h-24 animate-pulse rounded-md bg-surface" /> : (
        <div className="grid gap-3 text-[13px]">
          {LOCALES.map((l) => (
            <label key={l.code} className="grid gap-1 text-[12px] font-bold text-subtle">{l.label}
              <textarea dir={l.code === 'ar' ? 'rtl' : 'ltr'} rows={3} value={about.text[l.code] ?? ''} onChange={(e) => setAbout({ ...about, text: { ...about.text, [l.code]: e.target.value } })} className="admin-input text-[13px] font-medium" placeholder={l.code === 'tr' ? '' : 'Boşsa bu dilde gösterilmez'} />
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-btn" disabled={busy} onClick={() => save('draft')}>Taslak olarak kaydet</button>
            <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => save('approved')}>Onayla ve yayınla</button>
          </div>
          <details>
            <summary className="cursor-pointer text-[12px] font-bold text-white">Mevcut Hakkımızda metninde kanıt isteyen ifadeler</summary>
            <ul className="mt-2 list-disc ps-5 text-[12px] text-muted">{CLAIMS.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="mt-2 text-[11px] text-subtle">Yeni taslak ekip büyüklüğü, deneyim yılı veya “kıdemli ekip” iddiası içermez.</p>
          </details>
        </div>
      )}
    </Card>
  );
}
