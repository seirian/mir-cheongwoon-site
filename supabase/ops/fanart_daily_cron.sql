-- Apply only after the stable production endpoint has been deployed and checked.
-- Existing schedule/video/shorts jobs are deliberately untouched.
-- cron.timezone in the production database is GMT. 16:00 UTC = 01:00 KST next day.
do $$
begin
  if coalesce(current_setting('cron.timezone', true), 'GMT') not in ('GMT', 'UTC') then
    raise exception 'Confirm cron timezone before scheduling daily fanart';
  end if;
end $$;
select cron.schedule(
  'fanart-daily-backup-0100-kst',
  '0 16 * * *',
  $job$
    select net.http_get(
      url := 'https://mir.yeop.net/api/naver-fanart-daily.php',
      headers := '{"Accept":"application/json"}'::jsonb,
      timeout_milliseconds := 55000
    ) as request_id;
  $job$
);

-- A cron "succeeded" means request dispatch, not a successful source collection.
-- Inspect the HTTP response and /api/naver-fanart-daily.php?status=1:
-- lastRun.status must be success; batchDate is KST date; history retains 31 attempts.
-- Bootstrap once after deployment through the same net.http_get call above.
-- The endpoint is once-per-KST-day idempotent (including failures), rejects force/date/URL
-- parameters, and never refreshes before 01:00. It can only collect the configured public
-- fanart board. No credentials, uploads, or user-selected content are accepted.
-- Disable only this job for rollback:
-- select cron.unschedule('fanart-daily-backup-0100-kst');
