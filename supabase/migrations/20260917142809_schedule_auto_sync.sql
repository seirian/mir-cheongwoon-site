-- Daily Google Sheet -> schedule_events synchronization.
-- Runs at 00:00 KST (15:00 UTC) and only manages source_type='google_sheet'.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.schedule_sync_config (
  id smallint primary key check (id = 1),
  cron_token text not null,
  sheet_id text not null,
  enabled boolean not null default true,
  max_changes integer not null default 60 check (max_changes between 1 and 200),
  max_deletes integer not null default 15 check (max_deletes between 0 and 50),
  updated_at timestamptz not null default now()
);

alter table public.schedule_sync_config enable row level security;
revoke all on table public.schedule_sync_config from anon, authenticated;

insert into public.schedule_sync_config (id, cron_token, sheet_id)
values (
  1,
  encode(gen_random_bytes(32), 'hex'),
  '1QBvpplp5ZeSFkVWaUNU2CMDJ74FPBuUkvn3fgKqUgH8'
)
on conflict (id) do update set
  sheet_id = excluded.sheet_id,
  enabled = true,
  updated_at = now();

create table if not exists public.schedule_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running','success','dry_run','skipped','failed','guard_blocked')),
  months text[] not null default '{}',
  source_rows integer not null default 0,
  inserted_rows integer not null default 0,
  updated_rows integer not null default 0,
  deleted_rows integer not null default 0,
  error_code text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists schedule_sync_runs_started_at_idx
  on public.schedule_sync_runs(started_at desc);

alter table public.schedule_sync_runs enable row level security;
revoke all on table public.schedule_sync_runs from anon, authenticated;
grant select on table public.schedule_sync_runs to authenticated;

drop policy if exists "admins can read schedule sync runs" on public.schedule_sync_runs;
create policy "admins can read schedule sync runs"
on public.schedule_sync_runs for select
to authenticated
using (exists (
  select 1 from public.admins a where a.user_id = (select auth.uid())
));

-- Reusing this job name updates the existing job rather than creating duplicates.
select cron.schedule(
  'schedule-sync-midnight-kst',
  '0 15 * * *',
  $cron$
  select net.http_post(
    url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/schedule-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-schedule-sync-token', (
        select cron_token from public.schedule_sync_config where id = 1
      )
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $cron$
);

create unique index if not exists schedule_sync_single_running_idx
  on public.schedule_sync_runs ((status))
  where status = 'running';
