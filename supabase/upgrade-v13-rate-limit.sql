-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v13: one rate limit for all server instances
-- Run in the Supabase SQL editor (safe to re-run). Independent of v11/v12.
--
-- The contact and Check-Up forms allow 5 submissions per IP per hour. Until
-- now each Vercel instance counted on its own (in memory), so the real limit
-- depended on how many instances were running. After this file the app
-- counts in this table through hit_rate_limit(); until it exists the app
-- keeps the memory counter and logs a warning.
--
-- Stored: a SHA-256 hash of "form:ip" (never the IP), the start of the hour
-- window and a counter. Rows older than two windows are removed by the
-- function itself (technical counters only; no submission data).
-- Only the service role (server) may call it; visitors cannot read the table.
-- Undo: drop function public.hit_rate_limit(text, integer, integer);
--       drop table public.form_rate_limits;   (counters only)
-- ═══════════════════════════════════════════════════════════════

begin;

create table if not exists public.form_rate_limits (
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.form_rate_limits enable row level security;
-- No policies on purpose: only the security definer function below writes it.
revoke all on table public.form_rate_limits from anon, authenticated;

-- true = allowed (this hit is within the limit), false = limited
create or replace function public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  if p_window_seconds < 60 or p_window_seconds > 86400 or p_max < 1 then
    raise exception 'hit_rate_limit: invalid arguments';
  end if;
  insert into public.form_rate_limits as f (key, window_start, hits)
  values (p_key, ws, 1)
  on conflict (key, window_start) do update set hits = f.hits + 1
  returning f.hits into n;
  delete from public.form_rate_limits where window_start < now() - make_interval(secs => p_window_seconds * 2);
  return n <= p_max;
end;
$$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

commit;
