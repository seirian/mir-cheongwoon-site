import SongbookViewSwitch from '../components/songbook/SongbookViewSwitch.jsx';
import SongbookCoverCard from '../components/songbook/SongbookCoverCard.jsx';
import {SONGBOOK_LAYOUT_KEY,readSongbookLayout,resolveSongbookLayout,writeSongbookLayout} from '../lib/songbookLayout.js';
import '../songbook-cover.css';
import {songbookPageSizes,songbookPage} from '../lib/songbookBulk.js';
import BulkStatusDialog from '../components/songbook/BulkStatusDialog.jsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {BookOpen,Search,SlidersHorizontal,Copy,Link2,Heart,Pencil,ChevronLeft,ChevronRight,X,Music2,Download,Plus,Trash2} from 'lucide-react';
import {csv,download,FAVORITES_KEY} from '../lib/songbookV2.js';
import {videoPresence} from '../lib/songbookVideoPresence.js';
import {useTimedNotice} from '../lib/useTimedNotice.js';
import {useSongbookStore} from '../lib/songbookStore.js';
import {REQUEST_STATES as STATUS} from '../lib/songbookUsage.js';
import {enrichUsage,selectUsageSongs,requestText,publicSongLink,quickDraft,quickPayload} from '../lib/songbookUsability.js';
import {Modal,StarPicker} from './SongbookV2Page.jsx';
import Editor from '../components/songbook/SongEditor.jsx';
import {SongCover} from '../components/songbook/SongMedia.jsx';
import {DeleteSongDialog,DeletedSongsDialog} from '../components/songbook/SongDeletion.jsx';
import TimelinePanel,{TimelineHistory} from '../components/songbook/TimelinePanel.jsx';
import AdminVideoFilters from '../components/songbook/AdminVideoFilters.jsx';
import {Dialog,QuickEdit,StatusBadge,Rating,VideoLinks} from '../songbook-check/Dialogs.jsx';
import SongCategories from '../songbook-check/SongCategories.jsx';
import '../songbook-check/preview.css';
import '../songbook-check/round2.css';
import '../songbook-check/round3.css';
import '../songbook-usability.css';
const BASE=import.meta.env.BASE_URL;
const attentionNames={representative:'YouTube 미연결',artist:'가수 미입력',proficiency:'숙련도 평가 전',status:'신청 상태 확인 필요'};
function UsageRating({song,store,rate}) {
 return store.admin?<div className="ck-rating"><StarPicker value={song.proficiency} disabled={!store.canRate||store.saving} onChange={v=>rate(song.id,v)}/><small>참고 난이도 {song.difficulty?'★'.repeat(song.difficulty):'미정'}</small></div>:<Rating song={song}/>;
}
export default function SongbookUsabilityPage({favoritesKey=FAVORITES_KEY,layoutKey=SONGBOOK_LAYOUT_KEY}={}) {
 const [params,setParams]=useSearchParams(),store=useSongbookStore(false),admin=store.admin;
 const [preferredLayout,setPreferredLayout]=useState(()=>{try{return readSongbookLayout(window.localStorage,layoutKey);}catch{return 'list';}});
 const layout=resolveSongbookLayout(params.get('layout'),preferredLayout);
 function changeLayout(value){
  if(value===layout)return;
  setPreferredLayout(value);try{writeSongbookLayout(window.localStorage,value,layoutKey);}catch{/* Storage is optional; URL/state still work. */}
  // Different page sizes change membership; never carry a hidden bulk selection.
  setSelection({});update({layout:value,perPage:'',song:''});
 }
 const [input,setInput]=useState(params.get('q')||''),[editing,setEditing]=useState(null),[fullEditing,setFullEditing]=useState(null),[deleting,setDeleting]=useState(null),[trashOpen,setTrashOpen]=useState(false),[manualCopy,setManualCopy]=useState(null);
 const [favorites,setFavorites]=useState(()=>{try{const v=JSON.parse(localStorage.getItem(favoritesKey)||'[]');return Array.isArray(v)?v.filter(id=>typeof id==='string'):[];}catch{return [];}});
 const [notice,showNotice,noticeProps]=useTimedNotice(),[deleteNotice,setDeleteNotice,deleteNoticeProps]=useTimedNotice();
 const [selection,setSelection]=useState({}),[bulkStatus,setBulkStatus]=useState(''),[bulkOpen,setBulkOpen]=useState(null);
 const selectPageRef=useRef(null);
 const searchRef=useRef(null),accountRef=useRef(null);accountRef.current=store.session?.user?.id||null;
 useEffect(()=>{setEditing(null);setFullEditing(null);setDeleting(null);setTrashOpen(false);setSelection({});setBulkOpen(null);},[store.session?.user?.id]);
 useEffect(()=>{if(!admin){setEditing(null);setFullEditing(null);setDeleting(null);setTrashOpen(false);setSelection({});setBulkOpen(null);}},[admin]);
 useEffect(()=>setInput(params.get('q')||''),[params.get('q')]);
 const songs=useMemo(()=>store.songs.map(enrichUsage),[store.songs]);
 const results=useMemo(()=>selectUsageSongs(songs,params,favorites,admin),[songs,params,favorites,admin]);
 const page=songbookPage(results,params.get('page'),params.get('perPage'),layout),selected=songs.find(s=>s.id===params.get('song')),ready=store.ready;
 const selectionScope=new URLSearchParams(params);selectionScope.delete('song');selectionScope.delete('layout');
 const scopeKey=layout+':'+selectionScope.toString();
 useEffect(()=>{setSelection({});},[scopeKey]);
 const pageIds=page.items.map(s=>s.id).join('\n');
 useEffect(()=>{const ids=new Set(page.items.map(s=>s.id));setSelection(old=>Object.fromEntries(Object.entries(old).filter(([id])=>ids.has(id))));},[pageIds]);
 const chosen=page.items.filter(s=>Object.hasOwn(selection,s.id));
 const allSelected=page.items.length>0&&chosen.length===page.items.length;
 useEffect(()=>{if(selectPageRef.current)selectPageRef.current.indeterminate=chosen.length>0&&!allSelected;},[chosen.length,allSelected,admin]);
 function selectionItem(song){return {id:song.id,title:song.title,artist:song.artist,requestStatus:song.requestStatus,expectedRevision:store.revisionFor(song.id)};}
 function selectSong(song,checked){setSelection(old=>{const next={...old};if(checked)next[song.id]=selectionItem(song);else delete next[song.id];return next;});}
 function selectPage(checked){setSelection(checked?Object.fromEntries(page.items.map(s=>[s.id,selectionItem(s)])):{});}
 function openBulk(){if(store.canEdit&&!store.saving&&chosen.length&&Object.hasOwn(STATUS,bulkStatus))setBulkOpen({targets:chosen.map(s=>selection[s.id]),status:bulkStatus,account:accountRef.current});}
 function bulkDone(report){
  if(bulkOpen?.account!==accountRef.current)return;
  const failed=new Set(report.results.filter(r=>r.outcome==='failed').map(r=>r.id));
  setSelection(old=>Object.fromEntries(Object.entries(old).filter(([id])=>failed.has(id))));
  showNotice(`신청 상태 변경 완료 ${report.updated}곡 · 같은 상태 ${report.unchanged}곡${report.failed?` · 미처리/확인 필요 ${report.failed}곡`:''}`,{autoDismiss:!report.failed});
  if(!report.failed)setBulkOpen(null);
 }
 const categories=[...new Set(songs.flatMap(s=>s.categories))].sort(new Intl.Collator('ko').compare),cats=params.getAll('category');
 const artists=[...new Set(songs.map(s=>s.artist).filter(Boolean))].sort(new Intl.Collator('ko').compare);
 const counts=Object.fromEntries(Object.keys(STATUS).map(status=>[status,songs.filter(s=>s.requestStatus===status).length]));
 function update(values,resetPage=true,replace=false){const next=new URLSearchParams(window.location.search);['source','status'].forEach(k=>next.delete(k));for(const [k,v] of Object.entries(values)){next.delete(k);if(Array.isArray(v))v.forEach(item=>next.append(k,item));else if(v)next.set(k,v);}if(resetPage)next.delete('page');setParams(next,{replace});}
 const clearFilters=()=>{setInput('');update({q:'',category:[],request:'',difficulty:'',artist:'',view:'',youtube:'',soop:'',attention:'',sort:'',song:''});};
 function toggleFavorite(song){const next=favorites.includes(song.id)?favorites.filter(id=>id!==song.id):[...favorites,song.id];setFavorites(next);try{localStorage.setItem(favoritesKey,JSON.stringify(next));}catch{showNotice('즐겨찾기를 브라우저에 저장하지 못했습니다. 이번 화면에서만 유지됩니다.',{autoDismiss:false});}}
 async function copyText(text,message){try{await navigator.clipboard.writeText(text);showNotice(message);}catch{setManualCopy({text,message});}}
 function copySong(song){if(song.requestStatus==='unavailable')return;void copyText(requestText(song),song.requestStatus==='unreviewed'?'신청 문구를 복사했습니다. 신청 가능 여부는 먼저 확인해 주세요.':'신청 문구를 복사했습니다. 방송 채팅에 붙여넣어 주세요.');}
 function shareSong(song){void copyText(publicSongLink(location.origin,BASE,song.id),'곡 링크를 복사했습니다. 검색 조건은 포함하지 않습니다.');}
 function openEditor(song){if(store.canEdit)setEditing(quickDraft(song,store.revisionFor(song.id)));}
 async function saveQuick(song,next){
  if(!store.canEdit||!editing||!songs.some(s=>s.id===editing.id))throw Error('편집할 곡과 관리자 권한을 다시 확인해 주세요.');
  const account=accountRef.current,original=editing;
  const nextSong=next?results.slice(results.findIndex(s=>s.id===original.id)+1).find(s=>s.id!==original.id):null;
  await store.saveSong(quickPayload(original,song));
  if(account!==accountRef.current)return;
  showNotice(`「${song.title}」의 변경사항을 노래책에 저장했습니다.`);
  setEditing(nextSong?quickDraft(nextSong,store.revisionFor(nextSong.id)):null);
 }
 async function rate(id,value){try{await store.saveRating(id,value);showNotice('미르님의 숙련도를 저장했습니다.');}catch(e){showNotice(e.message,{autoDismiss:false});}}
 function deleted(song){setDeleting(null);setFullEditing(null);setEditing(null);setDeleteNotice(`「${song.title}」을 노래책에서 삭제했습니다.`);const next=favorites.filter(id=>id!==song.id);setFavorites(next);try{localStorage.setItem(favoritesKey,JSON.stringify(next));}catch{}const remaining=songbookPage(results.filter(s=>s.id!==song.id),page.page,page.pageSize,layout);update({song:'',page:remaining.page>1?String(remaining.page):''},false);}
 const chips=[];
 if(params.get('q'))chips.push(['q',`검색: ${params.get('q')}`]);cats.forEach(c=>chips.push(['category',c,c]));
 if(Object.hasOwn(STATUS,params.get('request')))chips.push(['request',STATUS[params.get('request')]]);
 if(params.get('difficulty'))chips.push(['difficulty',params.get('difficulty')==='unset'?'난이도 미정':`난이도 ${params.get('difficulty')}점`]);
 if(params.get('artist'))chips.push(['artist',params.get('artist')]);
 if(params.get('view')==='favorites')chips.push(['view','즐겨찾기']);if(params.get('view')==='videos')chips.push(['view','영상 있는 곡']);
 if(admin){for(const [key,name] of [['youtube','YouTube'],['soop','SOOP']])if(['present','missing'].includes(params.get(key)))chips.push([key,`${name} ${params.get(key)==='missing'?'없음':'있음'}`]);if(attentionNames[params.get('attention')])chips.push(['attention',attentionNames[params.get('attention')]]);}
 return <div className="songbook-page ck-app ck-production">
  <a className="ck-skip" href="#check-library">곡 목록으로 이동</a>
  <div className="ck-wrap">
   <section className="ck-hero"><div><span className="ck-eyebrow"><BookOpen size={13}/> MIR’S SONGBOOK</span><h1>미르의 노래책</h1><p>듣고 싶은 노래를 찾고, 신청 문구를 복사해 주세요.</p></div><div className="ck-record" aria-hidden="true"><Music2 size={28}/><strong>MIR</strong></div></section>
   <div className="sb2-toolbar ck-production-tools"><div className="ck-catalog-count"><strong>{songs.length}</strong>곡 · 미르의 음악</div><div>{store.canEdit&&<button type="button" className="ck-primary" onClick={()=>setFullEditing({})}><Plus size={17}/>노래 추가</button>}</div></div>
   {store.canDelete&&<div className="sb-delete-tools"><button type="button" onClick={()=>setTrashOpen(true)}><Trash2 size={16}/>삭제한 노래</button></div>}
   {deleteNotice&&<div className="section-wrap sb-delete-notice sb-auto-notice" role="status" {...deleteNoticeProps}><span>{deleteNotice}</span><button type="button" className="ck-text-button" aria-label="삭제 처리 알림 닫기" onClick={()=>setDeleteNotice('')}>닫기</button></div>}
   {store.autoError&&<p className="sb-auto-warning" role="status">{store.autoError}</p>}
   {store.error&&<div className="ck-error sb2-error" role="alert">{store.error}<button type="button" onClick={store.refresh}>다시 불러오기</button></div>}
   <section className="ck-library sb-library" id="check-library" aria-label="노래 찾기" aria-busy={!ready}>
    <div className="ck-request-tabs" aria-label="신청 상태"><button type="button" aria-pressed={!Object.hasOwn(STATUS,params.get('request'))} onClick={()=>update({request:'',song:''})}>전체 <small>{songs.length}</small></button>{Object.entries(STATUS).map(([value,label])=><button type="button" key={value} aria-pressed={params.get('request')===value} onClick={()=>update({request:value,song:''})}>{label}<small>{counts[value]}</small></button>)}</div>
    <div className="ck-search-sticky"><form className="ck-search" id="songbook-search" role="search" onSubmit={e=>{e.preventDefault();update({q:input.trim(),song:''});}}><Search size={22}/><input ref={searchRef} type="search" value={input} maxLength={150} aria-label="곡명, 가수, 초성 검색" placeholder="곡명, 가수, 초성으로 찾아보세요" onChange={e=>setInput(e.target.value)}/><button className="ck-primary" type="submit">검색</button></form></div>
    <div className="ck-category-chips" aria-label="카테고리 다중 선택"><button type="button" aria-pressed={!cats.length} onClick={()=>update({category:[]})}>모든 장르</button>{categories.map(c=><button type="button" key={c} aria-pressed={cats.includes(c)} onClick={()=>update({category:cats.includes(c)?cats.filter(x=>x!==c):[...cats,c],song:''})}>{c}</button>)}</div>
    <details className="ck-filters"><summary><SlidersHorizontal size={16}/>상세 조건<span>난이도 · 가수 · 목록</span></summary><div><label>참고 난이도<select aria-label="참고 난이도" value={params.get('difficulty')||''} onChange={e=>update({difficulty:e.target.value,song:''})}><option value="">전체</option>{[1,2,3,4,5].map(v=><option key={v} value={v}>{'★'.repeat(v)}</option>)}<option value="unset">미정</option></select></label><label>가수<select aria-label="가수 조건" value={params.get('artist')||''} onChange={e=>update({artist:e.target.value,song:''})}><option value="">전체 가수</option>{artists.map(a=><option key={a} value={a}>{a}</option>)}</select></label><label>목록 보기<select aria-label="목록 보기" value={params.get('view')||''} onChange={e=>update({view:e.target.value,song:''})}><option value="">전체 노래</option><option value="favorites">이 브라우저의 즐겨찾기</option><option value="videos">영상 있는 곡</option></select></label></div></details>
    {admin&&<section className="ck-admin" aria-label="관리자 보완 작업"><header><h2><Pencil size={16}/>관리자 보완 작업</h2><span>기존 관리자 권한으로 편집</span></header><div className="ck-admin-queue"><button type="button" aria-pressed={params.get('youtube')==='missing'&&!params.get('attention')} onClick={()=>update({youtube:'missing',soop:'',attention:'',song:''})}>YouTube 보완 <b>{songs.filter(s=>!videoPresence(s).youtube).length}</b></button>{[['status','상태 확인 필요',s=>s.requestStatus==='unreviewed'],['artist','가수 미입력',s=>!s.artist],['proficiency','숙련도 평가 전',s=>!s.proficiency]].map(([key,label,fn])=><button type="button" key={key} aria-pressed={params.get('attention')===key} onClick={()=>update({attention:key,youtube:'',soop:'',song:''})}>{label}<b>{songs.filter(fn).length}</b></button>)}</div><AdminVideoFilters params={params} onChange={update} disabled={!store.canEdit} partial={Boolean(store.autoError)}/></section>}
    {chips.length>0&&<div className="ck-active-filters" aria-label="적용 중인 조건">{chips.map(([key,text,value])=><button type="button" key={key+(value||'')} aria-label={`${text} 조건 해제`} onClick={()=>update({[key]:key==='category'?cats.filter(c=>c!==value):'',song:''})}>{text}<X size={13}/></button>)}<button type="button" className="ck-text-button" onClick={clearFilters}>모두 초기화</button></div>}
    <div className="ck-result-bar sb-result-bar"><p role="status">{ready?<><strong>{results.length}</strong>곡<span> · 전체 {songs.length}곡</span></>:'목록 준비 중…'}</p><div><button type="button" className="ck-text-button" aria-pressed={params.get('view')==='favorites'} onClick={()=>update({view:params.get('view')==='favorites'?'':'favorites',song:''})}><Heart size={15}/>즐겨찾기</button><select aria-label="정렬" value={params.get('sort')||''} onChange={e=>update({sort:e.target.value})}><option value="">제목순</option><option value="artist">가수순</option><option value="difficulty">난이도순</option></select>{<button type="button" className="ck-icon" aria-label="CSV" onClick={()=>download(csv(results),'text/csv;charset=utf-8','mir-songbook.csv')}><Download size={17}/></button>}<button type="button" className="ck-text-button" onClick={clearFilters}>초기화</button></div></div>
    <p className="ck-request-note">곡별 신청 상태 안내입니다. 실제 접수 여부는 방송에서 확인해 주세요. 복사만으로 신청이 접수되지는 않습니다.</p>
    <div className="ck-list-controls">
     {admin&&<section className="ck-bulk-toolbar" aria-label="신청 상태 일괄 변경">
      <label className="ck-select-page"><input ref={selectPageRef} type="checkbox" aria-label="이 페이지 전체 선택" checked={allSelected} disabled={!store.canEdit||store.saving||!page.items.length} onChange={e=>selectPage(e.target.checked)}/>이 페이지 선택</label>
      <span aria-live="polite">{chosen.length}곡 선택</span>
      <select aria-label="일괄 변경할 신청 상태" value={bulkStatus} disabled={!store.canEdit||store.saving} onChange={e=>setBulkStatus(e.target.value)}><option value="">변경할 상태</option>{Object.entries(STATUS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <button type="button" className="ck-primary" disabled={!store.canEdit||store.saving||!chosen.length||!bulkStatus} onClick={openBulk}>선택 곡 상태 변경</button>
      <button type="button" className="ck-text-button" disabled={!chosen.length||store.saving} onClick={()=>setSelection({})}>선택 해제</button>
      <small>현재 페이지에서 선택한 곡만 변경합니다. 페이지·검색 조건 변경 시 선택은 해제됩니다.</small>
     </section>}
     <div className="sg-display-controls"><SongbookViewSwitch value={layout} onChange={changeLayout}/><label className="ck-page-size">페이지당 곡 수<select aria-label="페이지당 곡 수" value={page.pageSize} onChange={e=>update({perPage:e.target.value,song:''})}>{songbookPageSizes(layout).map(size=><option key={size} value={size}>{size}곡씩</option>)}</select></label></div>
    </div>
    {layout==='list'&&<div className={`ck-list-heading ${admin?'ck-bulk-heading':''}`} aria-hidden="true">{admin&&<span>선택</span>}<span>곡 · 신청 안내</span><span>미르 숙련도 / 참고 난이도</span><span>신청 도구</span></div>}
    {layout==='cover'?<div className="sg-cover-grid" id="songbook-results" data-layout="cover">{ready&&page.items.map(song=><SongbookCoverCard key={song.id} song={song} open={()=>update({song:song.id},false)} favorite={favorites.includes(song.id)} onFavorite={()=>toggleFavorite(song)} admin={admin} checked={Object.hasOwn(selection,song.id)} onSelect={checked=>selectSong(song,checked)} disabled={!store.canEdit||store.saving} onEdit={()=>openEditor(song)}/>)}</div>:(
    <div className="ck-songs" id="songbook-results" data-layout="list">{ready&&page.items.map(song=><article className={`ck-song sb2-song ${admin?'ck-bulk-song':''} ${Object.hasOwn(selection,song.id)?'is-selected':''}`} key={song.id} data-song-id={song.id}>{admin&&<label className="ck-song-select"><input type="checkbox" aria-label={`${song.title} 선택`} checked={Object.hasOwn(selection,song.id)} disabled={!store.canEdit||store.saving} onChange={e=>selectSong(song,e.target.checked)}/><span>곡 선택</span></label>}<div className="ck-track"><SongCover song={song}/><div className="ck-track-copy"><div className="ck-title"><button type="button" className="sb2-title" aria-label={`${song.title} 상세 보기`} onClick={()=>update({song:song.id},false)}>{song.title}</button><StatusBadge value={song.requestStatus}/></div><p>{song.artist||'가수 미확인'}</p></div><div className="ck-category-video-row"><SongCategories song={song}/><VideoLinks song={song} compact/></div>{song.publicNote&&<p className="ck-song-note">{song.publicNote}</p>}</div><UsageRating song={song} store={store} rate={rate}/><div className="ck-song-actions"><button type="button" className="ck-copy" aria-label={`${song.title} 신청 문구 복사`} disabled={song.requestStatus==='unavailable'} title={song.requestStatus==='unavailable'?'신청 불가로 안내된 곡입니다.':undefined} onClick={()=>copySong(song)}><Copy size={15}/>{song.requestStatus==='unavailable'?'신청 불가':'신청 문구'}</button><button type="button" className="ck-icon" aria-label={`${song.title} 곡 링크 복사`} onClick={()=>shareSong(song)}><Link2 size={17}/></button><button type="button" className="ck-icon" aria-label={`${song.title} 즐겨찾기`} aria-pressed={favorites.includes(song.id)} onClick={()=>toggleFavorite(song)}><Heart size={18} fill={favorites.includes(song.id)?'currentColor':'none'}/></button>{admin&&<button type="button" className="ck-quick" aria-label={`${song.title} 빠른 수정`} disabled={!store.canEdit||store.saving} onClick={()=>openEditor(song)}><Pencil size={14}/>빠른 수정</button>}</div></article>)}</div>
    )}
    {ready&&!results.length&&<div className="ck-empty sb2-empty"><Search size={30}/><h2>조건에 맞는 노래가 없습니다.</h2><p>{admin?'검색어·카테고리·난이도·연결 영상 조건을 하나씩 해제하거나 초기화해 보세요.':'적용 중인 조건을 하나씩 해제하거나 전체 조건을 초기화해 보세요.'}</p><button type="button" onClick={clearFilters}>조건 초기화</button></div>}
    {ready&&<nav className="ck-pagination sb-pagination" aria-label="노래 목록 페이지"><button type="button" aria-label="이전 페이지" disabled={page.page===1} onClick={()=>update({page:String(page.page-1),song:''},false)}><ChevronLeft size={18}/></button><span>{page.page} / {page.pages}</span><button type="button" aria-label="다음 페이지" disabled={page.page===page.pages} onClick={()=>update({page:String(page.page+1),song:''},false)}><ChevronRight size={18}/></button></nav>}
   </section>
  </div>
  <TimelinePanel store={store}/>
  {notice&&<div className="ck-toast sb2-message" role="status" {...noticeProps}><span>{notice}</span><button type="button" className="ck-icon" aria-label="알림 닫기" onClick={()=>showNotice('')}><X size={17}/></button></div>}
  {selected&&!editing&&!fullEditing&&!deleting&&!trashOpen&&!manualCopy&&!bulkOpen&&<Dialog title={selected.title} close={()=>update({song:''},false)} production>
   <div className="ck-dialog-body"><div className="ck-detail-intro"><SongCover song={selected}/><div><p className="ck-detail-artist">{selected.artist||'가수 미확인'}</p>{selected.album&&<small>{selected.album}</small>}</div></div><StatusBadge value={selected.requestStatus}/>{selected.publicNote&&<p className="ck-public-note">{selected.publicNote}</p>}
    <div className="ck-detail-rating"><UsageRating song={selected} store={store} rate={rate}/><p className="ck-muted">숙련도는 미르님 기준의 평가이며, 난이도는 참고 정보입니다. 평가 전은 낮은 숙련도를 뜻하지 않습니다.</p></div>
    {store.canRate&&<button type="button" disabled={store.saving} onClick={()=>rate(selected.id,null)}>숙련도 평가 초기화</button>}
    <SongCategories song={selected}/><h3>연결 영상</h3><VideoLinks song={selected}/><TimelineHistory song={selected} client={store.client}/>
    {selected.aliases.length>0&&<p className="ck-muted">다른 표기: {selected.aliases.join(' · ')}</p>}
    <p className="ck-muted">실제 신청 접수 여부는 방송에서 확인해 주세요. 문구 복사만으로 신청이 접수되지는 않습니다.</p>
    {notice&&<p role="status" className="ck-inline-notice" {...noticeProps}>{notice}</p>}
   </div><footer><button type="button" onClick={()=>shareSong(selected)}><Link2 size={16}/>곡 링크 복사</button><button type="button" className="ck-primary" disabled={selected.requestStatus==='unavailable'} onClick={()=>copySong(selected)}><Copy size={16}/>{selected.requestStatus==='unavailable'?'신청 불가':'신청 문구 복사'}</button>
    {admin&&<><button type="button" disabled={!store.canEdit||store.saving} onClick={()=>openEditor(selected)}>빠른 수정</button><button type="button" disabled={!store.canEdit||store.saving} onClick={()=>setFullEditing(selected)}>곡 정보 편집</button><button type="button" className="sb-delete-button" disabled={!store.canDelete||store.saving} onClick={()=>setDeleting(selected)}>노래 삭제</button></>}
   </footer>
  </Dialog>}
  {bulkOpen&&admin&&<BulkStatusDialog targets={bulkOpen.targets} status={bulkOpen.status} store={store} close={()=>setBulkOpen(null)} done={bulkDone}/>}
  {editing&&admin&&<QuickEdit key={editing.id} production song={editing} close={()=>setEditing(null)} save={saveQuick} disabled={!store.canEdit||store.saving} notice={notice} noticeProps={noticeProps} hasNext={results.findIndex(s=>s.id===editing.id)<results.length-1}/>}
  {fullEditing&&admin&&<Editor key={fullEditing.id||'new'} Modal={Modal} StarPicker={StarPicker} platformSearch allowUnknownArtist song={fullEditing.id?fullEditing:null} store={store} categories={categories} close={()=>setFullEditing(null)} saved={id=>{setFullEditing(null);update({song:id},false);showNotice('노래책에 저장했습니다.');}}/>}
  {deleting&&admin&&<DeleteSongDialog Modal={Modal} song={deleting} store={store} close={()=>setDeleting(null)} deleted={deleted}/>}
  {trashOpen&&admin&&<DeletedSongsDialog Modal={Modal} store={store} close={()=>setTrashOpen(false)} restored={song=>setDeleteNotice(`「${song.title}」을 복원했습니다.`)}/>}
  {manualCopy&&<Dialog title="직접 복사" close={()=>setManualCopy(null)} production><div className="ck-dialog-body"><p>자동 복사를 사용할 수 없습니다. 아래 내용을 선택해 복사해 주세요.</p><textarea readOnly autoFocus rows={4} aria-label="직접 복사할 내용" value={manualCopy.text} onFocus={e=>e.target.select()}/><p className="ck-muted">{manualCopy.message}</p></div></Dialog>}
 </div>;
}
