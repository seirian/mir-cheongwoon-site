# 노래책 운영 배포 확인 사항

## 운영 경로 보완
4차 검토 버전을 운영에 올리는 과정에서 검토 전용 경로와 운영 경로의 차이를 확인했다.

- 운영 배포 목록에 음악 검색 PHP 세 파일을 명시한다: songbook-search.php, _songbook_localization.php, _songbook_korean_titles.php.
- 업로드된 릴리스의 노래책 정적 HTML과 검색 API를 활성화 전에 확인한다. q=x 요청은 외부 음원 DB에 접속하지 않고 HTTP400 JSON query 오류를 반환해야 한다.
- 운영 .htaccess의 허용된 페이지 경로에 songbook을 포함한다. /songbook 및 /songbook/ 모두 현재 릴리스 HTML로 연결한다.
- 운영 /songbook/review 및 /songbook/review/는 /songbook으로 이동한다. 검토 배포의 릴리스 하위 검토실 주소는 유지한다.
- 활성화 직후 기존 canonical smoke 검사에 /songbook과 /songbook/를 포함한다. 경로 또는 현재 릴리스 마커가 불일치하면 기존 라우팅으로 rollback한다.
- 별도 읽기 전용 실제 브라우저 검사에서 아이디 로그인 폼, 운영 테이블 조회, 검토 모드 차단, 한국어 음악 검색을 확인한다.

## 회귀 검사
기존 118개 Node 검사에 API 배포 목록 및 사전 검사 순서, 노래책 직접 접속 경로 회귀 검사 2개를 추가했다. 총120개 테스트와 빌드/Python/PHP 문법 검사를 실행한다. 파일 존재 여부만으로 배포 성공으로 판단하지 않고 HTTP 응답과 실제 브라우저 결과를 함께 기록한다.

PR #78은 위 배포 경로만 보완한다. 아이디 로그인 및 사이트 세션 공유는 #77의 구현을 유지하며, 새로운 계정 권한이나 노래 데이터는 추가하지 않는다. 운영 배포와 실제 검증 결과는 PR 댓글에 남긴다.
