import { Fragment, type ReactNode } from 'react';

/**
 * Yoca — keep Latin brand names in English casing inside localized text.
 * Uppercase labels (CSS text-transform) follow the page language; on Turkish
 * pages "i" becomes "İ", which turns "Growth Engine" into "GROWTH ENGİNE".
 * Wrapping brand names in lang="en" keeps them "GROWTH ENGINE" while Turkish
 * words around them still uppercase correctly (ı → I, i → İ).
 */
const BRAND = /(Yoca(?:Serve|Studio)?(?:\s(?:Brand System|Growth Engine|Scale Framework|Demo Hub|Labs))?™?|WonKick|Your Own Creative Agency\.?|Built by YOCA|Creative Growth Partner)/g;

export function brandText(text: string): ReactNode {
  if (!text) return text;
  const parts = text.split(BRAND);
  if (parts.length === 1) return text;
  // One wrapper span: inside flex containers (.eyebrow) the pieces must stay a single item.
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} lang="en">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}

export default function BrandText({ children }: { children: string }) {
  return <>{brandText(children)}</>;
}
