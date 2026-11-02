-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v8: admin cockpit (lead pipeline + client site monitor)
-- Run ONCE in the Supabase SQL editor (safe to re-run).
--   1. Lead pipeline fields on contact_submissions and checkup_submissions
--      (status, note, follow-up date, last update) + update policies.
--   2. monitored_sites: the client websites the cockpit checks
--      (uptime, SSL, domain, "Built by YOCA" signature).
--   3. CRM: clients, deals (opportunities with value) and activities
--      (notes, calls, e-mails, meetings, dated tasks).
--   4. spam_log: what the form spam filter dropped (reasons only, no personal data).
-- Nothing is deleted; existing rows become status 'new'.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Lead pipeline ────────────────────────────────────────────
alter table public.contact_submissions
  add column if not exists status text not null default 'new',
  add column if not exists note text not null default '',
  add column if not exists follow_up_on date,
  add column if not exists updated_at timestamptz;

alter table public.checkup_submissions
  add column if not exists status text not null default 'new',
  add column if not exists note text not null default '',
  add column if not exists follow_up_on date,
  add column if not exists updated_at timestamptz;

alter table public.contact_submissions drop constraint if exists contact_submissions_status_check;
alter table public.contact_submissions
  add constraint contact_submissions_status_check
  check (status in ('new', 'contacted', 'proposal', 'won', 'lost', 'spam'));

alter table public.checkup_submissions drop constraint if exists checkup_submissions_status_check;
alter table public.checkup_submissions
  add constraint checkup_submissions_status_check
  check (status in ('new', 'contacted', 'proposal', 'won', 'lost', 'spam'));

create index if not exists idx_contact_status on public.contact_submissions (status);
create index if not exists idx_checkup_status on public.checkup_submissions (status);

-- Signed-in admins may update lead status / note (insert stays public, read/delete already admin-only).
drop policy if exists "auth update contact" on public.contact_submissions;
create policy "auth update contact"
  on public.contact_submissions for update
  to authenticated using (true) with check (true);

drop policy if exists "auth update checkup" on public.checkup_submissions;
create policy "auth update checkup"
  on public.checkup_submissions for update
  to authenticated using (true) with check (true);

-- ── 2. Client site monitor ──────────────────────────────────────
create table if not exists public.monitored_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  -- the site should carry the "Built by YOCA" signature
  expects_signature boolean not null default true,
  -- optional manual dates (hosting is not visible from outside)
  hosting_renews_on date,
  note text not null default '',
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.monitored_sites enable row level security;

drop policy if exists "auth manage monitored sites" on public.monitored_sites;
create policy "auth manage monitored sites"
  on public.monitored_sites for all
  to authenticated using (true) with check (true);

-- Seed once (only when the table is empty).
insert into public.monitored_sites (name, url, expects_signature, order_index)
select * from (values
  ('Yoca', 'https://yoca.net', false, 0),
  ('Prime Wash Car', 'https://primewashcar.com', true, 1),
  ('SP Medya', 'https://www.spmedya.com', true, 2),
  ('SunSoft', 'https://sunsoft.az', true, 3),
  ('Cleova', 'https://thecleova.com', false, 4)
) as seed(name, url, expects_signature, order_index)
where not exists (select 1 from public.monitored_sites);

-- ── 3. CRM ──────────────────────────────────────────────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- company / brand
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  -- prospect → active client → past client
  status text not null default 'prospect' check (status in ('prospect', 'active', 'past')),
  note text not null default '',
  source_type text check (source_type in ('contact', 'checkup', 'manual')),
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  value numeric(14, 2) not null default 0,
  currency text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR', 'AZN', 'GBP')),
  stage text not null default 'discovery' check (stage in ('discovery', 'proposal', 'negotiation', 'won', 'lost')),
  expected_close date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  kind text not null default 'note' check (kind in ('note', 'call', 'email', 'meeting', 'task')),
  body text not null default '',
  due_on date,                            -- tasks only
  done boolean not null default false,    -- tasks only
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_deals_client on public.deals (client_id);
create index if not exists idx_deals_stage on public.deals (stage);
create index if not exists idx_activities_client on public.activities (client_id, created_at desc);
create index if not exists idx_activities_tasks on public.activities (kind, done, due_on);

alter table public.clients enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;

drop policy if exists "auth manage clients" on public.clients;
create policy "auth manage clients" on public.clients for all to authenticated using (true) with check (true);
drop policy if exists "auth manage deals" on public.deals;
create policy "auth manage deals" on public.deals for all to authenticated using (true) with check (true);
drop policy if exists "auth manage activities" on public.activities;
create policy "auth manage activities" on public.activities for all to authenticated using (true) with check (true);

-- ── 4. Spam log (written by the server with the service role) ──
create table if not exists public.spam_log (
  id bigint generated by default as identity primary key,
  form text not null check (form in ('contact', 'checkup')),
  reasons text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_spam_created on public.spam_log (created_at desc);

alter table public.spam_log enable row level security;

drop policy if exists "auth read spam log" on public.spam_log;
create policy "auth read spam log" on public.spam_log for select to authenticated using (true);
