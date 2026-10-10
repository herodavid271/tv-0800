-- Acceso del teléfono con una sola clave, independiente de las cuentas del Hub.
-- Solo el correo guardado en tv_admin puede entrar. La clave se guarda con bcrypt.
-- Defensa contra fuerza bruta: cada intento fallido tarda 1 s y bloquea todo el login de forma
-- creciente (5 fallos = 1 min, luego se duplica hasta 60 min). Una sesión ya iniciada no se bloquea.

-- ---------- Tablas (sin políticas: nadie accede directamente) ----------

create table if not exists public.tv_admin (
  id int primary key default 1 check (id = 1),
  email text not null,
  pass_hash text,
  failed int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.tv_admin (id, email) values (1, 'hola@davidsantana.net') on conflict (id) do nothing;

create table if not exists public.tv_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.tv_admin enable row level security;
alter table public.tv_sessions enable row level security;
revoke all on public.tv_admin, public.tv_sessions from public, anon, authenticated;

-- ---------- Fuera las funciones de escritura anteriores (usaban las cuentas del Hub) ----------

drop function if exists public.tv_pin(text);
drop function if exists public.tv_auto();
drop function if exists public.tv_drop(int);
drop function if exists public.tv_drop_off();
drop function if exists public.tv_player_add(text);
drop function if exists public.tv_player_remove(uuid);
drop function if exists public.tv_score(uuid);
drop function if exists public.tv_undo();
drop function if exists public.tv_competition_reset();
drop function if exists public.tv_assert_admin();

-- ---------- Sesiones ----------

create or replace function public.tv_hash(p_token text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$ select encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex') $$;

create or replace function public.tv_assert_admin(p_token text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_token is null or char_length(p_token) <> 64 or not exists (
    select 1 from public.tv_sessions s where s.token_hash = public.tv_hash(p_token) and s.expires_at > now()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.tv_check(p_token text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.tv_sessions s where s.token_hash = public.tv_hash(p_token) and s.expires_at > now());
$$;

create or replace function public.tv_logout(p_token text)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$ delete from public.tv_sessions where token_hash = public.tv_hash(p_token); $$;

-- Devuelve {"token": "..."} o {"error": "invalid" | "locked", "retry_seconds": n}. No lanza error: así el contador de fallos se guarda.
create or replace function public.tv_login(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  a public.tv_admin;
  v_ok boolean;
  v_token text;
  v_lock int;
begin
  select * into a from public.tv_admin where id = 1 for update; -- serializa los intentos
  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('error', 'locked', 'retry_seconds', ceil(extract(epoch from (a.locked_until - now())))::int);
  end if;

  if p_email is null or p_password is null or char_length(p_password) > 200 or char_length(p_email) > 200 then
    v_ok := false;
  else
    -- siempre se calcula el hash, aunque el correo no coincida, para no filtrar cuál de los dos falló
    v_ok := (crypt(p_password, coalesce(a.pass_hash, crypt('x', gen_salt('bf', 12)))) = a.pass_hash)
            and lower(btrim(p_email)) = lower(a.email);
    v_ok := coalesce(v_ok, false);
  end if;

  if not v_ok then
    perform pg_sleep(1);
    v_lock := case when a.failed + 1 >= 5 then least(power(2, a.failed + 1 - 5)::int, 60) else 0 end;
    update public.tv_admin
       set failed = a.failed + 1,
           locked_until = case when v_lock > 0 then now() + make_interval(mins => v_lock) else null end,
           updated_at = now()
     where id = 1;
    return jsonb_build_object('error', case when v_lock > 0 then 'locked' else 'invalid' end, 'retry_seconds', v_lock * 60);
  end if;

  update public.tv_admin set failed = 0, locked_until = null, updated_at = now() where id = 1;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.tv_sessions (token_hash, expires_at) values (public.tv_hash(v_token), now() + interval '60 days');
  delete from public.tv_sessions where expires_at <= now()
     or token_hash not in (select token_hash from public.tv_sessions order by created_at desc limit 5);
  return jsonb_build_object('token', v_token);
end;
$$;

-- Solo para ti desde el editor SQL de Supabase (no ejecutable por la app). Cierra todas las sesiones.
create or replace function public.tv_admin_set_password(p_email text, p_password text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if p_password is null or char_length(p_password) < 10 then
    raise exception 'La clave debe tener al menos 10 caracteres';
  end if;
  update public.tv_admin
     set email = lower(btrim(p_email)), pass_hash = crypt(p_password, gen_salt('bf', 12)),
         failed = 0, locked_until = null, updated_at = now()
   where id = 1;
  delete from public.tv_sessions;
end;
$$;

-- ---------- Escritura (exige sesión válida) ----------

create or replace function public.tv_pin(p_token text, p_screen text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  if p_screen is null or p_screen !~ '^(calendario|competencia|curso:[a-z0-9-]{1,60})$' then
    raise exception 'invalid_screen' using errcode = '22023';
  end if;
  update public.tv_live_state set mode = 'pin', pin_screen = p_screen, updated_at = now() where id = 1;
end; $$;

create or replace function public.tv_auto(p_token text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  update public.tv_live_state set mode = 'auto', pin_screen = null, updated_at = now() where id = 1;
end; $$;

create or replace function public.tv_drop(p_token text, p_percent int)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  if p_percent is null or p_percent < 1 or p_percent > 90 then
    raise exception 'invalid_percent' using errcode = '22023';
  end if;
  update public.tv_live_state
     set drop_active = true, drop_percent = p_percent, drop_at = now(), updated_at = now()
   where id = 1;
end; $$;

create or replace function public.tv_drop_off(p_token text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  update public.tv_live_state set drop_active = false, updated_at = now() where id = 1;
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
  insert into public.tv_players (name) values (v_name) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.tv_player_remove(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  delete from public.tv_players where id = p_id;
end; $$;

create or replace function public.tv_score(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  update public.tv_players set points = points + 1, last_scored_at = now() where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.tv_score_events (player_id) values (p_id);
end; $$;

create or replace function public.tv_undo(p_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_event public.tv_score_events;
  v_player public.tv_players;
begin
  perform public.tv_assert_admin(p_token);
  select * into v_event from public.tv_score_events order by id desc limit 1 for update;
  if not found then
    return null;
  end if;
  delete from public.tv_score_events where id = v_event.id;
  update public.tv_players
     set points = greatest(points - 1, 0),
         last_scored_at = (select max(e.created_at) from public.tv_score_events e where e.player_id = v_event.player_id)
   where id = v_event.player_id
   returning * into v_player;
  return jsonb_build_object('player_id', v_player.id, 'name', v_player.name, 'points', v_player.points);
end; $$;

create or replace function public.tv_competition_reset(p_token text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.tv_assert_admin(p_token);
  delete from public.tv_players;
end; $$;

-- ---------- Permisos ----------

revoke all on function
  public.tv_hash(text), public.tv_assert_admin(text), public.tv_check(text), public.tv_logout(text),
  public.tv_login(text, text), public.tv_admin_set_password(text, text),
  public.tv_pin(text, text), public.tv_auto(text), public.tv_drop(text, int), public.tv_drop_off(text),
  public.tv_player_add(text, text), public.tv_player_remove(text, uuid), public.tv_score(text, uuid),
  public.tv_undo(text), public.tv_competition_reset(text)
  from public, anon, authenticated;

grant execute on function
  public.tv_check(text), public.tv_logout(text), public.tv_login(text, text),
  public.tv_pin(text, text), public.tv_auto(text), public.tv_drop(text, int), public.tv_drop_off(text),
  public.tv_player_add(text, text), public.tv_player_remove(text, uuid), public.tv_score(text, uuid),
  public.tv_undo(text), public.tv_competition_reset(text)
  to anon, authenticated;
