-- Secuencias de la app del teléfono: breaks, competencia y cierre (drop 10 %, 30 % y Cashea).
-- Y: quien se anota en el leaderboard empieza con 1 punto (con su evento, para poder deshacerlo).

create or replace function public.tv_pin(p_token text, p_screen text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  if p_screen is null or p_screen !~ '^(calendario|competencia|breaks|cierre:(10|30|cashea)|curso:[a-z0-9-]{1,60})$' then
    raise exception 'invalid_screen' using errcode = '22023';
  end if;
  update public.tv_live_state set mode = 'pin', pin_screen = p_screen, updated_at = now() where id = 1;
end; $$;

create or replace function public.tv_player_add(p_token text, p_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  perform public.tv_assert_admin(p_token);
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  insert into public.tv_players (name, points, last_scored_at) values (v_name, 1, now()) returning id into v_id;
  insert into public.tv_score_events (player_id) values (v_id);
  return v_id;
end; $$;
