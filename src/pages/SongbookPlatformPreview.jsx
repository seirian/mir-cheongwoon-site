import {useEffect,useMemo,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {BookOpen,Music2,Plus,Star,X} from 'lucide-react';
import SongEditor from '../components/songbook/SongEditor.jsx';
import {SongCover,VodLinks} from '../components/songbook/SongMedia.jsx';
import catalog from '../data/songbookCatalog.json';
import {duplicateOf,publicSong,validateEntry} from '../lib/songbookV2.js';
import {PLATFORM_DRAFT_KEY} from '../lib/songbookPlatforms.js';
import '../songbook.css';
import '../songbook-v2.css';
import '../songbook-v3.css';
import '../songbook-v4.css';
import '../songbook-platforms.css';
function PreviewModal({title,close,children}) {
  const ref=useRef(null);
  useEffect(()=>{const el=ref.current,prior=document.activeElement,overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;if(prior?.isConnected)prior.focus();};},[]);
  return <dialog ref={ref} className="sb-dialog sb2-modal sp-modal" aria-labelledby="sp-modal-title" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===ref.current)close();}}><div className="sb-dialog-content"><header className="sb-dialog-top"><div><span className="sp-eyebrow">플랫폼 검색 · 1차 검토</span><h2 id="sp-modal-title">{title}</h2></div><button type="button" className="sb-icon" aria-label="창 닫기" onClick={close}><X/></button></header><p className="sp-local-notice">저장해도 운영 목록은 바뀌지 않습니다. 이 브라우저에서만 검토합니다.</p>{children}</div></dialog>;
}
function StarPicker({value,label,onChange}) {return <fieldset className="sb2-picker"><legend>{label}</legend><div>{[1,2,3,4,5].map(n=><button key={n} type="button" aria-label={`${label} ${n}점으로 설정`} aria-pressed={value===n} onClick={()=>onChange(n)}><Star size={22} fill={n<=value?'currentColor':'none'}/></button>)}</div></fieldset>;}
function initialDrafts(){try {const rows=JSON.parse(localStorage.getItem(PLATFORM_DRAFT_KEY)||'[]');return Array.isArray(rows)?rows.slice(0,100).flatMap(r=>{try{return [validateEntry(publicSong(r),{allowUnknownArtist:true})];}catch{return [];}}):[];}catch{return [];}}
export default function SongbookPlatformPreview(){
  const [params]=useSearchParams(),[drafts,setDrafts]=useState(initialDrafts),[editing,setEditing]=useState(()=>params.get('add')==='1'?{}:null),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  const songs=useMemo(()=>{const map=new Map(catalog.map(s=>[s.id,publicSong(s)]));for(const r of drafts)map.set(r.id,publicSong(r));return [...map.values()];},[drafts]);
  const store={songs,saving,async saveSong(input){
    if(saving)throw Error('저장 중입니다.');
    const payload=validateEntry({...input,id:input.id||'custom-'+crypto.randomUUID()},{allowUnknownArtist:true});
    if(duplicateOf(songs,publicSong(payload)))throw Error('같은 곡이 이미 있습니다. 기존 곡을 선택해 주세요.');
    const next=[payload,...drafts.filter(r=>r.id!==payload.id)].slice(0,100);setSaving(true);
    try {localStorage.setItem(PLATFORM_DRAFT_KEY,JSON.stringify(next));setDrafts(next);setNotice(`「${payload.title}」을 이 브라우저의 검토 목록에 저장했습니다. 운영에는 반영되지 않습니다.`);return payload.id;}
    catch{throw Error('브라우저 저장 공간을 사용할 수 없습니다. 입력 내용은 그대로 유지합니다.');}finally{setSaving(false);}
  }};
  return <div className="songbook-page sb2-page sp-preview"><section className="section-wrap sp-preview-hero"><div><span className="sp-eyebrow"><BookOpen size={16}/> SONGBOOK · SEARCH LAB</span><h1>노래 추가, 플랫폼별로.</h1><p>음원 정보는 Apple Music에서,<br/>영상 제목은 YouTube에서 확인해 가져옵니다.</p><div className="sb-actions"><button type="button" className="sb-button sb-primary" onClick={()=>setEditing({})}><Plus size={18}/>노래 추가 검토하기</button><Link className="sb-button" to="/songbook/review">구현 범위·사용 방법</Link></div></div><div className="sp-preview-summary"><strong>1차 검토안</strong>{/* MELON_PAUSED: <span>Apple Music · YouTube · Melon</span> */}<span>Apple Music · YouTube</span><small>운영과 분리 · 로그인 불필요 · 브라우저 저장</small></div></section>
    <section className="section-wrap sp-capabilities" aria-label="현재 사용할 수 있는 기능"><article><b>Apple Music</b><strong>검색해서 가져오기</strong><p>한국어 제목 우선 검색과 곡명·가수·앨범 이미지 가져오기.</p></article><article><b>YouTube</b><strong>검색·영상 주소로 가져오기</strong><p>검색 결과에서 제목·썸네일·영상 주소를 가져옵니다. 가수는 공란으로 저장할 수 있습니다.</p></article>{/* MELON_PAUSED: preserved capability card.
<article><b>Melon</b><strong>검색 사이트에서 확인</strong><p>자동 수집은 미연결. 멜론에서 확인한 곡명·가수를 직접 입력할 수 있습니다.</p></article>
*/}</section>
    <section className="section-wrap sp-draft-library"><header><h2>저장한 검토곡 <small>{drafts.length}</small></h2><span>이 브라우저에만 보관됩니다.</span></header>{notice&&<p className="sp-import-notice" role="status">{notice}</p>}
    {!drafts.length?<div className="sp-empty-library"><Music2 size={32}/><h3>검색부터 저장까지 직접 확인해 보세요.</h3><p>‘노래 추가 검토하기’에서 곡이나 영상 주소를 가져오면 여기에서 확인할 수 있습니다.</p></div>:drafts.map(entry=>{const s=publicSong(entry);return <article key={s.id} className="sp-saved-song"><SongCover song={s}/><div><strong>{s.title}</strong><p>{s.artist||'가수 미확인'}</p><VodLinks urls={s.videoUrls} title={s.title}/></div><button className="sb-button" type="button" onClick={()=>setEditing(s)}>검토곡 수정</button></article>;})}</section>
    <p className="section-wrap sb-note">기존 곡 찾기는 검토용 기본 목록을 사용합니다. 외부 검색과 운영 데이터 저장은 별개이며, 이번 페이지는 운영 계정·자동 수집·노래 목록을 변경하지 않습니다.</p>
    {editing&&<SongEditor key={editing.id||'new'} song={editing.id?editing:null} store={store} categories={['가요','팝송','J-POP','애니메이션','기타']} close={()=>setEditing(null)} saved={()=>setEditing(null)} Modal={PreviewModal} StarPicker={StarPicker} platformSearch allowUnknownArtist/>}
  </div>;
}
export function PlatformReviewNotes(){return <div className="section-wrap sp-review-notes"><span className="sp-eyebrow">플랫폼 검색 · 1차 검토</span><h1>구현 범위와 확인 방법</h1><Link className="sb-button sb-primary" to="/songbook?add=1">검색·가져오기 체험하기</Link><section><h2>Apple Music</h2><p>곡명·가수 또는 Apple Music 곡 주소로 검색합니다. 기존 iTunes 음악 검색 API의 한국·미국·일본 결과를 사용하며 한국어 제목 우선 처리를 유지합니다. 이 영역에는 다른 음악 DB의 결과를 섞지 않습니다.</p></section><section><h2>YouTube</h2><p>곡명·가수를 입력하면 YouTube 검색 결과가 별도 영역에 나타납니다. 원하는 영상의 ‘영상 정보 가져오기’를 누르면 제목·썸네일·영상 주소를 가져옵니다. 이미 확인한 영상 주소를 붙여넣는 방식도 사용할 수 있습니다. 채널명은 확인용으로만 보여주며 가수로 저장하지 않습니다. 영상 제목은 실제 곡명과 다를 수 있으므로 저장 전에 수정할 수 있습니다.</p><p>키워드 검색은 서버에서 공식 YouTube Data API를 호출하며 키를 브라우저에 전달하지 않습니다. 한 번에 최대 12개 영상을 표시합니다. 검색 할당량이나 연결 문제가 생기면 안내하며, 동영상 주소 가져오기는 별도 검색 키 없이 계속 사용할 수 있습니다. 검색 결과의 채널명은 가수로 추정하지 않습니다.</p><p>새 초안에 영상을 먼저 가져오면 가수는 공란입니다. 먼저 Apple Music 곡을 선택한 뒤 YouTube 영상을 가져오면 기존 곡명·가수는 유지하고 영상만 추가합니다. 원곡 영상 선택이 미르님의 가창 사실이나 신청 가능 여부를 확정하지는 않습니다.</p></section>{/* MELON_PAUSED: preserved review notes, not visible to visitors.
<section><h2>Melon</h2><p>검색 페이지의 정상 응답은 확인했으나 일반 봇의 수집을 제한하는 robots.txt와 정보 복제·유통 관련 약관을 확인했습니다. 허용된 검색 연동 경로를 확보하지 않은 상태에서 ‘문제없는 자동 수집’으로 취급하지 않았습니다.</p><p>이번에는 멜론 검색창을 새 탭으로 열고, 확인한 정보를 직접 입력하는 방식을 제공합니다. 멜론 자동 검색 결과나 앨범 이미지를 가져온 것처럼 표시하지 않습니다. 공식 또는 허가된 연동을 확보한 뒤 동일한 플랫폼 영역에 자동 결과를 추가할 수 있습니다.</p></section>
*/}<section><h2>가수 공란과 검토 저장</h2><p>가수를 모르면 비워둔 채 이 브라우저에 검토곡을 저장할 수 있습니다. ‘가수 미확인’은 화면 안내일 뿐 가수 이름으로 저장하지 않습니다. 운영 데이터베이스의 필수값 규칙은 변경하지 않았습니다. 운영 도입 시 가수 공란 저장에 대한 데이터베이스·관리자 승인 경로 검증이 별도로 필요합니다.</p></section><section><h2>검토 방법</h2><p>‘영물이다’를 검색해 Apple Music 결과를 가져온 뒤, YouTube에서 확인한 영상 주소를 붙여넣어 영상만 추가해 보세요. 가수 공란 저장은 새 초안에서 YouTube 영상을 먼저 가져오면 확인할 수 있습니다. 카테고리를 고르고 저장한 다음 페이지를 새로고침하면 검토곡이 유지됩니다.</p><p>배포 주소는 검색엔진 비노출이지만 주소를 아는 사람은 접근할 수 있습니다. 검색 결과와 저장 기능에 운영 로그인은 사용하지 않습니다.</p></section></div>;}
