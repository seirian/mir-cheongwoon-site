-- Run schedule sync twice daily and verify each run 10 minutes later.
-- KST 00:00 / 12:00 = UTC 15:00 / 03:00.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'schedule-sync-midnight-kst'),
  schedule := '0 3,15 * * *'
);

create table if not exists public.schedule_monitor_config (
  id smallint primary key check (id = 1),
  monitor_token text not null,
  enabled boolean not null default true,
  discord_webhook_url text,
  updated_at timestamptz not null default now()
);

alter table public.schedule_monitor_config enable row level security;
revoke all on table public.schedule_monitor_config from anon, authenticated;

insert into public.schedule_monitor_config (id, monitor_token, enabled)
values (1, encode(gen_random_bytes(32), 'hex'), true)
on conflict (id) do update set
  enabled = true,
  updated_at = now();

create table if not exists public.schedule_monitor_runs (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  batch_started_at timestamptz,
  batch_run_id bigint references public.schedule_sync_runs(id) on delete set null,
  status text not null check (status in ('ok','alert','monitor_error')),
  reason text,
  details jsonb not null default '{}'::jsonb,
  notification_status text not null default 'not_needed'
    check (notification_status in ('not_needed','sent','skipped_unconfigured','failed')),
  notified_at timestamptz
);

create index if not exists schedule_monitor_runs_checked_at_idx
  on public.schedule_monitor_runs(checked_at desc);

alter table public.schedule_monitor_runs enable row level security;
revoke all on table public.schedule_monitor_runs from anon, authenticated;
grant select on table public.schedule_monitor_runs to authenticated;

drop policy if exists "admins can read schedule monitor runs" on public.schedule_monitor_runs;
create policy "admins can read schedule monitor runs"
on public.schedule_monitor_runs for select
to authenticated
using (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

-- KST 00:10 / 12:10 = UTC 15:10 / 03:10.
select cron.schedule(
  'schedule-sync-monitor-kst',
  '10 3,15 * * *',
  $cron$
  select net.http_post(
    url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/schedule-sync-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-schedule-monitor-token', (
        select monitor_token
        from public.schedule_monitor_config
        where id = 1
      )
    ),
    body := jsonb_build_object('trigger', 'cron-monitor'),
    timeout_milliseconds := 30000
  );
  $cron$
);
