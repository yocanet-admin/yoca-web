import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { sanitizeContent } from '@/lib/documents/model';
import { contentOf, dbError, DOC_BUCKET, loadContext, safeFileName, selectedBanks, type DocRow } from '@/lib/documents/server';
import { renderDocumentPdf } from '@/lib/documents/pdf';

/**
 * Yoca — document PDFs (admin only).
 * POST { id, title?, content? } → draft PDF (application/pdf), rendered from
 *   the editor's current text (unsaved changes included) and marked
 *   "TASLAK" on every page. Nothing is stored.
 * GET ?id=…&version=n → { url } a 5-minute signed link to the stored PDF of
 *   a finalized version (private bucket; never a public link).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unauthorized = () => NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized();
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return NextResponse.json({ ok: false, error: 'Supabase yapılandırılmamış.' }, { status: 503 });
  const id = request.nextUrl.searchParams.get('id') ?? '';
  const version = Number(request.nextUrl.searchParams.get('version'));
  if (!UUID.test(id) || !Number.isInteger(version) || version < 1) return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  const v = await client.from('doc_versions').select('pdf_path, number, version').eq('document_id', id).eq('version', version).maybeSingle();
  if (v.error) { const e = dbError(v.error); return NextResponse.json({ ok: false, error: e.error }, { status: e.status }); }
  if (!v.data) return NextResponse.json({ ok: false, error: 'Bu sürüm bulunamadı.' }, { status: 404 });
  const row = v.data as { pdf_path: string; number: string; version: number };
  const signed = await client.storage.from(DOC_BUCKET).createSignedUrl(row.pdf_path, 300, { download: `${safeFileName(row.number)}-v${row.version}.pdf` });
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ ok: false, error: 'İndirme bağlantısı oluşturulamadı.' }, { status: 502 });
  return NextResponse.json({ ok: true, url: signed.data.signedUrl, expiresIn: 300 });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized();
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return NextResponse.json({ ok: false, error: 'Supabase yapılandırılmamış.' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; title?: string; content?: unknown };
  if (!body.id || !UUID.test(body.id)) return NextResponse.json({ ok: false, error: 'bad id' }, { status: 400 });
  const got = await client.from('doc_documents').select('*').eq('id', body.id).maybeSingle();
  if (got.error) { const e = dbError(got.error); return NextResponse.json({ ok: false, error: e.error }, { status: e.status }); }
  if (!got.data) return NextResponse.json({ ok: false, error: 'Belge bulunamadı.' }, { status: 404 });
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
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: `PDF üretilemedi: ${(error as Error).message.slice(0, 200)}` }, { status: 500 });
  }
}
