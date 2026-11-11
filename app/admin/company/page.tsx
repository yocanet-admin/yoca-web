'use client';

import { useEffect, useState } from 'react';
import { Card, Notice } from '@/components/admin/cockpit/Widgets';
import { adminApi, adminPost } from '@/lib/cockpit/client';
import type { CompanyInfo, KvkkPublish } from '@/lib/companyInfo';

/**
 * Yoca Admin — Şirket bilgileri (KVKK aydınlatma metninin kaynağı).
 * Stored in cockpit_settings "company_info". Unknown official fields stay
 * empty and are shown on the public notice as "tamamlanacak". The notice is a
 * noindex draft with the "TASLAK — hukuki inceleme tamamlanmadı" banner until
 * the owner switches "kvkk_published" ON, which the server allows only when
 * nothing required is missing. Legal basis, retention and cross-border
 * transfer texts are filled only after legal review.
 *
 * Not here on purpose: an explicit-consent (açık rıza) box or a commercial
 * electronic message (ticari ileti) permission. Both are separate decisions
 * for the owner and legal review; the forms only link to this notice.
 */

interface Data {
  ok: boolean;
  error?: string;
  ready?: boolean;
  company?: CompanyInfo;
  missing?: string[];
  kvkk?: KvkkPublish;
}

type TextKey = Exclude<keyof CompanyInfo, 'controllerType' | 'legalReviewDone'>;

const GROUPS: Array<{ title: string; fields: Array<{ key: TextKey; label: string; hint?: string; multiline?: boolean }> }> = [
  {
    title: 'Veri sorumlusu',
    fields: [
      { key: 'controllerName', label: 'Gerçek kişi adı soyadı veya tam ticaret unvanı', hint: '“Yoca” marka adıdır; resmî unvan değilse buraya yazmayın.' },
      { key: 'officialAddress', label: 'Resmî adres (tebligat / KVKK başvuru adresi)', hint: 'Sitede görünen adres otomatik olarak resmî adres sayılmaz.', multiline: true },
      { key: 'siteAddress', label: 'Bülten e-postasında gösterilen adres', hint: 'Bülten e-postalarının altında “unvan · adres” olarak yer alır. Resmî unvan ve resmî adres doldurulduğunda e-postada onlar kullanılır. Sitenin altbilgisindeki adresi değiştirmez.' },
      { key: 'dataRequestChannel', label: 'Kişisel veri başvuru kanalı', hint: 'Ör. başvurunun gönderileceği e-posta, KEP veya posta adresi. Hukuki incelemeyle belirleyin.', multiline: true },
      { key: 'generalEmail', label: 'Genel iletişim e-postası' },
    ],
  },
  {
    title: 'Belgelerde görünen iletişim',
    fields: [
      { key: 'phone', label: 'Telefon', hint: 'Teklif, proforma ve yazıların antet / altlığında görünür. Boş bırakılırsa belgede telefon satırı hiç yer almaz. Belgeler ayrıca yukarıdaki unvan, resmî adres ve e-postayı, aşağıdaki vergi ve MERSİS bilgilerini kullanır; değişiklikler sonraki PDF indirmelerine yansır.' },
    ],
  },
  {
    title: 'Sicil bilgileri (isteğe bağlı)',
    fields: [
      { key: 'kep', label: 'KEP adresi' },
      { key: 'mersis', label: 'MERSİS no' },
      { key: 'tradeRegistry', label: 'Ticaret sicil müdürlüğü ve no' },
      { key: 'taxOffice', label: 'Vergi dairesi' },
      { key: 'taxNumber', label: 'Vergi no / TCKN (yayında gösterilecekse)' },
    ],
  },
  {
    title: 'Metin sürümü',
    fields: [
      { key: 'noticeVersion', label: 'Sürüm (ör. 1.0)' },
      { key: 'noticeUpdatedAt', label: 'Güncelleme tarihi (YYYY-AA-GG)' },
    ],
  },
  {
    title: 'Hukuki inceleme sonrası doldurulacak',
    fields: [
      { key: 'legalBasisContact', label: 'Hukuki sebep — iletişim formu (KVKK m.5)', multiline: true },
      { key: 'legalBasisCheckup', label: 'Hukuki sebep — Check-Up', multiline: true },
      { key: 'retentionContact', label: 'Saklama süresi — iletişim formu', multiline: true },
      { key: 'retentionCheckup', label: 'Saklama süresi — Check-Up', multiline: true },
      { key: 'legalBasisNewsletter', label: 'Hukuki sebep — Insights bülteni (açık rıza / ticari ileti onayı, İYS)', multiline: true },
      { key: 'retentionNewsletter', label: 'Saklama süresi — Insights bülteni (abonelik sürerken ve ayrıldıktan sonra)', multiline: true },
      { key: 'transferAssessment', label: 'Yurt dışına aktarım (KVKK m.9) değerlendirmesi ve dayanılan mekanizma', multiline: true },
      { key: 'legalReviewNote', label: 'İnceleme notu (kim, ne zaman)', multiline: true },
    ],
  },
];

export default function AdminCompany() {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<CompanyInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const r = await adminApi<Data>('/api/admin/site-settings');
    setData(r);
    if (r.ok && r.company) setDraft(r.company);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const r = await adminPost<{ ok: boolean; error?: string }>('/api/admin/site-settings', { key: 'company_info', value: draft });
    setBusy(false);
    setMsg(r.ok ? 'Kaydedildi.' : r.error ?? 'Kaydedilemedi.');
    setTimeout(() => setMsg(null), 4000);
    load();
  };

  const setPublished = async (published: boolean) => {
    if (published && !window.confirm('Aydınlatma Metni “taslak” uyarısı olmadan, arama motorlarına açık ve site altbilgisinden bağlantılı olarak yayınlanacak. Metni bir hukukçu inceledi mi ve bilgiler doğru mu?')) return;
    setBusy(true);
    const r = await adminPost<{ ok: boolean; error?: string }>('/api/admin/site-settings', { key: 'kvkk_published', value: { published } });
    setBusy(false);
    setMsg(r.ok ? (published ? 'Yayınlandı.' : 'Taslağa alındı.') : r.error ?? 'Kaydedilemedi.');
    setTimeout(() => setMsg(null), 6000);
    load();
  };

  return (
    <div className="grid gap-6">
      <header className="admin-head">
        <div className="admin-head-text">
          <p className="admin-kicker">Sistem</p>
          <h1 className="admin-h1">Şirket bilgileri</h1>
          <p className="admin-lede">Aydınlatma Metni bu bilgilerden oluşur. Bilinmeyen resmî alanları boş bırakın; sitede “tamamlanacak” görünür.</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-[13px] font-bold text-yoca-lime">{msg}</span>}
          <a href="/tr/privacy" target="_blank" rel="noopener noreferrer" className="admin-btn">Aydınlatma Metni’ni aç ↗</a>
        </div>
      </header>

      {!data ? (
        <div className="h-40 animate-pulse rounded-md bg-surface" />
      ) : !data.ok || !draft ? (
        <Notice tone="warning">Okunamadı: {data.error ?? 'bilinmeyen hata'}</Notice>
      ) : (
        <>
          {data.kvkk?.published ? (
            <Notice>Aydınlatma Metni yayında (taslak uyarısı yok, altbilgiden bağlantılı). Yayınlayan: {data.kvkk.publishedBy ?? '—'}{data.kvkk.publishedAt ? ` · ${new Date(data.kvkk.publishedAt).toLocaleString('tr-TR')}` : ''}</Notice>
          ) : (
            <Notice tone="warning">
              <b>Aydınlatma Metni TASLAK</b> — sayfada “TASLAK — hukuki inceleme tamamlanmadı” uyarısı var, noindex, site haritasında ve altbilgide yok. Formların altındaki satır yine de bu taslağa bağlanır.
              {data.missing && data.missing.length > 0 ? <> Eksik: {data.missing.join(' · ')}</> : ' Gerekli alanlar dolu; yayın sahibin kararıdır.'}
            </Notice>
          )}
          <Card title="Yayın durumu (kvkk_published)">
            <div className="grid gap-2 text-[13px]">
              <label className="flex items-start gap-2 font-bold text-white">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-yoca-lime" checked={Boolean(data.kvkk?.published)} disabled={busy || (!data.kvkk?.published && (data.missing?.length ?? 0) > 0)} onChange={(e) => setPublished(e.target.checked)} />
                Aydınlatma Metni’ni nihai olarak yayınla (sahip onayı)
              </label>
              <p className="text-[12px] text-subtle">Varsayılan: kapalı. Eksik alan varken açılamaz; zorunlu bir alan sonradan boşaltılırsa metin kendiliğinden taslağa döner. Açık rıza kutusu ve ticari ileti izni bu metinle birleştirilmez — ayrı kararlardır.</p>
            </div>
          </Card>
          {!data.ready && <Notice tone="warning">Ayar tablosu okunamıyor (SUPABASE_SERVICE_ROLE_KEY / v9 SQL). Kaydetme çalışmayabilir.</Notice>}
          <Card title="Bilinen bilgiler">
            <ul className="grid gap-1 text-[13px] text-soft">
              <li>Marka: {draft.brand} · Site: {draft.website}</li>
              <li>Sitede gösterilen adres: {draft.siteAddress} <span className="text-subtle">(resmî adres olarak doğrulanmadı)</span></li>
            </ul>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            {GROUPS.map((g) => (
              <Card key={g.title} title={g.title}>
                <div className="grid gap-3">
                  {g.title === 'Veri sorumlusu' && (
                    <label className="admin-label">Veri sorumlusu türü
                      <select value={draft.controllerType} onChange={(e) => setDraft({ ...draft, controllerType: e.target.value as CompanyInfo['controllerType'] })} className="admin-input text-[13px]">
                        <option value="">— tamamlanacak</option>
                        <option value="person">Gerçek kişi</option>
                        <option value="company">Şirket (tüzel kişi)</option>
                      </select>
                    </label>
                  )}
                  {g.fields.map((f) => (
                    <label key={f.key} className="grid gap-1 text-[12px] font-bold text-subtle">
                      {f.label}
                      {f.multiline ? (
                        <textarea rows={3} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className="admin-input text-[13px] font-medium" placeholder="tamamlanacak" />
                      ) : (
                        <input value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className="admin-input text-[13px] font-medium" placeholder="tamamlanacak" />
                      )}
                      {f.hint && <span className="text-[11px] font-normal text-subtle">{f.hint}</span>}
                    </label>
                  ))}
                  {g.title === 'Hukuki inceleme sonrası doldurulacak' && (
                    <label className="flex items-start gap-2 text-[13px] font-bold text-white">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-yoca-lime" checked={draft.legalReviewDone} onChange={(e) => setDraft({ ...draft, legalReviewDone: e.target.checked })} />
                      Hukuki inceleme tamamlandı (yalnızca bir hukukçu metni incelediyse işaretleyin)
                    </label>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <button type="button" className="admin-btn-primary w-fit" disabled={busy} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </>
      )}
    </div>
  );
}
