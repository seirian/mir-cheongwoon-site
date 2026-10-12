-- Activate ONLY after schema, PHP retry.version=2 and Edge dry-run/auth verification.
-- No literal tokens. Original 01:00 backup and all non-fanart jobs are unchanged.
select cron.schedule('daily-batch-report-fanart-kst','5 16 * * *',$job$
  select net.http_post(
    url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/fanart-daily-recovery',
    headers := jsonb_build_object('Content-Type','application/json','x-fanart-recovery-token',
      (select monitor_token from public.schedule_monitor_config where id=1)),
    body := '{"mode":"initial"}'::jsonb, timeout_milliseconds := 30000
  );
$job$);
select cron.schedule('fanart-daily-recovery-kst','20,50 0-14,16-23 * * *',$job$
  select net.http_post(
    url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/fanart-daily-recovery',
    headers := jsonb_build_object('Content-Type','application/json','x-fanart-recovery-token',
      (select monitor_token from public.schedule_monitor_config where id=1)),
    body := '{"mode":"tick"}'::jsonb, timeout_milliseconds := 110000
  );
$job$);
select cron.schedule('fanart-daily-final-report-kst','55 14 * * *',$job$
  select net.http_post(
    url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/fanart-daily-recovery',
    headers := jsonb_build_object('Content-Type','application/json','x-fanart-recovery-token',
      (select monitor_token from public.schedule_monitor_config where id=1)),
    body := '{"mode":"final"}'::jsonb, timeout_milliseconds := 30000
  );
$job$);
