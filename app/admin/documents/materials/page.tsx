'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Flash, PageHead, field, label, small } from '@/components/admin/ops/ui';
import { adminApi } from '@/lib/cockpit/client';
import { aiAction, copyRich, fetchPdf, newKey, saveBlob } from '@/lib/documents/client';
import { brandedEmailHtml, brandedEmailText, htmlFile, safeLink, signatureHtml, signatureText } from '@/lib/documents/mail';
import type { Issuer } from '@/lib/documents/model';

/**
 * Yoca — Teklifler ve Belgeler → Kurumsal materyaller.
 * Boş antet, kartvizit, e-posta imzası and the project update e-mail, all in
 * the same corporate set as the documents. They use no document number and
 * no finalization, store nothing, and send nothing. Company facts come from
 * the company profile (Şirket bilgileri) and people from the team records;
 * a change there shows up in every new output. Personal phone / e-mail are
 * not part of the team records: they start from the company profile and can
 * be edited here (not stored).
 */

type Team = { id: number; name: string; role: string; is_active: boolean };
type Client = { id: string; name: string; legal_name: string | null; brand_name: string | null; contact_name: string; email: string; archived_at: string | null };
type Project = { id: string; client_id: string | null; name: string; status: string; archived_at: string | null };
type Data = { ok: boolean; error?: string; issuer: Issuer; companyRevision: number; team: Team[]; clients: Client[]; projects: Project[] };
type Suggestion = { title: string; salutation: string; body: string; closing: string; missing: string[]; warnings: string[] };

const TABS = [
  { id: 'antet', label: 'Boş antet' },
  { id: 'kartvizit', label: 'Kartvizit' },
  { id: 'imza', label: 'E-posta imzası' },
  { id: 'eposta', label: 'Proje bilgilendirme e-postası' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function Preview({ html, title, height = 420 }: { html: string; title: string; height?: number }) {
  return <iframe title={title} srcDoc={html} sandbox="" className="w-full border border-line bg-white" style={{ height }} />;
}

export default function MaterialsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('antet');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<{ for: string; url: string } | null>(null);
  // shared person fields (kartvizit + imza)
  const [member, setMember] = useState('');
  const [person, setPerson] = useState({ name: '', title: '', phone: '', email: '', website: '' });
  const [bleed, setBleed] = useState(3);
  const [locale, setLocale] = useState<'tr' | 'en'>('tr');
  // project e-mail
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [mail, setMail] = useState({ subject: '', headline: '', greeting: 'Merhaba,', body: '', linkUrl: '', linkLabel: '' });
  const [facts, setFacts] = useState('');
  const [sug, setSug] = useState<Suggestion | null>(null);

  useEffect(() => {
    void adminApi<Data>('/api/admin/documents/materials').then((d) => {
      setData(d);
      if (d.ok) setPerson((p) => ({ ...p, phone: d.issuer.phone ?? '', email: d.issuer.email ?? '', website: d.issuer.website ?? '' }));
    });
  }, []);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl.url); }, [pdfUrl]);

  const issuer = data?.ok ? data.issuer : null;
  const gaps = useMemo(() => (issuer ? [
    !issuer.legalName?.trim() ? 'resmî unvan' : '', !issuer.address?.trim() ? 'adres' : '', !issuer.phone?.trim() ? 'telefon' : '', !issuer.email?.trim() ? 'e-posta' : '',
  ].filter(Boolean) : []), [issuer]);

  if (!data) return <p className="text-[13px] text-subtle">Yükleniyor…</p>;
  if (!data.ok || !issuer) return <Flash tone="bad" message={data.error ?? 'Bilgiler okunamadı.'} />;

  const pickMember = (id: string) => {
    setMember(id);
    const m = data.team.find((x) => String(x.id) === id);
    if (m) setPerson((p) => ({ ...p, name: m.name, title: m.role }));
  };
  const pdf = async (what: 'antet' | 'kartvizit', download: boolean) => {
    if (what === 'kartvizit' && !person.name.trim()) return setFlash({ tone: 'warn', text: 'Kartvizit için ad soyad yazın veya ekip üyesi seçin.' });
    setBusy(`${what}-${download ? 'dl' : 'pv'}`);
    const r = await fetchPdf('/api/admin/documents/materials', what === 'antet' ? { kind: 'letterhead', locale } : { kind: 'card', ...person, bleedMm: bleed });
    setBusy(null);
    if ('error' in r) return setFlash({ tone: 'bad', text: r.error });
    if (download) saveBlob(r.blob, what === 'antet' ? 'yoca-antetli-kagit.pdf' : `yoca-kartvizit.pdf`);
    else setPdfUrl({ for: what, url: URL.createObjectURL(r.blob) });
  };

  // Preview loads the logo from this site (the copied / downloaded HTML uses the https://yoca.net address).
  const previewLogo = typeof window !== 'undefined' ? `${window.location.origin}/brand/email/yoca-logo-light.png` : undefined;
  const sigInput = { ...person, legalName: issuer.legalName ?? '' };
  const sig = signatureHtml(sigInput);
  const sigPreview = signatureHtml({ ...sigInput, logoUrl: previewLogo });
  const clientProjects = data.projects.filter((p) => !p.archived_at && (!clientId || p.client_id === clientId));
  const emailInput = { issuer, locale, preheader: mail.subject || mail.headline, headline: mail.headline, greeting: mail.greeting, body: mail.body, cta: mail.linkUrl ? { label: mail.linkLabel || (locale === 'tr' ? 'Bağlantıyı aç' : 'Open link'), href: mail.linkUrl } : null };
  const emailHtml = brandedEmailHtml(emailInput);
  const emailPreview = brandedEmailHtml({ ...emailInput, logoUrl: previewLogo });
  const linkBad = mail.linkUrl.trim() !== '' && !safeLink(mail.linkUrl);
  const copied = (ok: boolean) => setFlash(ok ? { tone: 'ok', text: 'Biçimlendirilmiş hâliyle panoya kopyalandı.' } : { tone: 'bad', text: 'Kopyalanamadı (tarayıcı izin vermedi). “HTML indir” ile dosyayı alabilirsiniz.' });

  const aiEmail = async () => {
    setBusy('ai'); setSug(null);
    const cl = data.clients.find((c) => c.id === clientId);
    const pr = data.projects.find((p) => p.id === projectId);
    const r = await aiAction<{ suggestion: Suggestion }>({ mode: 'letter', format: 'email', kind: 'letter', locale, subject: mail.subject, facts, recipient: cl ? (cl.legal_name || cl.brand_name || cl.name) : '', projectName: pr?.name ?? '', requestKey: newKey() });
    setBusy(null);
    if (!r.ok || !r.suggestion) return setFlash({ tone: 'bad', text: r.error ?? 'Öneri alınamadı. Metniniz değişmedi; elle yazabilirsiniz.' });
    setSug(r.suggestion);
  };
  const applySug = (what: 'subject' | 'greeting' | 'body' | 'all') => {
    if (!sug) return;
    setMail((m) => ({
      ...m,
      ...(what === 'subject' || what === 'all' ? { subject: sug.title || m.subject } : {}),
      ...(what === 'greeting' || what === 'all' ? { greeting: sug.salutation || m.greeting } : {}),
      ...(what === 'body' || what === 'all' ? { body: [sug.body, sug.closing].filter(Boolean).join('\n\n') || m.body } : {}),
    }));
    setFlash({ tone: 'ok', text: 'Öneri uygulandı. [EKSİK: …] yazan yerleri siz tamamlayın.' });
  };

  return (
    <div className="grid gap-5">
      <PageHead
        title="Kurumsal materyaller"
        sub="Boş antet, kartvizit, e-posta imzası ve proje bilgilendirme e-postası. Belge numarası kullanmaz, kesinleştirme yoktur, hiçbir şey kaydedilmez veya gönderilmez. Şirket bilgileri “Şirket bilgileri”nden, kişiler ekip kayıtlarından gelir."
        actions={<Link href="/admin/documents" className="admin-btn">← Teklifler ve Belgeler</Link>}
      />
      <nav aria-label="Materyaller" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => <button key={t.id} type="button" aria-pressed={tab === t.id} className={`${small} ${tab === t.id ? '!border-yoca-lime !text-white' : ''}`} onClick={() => { setTab(t.id); setPdfUrl(null); }}>{t.label}</button>)}
      </nav>
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}
      {gaps.length > 0 && <p className="text-[12px] text-yellow-200">Şirket profilinde boş: {gaps.join(', ')}. Boş bilgiler basılmaz. <Link href="/admin/company" className="underline">Şirket bilgileri</Link> · profil r{data.companyRevision}</p>}

      {tab === 'antet' && (
        <section className="admin-card grid gap-3 p-4">
          <h2 className="text-[15px] font-extrabold">Boş antet (A4)</h2>
          <p className="text-[12px] text-subtle">Orijinal logo, marka motifi ve altbilgide güncel şirket bilgileri. Belge numarası tüketmez, kayıt oluşturmaz. İçerikli antetli yazı için “Yeni belge → Antetli yazı / Bilgilendirme”.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className={label}>Dil<select className={field} value={locale} onChange={(e) => setLocale(e.target.value === 'en' ? 'en' : 'tr')}><option value="tr">Türkçe</option><option value="en">English</option></select></label>
            <button type="button" className="admin-btn" disabled={!!busy} onClick={() => void pdf('antet', false)}>{busy === 'antet-pv' ? 'Hazırlanıyor…' : 'Önizle'}</button>
            <button type="button" className="admin-btn admin-btn-primary" disabled={!!busy} onClick={() => void pdf('antet', true)}>{busy === 'antet-dl' ? 'Hazırlanıyor…' : 'PDF indir'}</button>
          </div>
          {pdfUrl?.for === 'antet' && <iframe title="Boş antet önizleme" src={pdfUrl.url} className="h-[720px] w-full border border-line bg-white" />}
        </section>
      )}

      {(tab === 'kartvizit' || tab === 'imza') && (
        <section className="admin-card grid gap-3 p-4">
          <h2 className="text-[15px] font-extrabold">{tab === 'kartvizit' ? 'Kartvizit (85 × 55 mm)' : 'E-posta imzası'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Ekip üyesi
              <select className={field} value={member} onChange={(e) => pickMember(e.target.value)}>
                <option value="">Seçin (veya aşağıya elle yazın)</option>
                {data.team.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? ` · ${m.role}` : ''}</option>)}
              </select>
            </label>
            <label className={label}>Ad soyad<input className={field} value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} /></label>
            <label className={label}>Unvan<input className={field} value={person.title} onChange={(e) => setPerson({ ...person, title: e.target.value })} /></label>
            <label className={label}>Telefon<input className={field} value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} /></label>
            <label className={label}>E-posta<input className={field} value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} /></label>
            <label className={label}>Web sitesi<input className={field} value={person.website} onChange={(e) => setPerson({ ...person, website: e.target.value })} /></label>
          </div>
          <p className="text-[12px] text-subtle">Ad ve unvan ekip kaydından gelir. Ekip kayıtlarında kişisel telefon ve e-posta tutulmadığı için bu alanlar şirket profilinden başlar; burada değiştirebilirsiniz, değişiklik kaydedilmez.</p>

          {tab === 'kartvizit' ? <>
            <div className="flex flex-wrap items-end gap-2">
              <label className={label}>Taşma payı (matbaanın istediği)
                <select className={field} value={bleed} onChange={(e) => setBleed(Number(e.target.value))}>{[2, 3, 5].map((b) => <option key={b} value={b}>{b} mm</option>)}</select>
              </label>
              <button type="button" className="admin-btn" disabled={!!busy} onClick={() => void pdf('kartvizit', false)}>{busy === 'kartvizit-pv' ? 'Hazırlanıyor…' : 'Ön / arka önizle'}</button>
              <button type="button" className="admin-btn admin-btn-primary" disabled={!!busy} onClick={() => void pdf('kartvizit', true)}>{busy === 'kartvizit-dl' ? 'Hazırlanıyor…' : 'Baskı için PDF indir'}</button>
            </div>
            <p className="text-[12px] text-yellow-200">PDF iki sayfadır (ön, arka); kesim 85 × 55 mm, seçilen taşma payı ve kesim işaretleri vardır. Renkler RGB’dir: matbaaya göndermeden önce taşma payını, renk profilini (CMYK) ve dosya biçimini matbaayla teyit edin. Bu dosya bir provadır.</p>
            {pdfUrl?.for === 'kartvizit' && <iframe title="Kartvizit önizleme" src={pdfUrl.url} className="h-[560px] w-full border border-line bg-white" />}
          </> : <>
            <Preview html={htmlFile('E-posta imzası', sigPreview)} title="İmza önizleme" height={240} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="admin-btn admin-btn-primary" onClick={async () => copied(await copyRich(sig, signatureText(sigInput)))}>Biçimlendirilmiş kopyala</button>
              <button type="button" className="admin-btn" onClick={() => saveBlob(new Blob([htmlFile('E-posta imzası', sig)], { type: 'text/html' }), `yoca-imza-${(person.name || 'kisi').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]+/g, '-')}.html`)}>HTML indir</button>
            </div>
            <p className="text-[12px] text-subtle">Logo https://yoca.net üzerindeki PNG’den yüklenir; e-posta programı görselleri engellerse “Yoca” yazısı görünür.</p>
          </>}
        </section>
      )}

      {tab === 'eposta' && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="admin-card grid content-start gap-3 p-4">
            <h2 className="text-[15px] font-extrabold">Proje bilgilendirme e-postası</h2>
            <p className="text-[12px] text-subtle">Önizleme, kopyalama ve HTML indirme. Panelden gönderilmez.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Müşteri (isteğe bağlı)
                <select className={field} value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(''); }}>
                  <option value="">Seçilmedi</option>
                  {data.clients.filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.legal_name || c.brand_name || c.name}</option>)}
                </select>
              </label>
              <label className={label}>Proje (isteğe bağlı)
                <select className={field} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Seçilmedi</option>
                  {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className={label}>Dil<select className={field} value={locale} onChange={(e) => setLocale(e.target.value === 'en' ? 'en' : 'tr')}><option value="tr">Türkçe</option><option value="en">English</option></select></label>
              <label className={label}>Konu<input className={field} value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></label>
              <label className={`${label} sm:col-span-2`}>Başlık (e-postada büyük yazı, isteğe bağlı)<input className={field} value={mail.headline} onChange={(e) => setMail({ ...mail, headline: e.target.value })} /></label>
              <label className={`${label} sm:col-span-2`}>Hitap<input className={field} value={mail.greeting} onChange={(e) => setMail({ ...mail, greeting: e.target.value })} /></label>
              <label className={`${label} sm:col-span-2`}>Metin<textarea className={field} rows={8} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} /></label>
              <label className={label}>Bağlantı (isteğe bağlı)<input className={field} value={mail.linkUrl} onChange={(e) => setMail({ ...mail, linkUrl: e.target.value })} placeholder="https://…" /></label>
              <label className={label}>Buton metni<input className={field} value={mail.linkLabel} onChange={(e) => setMail({ ...mail, linkLabel: e.target.value })} placeholder="Projeyi görüntüle" /></label>
            </div>
            {linkBad && <p className="text-[12px] text-yellow-200">Bağlantı http(s) ile başlamalı; geçersiz bağlantı butona konmaz.</p>}

            <div className="grid gap-2 border-t border-line pt-3">
              <h3 className="text-[13px] font-extrabold">AI ile metin öner (isteğe bağlı)</h3>
              <p className="text-[12px] text-subtle">Yapılan işi / iletmek istediğinizi yazın. Öneri yalnızca bu bilgilere dayanır; tarih, test sonucu, garanti veya taahhüt eklememesi istenir. “Uygula” demeden hiçbir alan değişmez.</p>
              <textarea className={field} rows={4} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder="Ör. Tasarım onaylandı, geliştirme başladı. Test ortamı bağlantısı aşağıda." />
              <button type="button" className="admin-btn justify-self-start" disabled={!!busy || facts.trim().length < 10} onClick={aiEmail}>{busy === 'ai' ? 'Hazırlanıyor…' : 'Öneri al'}</button>
              {sug && (
                <div className="grid gap-2 border border-yoca-lime/40 bg-yoca-lime/5 p-3 text-[13px]">
                  {sug.warnings.map((w) => <p key={w} className="text-yellow-200">{w}</p>)}
                  {sug.missing.length > 0 && <p className="text-yellow-100">Eksik: {sug.missing.join(' · ')}</p>}
                  {sug.title && <div className="flex justify-between gap-2"><p><span className="text-subtle">Konu:</span> {sug.title}</p><button type="button" className={small} onClick={() => applySug('subject')}>Uygula</button></div>}
                  {sug.salutation && <div className="flex justify-between gap-2"><p><span className="text-subtle">Hitap:</span> {sug.salutation}</p><button type="button" className={small} onClick={() => applySug('greeting')}>Uygula</button></div>}
                  {sug.body && <div className="grid gap-1"><div className="flex justify-between gap-2"><p className="font-semibold">Metin</p><button type="button" className={small} onClick={() => applySug('body')}>Uygula</button></div><p className="whitespace-pre-wrap text-muted">{[sug.body, sug.closing].filter(Boolean).join('\n\n')}</p></div>}
                  <div className="flex gap-2"><button type="button" className="admin-btn" onClick={() => applySug('all')}>Hepsini uygula</button><button type="button" className="admin-btn" onClick={() => setSug(null)}>Kapat</button></div>
                </div>
              )}
            </div>
          </div>
          <div className="admin-card grid content-start gap-3 p-4">
            <h2 className="text-[15px] font-extrabold">Önizleme</h2>
            <Preview html={emailPreview} title="E-posta önizleme" height={640} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="admin-btn admin-btn-primary" disabled={!mail.body.trim()} onClick={async () => copied(await copyRich(emailHtml, brandedEmailText(emailInput)))}>Biçimlendirilmiş kopyala</button>
              <button type="button" className="admin-btn" disabled={!mail.body.trim()} onClick={() => saveBlob(new Blob([emailHtml], { type: 'text/html' }), 'yoca-proje-bilgilendirme.html')}>HTML indir</button>
              <button type="button" className="admin-btn" disabled={!mail.body.trim()} onClick={async () => { try { await navigator.clipboard.writeText(brandedEmailText(emailInput)); setFlash({ tone: 'ok', text: 'Düz metin kopyalandı.' }); } catch { copied(false); } }}>Düz metni kopyala</button>
            </div>
            <p className="text-[12px] text-subtle">Tablo düzeni ve satır içi stil: Gmail, Outlook ve mobilde aynı görünür; Manrope yüklenmezse sistem yazı tipi kullanılır. Logo https://yoca.net üzerindeki PNG’den gelir.</p>
          </div>
        </section>
      )}
    </div>
  );
}
