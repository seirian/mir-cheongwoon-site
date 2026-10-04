import {useEffect,useId,useRef,useState} from 'react';
import {formatPlaybackPosition,parsePlaybackPosition} from '../../lib/playbackPosition.js';
import {timelineUrl} from '../../lib/songbookTimeline.js';

/** Text input keeps durations beyond 24h valid and lets viewers paste the player time. */
export default function PlaybackPositionInput({value,onChange,vodId,disabled=false}) {
 const id=useId(),input=useRef(null);
 const [touched,setTouched]=useState(false);
 const parsed=parsePlaybackPosition(value);
 const error=touched?parsed.error:'';
 const preview=parsed.seconds===null?null:timelineUrl(vodId,parsed.seconds);
 useEffect(()=>{input.current?.setCustomValidity(parsed.error);},[parsed.error]);
 return <div className="sb-playback-position">
  <label htmlFor={id}>VOD에서 노래 시작 위치</label>
  <input id={id} ref={input} type="text" inputMode="text" required maxLength={32}
   autoComplete="off" spellCheck={false} placeholder="01:12:30" value={value} disabled={disabled}
   aria-describedby={`${id}-help${error?` ${id}-error`:''}`} aria-invalid={error?'true':undefined}
   onChange={e=>{e.currentTarget.setCustomValidity(parsePlaybackPosition(e.target.value).error);onChange(e.target.value);}}
   onInvalid={()=>setTouched(true)}
   onBlur={()=>{setTouched(true);if(parsed.seconds!==null)onChange(formatPlaybackPosition(parsed.seconds));}}/>
  <p id={`${id}-help`} className="sb-note">VOD 재생바의 시간을 그대로 입력하세요. 시:분:초(01:12:30) 또는 분:초(03:20). 노래 길이나 실제 시계 시간이 아닙니다.</p>
  {error&&<p id={`${id}-error`} className="sb-auto-warning" role="alert">{error}</p>}
  {preview&&<div className="sb-actions"><span className="sb-note">시작 위치: <strong>{formatPlaybackPosition(parsed.seconds)}</strong></span><a className="sb-button" href={preview} target="_blank" rel="noopener noreferrer">입력한 위치에서 VOD 확인 ↗</a></div>}
 </div>;
}
