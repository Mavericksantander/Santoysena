-- Reproduce lo mínimo de una base Supabase recién creada para poder aplicar
-- las migraciones en PGlite: roles, esquema auth y los privilegios por
-- defecto que Supabase concede sobre el esquema public.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid());

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
