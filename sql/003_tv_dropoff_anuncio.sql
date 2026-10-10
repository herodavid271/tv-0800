-- 1) tv_ediciones() ahora también devuelve el precio base del curso (para el dropoff).
--    Cambia la forma del resultado, por eso se elimina y se vuelve a crear.
drop function if exists public.tv_ediciones();

create function public.tv_ediciones()
returns table (
  course_slug text,
  course_name text,
  start_date date,
  end_date date,
  city text,
  location text,
  total_seats int,
  available_seats int,
  edition_status text,
  base_price numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.slug,
    c.name,
    e.start_date::date,
    coalesce(e.end_date::date, e.start_date::date),
    e.city,
    e.location,
    e.total_seats,
    e.available_seats,
    e.status,
    c.base_price
  from public.vta_course_editions e
  join public.vta_courses c on c.id = e.course_id
  where c.course_type = 'in_person'
    and c.status = 'active'
    and c.requires_edition
    and e.status in ('active', 'finished')
    and (
      (e.status = 'active' and coalesce(e.end_date::date, e.start_date::date) >= current_date - 1)
      or e.start_date = (
        select max(e2.start_date)
        from public.vta_course_editions e2
        where e2.course_id = c.id
          and e2.status in ('active', 'finished')
      )
    )
  order by e.start_date, c.name;
$$;

revoke all on function public.tv_ediciones() from public, anon, authenticated;
grant execute on function public.tv_ediciones() to anon, authenticated;

-- 2) tv_config: descuento global y anuncio libre. La app de control escribe aquí.
alter table public.tv_config
  add column if not exists discount_active boolean not null default false,
  add column if not exists discount_percent int not null default 0 check (discount_percent between 0 and 90),
  add column if not exists announcement_title text,
  add column if not exists announcement_note text,
  add column if not exists announcement_date date;

-- 3) Sin pantalla de resumen en la rotación.
alter table public.tv_config alter column screens set default '["calendario","cursos"]'::jsonb;
update public.tv_config set screens = '["calendario","cursos"]'::jsonb where id = 1;

-- La política de lectura y el grant de select de tv_config ya cubren las columnas nuevas.
