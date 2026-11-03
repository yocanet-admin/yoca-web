-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v14 (content): Insights studio, AI ledger, images,
-- case-study results, verified team cards, site settings defaults
--
-- NOT APPLIED ANYWHERE (no live, preview or staging database). It was only
-- run against a throw-away local Postgres 16 with stub auth/storage schemas
-- (see the test notes in the branch report). Running it on the live project
-- is a separate, explicit decision of the owner (see YAYIN-SIRASI.md).
--
-- Requires: v6 (insights, insight_revisions, ai_runs), v9 (cockpit_settings,
-- audit), v10 PART A (public.is_admin()), v11 (public read team). Safe to
-- re-run (idempotent). Nothing is deleted; no existing row data changes,
-- except: team cards stop being PUBLIC until a member is marked verified
-- (the visitor policy "public read team" now also requires verified = true).
--
-- New admin policies are written with public.is_admin() directly.
-- Visitor (anon) policies exist only for published data:
--   • team_members: active AND verified rows
--   • storage "team-photos": public read BY URL (needed to show a photo on a
--     verified card). An uploaded photo of an unverified member is therefore
--     reachable by anyone who has its exact URL — upload only photos the
--     person agreed to publish.
-- Everything else here is admin-only (or service role only).
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'v14 durduruldu: public.is_admin() yok. Önce v10 PART A çalıştırılmalı.';
  end if;
  if to_regclass('public.ai_runs') is null or to_regclass('public.insight_revisions') is null then
    raise exception 'v14 durduruldu: v6 (insights) tabloları yok.';
  end if;
  if to_regclass('public.cockpit_settings') is null then
    raise exception 'v14 durduruldu: v9 (cockpit_settings) yok.';
  end if;
end;
$$;

-- ── 1. AI run ledger: real usage, estimated cost, idempotency ─────
alter table public.ai_runs
  add column if not exists kind text not null default 'text',
  add column if not exists tokens_cached int,
  add column if not exists tokens_reasoning int,
  add column if not exists images int,
  add column if not exists est_cost_usd numeric(12, 6),
  add column if not exists idempotency_key text,
  add column if not exists request_id text,
  add column if not exists duration_ms int,
  add column if not exists result jsonb,
  add column if not exists finished_at timestamptz;
create unique index if not exists ai_runs_idempotency_idx on public.ai_runs (idempotency_key) where idempotency_key is not null;
create index if not exists ai_runs_created_idx on public.ai_runs (created_at desc);
-- status values used by the app: running | ok | error | mock
-- RLS: v6 "auth read ai runs" (+ is_admin() via v12). Writes: service role only.
-- result jsonb holds AI output for idempotent replays (admin-only, like the drafts).

-- ── 2. Revisions: AI proposals, restores, publish snapshots ───────
alter table public.insight_revisions
  add column if not exists kind text not null default 'snapshot',
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists created_by text,
  add column if not exists ai_run_id uuid references public.ai_runs(id) on delete set null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'insight_revisions_kind_check') then
    alter table public.insight_revisions add constraint insight_revisions_kind_check
      check (kind in ('snapshot', 'ai_proposal', 'restore', 'autosave', 'publish'));
  end if;
end;
$$;

-- ── 3. Insight images (private until published) ───────────────────
create table if not exists public.insight_images (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid references public.insights(id) on delete set null,
  group_id uuid,
  bucket text not null default 'insight-drafts' check (bucket in ('insight-drafts')),
  path text not null,
  public_url text,                -- set when the publish route copied it to "insights"
  kind text not null check (kind in ('generated', 'alternative', 'edited', 'upload', 'crop')),
  origin text not null default 'ai' check (origin in ('ai', 'upload', 'crop')),
  prompt text,
  brief text,
  model text,
  size text,
  width int,
  height int,
  parent_id uuid references public.insight_images(id) on delete set null,
  selected boolean not null default false,   -- the chosen cover of the group
  alt_text text not null default '',
  crop text,                                 -- e.g. 1200x630, 1080x1080
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists insight_images_group_idx on public.insight_images (group_id, created_at desc);
alter table public.insight_images enable row level security;
drop policy if exists "admin manage insight images" on public.insight_images;
create policy "admin manage insight images" on public.insight_images
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Draft image access policy (proposal implemented here):
--   • bucket "insight-drafts" is PRIVATE: no anon read, admins only via
--     is_admin(); the admin UI shows short-lived (1 h) signed URLs.
--   • the server (service role) writes AI/uploaded/cropped images here at
--     once from the base64 API response — temporary OpenAI URLs are never kept.
--   • only images an article actually uses (selected cover, its 1200×630
--     crop, yoca-image: references in the body) are copied to the PUBLIC
--     "insights" bucket, and only by the explicit Yayınla / Zamanla route.
--   • unused drafts stay private; nothing deletes them automatically.
insert into storage.buckets (id, name, public) values ('insight-drafts', 'insight-drafts', false)
on conflict (id) do update set public = false;
drop policy if exists "admin read insight drafts" on storage.objects;
create policy "admin read insight drafts" on storage.objects for select to authenticated
  using (bucket_id = 'insight-drafts' and public.is_admin());
drop policy if exists "admin write insight drafts" on storage.objects;
create policy "admin write insight drafts" on storage.objects for insert to authenticated
  with check (bucket_id = 'insight-drafts' and public.is_admin());
drop policy if exists "admin update insight drafts" on storage.objects;
create policy "admin update insight drafts" on storage.objects for update to authenticated
  using (bucket_id = 'insight-drafts' and public.is_admin());
drop policy if exists "admin delete insight drafts" on storage.objects;
create policy "admin delete insight drafts" on storage.objects for delete to authenticated
  using (bucket_id = 'insight-drafts' and public.is_admin());

-- ── 4. Case-study results (admin only; public page reads approved rows
--       through the server, never the evidence fields) ────────────
create table if not exists public.case_study_results (
  id uuid primary key default gen_random_uuid(),
  case_slug text not null,
  locale text not null default 'all' check (locale in ('all', 'tr', 'en', 'az', 'ar')),
  metric_name text not null default '',
  metric_value text not null default '',
  period text not null default '',
  baseline text not null default '',
  source_basis text not null default '',
  testimonial_text text not null default '',
  testimonial_author text not null default '',
  testimonial_author_title text not null default '',
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected', 'withdrawn')),
  approval_date date,
  publication_scope text[] not null default '{}',
  evidence_note text not null default '',
  evidence_path text,             -- object in the PRIVATE bucket "case-evidence"
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint case_results_scope_check check (publication_scope <@ array['site', 'proposals', 'social', 'press']::text[]),
  constraint case_results_approved_date check (approval_status <> 'approved' or approval_date is not null),
  constraint case_results_has_content check (metric_name <> '' or testimonial_text <> '')
);
create index if not exists case_study_results_slug_idx on public.case_study_results (case_slug, sort_order);
alter table public.case_study_results enable row level security;
drop policy if exists "admin manage case results" on public.case_study_results;
create policy "admin manage case results" on public.case_study_results
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists case_study_results_touch on public.case_study_results;
create trigger case_study_results_touch before update on public.case_study_results
  for each row execute function public.touch_updated_at();
do $$
begin
  if to_regprocedure('public.audit_row()') is not null then
    execute 'drop trigger if exists audit_case_study_results on public.case_study_results';
    execute 'create trigger audit_case_study_results after insert or update or delete on public.case_study_results for each row execute function public.audit_row()';
  end if;
end;
$$;

insert into storage.buckets (id, name, public) values ('case-evidence', 'case-evidence', false)
on conflict (id) do update set public = false;
drop policy if exists "admin read case evidence" on storage.objects;
create policy "admin read case evidence" on storage.objects for select to authenticated
  using (bucket_id = 'case-evidence' and public.is_admin());
drop policy if exists "admin write case evidence" on storage.objects;
create policy "admin write case evidence" on storage.objects for insert to authenticated
  with check (bucket_id = 'case-evidence' and public.is_admin());
drop policy if exists "admin delete case evidence" on storage.objects;
create policy "admin delete case evidence" on storage.objects for delete to authenticated
  using (bucket_id = 'case-evidence' and public.is_admin());

-- ── 5. Team: verified cards only ───────────────────────────────────
alter table public.team_members
  add column if not exists bio text not null default '',
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists name_confirmed boolean not null default false,
  add column if not exists role_confirmed boolean not null default false,
  add column if not exists photo_confirmed boolean not null default false,
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'team_members_verified_check') then
    alter table public.team_members add constraint team_members_verified_check
      check (not verified or (name_confirmed and role_confirmed and photo_confirmed));
  end if;
end;
$$;
-- Visitors see only active AND verified members (was: active).
drop policy if exists "public read team" on public.team_members;
create policy "public read team" on public.team_members for select to anon, authenticated
  using (is_active = true and verified = true);
-- Admins still see every row (v12 admin policy, or this one).
drop policy if exists "admin read team" on public.team_members;
create policy "admin read team" on public.team_members for select to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public) values ('team-photos', 'team-photos', true)
on conflict (id) do nothing;
drop policy if exists "public read team photos" on storage.objects;
create policy "public read team photos" on storage.objects for select using (bucket_id = 'team-photos');
drop policy if exists "admin write team photos" on storage.objects;
create policy "admin write team photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'team-photos' and public.is_admin());
drop policy if exists "admin update team photos" on storage.objects;
create policy "admin update team photos" on storage.objects for update to authenticated
  using (bucket_id = 'team-photos' and public.is_admin());
drop policy if exists "admin delete team photos" on storage.objects;
create policy "admin delete team photos" on storage.objects for delete to authenticated
  using (bucket_id = 'team-photos' and public.is_admin());

-- ── 6. Settings defaults (only when missing; existing values kept) ─
-- site_copy:      response targets; "approved" = "Süreleri sitede göster
--                 (sahip onayı)", default false → neutral texts on the site.
-- company_info:   only facts already known. siteAddress is the address SHOWN
--                 on the site, NOT the legal/notice address; every official
--                 field stays empty ("tamamlanacak").
-- kvkk_published: the notice is linked as final only when true (default false).
-- about_intro:    the About text suggestion, stored as a DRAFT (not shown).
insert into public.cockpit_settings (key, value) values
  ('site_copy', '{"approved": false, "contactDays": 1, "checkupDays": 3, "holidays": []}'::jsonb),
  ('company_info', jsonb_build_object(
     'brand', 'Yoca', 'website', 'https://yoca.net', 'generalEmail', 'connect@yoca.net',
     'siteAddress', 'Bağdat Caddesi, No: 131, Kadıköy / İstanbul',
     'controllerName', '', 'controllerType', '', 'officialAddress', '', 'dataRequestChannel', '',
     'kep', '', 'mersis', '', 'tradeRegistry', '', 'taxOffice', '', 'taxNumber', '',
     'noticeVersion', '', 'noticeUpdatedAt', '', 'legalReviewDone', false)),
  ('kvkk_published', '{"published": false, "publishedAt": null, "publishedBy": null}'::jsonb),
  ('about_intro', jsonb_build_object('status', 'draft', 'text', jsonb_build_object('tr',
     'Yoca’da marka, tasarım, yazılım ve pazarlama çalışmalarını projenin ihtiyacına göre bir araya getiriyoruz. Başlangıçta kapsamı ve teslimleri belirliyor, çalışma boyunca ilerlemeyi paylaşıyoruz.')))
on conflict (key) do nothing;

commit;

-- Undo (only if ever needed; drops new objects, keeps all pre-v14 data):
--   drop table public.case_study_results; drop table public.insight_images;
--   alter table public.team_members drop column verified … (and restore
--   "public read team" using (is_active = true) — this RE-PUBLISHES unverified cards).
