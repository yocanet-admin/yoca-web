-- Yoca — LOCAL integration tests only. Minimal stand-ins for what Supabase
-- provides (roles, auth.jwt()/uid()/role(), auth.users, storage.buckets /
-- storage.objects). The repo migrations then create every table, policy,
-- trigger and storage rule on top, exactly as in production. Never run this
-- against a real Supabase project.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, created_at timestamptz default now());
create unique index if not exists objects_bucket_name_uniq on storage.objects (bucket_id, name);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'admin@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'intruder@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'finance@test.local'),
  ('44444444-4444-4444-8444-444444444444', 'editor@test.local')
on conflict do nothing;
