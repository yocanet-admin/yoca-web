'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, Notice } from '@/components/admin/cockpit/Widgets';
import { getAdminClient } from '@/lib/adminClient';
import { LEAD_LABEL, fmtDate, timeAgo, type LeadStatus } from '@/lib/cockpit/client';
import { DEAL_LABEL, type DealStage } from '@/lib/cockpit/crm';
import { isPanelRole, ROLE_LABEL } from '@/lib/admin/roles';

/**
 * Yoca Admin — İşlem geçmişi (audit log, upgrade-v9).
 * Every change to leads, CRM, monitored sites, site content and settings:
 * who (admin e-mail / "site" / "sistem"), what, and which fields changed.
 */

interface Entry {
  id: number;
  at: string;
  actor: string | null;
  action: 'insert' | 'update' | 'delete' | string;
  entity: string;
  entity_id: string | null;
  label: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
}

const ENTITY: Record<string, string> = {
  contact_submissions: 'İletişim formu',
  checkup_submissions: 'Check-Up',
  clients: 'Müşteri',
  deals: 'Fırsat',
  activities: 'Aktivite',
  monitored_sites: 'İzlenen site',
  sections: 'Bölüm',
  menus: 'Menü',
  site_content: 'Metin',
  team_members: 'Ekip üyesi',
  case_studies: 'Work projesi',
  insights: 'Yazı',
  insight_categories: 'Kategori',
  cockpit_settings: 'Ayar',
  admin_users: 'Kullanıcı',
};

const AREAS: Record<string, string[]> = {
  Leadler: ['contact_submissions', 'checkup_submissions'],
  CRM: ['clients', 'deals', 'activities'],
  Siteler: ['monitored_sites'],
  'Site içeriği': ['sections', 'menus', 'site_content', 'team_members', 'case_studies', 'insights', 'insight_categories'],
  Ayarlar: ['cockpit_settings'],
  Kullanıcılar: ['admin_users'],
};

const VERB: Record<string, string> = {
  insert: 'eklendi', update: 'güncellendi', delete: 'silindi',
  // Kullanıcılar (v30)
  invite: 'davet edildi', invite_resend: 'için davet yeniden gönderildi', invite_send_failed: 'daveti gönderilemedi',
  invite_revoke: 'daveti iptal edildi', invite_accept: 'daveti kabul etti, hesap açıldı', role_change: 'rolü değiştirildi',
  disable: 'erişimi kapatıldı', enable: 'erişimi yeniden açıldı',
};
const USER_STATUS: Record<string, string> = { active: 'etkin', invited: 'davet bekliyor', disabled: 'erişim kapalı' };

const FIELD: Record<string, string> = {
  status: 'durum',
  note: 'not',
  follow_up_on: 'takip tarihi',
  name: 'ad',
  contact_name: 'yetkili',
  email: 'e-posta',
  phone: 'telefon',
  company: 'şirket',
  website: 'web sitesi',
  title: 'başlık',
  stage: 'aşama',
  value: 'değer',
  currency: 'para birimi',
  expected_close: 'beklenen kapanış',
  done: 'tamamlandı',
  due_on: 'tarih',
  body: 'metin',
  kind: 'tür',
  url: 'adres',
  expects_signature: 'imza beklenir',
  hosting_renews_on: 'hosting yenileme',
  is_active: 'aktif',
  is_visible: 'görünür',
  order_index: 'sıra',
  publish_at: 'yayın zamanı',
  role: 'rol',
  invite_expires_at: 'davet geçerlilik sonu',
  send_error: 'gönderim hatası',
};

const INSIGHT_STATUS: Record<string, string> = { DRAFT: 'Taslak', IN_REVIEW: 'İncelemede', SCHEDULED: 'Zamanlanmış', PUBLISHED: 'Yayında', ARCHIVED: 'Arşivde' };

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'boş';
  if (typeof value === 'boolean') return value ? 'evet' : 'hayır';
  if (field === 'role' && isPanelRole(value)) return ROLE_LABEL[value];
  if (field === 'invite_expires_at' && typeof value === 'string') return fmtDate(value);
  if (field === 'status' && typeof value === 'string' && value in USER_STATUS) return USER_STATUS[value];
  if (field === 'status' && typeof value === 'string' && value in LEAD_LABEL) return LEAD_LABEL[value as LeadStatus];
  if (field === 'status' && typeof value === 'string' && value in INSIGHT_STATUS) return INSIGHT_STATUS[value];
  if (field === 'stage' && typeof value === 'string' && value in DEAL_LABEL) return DEAL_LABEL[value as DealStage];
  if (typeof value === 'string') return value;
  return JSON.stringify(value).slice(0, 120);
}

function href(entry: Entry): string | null {
  if (!entry.entity_id || entry.action === 'delete') return null;
  if (entry.entity === 'contact_submissions' || entry.entity === 'checkup_submissions') return `/admin/submissions?id=${entry.entity_id}&status=all`;
  if (entry.entity === 'clients') return `/admin/clients?id=${entry.entity_id}`;
  if (entry.entity === 'monitored_sites') return '/admin/sites';
  if (entry.entity === 'insights') return `/admin/insights/${entry.entity_id}`;
  if (entry.entity === 'admin_users') return '/admin/users';
  return null;
}

const PAGE = 100;

export default function AdminActivity() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [area, setArea] = useState('all');
  const [actor, setActor] = useState('all');
  const [query, setQuery] = useState('');

  const load = async (offset = 0) => {
    const supabase = getAdminClient();
    if (!supabase) return;
    let request = supabase.from('audit_log').select('*').order('at', { ascending: false }).range(offset, offset + PAGE - 1);
    if (area !== 'all') request = request.in('entity', AREAS[area]);
    const { data, error } = await request;
    setLoading(false);
    if (error) {
      setReady(false);
      return;
    }
    const rows = (data as Entry[]) ?? [];
    setEntries((current) => (offset === 0 ? rows : [...current, ...rows]));
    setMore(rows.length === PAGE);
  };

  useEffect(() => {
    setLoading(true);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  const actors = useMemo(() => Array.from(new Set(entries.map((e) => e.actor ?? 'sistem'))).sort(), [entries]);
  const visible = entries.filter((e) => {
    if (actor !== 'all' && (e.actor ?? 'sistem') !== actor) return false;
    const q = query.trim().toLocaleLowerCase('tr');
    if (q && ![e.label ?? '', ENTITY[e.entity] ?? e.entity, e.actor ?? ''].some((v) => v.toLocaleLowerCase('tr').includes(q))) return false;
    return true;
  });

  return (
    <div className="grid gap-6">
      <header className="admin-head">
        <div className="admin-head-text">
        <p className="admin-kicker">Sistem</p>
        <h1 className="admin-h1">İşlem geçmişi</h1>
          <p className="admin-lede">Kim, neyi, ne zaman değiştirdi: leadler, CRM, siteler, içerik ve ayarlar.</p>
        </div>
      </header>

      {!ready && (
        <Notice tone="warning">
          İşlem geçmişi için Supabase’de <code className="text-yoca-lime">supabase/upgrade-v9-cockpit-phase2.sql</code> dosyasını bir kez çalıştırın. Kayıt, çalıştırıldığı andan itibaren başlar.
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {['all', ...Object.keys(AREAS)].map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={area === key}
            onClick={() => setArea(key)}
            className={`rounded-sm border px-3 py-1.5 text-[12px] font-bold transition-colors ${area === key ? 'border-yoca-lime bg-yoca-lime text-black' : 'border-line text-muted hover:text-white'}`}
          >
            {key === 'all' ? 'Tümü' : key}
          </button>
        ))}
        <select value={actor} onChange={(e) => setActor(e.target.value)} className="admin-input !w-auto !py-1.5 text-[12px]" aria-label="Kişi">
          <option value="all">Herkes</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {a === 'site' ? 'Site (formlar)' : a === 'sistem' ? 'Sistem' : a}
            </option>
          ))}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ara: isim, başlık…" aria-label="İşlem ara" className="admin-input !w-auto min-w-[200px] flex-1 !py-1.5 text-[12px]" />
      </div>

      <Card>
        {loading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : visible.length === 0 ? (
          <p className="text-[14px] text-muted">{ready ? 'Bu filtrede kayıt yok.' : 'Henüz kayıt yok.'}</p>
        ) : (
          <ol className="grid">
            {visible.map((entry) => {
              const link = href(entry);
              const who = entry.actor === 'site' ? 'Site' : entry.actor === 'sistem' || !entry.actor ? 'Sistem' : entry.actor;
              const changes = Object.entries(entry.changes ?? {});
              return (
                <li key={entry.id} className="grid gap-1 border-b border-line py-3 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
                  <span className="text-[12px] tabular-nums text-subtle" title={fmtDate(entry.at)}>
                    {timeAgo(entry.at)}
                    <span className="block">{fmtDate(entry.at)}</span>
                  </span>
                  <div className="min-w-0 text-[13px] leading-relaxed">
                    <p className="text-soft">
                      <span className="font-bold text-white">{who}</span> · {ENTITY[entry.entity] ?? entry.entity}{' '}
                      {link ? (
                        <Link href={link} className="font-bold text-white underline decoration-line underline-offset-2 hover:decoration-yoca-lime">
                          {entry.label || '—'}
                        </Link>
                      ) : (
                        <span className="font-bold text-white">{entry.label || '—'}</span>
                      )}{' '}
                      <span className={entry.action === 'delete' ? 'text-red-300' : ''}>{VERB[entry.action] ?? entry.action}</span>
                    </p>
                    {changes.length > 0 && (
                      <ul className="mt-1 grid gap-0.5 text-[12px] text-subtle">
                        {changes.slice(0, 6).map(([field, change]) => (
                          <li key={field} className="truncate">
                            {FIELD[field] ?? field}: {show(field, change.from)} → <span className="text-soft">{show(field, change.to)}</span>
                          </li>
                        ))}
                        {changes.length > 6 && <li>+{changes.length - 6} alan daha</li>}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {more && !loading && (
          <button type="button" className="admin-btn mt-4" onClick={() => load(entries.length)}>
            Daha eski kayıtlar
          </button>
        )}
      </Card>
    </div>
  );
}
