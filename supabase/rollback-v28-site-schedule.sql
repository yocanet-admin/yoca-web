-- Yoca — rollback v28 (per-site check frequency).
-- Removes the scheduling table, the claim functions and monitored_sites.check_interval.
-- Data loss: chosen frequencies, last results shown in the panel, next/last check
-- times and stored domain expiry dates. Alert state (fail_count / alerted /
-- last_state on monitored_sites) is NOT touched.
-- Run only with code that does not use v28 (before PR merge or after a revert).

begin;
drop function if exists public.site_check_claim_manual(uuid, integer, integer);
drop function if exists public.site_checks_claim_due(integer);
drop table if exists public.site_check_state;
alter table public.monitored_sites drop constraint if exists monitored_sites_check_interval_valid;
alter table public.monitored_sites drop column if exists check_interval;
commit;
