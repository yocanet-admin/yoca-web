-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v22 (Teklifler ve Belgeler: e-posta teması kaydı)
--
-- "E-postayla gönder" can send the e-mail body in the light (default) or the
-- dark theme. The theme used is kept on the send record:
--   doc_emails.theme   'light' | 'dark', default 'light'
--                      (every row sent before v22 was light)
--   doc_email_begin    gains p_theme text default 'light'
--   doc_emails_guard   the theme of a sent e-mail cannot be changed
-- The theme only changes the e-mail body; the attached PDF is the same file.
--
-- Nothing is deleted or rewritten: existing rows get 'light', which is what
-- they were sent with. The app version before v22 keeps working: it never
-- passes p_theme, and the column has a default.
--
-- Requires: v20. Idempotent; safe to re-run.
-- Check (read-only):
--   select theme, count(*) from public.doc_emails group by theme;
--   select pg_get_function_identity_arguments('public.doc_email_begin'::regproc);
-- Undo (not recommended, loses the stored themes): see the end of this file.
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.doc_emails') is null then raise exception 'v22 durduruldu: public.doc_emails yok (v20 gerekli).'; end if;
end;
$$;

-- ── 1. Column ──────────────────────────────────────────────────────
-- Adding a column with a constant default does not rewrite the rows and does
-- not fire the row triggers (the guard and the audit trigger are not involved).
alter table public.doc_emails add column if not exists theme text not null default 'light';
alter table public.doc_emails drop constraint if exists doc_emails_theme_check;
alter table public.doc_emails add constraint doc_emails_theme_check check (theme in ('light', 'dark'));

-- ── 2. Guard: the theme of a sent e-mail is part of what was sent ──
create or replace function public.doc_emails_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('yoca.doc_fn', true), '') <> '1' then
    raise exception 'doc_emails: kayıt yalnızca doc_email_* işlevleriyle değişir' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.document_id, new.version, new.render_id, new.pdf_sha256, new.to_addrs, new.cc_addrs, new.subject, new.body, new.request_key, new.sent_by, new.created_at, new.theme)
     is distinct from (old.document_id, old.version, old.render_id, old.pdf_sha256, old.to_addrs, old.cc_addrs, old.subject, old.body, old.request_key, old.sent_by, old.created_at, old.theme) then
    raise exception 'doc_emails: gönderilen içerik değiştirilemez' using errcode = '42501';
  end if;
  return new;
end $$;

-- ── 3. doc_email_begin with the theme ──────────────────────────────
-- Replaced in one transaction: the 10-argument version goes, the new one has
-- p_theme with a default, so a call without p_theme (app before v22) still works.
drop function if exists public.doc_email_begin(uuid, integer, uuid, text, text[], text[], text, text, text, uuid);

create or replace function public.doc_email_begin(
  p_id uuid, p_version integer, p_render_id uuid, p_pdf_name text, p_to text[], p_cc text[],
  p_subject text, p_body text, p_reply_to text, p_request_key uuid, p_theme text default 'light'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.doc_emails; r public.doc_renders; d public.doc_documents;
begin
  if not public.is_admin() then raise exception 'yetkisiz' using errcode = '42501'; end if;
  if coalesce(p_theme, 'light') not in ('light', 'dark') then raise exception 'doc_email_begin: geçersiz tema' using errcode = '22023'; end if;
  select * into e from public.doc_emails where request_key = p_request_key;
  if found then
    if e.document_id <> p_id then raise exception 'doc_email_begin: istek anahtarı başka belgeye ait' using errcode = '22023'; end if;
    return jsonb_build_object('id', e.id, 'status', e.status, 'replay', true, 'created_at', e.created_at, 'provider_id', e.provider_id, 'error', e.error);
  end if;
  select * into d from public.doc_documents where id = p_id;
  if not found then raise exception 'doc_email_begin: belge yok' using errcode = 'P0002'; end if;
  if d.status = 'archived' then raise exception 'Arşivdeki belge gönderilemez; önce arşivden çıkarın.' using errcode = '55000'; end if;
  select * into r from public.doc_renders where id = p_render_id;
  if not found or r.document_id <> p_id or r.version <> p_version then raise exception 'doc_email_begin: PDF bu sürüme ait değil' using errcode = '22023'; end if;
  perform set_config('yoca.doc_fn', '1', true);
  insert into public.doc_emails (document_id, version, render_id, pdf_sha256, pdf_name, to_addrs, cc_addrs, subject, body, reply_to, request_key, sent_by, theme)
  values (p_id, p_version, p_render_id, r.pdf_sha256, p_pdf_name, p_to, coalesce(p_cc, '{}'), p_subject, p_body, nullif(p_reply_to, ''), p_request_key, public.doc_actor(), coalesce(p_theme, 'light'))
  on conflict (request_key) do nothing
  returning * into e;
  perform set_config('yoca.doc_fn', '', true);
  if e.id is null then
    select * into e from public.doc_emails where request_key = p_request_key;
    return jsonb_build_object('id', e.id, 'status', e.status, 'replay', true, 'created_at', e.created_at, 'provider_id', e.provider_id, 'error', e.error);
  end if;
  return jsonb_build_object('id', e.id, 'status', e.status, 'replay', false, 'created_at', e.created_at);
end $$;
revoke all on function public.doc_email_begin(uuid, integer, uuid, text, text[], text[], text, text, text, uuid, text) from anon, public;
grant execute on function public.doc_email_begin(uuid, integer, uuid, text, text[], text[], text, text, text, uuid, text) to authenticated;

-- The new column follows the table's grants (SELECT for authenticated through RLS; no TRUNCATE, v21).
notify pgrst, 'reload schema';

commit;

-- Undo (not recommended; run only together with the app version before v22):
--   begin;
--   drop function if exists public.doc_email_begin(uuid, integer, uuid, text, text[], text[], text, text, text, uuid, text);
--   -- then re-create the 10-argument doc_email_begin and doc_emails_guard from upgrade-v20-document-emails.sql
--   alter table public.doc_emails drop constraint if exists doc_emails_theme_check;
--   alter table public.doc_emails drop column if exists theme;
--   commit;
