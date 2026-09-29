# 홍보 동선 개선 / feature/promotion-discovery-preview

## 목적과 완료 조건
기존 미르 × 청운밴드 팬 아카이브를 유지하며 첫 방문자가 대표 음악 감상,
아티스트 이해, 공식 채널 방문과 다음 일정 확인으로 이어지게 한다.
요청 범위는 최우선 2개·높음 3개·중간 2개이다. main/develop 병합과 운영 배포는 하지 않는다.

## 변경
1. 미작성 이름·포지션·소개와 멤버 04 등 템플릿은 공개 UI에서 제외한다. 기존 관리자 편집은 유지한다.
2. 제공된 캐릭터의 정지 WebP를 활용한 홈, 공식 라이브/방송 CTA를 추가한다.
3. 입문 추천 3개를 최신 영상과 분리하고 선택형 YouTube 재생으로 초기 iframe 요청을 줄인다.
4. 악기 역할, 공개 소개와 공연 기록 링크를 멤버 카드에 연결한다.
5. KST 다음 일정·오류/빈 상태, ICS 저장과 공식 채널 안내를 제공한다.
6. 일곱 공연에 고유 상세 주소·공개 곡·참여 정보·사진·공유 및 검증된 타임스탬프 지원을 추가한다.
7. 페이지별 정적 HTML 메타데이터/OG PNG, 모바일 메뉴·일정 목록, 키보드·동작 줄이기를 적용한다.

## 데이터와 사실의 경계
- DB 스키마·RLS·운영 데이터는 변경하지 않는다. 기존 공개 읽기 경로만 재사용한다.
- 멤버 필터는 UI 완성도 기준이며 DB 비공개/접근권한 기능이 아니다. 진짜 작성 중 데이터의
  기밀성이 필요하면 추후 별도 승인된 스키마와 RLS 변경이 필요하다.
- 회원가입/로그인/관리 편집은 preview 빌드에서 차단한다. 별도 auth storage key,
  세션 미보존, URL 세션 감지 중지, Supabase 변이 HTTP 메서드 차단을 적용한다.
- 참여 명단·곡 순서·영상 ID·타임스탬프를 창작하지 않는다.
- `src/data/promotionData.js`에서 추천곡/고정 공식 URL과 확정된 공연 자료를 편집한다.
  첫 두 추천은 기존 공개 곡 제목과 등록 영상 목록을 매칭한다. 마지막은 최근 방송 슬롯이다.
- 개인 참여 이력이 비어 있으면 밴드 수준의 공연 기록임을 명시한다.
- 사진은 같은 공연 날짜의 기존 갤러리를 연결한다. 날짜가 겹치는 공연이 생기면 확정 ID 매핑으로 교체한다.
- ICS는 다운로드 시점의 복사본이며 일정 변경을 자동 구독하지 않는다. 시간 미정은 명시적인 종일 일정이다.

## 검증
- Node 24: `npm ci && npm run verify` (순수 로직 회귀 테스트 포함)
- Python/PHP: `npm run check:backend`
- 브라우저: `python scripts/promotion-browser-check.py --url http://127.0.0.1:5173/`
  `VITE_REVIEW_PREVIEW=true`, `VITE_SUPABASE_URL=https://preview-fixture.supabase.co`,
  `VITE_SUPABASE_ANON_KEY=local-fixture-public-key`로 Vite를 실행한다.
  Playwright는 CI 전용이며 운영 의존성에 추가하지 않는다.
- 320/390/768/1024/1440px, 대표 경로, template 필터, 빈/실패 상태, lazy player,
  KST ICS 다운로드, 메뉴 Escape, noindex, 계정 차단을 검증한다. 테스트 데이터는 배포하지 않는다.
- 별도 staged URL에 `--live`로 읽기 전용 화면/스크린샷 검증을 추가한다.
- 실제 영상의 음질/전체 재생, 모바일 실기기, 로그인 이후 운영 편집은 이 검토 범위 밖이다.

## 미리보기와 운영 배포의 분리
`.github/workflows/promotion-preview.yml`은 지정 feature 브랜치에서만 실행한다.
기존 배포의 공개 client 설정 준비 단계를 재사용하며 비밀값을 보고서에 남기지 않는다.
`stage-promotion-preview.py`는 ACTIVATE=false를 강제하고 기존 배포 도구의 staged-only 모드를 사용한다.
새 release 디렉터리 외 운영 라우팅은 수정하지 않으며 SFTP 전후 루트 라우팅 해시를 비교한다.
미리보기는 공개 URL이지만 noindex이며 비공개 인증벽은 아니다.

운영 반영은 사용자 검토 후 별도 PR 과정이다. 정적 메타데이터가 생성되는 빌드와
수정된 라우팅을 함께 반영해야 한다. 새 `scripts/page-metadata.mjs`의 결과 HTML은
정적 제목/설명 제공용이며 페이지 본문 전체의 SSR/검색 색인 보장은 아니다.

## 공유 이미지 재생성
이미지는 기존 사이트 자산으로부터 파생한 것이며 실제 공연 사진으로 표현하지 않는다.
`python scripts/generate-promo-assets.py` (Pillow, Noto CJK 필요)로 PNG와 정지 WebP를
재생성한다. 일반 `npm run build`에는 Python 이미지 의존성이 필요하지 않다.
