-- ═══════════════════════════════════════════════════════════════
-- Yoca — access check in the database (one statement, always rolled back)
--
-- NOT read-only. Run it in the Supabase SQL editor only after reading this
-- header. It acts as three identities by switching the database role and the
-- JWT claims (no password, no key, no real login):
--   ziyaretçi  role anon
--   üye        role authenticated, e-mail verify-access-uye@example.invalid
--   yönetici   role authenticated, first e-mail in admin_users (shown masked)
--
-- What it changes TEMPORARILY (inside this one statement):
--   • request.jwt.claims and the current role       (SET LOCAL — transaction only)
--   • UPDATE of ONE row each in sections, case_studies, cockpit_settings,
--     setting a column to its own value             (row lock for milliseconds;
--                                                     updated_at trigger fires)
--   • INSERT of one row in clients and one object row in storage.objects
--     (bucket "insights", name verify-access/deneme.txt — no file is uploaded)
--     when the policies allow it; the audit trigger may write audit_log.
-- Why nothing stays: the statement always ends with RAISE EXCEPTION carrying
-- the report, so PostgreSQL rolls back every row, setting and trigger write.
-- Realtime (WAL) and pg_net webhooks only act on COMMITTED data.
-- Known non-transactional trace: a sequence used by an accepted insert (e.g.
-- an identity id in audit_log) keeps its advanced value → a gap in ids.
--
-- Safety stop: before any write it checks the triggers on the tables above.
-- If one calls pg_net / http / dblink / pg_notify (an outside effect), it
-- stops with that list and writes nothing.
--
-- The red error box in the editor IS the result: lines start with
-- PASS / FAIL / CHECK. Output: counts, test names, masked admin e-mail only.
--
-- Scope: database policies only. Not the real login + API path (Supabase
-- Auth, PostgREST, the app) — that stays a separate release condition.
-- ═══════════════════════════════════════════════════════════════

do $verify$
declare
  report text[] := array[]::text[];
  admin_email text;
  admin_masked text;
  n bigint;
  hidden_cs bigint;
  hidden_team bigint;
  total_sections bigint;
  total_contact bigint;
  total_cs bigint;
  one_section bigint;
  one_cs bigint;
  one_setting text;
  risky text;
  code text;
begin
  -- ── 0. safety stop: outside effects from triggers on the tables written below
  select string_agg(format('%s.%s → %s', c.relnamespace::regnamespace, c.relname, t.tgname), ', ')
    into risky
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal
     and c.oid in (select to_regclass(x) from unnest(array['public.sections', 'public.case_studies', 'public.cockpit_settings',
                                                            'public.clients', 'storage.objects', 'public.audit_log']) x)
     and (p.prosrc ~* '(net\.http|http_(get|post|request)|dblink|pg_notify|notify )' or p.proname ~* 'http_request');
  if risky is not null then
    raise exception 'verify-access DURDU, hiçbir şey yazılmadı: dış etki oluşturabilecek tetikleyici var: %', risky;
  end if;

  -- ground truth as the SQL editor user (bypasses RLS)
  select count(*) filter (where not is_active), count(*) into hidden_cs, total_cs from public.case_studies;
  select count(*) filter (where not is_active) into hidden_team from public.team_members;
  select count(*), min(id) into total_sections, one_section from public.sections;
  select min(id) into one_cs from public.case_studies;
  select min(key) into one_setting from public.cockpit_settings;
  select count(*) into total_contact from public.contact_submissions;
  begin
    execute 'select email from public.admin_users order by created_at, email limit 1' into admin_email;
  exception when undefined_table then admin_email := null;
  end;
  admin_masked := case when admin_email is null then 'YOK'
                       else left(admin_email, 1) || '***@' || split_part(admin_email, '@', 2) end;
  report := report || format('veri: case_studies %s (gizli %s) · team gizli %s · sections %s · contact %s · test yöneticisi %s',
    total_cs, hidden_cs, hidden_team, total_sections, total_contact, admin_masked);

  -- ── 1. ziyaretçi (anon) ───────────────────────────────────────
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';

  select count(*) into n from public.case_studies where not is_active;
  report := report || format('%s | Z1 ziyaretçi gizli projeleri okuyamaz | beklenen 0 · görülen %s%s',
    case when n = 0 then 'PASS' else 'FAIL' end, n, case when hidden_cs = 0 then ' (gizli kayıt yok: kanıt değeri sınırlı)' else '' end);

  select count(*) into n from public.team_members where not is_active;
  report := report || format('%s | Z2 ziyaretçi gizli ekip üyelerini okuyamaz | beklenen 0 · görülen %s%s',
    case when n = 0 then 'PASS' else 'FAIL' end, n, case when hidden_team = 0 then ' (gizli kayıt yok: kanıt değeri sınırlı)' else '' end);

  select count(*) into n from public.case_studies where is_active;
  report := report || format('%s | Z3 ziyaretçi yayındaki projeleri okur | beklenen %s · görülen %s',
    case when n = total_cs - hidden_cs then 'PASS' else 'FAIL' end, total_cs - hidden_cs, n);

  select count(*) into n from public.sections;
  report := report || format('%s | Z4 ziyaretçi bölümleri (site yapısı) okur | beklenen %s · görülen %s',
    case when n = total_sections then 'PASS' else 'FAIL' end, total_sections, n);

  select count(*) into n from public.contact_submissions;
  report := report || format('%s | Z5 ziyaretçi başvuruları okuyamaz | beklenen 0 · görülen %s', case when n = 0 then 'PASS' else 'FAIL' end, n);

  begin
    update public.sections set is_active = is_active where id = one_section;
    get diagnostics n = row_count;
    report := report || format('%s | Z6 ziyaretçi bölüm değiştiremez | beklenen 0 satır · değişen %s', case when n = 0 then 'PASS' else 'FAIL' end, n);
  exception when others then
    report := report || format('PASS | Z6 ziyaretçi bölüm değiştiremez | engellendi (%s)', sqlstate);
  end;

  execute 'reset role';

  -- ── 2. üye: signed in, NOT an admin ──────────────────────────
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c0de","email":"verify-access-uye@example.invalid"}', true);
  execute 'set local role authenticated';

  select public.is_admin()::text into code;
  report := report || format('%s | U1 üye için is_admin() | beklenen false · sonuç %s', case when code = 'false' then 'PASS' else 'FAIL' end, code);

  select count(*) into n from public.contact_submissions;
  report := report || format('%s | U2 üye başvuruları okuyamaz | beklenen 0 · görülen %s%s',
    case when n = 0 then 'PASS' else 'FAIL' end, n, case when total_contact = 0 then ' (tablo boş: kanıt değeri sınırlı)' else '' end);

  select count(*) into n from public.case_studies where not is_active;
  report := report || format('%s | U3 üye gizli projeleri okuyamaz | beklenen 0 · görülen %s', case when n = 0 then 'PASS' else 'FAIL' end, n);

  begin
    update public.sections set is_active = is_active where id = one_section;
    get diagnostics n = row_count;
    report := report || format('%s | U4 üye bölüm değiştiremez | beklenen 0 satır · değişen %s%s',
      case when n = 0 then 'PASS' else 'FAIL' end, n, case when one_section is null then ' (tablo boş: kanıt değeri sınırlı)' else '' end);
  exception when others then
    report := report || format('PASS | U4 üye bölüm değiştiremez | engellendi (%s)', sqlstate);
  end;

  begin
    update public.case_studies set is_active = is_active where id = one_cs;
    get diagnostics n = row_count;
    report := report || format('%s | U5 üye proje gizle/göster yapamaz | beklenen 0 satır · değişen %s%s',
      case when n = 0 then 'PASS' else 'FAIL' end, n, case when one_cs is null then ' (tablo boş: kanıt değeri sınırlı)' else '' end);
  exception when others then
    report := report || format('PASS | U5 üye proje gizle/göster yapamaz | engellendi (%s)', sqlstate);
  end;

  begin
    insert into public.clients (name, note) values ('verify-access deneme', 'geri alınır');
    report := report || text 'FAIL | U6 üye müşteri ekleyemez | ekleme KABUL EDİLDİ (işlem sonunda geri alındı)';
  exception when others then
    report := report || format('%s | U6 üye müşteri ekleyemez | engellendi (%s%s)', case when sqlstate = '42501' then 'PASS' else 'CHECK' end, sqlstate,
      case when sqlstate = '42501' then '' else ': ' || left(sqlerrm, 160) end);
  end;

  begin
    update public.cockpit_settings set key = key where key = one_setting;
    get diagnostics n = row_count;
    report := report || format('%s | U7 üye bildirim ayarlarını değiştiremez | beklenen 0 satır · değişen %s', case when n = 0 then 'PASS' else 'FAIL' end, n);
  exception when others then
    report := report || format('PASS | U7 üye bildirim ayarlarını değiştiremez | engellendi (%s)', sqlstate);
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('insights', 'verify-access/deneme.txt');
    report := report || text 'FAIL | U8 üye görsel yükleyemez | ekleme KABUL EDİLDİ (işlem sonunda geri alındı)';
  exception when others then
    report := report || format('%s | U8 üye görsel yükleyemez | engellendi (%s%s)', case when sqlstate = '42501' then 'PASS' else 'CHECK' end, sqlstate,
      case when sqlstate = '42501' then '' else ': ' || left(sqlerrm, 160) end);
  end;

  select count(*) into n from public.admin_users;
  report := report || format('%s | U9 üye yönetici listesini göremez | beklenen 0 · görülen %s', case when n = 0 then 'PASS' else 'FAIL' end, n);

  execute 'reset role';

  -- ── 3. yönetici: first e-mail in admin_users ──────────────────
  if admin_email is null then
    report := report || text 'FAIL | Y* admin_users boş ya da yok: yönetici testi yapılamadı';
  else
    perform set_config('request.jwt.claims', json_build_object(
      'role', 'authenticated', 'sub', '00000000-0000-4000-8000-0000000ad111', 'email', admin_email)::text, true);
    execute 'set local role authenticated';

    select public.is_admin()::text into code;
    report := report || format('%s | Y1 yönetici için is_admin() | beklenen true · sonuç %s', case when code = 'true' then 'PASS' else 'FAIL' end, code);

    select count(*) into n from public.contact_submissions;
    report := report || format('%s | Y2 yönetici tüm başvuruları okur | beklenen %s · görülen %s', case when n = total_contact then 'PASS' else 'FAIL' end, total_contact, n);

    select count(*) into n from public.case_studies;
    report := report || format('%s | Y3 yönetici gizliler dahil tüm projeleri okur | beklenen %s · görülen %s', case when n = total_cs then 'PASS' else 'FAIL' end, total_cs, n);

    begin
      update public.sections set is_active = is_active where id = one_section;
      get diagnostics n = row_count;
      report := report || format('%s | Y4 yönetici bölüm güncelleyebilir | beklenen %s satır · değişen %s (geri alındı)',
        case when n = least(total_sections, 1) then 'PASS' else 'FAIL' end, least(total_sections, 1), n);
    exception when others then
      report := report || format('FAIL | Y4 yönetici bölüm güncelleyebilir | engellendi (%s)', sqlstate);
    end;

    begin
      insert into storage.objects (bucket_id, name) values ('insights', 'verify-access/deneme.txt');
      report := report || text 'PASS | Y5 yönetici görsel yükleyebilir | kabul edildi (geri alındı)';
    exception when others then
      report := report || format('FAIL | Y5 yönetici görsel yükleyebilir | engellendi (%s: %s)', sqlstate, left(sqlerrm, 160));
    end;

    execute 'reset role';
  end if;

  -- ── report + rollback of everything above ─────────────────────
  raise exception using
    errcode = 'P0001',
    message = E'VERIFY-ACCESS RAPORU (hiçbir değişiklik kalıcı değil — tümü geri alındı)\n' || array_to_string(report, E'\n');
end;
$verify$;
