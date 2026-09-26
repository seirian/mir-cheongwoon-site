-- Restrict schedule deletion to normal RLS/admin checks instead of SECURITY DEFINER.
grant select, insert, update, delete on table public.schedule_sync_exclusions to authenticated;

drop policy if exists "admins can read schedule sync exclusions" on public.schedule_sync_exclusions;
create policy "admins can read schedule sync exclusions"
on public.schedule_sync_exclusions
for select
to authenticated
using (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "admins can insert schedule sync exclusions" on public.schedule_sync_exclusions;
create policy "admins can insert schedule sync exclusions"
on public.schedule_sync_exclusions
for insert
to authenticated
with check (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "admins can update schedule sync exclusions" on public.schedule_sync_exclusions;
create policy "admins can update schedule sync exclusions"
on public.schedule_sync_exclusions
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

drop policy if exists "admins can delete schedule sync exclusions" on public.schedule_sync_exclusions;
create policy "admins can delete schedule sync exclusions"
on public.schedule_sync_exclusions
for delete
to authenticated
using (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

alter function public.admin_delete_schedule_event(uuid) security invoker;
