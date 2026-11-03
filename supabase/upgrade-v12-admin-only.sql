-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v12: only admins may read or change admin data
-- (replaces the commented-out "PART B" of v10, which is NOT to be used)
--
-- Run in the Supabase SQL editor AFTER:
--   • supabase/checks/preflight.sql has been run and reviewed,
--   • v10 PART A is live (admin_users table + is_admin() function),
--   • every admin e-mail is in public.admin_users (lower-case).
--
-- What it does, in one transaction:
--   1. Stops (raises an error, changes nothing) when admin_users is empty
--      or is_admin() is missing.
--   2. Copies every policy it will touch, exactly as it is now, into
--      public.policy_backup_v12 (emergency/reopen-pre-v12-policies.sql reads it).
--   3. Every policy whose ONLY role is "authenticated" (the "auth …" admin
--      policies, in schema public and on storage.objects) gets
--      "and public.is_admin()" added to its existing condition. The existing
--      condition is kept, e.g. bucket_id = 'insights' stays.
--   4. Policies for visitors (role anon or public: published content, public
--      form inserts, public media) are NOT touched. A check at the end
--      aborts the whole transaction if any of them changed.
--
-- Not affected: the service role (server API routes, cron, notifications)
-- bypasses RLS. Nothing is deleted; no row data changes.
-- Safe to re-run: policies that already call is_admin() are skipped and the
-- backup keeps the ORIGINAL definition.
-- No routine undo: app rollback keeps this in place (YAYIN-SIRASI.md).
-- Emergency only (reopens the gap): supabase/emergency/reopen-pre-v12-policies.sql
-- ═══════════════════════════════════════════════════════════════

begin;

-- ── 1. Guards ───────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.admin_users') is null then
    raise exception 'v12 durduruldu: public.admin_users yok. Önce v10 PART A çalıştırılmalı.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'v12 durduruldu: public.is_admin() yok. Önce v10 PART A çalıştırılmalı.';
  end if;
  if not exists (select 1 from public.admin_users) then
    raise exception 'v12 durduruldu: admin_users boş. Bu haliyle panel herkese kapanırdı. Önce yönetici e-postalarını ekleyin.';
  end if;
  if exists (select 1 from public.admin_users where email <> lower(email) or email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'v12 durduruldu: admin_users içinde küçük harfe çevrilmemiş ya da geçersiz e-posta var.';
  end if;
end;
$$;

-- ── 2. Backup (RLS on, no policies: only the SQL editor / service role sees it)
create table if not exists public.policy_backup_v12 (
  schemaname text not null,
  tablename text not null,
  policyname text not null,
  cmd text not null,
  roles text[] not null,
  qual text,
  with_check text,
  taken_at timestamptz not null default now(),
  primary key (schemaname, tablename, policyname)
);
alter table public.policy_backup_v12 enable row level security;

-- the policies this migration changes: "authenticated" is the only role and
-- is_admin() is not used yet
create temporary table v12_targets on commit drop as
select schemaname, tablename, policyname, cmd, roles::text[] as roles, qual, with_check
  from pg_policies
 where (schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects'))
   and roles = array['authenticated']::name[]
   and coalesce(qual, '') not like '%is_admin()%'
   and coalesce(with_check, '') not like '%is_admin()%'
   and tablename <> 'policy_backup_v12';

insert into public.policy_backup_v12 (schemaname, tablename, policyname, cmd, roles, qual, with_check)
select schemaname, tablename, policyname, cmd, roles, qual, with_check from v12_targets
on conflict (schemaname, tablename, policyname) do nothing; -- a re-run keeps the original

-- fingerprint of the visitor policies, to prove they did not change
create temporary table v12_public_before on commit drop as
select schemaname, tablename, policyname, cmd, roles::text[] as roles, qual, with_check
  from pg_policies
 where not (roles = array['authenticated']::name[]);

-- ── 3. Add is_admin() ───────────────────────────────────────────
do $$
declare
  p record;
  changed int := 0;
begin
  for p in select * from v12_targets order by schemaname, tablename, policyname loop
    if p.qual is not null and p.with_check is not null then
      execute format('alter policy %I on %I.%I using ((%s) and public.is_admin()) with check ((%s) and public.is_admin())',
                     p.policyname, p.schemaname, p.tablename, p.qual, p.with_check);
    elsif p.qual is not null then
      execute format('alter policy %I on %I.%I using ((%s) and public.is_admin())',
                     p.policyname, p.schemaname, p.tablename, p.qual);
    elsif p.with_check is not null then
      execute format('alter policy %I on %I.%I with check ((%s) and public.is_admin())',
                     p.policyname, p.schemaname, p.tablename, p.with_check);
    end if;
    changed := changed + 1;
    raise notice 'v12: %.% "%" (%) → is_admin()', p.schemaname, p.tablename, p.policyname, p.cmd;
  end loop;
  raise notice 'v12: % politika güncellendi', changed;
end;
$$;

-- ── 4. Self-checks (any failure rolls everything back) ──────────
do $$
declare
  missing int;
  public_diff int;
begin
  select count(*) into missing
    from pg_policies
   where (schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects'))
     and roles = array['authenticated']::name[]
     and tablename <> 'policy_backup_v12'
     and not (coalesce(qual, '') like '%is_admin()%' or coalesce(with_check, '') like '%is_admin()%');
  if missing > 0 then
    raise exception 'v12 geri alındı: % yönetici politikası is_admin() almadı.', missing;
  end if;

  select count(*) into public_diff from (
    (select schemaname, tablename, policyname, cmd, roles::text[], qual, with_check from pg_policies
      where not (roles = array['authenticated']::name[])
     except
     select * from v12_public_before)
    union all
    (select * from v12_public_before
     except
     select schemaname, tablename, policyname, cmd, roles::text[], qual, with_check from pg_policies
      where not (roles = array['authenticated']::name[]))
  ) d;
  if public_diff > 0 then
    raise exception 'v12 geri alındı: ziyaretçi politikalarında beklenmeyen değişiklik (% satır).', public_diff;
  end if;
end;
$$;

commit;

-- After running: supabase/checks/verify-access.sql (rolls itself back),
-- then sign in to /admin and open Leadler, Müşteriler, Çalışmalar, Ayarlar.
