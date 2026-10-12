# 일배치 Discord 결과 리포트

## 현재 업무 배치
| 배치 | KST 실행 시각 | 성공 판정 |
| --- | --- | --- |
| 일정 동기화 `schedule-sync-midnight-kst` | 00:00 / 12:00 | `schedule_sync_runs.status = success` |
| 최신 영상 `recent-video-sync-midnight-kst` | 00:00 | `success` 또는 `no_change` |
| 최신 쇼츠 `recent-shorts-sync-midnight-kst` | 00:00 | `success` 또는 `no_change` |
| 팬아트 백업 `fanart-daily-backup-0100-kst` | 01:00 | 당일 성공 실행과 정상 저장본 |

일정 복구는 00:03/12:03, 사후 점검은 00:10/12:10이다. 일정·영상·쇼츠의 결과 보고는 기존 `daily-batch-report` 함수로 00:12/12:12에 수행한다. 이 영역의 동작은 변경하지 않았다.

## 팬아트 보고 / 자동 복구 (2026-10-12 보완)
`daily-batch-report-fanart-kst`의 이름과 01:05 시각을 유지하되 대상은 전용 `fanart-daily-recovery` 함수(initial 모드)로 전환한다. 제한 대기를 최종 실패와 구분하고, 재시도 가능 시각·실제 시도 횟수·기존 저장본 시각을 알린다.

01~23시 매시 20/50분에 상태를 확인하고, 제한이 만료된 ready 상태에서만 실제 재시도한다. 실제 수집은 하루 총4회, 최소30분 간격, 401/403/429 후6시간 보호를 유지한다. 성공 또는 시도 소진 시 final 결과를 보고하며, 계속 대기 중이면 23:55에 당일 미완료를 최종 보고한다. 23:50 이후 새 수집은 시작하지 않는다.

팬아트 기록은 `fanart_recovery_state`와 `fanart_recovery_notifications`에 저장한다. 다른 배치와 기존 과거 보고는 `daily_batch_report_runs`에 그대로 남는다. 새 알림 원장은 날짜+단계 유일 키로 중복 전송을 막는다. 이미 최초 성공을 보고한 날에는 최종 성공을 중복 발송하지 않는다.

인증 토큰과 Discord Webhook은 기존 `schedule_monitor_config`를 서버에서만 재사용한다. 새 함수의 dry-run 본문은 `{"mode":"tick","dry_run":true}`이며, 현재 한국 날짜의 읽기 전용 판정만 수행하고 실제 수집/DB 기록/Discord 전송은 하지 않는다. `mode`는 initial/tick/final이다. 과거 날짜나 강제 수집 인자는 받지 않는다.

상세 정책, 배포·되돌리기 및 전송 불확실성 처리: [팬아트 복구 작업 기록](../docs/tasks/fanart-recovery-20261012.md).
