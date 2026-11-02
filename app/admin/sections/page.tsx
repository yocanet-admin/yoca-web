'use client';

import { useEffect, useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import type { SectionRow } from '@/types';

/** Yoca Admin — bölüm görünürlüğü (aç/kapat). */

const LABELS: Record<string, string> = {
  hero: 'Hero (giriş)',
  bento: 'Sistem kartları (Brand → Growth → Scale)',
  services: 'Hizmetler ızgarası',
  clients: 'Müşteri logoları şeridi',
  partners: 'Platform yığını (Ölç / Büyüt / İnşa Et)',
  team: 'Ekip vitrini',
  clocks: 'Canlı saatler şeridi',
  checkup_banner: 'Check-Up banner',
  cta: 'Kapanış CTA',
};

export default function AdminSections() {
  const supabase = getAdminClient();
  const [rows, setRows] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('sections').select('*').order('id');
    setRows((data as SectionRow[]) ?? []);
    setLoading(false);
    if (error) setMessage({ tone: 'error', text: `Bölümler okunamadı: ${error.message}` });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (row: SectionRow) => {
    if (!supabase) return;
    setBusyId(row.id);
    const { error } = await supabase
      .from('sections')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);
    if (!error) {
      setRows((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, is_active: !item.is_active } : item)),
      );
      setMessage({ tone: 'ok', text: 'Kaydedildi — site anında güncellendi.' });
      setTimeout(() => setMessage(null), 2500);
    } else {
      setMessage({ tone: 'error', text: `Kaydedilemedi: ${error.message}. Oturumunuz kapanmış olabilir.` });
    }
    setBusyId(null);
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Bölümler</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            Kapatılan bölüm sitede hiç render edilmez; içerik silinmez.
          </p>
        </div>
        {message && (
          <p role="status" className={`text-[13px] font-bold ${message.tone === 'ok' ? 'text-yoca-lime' : 'text-amber-300'}`}>
            {message.text}
          </p>
        )}
      </header>

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : (
        <div className="grid gap-2.5">
          {rows.map((row) => (
            <div key={row.id} className="admin-card flex items-center justify-between gap-4 !p-4">
              <div>
                <p className="text-[15px] font-extrabold">{LABELS[row.key] ?? row.name}</p>
                <p className="mt-0.5 text-[12px] text-subtle">
                  anahtar: <code>{row.key}</code>
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={row.is_active}
                disabled={busyId === row.id}
                onClick={() => toggle(row)}
                className={`relative h-7 w-[52px] flex-none rounded-full border transition-colors ${
                  row.is_active ? 'border-yoca-lime bg-yoca-lime/25' : 'border-line bg-surface'
                }`}
              >
                <span
                  className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-all ${
                    row.is_active ? 'left-[26px] bg-yoca-lime' : 'left-1 bg-subtle'
                  }`}
                />
                <span className="sr-only">{row.is_active ? 'Açık' : 'Kapalı'}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
