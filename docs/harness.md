# 개발 하네스

에이전트와 사람이 같은 지침과 명령으로 변경을 검증하는 기본 환경이다. 진입점은 루트 `AGENTS.md`다.

## 시작

Node 24와 npm을 사용한다. `.nvmrc`는 CI와 버전 관리자용 기준이며 자동으로 로컬 Node를 바꾸지는 않는다.

```sh
npm ci
npm run verify
npm run dev
```

기본 검증은 서비스 계정이나 `.env` 없이 실행할 수 있다. 실제 연동 개발 설정은 README를 따른다.

## 검증 명령

| 명령 | 확인 범위 |
| --- | --- |
| `npm run check` | JS/MJS 문법; 소스, 도구, 테스트, 보조 함수 |
| `npm test` | Node 내장 테스트 러너로 `tests/*.test.js` 실행 |
| `npm run build` | Vite의 JSX 변환, import 해석, 배포 번들 생성 |
| `npm run verify` | JS 문법 → 테스트 → 빌드, 실패 시 중단 |
| `npm run check:backend` | Python AST와 PHP 문법; Python 3와 PHP CLI 필요 |

`check`는 ESLint나 타입 검사가 아니다. 백엔드 검사는 배포 코드를 import/실행하지 않는다. PHP가 없으면 백엔드 검사는 실패하며, 생략을 성공으로 처리하지 않는다.

## 작업 루프

1. 관련 코드와 현재 상태를 읽고 기대 동작·완료 조건을 정한다.
2. 필요한 부분을 수정하고, 로직 변경에는 적절한 회귀 테스트를 추가한다.
3. 위 명령과 변경 영역에 필요한 수동 검증을 실행한다.
4. 실패를 수정하고 다시 검증한다. 검증하지 못한 항목은 이유와 함께 기록한다.
5. diff를 확인하고 관련 문서, 결과, 남은 문제를 정리한다.

UI 변경은 해당 경로를 직접 열어 데스크톱/모바일, 로딩·빈 상태·오류 상태를 확인한다. API 변경은 별도 테스트 환경에서 응답을 확인한다. 인증·DB 정책·Edge Functions·실제 업로드는 현재 기본 검증 범위에 포함되지 않는다.

## CI와 운영의 경계

`.github/workflows/verify.yml`은 PR, main push, 수동 실행에서 Windows/Linux 프런트엔드 검증과 Linux 백엔드 문법 검사를 수행한다. 운영 secret과 배포 권한은 사용하지 않는다.

기존 배포 워크플로는 독립적으로 실행된다. 이 CI 추가만으로 배포가 검증 결과를 기다리지는 않는다. 병합 전 통과를 강제하려면 GitHub 브랜치 규칙에서 `Frontend (ubuntu-latest)`, `Frontend (windows-latest)`, `Backend syntax`를 필수 검사로 지정해야 한다. 저장소 서버 설정은 이번 로컬 구성에 포함되지 않는다.

브라우저 E2E, SQL/Edge Functions 검사, 커버리지 기준은 아직 없다. 변경이 잦거나 장애가 발생하는 영역부터 확장한다.

## 지침 관리

`AGENTS.md`는 짧은 지도와 필수 규칙만 유지하고 상세 설명은 이 문서와 구조 문서로 연결한다. 참고: [OpenAI 공식 AGENTS.md 문서](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
