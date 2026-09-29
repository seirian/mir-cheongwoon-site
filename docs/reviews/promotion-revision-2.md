# 2차 검토: 홈 균형·이미지 관리·카드 높이·일정표

## 목적과 완료 조건
사용자 피드백 세 항목을 기존 feature/promotion-discovery-preview 및 Draft PR #62에 반영한다. main/develop 병합과 운영 라우팅 변경은 하지 않는다.

- 홈은 아래 콘텐츠와 같은 중앙 최대 폭, 내부 좌우 여백은 viewport에 따라 무한히 커지지 않도록 제한한다.
- 대표 라이브 CTA는 사용자 지정 https://www.youtube.com/watch?v=Gh4PqvQVWRc 로 고정한다.
- 입문 추천의 영상 제목은 두 줄 높이를 항상 확보한다. 긴 제목은 두 줄 clamp, 원문 텍스트는 DOM에 유지한다.
- 일정표 소개 한 줄 스타일의 인접 형제 선택자가 모바일 agenda 삽입으로 깨진 원인을 수정한다. 긴 텍스트는 영역 내 수평 스크롤로 읽도록 하며 페이지 전체가 넘치지 않게 한다.

## 홈 이미지 저장과 권한
기존 Supabase `gallery` Storage bucket의 관리자 정책을 재사용한다. 배포 작업은 DB DDL, RLS 변경, 기존 갤러리 행 변경, 사용자 계정 생성이나 권한 부여를 하지 않는다.

- 운영 객체: `gallery/site-hero/production/current.webp`
- 검토 객체: `gallery/site-hero/promotion-discovery-preview/current.webp`
- 메타데이터 list의 updated_at을 URL 버전으로 사용한다. 저장은 upsert이며 브라우저 메모리만 바꾸는 데모가 아니다. 재접속·다른 방문자·새 feature release에서도 같은 scoped 객체를 읽는다.
- 일반 빌드는 기존 사이트 로그인 세션을 재사용한다. 확인된 관리자에게만 이미지 교체 버튼이 나타난다.
- 검토 빌드는 홈 전용 별도 이메일 로그인, 독립 storageKey, 세션 미보존, 자동 URL 세션 감지 중지를 사용한다. 검토 로그인은 다른 미리보기 페이지의 편집을 활성화하지 않는다.
- 검토 클라이언트는 auth password/refresh/local logout, 자기 admin 조회, 정확한 이미지 객체의 upload 및 prefix 한정 list만 허용한다. 다른 쓰기·운영 객체 경로·다른 origin은 fetch 이전에 차단한다. 이 클라이언트 규칙은 방어 보조이고 서버 RLS가 최종 권한 경계이다.
- 저장 직전에 Auth getUser와 public.admins의 본인 user_id를 재확인한다. 기존 Storage 정책은 INSERT/UPDATE를 admins 존재 여부로 제한한다. 일반 authenticated 사용자라는 이유만으로 업로드를 허용하지 않는다.
- 2026-09-29 읽기 전용 확인: gallery bucket은 공개 읽기, 10MB 제한, JPEG/PNG/WebP/GIF만 허용; INSERT/UPDATE/DELETE는 기존 admins 검사 정책이다. UI는 더 좁은 PNG/JPEG/WebP 5MB, 24MP 제한이며 긴 변 1600px로 정지 WebP 재인코딩한다. SVG/HTML, 확장자와 실제 바이트가 맞지 않는 파일은 거절한다.
- 선택 미리보기·취소·오류 안내·저장 상태, Object URL 해제, dialog Escape/포커스를 처리한다. 검토 이미지 저장은 모든 검토자에게 공개되지만 운영용 이미지로 자동 승격되지 않는다.

## 검증
- `npm run verify`의 기존 검사에 hero-image.test.js 여섯 테스트 추가.
- 기존 promotion-browser-check.py는 1차 회귀 검사를 유지하고 promotion_revision_checks.py를 호출한다.
- 320/390/1440/1920/2560px 홈 균형, 두 줄 높이, 지정 링크, 1440/390px 일정 소개·제목·가로 넘침을 검사한다.
- 실제 주소에서는 로그인창을 열기까지만 수행한다. 계정 제출·업로드는 로컬 fixture URL에 한정한다.
- 로컬 브라우저 fixture에서 비관리자 차단, 관리자 업로드, 잘못된 형식, 취소, 실패 후 기존 이미지, 정상 저장, 다른 방문자·새로고침 지속을 검사한다.
- 실제 관리자 자격 증명으로 로그인하거나 실제 Storage에 테스트 이미지를 업로드하지 않는다. 사용자가 검토 화면에서 직접 확인할 수 있다.

## 참고
- Supabase Storage RLS: https://supabase.com/docs/guides/storage/security/access-control
- 클라이언트에 서비스 역할 키를 추가하지 않는다. 기존 공개 anon/publishable 설정만 사용한다.
