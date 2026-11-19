-- Reproduce lo mínimo de una base Supabase recién creada para poder aplicar
-- las migraciones en PGlite: roles, esquema auth y los privilegios por
-- defecto que Supabase concede sobre el esquema public.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb
);

-- Rol con el que Supabase Auth inserta en auth.users.
create role supabase_auth_admin nologin;
grant usage on schema auth to supabase_auth_admin;
grant all on auth.users to supabase_auth_admin;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
