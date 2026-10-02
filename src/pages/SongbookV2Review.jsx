import {Link} from 'react-router-dom';
import {BookOpen,CheckCircle2,Star} from 'lucide-react';
import catalog from '../data/songbookCatalog.json';
import '../songbook.css';
import '../songbook-v2.css';
import '../songbook-v3.css';
import '../songbook-v4.css';
export default function SongbookV2Review(){return <div className="songbook-page sb2-page">
  <section className="section-wrap sb-hero"><div className="sb-hero-copy"><span className="sb-overline">SONGBOOK / REVIEW 04</span><h1>노래책 4차 검토안<span>찾던 노래, 익숙한 이름으로.</span></h1><p>확인된 한국어 제목을 먼저 보여주고,<br/>해외 등록명도 검색 별칭으로 연결합니다.</p><div className="sb-actions"><Link className="sb-button sb-primary" to="/songbook"><BookOpen size={17}/>노래책 보기</Link><Link className="sb-button" to="/songbook?demo=1"><Star size={17}/>한국어 검색·편집 체험</Link></div></div></section>
  <section className="section-wrap sb2-review-grid">{[
    ['한국어 제목 우선','한국 스토어 표기, 확인된 국내명, DB에 반환된 한국어 별칭을 대조합니다. 같은 곡 ID의 한국어 표기는 해외 표기보다 먼저 선택합니다.'],
    ['한글·영문 검색 연결','영물이다를 검색하면 영물이다 — 이오몽으로 표시합니다. Wisp!는 별칭으로 자동 보관되어 직접 번역하거나 별칭을 입력하지 않아도 됩니다.'],
    ['버전은 따로 확인','일반 음원과 반주·라이브·리믹스는 제목이 비슷해도 합치지 않습니다. 결과에서 버전과 제공된 발매일·재생 시간을 함께 확인할 수 있습니다.'],
    ['저장한 이름은 그대로','미르님이나 관리자가 이미 정한 제목을 외부 정보가 덮어쓰지 않습니다. 해외명이 저장된 기존 곡에는 한국어 제목을 직접 적용하는 버튼을 제공합니다.'],
    ['미확인 제목 안내','한국어 표기를 확인하지 못한 결과는 원문 제목으로 남깁니다. 한국 가수의 해외명에는 한국어명 미확인을 표시하고 임의 번역하지 않습니다.'],
    ['기존 기능 유지','플랫폼별 VOD, 곡 이미지, 다중 카테고리, 난이도 검색, 미르님 숙련도 저장과 직접 곡 추가 기능은 그대로입니다.']
  ].map(([title,text])=><article key={title}><CheckCircle2 size={23}/><h2>{title}</h2><p>{text}</p></article>)}</section>
  <section className="section-wrap sb2-review-note"><h2>이렇게 확인해 보세요</h2><p>편집 체험 → 노래 추가 → ‘영물이다’ 검색 → ‘영물이다 / 이오몽’ 선택 → 카테고리 선택 → 저장 순서로 확인하세요. 저장 후 한글 제목과 Wisp! 어느 쪽으로 검색해도 같은 등록 곡을 찾을 수 있습니다.</p><h3>한국어 제목이 확인되는 범위</h3><p className="sb4-review-note">모든 해외 등록곡을 자동 번역하는 기능은 아닙니다. 한국어 표기를 제공하는 검색 결과와 확인된 곡명 연결 정보를 활용합니다. 별도로 대조한 국내명 연결 정보는 현재 영물이다의 일반 음원·반주 2개 트랙입니다. 연결 정보가 없고 DB에도 한국어 표기가 없으면 원문 제목을 유지합니다.</p><h3>저장과 권한</h3><p>체험 결과는 이 브라우저에만 저장됩니다. 실제 편집은 권한 있는 계정으로 로그인해 사용합니다. 기본 {catalog.length}곡이나 미르님의 숙련도를 이번 검색 보완으로 자동 변경하지 않았습니다.</p><h3>검토 범위</h3><p>운영 사이트와 분리된 검토 페이지입니다. 모든 발매곡의 검색, 데뷔 이후 전곡 수록 또는 실제 신청곡 접수를 보장하지 않습니다.</p></section>
</div>;}
