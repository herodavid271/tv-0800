-- Validación general de tv_pin: la base solo exige un texto seguro (minúsculas, números, : _ -).
-- El TV decide qué pantallas entiende, así que añadir pantallas nuevas ya no requiere migración.

create or replace function public.tv_pin(p_token text, p_screen text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  if p_screen is null or p_screen !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' then
    raise exception 'invalid_screen' using errcode = '22023';
  end if;
  update public.tv_live_state set mode = 'pin', pin_screen = p_screen, updated_at = now() where id = 1;
end; $$;
