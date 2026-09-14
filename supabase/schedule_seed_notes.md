# 2026 일정표 초기 데이터

- 원본: Google Sheet `미르 노래책`
- 이관 범위: `2026.1` ~ `2026.9`
- 이관 건수: 날짜별 원문 블록 267건
- 저장 방식: 날짜별 셀의 줄바꿈/이모지를 `schedule_events.title`에 그대로 보존
- `source_type`: `google_sheet`
- `source_key`: `sheet-YYYY-MM-DD`
- 중복 방지: `source_key` unique
- 2026.10 ~ 2026.12는 초기 데이터가 없어도 `/schedule`에서 빈 달력으로 조회 가능

운영 DB에는 초기 데이터가 이미 이관되어 있으며, 월별 원문 해시를 비교해 2026.1~9 추출본과 일치함을 확인했습니다.
