-- Control remoto del TV y competencia.
-- Lectura pública solo por tv_live(); toda escritura pasa por funciones que exigen
-- sesión iniciada y public.is_admin() (la regla de administrador que ya usa el Hub).

-- ---------- Tablas (sin políticas: nadie accede directamente) ----------

create table if not exists public.tv_live_state (
  id int primary key default 1 check (id = 1),
  mode text not null default 'auto' check (mode in ('auto', 'pin')),
  pin_screen text check (pin_screen is null or char_length(pin_screen) <= 80),
  drop_active boolean not null default false,
  drop_percent int not null default 0 check (drop_percent between 0 and 90),
  drop_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.tv_live_state (id) values (1) on conflict (id) do nothing;

create table if not exists public.tv_players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 24),
  points int not null default 0 check (points >= 0),
  created_at timestamptz not null default now(),
  last_scored_at timestamptz
);

create table if not exists public.tv_score_events (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.tv_players (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.tv_live_state enable row level security;
alter table public.tv_players enable row level security;
alter table public.tv_score_events enable row level security;

revoke all on public.tv_live_state, public.tv_players, public.tv_score_events from public, anon, authenticated;

-- ---------- Lectura (la usa el TV con la llave pública) ----------

create or replace function public.tv_live()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'server_time', now(),
    'state', (select to_jsonb(s) - 'id' from public.tv_live_state s where s.id = 1),
    'players', coalesce(
      (select jsonb_agg(
                jsonb_build_object('id', p.id, 'name', p.name, 'points', p.points, 'last_scored_at', p.last_scored_at)
                order by p.points desc, p.last_scored_at asc nulls last, p.created_at asc)
       from public.tv_players p),
      '[]'::jsonb)
  );
$$;

-- ---------- Escritura (solo administradores con sesión) ----------

create or replace function public.tv_assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.tv_pin(p_screen text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.tv_assert_admin();
  if p_screen is null or p_screen !~ '^(calendario|competencia|curso:[a-z0-9-]{1,60})$' then
    raise exception 'invalid_screen' using errcode = '22023';
  end if;
  update public.tv_live_state set mode = 'pin', pin_screen = p_screen, updated_at = now() where id = 1;
end;
$$;

create or replace function public.tv_auto()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.tv_assert_admin();
  update public.tv_live_state set mode = 'auto', pin_screen = null, updated_at = now() where id = 1;
end;
$$;

create or replace function public.tv_drop(p_percent int)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.tv_assert_admin();
  if p_percent is null or p_percent < 1 or p_percent > 90 then
    raise exception 'invalid_percent' using errcode = '22023';
  end if;
  update public.tv_live_state
     set drop_active = true, drop_percent = p_percent, drop_at = now(), updated_at = now()
   where id = 1;
end;
$$;

create or replace function public.tv_drop_off()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.tv_assert_admin();
  update public.tv_live_state set drop_active = false, updated_at = now() where id = 1;
end;
$$;

create or replace function public.tv_player_add(p_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  perform public.tv_assert_admin();
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  insert into public.tv_players (name) values (v_name) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.tv_player_remove(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.tv_assert_admin();
  delete from public.tv_players where id = p_id;
end;
$$;

create or replace function public.tv_score(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.tv_assert_admin();
  update public.tv_players set points = points + 1, last_scored_at = now() where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.tv_score_events (player_id) values (p_id);
end;
$$;

create or replace function public.tv_undo()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.tv_score_events;
  v_player public.tv_players;
begin
  perform public.tv_assert_admin();
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
end;
$$;

create or replace function public.tv_competition_reset()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.tv_assert_admin();
  delete from public.tv_players;
end;
$$;

-- ---------- Permisos ----------

revoke all on function
  public.tv_live(), public.tv_assert_admin(), public.tv_pin(text), public.tv_auto(), public.tv_drop(int),
  public.tv_drop_off(), public.tv_player_add(text), public.tv_player_remove(uuid), public.tv_score(uuid),
  public.tv_undo(), public.tv_competition_reset()
  from public, anon, authenticated;

grant execute on function public.tv_live() to anon, authenticated;

grant execute on function
  public.tv_pin(text), public.tv_auto(), public.tv_drop(int), public.tv_drop_off(),
  public.tv_player_add(text), public.tv_player_remove(uuid), public.tv_score(uuid),
  public.tv_undo(), public.tv_competition_reset()
  to authenticated;
