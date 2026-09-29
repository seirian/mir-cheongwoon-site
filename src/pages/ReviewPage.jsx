import { useState } from 'react';
import { ArrowUpRight, Check, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero';
import { REVIEW_BRANCH } from '../data/promotionData';

const revisionItems = [
  ['2차 · 01', '홈 균형과 관리자 이미지 교체', '홈을 아래 콘텐츠와 같은 중앙 폭에 맞추고 좌우 내부 여백을 균형 있게 조정했습니다. 이미지 위의 관리자 이미지 관리에서 기존 관리자 이메일로 로그인하고 파일 선택 → 미리보기 → 이미지 저장을 확인하세요. 대표 라이브는 지정한 Gh4PqvQVWRc 영상으로 고정했습니다.', '/'],
  ['2차 · 02', '입문 추천 카드의 두 줄 제목 높이', '01·02·03 카드 모두 영상 제목 두 줄 높이를 확보합니다. 짧은 제목도 동일한 공간을 사용하며 두 줄보다 긴 제목은 두 줄까지만 표시됩니다.', '/#start-here'],
  ['2차 · 03 수정', '일정표 원복 · 상단 소개 문구만 한 줄', '일정 제목·설명·일별 기록·필터에 추가했던 한 줄 강제 처리를 제거하고 2차 수정 전 표시 방식으로 되돌렸습니다. 상단의 “월별 일정과 오늘의 기록, 팬아트와 메모를 한 화면에서 확인할 수 있는 미르 일정 대시보드입니다.” 문구만 한 줄로 표시합니다.', '/schedule'],
];
const firstItems = [
  ['최우선', '미작성 멤버 카드 정리', '미작성 카드와 템플릿 문구는 공개 목록에서 제외하며 관리자 편집은 유지합니다.', '/band'],
  ['최우선', '캐릭터 중심 홈과 라이브 동선', '캐릭터, 대표 라이브와 공식 방송 버튼으로 첫 방문자의 감상을 안내합니다.', '/'],
  ['높음', '입문 추천과 최신 영상 분리', '음악·라이브·방송의 세 영역과 최신 영상 목록을 분리합니다.', '/#start-here'],
  ['높음', '멤버 개성과 공연 기록 연결', '악기별 역할과 공연 기록을 연결합니다. 개인 참여 이력은 확인된 경우에만 표시합니다.', '/band#band-members'],
  ['높음', '다음 일정과 공식 채널', '한국 시간 기준의 다음 일정과 캘린더 저장·공식 채널을 제공합니다.', '/#next-event'],
  ['중간', '공연별 상세 페이지와 공유', '일곱 공연의 소개·참여 정보·공개 곡·사진과 고유 주소를 제공합니다.', '/history/blued-2025'],
  ['중간', '페이지별 메타데이터·모바일', '페이지별 제목·설명·공유 이미지와 모바일 메뉴를 제공합니다.', '/schedule'],
];

export default function ReviewPage() {
  const [checked, setChecked] = useState({});
  const cards = (items) => <div className="review-checks">{items.map(([priority, title, description, path]) => <article key={title}><label><input type="checkbox" checked={Boolean(checked[title])} onChange={(event) => setChecked((previous) => ({ ...previous, [title]: event.target.checked }))}/><span className="review-check-icon" aria-hidden="true">{checked[title] ? <Check size={17}/> : '○'}</span><span className="review-check-title"><small>{priority}</small><strong>{title}</strong></span></label><p>{description}</p><Link className="promo-text-link" to={path}>화면 확인<ArrowUpRight size={16}/></Link></article>)}</div>;
  return <><PageHero eyebrow="SECOND DESIGN & FUNCTION REVIEW" title="개선안 검토실" description="2차 검토안 수정본입니다. 홈과 카드 개선은 유지하고, 일정표는 상단 소개 문구에만 한 줄 표시를 적용했습니다."/>
    <section className="section-wrap promo-section">
      <div className="review-info"><span className="eyebrow">FEATURE BRANCH · REVIEW 02</span><code>{REVIEW_BRANCH}</code><p>운영 화면은 그대로 유지합니다. 홈 이미지에 한해서만 관리자 로그인과 별도 저장을 허용합니다. 계정·일정·밴드·갤러리의 다른 편집은 잠겨 있습니다. 체크 항목은 현재 화면에서만 유지됩니다.</p><a className="promo-text-link" href="https://mir.yeop.net/" target="_blank" rel="noopener noreferrer">기존 운영 사이트와 비교<ExternalLink size={15}/></a></div>
      {cards(revisionItems)}
      <div className="review-info"><h2>이미지 교체 확인 방법</h2><p>홈 이미지 위의 <strong>관리자 이미지 관리</strong>를 누르고 기존 관리자 이메일로 로그인하세요. 파일을 선택하면 저장 전 미리보기가 나타납니다. <strong>이미지 저장</strong> 후 새로고침하거나 다른 브라우저에서 열어도 저장된 검토용 이미지를 확인할 수 있습니다.</p><p>JPG·PNG·WebP 5MB 이하를 지원하며 정지 WebP로 최적화합니다. 일반 회원은 업로드할 수 없습니다. 이미지 선택이나 취소만으로는 서버를 변경하지 않습니다. 저장된 검토용 이미지는 다른 검토자에게도 공개되며 운영 이미지로 자동 승격되지 않습니다.</p><p>검토 로그인은 운영 로그인과 분리되며 새로고침하면 다시 로그인해야 합니다. 저장된 이미지는 로그아웃해도 유지됩니다. DB 스키마·RLS·기존 갤러리 항목은 변경하지 않습니다.</p></div>
      <details><summary className="promo-text-link">1차 개선 일곱 항목도 확인하기</summary>{cards(firstItems)}</details>
      <div className="review-info"><h2>콘텐츠 확인이 필요한 부분</h2><p>대표 라이브 주소는 지정 영상으로 확정했습니다. 공연별 개별 참여 명단, 전체 세트리스트와 곡별 타임스탬프는 확인된 자료를 받은 뒤 추가합니다. 비어 있는 항목을 완료된 사실처럼 표시하지 않습니다.</p><p>이 주소는 검색 제외(noindex)가 적용된 공개 미리보기입니다. 실제 관리자 자격 증명을 테스트에 사용하거나 저장하지 않습니다.</p></div>
    </section></>;
}

export function PreviewAccountNotice() {
  return <section className="section-wrap promo-section"><span className="eyebrow">REVIEW PREVIEW</span><h1>검토용 화면에서는 로그인과 편집이 잠겨 있습니다.</h1><p>일반 계정·데이터 편집은 잠겨 있습니다. 홈 이미지 교체만 메인 화면의 관리자 이미지 관리에서 별도 로그인으로 확인할 수 있습니다.</p><Link className="btn btn-ghost" to="/">홈 이미지 관리로 이동</Link><Link className="promo-text-link" to="/review">개선안 검토실로 돌아가기</Link></section>;
}
