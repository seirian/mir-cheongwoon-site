create table if not exists public.schedule_memo (
  id smallint primary key default 1 check (id = 1),
  content text not null default '' check (char_length(content) <= 2000),
  updated_at timestamptz not null default now()
);

alter table public.schedule_memo enable row level security;

revoke all on table public.schedule_memo from anon, authenticated;
grant select on table public.schedule_memo to anon, authenticated;
grant update on table public.schedule_memo to authenticated;

drop policy if exists "public can read schedule memo" on public.schedule_memo;
create policy "public can read schedule memo"
on public.schedule_memo for select
to anon, authenticated
using (true);

drop policy if exists "admins can update schedule memo" on public.schedule_memo;
create policy "admins can update schedule memo"
on public.schedule_memo for update
to authenticated
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

insert into public.schedule_memo (id, content)
values (1, '월별로 남겨둘 공지, 체크할 내용이나 짧은 기록을 표시하는 영역입니다.')
on conflict (id) do nothing;
