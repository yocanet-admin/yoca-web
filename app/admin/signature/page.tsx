'use client';

import { useMemo, useState } from 'react';
import { buildSignature, type SignatureAlign, type SignatureColor } from '@/lib/signature';

/**
 * Yoca Admin — "Built by YOCA" imzası.
 * Müşteri sitelerine (WordPress vb.) eklenecek hazır HTML: önizleme,
 * kopyala ve .html olarak indir. Hiçbir veri kaydedilmez.
 */

const PRESETS = ['Built by', 'Designed & built by', 'Tasarım & Geliştirme', 'Geliştiren'];

function previewDoc(snippet: string, background: string, color: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${background};color:${color};font-family:Arial,sans-serif}body{padding:20px 28px}p{margin:0 0 4px;font-size:12px;opacity:.6}</style></head><body><p>© 2026 Örnek Müşteri</p>${snippet}</body></html>`;
}

export default function SignaturePage() {
  const [label, setLabel] = useState(PRESETS[0]);
  const [align, setAlign] = useState<SignatureAlign>('left');
  const [color, setColor] = useState<SignatureColor>('inherit');
  const [customColor, setCustomColor] = useState('#a2ff00');
  const [brandColors, setBrandColors] = useState(true);
  const [testBg, setTestBg] = useState('#1d3b2a');
  const [copied, setCopied] = useState(false);
  const snippet = useMemo(
    () => buildSignature({ label, align, color, customColor, brandColors }),
    [label, align, color, customColor, brandColors],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob([snippet], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'yoca-imza.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">İmza</h1>
        <p className="mt-1.5 max-w-[70ch] text-[14px] text-muted">
          Yaptığımız sitelere eklenen “Built by YOCA” imzası. WordPress’te footer’a bir “Özel HTML” bloğu ekleyip
          kodu olduğu gibi yapıştırın. Hizalamayı ve rengi aşağıdan seçin; önizlemeler koyu, açık ve kendi zemininizde nasıl görüneceğini gösterir.
        </p>
      </header>

      <section className="admin-card grid gap-4">
        <div className="grid gap-2">
          <span className="text-[12px] font-bold text-subtle">Yazı</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setLabel(preset)}
                className={`rounded-sm border px-3 py-1.5 text-[13px] font-bold transition-colors ${
                  label === preset ? 'border-yoca-lime text-white' : 'border-line text-muted hover:text-white'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={40}
            aria-label="İmza yazısı"
            className="admin-input max-w-[360px]"
          />
        </div>
        <div className="grid gap-2">
          <p id="align-label" className="text-[13px] font-bold text-muted">
            Hizalama
          </p>
          <div role="radiogroup" aria-labelledby="align-label" className="flex flex-wrap gap-2">
            {(
              [
                ['left', 'Sola'],
                ['center', 'Ortala'],
                ['right', 'Sağa'],
              ] as Array<[SignatureAlign, string]>
            ).map(([value, name]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={align === value}
                onClick={() => setAlign(value)}
                className={`rounded-sm border px-3 py-1.5 text-[13px] font-bold transition-colors ${
                  align === value ? 'border-yoca-lime text-white' : 'border-line text-muted hover:text-white'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <p id="color-label" className="text-[13px] font-bold text-muted">
            Renk
          </p>
          <div role="radiogroup" aria-labelledby="color-label" className="flex flex-wrap items-center gap-2">
            {(
              [
                ['inherit', 'Sitenin yazı rengi', 'Temanın footer’daki link/yazı rengini kullanır (çoğu tema için en doğal sonuç).'],
                ['auto', 'Zemine göre otomatik', 'Arkasındaki zemin koyuysa beyaz, açıksa siyah olur.'],
                ['light', 'Beyaz', 'Koyu zeminler için.'],
                ['dark', 'Siyah', 'Açık zeminler için.'],
                ['custom', 'Özel renk', 'Sitenin marka rengi gibi sabit bir renk.'],
              ] as Array<[SignatureColor, string, string]>
            ).map(([value, name, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={color === value}
                title={hint}
                onClick={() => setColor(value)}
                className={`rounded-sm border px-3 py-1.5 text-[13px] font-bold transition-colors ${
                  color === value ? 'border-yoca-lime text-white' : 'border-line text-muted hover:text-white'
                }`}
              >
                {name}
              </button>
            ))}
            {color === 'custom' && (
              <span className="flex items-center gap-2">
                <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} aria-label="Özel renk seç" className="h-8 w-10 cursor-pointer rounded-sm border border-line bg-transparent" />
                <input value={customColor} onChange={(e) => setCustomColor(e.target.value)} aria-label="Özel renk (hex)" maxLength={7} className="admin-input !w-[96px] !py-1 font-mono text-[12px]" />
              </span>
            )}
          </div>
          <p className="text-[12px] text-subtle">
            {color === 'auto'
              ? 'Küçük bir kod parçası zemin rengini okur. Fotoğraflı veya gradyanlı zeminlerde düz renk görmezse siyah seçer; o durumda Beyaz/Siyah’ı elle seçin.'
              : color === 'inherit'
                ? 'Temanın footer link/yazı rengini kullanır; tema ana rengi verirse imza da o renkte olur. Kesin beyaz/siyah için Beyaz veya Siyah’ı seçin.'
                : 'Sabit renk; zemin ne olursa olsun bu renkte görünür.'}
          </p>
          <label className="flex items-center gap-2 text-[13px] font-bold text-muted">
            <input type="checkbox" checked={brandColors} onChange={(e) => setBrandColors(e.target.checked)} className="accent-yoca-lime" />
            Logodaki yeşil kareler ve nokta marka renginde kalsın
          </label>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { name: 'Koyu footer', bg: '#0b0d10', color: '#e8e8e8' },
          { name: 'Açık footer', bg: '#f4f4f1', color: '#14161a' },
          { name: 'Kendi zemininiz', bg: /^#[0-9a-f]{6}$/i.test(testBg) ? testBg : '#1d3b2a', color: '#d9e4dc', custom: true },
        ].map((variant) => (
          <figure key={variant.name} className="admin-card !p-0 overflow-hidden">
            <iframe
              title={`${variant.name} önizleme`}
              srcDoc={previewDoc(snippet, variant.bg, variant.color)}
              sandbox="allow-scripts"
              className="block h-[96px] w-full border-0"
            />
            <figcaption className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-[12px] font-bold text-subtle">
              {variant.name}
              {variant.custom && (
                <input type="color" value={testBg} onChange={(e) => setTestBg(e.target.value)} aria-label="Önizleme zemin rengi" className="h-6 w-8 cursor-pointer rounded-sm border border-line bg-transparent" />
              )}
            </figcaption>
          </figure>
        ))}
      </section>

      <section className="admin-card grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12px] font-bold text-subtle">HTML kodu</span>
          <div className="flex gap-2">
            <button type="button" onClick={copy} className="admin-btn-primary">
              {copied ? 'Kopyalandı ✓' : 'Kopyala'}
            </button>
            <button type="button" onClick={download} className="admin-btn">
              İndir (.html)
            </button>
          </div>
        </div>
        <textarea
          readOnly
          value={snippet}
          aria-label="İmza HTML kodu"
          onFocus={(event) => event.currentTarget.select()}
          className="admin-input h-[260px] font-mono text-[12px] leading-relaxed"
        />
      </section>
    </div>
  );
}
