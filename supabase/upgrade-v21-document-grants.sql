-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v21 (Teklifler ve Belgeler: TRUNCATE yetkisi kapatılır)
--
-- Supabase's default privileges gave the `authenticated` role TRUNCATE on the
-- document tables. TRUNCATE is not covered by row level security and does not
-- fire the row-level "no delete" guards, so it must not be granted to client
-- roles at all, even though the panel and the API never use it.
--
-- This file ONLY revokes TRUNCATE from `anon` and `authenticated` on the
-- document tables. Nothing else changes:
--   - no table is emptied, no row is deleted or changed;
--   - SELECT / UPDATE needed by the panel stay as they are (RLS + is_admin());
--   - `service_role` and the owner keep their privileges (server-side jobs,
--     storage cleanup);
--   - the security-definer doc_* functions are not touched.
-- Revoking a privilege that is not held is a no-op, so the file is safe to
-- re-run.
--
-- Check before / after (read-only):
--   select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name like 'doc\_%' and grantee in ('anon', 'authenticated')
--   group by table_name, grantee order by 1, 2;
-- Expected after: no TRUNCATE for anon / authenticated.
--
-- Undo (not recommended): grant truncate on <table> to authenticated;
-- ═══════════════════════════════════════════════════════════════

begin;

revoke truncate on
  public.doc_documents,
  public.doc_versions,
  public.doc_events,
  public.doc_counters,
  public.doc_company_revisions,
  public.doc_renders,
  public.doc_emails
from anon, authenticated;

commit;
