/**
 * Yoca — house style for every AI-written text.
 * The pattern rules come from the vendored, pinned adaptation of
 * petergyang/no-ai-slop (MIT) in ./no-ai-slop.ts; this file adds Yoca's own
 * editorial requirements on top. Both are sent server side with every text
 * request (see YOCA_EDITORIAL_SYSTEM).
 */

import { NO_AI_SLOP_RULES } from '@/lib/ai/prompts/no-ai-slop';

export const YOCA_STYLE_ADDITIONS = `Yoca additions:
- Readers are business owners and marketing managers. Explain mechanisms and trade-offs; skip theory they do not need.
- Never present Yoca client work as measured results. Client projects may only be mentioned with the verified scope the editor provides.
- Any number, study, date or quotation needs a source the editor supplied. Without one, leave it out or mark it in the text as [KAYNAK GEREKLİ].
- Do not describe Yoca's team size, seniority, years of experience, response times or guarantees.
- Plain Turkish: "kullanıcı", "ziyaretçi", "müşteri adayı"; avoid English buzzwords where a Turkish word is clear.`;

export const HOUSE_STYLE_RULES = `${NO_AI_SLOP_RULES}\n\n${YOCA_STYLE_ADDITIONS}`;
