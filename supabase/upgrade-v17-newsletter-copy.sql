-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v17 (newsletter e-mail copy)
--
-- newsletter_sends.copy: the e-mail text per language for one article,
--   { "tr": { "subject": "…", "preheader": "…", "teaser": "…" }, "en": … }
-- written by the admin (OpenAI suggests it, the admin edits and saves).
-- Kept on the send record, not on the article row, so saving the article in
-- the editor can never overwrite it. Empty = the article's title/excerpt.
--
-- Requires v16. Additive and idempotent.
-- Undo (only if needed): alter table public.newsletter_sends drop column copy;
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.newsletter_sends') is null then
    raise exception 'v17 durduruldu: public.newsletter_sends yok (v16 gerekli).';
  end if;
end;
$$;

alter table public.newsletter_sends add column if not exists copy jsonb not null default '{}'::jsonb;

commit;
