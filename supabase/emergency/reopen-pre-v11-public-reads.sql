-- ═══════════════════════════════════════════════════════════════
-- !!! ACİL DURUM DOSYASI — OLAĞAN GERİ DÖNÜŞ DEĞİLDİR !!!
-- Bu script, kapattığımız erişim açığını YENİDEN AÇAR:
--   ziyaretçiler anon anahtarla GİZLİ proje ve ekip satırlarını okuyabilir.
-- Yayın planındaki geri dönüş, uygulamayı Vercel'de geri almaktır; veritabanı
-- güvenlik düzeltmeleri yerinde kalır (bkz. supabase/YAYIN-SIRASI.md).
-- Bunu yalnızca site veya panel tamamen çalışmıyorsa, düzeltme ileri
-- (fix-forward) mümkün değilse ve proje sahibi açıkça karar verdiyse çalıştırın.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Yoca — rollback of v11 (public reads of hidden projects / team)
-- Puts back the pre-v11 policies: visitors could read EVERY row of
-- case_studies and team_members, hidden ones included (the leak v11 closed).
--
-- Only for an emergency where v11 visibly breaks the public site. The app
-- (PR #16) does not need hidden rows from the anon key: it reads hidden
-- slugs with the service role. Re-run upgrade-v11-public-reads.sql after.
-- ═══════════════════════════════════════════════════════════════

begin;

drop policy if exists "public read case studies" on public.case_studies;
create policy "public read case studies" on public.case_studies
  for select to anon, authenticated using (true);

drop policy if exists "public read team" on public.team_members;
create policy "public read team" on public.team_members
  for select to anon, authenticated using (true);

commit;
