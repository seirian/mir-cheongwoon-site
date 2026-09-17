-- Explicitly deny all client access to internal sync configuration.
drop policy if exists "client access denied to schedule sync config"
  on public.schedule_sync_config;
create policy "client access denied to schedule sync config"
on public.schedule_sync_config
for all
to anon, authenticated
using (false)
with check (false);

-- pg_net defaults to 5 seconds; allow the Google Sheet sync enough time to return.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'schedule-sync-midnight-kst'),
  schedule := '0 15 * * *',
  command := $cron$
  select net.http_post(
    url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/schedule-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-schedule-sync-token', (
        select cron_token from public.schedule_sync_config where id = 1
      )
    ),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 15000
  );
  $cron$,
  active := true
);
