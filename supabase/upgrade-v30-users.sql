-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v30: Kullanıcı yönetimi + "İçerik editörü" rolü
--
-- No second user system: Supabase Auth stays the login, public.admin_users
-- (v10, role since v25) stays the list of panel users.
--
-- 1. admin_users gets
--      role    'admin' | 'finance' | 'editor'           (editor is new)
--      status  'active' | 'invited' | 'disabled'         (every existing row → 'active')
--      name, user_id (Auth user, filled when an invite is accepted),
--      invited_at / invited_by, disabled_at / disabled_by, updated_at
--    Only ACTIVE rows give access. is_admin(), is_finance(), can_finance()
--    and panel_role() keep their meaning for active rows, so every existing
--    policy, function and storage rule works as before for existing users.
--    New: is_editor(), can_content() (active admin or editor).
--    Because the functions read admin_users on every request, a role change or
--    a disabled account takes effect on the user's NEXT request — an open
--    session cannot keep using its old rights.
--
-- 2. admin_invites: one row per invitation link. Only a SHA-256 hash of the
--    token is stored (the link itself is never stored or logged), with an
--    expiry; a link works once. A new link (resend) revokes the previous one.
--    No policies: only the functions below (security definer) touch it.
--
-- 3. Functions (all check is_admin() themselves; the API also checks):
--      users_list()                          admin: list for Sistem → Kullanıcılar
--      users_invite(email, name, role, hash, expires)
--      users_invite_resend(email, hash, expires)
--      users_invite_sent(invite_id, ok, error)  record the e-mail result
--      users_invite_revoke(email)            cancel a pending invite
--      users_set_role(email, role)
--      users_set_access(email, enabled)      disable / re-enable (row kept)
--      invite_lookup(hash), invite_accept(hash, user_id)   service role only
--    Every action writes one audit_log row (entity 'admin_users'; actor = the
--    signed-in admin, or 'davet' for the invitee accepting). No secret, token
--    or password is ever written to audit_log.
--    Guards: same e-mail twice is impossible (primary key); an e-mail with a
--    pending invite or an existing account is refused with a clear reason; an
--    admin cannot change their own role or access here; the LAST ACTIVE ADMIN
--    can never be demoted, disabled or deleted (trigger, serialised with an
--    advisory lock, so two concurrent changes cannot both pass).
--    Disabling never deletes anything: the row stays (status 'disabled') and all
--    history (audit_log, created_by fields) keeps the e-mail.
--
-- 4. Content tables and media buckets: is_admin() → can_content() so an editor
--    can manage Bölümler, Menüler, Metinler, Work / sonuçlar, Insights (+
--    kategoriler, revizyonlar, görseller), Ekip, and the "about_intro" setting
--    only. Public read policies are unchanged. Nothing else is opened to the
--    editor (Operasyon, Finans, CRM / leads, documents, newsletter, audit log,
--    company / system settings stay is_admin() or can_finance()).
--
-- Requires v25 (role column, panel_role). Idempotent; safe to re-run.
-- Undo: supabase/rollback-v30-users.sql.
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.admin_users') is null then raise exception 'v30 durduruldu: public.admin_users yok.'; end if;
  if to_regprocedure('public.panel_role()') is null then raise exception 'v30 durduruldu: panel_role() yok (v25 gerekli).'; end if;
  if not exists (select 1 from public.admin_users where role = 'admin') then raise exception 'v30 durduruldu: admin_users içinde yönetici yok.'; end if;
end;
$$;

-- ── 1. admin_users ─────────────────────────────────────────────────
alter table public.admin_users add column if not exists name text not null default '';
alter table public.admin_users add column if not exists status text not null default 'active';
alter table public.admin_users add column if not exists user_id uuid;
alter table public.admin_users add column if not exists invited_at timestamptz;
alter table public.admin_users add column if not exists invited_by text;
alter table public.admin_users add column if not exists disabled_at timestamptz;
alter table public.admin_users add column if not exists disabled_by text;
alter table public.admin_users add column if not exists updated_at timestamptz not null default now();

alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check check (role in ('admin', 'finance', 'editor'));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_users_status_check') then
    alter table public.admin_users add constraint admin_users_status_check check (status in ('active', 'invited', 'disabled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_users_name_len') then
    alter table public.admin_users add constraint admin_users_name_len check (char_length(name) <= 120);
  end if;
end;
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'admin' and status = 'active');
$$;
create or replace function public.is_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'finance' and status = 'active');
$$;
create or replace function public.can_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role in ('admin', 'finance') and status = 'active');
$$;
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'editor' and status = 'active');
$$;
create or replace function public.can_content() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role in ('admin', 'editor') and status = 'active');
$$;
create or replace function public.panel_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.admin_users where email = lower(coalesce(auth.jwt() ->> 'email', '')) and status = 'active';
$$;

revoke all on function public.is_editor() from public;
revoke all on function public.can_content() from public;
grant execute on function public.is_editor() to anon, authenticated, service_role;
grant execute on function public.can_content() to anon, authenticated, service_role;

-- The last active admin can never disappear (any path: functions, SQL editor).
create or replace function public.admin_users_keep_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active') then
    perform pg_advisory_xact_lock(hashtext('public.admin_users:last_admin'));
    if not exists (select 1 from public.admin_users
                    where role = 'admin' and status = 'active' and email <> old.email) then
      raise exception 'Son etkin yönetici kaldırılamaz, devre dışı bırakılamaz veya başka role geçirilemez.'
        using errcode = 'P0001', hint = 'last_admin';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists admin_users_keep_admin on public.admin_users;
create trigger admin_users_keep_admin before update or delete on public.admin_users
  for each row execute function public.admin_users_keep_admin();

-- ── 2. Invites ─────────────────────────────────────────────────────
create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.admin_users (email) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by text,
  send_status text not null default 'pending' check (send_status in ('pending', 'sent', 'failed')),
  send_error text,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by text
);
create unique index if not exists admin_invites_one_open on public.admin_invites (email) where accepted_at is null and revoked_at is null;
alter table public.admin_invites enable row level security;
-- No policies on purpose: only the security definer functions below read or write it.
revoke all on public.admin_invites from anon, authenticated;

create or replace function public.users_actor() returns text
language sql stable as $$ select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '') $$;

create or replace function public.users_log(p_action text, p_email text, p_changes jsonb, p_actor text default null) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor, action, entity, entity_id, label, changes)
  values (coalesce(p_actor, public.users_actor(), 'sistem'), p_action, 'admin_users', p_email, p_email, p_changes);
$$;
revoke all on function public.users_log(text, text, jsonb, text) from public, anon, authenticated;

create or replace function public.users_require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yalnız yöneticiler kullanıcıları yönetebilir.' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.users_require_admin() from public, anon, authenticated;

create or replace function public.users_list()
returns table (email text, name text, role text, status text, has_account boolean, invited_at timestamptz, invited_by text,
               disabled_at timestamptz, created_at timestamptz, invite_expires_at timestamptz, invite_send_status text,
               invite_sent_at timestamptz, invite_open boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.users_require_admin();
  return query
    select u.email, u.name, u.role, u.status, (u.user_id is not null or u.status <> 'invited'), u.invited_at, u.invited_by,
           u.disabled_at, u.created_at, i.expires_at, i.send_status, i.sent_at,
           (i.id is not null and i.accepted_at is null and i.revoked_at is null)
      from public.admin_users u
      left join lateral (select * from public.admin_invites x where x.email = u.email order by x.created_at desc limit 1) i on true
     order by case u.status when 'active' then 0 when 'invited' then 1 else 2 end, u.created_at;
end;
$$;

create or replace function public.users_check_input(p_email text, p_role text) returns text
language plpgsql immutable as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 254 then raise exception 'Geçerli bir e-posta adresi girin.' using errcode = '22023'; end if;
  if p_role is not null and p_role not in ('admin', 'finance', 'editor') then raise exception 'Geçersiz rol.' using errcode = '22023'; end if;
  return e;
end;
$$;

create or replace function public.users_invite(p_email text, p_name text, p_role text, p_token_hash text, p_expires_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare e text; cur public.admin_users; inv uuid;
begin
  perform public.users_require_admin();
  e := public.users_check_input(p_email, p_role);
  if p_role is null then raise exception 'Rol seçin.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Ad 1–120 karakter olmalı.' using errcode = '22023'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '8 days' then raise exception 'Geçersiz davet süresi.' using errcode = '22023'; end if;
  select * into cur from public.admin_users where email = e for update;
  if found then
    if cur.status = 'invited' then raise exception 'Bu e-postaya bekleyen bir davet var; yeniden gönderin veya iptal edin.' using errcode = 'P0001', hint = 'pending_invite'; end if;
    raise exception 'Bu e-postayla bir kullanıcı zaten var (%).', case cur.status when 'active' then 'etkin' else 'devre dışı' end using errcode = 'P0001', hint = 'exists';
  end if;
  insert into public.admin_users (email, name, role, status, invited_at, invited_by, note)
  values (e, btrim(p_name), p_role, 'invited', now(), public.users_actor(), 'Panelden davet');
  insert into public.admin_invites (email, token_hash, expires_at, created_by)
  values (e, p_token_hash, p_expires_at, public.users_actor()) returning id into inv;
  perform public.users_log('invite', e, jsonb_build_object('role', jsonb_build_object('from', null, 'to', p_role), 'name', jsonb_build_object('from', null, 'to', btrim(p_name)), 'invite_expires_at', jsonb_build_object('from', null, 'to', p_expires_at)));
  return inv;
end;
$$;

create or replace function public.users_invite_resend(p_email text, p_token_hash text, p_expires_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare e text; cur public.admin_users; inv uuid;
begin
  perform public.users_require_admin();
  e := public.users_check_input(p_email, null);
  if p_expires_at <= now() or p_expires_at > now() + interval '8 days' then raise exception 'Geçersiz davet süresi.' using errcode = '22023'; end if;
  select * into cur from public.admin_users where email = e for update;
  if not found then raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002'; end if;
  if cur.status <> 'invited' then raise exception 'Bu kullanıcının bekleyen daveti yok (hesap %).', case cur.status when 'active' then 'etkin' else 'devre dışı' end using errcode = 'P0001', hint = 'not_invited'; end if;
  update public.admin_invites set revoked_at = now(), revoked_by = public.users_actor()
   where email = e and accepted_at is null and revoked_at is null;
  insert into public.admin_invites (email, token_hash, expires_at, created_by)
  values (e, p_token_hash, p_expires_at, public.users_actor()) returning id into inv;
  perform public.users_log('invite_resend', e, jsonb_build_object('invite_expires_at', jsonb_build_object('from', null, 'to', p_expires_at)));
  return inv;
end;
$$;

create or replace function public.users_invite_sent(p_invite uuid, p_ok boolean, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  perform public.users_require_admin();
  update public.admin_invites
     set send_status = case when p_ok then 'sent' else 'failed' end,
         sent_at = case when p_ok then now() end,
         send_error = case when p_ok then null else left(coalesce(p_error, 'bilinmeyen hata'), 300) end,
         -- a link that never reached the inbox must not stay usable
         revoked_at = case when p_ok then revoked_at else now() end,
         revoked_by = case when p_ok then revoked_by else 'gönderilemedi' end
   where id = p_invite and accepted_at is null
   returning email into e;
  if e is null then raise exception 'Davet bulunamadı.' using errcode = 'P0002'; end if;
  if not p_ok then perform public.users_log('invite_send_failed', e, jsonb_build_object('send_error', jsonb_build_object('from', null, 'to', left(coalesce(p_error, ''), 300)))); end if;
end;
$$;

create or replace function public.users_invite_revoke(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text; cur public.admin_users;
begin
  perform public.users_require_admin();
  e := public.users_check_input(p_email, null);
  select * into cur from public.admin_users where email = e for update;
  if not found then raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002'; end if;
  if cur.status <> 'invited' then raise exception 'Yalnız bekleyen bir davet iptal edilebilir.' using errcode = 'P0001', hint = 'not_invited'; end if;
  perform public.users_log('invite_revoke', e, jsonb_build_object('status', jsonb_build_object('from', 'invited', 'to', null), 'role', jsonb_build_object('from', cur.role, 'to', null)));
  -- the invited row never had access; removing it frees the e-mail for a new invite (its invites go with it)
  delete from public.admin_users where email = e;
end;
$$;

create or replace function public.users_set_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare e text; cur public.admin_users;
begin
  perform public.users_require_admin();
  e := public.users_check_input(p_email, p_role);
  if p_role is null then raise exception 'Rol seçin.' using errcode = '22023'; end if;
  if e = public.users_actor() then raise exception 'Kendi rolünüzü buradan değiştiremezsiniz.' using errcode = 'P0001', hint = 'self'; end if;
  select * into cur from public.admin_users where email = e for update;
  if not found then raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002'; end if;
  if cur.role = p_role then return; end if;
  update public.admin_users set role = p_role, updated_at = now() where email = e;
  perform public.users_log('role_change', e, jsonb_build_object('role', jsonb_build_object('from', cur.role, 'to', p_role)));
end;
$$;

create or replace function public.users_set_access(p_email text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e text; cur public.admin_users;
begin
  perform public.users_require_admin();
  e := public.users_check_input(p_email, null);
  if e = public.users_actor() then raise exception 'Kendi erişiminizi buradan değiştiremezsiniz.' using errcode = 'P0001', hint = 'self'; end if;
  select * into cur from public.admin_users where email = e for update;
  if not found then raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002'; end if;
  if cur.status = 'invited' then raise exception 'Bekleyen davet devre dışı bırakılmaz; daveti iptal edin.' using errcode = 'P0001', hint = 'invited'; end if;
  if p_enabled and cur.status = 'disabled' then
    update public.admin_users set status = 'active', disabled_at = null, disabled_by = null, updated_at = now() where email = e;
    perform public.users_log('enable', e, jsonb_build_object('status', jsonb_build_object('from', 'disabled', 'to', 'active')));
  elsif not p_enabled and cur.status = 'active' then
    update public.admin_users set status = 'disabled', disabled_at = now(), disabled_by = public.users_actor(), updated_at = now() where email = e;
    perform public.users_log('disable', e, jsonb_build_object('status', jsonb_build_object('from', 'active', 'to', 'disabled')));
  end if;
end;
$$;

-- Invitee side (the public accept page goes through the server with the service role).
create or replace function public.invite_lookup(p_token_hash text)
returns table (email text, name text, role text, state text, expires_at timestamptz, user_id uuid)
language sql stable security definer set search_path = public as $$
  select i.email, u.name, u.role,
         case when i.accepted_at is not null then 'used'
              when i.revoked_at is not null then 'revoked'
              when u.status <> 'invited' then 'revoked'
              when i.expires_at <= now() then 'expired'
              else 'valid' end,
         i.expires_at, u.user_id
    from public.admin_invites i join public.admin_users u on u.email = i.email
   where i.token_hash = p_token_hash;
$$;

create or replace function public.invite_accept(p_token_hash text, p_user_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare i public.admin_invites; u public.admin_users;
begin
  select * into i from public.admin_invites where token_hash = p_token_hash for update;
  if not found then raise exception 'Davet bağlantısı geçersiz.' using errcode = 'P0002', hint = 'invalid'; end if;
  select * into u from public.admin_users where email = i.email for update;
  if i.accepted_at is not null then raise exception 'Bu davet bağlantısı daha önce kullanıldı.' using errcode = 'P0001', hint = 'used'; end if;
  if i.revoked_at is not null or u.status <> 'invited' then raise exception 'Bu davet iptal edildi veya yenisi gönderildi.' using errcode = 'P0001', hint = 'revoked'; end if;
  if i.expires_at <= now() then raise exception 'Davet bağlantısının süresi doldu.' using errcode = 'P0001', hint = 'expired'; end if;
  update public.admin_invites set accepted_at = now() where id = i.id;
  update public.admin_users set status = 'active', user_id = p_user_id, updated_at = now() where email = i.email;
  perform public.users_log('invite_accept', i.email, jsonb_build_object('status', jsonb_build_object('from', 'invited', 'to', 'active')), 'davet: ' || i.email);
  return i.email;
end;
$$;

revoke all on function public.users_list() from public, anon;
revoke all on function public.users_invite(text, text, text, text, timestamptz) from public, anon;
revoke all on function public.users_invite_resend(text, text, timestamptz) from public, anon;
revoke all on function public.users_invite_sent(uuid, boolean, text) from public, anon;
revoke all on function public.users_invite_revoke(text) from public, anon;
revoke all on function public.users_set_role(text, text) from public, anon;
revoke all on function public.users_set_access(text, boolean) from public, anon;
revoke all on function public.invite_lookup(text) from public, anon, authenticated;
revoke all on function public.invite_accept(text, uuid) from public, anon, authenticated;
grant execute on function public.users_list() to authenticated, service_role;
grant execute on function public.users_invite(text, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.users_invite_resend(text, text, timestamptz) to authenticated, service_role;
grant execute on function public.users_invite_sent(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.users_invite_revoke(text) to authenticated, service_role;
grant execute on function public.users_set_role(text, text) to authenticated, service_role;
grant execute on function public.users_set_access(text, boolean) to authenticated, service_role;
grant execute on function public.invite_lookup(text) to service_role;
grant execute on function public.invite_accept(text, uuid) to service_role;

-- ── 4. Content: admin or editor ────────────────────────────────────
drop policy if exists "auth manage sections" on public.sections;
create policy "auth manage sections" on public.sections for all to authenticated using (public.can_content()) with check (public.can_content());
drop policy if exists "auth manage menus" on public.menus;
create policy "auth manage menus" on public.menus for all to authenticated using (public.can_content()) with check (public.can_content());
drop policy if exists "auth manage site content" on public.site_content;
create policy "auth manage site content" on public.site_content for all to authenticated using (public.can_content()) with check (public.can_content());
drop policy if exists "auth manage case studies" on public.case_studies;
create policy "auth manage case studies" on public.case_studies for all to authenticated using (public.can_content()) with check (public.can_content());
drop policy if exists "admin manage case results" on public.case_study_results;
create policy "admin manage case results" on public.case_study_results for all to authenticated using (public.can_content()) with check (public.can_content());
drop policy if exists "auth manage insights" on public.insights;
create policy "auth manage insights" on public.insights for all to authenticated using (public.can_content()) with check (public.can_content());
drop policy if exists "auth manage insight categories" on public.insight_categories;
create policy "auth manage insight categories" on public.insight_categories for all to authenticated using (public.can_content()) with check (public.can_content());
drop policy if exists "auth manage insight revisions" on public.insight_revisions;
create policy "auth manage insight revisions" on public.insight_revisions for all to authenticated using (public.can_content()) with check (public.can_content());
drop policy if exists "admin manage insight images" on public.insight_images;
create policy "admin manage insight images" on public.insight_images for all to authenticated using (public.can_content()) with check (public.can_content());
drop policy if exists "admin read team" on public.team_members;
create policy "admin read team" on public.team_members for select to authenticated using (public.can_content());
drop policy if exists "auth manage team" on public.team_members;
create policy "auth manage team" on public.team_members for all to authenticated using (public.can_content()) with check (public.can_content());
-- Metinler → "Hakkımızda taslağı": only this one key; every other setting stays admin-only.
drop policy if exists "editor manage about intro" on public.cockpit_settings;
create policy "editor manage about intro" on public.cockpit_settings for all to authenticated
  using (key = 'about_intro' and public.can_content()) with check (key = 'about_intro' and public.can_content());

-- Media buckets used by the content screens (public read policies unchanged).
drop policy if exists "auth write insights media" on storage.objects;
create policy "auth write insights media" on storage.objects for insert to authenticated with check (bucket_id = 'insights' and public.can_content());
drop policy if exists "auth update insights media" on storage.objects;
create policy "auth update insights media" on storage.objects for update to authenticated using (bucket_id = 'insights' and public.can_content());
drop policy if exists "auth delete insights media" on storage.objects;
create policy "auth delete insights media" on storage.objects for delete to authenticated using (bucket_id = 'insights' and public.can_content());
drop policy if exists "admin read insight drafts" on storage.objects;
create policy "admin read insight drafts" on storage.objects for select to authenticated using (bucket_id = 'insight-drafts' and public.can_content());
drop policy if exists "admin write insight drafts" on storage.objects;
create policy "admin write insight drafts" on storage.objects for insert to authenticated with check (bucket_id = 'insight-drafts' and public.can_content());
drop policy if exists "admin update insight drafts" on storage.objects;
create policy "admin update insight drafts" on storage.objects for update to authenticated using (bucket_id = 'insight-drafts' and public.can_content());
drop policy if exists "admin delete insight drafts" on storage.objects;
create policy "admin delete insight drafts" on storage.objects for delete to authenticated using (bucket_id = 'insight-drafts' and public.can_content());
drop policy if exists "admin read case evidence" on storage.objects;
create policy "admin read case evidence" on storage.objects for select to authenticated using (bucket_id = 'case-evidence' and public.can_content());
drop policy if exists "admin write case evidence" on storage.objects;
create policy "admin write case evidence" on storage.objects for insert to authenticated with check (bucket_id = 'case-evidence' and public.can_content());
drop policy if exists "admin delete case evidence" on storage.objects;
create policy "admin delete case evidence" on storage.objects for delete to authenticated using (bucket_id = 'case-evidence' and public.can_content());
drop policy if exists "admin write team photos" on storage.objects;
create policy "admin write team photos" on storage.objects for insert to authenticated with check (bucket_id = 'team-photos' and public.can_content());
drop policy if exists "admin update team photos" on storage.objects;
create policy "admin update team photos" on storage.objects for update to authenticated using (bucket_id = 'team-photos' and public.can_content());
drop policy if exists "admin delete team photos" on storage.objects;
create policy "admin delete team photos" on storage.objects for delete to authenticated using (bucket_id = 'team-photos' and public.can_content());

-- Self-check: every existing user is active and keeps their role; at least one active admin.
do $$
begin
  if exists (select 1 from public.admin_users where status <> 'active' and invited_at is null) then
    raise exception 'v30 kontrolü: mevcut bir kullanıcı etkin değil.';
  end if;
  if not exists (select 1 from public.admin_users where role = 'admin' and status = 'active') then
    raise exception 'v30 kontrolü: etkin yönetici yok.';
  end if;
end;
$$;

commit;
