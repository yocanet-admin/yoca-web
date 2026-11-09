-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v29 (Kokpit: site checks follow the cron's 15-minute slots)
--
-- Narrow change on top of v28 (v28 itself is unchanged; site_checks_claim_due
-- stays as in v28: a site is due when next_check_at <= now()).
--
--   site_check_state.last_slot_at      the cron slot the last check belonged to
--                                      (null = a manual check)
--   site_check_state.last_started_at   when the last check really started
--   site_check_state.last_finished_at  ... and finished
--                                      Planned slot and real times are kept apart;
--                                      written by the server only (as v28 grants).
--   site_check_reschedule()            after a frequency change the next check uses
--                                      the app's slot rule (lib/cockpit/schedule.ts):
--                                        last check by the cron → its slot + new interval
--                                          (a slot less than half an interval after the
--                                          real start moves one slot on)
--                                        manual, or no slot recorded (before v29) →
--                                          the first slot at least a FULL interval after
--                                          the real check (rounded UP, never down)
--                                        already past → the next cron slot
--                                      "manual" and a pending confirmation as in v28.
--   one-time                           stored times that are not on a slot (written
--                                      before this release as "end of check +
--                                      interval") are converted, never earlier than
--                                      the rule allows:
--                                        pending confirmation → the first slot at least
--                                          7.5 min after the failed check
--                                        15 min, last check CERTAINLY by the cron (no
--                                          manual check recorded, or it was > 10 min
--                                          before the last check) — the faulty
--                                          15 → 30 min values → the slot after the
--                                          check's slot (the fix)
--                                        everything else — daily / weekly / hourly / 6 h,
--                                          any value after a manual check, and any 15-min
--                                          value that cannot be told apart for sure →
--                                          rounded UP (a full interval stays full)
--
-- Requires v28. Idempotent; safe to re-run (only touches values not on a slot).
-- Order: apply and verify BEFORE merging the release that writes the new columns.
-- Undo: supabase/rollback-v29-site-slots.sql (after the code is reverted).
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.site_check_state') is null then raise exception 'v29 durduruldu: public.site_check_state yok (v28 gerekli).'; end if;
  if to_regprocedure('public.site_check_reschedule(uuid)') is null then raise exception 'v29 durduruldu: v28 fonksiyonları yok.'; end if;
end;
$$;

alter table public.site_check_state
  add column if not exists last_slot_at timestamptz,
  add column if not exists last_started_at timestamptz,
  add column if not exists last_finished_at timestamptz;

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
  v_start timestamptz;
  v_step interval;
  v_next timestamptz;
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
    return 'ok'; -- the single confirmation stays where it is
  end if;
  v_start := coalesce(v_state.last_started_at, v_last);
  if v_start is null then
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
  if v_state.last_slot_at is not null then
    -- last check by the cron: its slot + interval (one slot on if the run started late)
    v_next := v_state.last_slot_at + v_step;
    while v_next - v_start < v_step / 2 loop
      v_next := v_next + interval '15 minutes';
    end loop;
  else
    -- manual check, or no slot recorded: a full interval after the real check, rounded UP
    v_next := to_timestamp(ceil(extract(epoch from v_start + v_step) / 900) * 900);
  end if;
  if v_next <= now() then
    v_next := to_timestamp(ceil(extract(epoch from now()) / 900) * 900);
  end if;
  update public.site_check_state
     set next_check_at = v_next, confirm_pending = false, updated_at = now()
   where site_id = p_site_id;
  return 'ok';
end;
$$;

revoke all on function public.site_check_reschedule(uuid) from public, anon, authenticated;
grant execute on function public.site_check_reschedule(uuid) to service_role;

-- one-time conversion of stored times that are not on a slot (see the header)
with legacy as (
  select s.site_id,
         s.next_check_at,
         s.confirm_pending,
         m.check_interval,
         m.last_checked_at,
         -- CERTAINLY a cron check only when no manual check is recorded, or the last
         -- check came more than 10 minutes after the last manual one (a manual check
         -- ends within its route's 60 s limit). Anything closer — either way, in case
         -- of clock skew or a manual check that never stored its result — is treated
         -- like a manual check and rounded UP.
         not (s.last_manual_at is null
              or (m.last_checked_at is not null and m.last_checked_at - s.last_manual_at > interval '10 minutes')) as was_manual
    from public.site_check_state s
    join public.monitored_sites m on m.id = s.site_id
   where s.next_check_at is not null
     and extract(epoch from s.next_check_at) <> floor(extract(epoch from s.next_check_at) / 900) * 900
)
update public.site_check_state s
   set next_check_at = case
         when l.confirm_pending and l.last_checked_at is not null then
           -- the first slot at least 7.5 minutes after the failed check
           to_timestamp(ceil(extract(epoch from l.last_checked_at + interval '450 seconds') / 900) * 900)
         when l.check_interval = '15m' and not l.was_manual and l.last_checked_at is not null then
           -- the faulty 15 → 30 min values: the slot after the check's slot
           -- (one more if the check was less than 7.5 minutes before that slot)
           case
             when to_timestamp(floor(extract(epoch from l.last_checked_at) / 900) * 900) + interval '15 minutes' - l.last_checked_at >= interval '450 seconds'
               then to_timestamp(floor(extract(epoch from l.last_checked_at) / 900) * 900) + interval '15 minutes'
             else to_timestamp(floor(extract(epoch from l.last_checked_at) / 900) * 900) + interval '30 minutes'
           end
         else
           -- daily / weekly / hourly / 6 h and anything after a manual check: rounded UP
           to_timestamp(ceil(extract(epoch from l.next_check_at) / 900) * 900)
       end,
       updated_at = now()
  from legacy l
 where s.site_id = l.site_id;

commit;
