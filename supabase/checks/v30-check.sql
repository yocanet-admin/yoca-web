-- ═══════════════════════════════════════════════════════════════
-- Yoca — v30 check (READ ONLY: one SELECT, writes nothing)
-- Run in the Supabase SQL editor before and after upgrade-v30-users.sql.
-- Before v30: "v30" lines show "yok"; the user lines show today's accounts.
-- After v30:  every line "ok"; existing accounts "active" with their old role.
-- E-mails are masked (first 2 characters + domain).
-- ═══════════════════════════════════════════════════════════════
with u as (
  select left(email, 2) || '…@' || split_part(email, '@', 2) as who,
         role,
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'admin_users' and column_name = 'status')
              then (to_jsonb(a) ->> 'status') else '(v30 öncesi)' end as status
    from public.admin_users a
)
select 'kullanıcı' as kontrol, who || ' · ' || role || ' · ' || status as sonuc from u
union all
select 'v30 fonksiyon ' || f, case when to_regprocedure('public.' || f || '()') is not null then 'ok' else 'yok' end
  from unnest(array['is_editor', 'can_content', 'users_list']) f
union all
select 'v30 tablo admin_invites', case when to_regclass('public.admin_invites') is not null then 'ok' else 'yok' end
union all
select 'v30 son yönetici koruması', case when exists (select 1 from pg_trigger where tgname = 'admin_users_keep_admin') then 'ok' else 'yok' end
union all
select 'içerik politikaları can_content()', count(*)::text || ' / 25 beklenir'
  from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ~ 'can_content\(\)'
union all
select 'etkin yönetici sayısı', count(*)::text
  from public.admin_users a where role = 'admin' and coalesce(to_jsonb(a) ->> 'status', 'active') = 'active'
union all
select 'finans politikaları can_finance() (değişmemeli)', count(*)::text
  from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ~ 'can_finance\(\)';
