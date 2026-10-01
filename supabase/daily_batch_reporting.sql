-- Centralized Discord result reporting for scheduled daily batches.
-- Reuses schedule_monitor_config.monitor_token and discord_webhook_url.

create table if not exists public.daily_batch_report_runs (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  report_mode text not null check (report_mode in ('midnight','fanart','noon')),
  checked_at timestamptz not null default now(),
  status text not null check (status in ('success','failure')),
  details jsonb not null default '{}'::jsonb,
  notification_status text not null default 'pending'
    check (notification_status in ('pending','sent','failed','skipped_unconfigured','dry_run')),
  notified_at timestamptz,
  unique (report_date, report_mode)
);

alter table public.daily_batch_report_runs enable row level security;
revoke all on table public.daily_batch_report_runs from anon, authenticated;
grant select, insert, update on table public.daily_batch_report_runs to service_role;

-- Keep this script idempotent when re-applied.
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'daily-batch-report-midnight-kst',
  'daily-batch-report-fanart-kst',
  'daily-batch-report-noon-kst'
);

select cron.schedule(
  'daily-batch-report-midnight-kst',
  '12 15 * * *',
  $cron$
    select net.http_post(
      url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/daily-batch-report',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-daily-batch-report-token',
        (select monitor_token from public.schedule_monitor_config where id=1)
      ),
      body := jsonb_build_object('mode','midnight'),
      timeout_milliseconds := 30000
    );
  $cron$
);

select cron.schedule(
  'daily-batch-report-fanart-kst',
  '5 16 * * *',
  $cron$
    select net.http_post(
      url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/daily-batch-report',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-daily-batch-report-token',
        (select monitor_token from public.schedule_monitor_config where id=1)
      ),
      body := jsonb_build_object('mode','fanart'),
      timeout_milliseconds := 30000
    );
  $cron$
);

select cron.schedule(
  'daily-batch-report-noon-kst',
  '12 3 * * *',
  $cron$
    select net.http_post(
      url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/daily-batch-report',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-daily-batch-report-token',
        (select monitor_token from public.schedule_monitor_config where id=1)
      ),
      body := jsonb_build_object('mode','noon'),
      timeout_milliseconds := 30000
    );
  $cron$
);
