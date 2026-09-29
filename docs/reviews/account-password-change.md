# 내 정보 — 비밀번호 변경

## 요구사항과 화면
로그인한 `/account` 내 정보에서 비밀번호 변경을 선택하면 `/account?mode=password`의 별도 화면을 연다. 기존 비밀번호·새 비밀번호·새 비밀번호 다시 입력 세 칸만 제공한다. 기존 사이트와 같은 새 비밀번호 길이 8~128자를 적용하며, 확인 불일치·기존 비밀번호 오류·동일한 비밀번호·세션 만료·서비스 오류를 구분한다. 비밀번호의 공백을 임의 제거하지 않는다. 처리 중 중복 제출을 막고 성공 시 입력을 지워 로그인 화면으로 돌아간다.

기존 URL의 query mode를 사용하므로 Apache 경로·정적 메타데이터·공유 이미지·PC/모바일 홈 CSS는 바꾸지 않는다. 계정 페이지의 noindex를 유지한다. 익명 접근은 로그인만 표시하며 로그인 후 변경 화면으로 이어진다. 기존 이메일 복구 경로는 유지한다.

## 서버와 보안
새 독립 Edge Function `member-password`를 배포한다. 기존 `member-auth` 로그인 함수는 바꾸지 않는다. `SUPABASE_URL`과 공개 `SUPABASE_ANON_KEY`만 사용한다. 서비스 역할 키, auth.admin, SQL 비밀번호 비교, DB/RLS/Storage 변경을 사용하지 않는다.

함수 자체가 매번 Authorization bearer를 Supabase Auth `/user`에서 검증한다. 검증된 사용자의 이메일로 기존 비밀번호를 재인증하고 동일한 사용자 ID인지 확인한다. 그 사용자의 임시 인증 토큰으로만 비밀번호를 변경한다. 대상 ID/이메일을 요청으로 받지 않는다. 새 비밀번호와 확인값은 서버에서도 재검증한다. 서버가 요구할 수 있는 current_password도 PUT에 포함한다. MFA가 활성화된 계정은 별도 추가 인증 없이는 처리하지 않는다.

Gateway `verify_jwt=false`는 새/기존 JWT 서명 호환을 위한 설정이다. 인증을 생략하지 않으며 함수 내부의 실제 Auth 사용자 검증이 필수다. 세 필드 검사를 우회한 직접 함수 호출도 기존 비밀번호 검증과 일치 검사를 통과해야 한다. 프로젝트 전체의 기존 Supabase Auth 비밀번호 업데이트/복구 정책을 변경하는 작업은 아니다.

요청은 HTTPS·허용 Origin·JSON 및 4096바이트 제한을 적용한다. Supabase Auth rate limit과 추가 bounded per-isolate guard(사용자당 10분 5회, 동시 요청 차단)를 사용한다. isolate guard는 분산 전역 제한이라고 주장하지 않는다. 비밀번호/토큰을 응답·URL·로그·DB·브라우저 저장소에 기록하지 않는다. 성공 후 세션 종료를 요청하고 임시 세션을 정리한다. 로그아웃의 일시적 실패로 이미 완료한 비밀번호 변경을 실패로 표시하지 않는다. 응답 유실 시 자동 재시도 없이 결과 확인 안내를 표시한다.

## 배포와 검증
21개 Node 테스트로 입력 검증/서버 인증/다른 계정 차단/실패 시 미변경/중복 제출/시간 초과/정리 실패를 검증한다. 가짜 인증 응답을 사용하며 실제 회원 계정을 생성하거나 비밀번호를 변경하지 않는다. CI 브라우저에서는 데스크톱·모바일, 내 정보 진입·취소·새로고침·오류·성공·로그아웃·비밀번호 비저장·익명 접근·기존 복구 보호를 검사한다.
배포 순서는 CI 통과 → 독립 Edge Function 배포와 익명/유효하지 않은 토큰 요청 거절 확인 → develop → main PR 필수 검사 및 병합 → 운영 배포 확인이다. 실제 회원 비밀번호의 성공 변경은 사용자에게 맡기며 테스트를 위해 임의 변경하지 않는다.

참고: https://supabase.com/docs/guides/functions/auth-legacy-jwt , https://supabase.com/docs/reference/javascript/auth-signinwithpassword , https://supabase.com/docs/guides/auth/password-security
