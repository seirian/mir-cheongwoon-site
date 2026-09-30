# 일정표 자동 동기화

- 원본: Google Sheet `미르 노래책`
- 실행: 매일 00:00 / 12:00 KST (`0 3,15 * * *` UTC)
- 범위: 이전 달 / 현재 달 / 다음 달
- Edge Function: `schedule-sync`
- 관리 대상: `schedule_events.source_type = 'google_sheet'`만
- 수동 등록 일정(`source_type = 'manual'`)은 수정/삭제하지 않음

## 원본 파싱

월별 탭 이름은 `YYYY.M` 형식입니다.
각 주의 날짜 행은 6/11/16/21/26/31행,
일정 행은 7/12/17/22/27/32행을 사용합니다.
Google gviz CSV를 행 단위로 읽고 날짜 행이 예상 달력과 일치하는지 검증한 뒤 반영합니다.

## 동기화 규칙

- `source_key = sheet-YYYY-MM-DD` 기준 upsert
- 원본에서 비워진 자동 일정은 삭제
- `휴방` > `합방` > `대회` > `기타` 순서로 분류
- 하루 원문 셀의 줄바꿈/이모지를 그대로 `title`에 보존
- 월 탭이 아직 없으면 그 달은 건너뛰며 기존 데이터도 삭제하지 않음
- 1회 변경 60건 초과 또는 삭제 15건 초과 시 자동 반영 중단
- 실행 결과는 `schedule_sync_runs`에 기록

Cron 호출은 DB 내부 전용 토큰으로 인증하며 Supabase API 키를 새로 만들지 않습니다.

- 내부 설정 테이블은 anon/authenticated 클라이언트에 명시적으로 항상 거부됩니다.
- Cron의 pg_net 응답 timeout은 Google Sheet 조회 시간을 고려해 15초입니다.
- Supabase API Gateway가 일시적으로 `PGRST303` / JWT 401을 반환할 경우 최초 설정 조회를 짧게 재시도합니다.
- 정기 배치 3분 뒤(00:03 / 12:03 KST) `schedule-sync-recovery-kst`가 직전 15분 내 성공한 cron 배치가 없을 때만 동일 배치를 재호출합니다.


## 배치 사후 자동 점검

- 점검 실행: 각 일정 배치 10분 뒤인 00:10 / 12:10 KST (`10 3,15 * * *` UTC)
- Edge Function: `schedule-sync-monitor`
- 검사 항목:
  - 직전 정기 배치 실행 기록 존재 여부
  - 배치 상태가 `success`인지
  - 원본 Google Sheet와 DB의 미반영 신규/수정/삭제 건 존재 여부
  - 메모 본문/참여 이력 동기화 오류 여부
- 정상일 때는 알림을 보내지 않음
- 실패/미반영/점검 오류가 있을 때만 Discord Webhook으로 알림
- 점검 결과는 `schedule_monitor_runs`에 기록
- Discord Webhook URL은 DB의 `schedule_monitor_config`에만 저장하며 저장소에는 기록하지 않음
