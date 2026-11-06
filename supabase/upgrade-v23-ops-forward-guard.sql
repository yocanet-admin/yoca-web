-- ═══════════════════════════════════════════════════════════════
-- Yoca — upgrade v23 (Operasyon: elle iletme kayıtları değiştirilemez)
--
-- "E-postayla ilet" records are rows of ops_notifications whose dedupe_key
-- starts with 'forward:'. The admin policy ("admin manage ops_notifications",
-- FOR ALL) lets a signed-in admin update or delete any row through the API,
-- and authenticated has TRUNCATE. This file makes the sent content of a
-- forward permanent; nothing else changes.
--
-- 1. Trigger ops_notifications_forward_guard (BEFORE INSERT / UPDATE / DELETE),
--    only for forward rows (all roles, including the service role):
--    - INSERT: starts as status 'pending', attempts 0, outcome 'sending';
--      payload.sent_by is set from the signed-in user (doc_actor()), not taken
--      from the request; created_at = now(); subject, body and at least one
--      recipient are required.
--    - UPDATE: recipients, subject, body, CC, reply-to, attachments (names,
--      sizes, SHA-256), sender, target date, kind, audience, dedupe key and
--      created_at cannot change (by anyone). The service link may only become
--      NULL (when a service is deleted). The send result (status, attempts,
--      last_error, sent_at, next_attempt_at and payload outcome / provider_id /
--      delivery / last_event / status_checked_at) is written ONLY by the
--      server with the service role, from the e-mail service's answer — an
--      admin session cannot mark a forward as sent. Once "sent" (accepted by
--      the service) it stays sent with the same provider id; only the delivery
--      state may still be refreshed.
--    - DELETE: refused.
--    - A row cannot be turned into a forward or out of one (dedupe_key).
-- 2. TRUNCATE on ops_notifications revoked from anon and authenticated
--    (TRUNCATE does not fire row triggers). service_role keeps it.
--
-- No row is changed, deleted or rewritten by this file. Team reminders and
-- the daily digest rows are not affected. Requires v18 and v19 (doc_actor()).
-- Idempotent; safe to re-run.
-- Check (read-only):
--   select tgname from pg_trigger where tgrelid = 'public.ops_notifications'::regclass and not tgisinternal;
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'ops_notifications' and privilege_type = 'TRUNCATE';
-- Undo: see the end of this file.
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.ops_notifications') is null then raise exception 'v23 durduruldu: public.ops_notifications yok (v18 gerekli).'; end if;
  if to_regprocedure('public.doc_actor()') is null then raise exception 'v23 durduruldu: public.doc_actor() yok (v19 gerekli).'; end if;
end;
$$;

create or replace function public.ops_notifications_forward_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  fixed constant text[] := array['manual', 'subject', 'body', 'cc', 'reply_to', 'attachments', 'sent_by', 'reminder_id'];
  k text;
begin
  if tg_op = 'DELETE' then
    if old.dedupe_key like 'forward:%' then
      raise exception 'ops_notifications: elle iletme kaydı silinemez' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.dedupe_key not like 'forward:%' then return new; end if;
    if coalesce(btrim(new.payload->>'subject'), '') = '' or coalesce(btrim(new.payload->>'body'), '') = '' or coalesce(cardinality(new.recipients), 0) = 0 then
      raise exception 'ops_notifications: elle iletmede alıcı, konu ve mesaj gerekli' using errcode = '23514';
    end if;
    new.status := 'pending';
    new.attempts := 0;
    new.sent_at := null;
    new.created_at := now();
    new.payload := new.payload || jsonb_build_object('manual', true, 'outcome', 'sending', 'sent_by', public.doc_actor(), 'provider_id', null, 'delivery', null);
    return new;
  end if;

  -- UPDATE
  if (old.dedupe_key like 'forward:%') <> (new.dedupe_key like 'forward:%') or (old.dedupe_key like 'forward:%' and new.dedupe_key <> old.dedupe_key) then
    raise exception 'ops_notifications: elle iletme kaydının anahtarı değiştirilemez' using errcode = '42501';
  end if;
  if old.dedupe_key not like 'forward:%' then return new; end if;
  if (new.kind, new.audience, new.recipients, new.target_date, new.offset_days, new.period_id, new.created_at)
     is distinct from (old.kind, old.audience, old.recipients, old.target_date, old.offset_days, old.period_id, old.created_at)
     or (new.service_id is distinct from old.service_id and new.service_id is not null) then
    raise exception 'ops_notifications: elle iletilen içerik değiştirilemez' using errcode = '42501';
  end if;
  foreach k in array fixed loop
    if (new.payload -> k) is distinct from (old.payload -> k) then
      raise exception 'ops_notifications: elle iletilen içerik değiştirilemez (%)', k using errcode = '42501';
    end if;
  end loop;
  if ((new.status, new.attempts, new.last_error, new.sent_at, new.next_attempt_at, new.payload)
      is distinct from (old.status, old.attempts, old.last_error, old.sent_at, old.next_attempt_at, old.payload))
     and current_user <> 'service_role' then
    raise exception 'ops_notifications: gönderim sonucu yalnızca sunucu tarafından yazılır' using errcode = '42501';
  end if;
  if old.status = 'sent' and (new.status <> 'sent' or (new.payload->>'outcome') is distinct from (old.payload->>'outcome') or (new.payload->'provider_id') is distinct from (old.payload->'provider_id')) then
    raise exception 'ops_notifications: gönderilmiş kayıt geri alınamaz' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists ops_notifications_forward_guard on public.ops_notifications;
create trigger ops_notifications_forward_guard before insert or update or delete on public.ops_notifications
  for each row execute function public.ops_notifications_forward_guard();

revoke truncate on public.ops_notifications from anon, authenticated;

commit;

-- Undo (not recommended; the forward records become editable again):
--   begin;
--   drop trigger if exists ops_notifications_forward_guard on public.ops_notifications;
--   drop function if exists public.ops_notifications_forward_guard();
--   grant truncate on public.ops_notifications to authenticated;
--   commit;
