import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { hasOpenAIKey, OpenAIError } from '@/lib/ai/openai';
import { mockEnabled } from '@/lib/ai/mock';
import { checkModel, getAiSettings, resolveModel } from '@/lib/ai/settings';
import { finishRun, startRun } from '@/lib/ai/runs';
import { cleanDraft, cleanLetter, draftDocument, letterText, moneyMentions, rewriteText, translateDocument, type RewriteOp } from '@/lib/ai/documents';
import { DOC_KINDS, sanitizeContent, type DocKind, type DocLocale } from '@/lib/documents/model';

/**
 * Yoca — AI help for documents (admin only; existing server-side OpenAI key,
 * model settings, monthly budget and ai_runs ledger; no key ever reaches the browser).
 * POST { mode: 'draft', kind, locale, brief, recipient?, projectName?, requestKey }
 *      { mode: 'rewrite', op: 'shorten'|'formal'|'simplify', locale, text, requestKey }
 *      { mode: 'translate', id, kind, content, title, to: 'tr'|'en', requestKey }
 *      { mode: 'letter', locale, subject?, facts, recipient?, projectName?, requestKey } (Antetli yazı / Bilgilendirme)
 * Returns a SUGGESTION. It writes nothing to the document; the admin applies it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => t > now - 3_600_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 60;
}

const KEY = /^[A-Za-z0-9-]{8,80}$/;

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let mock = false;
  try {
    mock = mockEnabled();
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 503 });
  }
  if (!hasOpenAIKey() && !mock) return NextResponse.json({ ok: false, error: 'Yapay zekâ kurulu değil: sunucuda OPENAI_API_KEY tanımlı değil (Ayarlar → Yapay zekâ). Belgeyi elle doldurabilirsiniz.' }, { status: 503 });
  if (rateLimited(admin.id)) return NextResponse.json({ ok: false, error: 'Saatlik sınır doldu, biraz sonra tekrar deneyin.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = body.mode === 'rewrite' ? 'rewrite' : body.mode === 'translate' ? 'translate' : body.mode === 'draft' ? 'draft' : body.mode === 'letter' ? 'letter' : null;
  if (!mode) return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  if (typeof body.requestKey !== 'string' || !KEY.test(body.requestKey)) return NextResponse.json({ ok: false, error: 'İstek anahtarı eksik.' }, { status: 400 });
  const locale: DocLocale = body.locale === 'en' ? 'en' : 'tr';
  const kind = String(body.kind ?? 'quote') as DocKind;
  if (!(DOC_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ ok: false, error: 'Geçersiz belge türü.' }, { status: 400 });

  // Validate input before any cost is incurred.
  if (mode === 'draft' && (typeof body.brief !== 'string' || body.brief.trim().length < 10)) return NextResponse.json({ ok: false, error: 'Kısa bir açıklama yazın (en az 10 karakter): ne isteniyor, süre, ödeme koşulları…' }, { status: 400 });
  if (mode === 'letter' && (typeof body.facts !== 'string' || body.facts.trim().length < 10)) return NextResponse.json({ ok: false, error: 'Yapılan işi veya iletmek istediğiniz bilgiyi yazın (en az 10 karakter). Yapay zekâ yalnızca bu bilgilere dayanır.' }, { status: 400 });
  if (mode === 'rewrite' && (typeof body.text !== 'string' || !body.text.trim())) return NextResponse.json({ ok: false, error: 'Düzenlenecek metni seçin.' }, { status: 400 });
  const op = (['shorten', 'formal', 'simplify'] as const).includes(body.op as RewriteOp) ? (body.op as RewriteOp) : null;
  if (mode === 'rewrite' && !op) return NextResponse.json({ ok: false, error: 'Geçersiz işlem.' }, { status: 400 });
  if (mode === 'translate' && body.to !== 'tr' && body.to !== 'en') return NextResponse.json({ ok: false, error: 'Hedef dil seçin.' }, { status: 400 });
  if (mode === 'translate') {
    // The document must exist and be readable by this admin.
    const client = getSupabaseAsUser(bearerToken(request));
    const id = String(body.id ?? '');
    const ok = client && /^[0-9a-f-]{36}$/i.test(id) ? (await client.from('doc_documents').select('id').eq('id', id).maybeSingle()).data : null;
    if (!ok) return NextResponse.json({ ok: false, error: 'Belge bulunamadı.' }, { status: 404 });
  }

  const settings = await getAiSettings();
  const check = checkModel(settings, resolveModel(settings, 'text'), 'text', mock);
  if (!check.ok) return NextResponse.json({ ok: false, error: check.message }, { status: 503 });
  const model = check.model;
  const startedAt = Date.now();
  let runId: string;
  try {
    const start = await startRun({ action: `doc_${mode}`, kind: 'text', model, locale, createdBy: admin.email ?? admin.id, idempotencyKey: `doc-${body.requestKey}` }, settings, mock);
    if (start.kind === 'replay') {
      if (start.status === 'error' || !start.result) return NextResponse.json({ ok: false, error: start.error ?? 'Önceki deneme başarısız oldu; yeniden deneyin.' }, { status: 409 });
      return NextResponse.json({ ok: true, replay: true, ...(start.result as object) });
    }
    runId = start.runId;
  } catch (error) {
    const e = error instanceof OpenAIError ? error : new OpenAIError('Yapay zekâ isteği başlatılamadı.', 500);
    return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: e.status });
  }

  try {
    let result: Record<string, unknown>;
    let usage: object | undefined;
    let requestId: string | undefined;
    let isMock = false;
    if (mode === 'draft') {
      const r = await draftDocument(model, { kind, locale, brief: String(body.brief), recipient: String(body.recipient ?? '').slice(0, 300), projectName: String(body.projectName ?? '').slice(0, 200) });
      result = { suggestion: cleanDraft(kind, r.data) };
      usage = r.usage; requestId = r.requestId; isMock = Boolean(r.mock);
    } else if (mode === 'letter') {
      const facts = String(body.facts).slice(0, 6000);
      const subject = String(body.subject ?? '').slice(0, 300);
      const recipient = String(body.recipient ?? '').slice(0, 300);
      const projectName = String(body.projectName ?? '').slice(0, 200);
      const r = await letterText(model, { locale, subject, facts, recipient, projectName, format: body.format === 'email' ? 'email' : 'letter' });
      result = { suggestion: cleanLetter([subject, facts, recipient, projectName].join('\n'), r.data) };
      usage = r.usage; requestId = r.requestId; isMock = Boolean(r.mock);
    } else if (mode === 'rewrite') {
      const r = await rewriteText(model, { op: op as RewriteOp, locale, text: String(body.text).slice(0, 8000) });
      const text = typeof r.data?.text === 'string' ? r.data.text.trim() : '';
      if (!text) throw new OpenAIError('Yapay zekâ boş metin döndürdü; metniniz değişmedi.', 502, 'invalid_output');
      const before = new Set(moneyMentions(String(body.text)));
      const added = moneyMentions(text).filter((m) => !before.has(m));
      result = { suggestion: { text, changes: (r.data.changes ?? []).slice(0, 10), warnings: added.length ? [`Önerilen metinde yeni tutar var (${added.join(', ')}); kontrol edin.`] : [] } };
      usage = r.usage; requestId = r.requestId; isMock = Boolean(r.mock);
    } else {
      const from = locale;
      const to = body.to as DocLocale;
      const c = sanitizeContent(body.content, kind);
      const payload = {
        title: String(body.title ?? '').slice(0, 200), subject: c.subject, deliveryTime: c.deliveryTime,
        blocks: c.blocks.map((b) => ({ id: b.id, heading: b.heading, body: b.body })),
        items: c.items.map((i) => ({ id: i.id, title: i.title, description: i.description, unit: i.unit })),
        payment: c.payment.map((p) => ({ id: p.id, label: p.label, due: p.due })),
      };
      const r = await translateDocument(model, { from, to, payload });
      result = { suggestion: { ...r.data, to } };
      usage = r.usage; requestId = r.requestId; isMock = Boolean(r.mock);
    }
    await finishRun(runId, { status: isMock ? 'mock' : 'ok', usage: usage as never, model, kind: 'text', settings, result, requestId, startedAt });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const e = error instanceof OpenAIError ? error : new OpenAIError(`Yapay zekâ isteği başarısız: ${(error as Error).message.slice(0, 160)} Belgeniz değişmedi.`, 502);
    await finishRun(runId, { status: 'error', usage: (error as { usage?: object }).usage as never, model, kind: 'text', settings, error: e.message, startedAt });
    return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 });
  }
}
