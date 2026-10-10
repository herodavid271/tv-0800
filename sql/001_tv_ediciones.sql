create or replace function public.tv_ediciones()
returns table (
  course_slug text,
  course_name text,
  start_date date,
  end_date date,
  city text,
  location text,
  total_seats int,
  available_seats int,
  edition_status text
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
    e.status
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
