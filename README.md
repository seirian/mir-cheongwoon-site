# 미르 × 청운밴드 홍보 사이트

버튜버 미르와 청운밴드 소개, 연도별 공연 이력, 공연별 사진 갤러리, 관리자 전용 갤러리 업로드 기능을 포함한 React/Vite 기반 사이트입니다.

## 개발 하네스

Node 24에서 `npm ci` 후 `npm run verify`로 문법 검사·테스트·빌드를 실행합니다.
에이전트 지침은 [AGENTS.md](AGENTS.md), 구조는 [docs/architecture.md](docs/architecture.md), 검증 범위와 CI는 [docs/harness.md](docs/harness.md)를 참고하세요.

## 운영 기준

- 운영 주소: `https://mir.yeop.net` (배포 워크플로 기준)
- **GitHub `main` 브랜치가 운영 소스의 단일 기준(Source of Truth)** 입니다.
- 운영 배포는 `.github/workflows/deploy-yeop.yml`의 GitHub Actions가 수행합니다.
- 프런트엔드 소스뿐 아니라 운영 PHP API도 `server/` 아래에 버전 관리합니다.
- 배포 시 새 릴리스를 `/_yeop_releases/<release-id>/`에 스테이징하고 검증한 뒤 `.htaccess`를 원자적으로 전환합니다.
- 실패 시 기존 루트 라우팅을 복원할 수 있도록 배포 전 백업과 배포 보고서를 GitHub Actions artifact로 보관합니다.
- **YEOP-PC의 로컬 이관 폴더는 운영 배포의 필수 요소가 아닙니다.** 로컬 개발/진단 용도로만 사용할 수 있습니다.
- `.env`, `.env.local`, 계정 비밀번호 및 비공개 키는 Git에 커밋하지 않습니다.

## 1. 기술 구성

- Frontend: React + Vite
- Routing: React Router
- Backend / DB / Auth / Image Storage: Supabase
- Hosting: `yeop.net` Apache/PHP 호스팅 + GitHub Actions 자동 배포
- 관리자 보안: Supabase Auth + PostgreSQL Row Level Security(RLS)

브라우저에 들어가는 Supabase Anon Key는 공개되어도 되는 키입니다. 실제 쓰기 권한은 SQL의 RLS 정책이 관리자 여부를 검사하므로, 프런트엔드에서 버튼만 숨기는 방식보다 안전합니다. Service Role Key는 절대 프런트엔드 환경변수에 넣지 마세요.

## 2. 포함 메뉴

- `/` 메인 홍보 페이지
- `/mir` 미르 소개 1페이지
- `/band` 청운밴드 소개 + 밴드 멤버 카드
- `/history` 연도별 공연 이력 타임라인
- `/gallery` 공연/콘서트 단위 갤러리 목록
- `/gallery/:id` 공연별 사진 보기
- `/admin` 관리자 로그인 / 갤러리 생성 / 사진 업로드 / 삭제

## 3. 로컬 실행

```bash
npm install
cp .env.example .env
npm run dev
```

Windows에서는 `.env.example`을 복사해서 `.env` 파일을 직접 만들어도 됩니다.

## 4. Supabase 설정

1. https://supabase.com 에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/schema.sql` 내용을 전체 실행합니다.
3. Project Settings > API에서 Project URL과 anon/public key를 확인합니다.
4. `.env`에 아래처럼 입력합니다.

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

5. Supabase Dashboard > Authentication > Users에서 관리자용 이메일 계정을 만듭니다.
6. 생성된 User UUID를 복사합니다.
7. SQL Editor에서 아래 한 줄을 실행합니다.

```sql
insert into public.admins(user_id) values ('복사한-USER-UUID');
```

이후 `/admin`에서 해당 이메일/비밀번호로 로그인할 수 있습니다.

## 5. 운영 배포 (GitHub Actions)

`main`에 운영 관련 파일이 반영되면 `Deploy yeop.net` 워크플로가 자동 실행됩니다. GitHub Actions 화면에서 `workflow_dispatch`로 수동 실행할 수도 있습니다.

자동 배포 대상에는 `src/**`, `public/**`, `server/**`, 배포 스크립트, Vite/패키지 설정 및 배포 워크플로 자체가 포함됩니다.

배포 과정은 다음 순서로 동작합니다.

1. 새 GitHub Actions runner에서 저장소를 checkout합니다.
2. 검증된 public Supabase 설정을 준비합니다. 저장소 Secret에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`가 함께 있으면 이를 읽기 전용 검증 후 사용하고, 없으면 현재 운영 번들의 public 설정을 읽기 전용으로 복구합니다.
3. `npm ci` 후 release 전용 base path로 Vite 빌드를 수행합니다.
4. `server/`에 버전 관리된 PHP API와 release `.htaccess`를 함께 새 릴리스 경로에 업로드하고 업로드 파일을 다시 읽어 검증합니다.
5. 프리뷰 라우트, PHP health/cache, JS/CSS 해시 및 주요 API를 검증합니다.
6. 기존 `robots.txt`, `favicon.ico`, `standard_index.html` 등 보존 대상이 바뀌지 않았는지 확인합니다.
7. 루트 `.htaccess`의 활성 release ID만 원자적으로 전환합니다.
8. 운영 라우트 검증에 실패하면 이전 라우팅으로 롤백합니다.

필수 GitHub Actions Secret은 `YEOP_SFTP_PASSWORD`입니다. Secret 값은 저장소 파일이나 Actions 로그에 기록하지 않습니다.

`netlify.toml`과 `netlify/functions/`는 레거시/보조 호환성을 위해 남겨둘 수 있지만 **현재 `yeop.net` 운영 배포 경로는 Netlify가 아닙니다.**

## 6. 실제 콘텐츠로 교체할 위치

`src/data/siteData.js`

- `mirProfile`: 미르 소개 문구
- `bandInfo`: 청운밴드 전체 소개
- `bandMembers`: 멤버명, 포지션, 코멘트, 이미지 주소
- `performanceHistory`: 연도별 공연 이력

미르/청운밴드 소개 사진은 현재 저작권 문제를 피하기 위해 플레이스홀더로 되어 있습니다. 공식적으로 사용 권한이 있는 이미지 또는 직접 촬영/제공받은 이미지를 연결하세요.

## 7. 갤러리 관리자 기능

관리자가 `/admin`에 로그인하면:

- 공연/콘서트별 새 갤러리 생성
- 갤러리별 다중 이미지 업로드
- 이미지 개별 삭제
- 갤러리 전체 삭제

방문자는 로그인 없이 갤러리와 사진을 조회할 수 있지만, 데이터 변경 권한은 없습니다.

## 8. 무료 플랜 사용 시 참고

사진은 웹에 올리기 전에 WEBP 변환 또는 1600~2000px 정도로 리사이즈하는 것을 권장합니다. 원본 카메라 사진을 그대로 수십/수백 장 올리면 무료 Storage/트래픽 한도 소진이 빨라질 수 있습니다.

Supabase 무료 프로젝트는 장기간 요청이 없으면 일시 중지될 수 있으므로 실제 홍보용으로 지속 운영할 경우 사용 패턴을 확인하세요.

## 9. 다음 개발 후보

- 관리자에서 미르/청운밴드 소개 문구도 편집하는 CMS 기능
- 공연 이력 역시 관리자 화면에서 등록/수정
- 갤러리 대표 이미지 선택
- 사진 드래그 정렬 / 캡션 수정
- YouTube/SOOP 공연 영상 링크
- SNS 공유용 OG 이미지 및 SEO 메타 태그
- 실제 로고 및 공식 컬러 적용

## 10. SOOP LIVE 상태 표시

운영 `/mir` 페이지는 현재 활성 release의 `api/soop-live.php`를 통해 미르 SOOP 채널(`alice427`)의 방송 상태를 확인합니다. 해당 PHP 소스는 `server/api/`에 버전 관리됩니다.

- LIVE: 프로필 이미지 테두리와 Glow가 빨간색으로 변경되고 `LIVE ON SOOP` 배지에 전파 애니메이션이 표시됩니다.
- OFFLINE: `SOOP OFFLINE`으로 표시됩니다.
- UNKNOWN: SOOP 조회 장애나 응답 형식 변경 시 `SOOP`으로 표시하며 오프라인으로 단정하지 않습니다.
- LIVE 배지를 클릭하면 미르 SOOP 방송 페이지를 새 창으로 엽니다.
- 프런트에서는 60초마다 상태를 다시 확인합니다.
- 서버 측 bounded cache를 사용해 외부 조회 횟수를 제한합니다.

로컬 `npm run dev`만으로는 PHP API가 실행되지 않으므로 LIVE API까지 로컬 확인하려면 별도 PHP 테스트 환경이 필요합니다.

현재 구현은 SOOP의 공식 공개 개발자용 Live Status API가 아니라 공개 웹 플레이어 응답을 확인하는 방식이므로, SOOP 측 구조가 변경되면 `server/api/_core.php` 및 관련 endpoint 수정이 필요할 수 있습니다.
