-- ═══════════════════════════════════════════════════════════════
-- Yoca — ROLLBACK of upgrade v30 (Kullanıcı yönetimi + İçerik editörü)
-- Run ONLY by the owner's explicit decision, after rolling the APP back to a
-- deployment without user management (the v30 app needs these functions).
--
-- Safe side: nobody gains access by this rollback.
--   • rows the old rules cannot express — role 'editor', status 'invited' or
--     'disabled' — are COPIED to public.admin_users_v30_backup and then removed
--     from admin_users (a disabled user must not become active again);
--   • functions and policies go back to their v25 definitions (is_admin());
--   • admin_invites, the user functions and the last-admin trigger are dropped.
-- History stays: audit_log is not touched. The added columns stay (unused).
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if not exists (select 1 from public.admin_users where role = 'admin' and status = 'active') then
    raise exception 'rollback durduruldu: etkin yönetici yok.';
  end if;
end;
$$;

create table if not exists public.admin_users_v30_backup as select now() as backed_up_at, u.* from public.admin_users u where false;
alter table public.admin_users_v30_backup enable row level security;
insert into public.admin_users_v30_backup select now(), u.* from public.admin_users u where u.role = 'editor' or u.status <> 'active';

drop trigger if exists admin_users_keep_admin on public.admin_users;
drop function if exists public.admin_users_keep_admin();
delete from public.admin_users where role = 'editor' or status <> 'active';
drop table if exists public.admin_invites;

drop function if exists public.users_list(), public.users_invite(text, text, text, text, timestamptz),
  public.users_invite_resend(text, text, timestamptz), public.users_invite_sent(uuid, boolean, text),
  public.users_invite_revoke(text), public.users_set_role(text, text), public.users_set_access(text, boolean),
  public.invite_lookup(text), public.invite_accept(text, uuid), public.users_log(text, text, jsonb, text),
  public.users_require_admin(), public.users_check_input(text, text), public.users_actor();

alter table public.admin_users drop constraint if exists admin_users_status_check;
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check check (role in ('admin', 'finance'));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'admin');
$$;
create or replace function public.is_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'finance');
$$;
create or replace function public.can_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role in ('admin', 'finance'));
$$;
create or replace function public.panel_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.admin_users where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

drop policy if exists "auth manage sections" on public.sections;
create policy "auth manage sections" on public.sections for all to authenticated using (true and public.is_admin()) with check (true and public.is_admin());
drop policy if exists "auth manage menus" on public.menus;
create policy "auth manage menus" on public.menus for all to authenticated using (true and public.is_admin()) with check (true and public.is_admin());
drop policy if exists "auth manage site content" on public.site_content;
create policy "auth manage site content" on public.site_content for all to authenticated using (true and public.is_admin()) with check (true and public.is_admin());
drop policy if exists "auth manage case studies" on public.case_studies;
create policy "auth manage case studies" on public.case_studies for all to authenticated using (true and public.is_admin()) with check (true and public.is_admin());
drop policy if exists "admin manage case results" on public.case_study_results;
create policy "admin manage case results" on public.case_study_results for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "auth manage insights" on public.insights;
create policy "auth manage insights" on public.insights for all to authenticated using (true and public.is_admin()) with check (true and public.is_admin());
drop policy if exists "auth manage insight categories" on public.insight_categories;
create policy "auth manage insight categories" on public.insight_categories for all to authenticated using (true and public.is_admin()) with check (true and public.is_admin());
drop policy if exists "auth manage insight revisions" on public.insight_revisions;
create policy "auth manage insight revisions" on public.insight_revisions for all to authenticated using (true and public.is_admin()) with check (true and public.is_admin());
drop policy if exists "admin manage insight images" on public.insight_images;
create policy "admin manage insight images" on public.insight_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin read team" on public.team_members;
create policy "admin read team" on public.team_members for select to authenticated using (public.is_admin());
drop policy if exists "auth manage team" on public.team_members;
create policy "auth manage team" on public.team_members for all to authenticated using (true and public.is_admin()) with check (true and public.is_admin());
drop policy if exists "editor manage about intro" on public.cockpit_settings;

drop policy if exists "auth write insights media" on storage.objects;
create policy "auth write insights media" on storage.objects for insert to authenticated with check (bucket_id = 'insights' and public.is_admin());
drop policy if exists "auth update insights media" on storage.objects;
create policy "auth update insights media" on storage.objects for update to authenticated using (bucket_id = 'insights' and public.is_admin());
drop policy if exists "auth delete insights media" on storage.objects;
create policy "auth delete insights media" on storage.objects for delete to authenticated using (bucket_id = 'insights' and public.is_admin());
drop policy if exists "admin read insight drafts" on storage.objects;
create policy "admin read insight drafts" on storage.objects for select to authenticated using (bucket_id = 'insight-drafts' and public.is_admin());
drop policy if exists "admin write insight drafts" on storage.objects;
create policy "admin write insight drafts" on storage.objects for insert to authenticated with check (bucket_id = 'insight-drafts' and public.is_admin());
drop policy if exists "admin update insight drafts" on storage.objects;
create policy "admin update insight drafts" on storage.objects for update to authenticated using (bucket_id = 'insight-drafts' and public.is_admin());
drop policy if exists "admin delete insight drafts" on storage.objects;
create policy "admin delete insight drafts" on storage.objects for delete to authenticated using (bucket_id = 'insight-drafts' and public.is_admin());
drop policy if exists "admin read case evidence" on storage.objects;
create policy "admin read case evidence" on storage.objects for select to authenticated using (bucket_id = 'case-evidence' and public.is_admin());
drop policy if exists "admin write case evidence" on storage.objects;
create policy "admin write case evidence" on storage.objects for insert to authenticated with check (bucket_id = 'case-evidence' and public.is_admin());
drop policy if exists "admin delete case evidence" on storage.objects;
create policy "admin delete case evidence" on storage.objects for delete to authenticated using (bucket_id = 'case-evidence' and public.is_admin());
drop policy if exists "admin write team photos" on storage.objects;
create policy "admin write team photos" on storage.objects for insert to authenticated with check (bucket_id = 'team-photos' and public.is_admin());
drop policy if exists "admin update team photos" on storage.objects;
create policy "admin update team photos" on storage.objects for update to authenticated using (bucket_id = 'team-photos' and public.is_admin());
drop policy if exists "admin delete team photos" on storage.objects;
create policy "admin delete team photos" on storage.objects for delete to authenticated using (bucket_id = 'team-photos' and public.is_admin());

drop function if exists public.is_editor(), public.can_content();

commit;
