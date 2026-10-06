# 작업: 플랫폼별 노래 추가 검색 1차 검토

## 목적과 완료 조건
운영 노래책을 변경하지 않고 Apple Music / YouTube / Melon을 구분하는 노래 추가 화면을 제공한다. 실제 지원되는 가져오기와 연결되지 않은 검색을 구별하며, 가수 미확인 상태의 검토 저장을 지원한다.

## 조사와 결정
- Apple: 기존 iTunes Search/Lookup 공식 API와 한국어 이름 대조를 유지한다. MusicBrainz 결과를 Apple Music 결과로 잘못 표시하지 않도록 새 endpoint에서는 Apple만 조회한다.
- YouTube: 공식 Data API `search.list`는 키가 필요하다. GitHub Actions의 `YOUTUBE_API_KEY` 설정 여부를 확인했으며 현재 미설정이다. 키워드 검색 adapter는 환경변수 `SONGBOOK_YOUTUBE_API_KEY` 또는 `YOUTUBE_API_KEY` 설정 시 사용할 수 있도록 구현한다. 이번 공개 검토는 키 없이 동작하는 YouTube oEmbed 영상 주소 가져오기를 제공한다. 채널명을 가수로 추정하지 않는다. API HTML은 응답·렌더링하지 않는다.
- Melon: 한 번의 공개 검색 HTTP200 응답은 확인했다. 하지만 robots.txt의 일반 User-agent는 `/global-k-chart` 외 Disallow이며, 이용약관 제20조에는 사전 승낙 없는 정보 복제·유통 관련 제한이 있다. 공개 공식 검색 API나 사용허가는 확보하지 못했다. 자동 수집을 승인된 연동처럼 만들지 않고, 검색 사이트 열기 + 사용자 직접 입력만 제공한다. 테스트용 가짜 멜론 결과를 실서비스에 넣지 않는다.

## 근거
- https://developers.google.com/youtube/v3/docs/search/list
- https://developers.google.com/youtube/v3/getting-started
- https://developers.google.com/youtube/terms/developer-policies
- https://www.youtube.com/oembed (검토 워크플로에서 공개 영상 주소로 응답 확인)
- https://www.melon.com/robots.txt
- https://info.melon.com/terms/web/terms1_1.html
- 기술 점검 Actions: https://github.com/seirian/mir-cheongwoon-site/actions/runs/37348112738

## 구현 범위
기존 SongEditor에 선택적 platformSearch/allowUnknownArtist 경로를 추가한다. 기본 운영 경로는 기존 검색 및 가수 필수 검증을 유지한다. 새 검토 페이지는 별도 localStorage namespace를 쓰며 Supabase 저장이나 인증을 호출하지 않는다. 가수 공란 저장은 이 검토 저장소에서만 지원한다. 운영 도입 전 실제 DB 스키마와 자동 수집/검토 승인 경로의 공란 가수 처리는 별도 검증이 필요하다.

한 플랫폼 오류가 다른 결과를 지우지 않으며, 검색어 변경/닫기 시 진행 중 요청과 오래된 응답을 취소한다. 영상 링크는 allowlist로 제한하고 서버는 고정 공식 endpoint만 요청한다. GET 전용, 시간·크기 제한, 캐시와 요청 예산을 적용한다. 수집용 팬 사이트 식별자·비밀 값·음원·가사는 공개 번들에 추가하지 않는다.

## 브랜치와 배포
최신 develop 64f44a5c에서 feature/songbook-platform-search를 분기했다. preview 전용 workflow로 검증 후 stage-only 배포한다. main/develop 병합 및 운영 활성화는 하지 않는다. 기존 테스트/배치/관리자 권한/운영 데이터는 변경하지 않는다.

## 검증
순수 JS·PHP 회귀 검사, 실제 컴포넌트의 분리 결과/YouTube URL 가져오기/가수 공란 저장/새로고침/기존 곡 보호/부분 실패/모바일 검사. 공개 preview URL에서는 실제 Apple 검색과 YouTube oEmbed API 응답 및 외부 검색 미연결 표시를 확인한다. 결과와 링크는 PR에 기록한다.


## 보완: Melon 일시 비활성화 (2026-10-06)
사용자 요청으로 Melon은 삭제하지 않고 `MELON_PAUSED` 주석으로 보관한다. 플랫폼 이름·검색 링크·상태·직접 입력 폼·가져오기 분기·검토 소개/설명·서버의 provider 허용 목록과 응답·전용 스타일·기술 점검 요청을 모두 비활성화했다. 화면에는 전체/Apple Music/YouTube만 남는다. 기존 브라우저 검토곡은 지우지 않는다.

복원은 위 주석을 검색해 플랫폼 registry, URL helper/import, component state/JSX, import handler, server allowlist/response, CSS/소개·검토 노트, 테스트를 함께 갱신한다. 원래 멜론 기능도 외부 검색과 직접 입력뿐이며, 주석 해제만으로 자동 검색 API가 생기는 것은 아니다. 허용된 연동이 마련되기 전에는 audit probe도 실행하지 않는다.

비활성 provider=melon은 외부 통신 전에 HTTP400으로 거부한다. 회귀 검사에서는 Melon UI/링크/네트워크 요청 부재와 Apple/YouTube 가져오기·가수 공란·브라우저 저장을 확인한다. 키 안내는 `docs/reviews/songbook-youtube-api-key.md` 참조. 키를 Secrets에 등록하는 것과 실제 PHP 실행 환경에 주입하는 작업은 별개다. 이번에는 키 발급이나 서버 비밀 설정을 변경하지 않는다.
