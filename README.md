# 미르 × 청운밴드 홍보 사이트 초안

버튜버 미르와 청운밴드 소개, 연도별 공연 이력, 공연별 사진 갤러리, 관리자 전용 갤러리 업로드 기능을 포함한 React/Vite 기반 사이트입니다.

## 1. 기술 구성

- Frontend: React + Vite
- Routing: React Router
- Backend / DB / Auth / Image Storage: Supabase
- Hosting: Netlify 권장 (Vercel 등 Vite 배포가 가능한 서비스도 사용 가능)
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

## 5. Netlify 무료 배포

### GitHub 연동 방식

1. 이 폴더를 GitHub repository에 push합니다.
2. Netlify > Add new project > Import an existing project에서 저장소를 선택합니다.
3. Build command는 `npm run build`, Publish directory는 `dist`로 설정합니다.
4. Site configuration > Environment variables에 아래 두 값을 등록합니다.
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy를 실행합니다.

`netlify.toml`에 SPA redirect 설정이 포함되어 있으므로 `/mir`, `/gallery/...` 주소를 직접 새로고침해도 정상 동작합니다.

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
