-- Yoca — rollback v28 (per-site check frequency).
--
-- NOT the default way back. To go back, revert / redeploy the previous CODE and
-- leave the v28 schema in place: the older code does not read it, and the
-- frequencies and stored results are still there if the new code returns.
-- Note: the older code checks EVERY active site every 15 minutes again
-- (weekly and "manual only" sites included) and its panel checks sites live
-- when opened or refreshed.
--
-- This file removes the scheduling table, the claim / reschedule functions and
-- monitored_sites.check_interval. Data loss: chosen frequencies, last results
-- shown in the panel, next/last check times and stored domain expiry dates.
-- Alert state (fail_count / alerted / last_state on monitored_sites) is NOT touched.
-- Run only with a separate approval and only with code that does not use v28.

begin;
drop function if exists public.site_check_reschedule(uuid);
drop function if exists public.site_check_claim_manual(uuid, integer, integer);
drop function if exists public.site_checks_claim_due(integer);
drop table if exists public.site_check_state;
alter table public.monitored_sites drop constraint if exists monitored_sites_check_interval_valid;
alter table public.monitored_sites drop column if exists check_interval;
commit;
