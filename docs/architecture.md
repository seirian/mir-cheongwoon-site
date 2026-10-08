# 구조 안내

코드와 배포 워크플로를 기준으로 유지하는 작업용 지도다.

| 영역 | 진입점 | 역할 |
| --- | --- | --- |
| 앱 시작 | `src/main.jsx` | React, 라우터 basename, CSS 로딩 순서 |
| 화면 경로 | `src/App.jsx` | 홈, 미르, 밴드, 이력, 일정, 갤러리, 계정, 관리자, 정책 |
| 화면/공통 UI | `src/pages/`, `src/components/` | 페이지 구성과 편집 UI |
| 정적 콘텐츠 | `src/data/`, `public/` | 소개 데이터, 이미지, 배포할 정적 파일 |
| 정책 운영/검토 | `policyPublished.js`, `policyContent.js` | 공개 방침과 과거 검토안 분리 |
| 공통 로직 | `src/lib/` | URL 처리와 서비스 클라이언트 |
| PHP API | `server/api/` | SOOP, 팬아트, 캐시, health endpoint |
| 데이터 계층 | `supabase/` | SQL 이력과 Edge Functions; 상세 내용은 해당 파일 확인 |
| 회원 탈퇴 | `supabase/functions/member-withdrawal/` | JWT·현재 비밀번호 확인 후 본인 계정 삭제 |
| 보조 함수 | `netlify/functions/` | Netlify 호환용 함수 |
| 운영 배포 | `.github/workflows/deploy-yeop.yml` | `mir.yeop.net` 릴리스 빌드·배포 |
| 배포 진입점 | `scripts/mir_policy_deploy_ci.py` | 기존 엔진에 정책 라우트와 롤백 대상 UI 검사 추가 |
| 기존 배포 엔진 | `scripts/mir_shared_root_deploy_ci.py` | 공유 호스팅 릴리스·원자적 라우팅·롤백 |

운영은 GitHub Actions에서 수행한다. 원격 PC는 필요하지 않다. `mir_policy_deploy_ci.py`는 기존 `mir_shared_root_deploy_ci.py`의 원자적 활성화와 롤백을 재사용한다. 파일명에 yeop가 남아 있지만 배포 대상은 mir.yeop.net이며 개인 yeop.net은 독립적으로 유지한다.

로컬 Vite 서버는 PHP를 실행하지 않는다. 빌드·모의 테스트 성공과 실제 인증·DB 데이터 삭제 검증은 구분한다. 정책별 미확정 사실과 검증 범위는 `docs/tasks/privacy-production-20261008.md`를 참조한다.
