alter table public.schedule_events
  add column if not exists manual_override boolean not null default false;

create table if not exists public.schedule_category_settings (
  category text primary key
    check (category = any (array['기타','휴방','합방','대회','정기','특별']::text[])),
  color text not null
    check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.schedule_category_settings enable row level security;

revoke all on table public.schedule_category_settings from anon, authenticated;
grant select on table public.schedule_category_settings to anon, authenticated;
grant update on table public.schedule_category_settings to authenticated;

drop policy if exists "public can read schedule category settings"
  on public.schedule_category_settings;
create policy "public can read schedule category settings"
on public.schedule_category_settings
for select
to anon, authenticated
using (true);

drop policy if exists "admins can update schedule category settings"
  on public.schedule_category_settings;
create policy "admins can update schedule category settings"
on public.schedule_category_settings
for update
to authenticated
using (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

insert into public.schedule_category_settings (category, color)
values
  ('기타', '#b9bdca'),
  ('휴방', '#8d91a2'),
  ('합방', '#ffae76'),
  ('대회', '#77c9ff'),
  ('정기', '#a98cff'),
  ('특별', '#ff7db6')
on conflict (category) do nothing;
