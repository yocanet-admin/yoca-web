-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v11: visitors read only what the site shows
-- Run in the Supabase SQL editor after v10 Part A (safe to re-run).
--
-- Until now "public read case studies" and "public read team" used
-- `using (true)`: anyone with the public anon key could read HIDDEN
-- projects and team members through the API, even though the site
-- never shows them. After this file:
--   anon (visitors)      → only rows with is_active = true
--   authenticated admins → all rows (unchanged: "auth manage …" policies)
--   service role (server)→ all rows (bypasses RLS; the site reads hidden
--                          project slugs this way, never their content)
-- Nothing is deleted; no data changes. Undo: supabase/rollback-v11.sql
--
-- Guard: stops without changes if the live policies are not what this file
-- expects (pre-v11 "using (true)" or already v11). Then compare with
-- supabase/checks/preflight.sql output before deciding.
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
declare
  p record;
begin
  for p in select tablename, policyname, roles::text[] as roles, cmd, qual from pg_policies
            where schemaname = 'public' and policyname in ('public read case studies', 'public read team') loop
    if p.cmd <> 'SELECT' or p.roles <> array['anon', 'authenticated'] or p.qual not in ('true', '(is_active = true)') then
      raise exception 'v11 durduruldu: % üzerindeki "%" beklenenden farklı (roles=%, using=%). Önce inceleyin.',
        p.tablename, p.policyname, p.roles, p.qual;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('case_studies', 'team_members')
              and cmd = 'SELECT' and policyname not in ('public read case studies', 'public read team')
              and ('anon' = any (roles) or 'public' = any (roles))) then
    raise exception 'v11 durduruldu: case_studies/team_members üzerinde ziyaretçilere açık başka bir okuma politikası var; v11 sızıntıyı kapatmaz.';
  end if;
end;
$$;

drop policy if exists "public read case studies" on public.case_studies;
create policy "public read case studies"
  on public.case_studies for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "public read team" on public.team_members;
create policy "public read team"
  on public.team_members for select
  to anon, authenticated
  using (is_active = true);

commit;

-- Check (as a visitor this should list only active slugs):
--   set role anon; select slug, is_active from public.case_studies; reset role;
