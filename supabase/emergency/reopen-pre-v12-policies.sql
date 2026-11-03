-- ═══════════════════════════════════════════════════════════════
-- !!! ACİL DURUM DOSYASI — OLAĞAN GERİ DÖNÜŞ DEĞİLDİR !!!
-- Bu script, kapattığımız erişim açığını YENİDEN AÇAR:
--   girişli HER kullanıcı yönetim verisini okuyabilir ve değiştirebilir.
-- Yayın planındaki geri dönüş, uygulamayı Vercel'de geri almaktır; veritabanı
-- güvenlik düzeltmeleri yerinde kalır (bkz. supabase/YAYIN-SIRASI.md).
-- Bunu yalnızca site veya panel tamamen çalışmıyorsa, düzeltme ileri
-- (fix-forward) mümkün değilse ve proje sahibi açıkça karar verdiyse çalıştırın.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Yoca — rollback of v12 (admin-only policies)
-- Restores every policy changed by v12 to the exact definition saved in
-- public.policy_backup_v12. Use it if an admin loses access after v12 and
-- adding the e-mail to admin_users is not the fix.
--
-- Effect: signed-in non-admin users can again change admin data (the state
-- before v12). Only use as an emergency step, then fix and re-run v12.
-- The backup table is kept (it is needed if v12 is run again).
-- ═══════════════════════════════════════════════════════════════

begin;

do $$
declare
  b record;
  restored int := 0;
begin
  if to_regclass('public.policy_backup_v12') is null then
    raise exception 'Geri alma durdu: public.policy_backup_v12 yok (v12 hiç çalışmamış).';
  end if;
  for b in select * from public.policy_backup_v12 order by schemaname, tablename, policyname loop
    if not exists (select 1 from pg_policies where schemaname = b.schemaname and tablename = b.tablename and policyname = b.policyname) then
      raise exception 'Geri alma durdu: politika bulunamadı: %.% "%"', b.schemaname, b.tablename, b.policyname;
    end if;
    if b.qual is not null and b.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', b.policyname, b.schemaname, b.tablename, b.qual, b.with_check);
    elsif b.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', b.policyname, b.schemaname, b.tablename, b.qual);
    elsif b.with_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)', b.policyname, b.schemaname, b.tablename, b.with_check);
    end if;
    restored := restored + 1;
  end loop;
  raise notice 'rollback-v12: % politika eski haline döndü', restored;

  -- check: every restored policy now matches its backup exactly
  if exists (
    select 1 from public.policy_backup_v12 bk
      join pg_policies pp using (schemaname, tablename, policyname)
     where pp.qual is distinct from bk.qual or pp.with_check is distinct from bk.with_check
  ) then
    raise exception 'Geri alma iptal: geri yüklenen politika yedekle aynı değil.';
  end if;
end;
$$;

commit;
