'use client';

import { useMemo, useState } from 'react';
import { buildSignature } from '@/lib/signature';

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
  const [center, setCenter] = useState(false);
  const [copied, setCopied] = useState(false);
  const snippet = useMemo(() => buildSignature({ label, center }), [label, center]);

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
          kodu olduğu gibi yapıştırın. Harfler footer’ın yazı rengini alır; koyu ve açık zeminde çalışır.
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
        <label className="flex items-center gap-2 text-[13px] font-bold text-muted">
          <input type="checkbox" checked={center} onChange={(event) => setCenter(event.target.checked)} />
          Ortala
        </label>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {[
          { name: 'Koyu footer', bg: '#0b0d10', color: '#e8e8e8' },
          { name: 'Açık footer', bg: '#f4f4f1', color: '#14161a' },
        ].map((variant) => (
          <figure key={variant.name} className="admin-card !p-0 overflow-hidden">
            <iframe
              title={`${variant.name} önizleme`}
              srcDoc={previewDoc(snippet, variant.bg, variant.color)}
              sandbox=""
              className="block h-[96px] w-full border-0"
            />
            <figcaption className="border-t border-line px-4 py-2 text-[12px] font-bold text-subtle">{variant.name}</figcaption>
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
