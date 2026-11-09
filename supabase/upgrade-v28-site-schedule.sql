-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v28 (Kokpit: per-site check frequency)
--
-- Additive only; the current code keeps working before and after it.
--
--   monitored_sites.check_interval   15m / 1h / 6h / 24h / 7d / manual
--                                    (default 15m = the current behaviour).
--                                    An admin setting: changes are audit-logged.
--   site_check_state                 scheduling + last result per site, written
--                                    only by the server (cron / manual check).
--                                    Kept out of monitored_sites so every cron run
--                                    does not write an audit_log row.
--   site_checks_claim_due()          atomically takes the sites whose check is due
--                                    (lease; a site is never checked by two runs at once)
--   site_check_claim_manual()        same for one "Şimdi kontrol et" (+ 2-minute gap)
--
-- Requires v8 (monitored_sites), v9 (alert columns), v10 Part A (is_admin).
-- Idempotent; safe to re-run. Undo: supabase/rollback-v28-site-schedule.sql
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.monitored_sites') is null then raise exception 'v28 durduruldu: public.monitored_sites yok (v8 gerekli).'; end if;
  if to_regprocedure('public.is_admin()') is null then raise exception 'v28 durduruldu: public.is_admin() yok (v10 gerekli).'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'monitored_sites' and column_name = 'fail_count') then
    raise exception 'v28 durduruldu: monitored_sites.fail_count yok (v9 gerekli).';
  end if;
end;
$$;

alter table public.monitored_sites
  add column if not exists check_interval text not null default '15m';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'monitored_sites_check_interval_valid') then
    alter table public.monitored_sites
      add constraint monitored_sites_check_interval_valid check (check_interval in ('15m', '1h', '6h', '24h', '7d', 'manual'));
  end if;
end;
$$;

create table if not exists public.site_check_state (
  site_id uuid primary key references public.monitored_sites(id) on delete cascade,
  -- next automatic check; null = due now (never for check_interval = manual)
  next_check_at timestamptz,
  -- the next check is the single confirmation after a first failure
  confirm_pending boolean not null default false,
  last_success_at timestamptz,
  -- last check result as the panel shows it (status, reason, timings; no secrets)
  last_result jsonb,
  -- a run holding the site until this time; others skip it
  lease_until timestamptz,
  last_manual_at timestamptz,
  -- RDAP goes to the registry, not the site: at most once a day, only with a real check
  domain_checked_at timestamptz,
  domain_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.site_check_state enable row level security;
drop policy if exists "admin read site check state" on public.site_check_state;
create policy "admin read site check state" on public.site_check_state for select to authenticated using (public.is_admin());
revoke all on public.site_check_state from anon;
revoke insert, update, delete, truncate, references, trigger on public.site_check_state from authenticated;
grant select on public.site_check_state to authenticated;
grant all on public.site_check_state to service_role;

-- Every monitored site gets a state row (due now, like today).
insert into public.site_check_state (site_id)
select id from public.monitored_sites
on conflict (site_id) do nothing;

-- ── Claims (server only) ─────────────────────────────────────────
-- Takes every active, automatically checked site whose check is due and not held
-- by another run; holds it for p_lease_seconds. Concurrent callers never get the
-- same site (row lock + SKIP LOCKED, then the lease).
create or replace function public.site_checks_claim_due(p_lease_seconds integer default 120)
returns table (claimed_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.site_check_state (site_id)
  select m.id from public.monitored_sites m where m.is_active
  on conflict (site_id) do nothing;

  return query
  with due as (
    select s.site_id
      from public.site_check_state s
      join public.monitored_sites m on m.id = s.site_id
     where m.is_active
       and m.check_interval <> 'manual'
       and coalesce(s.next_check_at, '-infinity'::timestamptz) <= now()
       and (s.lease_until is null or s.lease_until < now())
     for update of s skip locked
  )
  update public.site_check_state s
     set lease_until = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
         updated_at = now()
    from due
   where s.site_id = due.site_id
  returning s.site_id;
end;
$$;

-- One manual check: 'ok' (held), 'busy' (another run holds it), 'too_soon'
-- (last manual check less than p_min_gap_seconds ago) or 'missing'.
create or replace function public.site_check_claim_manual(p_site_id uuid, p_min_gap_seconds integer default 120, p_lease_seconds integer default 120)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_state public.site_check_state%rowtype;
begin
  if not exists (select 1 from public.monitored_sites where id = p_site_id) then
    return 'missing';
  end if;
  insert into public.site_check_state (site_id) values (p_site_id) on conflict (site_id) do nothing;
  update public.site_check_state
     set lease_until = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
         last_manual_at = now(),
         updated_at = now()
   where site_id = p_site_id
     and (lease_until is null or lease_until < now())
     and (last_manual_at is null or last_manual_at < now() - make_interval(secs => greatest(coalesce(p_min_gap_seconds, 120), 30)))
  returning site_id into v_id;
  if v_id is not null then
    return 'ok';
  end if;
  select * into v_state from public.site_check_state where site_id = p_site_id;
  if v_state.lease_until is not null and v_state.lease_until >= now() then
    return 'busy';
  end if;
  return 'too_soon';
end;
$$;

revoke all on function public.site_checks_claim_due(integer) from public, anon, authenticated;
revoke all on function public.site_check_claim_manual(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.site_checks_claim_due(integer) to service_role;
grant execute on function public.site_check_claim_manual(uuid, integer, integer) to service_role;

commit;
