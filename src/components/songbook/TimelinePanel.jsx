import {useEffect,useState} from 'react';
import {reviewReasons,timeLabel,timelineUrl} from '../../lib/songbookTimeline';
import {IS_REVIEW_PREVIEW} from '../../lib/preview';
import {VodLinks} from './SongMedia';
import '../../songbook-timeline.css';
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
export default function TimelinePanel({store}) {
 const [open,setOpen]=useState(false),[tab,setTab]=useState('pending'),[page,setPage]=useState(0),[rows,setRows]=useState([]),[count,setCount]=useState(0),[run,setRun]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(null),[title,setTitle]=useState(''),[artist,setArtist]=useState(''),[songId,setSongId]=useState(''),[search,setSearch]=useState(''),[seconds,setSeconds]=useState(''),[generation,setGeneration]=useState(0);
 useEffect(()=>{if(!store.admin){setOpen(false);setRows([]);setSelected(null);}},[store.admin]);
 useEffect(()=>{if(!open||!store.admin||!store.client||IS_REVIEW_PREVIEW)return;let active=true;
  Promise.all([store.client.from('songbook_timeline_candidates').select('id,vod_id,seconds,approved_seconds,title,artist,reason,line,revision,song_id,decision',{count:'exact'}).eq('present',true).eq('decision',tab).order('first_seen_at',{ascending:false}).range(page*8,page*8+7),store.client.from('songbook_sync_runs').select('id,started_at,finished_at,status,stats').order('started_at',{ascending:false}).limit(1)])
  .then(([c,r])=>{if(!active)return;if(c.error||r.error){setError('자동 수집 현황을 불러오지 못했습니다.');return;}setRows(c.data);setCount(c.count||0);setRun(r.data[0]||null);setError('');});
  return()=>{active=false;};},[store.admin,store.client,open,tab,page,generation]);
 if(IS_REVIEW_PREVIEW||!store.admin)return null;
 function choose(c){setSelected(c);setTitle(c.title);setArtist(c.artist);setSongId(c.song_id||'');setSearch('');setSeconds(c.reason==='section_timestamp_only'&&c.approved_seconds==null?'':String(c.approved_seconds??c.seconds));setError('');}
 async function decide(c,decision){if(busy)return;setBusy(true);setError('');
  try{const {error,data}=await store.client.functions.invoke('songbook-timeline-sync',{body:{action:'review',id:c.id,revision:c.revision,decision,...(decision==='approved'?{song_id:songId||undefined,title,artist,seconds:Number(seconds)}:{})}});
   if(error||!data?.status)throw Error('저장하지 못했습니다. 권한 또는 다른 화면의 변경사항을 확인하고 새로고침해 주세요.');setSelected(null);setGeneration(n=>n+1);await store.refresh();
  }catch(e){setError(e.message);}finally{setBusy(false);}}
 const options=store.songs.filter(s=>!search||`${s.title} ${s.artist}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0,40);
 return <details className="section-wrap sb-auto-admin" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>자동 수집 확인 <small>관리자 전용</small></summary>
  <p className="sb-note">게시 후 7일이 지난 다시보기를 확인합니다. 가창자·곡명·부분 가창 여부가 애매한 항목은 아래에서 확인한 뒤 반영할 수 있습니다.</p>
  {run&&<p className="sb-auto-state">최근 실행: {new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(run.started_at))} · {{running:'실행 중',success:'완료',partial:'일부 실패',failure:'실패',abandoned:'중단 후 재시도 대기'}[run.status]} · VOD {run.stats?.checked||0}개 · 새 곡 {run.stats?.new_songs||0}개</p>}
  <div className="sb-actions">{[['pending','확인 대기'],['auto','자동 반영'],['approved','확인 완료'],['rejected','제외한 항목']].map(([v,t])=><button type="button" className="sb-button" key={v} aria-pressed={tab===v} onClick={()=>{setTab(v);setPage(0);setSelected(null);}}>{t}</button>)}<button type="button" className="sb-reset" onClick={()=>setGeneration(n=>n+1)}>새로고침</button></div>
  {error&&<p role="alert">{error}</p>}<p role="status">{count}건</p>
  {rows.map(c=><article className="sb-auto-candidate" key={c.id}><div><strong>{c.title||'곡명 확인 필요'}</strong><p>{c.artist||'가수 확인 필요'}</p><small>{reviewReasons[c.reason]||'관리자 확인'} · {timeLabel(c.approved_seconds??c.seconds)}</small></div>
   <div className="sb-actions"><a className="sb-button" href={timelineUrl(c.vod_id,c.approved_seconds??c.seconds)||undefined} target="_blank" rel="noopener noreferrer">VOD 확인 ↗</a><button type="button" className="sb-button" onClick={()=>choose(c)} disabled={busy}>정보 확인·연결</button>{c.decision!=='rejected'&&<button type="button" className="sb-reset" onClick={()=>decide(c,'rejected')} disabled={busy}>제외</button>}</div>
   {selected?.id===c.id&&<form className="sb2-form sb-auto-form" onSubmit={e=>{e.preventDefault();decide(c,'approved');}}>
    <p className="sb-note">곡과 미르님 가창 여부를 영상을 통해 확인한 뒤 저장해 주세요. 기존 곡에 연결하면 제목·난이도·숙련도는 변경하지 않습니다.</p><blockquote>{c.line}</blockquote>
    <label>확인한 가창 시작 시간 · 초<input type="number" min="0" max="172800" step="1" required value={seconds} onChange={e=>setSeconds(e.target.value)}/></label><p className="sb-note">곡별 시간이 없는 구간 목록은 영상을 보고 정확한 시작 시간을 입력해야 반영됩니다.</p>
    <label>기존 곡 찾기<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="곡명 또는 가수"/></label>
    <label>연결할 곡<select value={songId} onChange={e=>setSongId(e.target.value)}><option value="">새 노래로 등록</option>{songId&&!options.some(s=>s.id===songId)&&store.songs.filter(s=>s.id===songId).map(s=><option key={s.id} value={s.id}>{s.title} — {s.artist}</option>)}{options.map(s=><option key={s.id} value={s.id}>{s.title} — {s.artist}</option>)}</select></label>
    {!songId&&<><label>곡명<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={150} required/></label><label>가수<input value={artist} onChange={e=>setArtist(e.target.value)} maxLength={150} required/></label><p className="sb-note">새 곡은 ‘기타’ 분류·신청 확인 전으로 추가됩니다. 등록 후 곡 정보에서 수정할 수 있습니다.</p></>}
    <div className="sb-actions"><button className="sb-button sb-primary" disabled={busy}>가창 확인 후 반영</button><button type="button" className="sb-button" onClick={()=>setSelected(null)}>취소</button></div>
   </form>}
  </article>)}
  <div className="sb-actions"><button type="button" className="sb-button" disabled={!page} onClick={()=>{setPage(p=>p-1);setSelected(null);}}>이전 항목</button><span>{page+1} / {Math.max(1,Math.ceil(count/8))}</span><button type="button" className="sb-button" disabled={(page+1)*8>=count} onClick={()=>{setPage(p=>p+1);setSelected(null);}}>다음 항목</button></div>
 </details>;
}
