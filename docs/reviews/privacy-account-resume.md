# 개인정보·탈퇴 검토 재개 기록 · 2026-10-08

## 확인한 중단 지점
feature/privacy-account-review의 9dbbe7035fc92fd60225557cf3c4a2504472fd0a에서 정책 2차안과 비밀번호 재확인 탈퇴 구현을 복구했다. GitHub Actions run 37724719362의 모든 단계가 success임을 확인했다. artifact 11526877969를 내려받아 보고서와 화면을 읽었다.

## 확인 결과
- 운영자 옆군과 sengyb@naver.com, 회원 탈퇴 시까지 보유 및 탈퇴 완료 즉시 운영 DB의 계정정보 삭제 문구가 2차안에 있다.
- 비밀번호 오류·취소·응답 유실·관리자 인계 경로를 포함한 구현이 있다. 서버에서 본인 계정을 확인하고 재인증한 뒤 hard delete와 프로필 부재를 확인한다.
- 기존 5개 브라우저 보고서 총 58개 검사 통과, JS 예외·예기치 않은 쓰기 요청 0. 공개 검토 릴리스 r20261008035250_9dbbe703는 staged이며 production_routing_unchanged=true다.
- Supabase 프로젝트를 다시 읽어 ap-south-1을 확인했다. 운영 Edge 목록에 member-withdrawal이 없음을 확인했다. 실제 회원 삭제·DB 변경·새 함수 운영 배포를 하지 않았다.
- 이미지 육안 확인에서 탈퇴 검토 화면의 제목·설명이 어두운 배경에 어두운 글씨로 렌더링되는 문제를 발견했다. 검토 화면에 한정해 명도 대비를 수정하고 회귀 테스트 2개를 추가한다. 이 수정의 새 CI 결과는 해당 실행 및 아티팩트에서 확인해야 하며 이 기록이 통과를 선포하지 않는다.

## 법령과 운영 사실 구분
현행 개인정보 보호법은 2026-09-11 시행본(법률 제21445호)이다. 제22조의2는 콘텐츠 청불 여부와 별개이며, 아동 정보 처리에 법상 동의가 필요한 경우 법정대리인 동의 및 확인을 요구한다. 법이 일률적인 14세 미만 가입금지나 모든 회원의 생년월일 수집을 요구한다고 설명하지 않는다. 법적 근거 검토 없이 계약 이행으로 이름만 바꾸어 동의를 우회하지 않는다. 초안의 일괄 연령차단 미추가 방향을 유지한다.

Supabase DPA의 법인 표기와 인도 DB 저장국을 구분했다. NAVER 문의 메일을 자동 인증메일 발송업체로 혼동하지 않는다. 계약상 호스팅 업체, 실제 SMTP, 감사로그·백업 기간은 도구로 확인된 설정이 없으므로 임의로 채우지 않는다. 보유기간을 문구로 정하는 것만으로 과거 백업까지 즉시 제거되는 것은 아니다.

## 범위와 남은 단계
이번 작업은 계속 별도 검토 배포다. 실제 운영 탈퇴를 사용할 수 있다고 안내하지 않는다. 정식 반영 시 서버 배포, 테스트 전용 계정의 실제 Auth·프로필·세션 삭제와 재로그인 불가 확인, 필요한 잔여 기록 파기 정책 및 가입 고지를 함께 검증한다. main/develop 및 운영 회원정보는 변경하지 않는다.

## 재확인한 공식 근거
- https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=02&joNo=0022&lsiSeq=283839&urlMode=lsScJoRltInfoR
- https://www.law.go.kr/LSW/lsInfoR.do?ancYnChk=0&chrClsCd=010202&efYd=20260911&lsiSeq=283839&urlMode=lsInfoP
- https://supabase.com/legal/customer-resources/data-processing-addendum
- https://supabase.com/contact-us
- https://supabase.com/docs/guides/auth/managing-user-data
- https://supabase.com/docs/guides/auth/audit-logs
- https://supabase.com/docs/guides/platform/backups
