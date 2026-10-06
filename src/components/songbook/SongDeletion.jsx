import {useCallback,useEffect,useRef,useState} from 'react';
import {Trash2,RotateCcw} from 'lucide-react';
import '../../songbook-deletion.css';

export function DeleteSongDialog({Modal,song,store,close,deleted}) {
 const [error,setError]=useState(''),[pending,setPending]=useState(false);const lock=useRef(false);
 async function remove(){
  if(lock.current||!store.canDelete)return;
  lock.current=true;setPending(true);setError('');
  try{await store.deleteSong(song.id);deleted(song);}
  catch(e){setError(e.message);}
  finally{lock.current=false;setPending(false);}
 }
 return <Modal title="노래 삭제 확인" close={()=>{if(!lock.current)close();}} className="sb-delete-dialog">
  <p className="sb-delete-title"><strong>{song.title}</strong><span>{song.artist||'가수 미확인'}</span></p>
  <p>이 곡을 노래책에서 삭제할까요?</p>
  <p className="sb-note">목록·검색·CSV와 연결 영상에서 제외되며, 자동 수집으로 다시 표시되지 않습니다. 곡 정보·숙련도·가창 기록은 보관되어 ‘삭제한 노래’에서 복원할 수 있습니다.</p>
  {error&&<p role="alert" className="sb2-error">{error}</p>}
  <div className="sb-actions"><button type="button" autoFocus className="sb-button" disabled={pending} onClick={close}>취소</button><button type="button" className="sb-button sb-delete-button" disabled={pending||store.saving||!store.canDelete} onClick={remove}><Trash2 size={16}/>{pending?'삭제 중…':'삭제하기'}</button></div>
 </Modal>;
}

export function DeletedSongsDialog({Modal,store,close,restored}) {
 const [page,setPage]=useState(0),[rows,setRows]=useState([]),[count,setCount]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const generation=useRef(0),lock=useRef(false);
 const load=useCallback(async()=>{
  if(!store.canDelete||lock.current)return;
  const request=++generation.current;setLoading(true);
  try{
   const data=await store.client.rpc('songbook_deleted_list',{p_page:page},{get:true});
   if(request!==generation.current)return;
   if(data.error||!Array.isArray(data.data?.rows)||!Number.isSafeInteger(data.data?.count))throw Error('삭제 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
   const last=Math.max(0,Math.ceil(data.data.count/20)-1);setCount(data.data.count);
   if(page>last){setPage(last);return;}
   setRows(data.data.rows);setError('');
  }catch(e){if(request===generation.current)setError(e.message);}
  finally{if(request===generation.current)setLoading(false);}
 },[store.canDelete,store.client,page]);
 useEffect(()=>{void load();return()=>{++generation.current;};},[load]);
 async function restore(row){
  if(lock.current||!store.canDelete)return;
  lock.current=true;++generation.current;setBusy(true);setError('');
  try{
   await store.restoreSong(row);setRows(old=>old.filter(x=>x.song_id!==row.song_id));setNotice(`「${row.title}」을 복원했습니다.`);restored(row);
   lock.current=false;await load();
  }catch(e){setError(e.message);}
  finally{lock.current=false;setBusy(false);}
 }
 return <Modal title="삭제한 노래" close={()=>{if(!lock.current)close();}} className="sb-delete-dialog">
  <p className="sb-note">삭제한 곡을 복원하면 보관된 곡 정보와 숙련도·영상 연결을 다시 사용할 수 있습니다.</p>
  {notice&&<p role="status" className="sb-delete-notice">{notice}</p>}{error&&<p role="alert" className="sb2-error">{error}</p>}
  <div aria-busy={loading}>{rows.map(row=><article key={row.song_id} className="sb-deleted-row"><div><strong>{row.title}</strong><p>{row.artist||'가수 미확인'}</p></div><button className="sb-button" type="button" disabled={busy||!store.canDelete} onClick={()=>restore(row)} aria-label={`${row.title} 복원`}><RotateCcw size={15}/>복원</button></article>)}</div>
  {!loading&&!error&&!rows.length&&<p>삭제한 노래가 없습니다.</p>}
  <div className="sb-actions"><button className="sb-button" type="button" disabled={!page||busy||loading} onClick={()=>setPage(p=>p-1)}>이전</button><span>{page+1} / {Math.max(1,Math.ceil(count/20))}</span><button className="sb-button" type="button" disabled={(page+1)*20>=count||busy||loading} onClick={()=>setPage(p=>p+1)}>다음</button><button className="sb-reset" type="button" disabled={busy||loading} onClick={load}>새로고침</button></div>
 </Modal>;
}
