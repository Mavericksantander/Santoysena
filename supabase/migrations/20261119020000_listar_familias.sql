-- Familias a las que pertenece el actor, con su rol en cada una. Es lo
-- primero que pide la aplicación después de iniciar sesión.
create function app.list_families(p_actor uuid)
returns table (id uuid, name text, role text)
language sql
stable
set search_path = ''
as $$
  select f.id, f.name, m.role
  from public.family_members m
  join public.families f on f.id = m.family_id
  where m.user_id = p_actor
  order by m.joined_at, f.id;
$$;
