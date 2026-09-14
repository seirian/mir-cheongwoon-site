# 미르 × 청운밴드 홍보 사이트

React + Vite + Supabase + Netlify 기반의 홍보 사이트 초안입니다.

## 주요 구성

- 미르 소개
- 청운밴드 소개 및 멤버 소개
- 연도별 공연 이력
- 공연별 갤러리
- Supabase Auth 기반 관리자 로그인
- 관리자 전용 갤러리 생성 / 이미지 업로드 / 삭제
- 미르 SOOP 방송 LIVE 상태 표시

## 로컬 실행

```bash
npm install
npm run dev
```

일반 Vite 개발 서버에서는 Netlify Function이 실행되지 않기 때문에 SOOP LIVE 상태 확인 기능은 `unknown` 상태로 남을 수 있습니다. 해당 기능까지 로컬에서 확인하려면 Netlify CLI 또는 Netlify의 로컬 개발 환경을 사용하세요.

## 환경 변수

`.env.example`을 참고해 다음 값을 설정합니다.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

실제 배포 시에는 `.env`를 Git에 올리지 말고 Netlify의 Environment variables에 등록합니다.

## Supabase

`supabase/schema.sql`을 Supabase SQL Editor에서 실행해 기본 테이블, Storage bucket, RLS 정책을 생성합니다.

관리자 계정의 UUID를 `public.admins.user_id`에 등록하면 관리자 권한으로 인식합니다.

## SOOP LIVE 상태

`netlify/functions/soop-live.mjs`가 미르 SOOP 채널(`alice427`)의 현재 방송 상태를 확인합니다.

- LIVE: 프로필 이미지에 빨간 테두리와 Glow가 표시되고 LIVE ON SOOP 배지에 전파 애니메이션이 실행됩니다.
- OFFLINE: SOOP OFFLINE으로 표시됩니다.
- UNKNOWN: SOOP 조회 장애나 응답 형식 변경 시 SOOP으로 표시하며 오프라인으로 단정하지 않습니다.
- 프런트에서는 60초마다 상태를 다시 확인합니다.
- Netlify CDN에는 30초 동안 캐시해 SOOP 및 Function 호출 횟수를 줄입니다.

SOOP의 공개 개발자용 Live Status API를 사용하는 구조가 아니라 현재 웹 플레이어에서 사용하는 공개 응답을 확인하는 방식이므로, SOOP 측 구조 변경 시 `soop-live.mjs` 수정이 필요할 수 있습니다.

## Netlify

`netlify.toml`에 Vite 빌드, `dist` 배포 폴더, Netlify Functions 디렉터리, SPA redirect 설정이 포함되어 있습니다.

GitHub 저장소를 Netlify에 연결하면 `main` 브랜치 변경 시 자동으로 빌드/배포할 수 있습니다.
