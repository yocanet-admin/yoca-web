-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v18 (Operasyon: müşteriler, hizmetler, yenilemeler,
-- ödemeler, sağlayıcılar, lisans bağlantıları, bakım ve teslim)
--
-- Relation: client (public.clients) → projects → services/assets →
-- periods (renewals) → payments; licenses stay in license.yoca.net and are
-- only LINKED here (ops_license_links), never copied as a second source.
--
-- What changes in existing tables (additive only, no row data rewritten):
--   public.clients  + party_type, roles, brand_name, legal_name, address,
--                     billing, preferred_channel, owner_email, tags,
--                     support_contact, panel_url, archived_at
--                     (existing rows: party_type 'company', roles {customer})
--   public.contact_submissions / checkup_submissions + client_id (nullable link
--                     to the client; existing leads stay unlinked, admin-only to set)
-- New tables (all admin-only through public.is_admin(), audit-logged):
--   client_contacts, ops_projects, ops_provider_accounts, ops_services,
--   ops_service_links, ops_service_relations, ops_periods, ops_payments,
--   ops_documents, ops_work_logs, ops_tasks, ops_notifications,
--   ops_license_links, ops_license_ops
-- Storage: private bucket "ops-docs" (20 MB, documents/images only).
--
-- Money: numeric(14,2); totals are per currency, never mixed. An empty
-- amount is NULL ("bilinmiyor"), never 0. Dates that are due dates are
-- `date` (Istanbul calendar day); moments are timestamptz.
-- Finance history is protected: periods/payments/work logs reference their
-- service and client with ON DELETE RESTRICT; records are archived or voided,
-- not deleted.
--
-- Requires: v8 (clients), v9 (audit_log, audit_row), v10 PART A (is_admin()).
-- Idempotent; safe to re-run. Safe with the previous app version (it never
-- reads the new columns/tables; the CRM keeps working).
-- Undo: see the end of this file.
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.clients') is null then raise exception 'v18 durduruldu: public.clients yok (v8 gerekli).'; end if;
  if to_regprocedure('public.is_admin()') is null then raise exception 'v18 durduruldu: public.is_admin() yok (v10 PART A gerekli).'; end if;
  if to_regprocedure('public.audit_row()') is null then raise exception 'v18 durduruldu: public.audit_row() yok (v9 gerekli).'; end if;
end;
$$;

-- ── 1. Clients and firms (existing CRM table, extended) ───────────
alter table public.clients
  add column if not exists party_type text not null default 'company',
  add column if not exists roles text[] not null default '{customer}',
  add column if not exists brand_name text,
  add column if not exists legal_name text,
  add column if not exists address text,
  add column if not exists billing jsonb not null default '{}'::jsonb,
  add column if not exists preferred_channel text,
  add column if not exists owner_email text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists support_contact text,
  add column if not exists panel_url text,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_party_type_check') then
    alter table public.clients add constraint clients_party_type_check check (party_type in ('company', 'individual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_roles_check') then
    alter table public.clients add constraint clients_roles_check check (roles <@ array['customer', 'provider', 'partner']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_channel_check') then
    alter table public.clients add constraint clients_channel_check check (preferred_channel is null or preferred_channel in ('email', 'phone', 'whatsapp', 'telegram', 'other'));
  end if;
end;
$$;
create index if not exists idx_clients_roles on public.clients using gin (roles);

-- Leads ↔ client: a lead keeps its own record, status and history; client_id
-- only LINKS it to the client it belongs to (several leads per client, set by an
-- admin's explicit choice). Removing a client keeps the lead (set null).
alter table public.contact_submissions add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.checkup_submissions add column if not exists client_id uuid references public.clients(id) on delete set null;
create index if not exists idx_contact_submissions_client on public.contact_submissions (client_id);
create index if not exists idx_checkup_submissions_client on public.checkup_submissions (client_id);
-- The public forms can insert leads; only an admin may set or change the link.
create or replace function public.lead_client_link_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and not coalesce(public.is_admin(), false) then
    if tg_op = 'INSERT' then new.client_id := null;
    elsif new.client_id is distinct from old.client_id then new.client_id := old.client_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists contact_submissions_client_guard on public.contact_submissions;
create trigger contact_submissions_client_guard before insert or update on public.contact_submissions for each row execute function public.lead_client_link_guard();
drop trigger if exists checkup_submissions_client_guard on public.checkup_submissions;
create trigger checkup_submissions_client_guard before insert or update on public.checkup_submissions for each row execute function public.lead_client_link_guard();

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_client_contacts_client on public.client_contacts (client_id);

-- ── 2. Projects (stable ids; optional link to a portfolio slug in code) ─
create table if not exists public.ops_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete restrict,
  name text not null,
  work_slug text,
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  start_on date,
  delivered_on date,
  links jsonb not null default '[]'::jsonb,
  note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ops_projects_client on public.ops_projects (client_id);

-- ── 3. Provider accounts (several accounts at the same provider) ───
-- No secrets here: secret_ref only says WHERE the secret is kept.
create table if not exists public.ops_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.clients(id) on delete restrict,
  label text not null,
  account_ref text,
  login_hint text,
  panel_url text,
  secret_ref text,
  note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ops_accounts_provider on public.ops_provider_accounts (provider_id);

-- ── 4. Services and assets ─────────────────────────────────────────
create table if not exists public.ops_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('domain', 'hosting', 'vps', 'server', 'email', 'ssl', 'saas', 'maintenance', 'other')),
  status text not null default 'active' check (status in ('active', 'pending', 'suspended', 'cancelled', 'expired', 'unknown')),
  provider_id uuid references public.clients(id) on delete restrict,
  provider_account_id uuid references public.ops_provider_accounts(id) on delete set null,
  panel_url text,
  start_on date,
  end_on date,                 -- service end (current period); null = unknown, NOT unlimited
  is_perpetual boolean not null default false,  -- explicitly "süresiz"
  due_on date,                 -- payment due to the provider
  cancel_by date,              -- last day to cancel / give notice
  period text check (period is null or period in ('monthly', 'quarterly', 'yearly', 'custom', 'once')),
  period_months integer check (period_months is null or period_months between 1 and 120),
  auto_renew text not null default 'unknown' check (auto_renew in ('on', 'off', 'unknown')),
  owner_party text not null default 'unknown' check (owner_party in ('yoca', 'client', 'other', 'unknown')),
  owner_client_id uuid references public.clients(id) on delete restrict,
  payer_party text not null default 'unknown' check (payer_party in ('yoca', 'client', 'other', 'unknown')),
  payer_client_id uuid references public.clients(id) on delete restrict,
  renewer_party text not null default 'unknown' check (renewer_party in ('yoca', 'client', 'provider_auto', 'other', 'unknown')),
  team_owner text,
  cost_amount numeric(14, 2) check (cost_amount is null or cost_amount >= 0),
  cost_currency text check (cost_currency is null or cost_currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  price_amount numeric(14, 2) check (price_amount is null or price_amount >= 0),
  price_currency text check (price_currency is null or price_currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  details jsonb not null default '{}'::jsonb,        -- type-specific fields
  custom_fields jsonb not null default '[]'::jsonb,  -- [{label, value}]
  reminder_days integer[],                            -- null = defaults (30,14,7,1)
  cancel_reminder_days integer[],
  customer_notify boolean not null default false,
  customer_recipients text[] not null default '{}',
  tags text[] not null default '{}',
  note text,
  archived_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ops_services_kind on public.ops_services (kind, status);
create index if not exists idx_ops_services_end on public.ops_services (end_on);
create index if not exists idx_ops_services_provider on public.ops_services (provider_id);

-- client / project links (one service → many projects and clients)
create table if not exists public.ops_service_links (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.ops_services(id) on delete cascade,
  client_id uuid references public.clients(id) on delete restrict,
  project_id uuid references public.ops_projects(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint ops_service_links_one check ((client_id is null) <> (project_id is null))
);
create unique index if not exists ops_service_links_client_key on public.ops_service_links (service_id, client_id) where client_id is not null;
create unique index if not exists ops_service_links_project_key on public.ops_service_links (service_id, project_id) where project_id is not null;
create index if not exists idx_ops_links_client on public.ops_service_links (client_id);
create index if not exists idx_ops_links_project on public.ops_service_links (project_id);

create table if not exists public.ops_service_relations (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.ops_services(id) on delete cascade,
  related_id uuid not null references public.ops_services(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  constraint ops_service_relations_not_self check (service_id <> related_id)
);
create unique index if not exists ops_service_relations_key on public.ops_service_relations (least(service_id, related_id), greatest(service_id, related_id));

-- ── 5. Periods (renewal history; never overwritten) ────────────────
create table if not exists public.ops_periods (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.ops_services(id) on delete restrict,
  starts_on date,
  ends_on date,
  due_on date,                    -- provider payment due
  customer_due_on date,           -- customer collection due
  status text not null default 'open' check (status in ('open', 'renewed', 'closed', 'cancelled')),
  expected_cost numeric(14, 2) check (expected_cost is null or expected_cost >= 0),
  actual_cost numeric(14, 2) check (actual_cost is null or actual_cost >= 0),
  cost_currency text check (cost_currency is null or cost_currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  expected_price numeric(14, 2) check (expected_price is null or expected_price >= 0),
  price_currency text check (price_currency is null or price_currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  renewed_at timestamptz,         -- renewal verified at the provider
  renewed_by text,
  renewal_ref text,
  renewal_note text,
  next_period_id uuid references public.ops_periods(id) on delete set null,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ops_periods_one_open on public.ops_periods (service_id) where status = 'open';
create index if not exists idx_ops_periods_service on public.ops_periods (service_id, starts_on desc);

-- ── 6. Payments (collections from customers / payments to providers) ─
create table if not exists public.ops_payments (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.ops_periods(id) on delete restrict,
  service_id uuid not null references public.ops_services(id) on delete restrict,
  direction text not null check (direction in ('in', 'out')),   -- in: customer → Yoca, out: Yoca → provider
  kind text not null default 'payment' check (kind in ('payment', 'refund', 'adjustment')),
  amount numeric(14, 2) not null,
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  paid_on date not null,
  method text,
  reference text,
  note text,
  client_id uuid references public.clients(id) on delete restrict,
  request_key uuid unique,          -- double click / retry → one record
  voided_at timestamptz,            -- corrections keep the record
  void_reason text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint ops_payments_amount check ((kind = 'adjustment' and amount <> 0) or (kind <> 'adjustment' and amount > 0))
);
create index if not exists idx_ops_payments_period on public.ops_payments (period_id);
create index if not exists idx_ops_payments_service on public.ops_payments (service_id, paid_on desc);

-- ── 7. Documents (private bucket, metadata here) ───────────────────
create table if not exists public.ops_documents (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('client', 'project', 'service', 'provider', 'payment', 'period', 'work_log')),
  entity_id uuid not null,
  name text not null,
  path text not null unique,
  mime text,
  size_bytes integer check (size_bytes is null or size_bytes between 0 and 20971520),
  note text,
  uploaded_by text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_ops_documents_entity on public.ops_documents (entity, entity_id);

-- ── 8. Maintenance work logs and delivery / task checklist ─────────
create table if not exists public.ops_work_logs (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.ops_services(id) on delete restrict,
  project_id uuid references public.ops_projects(id) on delete restrict,
  worked_on date not null,
  minutes integer not null check (minutes > 0 and minutes <= 24 * 60),
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint ops_work_logs_target check (service_id is not null or project_id is not null)
);
create index if not exists idx_ops_work_logs_service on public.ops_work_logs (service_id, worked_on desc);

create table if not exists public.ops_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.ops_projects(id) on delete cascade,
  service_id uuid references public.ops_services(id) on delete cascade,
  kind text not null default 'task' check (kind in ('delivery', 'handover', 'task')),
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done', 'skipped')),
  owner_email text,
  due_on date,
  done_at timestamptz,
  sort integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_tasks_target check (project_id is not null or service_id is not null)
);
create index if not exists idx_ops_tasks_project on public.ops_tasks (project_id, sort);

-- ── 9. Reminder / notification log (dedupe + history + retries) ────
create table if not exists public.ops_notifications (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  service_id uuid references public.ops_services(id) on delete set null,
  period_id uuid references public.ops_periods(id) on delete set null,
  kind text not null check (kind in ('reminder', 'cancel_reminder', 'customer_reminder', 'digest')),
  offset_days integer,
  target_date date,
  audience text not null check (audience in ('team', 'customer')),
  recipients text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped', 'suppressed')),
  attempts integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ops_notifications_status on public.ops_notifications (status, next_attempt_at);
create index if not exists idx_ops_notifications_service on public.ops_notifications (service_id, created_at desc);

-- ── 10. Licenses: links to license.yoca.net (source of truth there) ─
create table if not exists public.ops_license_links (
  id uuid primary key default gen_random_uuid(),
  license_id text not null unique,     -- id in the license system
  client_id uuid references public.clients(id) on delete restrict,
  project_id uuid references public.ops_projects(id) on delete restrict,
  service_id uuid references public.ops_services(id) on delete set null,
  label text,
  snapshot jsonb,                      -- last data read from the license system
  last_synced_at timestamptz,          -- when snapshot was read (shown; never presented as live)
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every license action sent to the license system: one row per request key,
-- so a retry / double click never creates a second license, and an unknown
-- outcome (connection lost) is checked before anything is sent again.
create table if not exists public.ops_license_ops (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  action text not null check (action in ('create', 'extend', 'suspend', 'resume', 'revoke')),
  license_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'unknown')),
  response jsonb,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ── 11. updated_at, RLS (admin only), audit log ───────────────────
create or replace function public.ops_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['client_contacts', 'ops_projects', 'ops_provider_accounts', 'ops_services', 'ops_periods', 'ops_tasks', 'ops_notifications', 'ops_license_links'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
    execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function public.ops_touch()', t);
  end loop;
  foreach t in array array['client_contacts', 'ops_projects', 'ops_provider_accounts', 'ops_services', 'ops_service_links', 'ops_service_relations', 'ops_periods', 'ops_payments', 'ops_documents', 'ops_work_logs', 'ops_tasks', 'ops_notifications', 'ops_license_links', 'ops_license_ops'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin manage %1$s" on public.%1$I', t);
    execute format('create policy "admin manage %1$s" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  -- Audit (who / when / what): the same trigger as the rest of the admin.
  foreach t in array array['client_contacts', 'ops_projects', 'ops_provider_accounts', 'ops_services', 'ops_service_links', 'ops_service_relations', 'ops_periods', 'ops_payments', 'ops_documents', 'ops_work_logs', 'ops_tasks', 'ops_license_links', 'ops_license_ops'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

-- Payments are corrected (void / refund / adjustment), not deleted.
create or replace function public.ops_payments_no_delete() returns trigger language plpgsql as $$
begin raise exception 'Ödeme kaydı silinemez; iptal (void) veya düzeltme kaydı kullanın.'; end $$;
drop trigger if exists ops_payments_no_delete on public.ops_payments;
create trigger ops_payments_no_delete before delete on public.ops_payments for each row execute function public.ops_payments_no_delete();

-- A finished period keeps its dates and amounts (history is not overwritten).
create or replace function public.ops_periods_keep_history() returns trigger language plpgsql as $$
begin
  if old.status <> 'open' and (
    new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on or new.due_on is distinct from old.due_on
    or new.customer_due_on is distinct from old.customer_due_on or new.expected_cost is distinct from old.expected_cost
    or new.actual_cost is distinct from old.actual_cost or new.cost_currency is distinct from old.cost_currency
    or new.expected_price is distinct from old.expected_price or new.price_currency is distinct from old.price_currency
    or new.renewed_at is distinct from old.renewed_at or new.status is distinct from old.status or new.service_id is distinct from old.service_id) then
    raise exception 'Kapanmış dönemin tarih ve tutarları değiştirilemez; düzeltme için not veya ödeme düzeltmesi ekleyin.';
  end if;
  return new;
end $$;
drop trigger if exists ops_periods_keep_history on public.ops_periods;
create trigger ops_periods_keep_history before update on public.ops_periods for each row execute function public.ops_periods_keep_history();

-- Renewal verified at the provider: closes the open period and opens the next
-- one in ONE transaction (admin session; RLS and audit apply). Collections and
-- provider payments are not touched — they are separate records.
create or replace function public.ops_confirm_renewal(p_period uuid, p_new_end date, p_actual_cost numeric, p_ref text, p_note text, p_next_due date, p_next_customer_due date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  per public.ops_periods%rowtype;
  svc public.ops_services%rowtype;
  new_id uuid;
  who text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', 'sistem');
begin
  if not public.is_admin() then raise exception 'Yetki yok.'; end if;
  select * into per from public.ops_periods where id = p_period for update;
  if not found then raise exception 'Dönem bulunamadı.'; end if;
  if per.status <> 'open' then raise exception 'Bu dönem zaten kapatılmış (%): yenileme ikinci kez kaydedilmedi.', per.status; end if;
  if p_new_end is null then raise exception 'Yeni bitiş tarihi gerekli.'; end if;
  if per.ends_on is not null and p_new_end <= per.ends_on then raise exception 'Yeni bitiş tarihi mevcut bitişten (%) sonra olmalı.', per.ends_on; end if;
  select * into svc from public.ops_services where id = per.service_id for update;
  update public.ops_periods set actual_cost = coalesce(p_actual_cost, actual_cost) where id = p_period;
  update public.ops_periods set status = 'renewed', renewed_at = now(), renewed_by = who, renewal_ref = p_ref, renewal_note = p_note where id = p_period;
  insert into public.ops_periods (service_id, starts_on, ends_on, due_on, customer_due_on, status, expected_cost, cost_currency, expected_price, price_currency, created_by)
  values (svc.id, coalesce(per.ends_on + 1, current_date), p_new_end, p_next_due, p_next_customer_due, 'open', svc.cost_amount, svc.cost_currency, svc.price_amount, svc.price_currency, who)
  returning id into new_id;
  update public.ops_periods set next_period_id = new_id where id = p_period;
  update public.ops_services set end_on = p_new_end, due_on = p_next_due,
    status = case when status in ('expired', 'unknown', 'pending') then 'active' else status end
  where id = svc.id;
  return new_id;
end $$;
revoke all on function public.ops_confirm_renewal(uuid, date, numeric, text, text, date, date) from anon, public;
grant execute on function public.ops_confirm_renewal(uuid, date, numeric, text, text, date, date) to authenticated;

-- ── 12. Private document bucket ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ops-docs', 'ops-docs', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "admin read ops docs" on storage.objects;
create policy "admin read ops docs" on storage.objects for select to authenticated using (bucket_id = 'ops-docs' and public.is_admin());
drop policy if exists "admin write ops docs" on storage.objects;
create policy "admin write ops docs" on storage.objects for insert to authenticated with check (bucket_id = 'ops-docs' and public.is_admin());
drop policy if exists "admin update ops docs" on storage.objects;
create policy "admin update ops docs" on storage.objects for update to authenticated using (bucket_id = 'ops-docs' and public.is_admin());

commit;

-- ═══ Undo (only if needed; drops ONLY what v18 added) ══════════════
-- WARNING: dropping the tables deletes every Operasyon record entered since.
-- Before any real data is entered this is lossless; afterwards prefer leaving
-- v18 in place and rolling back only the app (the old app never reads it).
-- begin;
--   drop table if exists public.ops_license_ops, public.ops_license_links, public.ops_notifications,
--     public.ops_tasks, public.ops_work_logs, public.ops_documents, public.ops_payments, public.ops_periods,
--     public.ops_service_relations, public.ops_service_links, public.ops_services, public.ops_provider_accounts,
--     public.ops_projects, public.client_contacts cascade;
--   drop function if exists public.ops_touch(), public.ops_payments_no_delete(), public.ops_periods_keep_history(),
--     public.ops_confirm_renewal(uuid, date, numeric, text, text, date, date);
--   drop policy if exists "admin read ops docs" on storage.objects; (… write / update)
--   alter table public.clients drop column if exists party_type, drop column if exists roles, … (the 12 above);
--   drop trigger if exists contact_submissions_client_guard on public.contact_submissions;
--   drop trigger if exists checkup_submissions_client_guard on public.checkup_submissions;
--   drop function if exists public.lead_client_link_guard();
--   alter table public.contact_submissions drop column if exists client_id;  (lead rows stay; only the link goes)
--   alter table public.checkup_submissions drop column if exists client_id;
-- commit;
-- The bucket "ops-docs" is left in place by the undo (it may hold uploaded files).
