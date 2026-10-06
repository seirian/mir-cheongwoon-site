import {useEffect,useRef,useState} from 'react';
import {Search,Music2,ExternalLink,Youtube} from 'lucide-react';
import {matches} from '../../lib/songbookV2.js';
import {vodInfo,musicUrl} from '../../lib/songbookMedia.js';
import {existingMatch,titleLabel,versionLabel} from '../../lib/songbookSearchLocale.js';
import {externalSearch,platformRows,PLATFORM_NAMES} from '../../lib/songbookPlatforms.js';
// MELON_PAUSED: import {melonSongUrl} from '../../lib/songbookPlatforms.js';
import {SongCover} from './SongMedia.jsx';
import '../../songbook-platforms.css';
const youtubeErrors = {
  youtube_quota_exceeded:'YouTube 검색 할당량을 모두 사용했습니다. 영상 주소 가져오기 또는 Apple Music 검색을 이용해 주세요.',
  youtube_api_disabled:'YouTube 검색 API가 사용 설정되지 않았습니다. 관리자에게 API 설정 확인을 요청해 주세요.',
  youtube_key_invalid:'YouTube 검색 키를 확인해야 합니다. 영상 주소 가져오기는 계속 사용할 수 있습니다.',
  youtube_key_restricted:'YouTube 검색 키의 서버 IP 또는 API 제한 설정을 확인해야 합니다. 관리자에게 알려주세요.',
  youtube_search_unavailable:'YouTube 검색에 연결하지 못했습니다. 다시 검색하거나 영상 주소로 가져와 주세요.',
};
const empty=()=>({state:'idle',songs:[],message:''});
export default function PlatformDiscovery({songs,onSelect,onExisting}) {
  const [query,setQuery]=useState(''),[searched,setSearched]=useState(''),[country,setCountry]=useState('AUTO'),[tab,setTab]=useState('all');
  const [panels,setPanels]=useState({apple:empty(),youtube:empty()}),[videoUrl,setVideoUrl]=useState('');
  // MELON_PAUSED: keep the manual-import state alongside its commented form.
  // const [melon,setMelon]=useState({title:'',artist:'',url:''}),[melonError,setMelonError]=useState('');
  const requests=useRef({}),versions=useRef({apple:0,youtube:0});
  function cancel(){for(const p of ['apple','youtube']){++versions.current[p];requests.current[p]?.abort();}}
  useEffect(()=>()=>cancel(),[]);
  function changeQuery(value){cancel();setQuery(value);setSearched('');setPanels({apple:empty(),youtube:empty()});}
  async function lookup(provider,term) {
    requests.current[provider]?.abort();const sequence=++versions.current[provider],controller=new AbortController();requests.current[provider]=controller;
    const timer=setTimeout(()=>controller.abort(),20000);
    setPanels(old=>({...old,[provider]:{state:'loading',songs:[],message:''}}));
    try {
      const response=await fetch(`${import.meta.env.BASE_URL}api/songbook-platform-search.php?${new URLSearchParams({provider,q:term,country})}`,{signal:controller.signal});
      const data=await response.json();
      if(sequence!==versions.current[provider])return;
      if(!response.ok)throw Error(provider==='youtube'&&youtubeErrors[data.error]?youtubeErrors[data.error]:response.status===429?'검색 요청 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.':provider==='youtube'?'영상을 불러오지 못했습니다. 주소·공개 상태를 확인해 주세요. 비공개·제한된 영상은 가져올 수 없습니다.':'음악 검색에 연결하지 못했습니다. 다시 시도하거나 직접 입력해 주세요.');
      if(!Array.isArray(data.songs))throw Error('검색 응답을 확인하지 못했습니다. 다시 시도해 주세요.');
      const rows=platformRows(provider,data.songs,songs);
      const state=data.state==='setup_required'?'setup_required':rows.length?'ok':'empty';
      setPanels(old=>({...old,[provider]:{state,songs:rows,message:state==='setup_required'?'키워드 검색 API 연결 전입니다. 아래에서 YouTube 검색을 열고, 영상 주소를 붙여넣으면 제목을 가져올 수 있습니다.':data.partial?'일부 지역의 응답이 늦어 확인된 결과만 표시합니다.':''}}));
    } catch(error) {
      if(sequence===versions.current[provider])setPanels(old=>({...old,[provider]:{state:'error',songs:[],message:error.name==='AbortError'?'응답이 늦어 검색을 중단했습니다. 다른 플랫폼 결과는 계속 사용할 수 있습니다.':error.message}}));
    } finally {clearTimeout(timer);}
  }
  function search(event){
    event.preventDefault();const q=query.trim();if(q.length<2)return;cancel();setSearched(q);
    const video=vodInfo(q);
    if(video?.platform==='youtube'){setVideoUrl(q);setTab('youtube');setPanels({apple:empty(),youtube:empty()});void lookup('youtube',q);return;}
    if(musicUrl(q)){setTab('apple');setPanels({apple:empty(),youtube:empty()});void lookup('apple',q);return;}
    void lookup('apple',q);void lookup('youtube',q);
  }
  const existing=searched?songs.filter(s=>matches(s,searched)).slice(0,8):[];
  const loading=Object.values(panels).some(p=>p.state==='loading');
  function resultList(provider){const panel=panels[provider];return <>
    {panel.state==='idle'&&<p className="sp-empty">{provider==='apple'?'곡명이나 가수를 검색하면 한국어 제목을 우선 표시합니다.':'곡명·가수로 영상을 검색하거나, 영상 주소로 제목과 썸네일을 가져올 수 있습니다.'}</p>}
    {panel.state==='loading'&&<p role="status" className="sp-empty">{PLATFORM_NAMES[provider]} 검색 중…</p>}
    {panel.message&&<p className={`sp-message ${panel.state==='error'?'is-error':''}`} role={panel.state==='error'?'alert':'status'}>{panel.message}</p>}
    {panel.state==='empty'&&<p className="sp-empty" role="status">일치하는 결과가 없습니다. 다른 검색어나 영상 주소를 사용해 보세요.</p>}
    <div className="sp-results">{panel.songs.map(r=><article key={r.key} className="sp-result">
      {provider==='youtube'?<a href={r.videoUrl} target="_blank" rel="noopener noreferrer" className="sp-video-thumb" aria-label={`${r.title} YouTube에서 확인`}><img src={r.thumbnail} alt="" loading="lazy" onError={e=>{e.currentTarget.style.visibility='hidden';}}/><Youtube size={20}/></a>:<SongCover song={{...r,videoUrls:[]}}/>}
      <div className="sp-result-copy"><strong>{r.title}</strong><span>{provider==='youtube'?`채널: ${r.channel||'정보 없음'}`:r.artist}</span>
        <small>{provider==='youtube'?'영상 제목 그대로 · 가수는 공란으로 가져옵니다.':[r.album,titleLabel(r),versionLabel(r.title)].filter(Boolean).join(' · ')}</small>
        <div className="sp-result-actions"><button type="button" className="sb-button" onClick={()=>onSelect(r)}>{provider==='youtube'?'영상 정보 가져오기':existingMatch(songs,r)?'기존 곡으로 가져오기':'곡 정보 가져오기'}</button><a href={provider==='youtube'?r.videoUrl:r.musicUrl} target="_blank" rel="noopener noreferrer">{PLATFORM_NAMES[provider]}에서 확인 ↗</a></div>
      </div>
    </article>)}</div>
  </>;}
  return <section className="sp-discovery" aria-label="플랫폼별 음악 검색">
    <h3>1. 플랫폼별로 찾아보기</h3><p className="sb-note">같은 검색어로 각 플랫폼을 확인하세요. 음원 정보와 영상 결과를 섞지 않고 보여드립니다.</p>
    <form className="sp-search" onSubmit={search}>
      <label className="sp-main-query"><span className="sb-sr-only">추가할 곡 검색</span><Search size={19}/><input required minLength={2} maxLength={300} value={query} onChange={e=>changeQuery(e.target.value)} placeholder="곡명·가수 또는 YouTube / Apple Music 주소"/></label>
      <label><span className="sb-sr-only">Apple Music 검색 지역</span><select value={country} onChange={e=>{setCountry(e.target.value);changeQuery(query);}}><option value="AUTO">한국어 우선 · 전체</option><option value="KR">한국</option><option value="US">미국</option><option value="JP">일본</option></select></label>
      <button className="sb-button sb-primary" disabled={query.trim().length<2||loading}>{loading?'검색 중…':'플랫폼 검색'}</button>
    </form>
    <div className="sp-tabs" aria-label="검색 플랫폼 선택">{[['all','전체'],...Object.entries(PLATFORM_NAMES)].map(([id,name])=><button key={id} type="button" aria-label={name} aria-pressed={tab===id} onClick={()=>setTab(id)}>{name}{panels[id]?.songs.length>0&&<small>{panels[id].songs.length}</small>}</button>)}</div>
    {existing.length>0&&<details className="sp-existing"><summary>기존 노래책에도 일치하는 곡이 있습니다 · {existing.length}개 표시</summary>{existing.map(s=><button type="button" key={s.id} onClick={()=>onExisting(s)}>{s.title} — {s.artist||'가수 미확인'}</button>)}</details>}
    {(tab==='all'||tab==='apple')&&<section className="sp-provider" data-provider="apple" aria-label="Apple Music 검색 결과"><header><h4><Music2 size={18}/>Apple Music</h4><span className="sp-badge">음원 정보 검색</span></header>{resultList('apple')}</section>}
    {(tab==='all'||tab==='youtube')&&<section className="sp-provider" data-provider="youtube" aria-label="YouTube 검색 결과"><header><h4><Youtube size={19}/>YouTube</h4><span className="sp-badge">키워드·영상 주소 검색</span></header>
      <p className="sb-note">채널명은 가수명이 아닙니다. 원곡·커버·반주를 직접 확인해 주세요. 영상 선택만으로 미르님의 가창 기록이 되지는 않습니다.</p>
      <a className="sp-outbound" href={externalSearch('youtube',query)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>YouTube에서 검색 ↗</a>
      <form className="sp-url-form" onSubmit={e=>{e.preventDefault();void lookup('youtube',videoUrl.trim());}}><label>확인한 YouTube 영상 주소<input required type="url" maxLength={1500} value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…"/></label><button className="sb-button" disabled={panels.youtube.state==='loading'}>영상 주소로 가져오기</button></form>
      {resultList('youtube')}
    </section>}
    {/* MELON_PAUSED: retained but not rendered, including links and manual import.
    {(tab==='all'||tab==='melon')&&<section className="sp-provider" data-provider="melon" aria-label="Melon 확인 및 직접 입력"><header><h4><Music2 size={18}/>Melon</h4><span className="sp-badge is-pending">자동 검색 미연결</span></header>
      <p className="sp-message">멜론 검색 결과를 이 화면에 자동 수집하지 않습니다. 연동 허용 여부를 확인한 API가 필요합니다. 지금은 멜론에서 곡을 확인한 뒤 직접 입력할 수 있습니다.</p>
      <a className="sp-outbound" href={externalSearch('melon',query)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>멜론에서 곡 검색 ↗</a>
      <form className="sp-manual" onSubmit={e=>{e.preventDefault();setMelonError('');const url=melon.url.trim()?melonSongUrl(melon.url.trim()):'';if(melon.url.trim()&&!url){setMelonError('멜론 곡 상세 주소를 확인해 주세요.');return;}onSelect({provider:'melon',title:melon.title.trim(),artist:melon.artist.trim(),aliases:[],referenceUrl:url});}}>
        <strong>확인한 내용 직접 입력</strong><div className="sb2-form-grid"><label>멜론에서 확인한 곡명<input required maxLength={200} value={melon.title} onChange={e=>setMelon({...melon,title:e.target.value})}/></label><label>멜론에서 확인한 가수 · 선택<input maxLength={200} value={melon.artist} onChange={e=>setMelon({...melon,artist:e.target.value})}/></label></div>
        <label>멜론 곡 주소 · 선택<input type="url" maxLength={1500} value={melon.url} onChange={e=>setMelon({...melon,url:e.target.value})} placeholder="https://www.melon.com/song/detail.htm?songId=…"/></label>
        {melonError&&<p role="alert">{melonError}</p>}<button className="sb-button" type="submit">직접 입력한 내용 적용</button><small>외부 검색 결과가 아닌, 직접 입력한 정보입니다. 앨범 이미지·가사는 자동으로 수집하지 않습니다.</small>
      </form>
    </section>}
    */}
  </section>;
}
