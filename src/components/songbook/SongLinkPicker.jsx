import {useId,useMemo,useRef,useState} from 'react';
import {Check,Plus,Search} from 'lucide-react';
import {findLinkSongs,LINK_RESULT_STEP} from '../../lib/songbookLinkSearch.js';
import '../../songbook-link-picker.css';

/** A permanently expanded result list replaces the old collapsed dropdown. */
export default function SongLinkPicker({songs,songId,onChange,initialQuery='',disabled=false}) {
 const id=useId(),input=useRef(null),list=useRef(null);
 const [query,setQuery]=useState(initialQuery),[limit,setLimit]=useState(LINK_RESULT_STEP);
 const results=useMemo(()=>findLinkSongs(songs,query),[songs,query]);
 const visible=results.slice(0,limit),selected=songs.find(s=>s.id===songId);
 function search(value){setQuery(value);setLimit(LINK_RESULT_STEP);onChange(null);}
 return <fieldset className="sb-link-picker" disabled={disabled}>
  <legend>노래 연결</legend>
  <label htmlFor={id}>기존 곡 찾기</label>
  <div className="sb-link-search"><Search size={18} aria-hidden="true"/><input id={id} ref={input} type="search" value={query} maxLength={200} autoComplete="off" placeholder="곡명·가수·별칭·초성으로 검색" aria-describedby={`${id}-help ${id}-count`} onChange={e=>search(e.target.value)} onKeyDown={e=>{
   if(e.nativeEvent.isComposing)return;
   if(e.key==='Enter')e.preventDefault();
   if(e.key==='ArrowDown'){e.preventDefault();list.current?.focus();}
  }}/></div>
  <p className="sb-note" id={`${id}-help`}>입력하면 아래 목록이 바로 바뀝니다. 연결할 곡을 한 번 눌러 선택하세요.</p>
  <p className="sb-link-count" id={`${id}-count`} role="status" aria-live="polite">{query.trim()?`검색 결과 ${results.length}곡`:`등록된 곡 ${results.length}곡`}{results.length>visible.length?` · ${visible.length}곡 표시`:''}</p>
  {results.length>0?<select className="sb-link-results" ref={list} aria-label="연결할 곡" size={Math.max(2,Math.min(6,visible.length+1))} value={visible.some(s=>s.id===songId)?songId:'__unselected'} onChange={e=>{if(visible.some(s=>s.id===e.target.value))onChange(e.target.value);}} onKeyDown={e=>{
   if(e.key==='Enter')e.preventDefault();
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();input.current?.focus();}
  }}>
   <option value="__unselected" disabled>아래 곡을 눌러 연결 대상으로 선택</option>
   {visible.map(s=><option key={s.id} value={s.id}>{s.title} — {s.artist}</option>)}
  </select>:<p className="sb-link-empty">일치하는 곡이 없습니다. 다른 표기나 가수명으로 찾아보거나 새 노래로 등록하세요.</p>}
  {results.length>visible.length&&<button type="button" className="sb-reset sb-link-more" onClick={()=>setLimit(n=>n+LINK_RESULT_STEP)}>검색 결과 더 보기 ({results.length-visible.length}곡 남음)</button>}
  <button type="button" className="sb-button sb-link-new" aria-pressed={songId===''} onClick={()=>onChange('')}><Plus size={18} aria-hidden="true"/>새 노래로 등록{songId===''&&<Check size={18} aria-hidden="true"/>}</button>
  <div className="sb-link-selection" role="status" aria-live="polite">{selected?<><Check size={17} aria-hidden="true"/><span>연결할 곡: <strong>{selected.title} — {selected.artist}</strong><small>아래 ‘가창 확인 후 반영’을 눌러야 저장됩니다.</small></span></>:songId===''?<span>새 노래 등록을 선택했습니다. 아래 곡명과 가수를 확인해 주세요.</span>:<span>기존 곡 또는 새 노래 등록을 선택해 주세요.</span>}</div>
 </fieldset>;
}
