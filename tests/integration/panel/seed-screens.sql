-- TEST ONLY — synthetic records for the panel screen checks (panel-screens.cjs).
-- Local test database from setup-db.sh only; never run against Supabase.
-- Long names, several currencies, empty fields and archived rows on purpose.
-- Re-runnable: every row is marked "TEST" / test.local and removed first.

begin;

delete from activities where body like 'TEST%';
delete from deals where title like 'TEST%';
delete from contact_submissions where email like '%@test.local';
delete from checkup_submissions where note like 'TEST%';
delete from ops_tasks where title like 'TEST%';
delete from ops_periods where service_id in (select id from ops_services where name like 'TEST%');
delete from ops_services where name like 'TEST%';
delete from ops_provider_accounts where label like 'TEST%';
delete from ops_projects where name like 'TEST%';
delete from fin_receivables where title like 'TEST%';
delete from clients where name like 'TEST%';
delete from monitored_sites where name like 'TEST%';
delete from insights where slug like 'test-%';
delete from team_members where name like 'TEST%';
delete from menus where title like 'TEST%';
delete from newsletter_subscribers where email like '%@test.local';
delete from audit_log where label like 'TEST%';

-- Customers / providers (one very long name, one individual, one archived)
insert into clients (id, name, contact_name, email, phone, website, status, note, source_type, party_type, roles, brand_name, legal_name, tags, preferred_channel) values
  ('11111111-0000-4000-8000-000000000001', 'TEST Kuzey Anadolu Lojistik ve Dijital Hizmetler Anonim Şirketi — Merkez Ofis ve Bölge Temsilcilikleri', 'Ayşe Yılmaz', 'ayse@test.local', '+90 555 000 0001', 'https://kuzey.test', 'active', 'Uzun adlı müşteri: başlık, etiket ve düğme çakışmasını sınar.', 'manual', 'company', '{customer}', 'Kuzey', 'Kuzey Anadolu Lojistik A.Ş.', '{lojistik,öncelikli}', 'email'),
  ('11111111-0000-4000-8000-000000000002', 'TEST Bakü Studio', 'Elvin Məmmədov', 'elvin@test.local', '', '', 'prospect', '', 'manual', 'company', '{customer}', null, null, '{}', 'whatsapp'),
  ('11111111-0000-4000-8000-000000000003', 'TEST Deniz Kaya', 'Deniz Kaya', 'deniz@test.local', '', '', 'past', '', 'manual', 'individual', '{customer}', null, null, '{}', null),
  ('11111111-0000-4000-8000-000000000004', 'TEST Bulut Barındırma Sağlayıcısı', '', 'destek@test.local', '', 'https://bulut.test', 'active', '', 'manual', 'company', '{provider}', null, null, '{}', null),
  ('11111111-0000-4000-8000-000000000005', 'TEST Alan Adı Kayıt Ltd.', '', '', '', '', 'active', '', 'manual', 'company', '{provider,partner}', null, null, '{}', null);

insert into ops_provider_accounts (provider_id, label, account_ref, panel_url) values
  ('11111111-0000-4000-8000-000000000004', 'TEST Ana hesap', 'ACC-1001', 'https://panel.bulut.test'),
  ('11111111-0000-4000-8000-000000000005', 'TEST Kayıt hesabı', null, null);

insert into deals (client_id, title, value, currency, stage, expected_close) values
  ('11111111-0000-4000-8000-000000000001', 'TEST Kurumsal web sitesi ve çok dilli içerik altyapısı yenileme projesi', 185000, 'TRY', 'proposal', current_date + 20),
  ('11111111-0000-4000-8000-000000000002', 'TEST Marka kimliği', 4200, 'AZN', 'discovery', null),
  ('11111111-0000-4000-8000-000000000003', 'TEST Bakım paketi', 900, 'EUR', 'won', current_date - 5);
insert into activities (client_id, kind, body, due_on, created_by) values
  ('11111111-0000-4000-8000-000000000001', 'call', 'TEST Teklif sonrası arama — bütçe ve takvim netleştirilecek.', current_date + 2, 'admin@test.local'),
  ('11111111-0000-4000-8000-000000000002', 'note', 'TEST İlk görüşme notu.', null, 'admin@test.local');

insert into contact_submissions (name, email, company, message, locale, status, note, follow_up_on, client_id) values
  ('TEST Mehmet Uzunadlıoğlu', 'mehmet@test.local', 'Uzun Şirket Adı Teknoloji Danışmanlık ve Yazılım Geliştirme Ticaret Limited Şirketi', repeat('Merhaba, web sitemizi yenilemek ve çok dilli bir yapıya geçmek istiyoruz. ', 8), 'tr', 'new', '', current_date + 1, null),
  ('TEST Sara Ali', 'sara@test.local', '', 'Need a quote for a landing page.', 'en', 'contacted', 'TEST not', null, '11111111-0000-4000-8000-000000000002'),
  ('TEST Spam Bot', 'spam@test.local', '', 'buy now', 'en', 'spam', '', null, null);
insert into checkup_submissions (data_json, contact_info_json, status, note) values
  ('{"goal":"growth","stage":"launch"}', '{"name":"TEST Check-up Kişisi","email":"checkup@test.local"}', 'new', 'TEST check-up');

insert into monitored_sites (name, url, expects_signature, hosting_renews_on, note, is_active, last_state, check_interval) values
  ('TEST Kuzey Kurumsal', 'https://kuzey.test', true, current_date + 40, '', true, 'up', '24h'),
  ('TEST Çok uzun adlı kampanya mikro sitesi — 2026 kış dönemi', 'https://kampanya-cok-uzun-alt-alan-adi.kuzey.test/tr/kis-2026', false, null, 'Askıda', true, 'down', '1h');

-- Services in several currencies; one archived, one with an open period
insert into ops_services (id, name, kind, status, provider_id, owner_party, owner_client_id, payer_party, payer_client_id, renewer_party, due_on, period, period_months, auto_renew, cost_amount, cost_currency, price_amount, price_currency, note) values
  ('22222222-0000-4000-8000-000000000001', 'TEST kuzey-anadolu-lojistik-dijital-hizmetler.com.tr', 'domain', 'active', '11111111-0000-4000-8000-000000000005', 'client', '11111111-0000-4000-8000-000000000001', 'client', '11111111-0000-4000-8000-000000000001', 'yoca', current_date + 12, 'yearly', 12, 'off', 18.5, 'USD', 950, 'TRY', 'Uzun alan adı.'),
  ('22222222-0000-4000-8000-000000000002', 'TEST VPS Frankfurt', 'vps', 'active', '11111111-0000-4000-8000-000000000004', 'yoca', null, 'yoca', null, 'provider_auto', current_date + 3, 'monthly', 1, 'on', 24, 'EUR', null, null, null),
  ('22222222-0000-4000-8000-000000000003', 'TEST E-posta paketi', 'email', 'pending', '11111111-0000-4000-8000-000000000004', 'client', '11111111-0000-4000-8000-000000000002', 'client', '11111111-0000-4000-8000-000000000002', 'yoca', current_date - 4, 'yearly', 12, 'unknown', 60, 'AZN', 120, 'AZN', null),
  ('22222222-0000-4000-8000-000000000004', 'TEST Eski SSL', 'ssl', 'expired', null, 'unknown', null, 'unknown', null, 'unknown', null, null, null, 'unknown', null, null, null, null, null);
update ops_services set archived_at = now() where id = '22222222-0000-4000-8000-000000000004';
insert into ops_periods (service_id, starts_on, ends_on, due_on, status, expected_cost, cost_currency, expected_price, price_currency) values
  ('22222222-0000-4000-8000-000000000001', current_date - 353, current_date + 12, current_date + 12, 'open', 18.5, 'USD', 950, 'TRY'),
  ('22222222-0000-4000-8000-000000000002', current_date - 27, current_date + 3, current_date + 3, 'open', 24, 'EUR', null, null),
  ('22222222-0000-4000-8000-000000000003', current_date - 369, current_date - 4, current_date - 4, 'open', 60, 'AZN', 120, 'AZN');

insert into ops_projects (id, client_id, name, status, start_on, note) values
  ('33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'TEST Kurumsal site yenileme — çok dilli altyapı ve içerik taşıma', 'active', current_date - 30, 'Uzun proje adı.');
insert into ops_tasks (project_id, kind, title, status, due_on) values
  ('33333333-0000-4000-8000-000000000001', 'delivery', 'TEST Tasarım teslimi', 'doing', current_date + 5),
  ('33333333-0000-4000-8000-000000000001', 'task', 'TEST İçerik taşıma ve yönlendirme haritası', 'todo', null);

-- Documents are created through the app (doc_create via /api/admin/documents) in panel-screens.cjs.

insert into fin_receivables (title, category, client_id, payer_name, period_month, due_on, amount, currency, owner_email) values
  ('TEST Aylık bakım ve barındırma hizmet bedeli — Kasım dönemi', 'retainer', '11111111-0000-4000-8000-000000000001', null, to_char(current_date, 'YYYY-MM'), current_date + 6, 12500, 'TRY', 'admin@test.local'),
  ('TEST Danışmanlık', 'consulting', null, 'TEST Bakü Studio', to_char(current_date, 'YYYY-MM'), current_date - 3, 1500, 'USD', null),
  ('TEST Proje avansı', 'project', '11111111-0000-4000-8000-000000000002', null, to_char(current_date, 'YYYY-MM'), null, null, 'AZN', null);

insert into insights (locale, slug, title, excerpt, body_md, status, publish_at, category_key) values
  ('en', 'test-long-title', 'TEST How a growing logistics brand rebuilt its multilingual website without losing search traffic', 'Long excerpt.', 'Body.', 'PUBLISHED', now() - interval '3 days', null),
  ('tr', 'test-taslak', 'TEST Taslak yazı', '', '', 'DRAFT', null, null);

insert into team_members (name, role, order_index, is_active) values
  ('TEST Ayşe Uzunsoyadlı-Karadeniz', 'Kreatif Direktör ve Marka Stratejisi Sorumlusu', 90, true),
  ('TEST Pasif Üye', '', 91, false);
insert into menus (title, url, location, order_index, is_active) values
  ('TEST Çok uzun menü başlığı örneği', '/tr/services/ai-automation', 'header', 90, true),
  ('TEST Footer', '/privacy', 'footer', 91, false);
insert into newsletter_subscribers (email, locale, status, unsubscribe_token, consent_text) values
  ('okur@test.local', 'tr', 'active', md5(random()::text), 'TEST onay metni');
insert into audit_log (actor, action, entity, entity_id, label, changes) values
  ('admin@test.local', 'update', 'ops_services', '22222222-0000-4000-8000-000000000001', 'TEST Hizmet güncellendi', '{"due_on":{"from":"2026-11-01","to":"2026-11-23"}}');

commit;
