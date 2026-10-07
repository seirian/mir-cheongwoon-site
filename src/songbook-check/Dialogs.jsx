import {useEffect,useId,useRef,useState} from 'react';
import {X,Plus,Trash2,ExternalLink,Star,Check,ArrowRight,Copy} from 'lucide-react';
import {vodInfo,vodLinks} from '../lib/songbookMedia.js';
import {STATUS,VIDEO_KINDS,validateEdit,representative} from './model.js';

export function Dialog({title,close,dirty=false,children,wide=false,footer}) {
 const ref=useRef(null),id=useId();const [confirm,setConfirm]=useState(false);
 const requestClose=()=>dirty?setConfirm(true):close();
 useEffect(()=>{const prior=document.activeElement,el=ref.current,overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;if(prior?.isConnected)prior.focus();};},[]);
 useEffect(()=>{if(!dirty)return;const leave=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[dirty]);
 return <dialog ref={ref} aria-labelledby={id} className={`ck-dialog ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();requestClose();}} onClick={e=>{if(e.target===e.currentTarget)requestClose();}}>
  <header><div><span className="ck-eyebrow">MIR’S SONGBOOK</span><h2 id={id}>{title}</h2></div><button type="button" className="ck-icon" aria-label="창 닫기" onClick={requestClose}><X size={22}/></button></header>
  {confirm?<div className="ck-discard" role="alert"><h3>저장하지 않은 변경사항이 있습니다.</h3><p>이 창의 변경만 버릴까요? 이전에 저장한 검토 내용은 유지됩니다.</p><div className="ck-actions"><button type="button" className="ck-primary" onClick={()=>setConfirm(false)} autoFocus>계속 편집</button><button type="button" onClick={close}>변경 버리고 닫기</button></div></div>:<>{children}{footer?.(requestClose)}</>}
 </dialog>;
}
export function StatusBadge({value}) {return <span className={`ck-status ${value}`}>{value==='available'?<Check size={12}/>:<span aria-hidden="true">{value==='unavailable'?'−':'·'}</span>}{STATUS[value]||STATUS.unreviewed}</span>;}
export function Rating({song}) {return <div className="ck-rating"><span>미르 숙련도</span><strong>{song.proficiency?<><span className="ck-stars" aria-label={`미르 숙련도 ${song.proficiency}점`}>{'★'.repeat(song.proficiency)}<span>{'☆'.repeat(5-song.proficiency)}</span></span><small>{song.proficiency}/5</small></>:'평가 전'}</strong><small>참고 난이도 {song.difficulty?'★'.repeat(song.difficulty):'미정'}</small></div>;}
export function VideoLinks({song,compact=false}) {
 const links=vodLinks(song.videoUrls),rep=representative(song);
 const others=links.filter(v=>v.url!==rep?.url);
 const shown=compact?others.slice(0,rep?1:2):others;
 return <div className={`ck-videos ${compact?'compact':''}`}>
  {rep&&<a className={`ck-video is-${rep.platform} representative`} href={rep.url} target="_blank" rel="noopener noreferrer"><Star size={13}/><span>대표 영상</span><ExternalLink size={12}/></a>}
  {shown.map(v=><a className={`ck-video is-${v.platform}`} key={v.url} href={v.url} target="_blank" rel="noopener noreferrer" aria-label={`${song.title} ${v.label}${v.total>1?' '+v.number:''} 새 탭에서 보기`}><span className="ck-play" aria-hidden="true">▶</span>{v.platform==='youtube'?'YouTube':'SOOP'}{!compact&&song.videoKinds[v.url]&&<small>{VIDEO_KINDS[song.videoKinds[v.url]]}</small>}{v.total>1&&<small>{v.number}</small>}<ExternalLink size={12}/></a>)}
  {!links.length&&<small className="ck-muted">연결 영상 없음</small>}
  {compact&&others.length>shown.length&&<span className="ck-muted">+{others.length-shown.length}</span>}
 </div>;
}
export function QuickEdit({song,close,save,hasNext=false,notice}) {
 const [draft,setDraft]=useState(()=>({...song,videoUrls:[...song.videoUrls],videoKinds:{...song.videoKinds}}));
 const [url,setUrl]=useState(''),[kind,setKind]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const dirty=JSON.stringify(draft)!==JSON.stringify(song)||Boolean(url);
 const change=patch=>{setDraft(d=>({...d,...patch}));setError('');};
 function append(){const info=vodInfo(url.trim());if(!info){setError('YouTube 또는 SOOP의 개별 영상 주소를 입력해 주세요. 채널 주소는 사용할 수 없습니다.');return;}
  if(draft.videoUrls.includes(info.url)){setError('이미 연결된 영상입니다. 아래 목록에서 대표 영상이나 용도를 선택해 주세요.');return;}
  if(draft.videoUrls.length>=20){setError('검토용 연결 영상은 20개까지 추가할 수 있습니다.');return;}
  change({videoUrls:[...draft.videoUrls,info.url],videoKinds:{...draft.videoKinds,[info.url]:kind}});setUrl('');setKind('');
 }
 function commit(next){if(busy)return;if(url.trim()){setError('입력 중인 주소의 ‘영상 연결’을 먼저 누르거나 주소 입력칸을 비워 주세요.');return;}
  try{const valid=validateEdit(song,draft);setBusy(true);save(valid,next);}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <Dialog title="빠른 수정" close={close} dirty={dirty} footer={requestClose=><footer><button type="button" onClick={requestClose} disabled={busy}>취소</button><button type="button" disabled={busy} onClick={()=>commit(false)}>저장</button><button type="button" className="ck-primary" disabled={busy} onClick={()=>commit(true)}>{hasNext?'저장 후 다음 곡':'저장 후 닫기'}<ArrowRight size={16}/></button></footer>}>
  <div className="ck-dialog-body ck-editor">
   <div className="ck-editor-song"><strong>{song.title}</strong><span>{song.artist||'가수 미확인'}</span><small>검토용 브라우저 저장 · 운영 목록은 변경되지 않습니다.</small></div>
   {notice&&<p className="ck-inline-notice" role="status">{notice}</p>}
   <label>신청 가능 상태<select value={draft.requestStatus} onChange={e=>change({requestStatus:e.target.value})}>{Object.entries(STATUS).map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></label>
   <label>가수명 <small>모르면 공란 유지</small><input value={draft.artist} maxLength={200} onChange={e=>change({artist:e.target.value})}/></label>
   <label>시청자에게 보여줄 안내 <small>{draft.publicNote.length}/140 · 개인 메모는 입력하지 마세요</small><textarea rows={2} value={draft.publicNote} maxLength={140} placeholder="예: 듀엣 시 가능, 낮춘 키로 진행" onChange={e=>change({publicNote:e.target.value})}/></label>
   <section className="ck-add-video"><h3>영상 링크 추가</h3><label>영상 주소<input type="url" value={url} placeholder="YouTube 또는 SOOP 영상 주소" onChange={e=>{setUrl(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();append();}}}/></label><div className="ck-add-controls"><label>영상 용도<select value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(VIDEO_KINDS).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><button type="button" onClick={append}><Plus size={16}/>영상 연결</button></div></section>
   <fieldset className="ck-representatives"><legend>대표 영상 선택</legend><p>연결된 영상 중 하나를 직접 지정합니다. YouTube 링크라고 공식 영상으로 자동 판정하지 않습니다.</p>
    <label className="ck-radio"><input type="radio" name="representative" checked={!draft.representativeUrl} onChange={()=>change({representativeUrl:''})}/>대표 영상 미지정</label>
    {vodLinks(draft.videoUrls).map((video,i)=><div className="ck-video-edit" key={video.url}>
     <label className="ck-radio"><input type="radio" name="representative" checked={draft.representativeUrl===video.url} onChange={()=>change({representativeUrl:video.url})}/>{video.platform==='youtube'?'YouTube':'SOOP'} {video.number}{draft.representativeUrl===video.url&&<span className="ck-tag">대표</span>}</label>
     <a href={video.url} target="_blank" rel="noopener noreferrer" className="ck-url">{video.url}<ExternalLink size={13}/></a>
     <div className="ck-video-edit-actions"><select aria-label={`연결 영상 ${i+1} 용도`} value={draft.videoKinds[video.url]||''} onChange={e=>change({videoKinds:{...draft.videoKinds,[video.url]:e.target.value}})}>{Object.entries(VIDEO_KINDS).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select><button type="button" aria-label={`연결 영상 ${i+1} 제거`} onClick={()=>change({videoUrls:draft.videoUrls.filter(x=>x!==video.url),representativeUrl:draft.representativeUrl===video.url?'':draft.representativeUrl})}><Trash2 size={15}/>연결 제거</button></div>
    </div>)}
    {!draft.videoUrls.length&&<p>연결 영상을 먼저 추가해 주세요.</p>}
   </fieldset>
   <p className="ck-muted">이번 빠른 수정은 신청 상태·가수·공개 안내·영상만 바꿉니다. 기존 난이도와 미르 숙련도는 그대로 유지합니다.</p>
   {error&&<p className="ck-error" role="alert">{error}</p>}
  </div>

 </Dialog>;
}
export function SongDetail({song,close,copy,share,admin,edit,notice,noticeProps}) {return <Dialog title={song.title} close={close}>
 <div className="ck-dialog-body">{notice&&<p className="ck-inline-notice" role="status" {...noticeProps}>{notice}</p>}<p className="ck-detail-artist">{song.artist||'가수 미확인'}</p><StatusBadge value={song.requestStatus}/>{song.publicNote&&<p className="ck-public-note">{song.publicNote}</p>}<div className="ck-detail-rating"><Rating song={song}/><p className="ck-muted">숙련도는 미르님 기준의 평가, 난이도는 참고 정보입니다. 평가 전은 낮은 숙련도를 뜻하지 않습니다.</p></div><div className="ck-tags">{song.categories.map(c=><span key={c}>{c}</span>)}</div><h3>연결 영상</h3><VideoLinks song={song}/>{song.representativeUrl&&song.videoKinds[song.representativeUrl]&&<p className="ck-muted">대표 영상 용도: {VIDEO_KINDS[song.videoKinds[song.representativeUrl]]}</p>}<p className="ck-muted">영상 링크는 새 탭에서 열립니다. 샘플 목록의 영상은 UI 확인용이며 미르님의 가창을 의미하지 않습니다.</p></div>
 <footer><button type="button" onClick={()=>share(song)}><ExternalLink size={16}/>곡 링크 복사</button>{admin&&<button type="button" onClick={edit}>빠른 수정</button>}<button type="button" className="ck-primary" disabled={song.requestStatus==='unavailable'} onClick={()=>copy(song)}><Copy size={16}/>{song.requestStatus==='unavailable'?'신청 불가':'신청 문구 복사'}</button></footer>
 </Dialog>;}
export function Guide({close}) {return <Dialog title="사용성 1차 검토 안내" close={close} wide><div className="ck-dialog-body ck-guide">
 <p><b>시청자 화면</b>으로 탐색하고, <b>관리자 체험</b>으로 바꿔 보완 작업을 확인해 보세요. 이 전환은 검토용 화면 선택이며 실제 관리자 권한을 부여하지 않습니다.</p>
 {[['01','신청할 곡을 바로 판단','곡마다 신청 가능·확인 필요·신청 불가를 표시합니다. 확인 필요인 곡은 미확인 상태로 그대로 남겼습니다. 오늘 방송의 접수 여부와는 다른 정보입니다.'],['02','목록에서 바로 복사','신청 문구는 “가수 - 곡명”입니다. 직접 접수나 SOOP 채팅 전송은 하지 않습니다. 곡 링크는 관리자 조건 없이 이 검토 페이지의 해당 곡을 엽니다. 브라우저에서 바꾼 내용은 다른 사람에게 전달되지 않습니다.'],['03','검색 중심의 화면','소개를 줄이고 상세 필터는 접었습니다. 선택한 조건은 따로 표시하며 각각 해제할 수 있습니다. 모바일에서도 목록에서 복사·영상·즐겨찾기를 누를 수 있습니다.'],['04','대표 영상과 용도','관리자 체험의 빠른 수정에서 대표 영상을 지정하고 원곡·미르 가창·방송 다시보기 등의 용도를 선택합니다. 기존 영상은 공식·대표로 임의 지정하지 않았습니다.'],['05','관리자 빠른 보완','YouTube 없음·대표 미지정·가수 미입력 등의 작업 목록에서 신청 상태·가수·공개 안내·영상만 수정합니다. 저장 후 다음 곡으로 이어갈 수 있고 미저장 변경을 버리기 전 확인합니다.']].map(([n,title,text])=><section key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></section>)}
 <p className="ck-error">검토 페이지는 운영 목록의 읽기 전용 사본을 사용합니다. 저장은 이 브라우저에만 남으며 운영 반영·신청 접수·자동 수집 승인·삭제는 하지 않습니다. 샘플 곡의 상태·별점·영상은 기능 확인용입니다.</p><p>기존 운영의 노래 추가, 전체 정보 편집, 자동 수집 확인, 삭제·복원은 이 검토 페이지에서 다시 구현하지 않았습니다. 실제 도입 시 기존 기능에 통합하는 범위는 검토 후 정합니다.</p>
 </div></Dialog>;}
