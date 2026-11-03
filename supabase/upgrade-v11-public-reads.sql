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
-- Nothing is deleted; no data changes.
-- ═══════════════════════════════════════════════════════════════

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

-- Check (as a visitor this should list only active slugs):
--   set role anon; select slug, is_active from public.case_studies; reset role;
