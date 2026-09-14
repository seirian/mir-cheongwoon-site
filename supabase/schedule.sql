-- 일정표 기능용 테이블 및 RLS 정책
-- 운영 DB에는 create_schedule_events / optimize_schedule_event_policies 마이그레이션으로 동일 구조가 적용되어 있습니다.

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null,
  category text not null default '기타' check (category in ('휴방','합방','대회','정기','특별','기타')),
  start_time time,
  end_time time,
  description text,
  link_url text,
  sort_order integer not null default 0,
  source_type text not null default 'manual',
  source_key text unique,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedule_events_event_date_idx
  on public.schedule_events(event_date, sort_order, created_at);
create index if not exists schedule_events_created_by_idx
  on public.schedule_events(created_by);

alter table public.schedule_events enable row level security;

revoke all on table public.schedule_events from anon, authenticated;
grant select on table public.schedule_events to anon, authenticated;
grant insert, update, delete on table public.schedule_events to authenticated;

drop policy if exists "public can read schedule events" on public.schedule_events;
create policy "public can read schedule events"
on public.schedule_events for select
to anon, authenticated
using (true);

drop policy if exists "admins can insert schedule events" on public.schedule_events;
create policy "admins can insert schedule events"
on public.schedule_events for insert
to authenticated
with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "admins can update schedule events" on public.schedule_events;
create policy "admins can update schedule events"
on public.schedule_events for update
to authenticated
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "admins can delete schedule events" on public.schedule_events;
create policy "admins can delete schedule events"
on public.schedule_events for delete
to authenticated
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
