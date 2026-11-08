-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v27 (Kokpit SEO, Faz 0: yoca.net)
--
-- Additive only: new tables, nothing existing is changed or dropped.
-- All tables are admin-only (public.is_admin(); the finance role and
-- everyone else get nothing), like the other cockpit tables.
--
--   seo_sites           one row per site; only yoca.net is seeded. client_id
--                       (nullable) is the later link to a client record — no
--                       client site is connected in this phase.
--   seo_keywords        target keyword ↔ page mapping (keyword, language,
--                       country, target path on the site, source, status
--                       proposed / active / paused, note). Audit-logged.
--   seo_weekly          weekly Search Console record per COMPLETED week
--                       (Monday start, final data, one fixed filter set):
--                       site totals, top 250 queries, top 250 pages and the
--                       active target keywords — clicks, impressions, CTR,
--                       average position, days_with_data, data_through.
--                       Daily raw data, rows outside the top 250 and
--                       anonymised queries are NOT stored.
--   seo_audit_runs      one limited technical audit run (allowlisted hosts)
--   seo_audit_findings  its findings (url, check, severity, message)
--   seo_pagespeed       PageSpeed Insights results; LAB (Lighthouse) and
--                       FIELD (CrUX, p75) in separate columns + field_scope
--                       (url / origin / none)
--   seo_ai_suggestions  AI suggestions requested by an admin (display only;
--                       nothing is published or written to the site)
--
-- Requires v9 (audit_row), v10 Part A (is_admin), v8 (clients).
-- Idempotent; safe to re-run. Undo: supabase/rollback-v27-seo.sql
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regprocedure('public.is_admin()') is null then raise exception 'v27 durduruldu: public.is_admin() yok (v10 gerekli).'; end if;
  if to_regprocedure('public.audit_row()') is null then raise exception 'v27 durduruldu: public.audit_row() yok (v9 gerekli).'; end if;
  if to_regclass('public.clients') is null then raise exception 'v27 durduruldu: public.clients yok (v8 gerekli).'; end if;
end;
$$;

create table if not exists public.seo_sites (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (domain ~ '^[a-z0-9.-]+$'),
  gsc_property text not null,
  client_id uuid references public.clients(id) on delete set null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.seo_sites(id) on delete cascade,
  keyword text not null check (length(btrim(keyword)) between 1 and 200),
  language text not null check (language in ('tr', 'en', 'az', 'ar')),
  -- ISO 3166-1 alpha-3, lower case, as Search Console reports it ('tur'); '' = all countries
  country text not null default '' check (country = '' or country ~ '^[a-z]{3}$'),
  target_path text not null check (target_path ~ '^/[^\s]*$' and length(target_path) <= 300),
  source text not null check (source in ('gsc', 'suggested', 'manual')),
  status text not null default 'proposed' check (status in ('proposed', 'active', 'paused')),
  note text not null default '' check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text
);
create unique index if not exists seo_keywords_unique on public.seo_keywords (site_id, lower(keyword), language, country);

create table if not exists public.seo_weekly (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.seo_sites(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  dimension text not null check (dimension in ('total', 'query', 'page', 'keyword')),
  key text not null default '',
  -- canonical filter set, e.g. 'country=all;device=all;type=web;state=final'
  filters text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric(8, 6) not null default 0,
  position numeric(8, 3),
  days_with_data smallint not null check (days_with_data between 0 and 7),
  data_through date,
  fetched_at timestamptz not null default now(),
  unique (site_id, week_start, dimension, key, filters)
);
create index if not exists seo_weekly_site_week on public.seo_weekly (site_id, week_start desc);

create table if not exists public.seo_audit_runs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.seo_sites(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'done', 'partial', 'failed')),
  pages_planned integer not null default 0,
  pages_checked integer not null default 0,
  limit_reason text,
  source text not null default 'live' check (source in ('live', 'fixture')),
  triggered_by text,
  summary jsonb not null default '{}'::jsonb
);

create table if not exists public.seo_audit_findings (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.seo_audit_runs(id) on delete cascade,
  url text not null,
  check_key text not null,
  severity text not null check (severity in ('error', 'warning', 'info', 'ok')),
  message text not null,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists seo_audit_findings_run on public.seo_audit_findings (run_id);

create table if not exists public.seo_pagespeed (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.seo_sites(id) on delete cascade,
  url text not null,
  strategy text not null check (strategy in ('mobile', 'desktop')),
  fetched_at timestamptz not null default now(),
  -- LAB: Lighthouse, one simulated run
  lab_perf_score numeric(5, 2),
  lab_lcp_ms numeric(10, 1),
  lab_cls numeric(8, 4),
  lab_tbt_ms numeric(10, 1),
  -- FIELD: Chrome UX Report, p75 of the last 28 days; scope says whose data it is
  field_scope text not null check (field_scope in ('url', 'origin', 'none')),
  field_lcp_p75_ms numeric(10, 1),
  field_inp_p75_ms numeric(10, 1),
  field_cls_p75 numeric(8, 4),
  field_category text,
  source text not null default 'psi' check (source in ('psi', 'fixture')),
  error text,
  triggered_by text
);
create index if not exists seo_pagespeed_site on public.seo_pagespeed (site_id, fetched_at desc);

create table if not exists public.seo_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.seo_sites(id) on delete cascade,
  kind text not null,
  subject text not null,
  suggestion jsonb not null,
  ai_run_id uuid,
  mock boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

-- ── RLS: admin only ────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['seo_sites', 'seo_keywords', 'seo_weekly', 'seo_audit_runs', 'seo_audit_findings', 'seo_pagespeed', 'seo_ai_suggestions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin all %1$s" on public.%1$I', t);
    execute format('create policy "admin all %1$s" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

drop trigger if exists audit_seo_keywords on public.seo_keywords;
create trigger audit_seo_keywords after insert or update or delete on public.seo_keywords for each row execute function public.audit_row();
drop trigger if exists audit_seo_sites on public.seo_sites;
create trigger audit_seo_sites after insert or update or delete on public.seo_sites for each row execute function public.audit_row();

-- ── Seed: yoca.net only (Search Console URL-prefix property) ───────
insert into public.seo_sites (domain, gsc_property) values ('yoca.net', 'https://yoca.net/')
on conflict (domain) do nothing;

-- Suggested target keywords (status "proposed": never active until an admin activates them).
-- Paths are real routes: every page lives under a locale prefix (/en is the default; "/" redirects).
insert into public.seo_keywords (site_id, keyword, language, country, target_path, source, status, note)
select s.id, k.keyword, k.language, k.country, k.target_path, 'suggested', 'proposed', 'hacim bilinmiyor'
from public.seo_sites s
cross join (values
  ('yoca', 'tr', 'tur', '/tr'),
  ('yoca', 'en', '', '/en'),
  ('yoca ajans', 'tr', 'tur', '/tr'),
  ('yoca dijital ajans', 'tr', 'tur', '/tr'),
  ('marka kimliği tasarımı', 'tr', 'tur', '/tr/services/brand-strategy-identity'),
  ('kurumsal kimlik tasarımı', 'tr', 'tur', '/tr/services/brand-strategy-identity'),
  ('marka stratejisi ajansı', 'tr', 'tur', '/tr/services/brand-strategy-identity'),
  ('brand identity agency', 'en', '', '/en/services/brand-strategy-identity'),
  ('brand strategy agency', 'en', '', '/en/services/brand-strategy-identity'),
  ('kurumsal web sitesi tasarımı', 'tr', 'tur', '/tr/services/web-digital-experiences'),
  ('web tasarım ajansı istanbul', 'tr', 'tur', '/tr/services/web-digital-experiences'),
  ('web sitesi geliştirme', 'tr', 'tur', '/tr/services/web-digital-experiences'),
  ('web design agency istanbul', 'en', '', '/en/services/web-digital-experiences'),
  ('dijital pazarlama ajansı', 'tr', 'tur', '/tr/services/growth-performance'),
  ('performans pazarlama ajansı', 'tr', 'tur', '/tr/services/growth-performance'),
  ('performance marketing agency', 'en', '', '/en/services/growth-performance'),
  ('kreatif ajans istanbul', 'tr', 'tur', '/tr/services/creative-production'),
  ('sosyal medya içerik üretimi', 'tr', 'tur', '/tr/services/creative-production'),
  ('yapay zeka otomasyonu', 'tr', 'tur', '/tr/services/ai-automation'),
  ('iş süreçleri otomasyonu', 'tr', 'tur', '/tr/services/ai-automation'),
  ('ai automation agency', 'en', '', '/en/services/ai-automation'),
  ('dijital ürün geliştirme', 'tr', 'tur', '/tr/services/digital-product-development'),
  ('mvp geliştirme', 'tr', 'tur', '/tr/services/digital-product-development'),
  ('web uygulaması geliştirme', 'tr', 'tur', '/tr/services/digital-product-development'),
  ('yocaserve', 'tr', 'tur', '/tr/products'),
  ('wonkick', 'tr', 'tur', '/tr/products')
) as k(keyword, language, country, target_path)
where s.domain = 'yoca.net'
on conflict do nothing;

commit;
