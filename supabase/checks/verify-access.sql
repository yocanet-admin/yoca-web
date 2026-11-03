-- ═══════════════════════════════════════════════════════════════
-- Yoca — access check in the database (ROLLS ITSELF BACK)
--
-- Run in the Supabase SQL editor before and after v11 / v12. It acts as
-- three identities by switching the database role and the JWT claims
-- (no password, no key, no real login):
--   ziyaretçi  role anon
--   üye        role authenticated, e-mail NOT in admin_users
--   yönetici   role authenticated, first e-mail in admin_users
--
-- Every write it tries happens inside this one statement, and the statement
-- always ends with an error that carries the report — so Postgres rolls back
-- EVERYTHING, including any row a test managed to change. The red error box
-- in the editor IS the result; read the lines that start with PASS / FAIL.
--
-- Scope: this proves what the database policies allow. It does NOT prove the
-- real login + API path (Supabase Auth, PostgREST, the app); that needs a
-- staging project with three real accounts (see the release report).
-- ═══════════════════════════════════════════════════════════════

do $verify$
declare
  report text[] := array[]::text[];
  admin_email text;
  n bigint;
  total bigint;
  hidden_cs bigint;
  hidden_team bigint;
  total_sections bigint;
  total_contact bigint;
  total_cs bigint;
  code text;

begin
  -- ground truth as the SQL editor user (bypasses RLS)
  select count(*) filter (where not is_active), count(*) into hidden_cs, total_cs from public.case_studies;
  select count(*) filter (where not is_active) into hidden_team from public.team_members;
  select count(*) into total_sections from public.sections;
  select count(*) into total_contact from public.contact_submissions;
  begin
    execute 'select email from public.admin_users order by created_at, email limit 1' into admin_email;
  exception when undefined_table then admin_email := null;
  end;
  report := report || format('veri: case_studies %s (gizli %s) · team gizli %s · sections %s · contact %s · test yöneticisi %s',
    total_cs, hidden_cs, hidden_team, total_sections, total_contact, coalesce(admin_email, 'YOK'));

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
    update public.sections set is_active = is_active;
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
    update public.sections set is_active = is_active;
    get diagnostics n = row_count;
    report := report || format('%s | U4 üye bölüm değiştiremez | beklenen 0 satır · değişen %s%s',
      case when n = 0 then 'PASS' else 'FAIL' end, n, case when total_sections = 0 then ' (tablo boş: kanıt değeri sınırlı)' else '' end);
  exception when others then
    report := report || format('PASS | U4 üye bölüm değiştiremez | engellendi (%s)', sqlstate);
  end;

  begin
    update public.case_studies set is_active = is_active;
    get diagnostics n = row_count;
    report := report || format('%s | U5 üye proje gizle/göster yapamaz | beklenen 0 satır · değişen %s', case when n = 0 then 'PASS' else 'FAIL' end, n);
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
    update public.cockpit_settings set key = key;
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
      update public.sections set is_active = is_active;
      get diagnostics n = row_count;
      report := report || format('%s | Y4 yönetici bölüm güncelleyebilir | beklenen %s satır · değişen %s (geri alındı)',
        case when n = total_sections then 'PASS' else 'FAIL' end, total_sections, n);
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
