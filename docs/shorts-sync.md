# 쇼츠 탭 / 자정 자동 동기화

## 목적과 완료 조건
- `/gallery`에 `영상 → 쇼츠 → 갤러리` 탭을 표시한다. 바로가기: `/gallery?view=shorts`.
- 공식 미르 채널의 최신 쇼츠를 최대 10개, 채널 최신순 순서로 표시한다.
- 매일 **00:00 KST** (`0 15 * * *` UTC)에 별도 `recent-shorts-sync` 작업을 실행한다.
- 일반영상(2개), 커버영상, 갤러리, 일정표 00/12시 및 점검 배치는 변경하지 않는다.

## 구현과 보호 장치
- `source.mjs`: 공식 Shorts 탭의 채널 ID, 선택 탭, 최신순 칩을 검증하고 Shorts 렌더러만 파싱한다. 길이로 쇼츠를 추정하거나 추천 영상에서 ID를 가져오지 않는다.
- 현재 공식 채널의 실제 `externalId`는 `UCNKFX8Kwk0LgX8VqyWFqF3Q`다. 기존 일반영상 설정에 남은 다른 ID를 복사하지 않았다. 일반영상은 기존 핸들 URL 수집을 유지한다.
- 외부 HTML 구조 변경/차단/불완전 결과는 실패로 기록하고 기존 캐시를 유지한다. 공식 YouTube Data API의 Shorts 전용 목록 API라고 주장하지 않는다.
- `recent_shorts`는 공개 읽기만 허용한다. 토큰 설정은 `recent_shorts_sync_config`의 서버 전용 데이터다.
- `replace_recent_shorts`는 service_role만 호출 가능하며 캐시 교체와 성공 로그를 하나의 트랜잭션에서 처리한다. 실패 중간에 목록을 비우지 않는다.
- `recent_shorts_sync_runs`에 success/no_change/dry_run/failed 이력을 기록하고 중복 실행을 제한한다.
- 배치 호출은 `x-recent-shorts-sync-token`으로 자체 인증한다. 비밀 값은 저장소/프런트엔드에 포함하지 않는다.
- 관리자는 시각적으로 오류/빈 상태를 구분할 수 있고 조회 오류는 재시도 가능하다. 임베드 재생 제한에 대비해 YouTube 원문 링크도 제공한다.

## 개발 → 검증 → 운영
1. develop에 구현 후 `npm run verify`와 기존 Windows/Linux 필수 검사를 통과한다.
2. `Shorts integration`에서 Deno entrypoint, 별도 PostgreSQL 17 DB의 migration/RLS/RPC 원자성, 공개 채널 읽기, 데스크톱·태블릿·모바일 UI 테스트를 실행한다. 이 테스트에는 운영 secret이나 DB를 사용하지 않는다.
3. 테스트가 모두 통과하면 develop → main PR을 merge commit으로 병합한다. main의 기존 워크플로가 웹 운영 배포를 수행한다.
4. 검증된 migration과 `recent-shorts-sync` Edge Function을 운영 Supabase에 반영하고 `trigger=initial-deploy`로 초기 목록을 수집한다. cron은 다음 00:00부터 동작한다.
5. 공개 REST 읽기 및 운영 `/gallery?view=shorts`를 확인한다. main을 develop으로 fast-forward 동기화하고 develop은 삭제하지 않는다.

## 검증 명령
- `npm run verify` (기존 테스트 + tests/recent-shorts.test.js)
- `deno check supabase/functions/recent-shorts-sync/index.ts`
- SQL: CI의 tests/sql/shorts-bootstrap.sql은 **버리는 테스트 DB 전용**. 운영 실행 금지.
- 공개 소스 조회: `node scripts/verify-shorts-source.mjs` (GET만 사용)
- 브라우저 테스트: scripts/verify-shorts-ui.mjs / CI 아티팩트에 화면 및 결과 저장

## 운영 점검과 되돌리기
- cron 성공만으로 판단하지 말고 `recent_shorts_sync_runs.status/source_rows/video_ids/error_code`와 실제 REST 목록을 확인한다.
- 알림/실패 재시도 자동화는 이번 요청 범위에 추가하지 않는다. 기존 일정표 Discord 점검은 그대로 유지한다.
- 수집 중지: 설정 enabled=false 또는 해당 cron만 비활성화. 정상 캐시는 남는다. 프런트엔드만 되돌려도 다른 배치에는 영향이 없다.
