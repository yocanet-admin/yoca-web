-- Yoca — rollback v29 (cron slots). Run only AFTER the code that writes the new
-- columns has been reverted (the v28 release does not use them).
-- Restores the v28 site_check_reschedule() and drops the three v29 columns.
-- Data loss: the recorded slot / start / finish of each site's last check.
-- next_check_at values converted by v29 stay on their slot; the v28 claim checks
-- them at that slot (nothing is moved earlier).

begin;

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

revoke all on function public.site_check_reschedule(uuid) from public, anon, authenticated;
grant execute on function public.site_check_reschedule(uuid) to service_role;

alter table public.site_check_state
  drop column if exists last_slot_at,
  drop column if exists last_started_at,
  drop column if exists last_finished_at;

commit;
