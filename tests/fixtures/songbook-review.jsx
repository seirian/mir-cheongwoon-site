// Test-only in-memory component fixture. No authentication, API keys or real writes.
import React,{useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import TimelinePanel from '../../src/components/songbook/TimelinePanel.jsx';
import '../../src/styles.css';
import '../../src/songbook.css';
import '../../src/songbook-v2.css';
window.reviewRequests=[];
function Fixture(){
 const [admin,setAdmin]=useState(true),[checking,setChecking]=useState(false);
 const rows=useRef(Array.from({length:17},(_,i)=>({id:String(i+1),vod_id:'208123456',seconds:120+i,approved_seconds:null,title:`미르 확인곡 ${String(i+1).padStart(2,'0')}`,artist:'테스트 가수',reason:i===1?'section_timestamp_only':'artist_metadata_required',line:'가창 여부를 확인하는 테스트 기록',revision:1,song_id:null,decision:'pending',present:true})));
 const failure=useRef(false),saved=useRef(0);
 const client=useMemo(()=>({
  from(name){const filter={},query={select(){return query;},eq(k,v){filter[k]=v;return query;},order(){return query;},limit(){return query;},range(a,b){filter.from=a;filter.to=b;return query;},then(resolve){
   let data=[],count=0;
   if(name==='songbook_timeline_candidates'){const all=rows.current.filter(c=>c.decision===filter.decision);count=all.length;data=all.slice(filter.from,filter.to+1).map(c=>({...c}));}
   if(name==='songbook_sync_runs')data=[{id:'run',started_at:'2026-10-04T00:00:00Z',status:'success',stats:{checked:1}}];
   return new Promise(r=>setTimeout(()=>r({data,count,error:null}),80)).then(resolve);
  }};return query;},
  functions:{async invoke(_name,{body}){window.reviewRequests.push({...body});await new Promise(r=>setTimeout(r,100));if(failure.current){failure.current=false;return{error:new Error('fixture conflict')};}
   const c=rows.current.find(r=>r.id===body.id);if(!c||c.revision!==body.revision)return{error:new Error('fixture conflict')};
   if(body.decision==='approved'){if(!Number.isInteger(body.seconds)||body.seconds<0||body.seconds>172800)throw Error('invalid position');c.approved_seconds=body.seconds;}
   c.decision=body.decision;c.revision++;saved.current++;return{data:{status:body.decision},error:null};}}
 }),[]);
 return <><header className="fixture-controls"><button onClick={()=>setChecking(true)}>권한 재확인 시작</button><button onClick={()=>setChecking(false)}>권한 재확인 완료</button><button onClick={()=>setAdmin(false)}>권한 회수</button><button onClick={()=>setAdmin(true)}>권한 복원</button><button onClick={()=>{failure.current=true;}}>다음 저장 실패</button><button onClick={()=>{const c=rows.current.find(c=>c.decision==='pending');if(c){c.decision='rejected';c.revision++;}}}>다른 창에서 제외</button><button onClick={()=>window.dispatchEvent(new Event('focus'))}>화면 복귀</button></header><div className="fixture-spacer">미르 노래책 · 자동 수집 확인 회귀 검사</div><TimelinePanel store={{admin,authChecking:checking,session:{user:{id:'offline-fixture'}},client,songs:[],refresh:async()=>{}}}/></>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
