-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v26 (Finans: Gelirler / alacaklar + Operasyon tahsilatları)
--
-- Builds on v25 (Giderler, "Finans sorumlusu", can_finance()). Nothing that
-- exists is rewritten: no row is changed or deleted, v25 objects are only
-- extended (one check constraint, one storage policy, one view, all re-created
-- with a wider list).
--
-- 1. Manual income / receivables (not tied to Operasyon or to a customer):
--      fin_receivables  one expected receivable: description, optional
--                       customer (or free-text payer), category, amount
--                       (null = unknown, never 0), currency, period month,
--                       optional due date, account / method, note
--      fin_collections  collection / refund / adjustment; never deleted,
--                       never edited; a wrong record is voided with a reason
--    Status (bekliyor / kısmen / tahsil edildi / fazla / gecikti) is NOT stored:
--    it is computed from the expected amount and the VALID collections.
--    An amount cannot change once a valid collection exists; a receivable is
--    cancelled with a reason (only without valid collections), never deleted.
--
-- 2. Operasyon customer collections, seen from Finans — no copies:
--      fin_ops_receivables  read-only: service name / kind, customer display
--                           name(s), period, collection due date, expected
--                           price and currency (no cost, notes, login hints,
--                           secret_ref, contact data)
--      fin_ops_collections  read-only: the 'in' rows of ops_payments
--                           (payment fields only, no note)
--      fin_ops_collect / fin_ops_collect_void
--                           record / void a customer collection in the SAME
--                           ops_payments row the Operasyon screens use
--                           (direction 'in' only; payment, refund, adjustment)
--    Renewals, quotes / proformas and finalising a document still create no
--    money movement (they never write ops_payments).
--
-- 3. History: fin_audit now also lists fin_receivables / fin_collections and
--    Operasyon customer collections (payment fields only). Every actor,
--    administrators included. The general audit_log stays admin-only.
--
-- 4. Files: the private bucket "fin-docs" also takes receivable / collection
--    files (same rules: admin + finance, no overwrite, no delete).
--
-- Requires v25. Idempotent; safe to re-run. Undo: end of this file.
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regprocedure('public.can_finance()') is null then raise exception 'v26 durduruldu: public.can_finance() yok (v25 gerekli).'; end if;
  if to_regclass('public.fin_documents') is null or to_regclass('public.fin_audit') is null then raise exception 'v26 durduruldu: Giderler tabloları yok (v25 gerekli).'; end if;
  if to_regprocedure('public.fin_ops_pay(uuid, text, numeric, text, date, text, text, uuid)') is null then raise exception 'v26 durduruldu: fin_ops_pay yok (v25 gerekli).'; end if;
end;
$$;

-- ── 1. Receivables and collections ─────────────────────────────────
create table if not exists public.fin_receivables (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  category text not null check (category in ('service', 'project', 'retainer', 'hosting', 'consulting', 'reimbursement', 'interest', 'other')),
  client_id uuid references public.clients(id) on delete restrict,          -- registered customer (optional)
  payer_name text check (payer_name is null or length(payer_name) <= 200),   -- or free text
  period_month text not null check (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),  -- the month this income belongs to
  due_on date,                                                               -- expected collection date (optional)
  amount numeric(14, 2) check (amount is null or amount > 0),                -- null = unknown (never counted as 0)
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  owner_email text check (owner_email is null or length(owner_email) <= 200),
  pay_account text check (pay_account is null or length(pay_account) <= 200),     -- collecting account
  pay_method text check (pay_method is null or pay_method in ('bank_transfer', 'card', 'cash', 'direct_debit', 'other')),
  note text check (note is null or length(note) <= 4000),
  status text not null default 'open' check (status in ('open', 'cancelled')),
  cancel_reason text,
  cancelled_by text,
  cancelled_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fin_receivables_month on public.fin_receivables (period_month);
create index if not exists idx_fin_receivables_client on public.fin_receivables (client_id);

create table if not exists public.fin_collections (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.fin_receivables(id) on delete restrict,
  kind text not null default 'payment' check (kind in ('payment', 'refund', 'adjustment')),
  amount numeric(14, 2) not null,
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  paid_on date not null,                -- the real collection date (never invented)
  method text check (method is null or method in ('bank_transfer', 'card', 'cash', 'direct_debit', 'other')),
  account text check (account is null or length(account) <= 200),
  reference text check (reference is null or length(reference) <= 200),
  note text check (note is null or length(note) <= 2000),
  request_key uuid unique,             -- double click / retry → one record
  voided_at timestamptz,
  void_reason text,
  voided_by text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint fin_collections_amount check ((kind = 'adjustment' and amount <> 0) or (kind <> 'adjustment' and amount > 0))
);
create index if not exists idx_fin_collections_receivable on public.fin_collections (receivable_id);
create index if not exists idx_fin_collections_paid on public.fin_collections (paid_on);

create or replace function public.fin_valid_collected(p_receivable uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.fin_collections where receivable_id = p_receivable and voided_at is null)
$$;

create or replace function public.fin_receivables_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Alacak kaydı silinemez; gerekçeyle iptal edin.' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    new.created_by := public.doc_actor();
    new.created_at := now();
    new.updated_at := now();
    new.status := 'open';
    new.cancel_reason := null; new.cancelled_by := null; new.cancelled_at := null;
    return new;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if old.status = 'cancelled' then raise exception 'İptal edilmiş alacak değiştirilemez.' using errcode = '42501'; end if;
  if new.status = 'cancelled' then
    if public.fin_valid_collected(old.id) then raise exception 'Geçerli tahsilatı olan alacak iptal edilemez; önce tahsilatı gerekçeyle iptal edin.' using errcode = '42501'; end if;
    if length(btrim(coalesce(new.cancel_reason, ''))) < 3 then raise exception 'İptal gerekçesi gerekli.' using errcode = '23514'; end if;
    if (new.amount, new.currency) is distinct from (old.amount, old.currency) then raise exception 'İptal ederken tutar değiştirilemez.' using errcode = '42501'; end if;
    new.cancelled_by := public.doc_actor();
    new.cancelled_at := now();
    return new;
  end if;
  new.cancel_reason := null; new.cancelled_by := null; new.cancelled_at := null;
  if (new.amount, new.currency) is distinct from (old.amount, old.currency) and public.fin_valid_collected(old.id) then
    raise exception 'Geçerli tahsilatı olan alacağın tutarı veya para birimi değiştirilemez; tahsilatı gerekçeyle iptal edin ya da düzeltme kaydı ekleyin.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.fin_collections_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  rec public.fin_receivables%rowtype;
begin
  if tg_op = 'DELETE' then raise exception 'Tahsilat kaydı silinemez; gerekçeyle iptal edin.' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    select * into rec from public.fin_receivables where id = new.receivable_id;
    if not found then raise exception 'Alacak bulunamadı.'; end if;
    if rec.status = 'cancelled' then raise exception 'İptal edilmiş alacağa tahsilat eklenemez.' using errcode = '42501'; end if;
    if new.currency <> rec.currency then raise exception 'Tahsilatın para birimi (%) alacağın para birimiyle (%) aynı olmalı; kur dönüşümü yapılmaz.', new.currency, rec.currency using errcode = '23514'; end if;
    if new.paid_on > current_date + 1 then raise exception 'Tahsilat tarihi ileri bir tarih olamaz.' using errcode = '23514'; end if;
    new.created_by := public.doc_actor();
    new.created_at := now();
    new.voided_at := null; new.void_reason := null; new.voided_by := null;
    return new;
  end if;
  if old.voided_at is not null then raise exception 'İptal edilmiş tahsilat kaydı değiştirilemez.' using errcode = '42501'; end if;
  if (new.receivable_id, new.kind, new.amount, new.currency, new.paid_on, new.method, new.account, new.reference, new.note, new.request_key, new.created_by, new.created_at)
     is distinct from (old.receivable_id, old.kind, old.amount, old.currency, old.paid_on, old.method, old.account, old.reference, old.note, old.request_key, old.created_by, old.created_at) then
    raise exception 'Tahsilat kaydı değiştirilemez; gerekçeyle iptal edip yeni kayıt ekleyin.' using errcode = '42501';
  end if;
  if new.voided_at is null then return old; end if;
  if length(btrim(coalesce(new.void_reason, ''))) < 3 then raise exception 'İptal gerekçesi gerekli.' using errcode = '23514'; end if;
  new.voided_at := now();
  new.voided_by := public.doc_actor();
  return new;
end $$;

drop trigger if exists fin_receivables_guard on public.fin_receivables;
create trigger fin_receivables_guard before insert or update or delete on public.fin_receivables for each row execute function public.fin_receivables_guard();
drop trigger if exists fin_collections_guard on public.fin_collections;
create trigger fin_collections_guard before insert or update or delete on public.fin_collections for each row execute function public.fin_collections_guard();

do $$
declare t text;
begin
  foreach t in array array['fin_receivables', 'fin_collections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "finance read %1$s" on public.%1$I', t);
    execute format('create policy "finance read %1$s" on public.%1$I for select to authenticated using (public.can_finance())', t);
    execute format('drop policy if exists "finance add %1$s" on public.%1$I', t);
    execute format('create policy "finance add %1$s" on public.%1$I for insert to authenticated with check (public.can_finance())', t);
    execute format('drop policy if exists "finance change %1$s" on public.%1$I', t);
    execute format('create policy "finance change %1$s" on public.%1$I for update to authenticated using (public.can_finance()) with check (public.can_finance())', t);
    -- no delete policy: nothing is deleted (the guards refuse it as well)
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, delete, references, trigger on public.%I from authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

-- Customers finance users may pick: id and display name only.
create or replace view public.fin_clients with (security_barrier = true) as
  select c.id, coalesce(nullif(c.brand_name, ''), c.name) as name
    from public.clients c
   where public.can_finance() and c.archived_at is null and 'customer' = any (coalesce(c.roles, '{}'::text[]));

-- ── 2. Operasyon customer collections (read-only views, owner) ─────
create or replace view public.fin_ops_receivables with (security_barrier = true) as
  select p.id, p.service_id, s.name as service_name, s.kind as service_kind,
         (select string_agg(coalesce(nullif(c.brand_name, ''), c.name), ', ' order by coalesce(nullif(c.brand_name, ''), c.name))
            from public.ops_service_links l join public.clients c on c.id = l.client_id
           where l.service_id = s.id) as client_names,
         p.starts_on, p.ends_on, coalesce(p.customer_due_on, p.due_on) as due_on, p.status,
         p.expected_price as amount, p.price_currency as currency,
         (s.archived_at is not null) as service_archived
    from public.ops_periods p
    join public.ops_services s on s.id = p.service_id
   where public.can_finance()
     and p.status <> 'cancelled'
     and (p.expected_price is not null
          or exists (select 1 from public.ops_payments x where x.period_id = p.id and x.direction = 'in'));

create or replace view public.fin_ops_collections with (security_barrier = true) as
  select pay.id, pay.period_id, pay.service_id, pay.kind, pay.amount, pay.currency, pay.paid_on, pay.method, pay.reference,
         pay.voided_at, pay.void_reason, pay.created_by, pay.created_at
    from public.ops_payments pay
   where public.can_finance() and pay.direction = 'in';

revoke all on public.fin_clients, public.fin_ops_receivables, public.fin_ops_collections from public, anon, authenticated;
grant select on public.fin_clients, public.fin_ops_receivables, public.fin_ops_collections to authenticated, service_role;

-- Record / void an Operasyon customer collection (the same ops_payments row).
create or replace function public.fin_ops_collect(p_period uuid, p_kind text, p_amount numeric, p_currency text, p_paid_on date,
  p_method text, p_reference text, p_request_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  per public.ops_periods%rowtype;
  new_id uuid;
  payer uuid;
begin
  if not public.can_finance() then raise exception 'Yetki yok.' using errcode = '42501'; end if;
  -- Only a collection FROM the customer (direction 'in'): collection, refund to the customer, or adjustment.
  if p_kind is null or p_kind not in ('payment', 'refund', 'adjustment') then raise exception 'Geçersiz işlem türü: yalnızca tahsilat, iade veya düzeltme.' using errcode = '22023'; end if;
  if p_amount is null or (p_kind = 'adjustment' and p_amount = 0) or (p_kind <> 'adjustment' and p_amount <= 0) then raise exception 'Geçersiz tutar.' using errcode = '22023'; end if;
  if p_request_key is null then raise exception 'İstek anahtarı gerekli.'; end if;
  select id into new_id from public.ops_payments where request_key = p_request_key and direction = 'in' and period_id = p_period;
  if found then return new_id; end if;
  if exists (select 1 from public.ops_payments where request_key = p_request_key) then raise exception 'İstek anahtarı başka bir kayda ait.' using errcode = '22023'; end if;
  select * into per from public.ops_periods where id = p_period;
  if not found or not exists (select 1 from public.fin_ops_receivables v where v.id = p_period) then raise exception 'Operasyon tahsilat dönemi bulunamadı.'; end if;
  if per.price_currency is not null and p_currency <> per.price_currency then
    raise exception 'Tahsilatın para birimi (%) dönemin satış para birimiyle (%) aynı olmalı.', p_currency, per.price_currency using errcode = '23514';
  end if;
  if p_paid_on is null or p_paid_on > current_date + 1 then raise exception 'Geçerli bir tahsilat tarihi gerekli.' using errcode = '23514'; end if;
  -- the payer: the service's only customer, if there is exactly one (otherwise left empty, as in Operasyon)
  select min(l.client_id::text)::uuid into payer from public.ops_service_links l where l.service_id = per.service_id and l.client_id is not null
   having count(*) = 1;
  insert into public.ops_payments (period_id, service_id, direction, kind, amount, currency, paid_on, method, reference, client_id, request_key, created_by)
  values (per.id, per.service_id, 'in', p_kind, p_amount, p_currency, p_paid_on, p_method, p_reference, payer, p_request_key, public.doc_actor())
  on conflict (request_key) do nothing
  returning id into new_id;
  if new_id is null then select id into new_id from public.ops_payments where request_key = p_request_key; end if;
  return new_id;
end $$;

create or replace function public.fin_ops_collect_void(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_finance() then raise exception 'Yetki yok.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'İptal gerekçesi gerekli.' using errcode = '23514'; end if;
  update public.ops_payments set voided_at = now(), void_reason = btrim(p_reason)
   where id = p_payment and direction = 'in' and voided_at is null;
  if not found then raise exception 'Müşteri tahsilatı bulunamadı ya da zaten iptal edilmiş.'; end if;
end $$;

revoke all on function public.fin_ops_collect(uuid, text, numeric, text, date, text, text, uuid) from public, anon;
revoke all on function public.fin_ops_collect_void(uuid, text) from public, anon;
grant execute on function public.fin_ops_collect(uuid, text, numeric, text, date, text, text, uuid) to authenticated;
grant execute on function public.fin_ops_collect_void(uuid, text) to authenticated;

-- ── 3. Finance history: + receivables, collections, Operasyon collections ─
create or replace view public.fin_audit with (security_barrier = true) as
  select a.id, a.at, a.actor, a.action, a.entity, a.entity_id, a.label,
         case when a.entity = 'ops_payments'
              then (select jsonb_object_agg(e.k, e.v) from jsonb_each(coalesce(a.changes, '{}'::jsonb)) as e(k, v)
                     where e.k in ('kind', 'amount', 'currency', 'paid_on', 'method', 'reference', 'voided_at', 'void_reason'))
              else a.changes end as changes
    from public.audit_log a
   where public.can_finance()
     and (a.entity in ('fin_expenses', 'fin_periods', 'fin_payments', 'fin_documents', 'fin_imports', 'fin_import_rows', 'fin_receivables', 'fin_collections')
          or (a.entity = 'ops_payments'
              and exists (select 1 from public.ops_payments x where x.id::text = a.entity_id and x.direction in ('in', 'out'))));
revoke all on public.fin_audit from public, anon, authenticated;
grant select on public.fin_audit to authenticated, service_role;

-- ── 4. Files ────────────────────────────────────────────────────────
alter table public.fin_documents drop constraint if exists fin_documents_entity_check;
alter table public.fin_documents add constraint fin_documents_entity_check check (entity in (
  'expense', 'period', 'payment', 'ops_period', 'ops_payment', 'receivable', 'collection', 'ops_receivable', 'ops_collection'));
drop policy if exists "finance add fin docs" on storage.objects;
create policy "finance add fin docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'fin-docs' and public.can_finance()
              and name ~ '^(expense|period|payment|ops_period|ops_payment|receivable|collection|ops_receivable|ops_collection)/[0-9a-f-]{36}/[^/]+$');

commit;

-- Check (read-only):
--   select tablename, policyname, cmd from pg_policies where tablename in ('fin_receivables', 'fin_collections') order by 1, 2;
--   select count(*) from public.fin_ops_receivables;   -- as an admin / finance session
--
-- Undo (not recommended once income is recorded; it drops its history):
--   begin;
--   drop function if exists public.fin_ops_collect(uuid, text, numeric, text, date, text, text, uuid);
--   drop function if exists public.fin_ops_collect_void(uuid, text);
--   drop view if exists public.fin_ops_receivables, public.fin_ops_collections, public.fin_clients;
--   -- fin_audit: re-run section 6 of upgrade-v25-expenses.sql (the v25 view)
--   drop table if exists public.fin_collections, public.fin_receivables;
--   drop function if exists public.fin_receivables_guard(), public.fin_collections_guard(), public.fin_valid_collected(uuid);
--   alter table public.fin_documents drop constraint if exists fin_documents_entity_check;
--   alter table public.fin_documents add constraint fin_documents_entity_check check (entity in ('expense', 'period', 'payment', 'ops_period', 'ops_payment'));
--   -- storage policy "finance add fin docs": re-create it with the v25 path list
--   commit;
