# 일배치 Discord 결과 리포트

현재 운영 중인 정기 배치의 성공/실패 결과를 기존 일정 자동 점검 Discord Webhook 채널로 통합 전송합니다.

## 현재 업무 배치

| 배치 | KST 실행 시각 | 성공 판정 |
| --- | --- | --- |
| 일정 동기화 `schedule-sync-midnight-kst` | 00:00 / 12:00 | `schedule_sync_runs.status = success` |
| 최신 영상 `recent-video-sync-midnight-kst` | 00:00 | `success` 또는 `no_change` |
| 최신 쇼츠 `recent-shorts-sync-midnight-kst` | 00:00 | `success` 또는 `no_change` |
| 팬아트 백업 `fanart-daily-backup-0100-kst` | 01:00 | 상태 API의 당일 `lastRun.status = success` |

일정 배치에는 아래 보조 작업도 함께 확인합니다.

- `schedule-sync-recovery-kst`: 00:03 / 12:03, 원 배치 실패 시 조건부 재시도
- `schedule-sync-monitor-kst`: 00:10 / 12:10, 원본/DB 미반영 여부 사후 검증

## 결과 알림

동일한 `daily-batch-report` Edge Function을 세 번 호출합니다.

- 00:12 KST: 일정 + 최신 영상 + 쇼츠 + 일정 사후 점검
- 01:05 KST: 팬아트 일일 백업
- 12:12 KST: 일정 + 일정 사후 점검

성공과 실패 모두 Discord로 발송합니다. 일정 배치에서 기존 오류 전용 자동 점검 알림은 안전망으로 그대로 유지되므로, 일정 장애 시 즉시 오류 알림 후 00:12/12:12 통합 결과 요약이 추가로 도착할 수 있습니다.

## 판정 원칙

- pg_cron 자체가 호출됐더라도 실제 업무 실행 기록이 없으면 실패로 판정합니다.
- 일정 복구 cron으로 최종 성공한 경우 성공으로 처리하고 메시지에 `자동 복구 사용`을 표시합니다.
- 영상/쇼츠의 `no_change`는 정상 성공입니다.
- 팬아트는 `/api/naver-fanart-daily.php?status=1`의 당일 실행 결과를 사용합니다.
- 날짜/구간별 Discord 전송 결과는 `daily_batch_report_runs`에 저장하며, 이미 `sent`인 구간은 중복 전송하지 않습니다.
- Discord Webhook URL과 호출 토큰은 기존 `schedule_monitor_config`를 재사용하며 저장소에 비밀값을 기록하지 않습니다.

## Dry-run

운영 알림 없이 과거/현재 결과 판정만 확인할 때는 함수에 다음 body를 전달합니다.

```json
{
  "mode": "midnight",
  "report_date": "2026-10-01",
  "dry_run": true
}
```

`mode`는 `midnight`, `fanart`, `noon` 중 하나입니다.
