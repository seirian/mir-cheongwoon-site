import { performances, SITE_ORIGIN } from './promotionData.js';

const pages = {
  '/': ['미르 × 청운밴드 — 라이브·공연 팬 아카이브', '버튜버 미르의 목소리와 청운밴드의 연주. 추천 영상, 공연 기록, 다가오는 일정과 공식 채널을 만나보세요.'],
  '/mir': ['미르 소개 — 미르 × 청운밴드', '청룡 버튜버 미르의 방송·음악 활동, 프로필과 공식 채널을 소개합니다.'],
  '/band': ['청운밴드 소개와 멤버 — 미르 × 청운밴드', '미르와 함께 여름을 노래하는 청운밴드. 멤버와 악기, 함께한 공연 기록을 만나보세요.'],
  '/history': ['미르·청운밴드 공연 기록', '온라인에서 오프라인까지, 미르와 청운밴드의 공연 이야기와 사진 기록을 연도별로 확인하세요.'],
  '/songbook': ['미르의 노래책 — 미르 × 청운밴드', '미르의 노래를 카테고리와 별점으로 찾고, 연결 영상과 숙련도를 확인하세요.'],
  '/songbook/review': ['노래책 4차 검토실 — 미르 × 청운밴드', '다중 카테고리, 별점 필터, 영상 바로가기와 편집 기능을 검토합니다.'],
  '/schedule': ['미르 방송·공연 일정 — 미르 × 청운밴드', '다가오는 미르의 방송·공연 일정을 한국 시간 기준으로 확인하고 캘린더에 저장하세요.'],
  '/gallery': ['미르 영상·쇼츠·사진 — 미르 × 청운밴드', '처음 보는 분을 위한 추천 영상과 최신 공식 영상, 커버·쇼츠·공연 사진을 만나보세요.'],
  '/account': ['계정 — 미르 × 청운밴드', '미르 × 청운밴드 팬 아카이브 계정'],
  '/account/withdraw-review': ['회원 탈퇴 흐름 검토 — 미르 × 청운밴드', '3차 검토안: 실제 계정을 변경하지 않는 비밀번호 재확인·탈퇴 시안'],
  '/admin': ['관리자 — 미르 × 청운밴드', '미르 × 청운밴드 팬 아카이브 관리'],
  '/review': ['개선안 검토실 — 미르 × 청운밴드', '운영 사이트와 분리된 홍보 페이지 개선안 미리보기'],
  '/policies/review': ['이용자 안내 3차 검토실 — 미르 × 청운밴드', '계정정보 처리 근거·최소 수집·이메일 용도를 명확히 한 미시행 3차 검토안'],
  '/policies/privacy': ['개인정보처리방침 3차 검토안 — 미르 × 청운밴드', '필수 계정정보 처리 근거, 보유·탈퇴, 위탁·국외 이전 안내'],
  '/policies/terms': ['이용약관 3차 검토안 — 미르 × 청운밴드', '추가 연령 확인 없이 계정을 이용하는 조건과 탈퇴에 관한 미시행 초안'],
  '/policies/operation': ['운영정책·비공식 안내 3차 검토안 — 미르 × 청운밴드', '옆군의 이메일 문의·출처·저작권·수정 요청 안내'],
};

export const metadataRoutes = [...Object.keys(pages), ...performances.map(event => `/history/${event.slug}`)];
export function getPageMetadata(pathname, { preview = false, assetBase = '/', origin = SITE_ORIGIN } = {}) {
  const path = ('/' + String(pathname || '/').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '')).replace(/\/{2,}/g, '/');
  const event = performances.find(item => `/history/${item.slug}` === path);
  const entry = event ? [`${event.shortTitle} · ${event.date} — 미르 공연 기록`, event.description] : (pages[path] || (path.startsWith('/gallery/') ? ['공연 사진 갤러리 — 미르 × 청운밴드', '미르와 청운밴드의 공연 사진과 추억을 만나보세요.'] : undefined));
  const base = assetBase.endsWith('/') ? assetBase : `${assetBase}/`;
  return {
    title: (preview ? '[미리보기] ' : '') + (entry?.[0] || '공연 기록을 찾을 수 없습니다 — 미르 × 청운밴드'),
    description: entry?.[1] || '미르 × 청운밴드의 공연 이력에서 기록을 찾아보세요.',
    canonical: `${origin}${path === '/' ? '/' : path}`,
    image: new URL(`${base}og/${event?.slug === 'blued-2025' ? 'blued' : 'home'}.png`, origin).href,
    imageAlt: event?.slug === 'blued-2025' ? '미르 × 청운밴드 BLUED 공연 기록' : '미르 캐릭터와 미르 × 청운밴드 팬 아카이브',
    robots: preview || path.startsWith('/policies/') || ['/review', '/songbook/review', '/account', '/account/withdraw-review', '/admin'].includes(path) || !entry ? 'noindex, nofollow' : 'index, follow',
  };
}
