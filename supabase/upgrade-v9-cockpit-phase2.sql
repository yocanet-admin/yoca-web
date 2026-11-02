-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v9: cockpit phase 2
-- Run ONCE in the Supabase SQL editor after v8 (safe to re-run).
--   1. cockpit_settings: notification settings (e-mail, Telegram chat,
--      on/off switches) + small cron state (last morning summary).
--   2. monitored_sites: alert state so a site alert fires once per
--      incident (2 failed checks in a row) and once on recovery.
--   3. AI lead summary columns on both lead tables.
--   4. audit_log + triggers: every insert / update / delete on the
--      admin tables is recorded with who did it (admin e-mail,
--      "site" for public forms, "sistem" for cron/server).
-- Nothing is deleted; existing rows are untouched.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Settings ─────────────────────────────────────────────────
create table if not exists public.cockpit_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.cockpit_settings enable row level security;
drop policy if exists "auth manage cockpit settings" on public.cockpit_settings;
create policy "auth manage cockpit settings" on public.cockpit_settings
  for all to authenticated using (true) with check (true);

insert into public.cockpit_settings (key, value) values
  ('notify', jsonb_build_object(
    'email_to', 'connect@yoca.net',
    'telegram_chat_id', null,
    'lead_alerts', true,
    'site_alerts', true,
    'morning_summary', true
  )),
  ('state', '{}'::jsonb)
on conflict (key) do nothing;

-- ── 2. Site alert state ─────────────────────────────────────────
alter table public.monitored_sites
  add column if not exists last_state text,
  add column if not exists fail_count int not null default 0,
  add column if not exists alerted boolean not null default false,
  add column if not exists signature_alerted boolean not null default false,
  add column if not exists last_checked_at timestamptz;

-- ── 3. AI lead summary ──────────────────────────────────────────
alter table public.contact_submissions
  add column if not exists ai_summary jsonb,
  add column if not exists ai_summary_at timestamptz;
alter table public.checkup_submissions
  add column if not exists ai_summary jsonb,
  add column if not exists ai_summary_at timestamptz;

-- ── 4. Audit log ────────────────────────────────────────────────
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text,
  action text not null,
  entity text not null,
  entity_id text,
  label text,
  changes jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);
alter table public.audit_log enable row level security;
drop policy if exists "auth read audit log" on public.audit_log;
create policy "auth read audit log" on public.audit_log for select to authenticated using (true);
drop policy if exists "auth add audit log" on public.audit_log;
create policy "auth add audit log" on public.audit_log for insert to authenticated with check (true);

-- Long texts (article bodies, messages) are shortened in the log.
create or replace function public.audit_trim(v jsonb) returns jsonb
language sql immutable as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 160 then to_jsonb(left(v #>> '{}', 160) || '…')
    when jsonb_typeof(v) in ('object', 'array') and length(v::text) > 160 then to_jsonb('(' || length(v::text) || ' karakterlik veri)')
    else v
  end
$$;

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_j jsonb := coalesce(new_j, old_j);
  -- bookkeeping columns written by the app / cron; changing only these is not an event
  quiet text[] := array['updated_at', 'last_state', 'fail_count', 'alerted', 'signature_alerted', 'last_checked_at', 'ai_summary', 'ai_summary_at'];
  diff jsonb;
  who text;
  claims jsonb;
begin
  -- cron bookkeeping (last morning summary etc.) is not an admin event
  if tg_table_name = 'cockpit_settings' and row_j ->> 'key' = 'state' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('from', public.audit_trim(old_j -> k), 'to', public.audit_trim(new_j -> k)))
      into diff
      from jsonb_object_keys(new_j) as k
     where not (k = any (quiet)) and (old_j -> k) is distinct from (new_j -> k);
    if diff is null then
      return new;
    end if;
  end if;

  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  who := coalesce(
    nullif(claims ->> 'email', ''),
    -- public forms insert through the server (service role): show them as the website
    case when tg_op = 'INSERT' and tg_table_name in ('contact_submissions', 'checkup_submissions') then 'site' end,
    case claims ->> 'role' when 'anon' then 'site' else 'sistem' end
  );

  insert into public.audit_log (actor, action, entity, entity_id, label, changes)
  values (
    who,
    lower(tg_op),
    tg_table_name,
    row_j ->> 'id',
    left(coalesce(row_j ->> 'name', row_j ->> 'title', row_j ->> 'label', row_j ->> 'key', row_j #>> '{contact_info_json,name}', row_j ->> 'email', ''), 140),
    diff
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'contact_submissions', 'checkup_submissions',
    'clients', 'deals', 'activities', 'monitored_sites',
    'sections', 'menus', 'site_content', 'team_members',
    'case_studies', 'insights', 'insight_categories', 'cockpit_settings'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
      execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
    end if;
  end loop;
end;
$$;
