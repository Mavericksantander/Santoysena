-- Esquema base de Santo y Seña.
--
-- Modelo de acceso: el cliente (roles anon y authenticated) no tiene ningún
-- privilegio sobre las tablas. Toda lectura y escritura pasa por Edge
-- Functions, que validan la sesión y la membresía antes de tocar la base.
-- RLS queda activo en todas las tablas como segunda barrera.
--
-- No existe tabla de códigos diarios: el código se deriva al vuelo con
-- HMAC(secreto del servidor, familia + fecha local + code_epoch + versión).

-- Las tablas futuras de este esquema nacen sin acceso para el cliente.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

create function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint families_name_length
    check (char_length(btrim(name)) between 1 and 60),
  timezone text not null default 'America/Santiago'
    constraint families_timezone_valid
    check (public.is_valid_timezone(timezone)),
  owner_id uuid not null references public.profiles (id),
  -- Entra al mensaje del HMAC. Incrementarlo cambia el código de hoy al
  -- instante: es el mecanismo de emergencia cuando se expulsa a un miembro.
  code_epoch integer not null default 0
    constraint families_code_epoch_non_negative
    check (code_epoch >= 0),
  created_at timestamptz not null default now()
);

create index families_owner_id_idx on public.families (owner_id);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member'
    constraint family_members_role_valid
    check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  constraint family_members_family_user_unique unique (family_id, user_id)
);

create index family_members_user_id_idx on public.family_members (user_id);

create table public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  -- SHA-256 en hexadecimal del token. El token en claro nunca se guarda.
  token_hash text not null
    constraint family_invitations_token_hash_unique unique
    constraint family_invitations_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint family_invitations_expires_after_creation
    check (expires_at > created_at),
  constraint family_invitations_used_after_creation
    check (used_at is null or used_at >= created_at)
);

create index family_invitations_family_id_idx
  on public.family_invitations (family_id);

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invitations enable row level security;
