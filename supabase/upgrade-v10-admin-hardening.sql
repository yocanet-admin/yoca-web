-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v10: admin hardening
-- Run in the Supabase SQL editor after v9 (safe to re-run).
--
-- PART A (safe — run it):
--   1. admin_users table + is_admin() function (the admin allowlist,
--      ready for the RLS policies; nothing uses it until PART B).
--   2. audit_log: signed-in users can no longer write fake entries
--      (the audit trigger runs as security definer and keeps working).
--   3. audit_row(): activities are labelled with their text in the log.
--
-- PART B (OPTIONAL — commented out): switch every admin policy from
--   "any signed-in user" to is_admin(). Read the checklist there first.
--
-- Nothing is deleted; existing rows are untouched.
-- ═══════════════════════════════════════════════════════════════

-- ── A1. Admin allowlist ─────────────────────────────────────────
create table if not exists public.admin_users (
  email text primary key check (email = lower(email)),
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
-- No policies on purpose: only the SQL editor / service role can read or change it.

-- !!! Add yourself (and every other admin) BEFORE running PART B, e.g.:
--   insert into public.admin_users (email, note) values ('mg@yoca.net', 'owner') on conflict do nothing;
-- Check with:  select * from public.admin_users;

-- True when the signed-in user's e-mail is in admin_users.
-- security definer: it may read admin_users even though the table has no policies.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ── A2. Audit log is written only by the trigger ────────────────
drop policy if exists "auth add audit log" on public.audit_log;

-- ── A3. audit_row(): same as v9, label also falls back to "body" ─
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
    left(coalesce(
      nullif(row_j ->> 'name', ''),
      nullif(row_j ->> 'title', ''),
      nullif(row_j ->> 'label', ''),
      nullif(row_j ->> 'key', ''),
      nullif(row_j #>> '{contact_info_json,name}', ''),
      nullif(row_j ->> 'email', ''),
      -- activities (notes, calls, tasks): first line of the text
      nullif(split_part(row_j ->> 'body', E'\n', 1), ''),
      ''
    ), 140),
    diff
  );
  return coalesce(new, old);
end;
$$;


-- ═══════════════════════════════════════════════════════════════
-- PART B — OPTIONAL: only admins in admin_users may manage data.
--
-- Checklist BEFORE removing the comment markers:
--   [ ] select * from public.admin_users;  lists EVERY admin e-mail
--       (exactly as they sign in; lower-case).
--   [ ] Sign in to /admin once more after running it and open Leadler,
--       Müşteriler, Siteler and Ayarlar. If something is empty, add the
--       missing e-mail to admin_users — no data is lost, only hidden.
-- Public reads (published content) and public form inserts are unchanged.
-- Server jobs (cron, alerts, AI) use the service role and are unaffected.
-- To undo: re-run the policy blocks of schema.sql / upgrade-v3, v6, v8, v9.
-- ═══════════════════════════════════════════════════════════════
/*
do $$
declare
  p record;
begin
  -- every "auth …" policy (role: authenticated) on the admin tables → is_admin()
  for p in
    select schemaname, tablename, policyname, cmd
      from pg_policies
     where schemaname = 'public'
       and 'authenticated' = any (roles)
       and tablename in (
         'sections', 'menus', 'team_members', 'site_content', 'case_studies',
         'checkup_submissions', 'contact_submissions',
         'insight_categories', 'insights', 'insight_revisions', 'ai_runs',
         'monitored_sites', 'clients', 'deals', 'activities', 'spam_log',
         'cockpit_settings', 'audit_log'
       )
  loop
    if p.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check (public.is_admin())', p.policyname, p.schemaname, p.tablename);
    elsif p.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on %I.%I using (public.is_admin())', p.policyname, p.schemaname, p.tablename);
    else -- UPDATE / ALL
      execute format('alter policy %I on %I.%I using (public.is_admin()) with check (public.is_admin())', p.policyname, p.schemaname, p.tablename);
    end if;
  end loop;
end;
$$;

-- Insights cover images (storage bucket "insights")
alter policy "auth write insights media" on storage.objects with check (bucket_id = 'insights' and public.is_admin());
alter policy "auth update insights media" on storage.objects using (bucket_id = 'insights' and public.is_admin());
alter policy "auth delete insights media" on storage.objects using (bucket_id = 'insights' and public.is_admin());
*/
