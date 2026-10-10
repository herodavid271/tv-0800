-- Portada de cursos como primer paso de la secuencia de cierre: acepta 'cierre:portada'.
-- Cambia solo la validación de tv_pin (006 ya dejó breaks y cierre:10/30/cashea).

create or replace function public.tv_pin(p_token text, p_screen text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  if p_screen is null or p_screen !~ '^(calendario|competencia|breaks|cierre:(portada|10|30|cashea)|curso:[a-z0-9-]{1,60})$' then
    raise exception 'invalid_screen' using errcode = '22023';
  end if;
  update public.tv_live_state set mode = 'pin', pin_screen = p_screen, updated_at = now() where id = 1;
end; $$;
