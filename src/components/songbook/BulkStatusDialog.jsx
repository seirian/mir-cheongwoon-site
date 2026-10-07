import {useRef,useState} from 'react';
import {Dialog} from '../../songbook-check/Dialogs.jsx';
import {REQUEST_STATES} from '../../lib/songbookUsage.js';

export default function BulkStatusDialog({targets,status,store,close,done}) {
  const [busy,setBusy]=useState(false),[processed,setProcessed]=useState(0),[result,setResult]=useState(null),[error,setError]=useState('');
  const lock=useRef(false);
  async function apply() {
    if(lock.current||!store.canEdit||store.saving||result)return;
    lock.current=true;setBusy(true);setError('');
    try {
      const report=await store.saveRequestStatuses(targets,status,n=>setProcessed(n));
      setResult(report);done(report);
    } catch(e){setError(e.message||'일괄 변경을 시작하지 못했습니다.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <Dialog title="선택 곡 신청 상태 변경" production locked={busy} dirty={busy} close={close}>
    <div className="ck-dialog-body ck-bulk-confirm">
      <p><strong>{targets.length}곡</strong>의 신청 상태를 <strong>{REQUEST_STATES[status]}</strong>(으)로 변경합니다.</p>
      <p className="ck-muted">아래에서 확인한 곡만 처리합니다. 곡명·가수·카테고리·영상·난이도·숙련도는 변경하지 않습니다. 이미 같은 상태인 곡은 건너뜁니다.</p>
      <ul className="ck-bulk-targets" aria-label="변경 대상 곡">{targets.map(song=><li key={song.id}><strong>{song.title}</strong><span>{song.artist||'가수 미확인'}</span><small>{REQUEST_STATES[song.requestStatus]||REQUEST_STATES.unreviewed} → {REQUEST_STATES[status]}</small></li>)}</ul>
      {busy&&<p role="status">{processed} / {targets.length}곡 처리 중입니다. 창을 닫지 말아 주세요.</p>}
      {error&&<p className="ck-error" role="alert">{error}</p>}
      {result&&<div className={result.failed?'ck-error':'ck-inline-notice'} role={result.failed?'alert':'status'}><p>변경 완료 {result.updated}곡 · 같은 상태 {result.unchanged}곡 · 미처리/확인 필요 {result.failed}곡</p>{result.failed>0&&<><p>일부 항목을 저장하지 못했거나 결과를 확인하지 못했습니다. 완료된 곡은 유지됩니다. 창을 닫고 목록을 다시 불러온 뒤 나머지 곡을 확인해 주세요.</p><ul>{result.results.filter(r=>r.outcome==='failed').map(r=><li key={r.id}><strong>{r.title}</strong>: {r.message}</li>)}</ul></>}</div>}
    </div>
    <footer><button type="button" disabled={busy} onClick={close}>{result?'닫기':'취소'}</button>{!result&&<button type="button" className="ck-primary" disabled={busy||!store.canEdit||store.saving} onClick={apply}>{busy?'변경 중…':`${targets.length}곡 상태 변경하기`}</button>}</footer>
  </Dialog>;
}
