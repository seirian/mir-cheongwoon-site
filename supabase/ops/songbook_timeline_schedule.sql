-- Activate only after schema, Edge and production verification. Token remains server-only.
select cron.schedule('songbook-timeline-sync-hourly','35 * * * *',$job$
 select net.http_post(
  url:='https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/songbook-timeline-sync',
  headers:=jsonb_build_object('Content-Type','application/json','x-songbook-sync-token',(select sync_token from public.songbook_sync_settings where id=1)),
  body:='{"action":"tick"}'::jsonb,timeout_milliseconds:=110000
 ) where (select enabled from public.songbook_sync_settings where id=1);
$job$);
