-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v7: "venture" work type (Yoca ventures such as Cleova).
-- Run once in the Supabase SQL editor BEFORE importing the default
-- projects from /admin/work (the import includes a venture project).
-- ═══════════════════════════════════════════════════════════════
alter table public.case_studies drop constraint if exists case_studies_kind_check;
alter table public.case_studies
  add constraint case_studies_kind_check
  check (kind in ('client', 'concept', 'product', 'experimental', 'venture'));
