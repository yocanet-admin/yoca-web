'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { adminFetch, callAi, type AiRunInfo } from '@/lib/insightsAdmin';
import { imageMarkdown } from '@/lib/insightImages';

/**
 * Yoca Admin — cover & article images.
 * Brief (auto-suggested from the article, editable) → Kapak üret / Alternatif
 * üret; own upload; instruction edit (Images edit API); "Kapak olarak kullan";
 * "Yazı içine ekle"; social crops (1200×630, 1080×1080) made on the server
 * with sharp when it is installed, otherwise in the browser from the stored
 * original. Everything is stored in the PRIVATE draft bucket
 * with prompt, model, date, alt text; nothing becomes public before
 * "Yayınla". AI images are illustrations — never client work, team photos or
 * evidence; titles are added later with real type, the logo is never drawn.
 */

export interface StudioImage {
  id: string;
  url: string | null;
  kind: string;
  origin: string;
  prompt: string | null;
  brief: string | null;
  model: string | null;
  created_at: string;
  selected: boolean;
  alt_text: string;
  crop: string | null;
  parent_id: string | null;
  width: number | null;
  height: number | null;
  public_url: string | null;
}

interface Props {
  insightId?: string;
  groupId: string;
  title: string;
  excerpt: string;
  body: string;
  images: StudioImage[];
  reload: () => Promise<void>;
  onInsert: (markdown: string) => void;
  onRun: (run?: AiRunInfo) => void;
  preset: 'economy' | 'quality';
  busy: string | null;
  setBusy: (b: string | null) => void;
  setError: (e: string | null) => void;
}

const CROPS: Array<{ key: string; w: number; h: number; label: string }> = [
  { key: '1200x630', w: 1200, h: 630, label: 'Sosyal paylaşım 1200×630' },
  { key: '1080x1080', w: 1080, h: 1080, label: 'Kare 1080×1080' },
];

async function cropToBlob(url: string, w: number, h: number): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Görsel yüklenemedi (CORS?).'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tarayıcı kırpma desteklemiyor.');
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Kırpılamadı.'))), 'image/png'));
}

export default function ImageStudio(props: Props) {
  const { images, busy, setBusy, setError } = props;
  const [brief, setBrief] = useState('');
  const [approach, setApproach] = useState<'photo' | 'illustration' | 'diagram'>('photo');
  const [alt, setAlt] = useState('');
  const [variant, setVariant] = useState(0);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [autoNote, setAutoNote] = useState(false);
  const autoTried = useRef(false);

  const originals = images.filter((i) => i.kind !== 'crop');
  const cover = images.find((i) => i.selected) ?? null;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız. Görseller ve metin değişmedi.');
    } finally {
      setBusy(null);
    }
  };

  const suggestBrief = () =>
    run('Kapak özeti hazırlanıyor…', async () => {
      const r = await callAi<{ brief: string; approach: 'photo' | 'illustration' | 'diagram'; alt: string }>({ action: 'cover_brief', title: props.title, excerpt: props.excerpt, body: props.body, insightId: props.insightId });
      setBrief(r.result.brief);
      setApproach(r.result.approach);
      setAlt(r.result.alt);
      props.onRun(r.run);
    });

  // Guided flow: suggest the brief from the article once when this step opens
  // (article text only — never form/lead data). Nothing is generated until the
  // editor presses "Kapak üret"; the brief stays editable.
  useEffect(() => {
    if (autoTried.current || brief || busy || !props.title.trim() || !props.body.trim() || images.length > 0) return;
    autoTried.current = true;
    setAutoNote(true);
    suggestBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = (alternative: boolean) =>
    run(alternative ? 'Alternatif üretiliyor (1 dk kadar)…' : 'Kapak üretiliyor (1 dk kadar)…', async () => {
      const v = alternative ? variant + 1 : 0;
      const r = await callAi<{ imageId: string }>({ action: 'image_generate', brief, approach, alt, variant: v, groupId: props.groupId, insightId: props.insightId, preset: props.preset });
      setVariant(v);
      props.onRun(r.run);
      await props.reload();
    });

  const editImage = (id: string) =>
    run('Görsel talimatla düzenleniyor…', async () => {
      const r = await callAi<{ imageId: string }>({ action: 'image_edit', imageId: id, instruction, insightId: props.insightId, preset: props.preset });
      props.onRun(r.run);
      setEditFor(null);
      setInstruction('');
      await props.reload();
    });

  const upload = (file: File) =>
    run('Görsel yükleniyor…', async () => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) throw new Error('PNG, JPEG veya WebP; en fazla 8 MB.');
      const form = new FormData();
      form.set('file', file);
      form.set('groupId', props.groupId);
      if (props.insightId) form.set('insightId', props.insightId);
      form.set('kind', 'upload');
      const r = await adminFetch<{ imageId?: string }>('/api/admin/insights/images', { form });
      if (!r.ok) throw new Error(r.error ?? 'Yüklenemedi.');
      await props.reload();
    });

  const selectCover = (id: string) =>
    run('Kapak seçiliyor…', async () => {
      const r = await adminFetch('/api/admin/insights/images', { json: { action: 'select_cover', imageId: id } });
      if (!r.ok) throw new Error(r.error ?? 'Seçilemedi.');
      await props.reload();
    });

  const saveAlt = (id: string, text: string) =>
    run('Alt metin kaydediliyor…', async () => {
      const r = await adminFetch('/api/admin/insights/images', { json: { action: 'alt', imageId: id, alt: text } });
      if (!r.ok) throw new Error(r.error ?? 'Kaydedilemedi.');
      await props.reload();
    });

  const makeCrop = (img: StudioImage, w: number, h: number, key: string) =>
    run(`${key} kırpımı hazırlanıyor…`, async () => {
      // Server first (sharp, if installed there); otherwise crop in the browser.
      const server = await adminFetch<{ imageId?: string; code?: string }>('/api/admin/insights/images', { json: { action: 'crop', imageId: img.id, crop: key } });
      if (server.ok) {
        await props.reload();
        return;
      }
      if (server.code !== 'no_sharp') throw new Error(server.error ?? 'Kırpım yapılamadı.');
      if (!img.url) throw new Error('Görsel adresi yok.');
      const blob = await cropToBlob(img.url, w, h);
      const form = new FormData();
      form.set('file', new File([blob], `${key}.png`, { type: 'image/png' }));
      form.set('groupId', props.groupId);
      if (props.insightId) form.set('insightId', props.insightId);
      form.set('kind', 'crop');
      form.set('parentId', img.id);
      form.set('crop', key);
      form.set('alt', img.alt_text);
      const r = await adminFetch('/api/admin/insights/images', { form });
      if (!r.ok) throw new Error(r.error ?? 'Kırpım kaydedilemedi.');
      await props.reload();
    });

  const field = 'admin-input !text-[13px]';
  return (
    <div className="grid gap-3 text-[13px]">
      <p className="text-[12px] text-muted">Görseller özel (herkese kapalı) depoda tutulur; “Yayınla” denince kullanılanlar yayına kopyalanır. Yapay zekâ görselleri müşteri işi, ekip fotoğrafı ya da kanıt olarak sunulmaz; başlık sonradan gerçek yazı tipiyle eklenir, logo çizdirilmez.</p>
      <div className="grid gap-2 border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-white">Kapak özeti</p>
          <button type="button" className="admin-btn !px-2 !py-1 !text-[12px]" disabled={!!busy || !props.title} onClick={suggestBrief}>Makaleden öner</button>
        </div>
        {autoNote && <p className="text-[11px] text-subtle">Özet makaleden otomatik önerildi. Üretmeden önce düzenleyebilir ya da kendi tarifinizi yazabilirsiniz.</p>}
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} className={field} placeholder="Ne görünecek? Ör. Siyah zeminde, randevu kartlarının sırayla dizildiği bir masa; tek yeşil işaret. (Kendi tarifinizi de yazabilirsiniz.)" />
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-[12px] font-semibold text-muted">Yaklaşım
            <select value={approach} onChange={(e) => setApproach(e.target.value as 'photo')} className={field}>
              <option value="photo">Fotoğraf</option>
              <option value="illustration">İllüstrasyon</option>
              <option value="diagram">Diyagram (yazısız)</option>
            </select>
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-muted">Alt metin (görseli tarif edin)
            <input value={alt} onChange={(e) => setAlt(e.target.value)} className={field} maxLength={300} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-btn-primary" disabled={!!busy || !brief.trim()} onClick={() => generate(false)}>Kapak üret</button>
          <button type="button" className="admin-btn" disabled={!!busy || !brief.trim()} onClick={() => generate(true)}>Alternatif üret</button>
          <label className="admin-btn cursor-pointer">Kendi görselini yükle<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
          <button type="button" className="admin-btn" disabled={!!busy} onClick={() => run('Yenileniyor…', props.reload)}>Yenile</button>
        </div>
        <p className="text-[11px] text-subtle">Referans görsel: kendi görselinizi yükleyin, sonra o görselde “Talimatla düzenle” ile yeni bir sürüm üretin (Images edit). Kendi yüklediğiniz görsel değiştirilmez; her düzenleme yeni bir kayıt olur.</p>
      </div>

      {cover?.url && (
        <div className="grid gap-2 border border-yoca-green/40 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Kapak önizlemesi</p>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <figure><img src={cover.url} alt={cover.alt_text} className="aspect-[16/9] w-full object-cover" /><figcaption className="text-[11px] text-subtle">Masaüstü 16:9</figcaption></figure>
            <figure><img src={cover.url} alt="" className="aspect-[4/5] w-full object-cover" /><figcaption className="text-[11px] text-subtle">Mobil 4:5</figcaption></figure>
          </div>
          {!cover.alt_text && <p className="text-[12px] text-yellow-300">Kapağın alt metni boş — görseli tarif eden bir alt metin yazın.</p>}
        </div>
      )}

      {originals.length === 0 ? (
        <p className="text-[12px] text-subtle">Henüz görsel yok.</p>
      ) : (
        <ul className="grid gap-3">
          {originals.map((img) => {
            const crops = images.filter((c) => c.parent_id === img.id && c.kind === 'crop');
            return (
              <li key={img.id} className={`grid gap-2 border p-2 ${img.selected ? 'border-yoca-lime' : 'border-line'}`}>
                {img.url ? <img src={img.url} alt={img.alt_text} className="aspect-[3/2] w-full object-cover" /> : <p className="text-subtle">Önizleme yok</p>}
                <p className="text-[11px] text-subtle">
                  {img.selected ? 'KAPAK · ' : ''}{img.origin === 'ai' ? `Yapay zekâ · ${img.model ?? ''}` : 'Yüklenen'} · {new Date(img.created_at).toLocaleString('tr-TR')}{img.width ? ` · ${img.width}×${img.height}` : ''}{img.public_url ? ' · yayında' : ' · taslak'}
                </p>
                <AltEditor value={img.alt_text} onSave={(t) => saveAlt(img.id, t)} disabled={!!busy} />
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="admin-btn !px-2 !py-1 !text-[12px]" disabled={!!busy || img.selected} onClick={() => selectCover(img.id)}>Kapak olarak kullan</button>
                  <button type="button" className="admin-btn !px-2 !py-1 !text-[12px]" disabled={!img.alt_text} title={img.alt_text ? '' : 'Önce alt metin yazın'} onClick={() => props.onInsert(imageMarkdown(img.id, img.alt_text))}>Yazı içine ekle</button>
                  <button type="button" className="admin-btn !px-2 !py-1 !text-[12px]" disabled={!!busy} onClick={() => setEditFor(editFor === img.id ? null : img.id)}>Talimatla düzenle</button>
                  {CROPS.map((c) => (
                    <button key={c.key} type="button" className="admin-btn !px-2 !py-1 !text-[12px]" disabled={!!busy || crops.some((x) => x.crop === c.key)} onClick={() => makeCrop(img, c.w, c.h, c.key)}>{c.label}</button>
                  ))}
                </div>
                {editFor === img.id && (
                  <div className="grid gap-1.5">
                    <input value={instruction} onChange={(e) => setInstruction(e.target.value)} className={field} placeholder="Ör. Yeşil çizgiyi daha ince yap, arka planı biraz aç." />
                    <button type="button" className="admin-btn-primary w-fit" disabled={!!busy || !instruction.trim()} onClick={() => editImage(img.id)}>Düzenlemeyi üret (yeni sürüm)</button>
                  </div>
                )}
                {crops.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {crops.map((c) => (
                      <figure key={c.id} className="w-28">{c.url && <img src={c.url} alt="" className="w-full border border-line" />}<figcaption className="text-[10px] text-subtle">{c.crop}</figcaption></figure>
                    ))}
                  </div>
                )}
                {img.prompt && (
                  <details className="text-[11px] text-subtle"><summary className="cursor-pointer">İstem (prompt)</summary><p className="whitespace-pre-wrap">{img.prompt}</p></details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AltEditor({ value, onSave, disabled }: { value: string; onSave: (t: string) => void; disabled: boolean }) {
  const [text, setText] = useState(value);
  return (
    <div className="flex gap-1.5">
      <input value={text} onChange={(e) => setText(e.target.value)} className="admin-input !text-[12px]" placeholder="Alt metin: görselde ne görünüyor?" maxLength={300} />
      <button type="button" className="admin-btn !px-2 !py-1 !text-[12px]" disabled={disabled || text === value} onClick={() => onSave(text)}>Kaydet</button>
    </div>
  );
}
