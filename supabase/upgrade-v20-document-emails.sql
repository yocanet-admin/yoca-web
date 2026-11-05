-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v20 (Teklifler ve Belgeler: e-postayla gönderim)
--
-- New (admin-only through public.is_admin(), audit-logged):
--   doc_emails  one row per "Gönder" press: who sent, recipients (to / cc),
--               subject and message as sent, the document version and the
--               EXACT stored PDF attached (doc_renders row + its sha256),
--               and the result. Rows are never deleted.
-- Status (what the panel shows):
--   sending    the request is being made (or the server stopped mid-way)
--   accepted   the e-mail service accepted the message (NOT yet "delivered")
--   failed     the service refused it (nothing was sent)
--   unknown    no clear answer (timeout / network / 5xx); retrying with the
--              SAME request key never sends a second copy (Resend
--              Idempotency-Key = request key)
--   delivered / delayed / bounced / complained   later delivery events read
--              from the service ("Durumu yenile")
-- Functions (security definer, admin check inside, actor from the JWT):
--   doc_email_begin   one row per request key (double click / retry → same row)
--   doc_email_finish  result of the send call
--   doc_email_status  later delivery state
-- doc_events gains the kind 'emailed' (who sent which version to whom).
--
-- Generating a PDF or finalizing never sends anything: only the separate
-- "Gönder" action calls these functions.
--
-- Requires: v19. Additive and idempotent; safe to re-run. The previous app
-- version never reads this table. Undo: see the end of this file.
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.doc_renders') is null then raise exception 'v20 durduruldu: public.doc_renders yok (v19 gerekli).'; end if;
  if to_regprocedure('public.doc_actor()') is null then raise exception 'v20 durduruldu: public.doc_actor() yok (v19 gerekli).'; end if;
end;
$$;

-- ── 1. Table ───────────────────────────────────────────────────────
create table if not exists public.doc_emails (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.doc_documents(id) on delete restrict,
  version integer not null,
  render_id uuid not null references public.doc_renders(id) on delete restrict,
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_name text not null check (length(pdf_name) between 1 and 200),
  to_addrs text[] not null check (cardinality(to_addrs) between 1 and 10),
  cc_addrs text[] not null default '{}' check (cardinality(cc_addrs) <= 10),
  subject text not null check (length(subject) between 1 and 300),
  body text not null check (length(body) between 1 and 20000),
  reply_to text,
  request_key uuid not null unique,   -- double click / retry of "Gönder" → one row, one e-mail
  status text not null default 'sending' check (status in ('sending', 'accepted', 'failed', 'unknown', 'delivered', 'delayed', 'bounced', 'complained')),
  provider text not null default 'resend',
  provider_id text,
  error text,
  last_event text,
  sent_by text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  status_checked_at timestamptz,
  foreign key (document_id, version) references public.doc_versions(document_id, version) on delete restrict
);
create index if not exists idx_doc_emails_document on public.doc_emails (document_id, created_at desc);

-- ── 2. Guards ──────────────────────────────────────────────────────
create or replace function public.doc_emails_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('yoca.doc_fn', true), '') <> '1' then
    raise exception 'doc_emails: kayıt yalnızca doc_email_* işlevleriyle değişir' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.document_id, new.version, new.render_id, new.pdf_sha256, new.to_addrs, new.cc_addrs, new.subject, new.body, new.request_key, new.sent_by, new.created_at)
     is distinct from (old.document_id, old.version, old.render_id, old.pdf_sha256, old.to_addrs, old.cc_addrs, old.subject, old.body, old.request_key, old.sent_by, old.created_at) then
    raise exception 'doc_emails: gönderilen içerik değiştirilemez' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists doc_emails_guard on public.doc_emails;
create trigger doc_emails_guard before insert or update on public.doc_emails for each row execute function public.doc_emails_guard();
drop trigger if exists doc_emails_no_delete on public.doc_emails;
create trigger doc_emails_no_delete before delete on public.doc_emails for each row execute function public.doc_no_delete();
drop trigger if exists audit_doc_emails on public.doc_emails;
create trigger audit_doc_emails after insert or update or delete on public.doc_emails for each row execute function public.audit_row();

alter table public.doc_emails enable row level security;
drop policy if exists "admin read document emails" on public.doc_emails;
create policy "admin read document emails" on public.doc_emails for select to authenticated using (public.is_admin());
revoke all on public.doc_emails from anon;
revoke insert, update, delete on public.doc_emails from authenticated;
grant select on public.doc_emails to authenticated;

-- doc_events: new kind 'emailed'
alter table public.doc_events drop constraint if exists doc_events_kind_check;
alter table public.doc_events add constraint doc_events_kind_check
  check (kind in ('created', 'duplicated', 'from_quote', 'finalized', 'revised', 'archived', 'restored', 'quote_state', 'emailed'));

-- ── 3. Functions ───────────────────────────────────────────────────
-- Start a send. The same request key returns the existing row (replay) and
-- never creates a second one.
create or replace function public.doc_email_begin(
  p_id uuid, p_version integer, p_render_id uuid, p_pdf_name text, p_to text[], p_cc text[],
  p_subject text, p_body text, p_reply_to text, p_request_key uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.doc_emails; r public.doc_renders; d public.doc_documents;
begin
  if not public.is_admin() then raise exception 'yetkisiz' using errcode = '42501'; end if;
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
  insert into public.doc_emails (document_id, version, render_id, pdf_sha256, pdf_name, to_addrs, cc_addrs, subject, body, reply_to, request_key, sent_by)
  values (p_id, p_version, p_render_id, r.pdf_sha256, p_pdf_name, p_to, coalesce(p_cc, '{}'), p_subject, p_body, nullif(p_reply_to, ''), p_request_key, public.doc_actor())
  on conflict (request_key) do nothing
  returning * into e;
  perform set_config('yoca.doc_fn', '', true);
  if e.id is null then
    select * into e from public.doc_emails where request_key = p_request_key;
    return jsonb_build_object('id', e.id, 'status', e.status, 'replay', true, 'created_at', e.created_at, 'provider_id', e.provider_id, 'error', e.error);
  end if;
  return jsonb_build_object('id', e.id, 'status', e.status, 'replay', false, 'created_at', e.created_at);
end $$;
revoke all on function public.doc_email_begin(uuid, integer, uuid, text, text[], text[], text, text, text, uuid) from anon, public;
grant execute on function public.doc_email_begin(uuid, integer, uuid, text, text[], text[], text, text, text, uuid) to authenticated;

-- Result of the send call. Only from 'sending' / 'unknown' (a retry of an
-- unclear send); an accepted or failed row keeps its result.
create or replace function public.doc_email_finish(p_email_id uuid, p_status text, p_provider_id text, p_error text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.doc_emails;
begin
  if not public.is_admin() then raise exception 'yetkisiz' using errcode = '42501'; end if;
  if p_status not in ('accepted', 'failed', 'unknown') then raise exception 'doc_email_finish: geçersiz durum' using errcode = '22023'; end if;
  select * into e from public.doc_emails where id = p_email_id for update;
  if not found then raise exception 'doc_email_finish: kayıt yok' using errcode = 'P0002'; end if;
  if e.status not in ('sending', 'unknown') then
    return jsonb_build_object('id', e.id, 'status', e.status, 'unchanged', true);
  end if;
  perform set_config('yoca.doc_fn', '1', true);
  update public.doc_emails set status = p_status, provider_id = coalesce(nullif(p_provider_id, ''), provider_id),
    error = case when p_status = 'accepted' then null else left(p_error, 500) end, finished_at = now()
  where id = e.id returning * into e;
  if p_status = 'accepted' then
    insert into public.doc_events (document_id, kind, detail, actor)
    values (e.document_id, 'emailed', jsonb_build_object('version', e.version, 'email_id', e.id, 'to', e.to_addrs, 'cc', e.cc_addrs, 'render_id', e.render_id), public.doc_actor());
  end if;
  perform set_config('yoca.doc_fn', '', true);
  return jsonb_build_object('id', e.id, 'status', e.status, 'unchanged', false);
end $$;
revoke all on function public.doc_email_finish(uuid, text, text, text) from anon, public;
grant execute on function public.doc_email_finish(uuid, text, text, text) to authenticated;

-- Delivery state read later from the service. Never turns a failed or
-- unclear send into a delivered one.
create or replace function public.doc_email_status(p_email_id uuid, p_status text, p_last_event text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.doc_emails;
begin
  if not public.is_admin() then raise exception 'yetkisiz' using errcode = '42501'; end if;
  if p_status not in ('accepted', 'delivered', 'delayed', 'bounced', 'complained') then raise exception 'doc_email_status: geçersiz durum' using errcode = '22023'; end if;
  select * into e from public.doc_emails where id = p_email_id for update;
  if not found then raise exception 'doc_email_status: kayıt yok' using errcode = 'P0002'; end if;
  if e.status not in ('accepted', 'delivered', 'delayed', 'bounced', 'complained') then
    return jsonb_build_object('id', e.id, 'status', e.status, 'unchanged', true);
  end if;
  perform set_config('yoca.doc_fn', '1', true);
  update public.doc_emails set status = p_status, last_event = left(p_last_event, 60), status_checked_at = now() where id = e.id returning * into e;
  perform set_config('yoca.doc_fn', '', true);
  return jsonb_build_object('id', e.id, 'status', e.status, 'unchanged', false);
end $$;
revoke all on function public.doc_email_status(uuid, text, text) from anon, public;
grant execute on function public.doc_email_status(uuid, text, text) to authenticated;

commit;

-- ═══ Undo (only if needed; drops ONLY what v20 added) ══════════════
-- WARNING: dropping doc_emails deletes the sending history.
-- begin;
--   drop table if exists public.doc_emails cascade;
--   drop function if exists public.doc_email_begin(uuid, integer, uuid, text, text[], text[], text, text, text, uuid),
--     public.doc_email_finish(uuid, text, text, text), public.doc_email_status(uuid, text, text), public.doc_emails_guard();
--   -- doc_events rows of kind 'emailed' must go before the old check returns:
--   -- (they are history; keep v20's check instead if any exist)
-- commit;
