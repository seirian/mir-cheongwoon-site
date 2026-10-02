import {Link} from 'react-router-dom';
import {BookOpen,CheckCircle2,Star} from 'lucide-react';
import catalog from '../data/songbookCatalog.json';
import '../songbook.css';
import '../songbook-v2.css';
import '../songbook-v3.css';
export default function SongbookV2Review(){return <div className="songbook-page sb2-page">
  <section className="section-wrap sb-hero"><div className="sb-hero-copy"><span className="sb-overline">SONGBOOK / REVIEW 03</span><h1>노래책 3차 검토안<span>더 넓게 찾고, 바로 들어보세요.</span></h1><p>플랫폼별 VOD와 정사각형 곡 이미지,<br/>노래책 밖의 음악까지 찾아 등록하는 화면입니다.</p><div className="sb-actions"><Link className="sb-button sb-primary" to="/songbook"><BookOpen size={17}/>노래책 보기</Link><Link className="sb-button" to="/songbook?demo=1"><Star size={17}/>노래 추가·편집 체험</Link></div></div></section>
  <section className="section-wrap sb2-review-grid">{[
    ['영상별 바로가기','곡 제목 옆에 YouTube·SOOP VOD를 구분해 표시합니다. 한 플랫폼에 여러 영상이 있으면 1·2·3 번호로 구분하며 각각 새 탭에서 열립니다.'],
    ['전체 음악 검색','노래 추가에서는 이미 등록된 곡과 외부 음악 검색 결과를 나눠 보여줍니다. 외부 검색은 현재 연결된 음악 DB를 조회하므로 기존 노래책에 없는 곡도 찾을 수 있습니다.'],
    ['자동 지역 확장','자동·전체 검색은 한국·미국·일본 음악 목록과 보완 DB를 함께 조회합니다. 지역마다 다른 제목은 가수·앨범을 확인하고 한글 별칭을 추가할 수 있습니다.'],
    ['곡 이미지','곡명 왼쪽에 정사각형 이미지를 표시합니다. 선택한 앨범 커버가 우선이며, 없는 곡은 연결 영상의 썸네일을 사용합니다. 불러오지 못하면 기본 음악 아이콘으로 대체합니다.'],
    ['직접 확인하고 저장','검색 결과의 곡을 선택하면 곡명·가수·앨범 이미지가 채워집니다. 카테고리와 영상을 확인해 저장하며, 기존 곡이면 중복 추가 대신 편집합니다.'],
    ['이전 기능 유지','별 1~5개 난이도 검색, 카테고리 다중 선택, 즐겨찾기, 미르님 전용 숙련도 저장을 그대로 사용할 수 있습니다.']
  ].map(([title,text])=><article key={title}><CheckCircle2 size={23}/><h2>{title}</h2><p>{text}</p></article>)}</section>
  <section className="section-wrap sb2-review-note"><h2>이렇게 확인해 보세요</h2><p>편집 체험 → 노래 추가 → ‘영물이다’ 검색 → 이오몽의 ‘Wisp!’ 선택 순서로 확인해 보세요. 해외 등록명이 다르면 ‘검색어를 검색 별칭에 추가’를 눌러 한글로도 찾게 만들 수 있습니다. 등록 전에 표시 제목도 수정할 수 있습니다.</p><h3>검색과 이미지의 범위</h3><p>음악 DB에 아직 등록되지 않은 신곡·미유통곡은 검색되지 않을 수 있습니다. 직접 입력과 Apple Music 곡 주소 조회도 지원합니다. 영상 썸네일에는 VOD 표시가 있으며 앨범 커버와 구분됩니다.</p><h3>저장과 권한</h3><p>체험 모드는 이 브라우저에만 저장됩니다. 실제 편집은 기존 계정으로 로그인한 뒤 권한을 연결해 사용합니다. 기본 {catalog.length}곡의 숙련도는 미르님 평가 전까지 비워둡니다.</p><h3>검토 범위</h3><p>운영 사이트와 분리된 검토 페이지입니다. 실제 신청곡 접수·SOOP 전송 및 데뷔 이후 전체 가창 이력의 검증 완료를 의미하지 않습니다.</p></section>
</div>;}
