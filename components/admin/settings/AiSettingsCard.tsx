'use client';

import { useEffect, useState } from 'react';
import { Card, Notice, StatusBadge } from '@/components/admin/cockpit/Widgets';
import { adminApi, adminPost } from '@/lib/cockpit/client';
import type { AiSettings } from '@/lib/ai/settings';
import type { ModelPrice } from '@/lib/ai/cost';

/**
 * Yoca Admin — Ayarlar → Yapay zekâ.
 * Friendly presets (Ekonomik / Yüksek kalite) for text and images, technical
 * model ids under "Gelişmiş", monthly budget, editable price table (for the
 * ESTIMATED cost), "Modelleri doğrula" (server calls the Models endpoint with
 * the server key; the key itself is never shown) and recent real usage.
 */

interface Run {
  id: string;
  created_at: string;
  action: string;
  kind: string | null;
  model: string;
  status: string;
  tokens_in: number | null;
  tokens_out: number | null;
  tokens_cached: number | null;
  images: number | null;
  est_cost_usd: number | null;
  error: string | null;
  created_by: string | null;
}

interface Data {
  ok: boolean;
  error?: string;
  keyConfigured: boolean;
  mock: { requested: boolean; active: boolean; error?: string };
  settings: AiSettings & { ready: boolean };
  active: { text: string; image: string };
  activeCheck: { text: { ok: boolean; message?: string }; image: { ok: boolean; message?: string } };
  spend: { spent: number; runs: number; text: number; images: number; unknownCost?: number } | null;
  spendError: string | null;
  runs: Run[];
  noAiSlop: { url: string; commit: string; licence: string; copyright: string };
}

type VerifyResult = { ok: boolean; error?: string; configured?: Array<{ slot: string; id: string; available: boolean }>; availableCount?: number; mock?: boolean };

const SLOT_LABEL: Record<string, string> = { textEconomy: 'Metin · Ekonomik', textQuality: 'Metin · Yüksek kalite', imageEconomy: 'Görsel · Ekonomik', imageQuality: 'Görsel · Yüksek kalite' };

export default function AiSettingsCard() {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<AiSettings | null>(null);
  const [priceText, setPriceText] = useState('');
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const r = await adminApi<Data>('/api/admin/ai');
    setData(r);
    if (r.ok) {
      setDraft(r.settings);
      setPriceText(Object.entries(r.settings.prices).map(([id, p]) => [id, p.input, p.cachedInput ?? '', p.output ?? '', p.imageInput ?? '', p.imageOutput ?? ''].join(' | ')).join('\n'));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const parsePrices = (): Record<string, ModelPrice> => {
    const out: Record<string, ModelPrice> = {};
    for (const line of priceText.split('\n')) {
      const [id, input, cachedInput, output, imageInput, imageOutput] = line.split('|').map((x) => x.trim());
      if (!id || input === undefined || input === '') continue;
      const n = (v?: string) => (v ? Number(v) : undefined);
      out[id] = { input: Number(input), cachedInput: n(cachedInput), output: n(output), imageInput: n(imageInput), imageOutput: n(imageOutput) };
    }
    return out;
  };

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    const r = await adminPost<{ ok: boolean; error?: string }>('/api/admin/ai', { action: 'save', settings: { ...draft, prices: parsePrices() } });
    setBusy(null);
    setMsg(r.ok ? 'Kaydedildi.' : r.error ?? 'Kaydedilemedi.');
    setTimeout(() => setMsg(null), 4000);
    load();
  };

  const runVerify = async () => {
    setBusy('verify');
    const r = await adminPost<VerifyResult>('/api/admin/ai', { action: 'verify' });
    setBusy(null);
    setVerify(r);
    load();
  };

  if (!data) return <Card title="Yapay zekâ"><div className="h-32 animate-pulse rounded-md bg-surface" /></Card>;
  if (!data.ok || !draft) return <Card title="Yapay zekâ"><Notice tone="warning">Okunamadı: {data.error ?? 'bilinmeyen hata'}</Notice></Card>;
  const field = 'admin-input text-[13px]';
  const budgetPct = data.spend && draft.monthlyBudgetUsd > 0 ? Math.min(100, (data.spend.spent / draft.monthlyBudgetUsd) * 100) : 0;

  return (
    <Card title="Yapay zekâ (İçerik stüdyosu, lead özetleri)" action={msg ? <span className="text-[12px] font-bold text-yoca-lime">{msg}</span> : undefined}>
      <div className="grid gap-4 text-[13px]">
        <ul className="grid gap-1.5">
          <li className="flex items-center justify-between gap-2"><span>Sunucu anahtarı (OPENAI_API_KEY)</span><StatusBadge kind={data.keyConfigured ? 'good' : 'warning'}>{data.keyConfigured ? 'Tanımlı' : 'Yok'}</StatusBadge></li>
          <li className="flex items-center justify-between gap-2"><span>Etkin metin modeli ({draft.textPreset === 'quality' ? 'Yüksek kalite' : 'Ekonomik'})</span><span className="flex items-center gap-2"><span className="font-mono text-[12px] text-soft">{data.active.text || '— seçilmedi'}</span><StatusBadge kind={data.activeCheck.text.ok ? 'good' : 'warning'}>{data.activeCheck.text.ok ? 'Doğrulandı' : 'Kullanılamaz'}</StatusBadge></span></li>
          <li className="flex items-center justify-between gap-2"><span>Etkin görsel modeli ({draft.imagePreset === 'quality' ? 'Yüksek kalite' : 'Ekonomik'})</span><span className="flex items-center gap-2"><span className="font-mono text-[12px] text-soft">{data.active.image || '— seçilmedi'}</span><StatusBadge kind={data.activeCheck.image.ok ? 'good' : 'warning'}>{data.activeCheck.image.ok ? 'Doğrulandı' : 'Kullanılamaz'}</StatusBadge></span></li>
        </ul>
        {!data.activeCheck.text.ok && data.activeCheck.text.message && <Notice tone="warning">{data.activeCheck.text.message}</Notice>}
        {!data.activeCheck.image.ok && data.activeCheck.image.message && <Notice tone="warning">{data.activeCheck.image.message}</Notice>}
        <p className="text-[12px] text-subtle">“Ekonomik” ve “Yüksek kalite” yalnızca bir etikettir: hangi modele karşılık geldiğini aşağıda “Gelişmiş” bölümünde, “Modelleri doğrula”nın listelediği kimliklerden siz seçersiniz. Listede olmayan bir model kullanılmaz.</p>
        {!data.keyConfigured && !data.mock.active && <Notice tone="warning">Anahtar yok: yapay zekâ düğmeleri net bir kurulum mesajı gösterir. Anahtar yalnızca Vercel ortam değişkeninde durur; buraya ya da tarayıcıya hiç gelmez.</Notice>}
        {data.mock.active && <Notice tone="warning">AI_MOCK=1 — test modu: OpenAI çağrılmaz, sahte sonuç döner. Production ortamında bu mod reddedilir.</Notice>}
        {data.mock.error && <Notice tone="warning">{data.mock.error}</Notice>}

        <div className="grid grid-cols-2 gap-3">
          <label className="admin-label">Metin varsayılanı
            <select value={draft.textPreset} onChange={(e) => setDraft({ ...draft, textPreset: e.target.value as 'economy' })} className={field}><option value="economy">Ekonomik</option><option value="quality">Yüksek kalite</option></select>
          </label>
          <label className="admin-label">Görsel varsayılanı
            <select value={draft.imagePreset} onChange={(e) => setDraft({ ...draft, imagePreset: e.target.value as 'economy' })} className={field}><option value="economy">Ekonomik</option><option value="quality">Yüksek kalite</option></select>
          </label>
          <label className="admin-label">Aylık tahmini kullanım eşiği (USD, 0 = kapalı)
            <input type="number" min={0} step="0.5" value={draft.monthlyBudgetUsd} onChange={(e) => setDraft({ ...draft, monthlyBudgetUsd: Number(e.target.value) })} className={field} />
          </label>
          <label className="admin-label">İstek başına en çok çıktı token
            <input type="number" min={500} max={16000} value={draft.maxOutputTokens} onChange={(e) => setDraft({ ...draft, maxOutputTokens: Number(e.target.value) })} className={field} />
          </label>
        </div>

        {data.spend ? (
          <div>
            <p className="text-[12px] text-subtle">Bu ay (UTC) tahmini kullanım: <b className="text-white">${data.spend.spent.toFixed(4)}</b> / eşik ${draft.monthlyBudgetUsd.toFixed(2)} · {data.spend.text} metin, {data.spend.images} görsel isteği. Tahmin, OpenAI yanıtındaki gerçek token sayıları × aşağıdaki fiyat tablosudur; kesin tutar OpenAI faturasıdır.</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full bg-yoca-lime" style={{ width: `${budgetPct}%` }} /></div>
            {(data.spend.unknownCost ?? 0) > 0 && (
              <p className="mt-1 text-[12px] text-yellow-300">Bu ay {data.spend.unknownCost} işlemin maliyeti bilinmiyor (modelinin fiyatı tabloda yoktu). Bu işlemler ücretsiz sayılmadı; yukarıdaki toplamda yer almıyor, gerçek tutarları OpenAI kullanım ekranında görünür.</p>
            )}
            <p className="mt-2 text-[12px] text-subtle"><b className="text-white">Bu bir kesin harcama sınırı değildir.</b> Her yapay zekâ isteğinden önce bu ayın tahmini toplamı eşikle karşılaştırılır; eşiğe ulaşılınca yeni istek başlamaz. Sürmekte olan ya da aynı anda başlatılan işlemler bu toplamda henüz yer almadığı için, son işlemlerle birlikte gerçek kullanım eşiği aşabilir. Eşik her ay (UTC) sıfırlanır ve toplam test bütçesinden ayrıdır; o bütçe ayrıca izlenir. Kesin durdurma için OpenAI proje ayarlarındaki harcama sınırı (hard limit) kullanılır. Fiyatı tabloda olmayan bir modelle ücretli üretim yapılmaz.</p>
          </div>
        ) : (
          <Notice tone="warning">{data.spendError ?? 'Kullanım okunamadı.'}</Notice>
        )}

        <details className="admin-box p-3">
          <summary className="cursor-pointer font-bold text-white">Gelişmiş: model kimlikleri ve fiyat tablosu</summary>
          <div className="mt-3 grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(SLOT_LABEL) as Array<keyof AiSettings['models']>).map((slot) => (
                <label key={slot} className="grid gap-1 text-[12px] font-bold text-subtle">{SLOT_LABEL[slot]}
                  <input value={draft.models[slot]} onChange={(e) => setDraft({ ...draft, models: { ...draft.models, [slot]: e.target.value.trim() } })} className={`${field} font-mono`} placeholder="model id (doğrulanmış listeden)" list="ai-verified-models" />
                </label>
              ))}
              <datalist id="ai-verified-models">{(draft.verified?.available ?? []).map((id) => <option key={id} value={id} />)}</datalist>
            </div>
            <label className="admin-label">Fiyat tablosu — her satır: model | giriş | önbellekli giriş | çıkış | görsel giriş | görsel çıkış (USD / 1M token)
              <textarea rows={6} value={priceText} onChange={(e) => setPriceText(e.target.value)} className={`${field} font-mono text-[12px]`} />
            </label>
            <label className="admin-label">Fiyat kaynağı notu
              <input value={draft.pricesNote} onChange={(e) => setDraft({ ...draft, pricesNote: e.target.value })} className={field} />
            </label>
          </div>
        </details>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-btn-primary" disabled={busy !== null} onClick={save}>{busy === 'save' ? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button type="button" className="admin-btn" disabled={busy !== null} onClick={runVerify}>{busy === 'verify' ? 'Doğrulanıyor…' : 'Modelleri doğrula'}</button>
        </div>
        {draft.verified && <p className="text-[12px] text-subtle">Son doğrulama: {new Date(draft.verified.at).toLocaleString('tr-TR')} · hesabın eriştiği {draft.verified.available.length} model.</p>}
        {verify && (
          verify.ok ? (
            <ul className="grid gap-1 text-[12px]">
              {verify.mock && <li className="text-yellow-300">Test modu listesi (gerçek hesap değil).</li>}
              {verify.configured?.map((c) => (
                <li key={c.slot} className="flex items-center justify-between gap-2"><span>{SLOT_LABEL[c.slot]} · <span className="font-mono">{c.id || '—'}</span></span><StatusBadge kind={c.available ? 'good' : 'warning'}>{c.id ? (c.available ? 'Erişilebilir' : 'Listede yok') : 'Seçilmedi'}</StatusBadge></li>
              ))}
              <li className="text-subtle">Görsel modeller listede görünse bile organizasyon doğrulaması gerekebilir; ilk üretimde hata mesajı bunu açıkça söyler.</li>
            </ul>
          ) : (
            <Notice tone="warning">{verify.error}</Notice>
          )
        )}

        <details className="text-[12px]">
          <summary className="cursor-pointer font-bold text-white">Son 30 işlem</summary>
          <ul className="mt-2 grid gap-1">
            {data.runs.length === 0 && <li className="text-subtle">Kayıt yok.</li>}
            {data.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 border-t border-line py-1">
                <span>{new Date(r.created_at).toLocaleString('tr-TR')} · {r.action} · <span className="font-mono">{r.model}</span> · {r.status}{r.error ? ` — ${r.error.slice(0, 80)}` : ''}</span>
                <span className="text-subtle">{r.tokens_in ?? 0}/{r.tokens_out ?? 0} tk{r.images ? ` · ${r.images} görsel` : ''} · {r.est_cost_usd === null ? (r.status === 'running' ? 'sürüyor' : 'maliyet bilinmiyor') : `$${Number(r.est_cost_usd).toFixed(4)} (tahmini)`}</span>
              </li>
            ))}
          </ul>
        </details>
        <p className="text-[11px] text-subtle">Yazım kuralları: {data.noAiSlop.url} (commit {data.noAiSlop.commit.slice(0, 12)}, {data.noAiSlop.licence}, {data.noAiSlop.copyright}) — uyarlanmış, koda sabitlenmiş; çalışma sırasında indirilmez.</p>
      </div>
    </Card>
  );
}
