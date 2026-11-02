/**
 * Yoca — "Built by YOCA" signature for client sites (WordPress etc.).
 * Self-contained HTML (inline SVG + scoped CSS): paste into a "Custom HTML"
 * block. The wordmark letters use currentColor so they follow the footer's
 * text colour; the brand squares keep their lime/green.
 * Path data is the official wordmark (public/brand/yoca-logo-light-bg.svg).
 */

const PATHS: Array<{ fill: string; d: string }> = [
  { fill: "#A2FF00", d: "M0,16.71L1.36.62h16.18l-1.36,16.09H0Z" },
  { fill: "#40C401", d: "M25.49,16.71l-1.36,16.09H7.95l1.36-16.09h16.18Z" },
  { fill: "currentColor", d: "M42.59,69.04h-16.41s7.31-20.13,7.31-20.13h-9.96v-.02h-8.1l1.23-16.09h14.66v.06s8.24,0,8.24,0L50.92.62h16.51l-24.83,68.42Z" },
  { fill: "currentColor", d: "M79.32,47.06c-4.08-2.17-7.28-5.16-9.6-8.99-2.33-3.82-3.49-8.13-3.49-12.92s1.16-9.1,3.49-12.92c2.32-3.82,5.53-6.82,9.6-8.99,4.08-2.17,8.68-3.25,13.78-3.25s9.71,1.08,13.78,3.25c4.08,2.17,7.28,5.16,9.6,8.99,2.32,3.82,3.49,8.13,3.49,12.92s-1.16,9.1-3.49,12.92c-2.33,3.82-5.53,6.82-9.6,8.99-4.08,2.17-8.68,3.25-13.78,3.25s-9.7-1.08-13.78-3.25ZM99.73,37.25c1.98-1.15,3.55-2.77,4.7-4.87s1.72-4.5,1.72-7.22-.57-5.13-1.72-7.22c-1.15-2.1-2.72-3.72-4.7-4.87-1.98-1.15-4.19-1.72-6.63-1.72s-4.65.57-6.63,1.72c-1.98,1.15-3.55,2.77-4.7,4.87-1.15,2.1-1.72,4.5-1.72,7.22s.57,5.13,1.72,7.22c1.15,2.1,2.72,3.72,4.7,4.87,1.98,1.15,4.19,1.72,6.63,1.72s4.65-.57,6.63-1.72Z" },
  { fill: "currentColor", d: "M137.64,47.09c-4.03-2.14-7.19-5.13-9.5-8.95-2.3-3.82-3.46-8.16-3.46-12.99s1.15-9.16,3.46-12.99c2.3-3.82,5.47-6.81,9.5-8.95,4.03-2.14,8.58-3.22,13.65-3.22,4.42,0,8.41.78,11.96,2.35,3.55,1.57,6.5,3.82,8.84,6.77l-8.71,7.88c-3.13-3.78-6.93-5.67-11.4-5.67-2.63,0-4.96.57-7.02,1.72-2.06,1.15-3.64,2.77-4.76,4.87-1.13,2.1-1.69,4.5-1.69,7.22s.56,5.13,1.69,7.22c1.13,2.1,2.72,3.72,4.76,4.87,2.04,1.15,4.39,1.72,7.02,1.72,4.46,0,8.27-1.89,11.4-5.67l8.71,7.88c-2.35,2.95-5.29,5.21-8.84,6.77-3.55,1.57-7.54,2.34-11.96,2.34-5.06,0-9.62-1.07-13.65-3.22h0Z" },
  { fill: "currentColor", d: "M209.75,39.94h-20.46l-3.8,9.39h-13.96L192.88.97h13.47l21.42,48.38h-14.24l-3.8-9.39h.01ZM205.74,29.85l-6.22-15.47-6.22,15.47h12.44Z" },
  { fill: "#40C401", d: "M232.24,49.16l1.37-16.29h16.39l-1.38,16.29h-16.38Z" },
];

export interface SignatureOptions {
  /** Text before the logo, e.g. "Built by". */
  label: string;
  /** Centre the signature in its container. */
  center?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildSignature({ label, center = false }: SignatureOptions): string {
  const text = escapeHtml(label.trim() || 'Built by');
  const svg = PATHS.map((p) => `      <path fill="${p.fill}" d="${p.d}"/>`).join('\n');
  return `<!-- YOCA imzası — WordPress: "Özel HTML" bloğuna olduğu gibi yapıştırın. Harfler footer'ın yazı rengini alır. -->
<style>
  .yoca-credit-wrap{display:flex;justify-content:flex-start;padding:12px 0}
  .yoca-credit-wrap.yoca-credit--center{justify-content:center}
  .yoca-credit{display:inline-flex;align-items:center;gap:8px;color:inherit;text-decoration:none;font:500 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;letter-spacing:.04em;opacity:.72;transition:opacity .2s ease}
  .yoca-credit:hover,.yoca-credit:focus-visible{opacity:1;text-decoration:none;color:inherit}
  .yoca-credit:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:2px}
  .yoca-credit svg{display:block;height:14px;width:auto;flex:none}
</style>
<div class="yoca-credit-wrap${center ? ' yoca-credit--center' : ''}">
  <a class="yoca-credit" href="https://yoca.net" target="_blank" rel="noopener" aria-label="${text} YOCA">
    <span>${text}</span>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 69.05" aria-hidden="true" focusable="false">
${svg}
    </svg>
  </a>
</div>
`;
}
