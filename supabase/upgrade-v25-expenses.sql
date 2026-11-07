-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v25 (Giderler + "Finans sorumlusu" rolü)
--
-- 1. Roles — no second user system. public.admin_users (v10) gets a `role`
--    column: 'admin' (every existing row, unchanged behaviour) or 'finance'.
--      is_admin()    → role = 'admin' only (so a finance user is NOT an admin:
--                      every existing is_admin() policy, function and storage
--                      rule keeps them out of content, Insights, settings,
--                      Operasyon, documents, CRM …)
--      is_finance()  → role = 'finance'
--      can_finance() → admin or finance (the Giderler tables)
--      panel_role()  → 'admin' | 'finance' | null (the panel shell)
--    Adding a finance user: Supabase Auth user + one admin_users row
--    (see the end of this file). Only the SQL editor / service role can
--    change admin_users (no policies), as before.
--
-- 2. Expenses (Giderler):
--      fin_expenses   definition (recurring monthly / quarterly / yearly, or once)
--      fin_periods    one row per due occurrence; amount and currency are a
--                     snapshot (changing the definition never rewrites history);
--                     unique (expense_id, seq) → a period can never be created twice
--      fin_payments   payment / refund / adjustment; never deleted, never edited;
--                     a wrong record is voided with a reason (who/when kept)
--      fin_documents  metadata of files in the private bucket "fin-docs"
--      fin_imports / fin_import_rows  Excel imports: file, sheet, source row,
--                     content hash; re-import creates nothing, a changed row is
--                     reported and never applied silently (fin_import_apply)
--    Status (bekliyor / kısmen ödendi / ödendi / gecikti) is NOT stored: it is
--    computed from the period amount, its due date and its valid payments. A new
--    period starts with no payment, so it is never "paid" by itself.
--    Who did what: created_by / voided_by / cancelled_by / uploaded_by are set
--    by the database from the signed-in session (not from the request), and every
--    change is written to audit_log (audit_row). No one can rewrite payments.
--
-- 3. Finance history: view fin_audit = audit_log rows of the fin_* tables and of
--    Operasyon PROVIDER payments only (payment fields). The general audit_log
--    stays admin-only.
--
-- 3b. Operasyon link — no copies, no double totals. Provider payments stay in
--    ops_payments (direction 'out'). Finance users see Operasyon provider costs
--    through two read-only views with only the fields they need (service name and
--    kind, provider name, dates, cost, payments — no customer, sale price, notes,
--    login hints or secret_ref) and record / void a provider payment with
--    fin_ops_pay / fin_ops_void, which write the SAME ops_payments row the
--    Operasyon screens use.
--    ops_payments additionally becomes append-only like fin_payments: only an
--    unvoided record can be voided (with a reason); amounts and dates can no
--    longer be edited after the fact (the Operasyon screens never did that).
--
-- 4. Private bucket "fin-docs" (20 MB, PDF / images / office / CSV / text):
--    read and upload for admin + finance only; nobody can overwrite or delete
--    through the API (files are archived in fin_documents instead).
--
-- No existing row is changed or deleted. TRUNCATE is not granted to client roles.
-- Requires v10 (admin_users, is_admin), v9 (audit_row), v18 (Operasyon),
-- v19 (doc_actor). Idempotent; safe to re-run. Undo: end of this file.
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.admin_users') is null then raise exception 'v25 durduruldu: public.admin_users yok (v10 gerekli).'; end if;
  if to_regprocedure('public.is_admin()') is null then raise exception 'v25 durduruldu: public.is_admin() yok (v10 gerekli).'; end if;
  if to_regprocedure('public.audit_row()') is null then raise exception 'v25 durduruldu: public.audit_row() yok (v9 gerekli).'; end if;
  if to_regprocedure('public.doc_actor()') is null then raise exception 'v25 durduruldu: public.doc_actor() yok (v19 gerekli).'; end if;
  if to_regclass('public.ops_payments') is null or to_regclass('public.ops_periods') is null then raise exception 'v25 durduruldu: Operasyon tabloları yok (v18 gerekli).'; end if;
  if not exists (select 1 from public.admin_users) then raise exception 'v25 durduruldu: admin_users boş.'; end if;
end;
$$;

-- ── 1. Roles ───────────────────────────────────────────────────────
alter table public.admin_users add column if not exists role text not null default 'admin';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_users_role_check') then
    alter table public.admin_users add constraint admin_users_role_check check (role in ('admin', 'finance'));
  end if;
end;
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'admin'
  );
$$;

create or replace function public.is_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'finance'
  );
$$;

create or replace function public.can_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role in ('admin', 'finance')
  );
$$;

create or replace function public.panel_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.admin_users where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_finance() from public;
revoke all on function public.can_finance() from public;
revoke all on function public.panel_role() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_finance() to anon, authenticated, service_role;
grant execute on function public.can_finance() to anon, authenticated, service_role;
grant execute on function public.panel_role() to authenticated, service_role;

-- ── 2. Expense tables ──────────────────────────────────────────────
create table if not exists public.fin_expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  category text not null,
  kind text not null check (kind in ('recurring', 'once')),
  recurrence text check (recurrence is null or recurrence in ('monthly', 'quarterly', 'yearly')),
  first_due_on date not null,          -- once: the due date; recurring: due date of the first tracked period
  ends_on date,                        -- recurring: no period is created with a due date after this
  amount numeric(14, 2) check (amount is null or amount > 0),   -- amount for NEW periods; null = unknown
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  provider_id uuid references public.clients(id) on delete restrict,  -- registered firm (optional)
  vendor_name text check (vendor_name is null or length(vendor_name) <= 200),  -- or free text (landlord, shop …)
  owner_email text check (owner_email is null or length(owner_email) <= 200),
  pay_account text check (pay_account is null or length(pay_account) <= 200),
  pay_method text check (pay_method is null or pay_method in ('bank_transfer', 'card', 'cash', 'direct_debit', 'other')),
  auto_debit boolean not null default false,   -- standing order: still "bekliyor" until a payment is recorded
  note text check (note is null or length(note) <= 4000),
  archived_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_expenses_recurrence check ((kind = 'recurring') = (recurrence is not null)),
  constraint fin_expenses_ends check (ends_on is null or ends_on >= first_due_on)
);
alter table public.fin_expenses drop constraint if exists fin_expenses_category_check;
alter table public.fin_expenses add constraint fin_expenses_category_check check (category in (
  'rent', 'internet', 'phone', 'accounting', 'software', 'subscription', 'utilities', 'tax', 'personnel', 'services',
  'equipment', 'maintenance', 'travel', 'office', 'marketing', 'insurance', 'bank', 'other'));
create index if not exists idx_fin_expenses_category on public.fin_expenses (category);
create index if not exists idx_fin_expenses_provider on public.fin_expenses (provider_id);

create table if not exists public.fin_periods (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.fin_expenses(id) on delete restrict,
  seq integer not null check (seq >= 0),
  starts_on date,
  ends_on date,
  due_on date not null,
  amount numeric(14, 2) check (amount is null or amount > 0),
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  status text not null default 'open' check (status in ('open', 'cancelled')),
  review_note text check (review_note is null or length(review_note) <= 500),  -- "İnceleme bekliyor" (e.g. imported as paid without a date)
  cancel_reason text,
  cancelled_by text,
  cancelled_at timestamptz,
  note text check (note is null or length(note) <= 2000),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_periods_once unique (expense_id, seq)
);
alter table public.fin_periods add column if not exists review_note text check (review_note is null or length(review_note) <= 500);
create index if not exists idx_fin_periods_due on public.fin_periods (due_on);

create table if not exists public.fin_payments (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.fin_periods(id) on delete restrict,
  kind text not null default 'payment' check (kind in ('payment', 'refund', 'adjustment')),
  amount numeric(14, 2) not null,
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  paid_on date not null,
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
  constraint fin_payments_amount check ((kind = 'adjustment' and amount <> 0) or (kind <> 'adjustment' and amount > 0))
);
create index if not exists idx_fin_payments_period on public.fin_payments (period_id);
create index if not exists idx_fin_payments_paid on public.fin_payments (paid_on);

create table if not exists public.fin_documents (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('expense', 'period', 'payment', 'ops_period', 'ops_payment')),
  entity_id uuid not null,
  name text not null check (length(name) between 1 and 200),
  path text not null unique,
  mime text,
  size_bytes integer check (size_bytes is null or size_bytes between 0 and 20971520),
  note text check (note is null or length(note) <= 1000),
  uploaded_by text,
  archived_at timestamptz,
  archived_by text,
  created_at timestamptz not null default now(),
  constraint fin_documents_path check (path like entity || '/' || entity_id::text || '/%')
);
create index if not exists idx_fin_documents_entity on public.fin_documents (entity, entity_id);

-- Imports (e.g. an Excel expense sheet): one row per run, one row per source row.
-- source_key (sheet + month + row + item) is unique: importing the same file again
-- creates nothing; a changed source row is stored as "changed", never applied.
create table if not exists public.fin_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (length(file_name) between 1 and 200),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  sheet text not null check (length(sheet) between 1 and 100),
  period_month text not null check (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  summary jsonb not null default '{}'::jsonb,
  imported_by text,
  created_at timestamptz not null default now()
);
create table if not exists public.fin_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.fin_imports(id) on delete restrict,
  source_key text not null unique check (length(source_key) <= 400),
  file_name text not null,
  sheet text not null,
  source_row integer not null check (source_row > 0),
  row_hash text not null,
  payload jsonb not null,           -- the source values, exact text
  plan jsonb not null default '{}'::jsonb,
  action text not null check (action in ('create', 'pending_payment', 'needs_info', 'suggestion', 'possible_duplicate')),
  expense_id uuid references public.fin_expenses(id) on delete restrict,
  period_id uuid references public.fin_periods(id) on delete restrict,
  payment_id uuid references public.fin_payments(id) on delete restrict,
  changed_payload jsonb,            -- a later file had different values for this row (NOT applied)
  changed_hash text,
  changed_import_id uuid references public.fin_imports(id) on delete restrict,
  changed_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  resolution text check (resolution is null or length(resolution) <= 500),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_fin_import_rows_expense on public.fin_import_rows (expense_id);

-- ── 3. Guards (all roles; the service role included) ───────────────
create or replace function public.fin_valid_paid(p_period uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.fin_payments where period_id = p_period and voided_at is null)
$$;

create or replace function public.fin_expenses_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Gider tanımı silinemez; arşivleyin.' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    new.created_by := public.doc_actor();
    new.created_at := now();
    return new;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if exists (select 1 from public.fin_periods where expense_id = old.id)
     and (new.kind, new.recurrence, new.first_due_on) is distinct from (old.kind, old.recurrence, old.first_due_on) then
    raise exception 'Dönemi oluşmuş giderin türü, sıklığı ve ilk vadesi değiştirilemez; bitiş tarihi verip yeni gider açın.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.fin_expenses_first_period() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into public.fin_periods (expense_id, seq, starts_on, ends_on, due_on, amount, currency)
  values (new.id, 0, new.first_due_on,
          case new.recurrence when 'monthly' then (new.first_due_on + interval '1 month')::date - 1
                              when 'quarterly' then (new.first_due_on + interval '3 months')::date - 1
                              when 'yearly' then (new.first_due_on + interval '1 year')::date - 1 end,
          new.first_due_on, new.amount, new.currency)
  on conflict (expense_id, seq) do nothing;
  return new;
end $$;

create or replace function public.fin_periods_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Gider dönemi silinemez; gerekçeyle iptal edin.' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    new.created_by := public.doc_actor();
    new.created_at := now();
    new.status := 'open';
    new.cancel_reason := null; new.cancelled_by := null; new.cancelled_at := null;
    return new;
  end if;
  if (new.expense_id, new.seq, new.created_by, new.created_at) is distinct from (old.expense_id, old.seq, old.created_by, old.created_at) then
    raise exception 'Dönemin gidere bağlantısı değiştirilemez.' using errcode = '42501';
  end if;
  if old.status = 'cancelled' then
    if (new.status, new.due_on, new.amount, new.currency, new.starts_on, new.ends_on, new.cancel_reason, new.cancelled_by, new.cancelled_at)
       is distinct from (old.status, old.due_on, old.amount, old.currency, old.starts_on, old.ends_on, old.cancel_reason, old.cancelled_by, old.cancelled_at) then
      raise exception 'İptal edilmiş dönem değiştirilemez.' using errcode = '42501';
    end if;
  elsif new.status = 'cancelled' then
    if public.fin_valid_paid(old.id) then raise exception 'Geçerli ödemesi olan dönem iptal edilemez; önce ödemeyi gerekçeyle iptal edin.' using errcode = '42501'; end if;
    if length(btrim(coalesce(new.cancel_reason, ''))) < 3 then raise exception 'İptal gerekçesi gerekli.' using errcode = '23514'; end if;
    if (new.due_on, new.amount, new.currency) is distinct from (old.due_on, old.amount, old.currency) then
      raise exception 'İptal ederken tutar veya vade değiştirilemez.' using errcode = '42501';
    end if;
    new.cancelled_by := public.doc_actor();
    new.cancelled_at := now();
  else
    new.cancel_reason := null; new.cancelled_by := null; new.cancelled_at := null;
    if (new.due_on, new.amount, new.currency, new.starts_on, new.ends_on) is distinct from (old.due_on, old.amount, old.currency, old.starts_on, old.ends_on)
       and public.fin_valid_paid(old.id) then
      raise exception 'Ödemesi olan dönemin tutarı, para birimi ve tarihleri değiştirilemez; düzeltme kaydı ekleyin.' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.fin_payments_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  per public.fin_periods%rowtype;
begin
  if tg_op = 'DELETE' then raise exception 'Ödeme kaydı silinemez; gerekçeyle iptal edin.' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    select * into per from public.fin_periods where id = new.period_id;
    if not found then raise exception 'Dönem bulunamadı.'; end if;
    if per.status = 'cancelled' then raise exception 'İptal edilmiş döneme ödeme eklenemez.' using errcode = '42501'; end if;
    if new.currency <> per.currency then raise exception 'Ödemenin para birimi (%) dönemin para birimiyle (%) aynı olmalı; kur dönüşümü yapılmaz.', new.currency, per.currency using errcode = '23514'; end if;
    if new.paid_on > current_date + 1 then raise exception 'Ödeme tarihi ileri bir tarih olamaz.' using errcode = '23514'; end if;
    new.created_by := public.doc_actor();
    new.created_at := now();
    new.voided_at := null; new.void_reason := null; new.voided_by := null;
    return new;
  end if;
  if old.voided_at is not null then raise exception 'İptal edilmiş ödeme kaydı değiştirilemez.' using errcode = '42501'; end if;
  if (new.period_id, new.kind, new.amount, new.currency, new.paid_on, new.method, new.account, new.reference, new.note, new.request_key, new.created_by, new.created_at)
     is distinct from (old.period_id, old.kind, old.amount, old.currency, old.paid_on, old.method, old.account, old.reference, old.note, old.request_key, old.created_by, old.created_at) then
    raise exception 'Ödeme kaydı değiştirilemez; gerekçeyle iptal edip yeni kayıt ekleyin.' using errcode = '42501';
  end if;
  if new.voided_at is null then return old; end if;
  if length(btrim(coalesce(new.void_reason, ''))) < 3 then raise exception 'İptal gerekçesi gerekli.' using errcode = '23514'; end if;
  new.voided_at := now();
  new.voided_by := public.doc_actor();
  return new;
end $$;

create or replace function public.fin_documents_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Belge kaydı silinemez; arşivleyin.' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    new.uploaded_by := public.doc_actor();
    new.created_at := now();
    new.archived_at := null; new.archived_by := null;
    return new;
  end if;
  if (new.entity, new.entity_id, new.name, new.path, new.mime, new.size_bytes, new.uploaded_by, new.created_at)
     is distinct from (old.entity, old.entity_id, old.name, old.path, old.mime, old.size_bytes, old.uploaded_by, old.created_at) then
    raise exception 'Belge kaydı değiştirilemez; yalnızca arşivlenebilir.' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at then
    new.archived_at := case when new.archived_at is null then null else now() end;
    new.archived_by := case when new.archived_at is null then null else public.doc_actor() end;
  else
    new.archived_by := old.archived_by;
  end if;
  return new;
end $$;

create or replace function public.fin_imports_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Aktarım kaydı silinemez.' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then new.imported_by := public.doc_actor(); new.created_at := now(); return new; end if;
  if (new.file_name, new.file_sha256, new.sheet, new.period_month, new.imported_by, new.created_at)
     is distinct from (old.file_name, old.file_sha256, old.sheet, old.period_month, old.imported_by, old.created_at) then
    raise exception 'Aktarım kaydı değiştirilemez.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.fin_import_rows_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Aktarım satırı silinemez.' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    new.created_by := public.doc_actor(); new.created_at := now();
    new.resolved_at := null; new.resolved_by := null; new.changed_payload := null; new.changed_hash := null; new.changed_at := null; new.changed_import_id := null;
    return new;
  end if;
  -- the source facts never change
  if (new.import_id, new.source_key, new.file_name, new.sheet, new.source_row, new.row_hash, new.payload, new.plan, new.created_by, new.created_at)
     is distinct from (old.import_id, old.source_key, old.file_name, old.sheet, old.source_row, old.row_hash, old.payload, old.plan, old.created_by, old.created_at) then
    raise exception 'Aktarılan kaynak satır değiştirilemez.' using errcode = '42501';
  end if;
  if old.expense_id is not null and new.expense_id is distinct from old.expense_id then raise exception 'Bağlı gider değiştirilemez.' using errcode = '42501'; end if;
  if old.period_id is not null and new.period_id is distinct from old.period_id then raise exception 'Bağlı dönem değiştirilemez.' using errcode = '42501'; end if;
  if old.payment_id is not null and new.payment_id is distinct from old.payment_id then raise exception 'Bağlı ödeme değiştirilemez.' using errcode = '42501'; end if;
  if new.resolved_at is distinct from old.resolved_at then
    new.resolved_at := case when new.resolved_at is null then null else now() end;
    new.resolved_by := case when new.resolved_at is null then null else public.doc_actor() end;
  else
    new.resolved_by := old.resolved_by;
  end if;
  return new;
end $$;

drop trigger if exists fin_imports_guard on public.fin_imports;
create trigger fin_imports_guard before insert or update or delete on public.fin_imports for each row execute function public.fin_imports_guard();
drop trigger if exists fin_import_rows_guard on public.fin_import_rows;
create trigger fin_import_rows_guard before insert or update or delete on public.fin_import_rows for each row execute function public.fin_import_rows_guard();

drop trigger if exists fin_expenses_guard on public.fin_expenses;
create trigger fin_expenses_guard before insert or update or delete on public.fin_expenses for each row execute function public.fin_expenses_guard();
drop trigger if exists fin_expenses_first_period on public.fin_expenses;
create trigger fin_expenses_first_period after insert on public.fin_expenses for each row execute function public.fin_expenses_first_period();
drop trigger if exists fin_periods_guard on public.fin_periods;
create trigger fin_periods_guard before insert or update or delete on public.fin_periods for each row execute function public.fin_periods_guard();
drop trigger if exists fin_payments_guard on public.fin_payments;
create trigger fin_payments_guard before insert or update or delete on public.fin_payments for each row execute function public.fin_payments_guard();
drop trigger if exists fin_documents_guard on public.fin_documents;
create trigger fin_documents_guard before insert or update or delete on public.fin_documents for each row execute function public.fin_documents_guard();

-- ── 4. RLS, grants, audit ──────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['fin_expenses', 'fin_periods', 'fin_payments', 'fin_documents', 'fin_imports', 'fin_import_rows'] loop
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

-- ── 5. New periods: idempotent, never "paid" by themselves ─────────
-- Creates the missing periods of active recurring expenses up to p_until
-- (default today + 45 days, at most one year ahead). New periods take the
-- definition's CURRENT amount; existing periods are never touched.
create or replace function public.fin_roll_periods(p_until date default null) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  e public.fin_expenses%rowtype;
  lim date := least(coalesce(p_until, current_date + 45), current_date + 366);
  step interval;
  n integer;
  due date;
  made integer := 0;
  k integer;
begin
  if not (public.can_finance() or current_user in ('service_role', 'postgres')) then raise exception 'Yetki yok.' using errcode = '42501'; end if;
  for e in select * from public.fin_expenses where kind = 'recurring' and archived_at is null loop
    step := case e.recurrence when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' else interval '1 year' end;
    select coalesce(max(seq) + 1, 0) into n from public.fin_periods where expense_id = e.id;
    loop
      due := (e.first_due_on + step * n)::date;
      exit when due > lim or (e.ends_on is not null and due > e.ends_on) or n > 1000;
      insert into public.fin_periods (expense_id, seq, starts_on, ends_on, due_on, amount, currency)
      values (e.id, n, due, (e.first_due_on + step * (n + 1))::date - 1, due, e.amount, e.currency)
      on conflict (expense_id, seq) do nothing;
      get diagnostics k = row_count;
      made := made + k;
      n := n + 1;
    end loop;
  end loop;
  return made;
end $$;
revoke all on function public.fin_roll_periods(date) from public, anon;
grant execute on function public.fin_roll_periods(date) to authenticated, service_role;

-- Apply a previewed import in ONE transaction (security invoker: RLS + guards).
-- p_rows: [{key, row, hash, name, category, action, recurrence, variable, amount,
--           due, method, note, payload}] — produced by the panel's preview.
--   same key + same hash      → nothing (already imported)
--   same key + different hash → stored as "changed" on the existing row; the
--                               expense / period / payment are NOT touched
--   new key, create           → expense + its first period (source amount)
--   new key, pending_payment  → same, period "İnceleme bekliyor" (paid in the
--                               source without a payment date; no payment invented)
--   new key, other actions    → kept as an import row only (nothing created)
--   skip_blank                → not stored
-- No notification is sent by this function.
create or replace function public.fin_import_apply(p_file_name text, p_file_sha256 text, p_sheet text, p_month text, p_summary jsonb, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  imp uuid;
  r jsonb;
  ex public.fin_import_rows%rowtype;
  e_id uuid;
  p_id uuid;
  act text;
  n_created integer := 0; n_held integer := 0; n_already integer := 0; n_changed integer := 0; n_skipped integer := 0;
begin
  if not public.can_finance() then raise exception 'Yetki yok.' using errcode = '42501'; end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Aktarım ayı gerekli (YYYY-MM).'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Geçersiz satır listesi.'; end if;
  insert into public.fin_imports (file_name, file_sha256, sheet, period_month, summary)
  values (p_file_name, p_file_sha256, p_sheet, p_month, coalesce(p_summary, '{}'::jsonb)) returning id into imp;
  for r in select value from jsonb_array_elements(p_rows) loop
    act := r->>'action';
    if act = 'skip_blank' then n_skipped := n_skipped + 1; continue; end if;
    if (r->>'key') is null or (r->>'hash') is null or (r->>'row') is null then raise exception 'Eksik satır anahtarı.'; end if;
    select * into ex from public.fin_import_rows where source_key = r->>'key' for update;
    if found then
      if ex.row_hash = r->>'hash' then n_already := n_already + 1;
      else
        if ex.changed_hash is distinct from r->>'hash' then
          update public.fin_import_rows set changed_payload = r->'payload', changed_hash = r->>'hash', changed_import_id = imp, changed_at = now() where id = ex.id;
        end if;
        n_changed := n_changed + 1;
      end if;
      continue;
    end if;
    e_id := null; p_id := null;
    if act in ('create', 'pending_payment') then
      if (r->>'amount') is null or (r->>'due') is null then raise exception 'Satır %: tutar ve vade olmadan gider oluşturulamaz.', r->>'row'; end if;
      insert into public.fin_expenses (title, category, kind, recurrence, first_due_on, amount, currency, pay_method, note)
      values (r->>'name', r->>'category',
              case when r->>'recurrence' = 'monthly' then 'recurring' else 'once' end,
              case when r->>'recurrence' = 'monthly' then 'monthly' end,
              (r->>'due')::date,
              case when coalesce((r->>'variable')::boolean, false) then null else (r->>'amount')::numeric end,
              'TRY', nullif(r->>'method', ''), nullif(r->>'note', ''))
      returning id into e_id;
      select id into p_id from public.fin_periods where expense_id = e_id and seq = 0;
      update public.fin_periods
         set amount = (r->>'amount')::numeric,
             review_note = case when act = 'pending_payment' then 'Excel’de “Ödendi” işaretli; ödeme tarihi bilinmiyor. Gerçek tarih girilince ödemeyi kaydedin.' end
       where id = p_id;
      n_created := n_created + 1;
    else
      n_held := n_held + 1;
    end if;
    insert into public.fin_import_rows (import_id, source_key, file_name, sheet, source_row, row_hash, payload, plan, action, expense_id, period_id)
    values (imp, r->>'key', p_file_name, p_sheet, (r->>'row')::integer, r->>'hash', coalesce(r->'payload', '{}'::jsonb), r - 'payload', act, e_id, p_id);
  end loop;
  update public.fin_imports set summary = summary || jsonb_build_object('created', n_created, 'held', n_held, 'already', n_already, 'changed', n_changed, 'skipped', n_skipped) where id = imp;
  return jsonb_build_object('import_id', imp, 'created', n_created, 'held', n_held, 'already', n_already, 'changed', n_changed, 'skipped', n_skipped);
end $$;
revoke all on function public.fin_import_apply(text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.fin_import_apply(text, text, text, text, jsonb, jsonb) to authenticated;

-- ── 6. Operasyon provider costs for finance (read-only, minimal fields) ─
-- Owner views (they read ops_* as the owner) filtered by can_finance().
create or replace view public.fin_ops_periods with (security_barrier = true) as
  select p.id, p.service_id, s.name as service_name, s.kind as service_kind,
         s.provider_id, coalesce(nullif(pr.brand_name, ''), pr.name) as provider_name,
         s.payer_party, p.starts_on, p.ends_on, p.due_on, p.status,
         coalesce(p.actual_cost, p.expected_cost) as amount, p.cost_currency as currency,
         (s.archived_at is not null) as service_archived
    from public.ops_periods p
    join public.ops_services s on s.id = p.service_id
    left join public.clients pr on pr.id = s.provider_id
   where public.can_finance()
     and p.status <> 'cancelled'
     and (s.payer_party not in ('client', 'other')
          or exists (select 1 from public.ops_payments x where x.period_id = p.id and x.direction = 'out'));

create or replace view public.fin_ops_payments with (security_barrier = true) as
  select pay.id, pay.period_id, pay.service_id, pay.kind, pay.amount, pay.currency, pay.paid_on, pay.method, pay.reference,
         pay.voided_at, pay.void_reason, pay.created_by, pay.created_at
    from public.ops_payments pay
   where public.can_finance() and pay.direction = 'out';

-- Firms finance users may pick as "sağlayıcı/firma": id and display name only.
create or replace view public.fin_parties with (security_barrier = true) as
  select c.id, coalesce(nullif(c.brand_name, ''), c.name) as name, c.roles
    from public.clients c
   where public.can_finance() and c.archived_at is null and 'provider' = any (coalesce(c.roles, '{}'::text[]));

revoke all on public.fin_ops_periods, public.fin_ops_payments, public.fin_parties from public, anon, authenticated;
grant select on public.fin_ops_periods, public.fin_ops_payments, public.fin_parties to authenticated, service_role;

-- Record / void an Operasyon provider payment (the same ops_payments row).
create or replace function public.fin_ops_pay(p_period uuid, p_kind text, p_amount numeric, p_currency text, p_paid_on date,
  p_method text, p_reference text, p_request_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  per public.ops_periods%rowtype;
  new_id uuid;
begin
  if not public.can_finance() then raise exception 'Yetki yok.' using errcode = '42501'; end if;
  -- Only a payment TO the provider (direction 'out'): payment, refund from the provider, or adjustment.
  -- Customer collections (direction 'in'), prices and every other Operasyon field are out of reach.
  if p_kind is null or p_kind not in ('payment', 'refund', 'adjustment') then raise exception 'Geçersiz işlem türü: yalnızca sağlayıcı ödemesi, iade veya düzeltme.' using errcode = '22023'; end if;
  if p_amount is null or (p_kind = 'adjustment' and p_amount = 0) or (p_kind <> 'adjustment' and p_amount <= 0) then raise exception 'Geçersiz tutar.' using errcode = '22023'; end if;
  if p_request_key is null then raise exception 'İstek anahtarı gerekli.'; end if;
  select id into new_id from public.ops_payments where request_key = p_request_key and direction = 'out' and period_id = p_period;
  if found then return new_id; end if;
  if exists (select 1 from public.ops_payments where request_key = p_request_key) then raise exception 'İstek anahtarı başka bir kayda ait.' using errcode = '22023'; end if;
  select * into per from public.ops_periods where id = p_period;
  if not found or not exists (select 1 from public.fin_ops_periods v where v.id = p_period) then raise exception 'Operasyon dönemi bulunamadı.'; end if;
  if per.cost_currency is not null and p_currency <> per.cost_currency then
    raise exception 'Ödemenin para birimi (%) dönemin maliyet para birimiyle (%) aynı olmalı.', p_currency, per.cost_currency using errcode = '23514';
  end if;
  if p_paid_on is null or p_paid_on > current_date + 1 then raise exception 'Geçerli bir ödeme tarihi gerekli.' using errcode = '23514'; end if;
  insert into public.ops_payments (period_id, service_id, direction, kind, amount, currency, paid_on, method, reference, request_key, created_by)
  values (per.id, per.service_id, 'out', p_kind, p_amount, p_currency, p_paid_on, p_method, p_reference, p_request_key, public.doc_actor())
  on conflict (request_key) do nothing
  returning id into new_id;
  if new_id is null then select id into new_id from public.ops_payments where request_key = p_request_key; end if;
  return new_id;
end $$;

create or replace function public.fin_ops_void(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_finance() then raise exception 'Yetki yok.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'İptal gerekçesi gerekli.' using errcode = '23514'; end if;
  update public.ops_payments set voided_at = now(), void_reason = btrim(p_reason)
   where id = p_payment and direction = 'out' and voided_at is null;
  if not found then raise exception 'Sağlayıcı ödemesi bulunamadı ya da zaten iptal edilmiş.'; end if;
end $$;

-- Finance history: who did what on expenses, periods, payments, files and on
-- Operasyon PROVIDER payments only — never the general audit_log (other modules)
-- and, for ops_payments, only the payment fields (no note / customer link).
create or replace view public.fin_audit with (security_barrier = true) as
  select a.id, a.at, a.actor, a.action, a.entity, a.entity_id, a.label,
         case when a.entity = 'ops_payments'
              then (select jsonb_object_agg(e.k, e.v) from jsonb_each(coalesce(a.changes, '{}'::jsonb)) as e(k, v)
                     where e.k in ('kind', 'amount', 'currency', 'paid_on', 'method', 'reference', 'voided_at', 'void_reason'))
              else a.changes end as changes
    from public.audit_log a
   where public.can_finance()
     and (a.entity in ('fin_expenses', 'fin_periods', 'fin_payments', 'fin_documents', 'fin_imports', 'fin_import_rows')
          or (a.entity = 'ops_payments'
              and exists (select 1 from public.ops_payments x where x.id::text = a.entity_id and x.direction = 'out')));
revoke all on public.fin_audit from public, anon, authenticated;
grant select on public.fin_audit to authenticated, service_role;

revoke all on function public.fin_ops_pay(uuid, text, numeric, text, date, text, text, uuid) from public, anon;
revoke all on function public.fin_ops_void(uuid, text) from public, anon;
grant execute on function public.fin_ops_pay(uuid, text, numeric, text, date, text, text, uuid) to authenticated;
grant execute on function public.fin_ops_void(uuid, text) to authenticated;

-- ops_payments: append-only (void with a reason; no edits after the fact).
create or replace function public.ops_payments_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.voided_at is not null then raise exception 'İptal edilmiş ödeme kaydı değiştirilemez.' using errcode = '42501'; end if;
  if (new.period_id, new.service_id, new.direction, new.kind, new.amount, new.currency, new.paid_on, new.method, new.reference, new.note,
      new.client_id, new.request_key, new.created_by, new.created_at)
     is distinct from (old.period_id, old.service_id, old.direction, old.kind, old.amount, old.currency, old.paid_on, old.method, old.reference, old.note,
      old.client_id, old.request_key, old.created_by, old.created_at) then
    raise exception 'Ödeme kaydı değiştirilemez; iptal edip yeni kayıt ekleyin.' using errcode = '42501';
  end if;
  if new.voided_at is not null and length(btrim(coalesce(new.void_reason, ''))) < 3 then
    raise exception 'İptal gerekçesi gerekli.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists ops_payments_append_only on public.ops_payments;
create trigger ops_payments_append_only before update on public.ops_payments for each row execute function public.ops_payments_append_only();

-- ── 7. Private bucket "fin-docs" ───────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fin-docs', 'fin-docs', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "finance read fin docs" on storage.objects;
create policy "finance read fin docs" on storage.objects for select to authenticated using (bucket_id = 'fin-docs' and public.can_finance());
drop policy if exists "finance add fin docs" on storage.objects;
create policy "finance add fin docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'fin-docs' and public.can_finance() and name ~ '^(expense|period|payment|ops_period|ops_payment)/[0-9a-f-]{36}/[^/]+$');
-- no update / delete policy: files are never overwritten or removed through the API

commit;

-- After the migration, add the finance user (e-mail given by the owner; the
-- Supabase Auth user is created / invited separately):
--   insert into public.admin_users (email, note, role) values ('<e-posta>', 'Finans sorumlusu', 'finance');
--
-- Check (read-only):
--   select email, role from public.admin_users order by role, email;
--   select tablename, policyname, cmd from pg_policies where tablename like 'fin\_%' order by 1, 2;
--
-- Undo (not recommended once expenses are recorded; it drops their history):
--   begin;
--   drop trigger if exists ops_payments_append_only on public.ops_payments;
--   drop function if exists public.ops_payments_append_only();
--   drop function if exists public.fin_ops_pay(uuid, text, numeric, text, date, text, text, uuid);
--   drop function if exists public.fin_ops_void(uuid, text);
--   drop view if exists public.fin_audit, public.fin_ops_periods, public.fin_ops_payments, public.fin_parties;
--   drop function if exists public.fin_roll_periods(date);
--   drop function if exists public.fin_import_apply(text, text, text, text, jsonb, jsonb);
--   drop table if exists public.fin_import_rows, public.fin_imports;
--   drop function if exists public.fin_imports_guard(), public.fin_import_rows_guard();
--   drop table if exists public.fin_documents, public.fin_payments, public.fin_periods, public.fin_expenses;
--   drop function if exists public.fin_expenses_guard(), public.fin_expenses_first_period(), public.fin_periods_guard(),
--     public.fin_payments_guard(), public.fin_documents_guard(), public.fin_valid_paid(uuid);
--   delete from public.admin_users where role = 'finance';
--   create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $f$
--     select exists (select 1 from public.admin_users where email = lower(coalesce(auth.jwt() ->> 'email', ''))) $f$;
--   drop function if exists public.is_finance(), public.can_finance(), public.panel_role();
--   alter table public.admin_users drop constraint if exists admin_users_role_check, drop column if exists role;
--   drop policy if exists "finance read fin docs" on storage.objects;
--   drop policy if exists "finance add fin docs" on storage.objects;
--   commit;
--   (the bucket "fin-docs" and its files are left in place)
