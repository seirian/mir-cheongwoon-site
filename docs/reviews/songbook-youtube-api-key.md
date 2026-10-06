# YouTube 키워드 검색 API 키 준비

## 필요한 인증 정보
Google Cloud 프로젝트에서 **YouTube Data API v3**를 사용 설정한 뒤 발급한 **일반 API 키(standard API key)** 하나를 사용한다. 공개 영상 키워드 검색 `search.list`용이므로 OAuth client ID/secret, 서비스 계정 JSON, YouTube 채널 비밀번호·쿠키가 필요하지 않다. 서비스 계정에 키를 연결하지 않는다. 채널명은 가수명으로 저장하지 않는다.

## 발급과 보관
1. Google Cloud Console에서 프로젝트를 새로 만들거나 선택한다. 사이트 전용 키를 분리해 관리하는 편이 좋다.
2. `API 및 서비스 → 라이브러리`에서 `YouTube Data API v3`를 사용 설정한다.
3. `API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키`로 일반 키를 만든다. 서비스 계정 인증 옵션은 사용하지 않는다.
4. `API 제한사항 → 키 제한`에서 `YouTube Data API v3`만 허용한다. 실제 사용 전에 PHP 서버의 외부 송신 IP를 확인해 애플리케이션 IP 제한도 적용한다. 브라우저 HTTP 리퍼러 제한이나 사용자의 PC IP는 이 서버 호출에 맞지 않는다. 호스팅 도메인의 수신 IP가 송신 IP와 같다고 추정하지 않는다.
5. 저장소 `seirian/mir-cheongwoon-site`의 `Settings → Secrets and variables → Actions → New repository secret`에 이름 `SONGBOOK_YOUTUBE_API_KEY`, 값은 발급한 API 키 문자열로 저장한다. Variables가 아닌 Secrets이다. 키를 채팅·커밋·문서·스크린샷·공개 번들에 넣지 않는다. 서비스명, 프로젝트 ID, 비밀 값이 가려진 설정 상태만 전달하면 된다.

## 이 코드와 연결되는 위치
서버 `server/api/songbook-platform-search.php`는 `SONGBOOK_YOUTUBE_API_KEY`를 우선 읽고, 기존 이름 `YOUTUBE_API_KEY`도 호환한다. 이 값은 PHP 런타임의 서버 환경변수이며 `VITE_*` 프런트엔드 변수가 아니다. 호출은 PHP 서버 → Google API 순서로 발생한다.

**GitHub Secrets 등록만으로 PHP 호스팅 서버에 키가 자동 설정되는 것은 아니다.** 현재 검토 배포 워크플로는 이 비밀 값을 호스팅 런타임에 전달하지 않는다. 등록 후 서버의 비공개 설정 주입·송신 IP 제한·실제 `search.list` 응답을 확인하는 연결 작업이 별도로 필요하다. 이번 변경은 키를 생성하거나 런타임에 설치하지 않는다. 검토 페이지는 연결 전 안내와 기존 공개 영상 URL/oEmbed 가져오기를 유지한다.

현재 서버에는 검색 결과 캐시와 uncached 키워드 조회의 24시간 80회 예산이 있다. 이는 앱 자체의 보호 설정이며 Google 프로젝트의 실제 할당량과 별개다. Google Console의 할당량 화면에서 최신 검색 한도를 확인하고 다른 앱이 같은 프로젝트를 쓰면 소비량을 함께 관리한다. 할당량 우회를 위한 추가 프로젝트/키 생성은 하지 않는다.

## 공식 확인 근거 (2026-10-06)
- https://developers.google.com/youtube/v3/getting-started
- https://developers.google.com/youtube/v3/quickstart/python (API key for public information versus OAuth for user authorization)
- https://developers.google.com/youtube/v3/docs/search/list
- https://docs.cloud.google.com/docs/authentication/api-keys
- https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
