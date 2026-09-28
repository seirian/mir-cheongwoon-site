import { useState } from 'react';
import { ArrowUpRight, Check, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero';
import { REVIEW_BRANCH } from '../data/promotionData';

const items = [
  ['최우선', '미작성 멤버 카드 정리', '이름·포지션·소개가 없는 카드와 템플릿 문구를 공개 목록에서 제외합니다. 관리자에게는 편집 가능한 상태로 남습니다.', '/band'],
  ['최우선', '캐릭터 중심 홈과 라이브 동선', '기존 미르 이미지를 정지 WebP로 사용하고 공식 라이브·방송으로 이어지는 버튼을 전면에 배치합니다.', '/'],
  ['높음', '입문 추천과 최신 영상 분리', '고정한 추천 주제·곡 후보는 최신 영상과 분리됩니다. 확인되지 않은 영상 ID를 임의로 넣지 않습니다.', '/#start-here'],
  ['높음', '멤버 개성과 공연 기록 연결', '악기별 역할을 소개하고 공연 기록으로 연결합니다. 개별 참여 이력은 확인된 목록이 있을 때만 표시합니다.', '/band#band-members'],
  ['높음', '다음 일정과 공식 채널', 'KST 기준으로 지나간 일정·휴방 등을 제외하고 일정 파일 저장 및 공식 채널 동선을 제공합니다.', '/#next-event'],
  ['중간', '공연별 상세 페이지와 공유', '일곱 공연의 고유 주소, 소개·참여 정보·공개 곡·사진 연결을 제공합니다. 검증된 타임스탬프만 활성화됩니다.', '/history/blued-2025'],
  ['중간', '페이지별 메타데이터·모바일', '페이지마다 제목·설명·공유 이미지를 정적 HTML에 넣고, 작은 화면의 메뉴·일정 목록과 키보드 동선을 보완합니다.', '/schedule'],
];

export default function ReviewPage() {
  const [checked, setChecked] = useState({});
  return <><PageHero eyebrow="DESIGN & FUNCTION REVIEW" title="개선안 검토실" description="운영 사이트와 분리된 읽기 전용 미리보기입니다. 일곱 가지 변경점을 차례로 확인해 보세요."/>
    <section className="section-wrap promo-section"><div className="review-info"><span className="eyebrow">FEATURE BRANCH</span><code>{REVIEW_BRANCH}</code><p>회원가입·로그인·관리자 편집은 이 미리보기에서 사용할 수 없습니다. 아래 체크는 현재 화면에서만 유지되며 서버에 저장되지 않습니다.</p><a className="promo-text-link" href="https://mir.yeop.net/" target="_blank" rel="noopener noreferrer">기존 운영 사이트와 비교<ExternalLink size={15}/></a></div>
      <div className="review-checks">{items.map(([priority, title, description, path], index) => <article key={title}><label><input type="checkbox" checked={Boolean(checked[index])} onChange={(event) => setChecked((previous) => ({ ...previous, [index]: event.target.checked }))}/><span className="review-check-icon" aria-hidden="true">{checked[index] ? <Check size={17}/> : String(index + 1).padStart(2, '0')}</span><span className="review-check-title"><small>{priority}</small><strong>{title}</strong></span></label><p>{description}</p><Link className="promo-text-link" to={path}>화면 확인<ArrowUpRight size={16}/></Link></article>)}</div>
      <div className="review-info"><h2>콘텐츠 확인이 필요한 부분</h2><p>대표 영상의 정확한 고정 URL, 공연별 개별 세션 참여 명단, 전체 세트리스트·곡별 타임스탬프는 확인된 자료가 있을 때 추가합니다. 관련 입력 위치는 <code>src/data/promotionData.js</code>입니다. 비어 있는 값은 완료된 사실처럼 표시하지 않습니다.</p><p>일정이 없을 때·조회에 실패했을 때·영상이 없을 때를 각각 구분했습니다. 미리보기에는 검색 제외(noindex)가 적용됩니다.</p></div>
    </section></>;
}

export function PreviewAccountNotice() {
  return <section className="section-wrap promo-section"><span className="eyebrow">READ-ONLY PREVIEW</span><h1>검토용 화면에서는 로그인과 편집이 잠겨 있습니다.</h1><p>운영 계정 및 데이터를 보호하기 위한 미리보기 전용 설정입니다.</p><Link className="btn btn-ghost" to="/review">개선안 검토실로 돌아가기</Link></section>;
}
