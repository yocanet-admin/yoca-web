-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v24 (Operasyon: TRUNCATE yetkisi kapatılır)
--
-- Supabase's default privileges gave the `authenticated` role TRUNCATE on the
-- Operasyon tables. TRUNCATE is not covered by row level security and does
-- not fire row triggers, so it must not be granted to client roles at all;
-- the panel and the API never use it. v23 already did this for
-- ops_notifications; this file does the same for the other 12 ops_* tables
-- (the same change v21 made for the document tables).
--
-- This file ONLY revokes TRUNCATE from `anon` and `authenticated`. Nothing
-- else changes:
--   - no table is emptied, no row is deleted or changed;
--   - SELECT / INSERT / UPDATE / DELETE used by the panel stay as they are
--     (RLS + is_admin());
--   - `service_role` and `postgres` keep all their privileges;
--   - policies, triggers and functions are not touched.
-- Revoking a privilege that is not held is a no-op, so the file is safe to
-- re-run.
--
-- Check before / after (read-only):
--   select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name like 'ops\_%' and grantee in ('anon', 'authenticated')
--   group by table_name, grantee order by 1, 2;
-- Expected after: no TRUNCATE for anon / authenticated on any ops_* table;
-- authenticated keeps DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE.
--
-- Undo (not recommended): grant truncate on <table> to authenticated;
-- ═══════════════════════════════════════════════════════════════

begin;

revoke truncate on
  public.ops_documents,
  public.ops_license_links,
  public.ops_license_ops,
  public.ops_payments,
  public.ops_periods,
  public.ops_projects,
  public.ops_provider_accounts,
  public.ops_service_links,
  public.ops_service_relations,
  public.ops_services,
  public.ops_tasks,
  public.ops_work_logs
from anon, authenticated;

commit;
