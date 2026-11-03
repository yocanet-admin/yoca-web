-- ═══════════════════════════════════════════════════════════════
-- Yoca — preflight inspection (READ-ONLY: only SELECTs, changes nothing)
-- Run in the Supabase SQL editor BEFORE v11 / v12 and paste or screenshot
-- the result table. It contains no keys or secrets; it does list the admin
-- e-mails in admin_users (column "detail") — blur them if you prefer.
--
-- One result table: section | item | status | detail
--   status: ok · missing · warn · info
-- ═══════════════════════════════════════════════════════════════

with
required_tables(t) as (values
  ('admin_users'), ('audit_log'), ('case_studies'), ('team_members'), ('sections'), ('menus'),
  ('site_content'), ('contact_submissions'), ('checkup_submissions'), ('insights'),
  ('insight_categories'), ('insight_revisions'), ('ai_runs'), ('clients'), ('deals'),
  ('activities'), ('monitored_sites'), ('spam_log'), ('cockpit_settings')),
required_functions(sig) as (values
  ('public.is_admin()'), ('public.audit_row()'), ('public.audit_trim(jsonb)')),
audit_tables(t) as (values ('contact_submissions'), ('checkup_submissions'), ('case_studies'), ('clients'), ('cockpit_settings')),
rows as (
  -- 1. every policy, exactly as live
  select 1 as o, 'policy' as section,
         p.schemaname || '.' || p.tablename || ' · ' || p.policyname as item,
         case
           when p.roles = array['authenticated']::name[] and coalesce(p.qual, '') || coalesce(p.with_check, '') not like '%is_admin()%' then 'warn'
           when p.tablename in ('case_studies', 'team_members') and p.cmd = 'SELECT'
                and ('anon' = any (p.roles) or 'public' = any (p.roles)) and coalesce(p.qual, '') = 'true' then 'warn'
           else 'info' end as status,
         p.cmd || ' · roles=' || p.roles::text || ' · using=' || coalesce(p.qual, '—') || ' · check=' || coalesce(p.with_check, '—') as detail
    from pg_policies p
   where p.schemaname in ('public', 'storage')
  union all
  select 2, 'policy-count', 'toplam', 'info',
         (select count(*) from pg_policies where schemaname in ('public', 'storage'))::text
           || ' (yerel referans: 31 public + 4 storage — farklıysa satırları tek tek karşılaştırın)'
  union all
  -- 2. required tables + RLS flag
  select 3, 'table', 'public.' || r.t,
         case when c.oid is null then 'missing' when not c.relrowsecurity then 'warn' else 'ok' end,
         case when c.oid is null then 'tablo yok' when c.relrowsecurity then 'RLS açık' else 'RLS KAPALI' end
    from required_tables r
    left join pg_class c on c.relname = r.t and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  -- 3. required functions
  select 4, 'function', f.sig,
         case when to_regprocedure(f.sig) is null then 'missing' else 'ok' end,
         case when to_regprocedure(f.sig) is null then 'fonksiyon yok'
              else 'security definer=' || (select prosecdef::text from pg_proc where oid = to_regprocedure(f.sig)) end
    from required_functions f
  union all
  -- 4. is_admin() execute grants
  select 5, 'grant', 'execute is_admin() · ' || r.rolname,
         case when to_regprocedure('public.is_admin()') is null then 'missing'
              when has_function_privilege(r.rolname, 'public.is_admin()', 'execute') then 'ok' else 'missing' end,
         ''
    from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')
  union all
  -- 5. table grants the site and panel rely on (RLS still filters rows)
  select 6, 'grant', g.role || ' ' || g.priv || ' public.' || g.t,
         case when to_regclass('public.' || g.t) is null then 'missing'
              when has_table_privilege(g.role, 'public.' || g.t, g.priv) then 'ok' else 'warn' end,
         ''
    from (values ('anon', 'select', 'case_studies'), ('anon', 'select', 'team_members'), ('anon', 'select', 'sections'),
                 ('anon', 'select', 'insights'), ('authenticated', 'select', 'contact_submissions'),
                 ('authenticated', 'update', 'case_studies')) g(role, priv, t)
  union all
  -- 6. audit triggers
  select 7, 'trigger', 'audit_' || a.t,
         case when exists (select 1 from pg_trigger tg where tg.tgname = 'audit_' || a.t and tg.tgrelid = to_regclass('public.' || a.t) and not tg.tgisinternal)
              then 'ok' else 'missing' end,
         ''
    from audit_tables a
  union all
  -- 7. insights publish columns
  select 8, 'column', 'public.insights.' || col,
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'insights' and column_name = col)
              then 'ok' else 'missing' end, ''
    from unnest(array['status', 'publish_at', 'group_id', 'locale', 'slug', 'cover_url']) col
  union all
  -- 8. admin records (who will keep access after v12). Read through
  --    query_to_xml so a missing table reports "missing" instead of failing.
  select 9, 'admin_users', 'kayıt sayısı',
         case when to_regclass('public.admin_users') is null then 'missing'
              when (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.admin_users', false, true, '')))[1]::text = '0' then 'warn'
              else 'ok' end,
         case when to_regclass('public.admin_users') is null then 'tablo yok'
              else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.admin_users', false, true, '')))[1]::text end
  union all
  select 10, 'admin_users', 'e-postalar',
         case when to_regclass('public.admin_users') is null then 'missing' else 'info' end,
         case when to_regclass('public.admin_users') is null then 'tablo yok'
              else coalesce((xpath('/row/e/text()', query_to_xml(
                'select string_agg(email || case when email <> lower(email) then '' (BÜYÜK HARF!)'' else '''' end, '', '' order by email) as e from public.admin_users',
                false, true, '')))[1]::text, '—') end
  union all
  -- 9. data that the policies protect (counts only, no content)
  select 11, 'data', 'case_studies gizli / toplam', 'info',
         (select count(*) filter (where not is_active) || ' / ' || count(*) from public.case_studies)
  union all
  select 11, 'data', 'team_members gizli / toplam', 'info',
         (select count(*) filter (where not is_active) || ' / ' || count(*) from public.team_members)
  union all
  select 12, 'audit_log', 'ilk kayıt (sunucu sayımının başlangıcı)', 'info',
         case when to_regclass('public.audit_log') is null then 'tablo yok'
              else coalesce((xpath('/row/m/text()', query_to_xml('select min(at) as m from public.audit_log', false, true, '')))[1]::text, 'boş') end
  union all
  -- 10. objects that must NOT exist yet (or exist after a previous run)
  select 13, 'state', 'public.policy_backup_v12',
         case when to_regclass('public.policy_backup_v12') is null then 'info' else 'warn' end,
         case when to_regclass('public.policy_backup_v12') is null then 'yok (v12 çalışmamış)' else 'VAR — v12 daha önce çalışmış' end
  union all
  select 13, 'state', 'public.hit_rate_limit(text,integer,integer)',
         case when to_regprocedure('public.hit_rate_limit(text,integer,integer)') is null then 'info' else 'ok' end,
         case when to_regprocedure('public.hit_rate_limit(text,integer,integer)') is null then 'yok (v13 çalışmamış)' else 'var' end
)
select section, item, status, detail from rows order by o, item;
