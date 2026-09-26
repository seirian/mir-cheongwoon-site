# 구조 안내

코드와 배포 워크플로를 기준으로 유지하는 작업용 지도다.

| 영역 | 진입점 | 역할 |
| --- | --- | --- |
| 앱 시작 | `src/main.jsx` | React, 라우터 basename, CSS 로딩 순서 |
| 화면 경로 | `src/App.jsx` | 홈, 미르, 밴드, 이력, 일정, 갤러리, 계정, 관리자 |
| 화면/공통 UI | `src/pages/`, `src/components/` | 페이지 구성과 편집 UI |
| 정적 콘텐츠 | `src/data/`, `public/` | 소개 데이터, 이미지, 배포할 정적 파일 |
| 공통 로직 | `src/lib/` | URL 처리와 서비스 클라이언트 |
| PHP API | `server/api/` | SOOP, 팬아트, 캐시, health endpoint |
| 데이터 계층 | `supabase/` | SQL 이력과 Edge Functions; 상세 내용은 해당 파일 확인 |
| 보조 함수 | `netlify/functions/` | Netlify 호환용 함수 |
| 운영 배포 | `.github/workflows/deploy-yeop.yml` | `mir.yeop.net` 릴리스 빌드·배포 |
| 배포 도구 | `scripts/*deploy_ci.py`, `server/release.htaccess` | 공유 호스팅 릴리스와 라우팅 |

운영 워크플로는 `scripts/mir_shared_root_deploy_ci.py`를 실행한다. 파일명에 `yeop`가 남아 있지만 현재 배포 대상은 `mir.yeop.net`이다. 배포 작업 시 워크플로와 스크립트의 실제 설정을 확인한다.

로컬 Vite 서버는 PHP를 실행하지 않는다. 프런트엔드 빌드 성공만으로 API·인증·DB 권한·외부 서비스 연동이 검증되지는 않는다.
