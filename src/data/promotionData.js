import { performanceHistory } from './siteData.js';

export const SITE_ORIGIN = 'https://mir.yeop.net';
export const REVIEW_BRANCH = 'feature/promotion-discovery-preview';

// Editorial order is independent of the daily recent-video feed. Fill youtubeUrl
// with an approved official URL to pin an exact recording; never invent an ID.
export const editorialPicks = [
  { id: 'voice', eyebrow: '01 / THE VOICE', title: '노래하는 미르',
    description: '목소리부터 만나보세요. 등록된 커버 「노심융해」를 먼저 추천합니다.',
    candidates: ['노심융해', '炉心融解'], source: 'covers', youtubeUrl: '',
    fallbackLabel: '공식 채널에서 커버 보기', fallbackPath: 'videos' },
  { id: 'stage', eyebrow: '02 / THE STAGE', title: '라이브의 온도',
    description: '「푸름과 여름」 라이브로 무대의 분위기를 만나보세요.',
    candidates: ['푸름과 여름', '青と夏'], source: 'covers', youtubeUrl: '',
    fallbackLabel: '공식 채널에서 라이브 보기', fallbackPath: 'videos' },
  { id: 'stream', eyebrow: '03 / BEYOND THE STAGE', title: '방송 속 미르',
    description: '노래 밖의 모습도 궁금하다면. 공식 채널의 최근 방송 영상으로 이어집니다.',
    candidates: ['FPS에 소질없는', 'STALZONE'], source: 'recent', youtubeUrl: '',
    fallbackLabel: '공식 채널의 최근 영상 보기', fallbackPath: 'videos' },
];

const eventDetails = {
  '2025.08.09': { slug: 'blued-2025', shortTitle: 'BLUED', venue: '서울 마곡 NSP홀',
    bandCredit: true, story: '첫 오프라인 단독 콘서트. 미르와 청운밴드가 함께한 1부와 2부의 기억을 모읍니다.', songs: [] },
  '2025.04.05': { slug: 'crebijou-2025', shortTitle: '크레비쥬 콘서트', songs: [] },
  '2025.04.02': { slug: 'relief-2025', shortTitle: '산불 이재민 돕기 릴레이 콘서트', songs: [{ title: '어디에도', youtubeUrl: '', seconds: null }] },
  '2025.03.03': { slug: 'zzz-2025', shortTitle: '젠레스 존 제로 OST 콘서트', songs: [] },
  '2024.11.15': { slug: 'forest-v-star-2024', shortTitle: '숲Vㅓ스타', venue: '지스타 2024 SOOP 부스',
    songs: [{ title: 'Legends Never Die', youtubeUrl: '', seconds: null }, { title: '私は最強', youtubeUrl: '', seconds: null }] },
  '2024.09.22': { slug: 'we-all-stars-2024', shortTitle: 'We all stars', songs: [] },
  '2023.12.31': { slug: 'growth-novel-2023', shortTitle: '성장소설', songs: [] },
};

// Existing archive copy is the source. Empty credits, recording URLs and timing
// are deliberate: a similarly titled cover is NOT evidence of this performance.
export const performances = performanceHistory.flatMap(({ events }) => events.map((event) => ({
  ...event, ...eventDetails[event.date], dateKey: event.date.replaceAll('.', '-'),
  memberNames: [], recordings: [], sourceUrl: '',
})));
export const featuredPerformance = performances.find((event) => event.slug === 'blued-2025');

// These are descriptions of the instrument's role, not unverified biographies.
// Add performanceSlugs / channelUrl only after the member or source confirms them.
export const memberHighlights = {
  Ray: { summary: '보컬 곁에서 선율을 이어가는 기타 파트.', performanceSlugs: [], channelUrl: '' },
  SweetBerry: { summary: '리듬과 화성을 이어주는 베이스 파트.', performanceSlugs: [], channelUrl: '' },
  맹감자: { summary: '곡의 분위기와 공간을 채우는 건반 파트.', performanceSlugs: [], channelUrl: '' },
};
