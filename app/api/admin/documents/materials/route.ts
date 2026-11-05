import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { loadContext } from '@/lib/documents/server';
import { renderBusinessCardPdf, renderLetterheadPdf } from '@/lib/documents/pdf';

/**
 * Yoca — Kurumsal materyaller (admin only). Outputs from the CURRENT company
 * profile and the existing team records; no document number, no
 * finalization, nothing stored.
 * GET  → { issuer, companyRevision, team, clients, projects }
 * POST { kind: 'letterhead', locale } → blank letterhead PDF (A4)
 * POST { kind: 'card', name, title, phone, email, website, bleedMm } → business card PDF
 *   (phone / e-mail / title are edited in the panel and not stored).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return fail(401, 'unauthorized');
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return fail(503, 'Supabase yapılandırılmamış.');
  const [ctx, team, clients, projects] = await Promise.all([
    loadContext(client),
    client.from('team_members').select('id, name, role, is_active, order_index').order('order_index'),
    client.from('clients').select('id, name, legal_name, brand_name, contact_name, email, archived_at').order('name'),
    client.from('ops_projects').select('id, client_id, name, status, archived_at').order('name'),
  ]);
  return NextResponse.json({
    ok: true, issuer: ctx.issuer, companyRevision: ctx.revision,
    team: team.error ? [] : team.data ?? [],
    clients: clients.error ? [] : clients.data ?? [],
    projects: projects.error ? [] : projects.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return fail(401, 'unauthorized');
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return fail(503, 'Supabase yapılandırılmamış.');
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ctx = await loadContext(client);
  try {
    if (body.kind === 'letterhead') {
      const pdf = await renderLetterheadPdf(ctx.issuer, body.locale === 'en' ? 'en' : 'tr');
      return new NextResponse(new Uint8Array(pdf.buffer), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="yoca-antetli-kagit.pdf"', 'Cache-Control': 'no-store', 'X-Company-Revision': String(ctx.revision) } });
    }
    if (body.kind === 'card') {
      const name = str(body.name, 80);
      if (!name) return fail(400, 'Kartvizit için ad soyad yazın.');
      const bleed = Number(body.bleedMm);
      const pdf = await renderBusinessCardPdf({
        name, title: str(body.title, 80), phone: str(body.phone, 40), email: str(body.email, 120),
        website: str(body.website, 120), bleedMm: Number.isFinite(bleed) ? Math.max(0, Math.min(5, bleed)) : 3,
      });
      const file = `yoca-kartvizit-${name.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'kisi'}.pdf`;
      return new NextResponse(new Uint8Array(pdf.buffer), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}"`, 'Cache-Control': 'no-store' } });
    }
  } catch (error) {
    return fail(500, `PDF üretilemedi: ${(error as Error).message.slice(0, 160)}`);
  }
  return fail(400, 'bad request');
}
