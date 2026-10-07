import {useEffect,useState} from 'react';
import {Music2,Heart,Pencil} from 'lucide-react';
import {coverChoices} from '../../lib/songbookLayout.js';
import SongCategories from '../../songbook-check/SongCategories.jsx';
import {StatusBadge} from '../../songbook-check/Dialogs.jsx';
import {MusicBadge} from './SongMedia.jsx';

function CoverArtwork({song,open}) {
  const choices=coverChoices(song),signature=choices.map(c=>c.url).join('|');
  const [failed,setFailed]=useState([]);
  useEffect(()=>setFailed([]),[signature]);
  const cover=choices.find(c=>!failed.includes(c.url));
  return <div className="sg-cover-art">
    <button type="button" className="sg-art-button" aria-label={`${song.title} 커버로 상세 보기`} onClick={open}>
      {cover?<img src={cover.url} alt={`${song.title} ${cover.label}`} width={320} height={320} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={cover.kind==='video'?'is-video':''} onError={()=>setFailed(old=>[...old,cover.url])}/>:<span className="sg-empty-art"><Music2 size={36} aria-hidden="true"/><small>이미지 없음</small></span>}
    </button>
    {cover?.kind==='album'&&<span className="sg-art-source"><MusicBadge url={cover.href} title={song.title}/></span>}
    {cover?.kind==='video'&&<span className="sg-art-kind">영상 썸네일</span>}
  </div>;
}
export default function SongbookCoverCard({song,open,favorite,onFavorite,admin=false,checked=false,onSelect,disabled=false,onEdit}) {
  return <article className={`sg-cover-card ${checked?'is-selected':''}`} data-song-id={song.id}>
    <div className="sg-art-wrap"><CoverArtwork song={song} open={open}/>
      {admin&&<label className="sg-card-select"><input type="checkbox" aria-label={`${song.title} 선택`} checked={checked} disabled={disabled} onChange={e=>onSelect(e.target.checked)}/><span className="sb-sr-only">곡 선택</span></label>}
      <button type="button" className="sg-card-favorite" aria-label={`${song.title} 즐겨찾기`} aria-pressed={favorite} onClick={onFavorite}><Heart size={18} aria-hidden="true" fill={favorite?'currentColor':'none'}/></button>
    </div>
    <div className="sg-card-content"><button type="button" className="sg-card-title" title={song.title} aria-label={`${song.title} 상세 보기`} onClick={open}>{song.title}</button>
      <p className="sg-card-artist" title={song.artist||'가수 미확인'}>{song.artist||'가수 미확인'}</p>
      <SongCategories song={song}/>
      <div className="sg-card-bottom"><div className="sg-card-difficulty"><span>난이도</span>{song.difficulty?<strong role="img" aria-label={`참고 난이도 ${song.difficulty}점`}>{'★'.repeat(song.difficulty)}</strong>:<small>미정</small>}</div><StatusBadge value={song.requestStatus}/></div>
      {admin&&<button type="button" className="sg-card-edit" aria-label={`${song.title} 빠른 수정`} disabled={disabled} onClick={onEdit}><Pencil size={14} aria-hidden="true"/>빠른 수정</button>}
    </div>
  </article>;
}
