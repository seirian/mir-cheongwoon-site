# 일정표 자동 동기화

- 원본: Google Sheet `미르 노래책`
- 실행: 매일 00:00 KST (`0 15 * * *` UTC)
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
