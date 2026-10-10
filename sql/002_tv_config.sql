create table if not exists public.tv_config (
  id int primary key default 1 check (id = 1),
  screens jsonb not null default '["calendario","cursos","resumen"]'::jsonb,
  seconds_per_screen int not null default 12 check (seconds_per_screen between 3 and 120),
  hidden_courses text[] not null default '{}',
  message text,
  updated_at timestamptz not null default now()
);

insert into public.tv_config (id) values (1) on conflict (id) do nothing;

alter table public.tv_config enable row level security;

drop policy if exists tv_config_read on public.tv_config;
create policy tv_config_read on public.tv_config
  for select to anon, authenticated using (true);

revoke all on public.tv_config from anon, authenticated;
grant select on public.tv_config to anon, authenticated;
