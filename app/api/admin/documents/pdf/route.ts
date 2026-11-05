import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { sanitizeContent } from '@/lib/documents/model';
import { contentOf, currentRenderOf, dbError, DOC_BUCKET, loadContext, safeFileName, selectedBanks, type DocRow } from '@/lib/documents/server';
import { renderDocumentPdf } from '@/lib/documents/pdf';

/**
 * Yoca — document PDFs (admin only; private bucket, 5-minute signed links).
 *
 * POST { id, title?, content? } → draft PDF bytes ("TASLAK" on every page),
 *   from the editor's current text and the CURRENT company profile. Not stored.
 * GET ?id=…[&version=n] → { url } normal download of a finalized version:
 *   frozen content of that version + the CURRENT company profile. Rendered
 *   once per company profile revision and template version and kept.
 * GET ?render=<uuid> → { url } a past PDF exactly as it was produced
 *   ("Geçmiş PDF"); never regenerated.
 * Files people already downloaded or sent are not changed by any of this.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unauthorized = () => NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized();
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return fail(503, 'Supabase yapılandırılmamış.');
  const sp = request.nextUrl.searchParams;

  const renderId = sp.get('render');
  if (renderId) {
    if (!UUID.test(renderId)) return fail(400, 'bad request');
    const r = await client.from('doc_renders').select('pdf_path, version, company_revision, document_id').eq('id', renderId).maybeSingle();
    if (r.error) { const e = dbError(r.error); return fail(e.status, e.error); }
    if (!r.data) return fail(404, 'Bu PDF bulunamadı.');
    const row = r.data as { pdf_path: string; version: number; company_revision: number; document_id: string };
    const num = ((await client.from('doc_documents').select('number').eq('id', row.document_id).maybeSingle()).data as { number: string } | null)?.number ?? 'belge';
    const signed = await client.storage.from(DOC_BUCKET).createSignedUrl(row.pdf_path, 300, { download: `${safeFileName(num)}-v${row.version}-sirket-r${row.company_revision}.pdf` });
    if (signed.error || !signed.data?.signedUrl) return fail(502, 'İndirme bağlantısı oluşturulamadı.');
    return NextResponse.json({ ok: true, url: signed.data.signedUrl, expiresIn: 300, history: true });
  }

  const id = sp.get('id') ?? '';
  if (!UUID.test(id)) return fail(400, 'bad request');
  const d = await client.from('doc_documents').select('id, number, final_version').eq('id', id).maybeSingle();
  if (d.error) { const e = dbError(d.error); return fail(e.status, e.error); }
  if (!d.data) return fail(404, 'Belge bulunamadı.');
  const doc = d.data as { id: string; number: string; final_version: number };
  const version = sp.get('version') ? Number(sp.get('version')) : doc.final_version;
  if (!Number.isInteger(version) || version < 1 || version > doc.final_version) return fail(404, 'Kesinleşmiş sürüm yok; taslak PDF’i önizlemeden indirin.');
  const ctx = await loadContext(client);
  const out = await currentRenderOf(client, id, version, ctx, getSupabaseServiceRole());
  if (!out.ok) return fail(out.status, out.error);
  const signed = await client.storage.from(DOC_BUCKET).createSignedUrl(out.path, 300, { download: `${safeFileName(doc.number)}-v${version}.pdf` });
  if (signed.error || !signed.data?.signedUrl) return fail(502, 'İndirme bağlantısı oluşturulamadı.');
  return NextResponse.json({ ok: true, url: signed.data.signedUrl, expiresIn: 300, companyRevision: ctx.revision, reused: out.reused });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized();
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return fail(503, 'Supabase yapılandırılmamış.');
  const body = (await request.json().catch(() => ({}))) as { id?: string; title?: string; content?: unknown };
  if (!body.id || !UUID.test(body.id)) return fail(400, 'bad id');
  const got = await client.from('doc_documents').select('*').eq('id', body.id).maybeSingle();
  if (got.error) { const e = dbError(got.error); return fail(e.status, e.error); }
  if (!got.data) return fail(404, 'Belge bulunamadı.');
  const row = got.data as DocRow;
  const ctx = await loadContext(client);
  const content = body.content !== undefined ? sanitizeContent(body.content, row.kind) : contentOf(row);
  const title = typeof body.title === 'string' ? body.title.slice(0, 200) : row.title;
  let sourceNumber: string | null = null;
  if (row.source_id) sourceNumber = ((await client.from('doc_documents').select('number').eq('id', row.source_id).maybeSingle()).data as { number: string } | null)?.number ?? null;
  try {
    const pdf = await renderDocumentPdf({ kind: row.kind, number: row.number, title: title || '(başlıksız)', content, issuer: ctx.issuer, bankAccounts: selectedBanks(content, ctx.settings, row.kind), mode: 'draft', sourceNumber });
    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeFileName(row.number)}-taslak.pdf"`,
        'Cache-Control': 'no-store',
        'X-Pdf-Pages': String(pdf.pages),
        'X-Company-Revision': String(ctx.revision),
      },
    });
  } catch (error) {
    return fail(500, `PDF üretilemedi: ${(error as Error).message.slice(0, 200)}`);
  }
}
