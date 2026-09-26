# 프로젝트 작업 지침

## 먼저 확인
- 사용자 요청과 기존 변경 사항을 확인하고 `git status --short`로 작업을 시작한다.
- 구조는 [docs/architecture.md](docs/architecture.md), 검증 절차는 [docs/harness.md](docs/harness.md)를 읽는다.
- 설치는 Node 24에서 `npm ci`, 기본 검증은 `npm run verify`를 사용한다.

## 브랜치 흐름
- 개발은 `develop`에서 시작한다. 작업 전 `git fetch origin` 후 `git switch develop`, `git pull --ff-only origin develop`으로 최신 상태를 확인한다. 기존 미커밋 변경이 있으면 먼저 보존한다.
- `main`에서 직접 수정하거나 push하지 않는다. 개발 변경을 `develop`에 반영하고 검증한다.
- 개발 완료 후 `develop` → `main` PR을 만든다. Verify 3개 검사와 `Develop promotion` 검사를 모두 통과해야 병합할 수 있다.
- UI/API 수동 검증도 완료한 뒤 사용자 요청 범위에 따라 병합한다. 테스트 성공만으로 요청하지 않은 운영 배포를 시작하지 않는다.
- 장기 유지 브랜치이므로 merge commit으로 병합하고 `develop`을 삭제하지 않는다. 병합 후 `main`을 `develop`에 fast-forward로 동기화한다.

## 구현 기준
- React/Vite의 기존 JavaScript/JSX 구조와 한국어 UI를 따른다.
- `src/main.jsx`의 CSS import 순서는 화면에 영향을 준다. 스타일 수정 시 기존 override를 확인한다.
- 운영 PHP API는 `server/api/`, 보조 Netlify 함수는 `netlify/functions/`에 있다. 실제 운영 경로를 먼저 확인한다.
- 배포의 release base path와 `BrowserRouter` basename 호환성을 유지한다.
- 비밀 값과 `.env*` 실값을 로그·문서·커밋에 남기지 않는다. `.env.example`에는 예시만 둔다.
- 사용자 변경을 덮어쓰지 않고 필요한 범위만 수정한다. 생성물 `dist/`, `node_modules/`는 편집하지 않는다.

## 작업과 완료
- 작은 수정은 바로 진행한다. 여러 영역에 걸친 작업은 [작업 계획 템플릿](docs/task-template.md)으로 목적·완료 조건·검증을 기록한다.
- 오류 수정은 가능하면 실패를 재현하는 회귀 테스트를 추가한다. 외부 서비스 없이 확인할 수 있는 로직부터 테스트한다.
- 코드 변경 후 `npm run verify`; PHP/Python 변경 후 `npm run check:backend`도 실행한다.
- UI 수정은 관련 경로와 모바일/데스크톱 화면을 확인한다. 도구나 환경이 없으면 미검증 사항을 명시한다.
- 완료 보고에는 변경 내용, 실행한 검증 결과, 남은 제한을 짧게 적는다. 동작이나 명령이 바뀌면 관련 문서도 갱신한다.
- 배포·운영 데이터 변경은 사용자 요청 범위에 포함될 때만 수행한다. `main` push는 기존 자동 배포를 촉발할 수 있다.
