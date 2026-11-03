-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v15 (Insights in every language)
--
-- Adds to public.insights, nothing else:
--   source_insight_id     the source article a translation was made from
--                         (null on the source article itself)
--   source_hash           SHA-256 of the source fields at translation time;
--                         the editor compares it with the source's current
--                         fingerprint and shows "kaynak değişti"
--   language_reviewed     a person who reads that language checked it;
--   language_reviewed_at  translations cannot be published without it
--   language_reviewed_by  (publish route)
--
-- Requires v6 (insights) and v14. Additive and idempotent: no row data
-- changes, no policy changes (existing insights policies cover new columns).
-- Safe with the previous app version (it never sends these columns).
-- Undo (only if needed): alter table public.insights drop column … (the five above).
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.insights') is null then
    raise exception 'v15 durduruldu: public.insights yok (v6 gerekli).';
  end if;
end;
$$;

alter table public.insights
  add column if not exists source_insight_id uuid references public.insights(id) on delete set null,
  add column if not exists source_hash text,
  add column if not exists language_reviewed boolean not null default false,
  add column if not exists language_reviewed_at timestamptz,
  add column if not exists language_reviewed_by text;

create index if not exists insights_source_idx on public.insights (source_insight_id) where source_insight_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'insights_source_not_self') then
    alter table public.insights add constraint insights_source_not_self check (source_insight_id is null or source_insight_id <> id);
  end if;
end;
$$;

commit;
