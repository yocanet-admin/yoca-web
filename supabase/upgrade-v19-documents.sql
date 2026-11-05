-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v19 (Teklifler ve Belgeler)
--
-- One document infrastructure for every type: price quotation (quote),
-- proforma, letter, project status report, delivery note. Not an e-invoice,
-- not accounting: nothing here touches ops_payments / ops_periods.
--
-- New (all admin-only through public.is_admin(), audit-logged):
--   doc_documents  working copy (content jsonb) + status + quote follow-up
--   doc_versions   frozen, immutable versions: snapshot of issuer, recipient,
--                  content and totals at finalization + the stored PDF
--   doc_events     who marked what and when (finalized, revised, archived,
--                  quote sent / accepted / rejected / expired)
--   doc_counters   one row per number prefix + year (TKL-2026-0001); numbers
--                  are drawn with a single atomic upsert, so concurrent
--                  creations never get the same number
-- Functions (security definer, admin check inside, actor from the JWT):
--   doc_create, doc_finalize, doc_revise, doc_archive, doc_quote_state
-- Storage: private bucket "yoca-docs" (PDF only, 15 MB). Admins may read and
--   add files; nobody may change or delete them through the API, so an
--   earlier version's PDF stays as it was.
--
-- The customer master record stays public.clients (no second customer
-- system). A document keeps its own copy of the recipient details in its
-- content, separate from the client record, so later edits of the client
-- never change an issued document.
--
-- Requires: v8 (clients), v9 (audit_log, audit_row), v10 PART A (is_admin()).
-- Additive and idempotent; safe to re-run. The previous app version never
-- reads these tables. Undo: see the end of this file.
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.clients') is null then raise exception 'v19 durduruldu: public.clients yok (v8 gerekli).'; end if;
  if to_regprocedure('public.is_admin()') is null then raise exception 'v19 durduruldu: public.is_admin() yok (v10 PART A gerekli).'; end if;
  if to_regprocedure('public.audit_row()') is null then raise exception 'v19 durduruldu: public.audit_row() yok (v9 gerekli).'; end if;
end;
$$;

-- ── 1. Tables ──────────────────────────────────────────────────────
create table if not exists public.doc_counters (
  prefix text not null check (prefix ~ '^[A-Z]{2,5}$'),
  year integer not null check (year between 2000 and 2999),
  last integer not null default 0 check (last >= 0),
  primary key (prefix, year)
);

create table if not exists public.doc_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quote', 'proforma', 'letter', 'status_report', 'delivery')),
  number text not null unique,
  title text not null default '',
  status text not null default 'draft' check (status in ('draft', 'final', 'archived')),
  client_id uuid references public.clients(id) on delete restrict,
  source_id uuid references public.doc_documents(id) on delete restrict,   -- proforma made from a quote
  locale text not null default 'tr' check (locale in ('tr', 'en')),
  currency text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR', 'GBP', 'AZN')),
  content jsonb not null default '{}'::jsonb,
  total numeric(14, 2),             -- grand total of the working copy; NULL = none / not computable
  final_version integer not null default 0,
  final_total numeric(14, 2),
  final_at timestamptz,
  quote_state text check (quote_state in ('sent', 'accepted', 'rejected', 'expired')),
  quote_state_at timestamptz,
  quote_state_by text,
  archived_at timestamptz,
  archived_from text check (archived_from in ('draft', 'final')),
  request_key uuid unique,          -- double click / retry of "Yeni belge" → one document
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doc_quote_state_kind check (quote_state is null or kind = 'quote'),
  constraint doc_archived_consistent check ((status = 'archived') = (archived_at is not null))
);
create index if not exists idx_doc_documents_client on public.doc_documents (client_id, created_at desc);
create index if not exists idx_doc_documents_list on public.doc_documents (status, kind, created_at desc);
create index if not exists idx_doc_documents_source on public.doc_documents (source_id);

create table if not exists public.doc_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.doc_documents(id) on delete restrict,
  version integer not null check (version >= 1),
  number text not null,
  kind text not null,
  title text not null,
  snapshot jsonb not null,           -- { content, issuer, bankAccounts, totals, client_id, source_number }
  currency text not null,
  total numeric(14, 2),
  pdf_path text not null unique,
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes integer not null check (pdf_bytes > 0),
  pdf_pages integer not null check (pdf_pages > 0),
  request_key uuid not null unique,  -- double click / retry of "Kesinleştir" → one version
  finalized_by text,
  finalized_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.doc_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.doc_documents(id) on delete restrict,
  kind text not null check (kind in ('created', 'duplicated', 'from_quote', 'finalized', 'revised', 'archived', 'restored', 'quote_state')),
  detail jsonb not null default '{}'::jsonb,
  actor text,
  at timestamptz not null default now()
);
create index if not exists idx_doc_events_document on public.doc_events (document_id, at desc);

-- ── 2. Guards ──────────────────────────────────────────────────────
-- Lifecycle columns change only inside the doc_* functions (they set
-- yoca.doc_fn for their transaction). Working-copy columns change only while
-- the document is a draft. Identity columns never change.
create or replace function public.doc_documents_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  in_fn boolean := coalesce(current_setting('yoca.doc_fn', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if not in_fn then raise exception 'doc_documents: yeni belge yalnızca doc_create() ile oluşturulur' using errcode = '42501'; end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.kind is distinct from old.kind or new.number is distinct from old.number
     or new.source_id is distinct from old.source_id or new.request_key is distinct from old.request_key
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'doc_documents: belge numarası, türü ve kaynağı değiştirilemez' using errcode = '42501';
  end if;
  if not in_fn and (new.status is distinct from old.status or new.final_version is distinct from old.final_version
     or new.final_total is distinct from old.final_total or new.final_at is distinct from old.final_at
     or new.quote_state is distinct from old.quote_state or new.quote_state_at is distinct from old.quote_state_at
     or new.quote_state_by is distinct from old.quote_state_by or new.archived_at is distinct from old.archived_at
     or new.archived_from is distinct from old.archived_from) then
    raise exception 'doc_documents: durum yalnızca belge işlemleriyle değişir (kesinleştir / revize et / arşivle)' using errcode = '42501';
  end if;
  if (new.content is distinct from old.content or new.title is distinct from old.title or new.client_id is distinct from old.client_id
      or new.locale is distinct from old.locale or new.currency is distinct from old.currency or new.total is distinct from old.total)
     and not (old.status = 'draft' and new.status = 'draft') then
    raise exception 'doc_documents: kesinleşmiş veya arşivlenmiş belge düzenlenemez; önce "Revize et"' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists doc_documents_guard on public.doc_documents;
create trigger doc_documents_guard before insert or update on public.doc_documents for each row execute function public.doc_documents_guard();

create or replace function public.doc_no_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception '%: kayıt silinemez (belgeler arşivlenir, sürümler saklanır)', tg_table_name using errcode = '42501';
end $$;

create or replace function public.doc_versions_frozen() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('yoca.doc_fn', true), '') <> '1' then raise exception 'doc_versions: sürüm yalnızca doc_finalize() ile oluşur' using errcode = '42501'; end if;
    return new;
  end if;
  raise exception 'doc_versions: kesinleşmiş sürüm değiştirilemez' using errcode = '42501';
end $$;

drop trigger if exists doc_documents_no_delete on public.doc_documents;
create trigger doc_documents_no_delete before delete on public.doc_documents for each row execute function public.doc_no_delete();
drop trigger if exists doc_versions_frozen on public.doc_versions;
create trigger doc_versions_frozen before insert or update or delete on public.doc_versions for each row execute function public.doc_versions_frozen();
drop trigger if exists doc_events_no_change on public.doc_events;
create trigger doc_events_no_change before update or delete on public.doc_events for each row execute function public.doc_no_delete();

-- ── 3. RLS + audit ─────────────────────────────────────────────────
alter table public.doc_documents enable row level security;
alter table public.doc_versions enable row level security;
alter table public.doc_events enable row level security;
alter table public.doc_counters enable row level security;

drop policy if exists "admin read documents" on public.doc_documents;
create policy "admin read documents" on public.doc_documents for select to authenticated using (public.is_admin());
drop policy if exists "admin edit documents" on public.doc_documents;
create policy "admin edit documents" on public.doc_documents for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin read document versions" on public.doc_versions;
create policy "admin read document versions" on public.doc_versions for select to authenticated using (public.is_admin());
drop policy if exists "admin read document events" on public.doc_events;
create policy "admin read document events" on public.doc_events for select to authenticated using (public.is_admin());
-- doc_counters: no policy → only the security definer functions use it.

revoke all on public.doc_documents, public.doc_versions, public.doc_events, public.doc_counters from anon;
revoke insert, delete on public.doc_documents from authenticated;
revoke insert, update, delete on public.doc_versions, public.doc_events from authenticated;
revoke all on public.doc_counters from authenticated;
grant select, update on public.doc_documents to authenticated;
grant select on public.doc_versions, public.doc_events to authenticated;

drop trigger if exists audit_doc_documents on public.doc_documents;
create trigger audit_doc_documents after insert or update or delete on public.doc_documents for each row execute function public.audit_row();
drop trigger if exists audit_doc_versions on public.doc_versions;
create trigger audit_doc_versions after insert or update or delete on public.doc_versions for each row execute function public.audit_row();

-- ── 4. Functions ───────────────────────────────────────────────────
create or replace function public.doc_actor() returns text
language sql stable set search_path = public as $$
  select coalesce(nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'email', ''), 'sistem')
$$;

create or replace function public.doc_prefix(p_kind text) returns text
language sql immutable as $$
  select case p_kind when 'quote' then 'TKL' when 'proforma' then 'PRF' when 'letter' then 'YZI' when 'status_report' then 'RPR' when 'delivery' then 'TSL' end
$$;

-- Next number for a type and year. One atomic upsert per call: two concurrent
-- calls serialize on the counter row and get consecutive numbers.
create or replace function public.doc_next_number(p_kind text, p_year integer) returns text
language plpgsql security definer set search_path = public as $$
declare
  pfx text := public.doc_prefix(p_kind);
  n integer;
begin
  if pfx is null then raise exception 'doc_next_number: bilinmeyen tür %', p_kind using errcode = '22023'; end if;
  insert into public.doc_counters (prefix, year, last) values (pfx, p_year, 1)
  on conflict (prefix, year) do update set last = public.doc_counters.last + 1
  returning last into n;
  return format('%s-%s-%s', pfx, p_year, lpad(n::text, 4, '0'));
end $$;
revoke all on function public.doc_next_number(text, integer) from anon, authenticated, public;

create or replace function public.doc_create(
  p_kind text, p_title text, p_client_id uuid, p_source_id uuid, p_locale text, p_currency text,
  p_content jsonb, p_total numeric, p_request_key uuid, p_event text default 'created'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  existing public.doc_documents;
  src public.doc_documents;
  doc public.doc_documents;
  yr integer := extract(year from (now() at time zone 'Europe/Istanbul'))::integer;
begin
  if not public.is_admin() then raise exception 'yetkisiz' using errcode = '42501'; end if;
  if p_request_key is null then raise exception 'doc_create: istek anahtarı gerekli' using errcode = '22023'; end if;
  if p_event not in ('created', 'duplicated', 'from_quote') then raise exception 'doc_create: geçersiz olay' using errcode = '22023'; end if;
  select * into existing from public.doc_documents where request_key = p_request_key;
  if found then return jsonb_build_object('id', existing.id, 'number', existing.number, 'replay', true); end if;
  if p_source_id is not null then
    select * into src from public.doc_documents where id = p_source_id;
    if not found then raise exception 'doc_create: kaynak belge yok' using errcode = '22023'; end if;
    if p_event = 'from_quote' and (src.kind <> 'quote' or p_kind <> 'proforma') then raise exception 'doc_create: proforma yalnızca tekliften oluşturulur' using errcode = '22023'; end if;
  end if;
  perform set_config('yoca.doc_fn', '1', true);
  insert into public.doc_documents (kind, number, title, client_id, source_id, locale, currency, content, total, request_key, created_by)
  values (p_kind, public.doc_next_number(p_kind, yr), coalesce(p_title, ''), p_client_id, case when p_event = 'from_quote' then p_source_id end,
          coalesce(p_locale, 'tr'), coalesce(p_currency, 'TRY'), coalesce(p_content, '{}'::jsonb), p_total, p_request_key, public.doc_actor())
  returning * into doc;
  insert into public.doc_events (document_id, kind, detail, actor)
  values (doc.id, p_event, case when p_source_id is not null then jsonb_build_object('source_id', p_source_id, 'source_number', src.number) else '{}'::jsonb end, public.doc_actor());
  perform set_config('yoca.doc_fn', '', true);
  return jsonb_build_object('id', doc.id, 'number', doc.number, 'replay', false);
exception when unique_violation then
  -- the same request key raced with itself: return the row that won
  select * into existing from public.doc_documents where request_key = p_request_key;
  if found then return jsonb_build_object('id', existing.id, 'number', existing.number, 'replay', true); end if;
  raise;
end $$;
revoke all on function public.doc_create(text, text, uuid, uuid, text, text, jsonb, numeric, uuid, text) from anon, public;
grant execute on function public.doc_create(text, text, uuid, uuid, text, text, jsonb, numeric, uuid, text) to authenticated;

-- Finalize: the PDF must already be stored in "yoca-docs"; the version and
-- the status change are one transaction. A second call with the same request
-- key returns the version that was created (no second version).
create or replace function public.doc_finalize(
  p_id uuid, p_expected_updated_at timestamptz, p_snapshot jsonb, p_total numeric,
  p_pdf_path text, p_pdf_sha256 text, p_pdf_bytes integer, p_pdf_pages integer, p_request_key uuid
) returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare
  doc public.doc_documents;
  v public.doc_versions;
  next_v integer;
begin
  if not public.is_admin() then raise exception 'yetkisiz' using errcode = '42501'; end if;
  select * into v from public.doc_versions where request_key = p_request_key;
  if found then return jsonb_build_object('version', v.version, 'replay', true, 'pdf_path', v.pdf_path); end if;
  select * into doc from public.doc_documents where id = p_id for update;
  if not found then raise exception 'doc_finalize: belge yok' using errcode = 'P0002'; end if;
  if doc.status <> 'draft' then raise exception 'doc_finalize: belge taslak değil' using errcode = '55000'; end if;
  if doc.updated_at <> p_expected_updated_at then raise exception 'doc_finalize: belge başka bir oturumda değişti' using errcode = '40001'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'yoca-docs' and name = p_pdf_path) then
    raise exception 'doc_finalize: PDF dosyası depoda yok' using errcode = '55000';
  end if;
  if p_pdf_path not like doc.id::text || '/%' then raise exception 'doc_finalize: PDF yolu belgeye ait değil' using errcode = '22023'; end if;
  next_v := doc.final_version + 1;
  perform set_config('yoca.doc_fn', '1', true);
  insert into public.doc_versions (document_id, version, number, kind, title, snapshot, currency, total, pdf_path, pdf_sha256, pdf_bytes, pdf_pages, request_key, finalized_by)
  values (doc.id, next_v, doc.number, doc.kind, doc.title, p_snapshot, doc.currency, p_total, p_pdf_path, p_pdf_sha256, p_pdf_bytes, p_pdf_pages, p_request_key, public.doc_actor());
  update public.doc_documents set status = 'final', final_version = next_v, final_total = p_total, final_at = now() where id = doc.id;
  insert into public.doc_events (document_id, kind, detail, actor) values (doc.id, 'finalized', jsonb_build_object('version', next_v), public.doc_actor());
  perform set_config('yoca.doc_fn', '', true);
  return jsonb_build_object('version', next_v, 'replay', false, 'pdf_path', p_pdf_path);
end $$;
revoke all on function public.doc_finalize(uuid, timestamptz, jsonb, numeric, text, text, integer, integer, uuid) from anon, public;
grant execute on function public.doc_finalize(uuid, timestamptz, jsonb, numeric, text, text, integer, integer, uuid) to authenticated;

-- Revise a finalized document: it becomes a draft again; every finalized
-- version (and its PDF) stays. The next finalization creates version n+1.
create or replace function public.doc_revise(p_id uuid, p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare doc public.doc_documents;
begin
  if not public.is_admin() then raise exception 'yetkisiz' using errcode = '42501'; end if;
  select * into doc from public.doc_documents where id = p_id for update;
  if not found then raise exception 'doc_revise: belge yok' using errcode = 'P0002'; end if;
  if doc.status = 'draft' then return jsonb_build_object('status', 'draft', 'replay', true); end if;
  if doc.status <> 'final' then raise exception 'doc_revise: yalnızca kesinleşmiş belge revize edilir' using errcode = '55000'; end if;
  if doc.updated_at <> p_expected_updated_at then raise exception 'doc_revise: belge başka bir oturumda değişti' using errcode = '40001'; end if;
  perform set_config('yoca.doc_fn', '1', true);
  update public.doc_documents set status = 'draft' where id = doc.id;
  insert into public.doc_events (document_id, kind, detail, actor) values (doc.id, 'revised', jsonb_build_object('from_version', doc.final_version), public.doc_actor());
  perform set_config('yoca.doc_fn', '', true);
  return jsonb_build_object('status', 'draft', 'replay', false);
end $$;
revoke all on function public.doc_revise(uuid, timestamptz) from anon, public;
grant execute on function public.doc_revise(uuid, timestamptz) to authenticated;

create or replace function public.doc_archive(p_id uuid, p_archive boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare doc public.doc_documents;
begin
  if not public.is_admin() then raise exception 'yetkisiz' using errcode = '42501'; end if;
  select * into doc from public.doc_documents where id = p_id for update;
  if not found then raise exception 'doc_archive: belge yok' using errcode = 'P0002'; end if;
  perform set_config('yoca.doc_fn', '1', true);
  if p_archive and doc.status <> 'archived' then
    update public.doc_documents set status = 'archived', archived_from = doc.status, archived_at = now() where id = doc.id;
    insert into public.doc_events (document_id, kind, actor) values (doc.id, 'archived', public.doc_actor());
  elsif not p_archive and doc.status = 'archived' then
    update public.doc_documents set status = coalesce(doc.archived_from, 'draft'), archived_from = null, archived_at = null where id = doc.id;
    insert into public.doc_events (document_id, kind, actor) values (doc.id, 'restored', public.doc_actor());
  end if;
  perform set_config('yoca.doc_fn', '', true);
  return jsonb_build_object('status', (select status from public.doc_documents where id = doc.id));
end $$;
revoke all on function public.doc_archive(uuid, boolean) from anon, public;
grant execute on function public.doc_archive(uuid, boolean) to authenticated;

-- Quote follow-up, marked by an admin. Recorded as "who marked it, when";
-- it is not an electronic signature or a verified customer approval.
create or replace function public.doc_quote_state(p_id uuid, p_state text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare doc public.doc_documents;
begin
  if not public.is_admin() then raise exception 'yetkisiz' using errcode = '42501'; end if;
  if p_state is not null and p_state not in ('sent', 'accepted', 'rejected', 'expired') then raise exception 'doc_quote_state: geçersiz durum' using errcode = '22023'; end if;
  select * into doc from public.doc_documents where id = p_id for update;
  if not found then raise exception 'doc_quote_state: belge yok' using errcode = 'P0002'; end if;
  if doc.kind <> 'quote' then raise exception 'doc_quote_state: yalnızca teklifler için' using errcode = '22023'; end if;
  if doc.status = 'archived' then raise exception 'doc_quote_state: arşivlenmiş belge' using errcode = '55000'; end if;
  if p_state is not null and doc.final_version = 0 then raise exception 'doc_quote_state: önce teklifi kesinleştirin' using errcode = '55000'; end if;
  perform set_config('yoca.doc_fn', '1', true);
  update public.doc_documents set quote_state = p_state, quote_state_at = case when p_state is null then null else now() end,
    quote_state_by = case when p_state is null then null else public.doc_actor() end where id = doc.id;
  insert into public.doc_events (document_id, kind, detail, actor)
  values (doc.id, 'quote_state', jsonb_build_object('from', doc.quote_state, 'to', p_state, 'note', left(coalesce(p_note, ''), 500), 'version', doc.final_version), public.doc_actor());
  perform set_config('yoca.doc_fn', '', true);
  return jsonb_build_object('quote_state', p_state);
end $$;
revoke all on function public.doc_quote_state(uuid, text, text) from anon, public;
grant execute on function public.doc_quote_state(uuid, text, text) to authenticated;

-- ── 5. Private PDF bucket ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yoca-docs', 'yoca-docs', false, 15728640, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "admin read yoca docs" on storage.objects;
create policy "admin read yoca docs" on storage.objects for select to authenticated using (bucket_id = 'yoca-docs' and public.is_admin());
drop policy if exists "admin add yoca docs" on storage.objects;
create policy "admin add yoca docs" on storage.objects for insert to authenticated with check (bucket_id = 'yoca-docs' and public.is_admin());
-- No update / delete policy: stored PDFs cannot be replaced or removed through the API.

commit;

-- ═══ Undo (only if needed; drops ONLY what v19 added) ══════════════
-- WARNING: dropping the tables deletes every document and version created
-- since. Before real documents exist this is lossless; afterwards prefer
-- leaving v19 in place and rolling back only the app (the old app never reads it).
-- begin;
--   drop table if exists public.doc_events, public.doc_versions, public.doc_documents, public.doc_counters cascade;
--   drop function if exists public.doc_create(text, text, uuid, uuid, text, text, jsonb, numeric, uuid, text),
--     public.doc_finalize(uuid, timestamptz, jsonb, numeric, text, text, integer, integer, uuid),
--     public.doc_revise(uuid, timestamptz), public.doc_archive(uuid, boolean), public.doc_quote_state(uuid, text, text),
--     public.doc_next_number(text, integer), public.doc_prefix(text), public.doc_actor(),
--     public.doc_documents_guard(), public.doc_no_delete(), public.doc_versions_frozen();
--   drop policy if exists "admin read yoca docs" on storage.objects;
--   drop policy if exists "admin add yoca docs" on storage.objects;
--   delete from public.cockpit_settings where key = 'documents';
-- commit;
-- The bucket "yoca-docs" is left in place by the undo (it may hold issued PDFs).
