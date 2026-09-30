-- 일정 동기화 정기 배치가 일시적 인증 오류 등으로 실행 기록을 남기지 못한 경우
-- 3분 뒤 한 번 더 시도합니다. 직전 15분 내 정상 cron 성공 기록이 있으면 호출하지 않습니다.

select cron.schedule(
  'schedule-sync-recovery-kst',
  '3 3,15 * * *',
  $cron$
    select net.http_post(
      url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/schedule-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-schedule-sync-token',
        (select cron_token from public.schedule_sync_config where id = 1)
      ),
      body := jsonb_build_object('trigger', 'cron'),
      timeout_milliseconds := 15000
    ) as request_id
    where not exists (
      select 1
      from public.schedule_sync_runs
      where started_at >= now() - interval '15 minutes'
        and status = 'success'
        and details->>'trigger' = 'cron'
    );
  $cron$
);
