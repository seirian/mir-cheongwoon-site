# 노래책 1차 초안

## 목적과 완료 조건
사용자 지정 `feature/songbook`에서 작업한다. 최신 develop `3c775bc69bcceb0ea868515c9d6b68e54970c08d`를 기반으로 하며 main/develop에 병합하거나 운영 릴리스를 활성화하지 않는다.

완료 조건은 노래책 메뉴, 검색·필터·정렬·페이지 나누기, 출처 있는 곡 상세, 브라우저 즐겨찾기, 곡 정보 복사, CSV/JSON 내보내기, 수록 기준 검토실, 별도 noindex 공개 미리보기다. API/DB 쓰기 및 신청곡 전송은 하지 않는다.

## 경로와 구조
- `/songbook`: 목록, 제목/가수/초성/별칭 검색, 분류·가수·출처·신청 상태 필터, 24개 단위 페이지, 곡 상세. URL 쿼리로 검색 조건/페이지/선택 곡을 공유한다.
- `/songbook/review`: 출처별 수집 수, 미리내 검색 후보, 중복·가수 충돌, 한계 및 체크리스트, 전체 CSV/출처 포함 JSON.
- `src/data/songbookData.json`: 정적 수집본. 원본 표기, 키, 원본 적응도, 영상/MR 출처를 보존한다. 새 요청 상태는 모두 unreviewed, 난이도/숙련도/가창일은 null이다.
- `src/data/songbookCafeFindings.json`: 공개 검색에서 확인한 7개 게시물 후보. 제목·게시일만 확인했으며 본문 확인을 대신하지 않는다. 검색 URL의 임시 토큰, 작성자 개인정보는 저장하지 않는다.
- 노래책 코드는 lazy-load되어 홈페이지 초기 진입 시 전체 목록을 로드하지 않는다.
- 운영 Supabase 스키마·계정·기존 일배치에는 변경이 없다.

## 데이터 근거와 범위
수집일은 한국 시간 2026-10-02, 조사 목표는 2022-10-26~2026-10-01이다. 수집일과 실제 가창일을 혼동하지 않는다.

| 자료 | 원본 행 수 | 확인 |
|---|---:|---|
| https://mir427.vercel.app/songs | 334 | 공개 렌더링 목록, 제목·가수·분류·출처 적응도·키·클립·MR |
| https://gurmir.com/songbook/ | 338 | 공개 렌더링 목록, 제목·가수·분류·키·연결 영상 |
| https://cafe.naver.com/alice427 | 본 목록 반영 0 | 노래책/세트리스트/노래 공개 검색 첫 페이지 표본, 검토 후보 7개 |

672개 행에서 공백·문장부호·대소문자 정규화와 검토한 제목 별칭 19쌍을 적용하여 342개 항목으로 정리했다. 327개는 두 자료에 등재, 341개는 유효한 형식의 가창 영상 링크가 있다. `X` 22개 및 `#N/A` 1개는 링크에서 제외했다. 모든 원본 행의 출처는 남겼다. 동일 원본을 공유할 수 있어 다중 출처를 독립 검증으로 표현하지 않는다.

도리도리쏭처럼 같은 제목에 가수 표기가 다른 항목은 병합하지 않았다. 번안·편곡·동명 이곡은 제목만 보고 합치지 않는다. 영상 주소의 형식 검사와 실제 재생·가창 확인은 다르다. 영상과 MR은 별도 필드로 저장한다.

미리내에서 확인한 주요 후보는 BLUED 세트리스트(게시물 76810), 2026-07-06 노래책 추가 연습뱅 모음(148959), 2026-09-27 미미득 합방 모음(165076), 미르가 보컬로 명시된 165005/165001/164998/164995다. 카페 [미르] 말머리만으로 본인 가창으로 판단하지 않았다. 제목 속 다른 보컬의 곡은 제외했다. 본문·첨부 영상·정확한 가창일을 확인하기 전 확정 목록이나 검증 완료 가창 이력에 넣지 않는다.

카페 메뉴가 가리키는 기존 주소는 https://meloming.com/channel/mir/musicbook 이다. 이번 익명 조회는 help.meloming.com으로 이동 후 403으로 중단되었다. 인증 제한을 우회하지 않았다.

## 재현과 검증
`Songbook source audit` 실행 36884071998의 익명 공개 브라우저 스냅샷(silver.html/gurmir.html)으로 최초 데이터를 생성했다. 원본 HTML 해시는 JSON sources에 저장한다. 임시 감사 artifact는 만료될 수 있지만 정리된 전체 데이터와 원본 필드는 브랜치에 커밋한다. 페이지 방문 또는 일반 재배포 시 재수집하지 않는다.

```sh
python -m pip install beautifulsoup4==4.13.4
python scripts/import-songbook.py --input SNAPSHOT_DIR --output src/data/songbookData.json
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm run check:backend
VITE_REVIEW_PREVIEW=true VITE_SONGBOOK_PREVIEW=true npm run dev -- --host 127.0.0.1
python scripts/songbook-browser-check.py --url http://127.0.0.1:5173/ --out songbook-local-report
```

브라우저 검사는 검색/별칭/초성/필터/정렬/페이지 유지/즐겨찾기 저장·해제/상세 deep link/키보드/클립보드 실패/CSV·JSON/1440·1024·768·390 화면/JS 오류/서버 쓰기 요청을 확인한다. CI 실제 결과와 스크린샷은 `Songbook preview`의 `songbook-preview-review` artifact에서 확인한다. 이 문서의 검사 목록은 통과 결과를 대신하지 않는다.

## 미리보기 배포 안전장치
`Songbook preview`는 feature/songbook에만 실행된다. 최초 snapshot job만 해당 브랜치의 JSON 파일을 생성·커밋한다. review job은 contents:read이며 기존 배포 자격은 staging 단계에만 전달한다.

`stage-songbook-preview.py`는 두 preview 플래그 및 noindex HTML을 확인하고 ACTIVATE=false를 코드에서 강제한다. 운영 루트 라우팅 파일 2개의 배포 전후 해시를 비교한다. 별도 `/_yeop_releases/<release>/songbook/` 및 `songbook/review/`를 제공한다. 검색 비노출은 접근 제어가 아니므로 공개 자료만 포함한다.

## 이번 초안에서 하지 않은 것
관리자 편집/승인, 로그인 계정 간 동기화, 실제 신청 대기열, 자동 수집 배치, 미리내 전수 수집, 모든 영상 재생 확인, 데뷔 이후 전곡/가창일/타임스탬프의 완전성 검증은 후속 범위다. 사용자 요청 없이 main/develop 병합·운영 활성화·기존 배치 변경은 하지 않는다.
