-- Reglas de familia, invitaciones y membresía.
--
-- Toda la autorización vive aquí, en funciones del esquema app que reciben
-- al actor de forma explícita. Las Edge Functions solo autentican la sesión
-- y llaman a estas funciones con service_role. El cliente no puede
-- ejecutarlas: no tiene uso del esquema app ni execute sobre sus funciones.
--
-- Errores de negocio: excepciones cuyo mensaje es un código estable
-- (not_a_member, not_an_admin, invitation_invalid, ...).

-- Las funciones futuras nacen sin execute para PUBLIC. Tiene que ser global:
-- un revoke por esquema no quita un privilegio concedido por defecto global.
alter default privileges revoke execute on functions from public;

create schema app;
revoke all on schema app from public;
grant usage on schema app to service_role;
alter default privileges in schema app
  grant execute on functions to service_role;

-- Perfil automático -----------------------------------------------------
-- Vive en app y no en public para que el cliente no reciba execute por los
-- privilegios por defecto que Supabase concede en public.

create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(left(btrim(new.raw_user_meta_data ->> 'display_name'), 60)), ''),
      'Familiar'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

create function app.set_display_name(p_actor uuid, p_display_name text)
returns void
language sql
set search_path = ''
as $$
  update public.profiles set display_name = btrim(p_display_name) where id = p_actor;
$$;

-- Invariante: el dueño siempre es miembro administrador -------------------
-- Garantiza que ninguna familia queda sin administrador. Es diferida para
-- que create_family pueda insertar la familia y su primer miembro en la
-- misma transacción.

create function app.assert_owner_is_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  if tg_table_name = 'families' then
    v_family_id := new.id;
  else
    v_family_id := old.family_id;
  end if;

  if exists (
    select 1
    from public.families f
    where f.id = v_family_id
      and not exists (
        select 1
        from public.family_members m
        where m.family_id = f.id and m.user_id = f.owner_id and m.role = 'admin'
      )
  ) then
    raise exception 'owner_must_be_admin';
  end if;
  return null;
end;
$$;

create constraint trigger families_owner_is_admin
  after insert or update of owner_id on public.families
  deferrable initially deferred
  for each row execute function app.assert_owner_is_admin();

create constraint trigger family_members_owner_is_admin
  after update or delete on public.family_members
  deferrable initially deferred
  for each row execute function app.assert_owner_is_admin();

-- Autorización ------------------------------------------------------------

-- Una familia inexistente y una familia ajena responden igual, para que no
-- se pueda averiguar qué familias existen.
create function app.member_role(p_actor uuid, p_family_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text;
begin
  select m.role into v_role
  from public.family_members m
  where m.family_id = p_family_id and m.user_id = p_actor;

  if v_role is null then
    raise exception 'not_a_member';
  end if;
  return v_role;
end;
$$;

create function app.require_admin(p_actor uuid, p_family_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if app.member_role(p_actor, p_family_id) <> 'admin' then
    raise exception 'not_an_admin';
  end if;
end;
$$;

-- Familias ----------------------------------------------------------------

create function app.create_family(
  p_actor uuid,
  p_name text,
  p_timezone text default 'America/Santiago'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  insert into public.families (name, timezone, owner_id)
  values (btrim(p_name), p_timezone, p_actor)
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, p_actor, 'admin');

  return v_family_id;
end;
$$;

create function app.list_family_members(p_actor uuid, p_family_id uuid)
returns table (user_id uuid, display_name text, role text, is_owner boolean, joined_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform app.member_role(p_actor, p_family_id);

  return query
  select m.user_id, p.display_name, m.role, m.user_id = f.owner_id, m.joined_at
  from public.family_members m
  join public.profiles p on p.id = m.user_id
  join public.families f on f.id = m.family_id
  where m.family_id = p_family_id
  order by m.joined_at, m.user_id;
end;
$$;

-- Invitaciones ------------------------------------------------------------

create function app.create_invitation(
  p_actor uuid,
  p_family_id uuid,
  p_token_hash text,
  p_ttl_seconds integer
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_expires_at timestamptz;
begin
  perform app.require_admin(p_actor, p_family_id);

  if p_ttl_seconds is null or p_ttl_seconds not between 300 and 604800 then
    raise exception 'invalid_ttl';
  end if;

  insert into public.family_invitations (family_id, token_hash, expires_at, created_by)
  values (p_family_id, p_token_hash, now() + make_interval(secs => p_ttl_seconds), p_actor)
  returning expires_at into v_expires_at;

  return v_expires_at;
end;
$$;

-- Consumir la invitación es un único UPDATE condicional: dos aceptaciones
-- simultáneas del mismo token no pueden ganar las dos. Si quien la creó ya
-- no es administrador de la familia, la invitación deja de valer.
create function app.accept_invitation(p_actor uuid, p_token_hash text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  update public.family_invitations i
  set used_at = now()
  where i.token_hash = p_token_hash
    and i.used_at is null
    and i.expires_at > now()
    and exists (
      select 1
      from public.family_members m
      where m.family_id = i.family_id and m.user_id = i.created_by and m.role = 'admin'
    )
  returning i.family_id into v_family_id;

  if v_family_id is null then
    raise exception 'invitation_invalid';
  end if;

  begin
    insert into public.family_members (family_id, user_id, role)
    values (v_family_id, p_actor, 'member');
  exception when unique_violation then
    raise exception 'already_a_member';
  end;

  return v_family_id;
end;
$$;

-- Membresía ---------------------------------------------------------------

-- Sacar a alguien (o que alguien se vaya) incrementa code_epoch: esa persona
-- conocía el código de hoy, así que el código cambia de inmediato.
create function app.remove_family_member(p_actor uuid, p_family_id uuid, p_target uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_target <> p_actor then
    perform app.require_admin(p_actor, p_family_id);
  end if;

  if exists (
    select 1 from public.families f where f.id = p_family_id and f.owner_id = p_target
  ) then
    raise exception 'cannot_remove_owner';
  end if;

  delete from public.family_members m
  where m.family_id = p_family_id and m.user_id = p_target;
  if not found then
    raise exception 'target_not_a_member';
  end if;

  update public.families set code_epoch = code_epoch + 1 where id = p_family_id;
end;
$$;

create function app.set_member_role(
  p_actor uuid,
  p_family_id uuid,
  p_target uuid,
  p_role text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform app.require_admin(p_actor, p_family_id);

  if p_target = p_actor then
    raise exception 'cannot_change_own_role';
  end if;

  if exists (
    select 1 from public.families f where f.id = p_family_id and f.owner_id = p_target
  ) then
    raise exception 'cannot_change_owner_role';
  end if;

  update public.family_members m
  set role = p_role
  where m.family_id = p_family_id and m.user_id = p_target;
  if not found then
    raise exception 'target_not_a_member';
  end if;
end;
$$;
