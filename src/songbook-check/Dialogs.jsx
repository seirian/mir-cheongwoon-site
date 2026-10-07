import {useEffect,useId,useRef,useState} from 'react';
import {X,Plus,Trash2,Link2,Check,ArrowRight,Copy} from 'lucide-react';
import {vodInfo,vodLinks} from '../lib/songbookMedia.js';
import {REQUEST_STATES as STATUS,VIDEO_KINDS,firstYoutube as representative} from '../lib/songbookUsage.js';
import {validateQuickEdit as validateEdit} from '../lib/songbookUsability.js';
import SongCategories from './SongCategories.jsx';
import {VideoMark} from '../components/songbook/SongMedia.jsx';

export function Dialog({title,close,dirty=false,children,wide=false,footer,locked=false,production=false}) {
 const ref=useRef(null),id=useId();const [confirm,setConfirm]=useState(false);
 const requestClose=()=>{if(!locked){if(dirty)setConfirm(true);else close();}};
 useEffect(()=>{const prior=document.activeElement,el=ref.current,overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;if(prior?.isConnected)prior.focus();};},[]);
 useEffect(()=>{if(!dirty)return;const leave=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[dirty]);
 return <dialog ref={ref} aria-labelledby={id} className={`ck-dialog ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();requestClose();}} onClick={e=>{if(e.target===e.currentTarget)requestClose();}}>
  <header><div><span className="ck-eyebrow">MIR’S SONGBOOK</span><h2 id={id}>{title}</h2></div><button type="button" className="ck-icon" aria-label="창 닫기" disabled={locked} onClick={requestClose}><X size={22}/></button></header>
  {confirm?<div className="ck-discard" role="alert"><h3>저장하지 않은 변경사항이 있습니다.</h3><p>{production?'이 창의 변경만 버릴까요? 이전에 저장한 내용은 유지됩니다.':'이 창의 변경만 버릴까요? 이전에 저장한 검토 내용은 유지됩니다.'}</p><div className="ck-actions"><button type="button" className="ck-primary" onClick={()=>setConfirm(false)} autoFocus>계속 편집</button><button type="button" onClick={close}>변경 버리고 닫기</button></div></div>:<>{children}{footer?.(requestClose)}</>}
 </dialog>;
}
export function StatusBadge({value}) {return <span className={`ck-status ${value}`}>{value==='available'?<Check size={12}/>:<span aria-hidden="true">{value==='unavailable'?'−':'·'}</span>}{STATUS[value]||STATUS.unreviewed}</span>;}
export function Rating({song}) {return <div className="ck-rating"><span>미르 숙련도</span><strong>{song.proficiency?<><span className="ck-stars" aria-label={`미르 숙련도 ${song.proficiency}점`}>{'★'.repeat(song.proficiency)}<span>{'☆'.repeat(5-song.proficiency)}</span></span><small>{song.proficiency}/5</small></>:'평가 전'}</strong><small>참고 난이도 {song.difficulty?'★'.repeat(song.difficulty):'미정'}</small></div>;}
export function VideoLinks({song,compact=false}) {
 const links=vodLinks(song.videoUrls);
 const shown=compact?links.slice(0,2):links;
 return <div className={`ck-videos ${compact?'compact':''}`}>
  {shown.map(v=><a className={`ck-video sb3-vod is-${v.platform}`} key={v.url} href={v.url} target="_blank" rel="noopener noreferrer" title={`${song.title} · ${v.label}${v.total>1?' '+v.number:''} 새 탭에서 보기`} aria-label={`${song.title} ${v.label}${v.total>1?' '+v.number:''} 새 탭에서 보기`}>
   <VideoMark platform={v.platform}/><span>{v.platform==='youtube'?'YouTube':'SOOP'}</span>{v.total>1&&<small>{v.number}</small>}{!compact&&song.videoKinds?.[v.url]&&<small>{VIDEO_KINDS[song.videoKinds[v.url]]}</small>}
  </a>)}
  {!links.length&&<small className="ck-muted">연결 영상 없음</small>}
  {compact&&links.length>shown.length&&<span className="ck-more-videos" title="곡명을 누르면 모든 연결 영상을 확인할 수 있습니다." aria-label={`연결 영상 ${links.length-shown.length}개 더 있음`}>+{links.length-shown.length}</span>}
 </div>;
}
export function QuickEdit({song,close,save,hasNext=false,notice,noticeProps={},production=false,disabled=false}) {
 const [draft,setDraft]=useState(()=>({...song,videoUrls:[...song.videoUrls],videoKinds:{...song.videoKinds}}));
 const [url,setUrl]=useState(''),[kind,setKind]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const rep=representative(draft);
 const dirty=JSON.stringify(draft)!==JSON.stringify(song)||Boolean(url);
 const change=patch=>{setDraft(d=>({...d,...patch}));setError('');};
 function append(){const info=vodInfo(url.trim());if(!info){setError('YouTube 또는 SOOP의 개별 영상 주소를 입력해 주세요. 채널 주소는 사용할 수 없습니다.');return;}
  if(draft.videoUrls.includes(info.url)){setError('이미 연결된 영상입니다. 아래 목록에서 영상 용도를 확인해 주세요.');return;}
  if(draft.videoUrls.length>=(production?10:20)){setError(production?'직접 연결하는 영상은 10개까지 추가할 수 있습니다. 자동 수집 영상은 별도 관리됩니다.':'검토용 연결 영상은 20개까지 추가할 수 있습니다.');return;}
  change({videoUrls:[...draft.videoUrls,info.url],videoKinds:{...draft.videoKinds,[info.url]:kind}});setUrl('');setKind('');
 }
 async function commit(next){if(busy||disabled)return;if(url.trim()){setError('입력 중인 주소의 ‘영상 연결’을 먼저 누르거나 주소 입력칸을 비워 주세요.');return;}
  try{const valid=validateEdit(song,draft,{maxLinks:production?10:20});setBusy(true);await save(valid,next);}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <Dialog title="빠른 수정" close={close} dirty={dirty} production={production} locked={busy} footer={requestClose=><footer><button type="button" onClick={requestClose} disabled={busy||disabled}>취소</button><button type="button" disabled={busy||disabled} onClick={()=>commit(false)}>저장</button><button type="button" className="ck-primary" disabled={busy||disabled} onClick={()=>commit(true)}>{hasNext?'저장 후 다음 곡':'저장 후 닫기'}<ArrowRight size={16}/></button></footer>}>
  <div className="ck-dialog-body"><fieldset className="ck-editor ck-quick-fields" disabled={busy||disabled}>
   <div className="ck-editor-song"><strong>{song.title}</strong><span>{song.artist||'가수 미확인'}</span><SongCategories song={song}/><small>{production?'저장하면 실제 노래책에 반영됩니다.':'검토용 브라우저 저장 · 운영 목록은 변경되지 않습니다.'}</small></div>
   {notice&&<p className="ck-inline-notice" role="status" {...noticeProps}>{notice}</p>}
   <label>신청 가능 상태<select aria-label="신청 가능 상태" value={draft.requestStatus} onChange={e=>change({requestStatus:e.target.value})}>{Object.entries(STATUS).map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></label>
   <label>가수명 <small>모르면 공란 유지</small><input value={draft.artist} maxLength={200} onChange={e=>change({artist:e.target.value})}/></label>
   <label>시청자에게 보여줄 안내 <small>{draft.publicNote.length}/140 · 개인 메모는 입력하지 마세요</small><textarea rows={2} value={draft.publicNote} maxLength={140} placeholder="예: 듀엣 시 가능, 낮춘 키로 진행" onChange={e=>change({publicNote:e.target.value})}/></label>
   <section className="ck-add-video"><h3>영상 링크 추가</h3><label>영상 주소<input type="url" value={url} placeholder="YouTube 또는 SOOP 영상 주소" onChange={e=>{setUrl(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();append();}}}/></label><div className="ck-add-controls"><label>영상 용도<select aria-label="영상 용도" value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(VIDEO_KINDS).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><button type="button" onClick={append}><Plus size={16}/>영상 연결</button></div></section>
   <fieldset className="ck-representatives"><legend>연결 영상 · YouTube 먼저</legend><p>YouTube 링크를 먼저, SOOP 링크를 다음에 표시합니다. 같은 플랫폼에서는 기존 연결 순서를 유지하며 영상 용도는 직접 지정합니다.</p>
    <p className="ck-auto-representative" role="status">{rep?'YouTube 1 · 첫 번째 링크':'YouTube 링크 없음 · SOOP 연결은 그대로 유지됩니다.'}</p>
    {vodLinks(draft.videoUrls).map((video,i)=><div className="ck-video-edit" key={video.url} data-representative={rep?.url===video.url?'true':'false'}>
     <div className="ck-video-heading">{video.platform==='youtube'?'YouTube':'SOOP'} {video.number}</div>
     <a href={video.url} target="_blank" rel="noopener noreferrer" className="ck-url">{video.url}</a>
     <div className="ck-video-edit-actions"><select aria-label={`연결 영상 ${i+1} 용도`} value={draft.videoKinds[video.url]||''} onChange={e=>change({videoKinds:{...draft.videoKinds,[video.url]:e.target.value}})}>{Object.entries(VIDEO_KINDS).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select><button type="button" aria-label={`연결 영상 ${i+1} 제거`} onClick={()=>change({videoUrls:draft.videoUrls.filter(x=>x!==video.url)})}><Trash2 size={15}/>연결 제거</button></div>
    </div>)}
    {!draft.videoUrls.length&&<p>연결 영상을 먼저 추가해 주세요.</p>}
   </fieldset>
   <p className="ck-muted">빠른 수정은 신청 상태·가수·공개 안내·영상만 바꿉니다. 기존 난이도와 미르 숙련도는 그대로 유지합니다.</p>
   {production&&song.automaticVideoUrls?.length>0&&<section className="ck-automatic-links"><h3>자동 수집으로 연결된 영상</h3><p className="ck-muted">가창 기록은 아래 ‘자동 수집 확인’에서 관리합니다. 빠른 수정으로 수동 링크에 복제하거나 제거하지 않습니다.</p><VideoLinks song={{...song,videoUrls:song.automaticVideoUrls}}/></section>}
   {error&&<p className="ck-error" role="alert">{error}</p>}
  </fieldset></div>

 </Dialog>;
}
export function SongDetail({song,close,copy,share,admin,edit,notice,noticeProps}) {return <Dialog title={song.title} close={close}>
 <div className="ck-dialog-body">{notice&&<p className="ck-inline-notice" role="status" {...noticeProps}>{notice}</p>}<p className="ck-detail-artist">{song.artist||'가수 미확인'}</p><StatusBadge value={song.requestStatus}/>{song.publicNote&&<p className="ck-public-note">{song.publicNote}</p>}<div className="ck-detail-rating"><Rating song={song}/><p className="ck-muted">숙련도는 미르님 기준의 평가, 난이도는 참고 정보입니다. 평가 전은 낮은 숙련도를 뜻하지 않습니다.</p></div><SongCategories song={song}/><h3>연결 영상</h3><VideoLinks song={song}/><p className="ck-muted">영상 링크는 새 탭에서 열립니다. 샘플 목록의 영상은 UI 확인용이며 미르님의 가창을 의미하지 않습니다.</p></div>
 <footer><button type="button" onClick={()=>share(song)}><Link2 size={16}/>곡 링크 복사</button>{admin&&<button type="button" onClick={edit}>빠른 수정</button>}<button type="button" className="ck-primary" disabled={song.requestStatus==='unavailable'} onClick={()=>copy(song)}><Copy size={16}/>{song.requestStatus==='unavailable'?'신청 불가':'신청 문구 복사'}</button></footer>
 </Dialog>;}
export function Guide({close}) {return <Dialog title="사용성 3차 검토 안내" close={close} wide><div className="ck-dialog-body ck-guide">
 <p><b>시청자 화면</b>으로 탐색하고, <b>관리자 체험</b>으로 바꿔 보완 작업을 확인해 보세요. 이 전환은 검토용 화면 선택이며 실제 관리자 권한을 부여하지 않습니다.</p>
 {[['01','신청할 곡을 바로 판단','곡마다 신청 가능·확인 필요·신청 불가를 표시합니다. 확인 필요인 곡은 미확인 상태로 그대로 남겼습니다. 오늘 방송의 접수 여부와는 다른 정보입니다.'],['02','목록에서 바로 복사','신청 문구는 “가수 - 곡명”입니다. 직접 접수나 SOOP 채팅 전송은 하지 않습니다. 곡 링크는 관리자 조건 없이 이 검토 페이지의 해당 곡을 엽니다. 브라우저에서 바꾼 내용은 다른 사람에게 전달되지 않습니다.'],['03','검색 중심의 화면','소개를 줄이고 상세 필터는 접었습니다. 선택한 조건은 따로 표시하며 각각 해제할 수 있습니다. 곡별 카테고리는 목록·상세·빠른 수정에서 모두 표시합니다. 모바일에서도 모든 카테고리를 줄바꿈해 보여주고 복사·영상·즐겨찾기를 누를 수 있습니다.'],['04','카테고리 옆 영상 버튼','곡별 카테고리 오른쪽에 YouTube·SOOP 영상 버튼을 같은 줄로 표시합니다. 대표 영상 문구·별표·우측 화살표는 표시하지 않으며 기존 플랫폼 아이콘과 번호로 구분합니다. 첫 번째 YouTube 링크 우선 규칙과 영상 주소·시작 시간은 유지합니다. 추가 영상은 곡 상세에서 모두 확인할 수 있습니다.'],['05','관리자 빠른 보완','YouTube 없음·가수 미입력 등의 작업 목록에서 신청 상태·가수·공개 안내·영상만 수정합니다. 저장 후 다음 곡으로 이어갈 수 있고 미저장 변경을 버리기 전 확인합니다.']].map(([n,title,text])=><section key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></section>)}
 <p className="ck-error">검토 페이지는 운영 목록의 읽기 전용 사본을 사용합니다. 저장은 이 브라우저에만 남으며 운영 반영·신청 접수·자동 수집 승인·삭제는 하지 않습니다. 샘플 곡의 상태·별점·영상은 기능 확인용입니다.</p><p>기존 운영의 노래 추가, 전체 정보 편집, 자동 수집 확인, 삭제·복원은 이 검토 페이지에서 다시 구현하지 않았습니다. 실제 도입 시 기존 기능에 통합하는 범위는 검토 후 정합니다.</p>
 </div></Dialog>;}
