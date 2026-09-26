-- Admin schedule deletion that survives subsequent Google Sheet sync runs.
create table if not exists public.schedule_sync_exclusions (
  source_key text primary key
    check (source_key ~ '^sheet-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  excluded_at timestamptz not null default now(),
  excluded_by uuid references auth.users(id) on delete set null
);

alter table public.schedule_sync_exclusions enable row level security;
revoke all on table public.schedule_sync_exclusions from anon, authenticated;

create or replace function public.admin_delete_schedule_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_event record;
  v_sheet_suppressed boolean := false;
begin
  if v_uid is null
     or not exists (
       select 1
       from public.admins a
       where a.user_id = v_uid
     ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select id, source_type, source_key, event_date, title
    into v_event
  from public.schedule_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'schedule_event_not_found' using errcode = 'P0002';
  end if;

  if v_event.source_type = 'google_sheet'
     and coalesce(v_event.source_key, '') ~ '^sheet-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    insert into public.schedule_sync_exclusions (source_key, excluded_at, excluded_by)
    values (v_event.source_key, now(), v_uid)
    on conflict (source_key) do update
      set excluded_at = excluded.excluded_at,
          excluded_by = excluded.excluded_by;
    v_sheet_suppressed := true;
  end if;

  delete from public.schedule_events where id = p_event_id;

  return jsonb_build_object(
    'id', v_event.id,
    'source_key', v_event.source_key,
    'sheet_suppressed', v_sheet_suppressed
  );
end;
$$;

revoke all on function public.admin_delete_schedule_event(uuid) from public;
revoke all on function public.admin_delete_schedule_event(uuid) from anon;
grant execute on function public.admin_delete_schedule_event(uuid) to authenticated;
