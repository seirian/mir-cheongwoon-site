# 개인정보·계정 탈퇴 2차 검토 (2026-10-08)

## 범위
이전 검토 브랜치에서 `feature/privacy-account-review`를 분리했다. 운영 화면 활성화, main/develop 변경, 실회원 삭제, 운영 Edge Function 배포 및 DB 스키마 변경은 하지 않는다. 푸터·정책 문안과 실제 구현 코드를 제공하되 공개 검토 화면은 합성 계정으로만 동작한다.

## 요청 반영
운영자 옆군, 이메일 sengyb@naver.com을 정책 3종과 푸터에 반영했다. 회원 계정정보는 회원 탈퇴 시까지 보유하고, 탈퇴 완료 즉시 운영 DB에서 삭제하는 문안이다. 다른 정보까지 전부 즉시 파기한다는 사실과 다른 보장은 하지 않는다. 로그·메일·백업 보존기간은 아직 확인되지 않았다.

14세 미만을 무조건 금지하는 조건이나 나이·생년월일 입력란은 추가하지 않았다. 개인정보 보호법 제22조의2의 보호자 동의 요건은 콘텐츠 청불과 별개이며, 동의가 필요한 처리에 적용된다. 제15조제1항제4호의 계약상 필요성을 목적별로 검토하고, 아동의 정보에 동의가 필요한 경우 보호자 동의 확인을 실제로 마련해야 한다. 불필요한 처리를 필수 계약으로 명명해 동의를 우회하지 않는다. 이 검토에서 보호자 확인 시스템을 구축했다고 주장하지 않는다.

## 서비스 조사
- Supabase 운영 프로젝트: DB 리전 ap-south-1 확인. 회원정보 원문·비밀번호 해시·토큰 조회 없이 스키마와 접근정책만 읽었다.
- 공식 DPA(본문과 Annex)는 Supabase Pte. Ltd.를 표시한다. 공식 최신 문의 페이지의 개인정보 메일은 privacy@supabase.com. 실제 프로젝트 계약이 다른 법인을 특정하는지는 별도 확인한다.
- DPA는 주된 저장국과 지원·재위탁 처리 장소를 구분한다. 인도 DB라는 사실만으로 모든 처리·백업·메일 국가를 인도라고 단정하지 않는다.
- NAVER 메일은 사용자가 지정한 문의 창구다. Supabase Auth의 자동 인증메일 사업자가 NAVER라고 추정하지 않는다.
- 운영 웹호스팅 계약상 법인과 실제 SMTP(기본/별도 업체) 설정은 현재 도구에서 확인되지 않았다.
- Shake Studio와 Seonbae 사례는 위탁·국외 이전 표의 형식만 참고했다. 타 서비스의 국가·업체·보존기간·연령제한을 복사하지 않았다.

## 구현
### 서버
`supabase/functions/member-withdrawal/index.ts`와 `handler.js`.
- POST JSON 4KB 제한; 원래 origin 확인, Bearer 필요. 비밀번호와 DELETE_MY_ACCOUNT 확인 외의 이메일·user_id 등 표적 입력을 거부한다.
- 인증 서버 getUser로 계정을 결정하고 현재 비밀번호를 별도 메모리 전용 Auth 클라이언트에서 재확인한다. 비밀번호를 로그·프로필에 저장하지 않는다.
- 원래 사용자, 비밀번호 확인 사용자, 재확인 사용자 일치를 검사한다. 익명·추가 인증 계정은 거부한다. 관리자 계정은 공용 자료·권한 인계로 안내한다.
- 글로벌 세션 갱신권한 정리 후 admin.deleteUser(id, false)로 hard delete. auth 계정 부재와 member_profiles 부재를 확인해야 ACCOUNT_DELETED를 반환한다.
- 삭제 요청은 단 한 번. 전송 유실·서버 오류·후속 검증 실패는 deletion_unconfirmed이며 자동 재시도나 거짓 성공을 반환하지 않는다.
- service_role은 서버 환경값만 사용한다. 이 검토에서는 함수 자체를 운영 배포하지 않는다. 정식 배포 시 JWT 검증을 켜야 한다.

### 계정 UI
기존 AccountPage의 내 정보에 회원 탈퇴 진입점, mode=withdraw, 현재 비밀번호·복구불가 확인·취소를 추가했다. 입력은 취소/실패 후 지우고 중복 제출을 차단한다. 삭제 성공 응답 후 현재 계정에 해당하는 인증 저장정보만 정리하고, 다른 계정으로 전환된 경우 그 계정의 저장정보를 지우지 않는다. 노래책 즐겨찾기와 다른 로컬 저장정보는 무차별 삭제하지 않는다.

검토 경로 `/account/withdraw-review`는 네트워크 요청·저장 없는 별도 예시다. 실제 비밀번호 입력 금지 문구와 예시 비밀번호를 표시한다. 실제 AccountPage와 같은 폼을 사용하되 함수 호출은 주입한 합성 처리기로 대체한다.

## 운영 스키마 확인
- member_profiles, admins, auth.sessions, identities 등: auth.users 참조의 ON DELETE CASCADE.
- schedule_events.created_by, videos.created_by, schedule_sync_exclusions.excluded_by, songbook_deletions.deleted_by: ON DELETE SET NULL.
- songbook_timeline_candidates.reviewed_by: 기본 NO ACTION. 관리자·공용 자료 관계를 무단으로 끊지 않는다.
- Supabase Storage 소유 객체가 있으면 사용자 삭제가 실패할 수 있다. 공유 갤러리 파일을 지워 문제를 숨기지 않는다.
- 현재 회원 프로필은 본인 SELECT 전용이며 일반 회원 쓰기 정책이 없다. 공용 자료의 쓰기는 admins 또는 별도 editor 회원표에 의존한다. 삭제 후 해당 행이 없으면 구 JWT로 그 정책을 통과할 수 없다.
- 발급한 JWT 자체는 만료 전까지 암호학적으로 유효할 수 있다. 글로벌 signout이 모든 access token을 즉시 무효화한다고 주장하지 않는다. 미래의 일반회원 쓰기/RPC는 별도 세션 존재 확인이 필요하다.

## 검증
로컬 Node 24에서 신규 39개 회귀 테스트, 전체 npm run verify와 Python/PHP 문법 검사 통과. 로컬 시스템 Chromium은 환경의 URL 정책으로 localhost가 차단되어 UI 판정을 내리지 않았다. GitHub Actions의 독립된 Chromium에서 실제 AccountPage(전부 합성 인증/삭제 응답), 검토 화면, 배포 후 공개 검토 화면을 검사하도록 구성했다. 결과는 해당 run artifacts를 기준으로 보고한다.

실회원 비밀번호 또는 실회원 삭제는 테스트에 사용하지 않았다. 합성 UI/API 테스트는 실 DB에서 hard delete가 완료됐다는 증거가 아니다. 운영 반영 전 별도 테스트 전용 계정으로 Auth·프로필·세션 삭제, 재로그인 불가, 비상복구·남은 로그 파기 정책을 검증해야 한다.

## 정식 시행에 남은 것
호스팅 및 SMTP 실제 업체·국가, 재위탁 국가, 보안·감사 로그/메일/백업의 기간, 책임자 표시 법정요건, 처리의 법적 근거와 필요한 아동 보호자 절차, 서버 배포·실계정 연동 검증. 이 검토안과 푸터의 v0.2·미시행 표시는 이를 숨기지 않는다.

## 공식 근거
- 개인정보 보호법 제15조, 제21조, 제22조의2, 제26조, 제28조의8, 제30조, 제35~38조, 제58조: https://www.law.go.kr/법령/개인정보보호법
- 국외 이전 조문: https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029331979
- DPA: https://supabase.com/legal/customer-resources/data-processing-addendum
- 연락처: https://supabase.com/contact-us
- 회원 삭제: https://supabase.com/docs/guides/auth/managing-user-data
- 감사로그: https://supabase.com/docs/guides/auth/audit-logs
- 백업: https://supabase.com/docs/guides/platform/backups
- 참고 양식(법적 근거가 아님): https://shake.st/privacy/ , https://www.seonbaetutor.com/privacy
