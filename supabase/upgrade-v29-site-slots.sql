-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v29 (Kokpit: site checks follow the cron's 15-minute slots)
--
-- Narrow fix on top of v28 (v28 itself is unchanged). The shared cron runs at
-- :00 / :15 / :30 / :45 UTC; every planned check is such a slot:
--
--   site_checks_claim_due()   a site is due when the SLOT of its next_check_at
--                             has come. Times written as "end of check +
--                             interval" (before this release) therefore no
--                             longer slip to the slot after (15 min → 30 min).
--   site_check_reschedule()   after a frequency change the next check is the
--                             same slot rule as the app (lib/cockpit/schedule.ts):
--                             last cron check → its slot + new interval (a slot
--                             less than half an interval after that check moves
--                             one slot on); last manual check → the first slot
--                             a full interval later. Already past → the next
--                             cron slot. "manual" / pending confirmation as in v28.
--   one-time                  stored next_check_at values are moved to their
--                             slot (what the cron and the panel now use anyway).
--
-- No new table or column; grants unchanged (service_role only).
-- Requires v28. Idempotent; safe to re-run.
-- Order: apply BEFORE (or together with) the release that plans by slots; it is
-- compatible with the code running now (v28 release) and helps it immediately.
-- Undo: supabase/rollback-v29-site-slots.sql (restores the v28 functions; no data loss).
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.site_check_state') is null then raise exception 'v29 durduruldu: public.site_check_state yok (v28 gerekli).'; end if;
  if to_regprocedure('public.site_checks_claim_due(integer)') is null or to_regprocedure('public.site_check_reschedule(uuid)') is null then
    raise exception 'v29 durduruldu: v28 fonksiyonları yok.';
  end if;
end;
$$;

-- slot of a time = the 15-minute boundary at or before it (UTC epoch based)
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
       and (s.next_check_at is null
            or to_timestamp(floor(extract(epoch from s.next_check_at) / 900) * 900) <= now())
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

-- Next check after the admin changed check_interval (written with the admin's
-- session, so the audit log shows who). Only the schedule moves.
--   manual                  → no automatic check; a pending confirmation is cancelled
--   pending confirmation    → kept (moved to its slot); afterwards the new frequency
--   never checked           → due at the next cron
--   last check by the cron  → its slot + interval; < half an interval after the
--                             check → one slot later (same as the app)
--   last check was manual   → first slot at least a full interval later
--                             (a manual check is the one that ended within the
--                             lease of last_manual_at)
--   already past            → the next cron slot
-- 'checking': a run holds the site and plans with the new frequency when it stores
-- its result. Returns 'ok' / 'checking' / 'missing'.
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
  v_next timestamptz;
  v_slot constant interval := interval '15 minutes';
begin
  if not exists (select 1 from public.monitored_sites where id = p_site_id) then
    return 'missing';
  end if;
  insert into public.site_check_state (site_id) values (p_site_id) on conflict (site_id) do nothing;
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
    update public.site_check_state
       set next_check_at = to_timestamp(floor(extract(epoch from next_check_at) / 900) * 900), updated_at = now()
     where site_id = p_site_id;
    return 'ok';
  end if;
  if v_last is null then
    update public.site_check_state set next_check_at = null, confirm_pending = false, updated_at = now() where site_id = p_site_id;
    return 'ok';
  end if;
  v_step := case v_interval
    when '15m' then interval '15 minutes'
    when '1h' then interval '1 hour'
    when '6h' then interval '6 hours'
    when '24h' then interval '24 hours'
    else interval '7 days'
  end;
  if v_state.last_manual_at is not null and v_last >= v_state.last_manual_at and v_last - v_state.last_manual_at <= interval '120 seconds' then
    -- manual check: first slot at least a full interval later
    v_next := to_timestamp(ceil(extract(epoch from v_last + v_step) / 900) * 900);
  else
    v_next := to_timestamp(floor(extract(epoch from v_last) / 900) * 900) + v_step;
    while v_next - v_last < v_step / 2 loop
      v_next := v_next + v_slot;
    end loop;
  end if;
  if v_next <= now() then
    v_next := to_timestamp(ceil(extract(epoch from now()) / 900) * 900);
  end if;
  update public.site_check_state
     set next_check_at = v_next,
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

-- one-time: stored times to their slot (no change for values already on a slot)
update public.site_check_state
   set next_check_at = to_timestamp(floor(extract(epoch from next_check_at) / 900) * 900)
 where next_check_at is not null
   and next_check_at <> to_timestamp(floor(extract(epoch from next_check_at) / 900) * 900);

commit;
