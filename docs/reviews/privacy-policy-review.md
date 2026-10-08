# 이용자 안내 1차 검토안 · 2026-10-08

## 요청과 범위
회원가입을 받는 mir.yeop.net의 개인정보 처리 구조 및 고지 필요성을 확인하고, 공통 푸터에서 열리는 개인정보처리방침·이용약관·운영정책 초안을 별도 검토 릴리스에 만든다. 운영 활성화, 실제 회원가입 변경, 계정 삭제, DB 쓰기·스키마 변경은 하지 않는다.

개발 기준: develop f1602e789867687f88862588929b9abb8b8524e1. 작업 브랜치: feature/privacy-policy-review. main/develop를 수정하지 않는 1차 검토용 브랜치다.

## 확인한 사실
- AccountPage: 아이디·이메일·비밀번호·비밀번호 확인을 입력받아 Supabase Auth 가입. 이메일 인증·복구 경로 존재. 회원가입 부분에 약관·개인정보 안내 없음.
- member_profiles: user_id, username, email, created_at. 운영 RLS 활성화 및 자기 프로필 조회 정책 확인.
- Auth 스키마: 계정·인증·세션 정보. 최소 집계에서 sessions.ip 및 user_agent 실제 저장 확인; audit_log_entries.ip_address 비어 있음. IP 필드 존재만으로 실제 저장을 단정하지 않았음.
- 운영 Supabase DB 리전 ap-south-1(인도). DB 리전은 모든 처리·지원·메일 국가의 증거가 아님.
- 확인한 계정 UI: 비밀번호 변경·로그아웃. 직접 탈퇴 UI 및 대체 접수·삭제 절차 미확인. 함수명 검색만으로 모든 삭제 방법이 없다고 단정하지 않음.
- 회원별 이메일·아이디·IP 원문, 비밀번호 해시, 토큰을 조회하지 않음. DB 변경 없음.

## 판단
회원 식별에 사용되는 아이디와 이메일 및 연결 정보는 개인정보 보호법 제2조상 개인정보로 판단한다. 개인정보처리자에 해당하는 회원 사이트의 처리방침 공개는 제30조 및 시행령 제31조 대상이다. 법정 방침 공개와 수집 동의, 약관 계약 동의는 다르다. 필수 처리의 제15조제1항제4호 적용 및 제28조의8 국외 이전 근거를 실제 목적·필요성·고지 요건과 함께 결정해야 한다. 별도 동의가 항상 유일한 방법이라고 보지 않는다.

## 미확정: 정식 공개 차단 사항
실제 책임자·연락처 / 회원·로그·메일·백업의 보유기간 및 파기 / 탈퇴·권리행사 / 수탁 법인·메일·호스팅·재위탁·해외 처리 세부 / 아동 회원 정책 / 외부 콘텐츠·분석 및 서버 로그 최종 점검. 임의의 연락처·기간·시행일을 생성하지 않는다. v0.1 미시행으로 모든 문서에 표시한다.

## 구현
- /policies/review, /policies/privacy, /policies/terms, /policies/operation
- 공통 푸터 링크, 문서 목차, 모바일 표 내부 스크롤, 직접 URL/새로고침용 HTML 메타데이터
- 가입 안내 시안: 실제 입력란·제출·개인정보 저장 없음. 개인정보처리방침에 대한 포괄 동의 체크박스 없음.
- VITE_REVIEW_PREVIEW=true와 VITE_POLICY_PREVIEW=true를 모두 요구. 기존 read-only fetch, 인증 세션 비저장 동작 사용.
- 모든 검토 메타데이터 noindex. noindex는 접근통제가 아니므로 비밀·회원값 포함 금지.
- 새 브랜치 전용 stage-policy-preview.py: ACTIVATE=false 고정, 기존 두 라우팅 파일 fingerprint 비교, staged만 허용. 기존 배포 스크립트 변경 없음.

## 검증
정의된 자동 검증: Node 24 npm run verify, npm run check:backend, 신규 Node 테스트 3개. Playwright 데스크톱/모바일: 4개 정책 직접 접근·새로고침, 푸터 3개 링크, 키보드 링크, 가로 넘침, 가입 비활성, 인증 저장 비활성. 브라우저 외부 서비스 요청을 차단하여 해당 서비스 자체 동작은 범위 밖. 모든 비-GET/HEAD/OPTIONS 요청을 차단하고 시도가 있으면 실패한다. 로컬 검증 통과 후 별도 릴리스를 업로드하고 동일 live 검증 실행. 실행 결과는 Actions 아티팩트/로그 기준으로 보고하며 실행하지 않은 검사를 성공으로 간주하지 않는다.

## 근거
- https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=27
- https://www.law.go.kr/법령/개인정보보호법 (2, 15, 21, 22의2, 26, 28의8, 30, 35~38)
- https://www.law.go.kr/법령/개인정보보호법시행령 (31)
- https://www.law.go.kr/법령/약관의규제에관한법률
- https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885 (2026 지침 게시 확인; 첨부 PDF의 모든 내용을 검증했다는 뜻 아님)
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/functions/regional-invocation
