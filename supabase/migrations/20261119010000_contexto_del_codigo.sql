-- Lo que el generador necesita de una familia para derivar el código de hoy:
-- su zona horaria y su code_epoch. Solo se entrega a quien es miembro en el
-- momento de pedirlo, así que un miembro expulsado pierde el código al instante.
create function app.family_code_context(p_actor uuid, p_family_id uuid)
returns table (timezone text, code_epoch integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform app.member_role(p_actor, p_family_id);

  return query
  select f.timezone, f.code_epoch
  from public.families f
  where f.id = p_family_id;
end;
$$;
