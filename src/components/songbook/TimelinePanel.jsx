import {useCallback,useEffect,useRef,useState} from 'react';
import {reviewReasons,timeLabel,timelineUrl} from '../../lib/songbookTimeline';
import {reviewPage,reviewNotice,savedReviewView,saveReviewView,REVIEW_PAGE_SIZE} from '../../lib/songbookReviewState';
import {fetchReviewCandidates,reviewSearchQuery,REVIEW_SEARCH_MAX} from '../../lib/songbookReviewSearch.js';
import {Search} from 'lucide-react';
import {parsePlaybackPosition} from '../../lib/playbackPosition.js';
import {candidatePlaybackPosition} from '../../lib/candidatePlaybackPosition.js';
import CandidatePlaybackPosition from './CandidatePlaybackPosition.jsx';
import SongLinkPicker from './SongLinkPicker.jsx';
import {linkChoiceError} from '../../lib/songbookLinkSearch.js';
import {IS_REVIEW_PREVIEW} from '../../lib/preview';
import {VodLinks} from './SongMedia';
import '../../songbook-timeline.css';
import '../../songbook-review-feedback.css';
export function TimelineHistory({song,client}) {
 const [rows,setRows]=useState([]),[page,setPage]=useState(0),[open,setOpen]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setRows([]);setPage(0);setOpen(false);setError('');},[song.id]);
 useEffect(()=>{if(!open||!client||IS_REVIEW_PREVIEW)return;let active=true;
  client.from('songbook_auto_links').select('id,url,uploaded_at,seconds').eq('song_id',song.id).order('uploaded_at',{ascending:false}).order('seconds').range(page*20,page*20+19)
   .then(r=>{if(!active)return;if(r.error)setError('영상 목록을 불러오지 못했습니다.');else{setRows(r.data);setError('');}});
  return()=>{active=false;};},[open,page,song.id,client]);
 if(!song.autoVideoCount||IS_REVIEW_PREVIEW)return null;
 return <details className="sb-auto-history" onToggle={e=>setOpen(e.currentTarget.open)}><summary>방송 가창 영상 {song.autoVideoCount}개 더 보기</summary>
  <p className="sb-note">다시보기 댓글의 타임라인을 바탕으로 연결한 영상입니다. 시간에 약간의 오차가 있을 수 있습니다.</p>
  {error&&<p role="alert">{error}</p>}
  {rows.map(r=><div className="sb-auto-history-row" key={r.id}><span>{new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(new Date(r.uploaded_at))} · {timeLabel(r.seconds)}</span><VodLinks urls={[r.url]} title={song.title} detailed/></div>)}
  <div className="sb-actions"><button className="sb-button" type="button" disabled={page===0} onClick={()=>setPage(p=>p-1)}>이전 영상</button><span>{page+1} / {Math.max(1,Math.ceil(song.autoVideoCount/20))}</span><button className="sb-button" type="button" disabled={(page+1)*20>=song.autoVideoCount} onClick={()=>setPage(p=>p+1)}>다음 영상</button></div>
 </details>;
}
let viewStorage;try{viewStorage=window.sessionStorage;}catch{/* Browsers may disable storage. */}
export default function TimelinePanel({store}) {
 const [open,setOpen]=useState(false),[tab,setTab]=useState('pending'),[page,setPage]=useState(0);
 const [query,setQuery]=useState(''),[searchInput,setReviewInput]=useState('');
 const [rows,setRows]=useState([]),[count,setCount]=useState(0),[run,setRun]=useState(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const [selected,setSelected]=useState(null),[title,setTitle]=useState(''),[artist,setArtist]=useState(''),[songId,setSongId]=useState(null),[position,setPosition]=useState('');
 const request=useRef(0),lock=useRef(false),owner=useRef(null),mounted=useRef(true),currentUser=useRef(null);
 const userId=store.session?.user?.id||null;currentUser.current=userId;
 const canReview=Boolean(store.admin&&!store.authChecking);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++request.current;};},[]);
 useEffect(()=>{
  if(!canReview){if(!store.authChecking){++request.current;setRows([]);setSelected(null);setOpen(false);setQuery('');setReviewInput('');setNotice('');owner.current=null;}return;}
  if(owner.current!==userId){const view=savedReviewView(viewStorage,userId);owner.current=userId;setOpen(view.open);setTab(view.tab);setPage(view.page);setQuery(reviewSearchQuery(view.query));setReviewInput(reviewSearchQuery(view.query));setSelected(null);setNotice('');}
 },[canReview,store.authChecking,userId]);
 useEffect(()=>{if(owner.current===userId&&store.admin)saveReviewView(viewStorage,userId,{open,tab,page,query});},[open,tab,page,query,userId,store.admin]);
 const load=useCallback(async()=>{
  if(!open||!canReview||!store.client||IS_REVIEW_PREVIEW||lock.current)return;
  const generation=++request.current;setLoading(true);
  try {
   const [c,r]=await Promise.all([
    fetchReviewCandidates(store.client,{tab,page,query}),
    store.client.from('songbook_sync_runs').select('id,started_at,finished_at,status,stats').order('started_at',{ascending:false}).limit(1),
   ]);
   if(!mounted.current||generation!==request.current)return;
   if(c.error)throw Error(query?'검색 결과를 불러오지 못했습니다. 새로고침하거나 다시 검색해 주세요.':'목록을 새로 불러오지 못했습니다. 현재 화면을 유지합니다.');
   const total=c.count||0,next=reviewPage(page,total);setCount(total);
   if(next!==page){setPage(next);return;}
   setRows(c.data||[]);if(!r.error)setRun(r.data?.[0]||null);setError('');
  }catch(e){if(mounted.current&&generation===request.current)setError(e.message||'목록을 불러오지 못했습니다.');}
  finally{if(mounted.current&&generation===request.current)setLoading(false);}
 },[open,canReview,store.client,tab,page,query]);
 useEffect(()=>{load();return()=>{++request.current;};},[load]);
 useEffect(()=>{
  const check=()=>{if(document.visibilityState==='visible'&&!selected)load();};
  window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
  const timer=setInterval(check,30000);
  return()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
 },[load,selected]);
 if(IS_REVIEW_PREVIEW||!store.admin)return null;
 function applySearch(value){
  if(busy||!canReview)return;
  const next=reviewSearchQuery(value);setReviewInput(next);
  if(next===query&&page===0){void load();return;}
  ++request.current;setQuery(next);setPage(0);setSelected(null);setRows([]);setCount(0);setError('');setLoading(true);
 }
 function choose(c){setSelected(c);setTitle(c.title);setArtist(c.artist);setSongId(store.songs.some(s=>s.id===c.song_id)?c.song_id:null);setPosition(candidatePlaybackPosition(c).initialValue);setError('');}
 async function decide(c,decision){
  if(lock.current||!canReview)return;
  const parsedPosition=parsePlaybackPosition(position);
  if(decision==='approved'&&parsedPosition.error){setError(parsedPosition.error);return;}
  if(decision==='approved'){const selectionError=linkChoiceError(store.songs,songId);if(selectionError){setError(selectionError);return;}}
  lock.current=true;++request.current;setBusy(true);setLoading(false);setError('');const actingUser=userId;
  try {
   const {error:failed,data}=await store.client.functions.invoke('songbook-timeline-sync',{body:{action:'review',id:c.id,revision:c.revision,decision,...(decision==='approved'?{song_id:songId||undefined,title,artist,seconds:parsedPosition.seconds}:{})}});
   if(failed||data?.status!==decision)throw Error('저장하지 못했습니다. 권한 또는 다른 화면의 변경사항을 확인해 주세요. 항목은 삭제하지 않았습니다.');
   if(!mounted.current||actingUser!==currentUser.current)return;
   setSelected(null);setNotice(reviewNotice(c.title,decision));
   if(tab!==decision){setRows(old=>old.filter(row=>row.id!==c.id));setCount(old=>Math.max(0,old-1));}
   // Reconcile just this list. Never collapse or reload the entire document.
   lock.current=false;await load();void store.refresh();
  }catch(e){if(mounted.current&&actingUser===currentUser.current)setError(e.message);}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 return <details className="section-wrap sb-auto-admin" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary>자동 수집 확인 <small>관리자 전용</small></summary>
  <p className="sb-note">미르님의 가창 여부를 우선 확인합니다. 게임·소통·감상 기록과 이미 등록된 곡의 시간 없는 중복 목록은 자동 제외 기록으로 분리합니다. VOD를 새 탭에서 확인해도 이 화면은 유지됩니다.</p>
  {run&&<p className="sb-auto-state">최근 실행: {new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(run.started_at))} · {{running:'실행 중',success:'완료',partial:'일부 실패',failure:'실패',abandoned:'중단 후 재시도 대기'}[run.status]} · VOD {run.stats?.checked||0}개 · 새 곡 {run.stats?.new_songs||0}개</p>}
  <div className="sb-actions">{[['pending','확인 대기'],['auto','자동 반영'],['approved','확인 완료'],['rejected','제외한 항목'],['excluded','자동 제외 기록']].map(([v,t])=><button type="button" className="sb-button" key={v} disabled={busy||!canReview} aria-pressed={tab===v} onClick={()=>{if(tab===v)return;++request.current;setTab(v);setPage(0);setSelected(null);setRows([]);setCount(0);setError('');}}>{t}</button>)}<button type="button" className="sb-reset" disabled={busy||!canReview||loading} onClick={load}>새로고침</button></div>
  <form className="sb-auto-search" role="search" aria-label="자동 수집 확인 목록 검색" onSubmit={e=>{e.preventDefault();applySearch(searchInput);}}>
   <label htmlFor="sb-review-search"><Search size={18} aria-hidden="true"/><span className="sb-sr-only">자동 수집 확인 검색</span></label>
   <input id="sb-review-search" type="search" maxLength={REVIEW_SEARCH_MAX} value={searchInput} disabled={busy||!canReview} onChange={e=>setReviewInput(e.target.value)} placeholder="곡명·가수·타임라인 내용 검색" aria-describedby="sb-review-search-help"/>
   <button type="submit" className="sb-button sb-primary" disabled={busy||!canReview}>검색</button>
   {(query||searchInput)&&<button type="button" className="sb-button" disabled={busy||!canReview} onClick={()=>applySearch('')}>검색 초기화</button>}
  </form>
  <p className="sb-note" id="sb-review-search-help">현재 탭의 전체 항목에서 찾습니다. 곡명·가수·원문 내용·VOD 번호를 검색할 수 있고, 띄어 쓴 검색어는 모두 포함된 항목을 찾습니다.</p>
  {notice&&<div className="sb-auto-notice" role="status" aria-live="polite"><span>{notice}</span><button type="button" className="sb-reset" aria-label="처리 알림 닫기" onClick={()=>setNotice('')}>닫기</button></div>}
  {error&&<p className="sb-auto-warning" role="alert">{error}</p>}
  <p className="sb-auto-count" role="status">{query&&<>‘{query}’ 검색 결과 </>}{count}건{store.authChecking?' · 로그인 권한 확인 중':loading?' · 목록 갱신 중':''}</p>
  <div className="sb-auto-rows" aria-busy={loading}>
  {rows.map(c=><article className="sb-auto-candidate" key={c.id} data-candidate-id={c.id}><div><strong>{c.title||'곡명 확인 필요'}</strong><p>{c.artist||'가수 확인 필요'}</p><small>{reviewReasons[c.reason]||'관리자 확인'} · {timeLabel(c.approved_seconds??c.seconds)}</small></div>
   <div className="sb-actions"><a className="sb-button" href={timelineUrl(c.vod_id,c.approved_seconds??c.seconds)||undefined} target="_blank" rel="noopener noreferrer">VOD 확인 ↗</a><button type="button" className="sb-button" onClick={()=>choose(c)} disabled={busy||!canReview}>정보 확인·연결</button>{c.decision!=='rejected'&&<button type="button" className="sb-reset" onClick={()=>decide(c,'rejected')} disabled={busy||!canReview}>제외</button>}</div>
   {selected?.id===c.id&&<form className="sb2-form sb-auto-form" onSubmit={e=>{e.preventDefault();decide(selected,'approved');}}>
    <p className="sb-note">곡과 미르님 가창 여부를 영상을 통해 확인한 뒤 저장해 주세요. 기존 곡에 연결하면 제목·난이도·숙련도는 변경하지 않습니다.</p><blockquote>{c.line}</blockquote>
    <CandidatePlaybackPosition key={c.id} candidate={selected} value={position} onChange={setPosition} disabled={busy||!canReview}/>
    <SongLinkPicker key={`link-${c.id}`} songs={store.songs} songId={songId} initialQuery={c.title||''} onChange={id=>{setSongId(id);setError('');}} disabled={busy||!canReview}/>
    {songId===''&&<><label>곡명<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={150} required disabled={busy||!canReview}/></label><label>가수<input value={artist} onChange={e=>setArtist(e.target.value)} maxLength={150} required disabled={busy||!canReview}/></label><p className="sb-note">새 곡은 ‘기타’ 분류·신청 확인 전으로 추가됩니다. 등록 후 곡 정보에서 수정할 수 있습니다.</p></>}
    <div className="sb-actions"><button className="sb-button sb-primary" disabled={busy||!canReview}>가창 확인 후 반영</button><button type="button" className="sb-button" disabled={busy} onClick={()=>setSelected(null)}>취소</button></div>
   </form>}
  </article>)}
  {!loading&&!error&&!rows.length&&<p className="sb-note sb-auto-empty">{query?'검색 결과가 없습니다. 검색어를 바꾸거나 검색 초기화를 눌러 주세요.':'이 분류에서 확인할 항목이 없습니다.'}</p>}
  </div>
  <div className="sb-actions"><button type="button" className="sb-button" disabled={!page||busy||!canReview} onClick={()=>{setPage(p=>p-1);setSelected(null);}}>이전 항목</button><span data-testid="review-pagination">{page+1} / {Math.max(1,Math.ceil(count/REVIEW_PAGE_SIZE))}</span><button type="button" className="sb-button" disabled={(page+1)*REVIEW_PAGE_SIZE>=count||busy||!canReview} onClick={()=>{setPage(p=>p+1);setSelected(null);}}>다음 항목</button></div>
 </details>;
}
