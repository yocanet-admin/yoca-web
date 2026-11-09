-- Yoca — rollback v29 (cron slots): restores the v28 versions of
-- site_checks_claim_due() and site_check_reschedule().
-- No data loss: no table or column is dropped; next_check_at values stay on
-- their slot (the v28 claim then checks them at that slot or the one after).
-- Run with code that does not depend on v29 (the slot release works with both,
-- only the frequency-change timing goes back to the v28 rule).

begin;

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

create or replace function public.site_check_reschedule(p_site_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_state public.site_check_state%rowtype;
  v_interval text;
  v_last timestamptz;
  v_step interval;
begin
  if not exists (select 1 from public.monitored_sites where id = p_site_id) then
    return 'missing';
  end if;
  insert into public.site_check_state (site_id) values (p_site_id) on conflict (site_id) do nothing;
  -- the lock serialises with a run storing its result (it writes this row)
  select * into v_state from public.site_check_state where site_id = p_site_id for update;
  select check_interval, last_checked_at into v_interval, v_last from public.monitored_sites where id = p_site_id;
  if v_state.lease_until is not null and v_state.lease_until >= now() then
    return 'checking';
  end if;
  if v_interval = 'manual' then
    update public.site_check_state set next_check_at = null, confirm_pending = false, updated_at = now() where site_id = p_site_id;
    return 'ok';
  end if;
  if v_state.confirm_pending and v_state.next_check_at is not null then
    return 'ok';
  end if;
  v_step := case v_interval
    when '15m' then interval '15 minutes'
    when '1h' then interval '1 hour'
    when '6h' then interval '6 hours'
    when '24h' then interval '24 hours'
    else interval '7 days'
  end;
  update public.site_check_state
     set next_check_at = case when v_last is null then null else greatest(now(), v_last + v_step) end,
         confirm_pending = false,
         updated_at = now()
   where site_id = p_site_id;
  return 'ok';
end;
$$;

revoke all on function public.site_checks_claim_due(integer) from public, anon, authenticated;
revoke all on function public.site_check_reschedule(uuid) from public, anon, authenticated;
grant execute on function public.site_checks_claim_due(integer) to service_role;
grant execute on function public.site_check_reschedule(uuid) to service_role;

commit;
