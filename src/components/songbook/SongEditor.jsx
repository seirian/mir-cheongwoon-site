import {useEffect, useRef, useState} from 'react';
import {matches, normalize} from '../../lib/songbookV2';
import {searchRows, existingMatch, selectionDraft, titleLabel, versionLabel, durationLabel, mergedAliases} from '../../lib/songbookSearchLocale';
import {SongCover, VodLinks} from './SongMedia';
import PlatformDiscovery from './PlatformDiscovery.jsx';
import {videoSelection} from '../../lib/songbookPlatforms.js';

const blank = () => ({title:'', artist:'', categories:[], aliases:[], videoUrls:[], difficulty:null, requestStatus:'unreviewed', artworkUrl:'', musicUrl:'', album:''});
export default function SongEditor({song, store, categories, close, saved, Modal, StarPicker, platformSearch=false, allowUnknownArtist=false}) {
  const [draft, setDraft] = useState(() => song ? {...song,videoUrls:song.manualVideoUrls||song.videoUrls} : blank());
  const [q, setQ] = useState(''), [region, setRegion] = useState('AUTO');
  const [results, setResults] = useState([]), [searched, setSearched] = useState('');
  const [searchMessage, setSearchMessage] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [category, setCategory] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestedTitle, setSuggestedTitle] = useState('');
  const request = useRef(null), sequence = useRef(0);
  useEffect(() => () => { ++sequence.current; request.current?.abort(); }, []);
  const existing = store.songs.filter(s => searched && matches(s, searched));
  function changeQuery(value) {
    ++sequence.current; request.current?.abort(); setQ(value); setBusy(false);
    setResults([]); setSearched(''); setHasSearched(false); setSearchMessage('');
  }
  async function search(event) {
    event.preventDefault(); request.current?.abort();
    const seq = ++sequence.current, controller = new AbortController(); request.current = controller;
    const term = q.trim(); setSearched(term); setHasSearched(true); setResults([]); setBusy(true); setSearchMessage('');
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/songbook-search.php?${new URLSearchParams({q:term, country:region})}`, {signal:controller.signal});
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.songs)) throw new Error(response.status === 429 ? '요청이 많습니다. 잠시 후 다시 검색해주세요.' : '외부 음악 검색에 연결하지 못했습니다. 직접 입력은 사용할 수 있습니다.');
      if (seq !== sequence.current) return;
      const rows = searchRows(data.songs, store.songs);
      setResults(rows);
      setSearchMessage(data.partial ? '일부 음악 DB 응답이 지연되어 확인된 결과만 표시합니다. 다시 검색하거나 직접 입력해주세요.' : !rows.length ? '연결된 음악 DB에서 찾지 못했습니다. 미등록·미유통 곡은 직접 입력할 수 있습니다.' : '확인된 한국어 제목을 우선 표시합니다. 가수·앨범·버전을 확인한 뒤 선택해주세요.');
    } catch (err) {
      if (seq === sequence.current) setSearchMessage(err.name === 'AbortError' ? '검색 응답이 늦어 중단했습니다. 다시 검색하거나 직접 입력해주세요.' : err.message);
    } finally { clearTimeout(timer); if (seq === sequence.current) setBusy(false); }
  }
  function select(result) {
    const found = existingMatch(store.songs, result);
    const selected=selectionDraft(found, result, blank());
    setDraft({...selected,videoUrls:selected.manualVideoUrls||selected.videoUrls});
    setSuggestedTitle(result.suggestedTitle || '');
    setError('');
  }
  const [importNotice,setImportNotice]=useState('');
  function importPlatform(result) {
    setError('');
    try {
      if(result.provider==='youtube') {
        setDraft(videoSelection(draft,result));
        setImportNotice('YouTube 영상 정보를 가져왔습니다. 채널명을 가수로 넣지 않았습니다. 영상 제목을 실제 곡명에 맞게 수정하고, 가수는 공란으로 둘 수 있습니다.');
      }
      /* MELON_PAUSED: preserved manual import; unsupported providers must not become Apple results.
      else if(result.provider==='melon') {
        setDraft({...blank(),title:result.title,artist:result.artist});setSuggestedTitle('');
        setImportNotice('멜론에서 확인 후 직접 입력한 정보를 적용했습니다. 자동 검색으로 가져온 결과는 아닙니다.');
      }
      */
      else if(result.provider==='apple') {select(result);setImportNotice('Apple Music 곡 정보를 가져왔습니다. 제목·가수·버전을 확인하고 저장해 주세요.');}
      else {throw Error('현재 지원하지 않는 검색 플랫폼입니다.');}
    } catch(err) {setError(err.message);}
  }
  const choices = [...new Set([...categories, ...draft.categories])];
  return <Modal title={song?'곡 정보 편집':'노래 추가'} close={close} className={platformSearch?'sp-modal':''}>
    {platformSearch?<PlatformDiscovery songs={store.songs} onSelect={importPlatform} onExisting={s=>{setDraft({...s,videoUrls:s.manualVideoUrls||s.videoUrls});setSuggestedTitle('');setError('');setImportNotice('기존 노래책의 곡을 선택했습니다. 내용을 확인한 후 저장해 주세요.');}}/>:<section className="sb2-discovery sb3-discovery">
      <h3>1. 전체 음악 검색</h3>
      <p className="sb-note">한국어 제목 우선 · 내 노래책과 외부 음악 목록을 함께 찾습니다. 한국 스토어 표기, 확인된 국내명과 한국어 별칭을 대조합니다.</p>
      <form className="sb2-search-add" onSubmit={search}>
        <input aria-label="추가할 곡 검색" required minLength={2} maxLength={300} value={q} onChange={e=>changeQuery(e.target.value)} placeholder="곡명·가수 또는 Apple Music 곡 주소"/>
        <select aria-label="음악 검색 지역" value={region} onChange={e=>{setRegion(e.target.value); changeQuery(q);}}><option value="AUTO">자동·전체 (한국어 우선)</option><option value="KR">한국</option><option value="US">미국</option><option value="JP">일본</option></select>
        <button className="sb-button" disabled={busy || q.trim().length<2}>{busy?'검색 중…':'곡 검색'}</button>
      </form>
      {hasSearched && <div className="sb3-search-panels">
        <section className="sb2-results sb3-existing" aria-label="기존 노래책 검색 결과"><h4>이미 노래책에 있는 곡 <small>{existing.length}</small></h4>
          {existing.length ? existing.slice(0,10).map(s=><button key={s.id} type="button" onClick={()=>{setDraft({...s,videoUrls:s.manualVideoUrls||s.videoUrls}); setSuggestedTitle(''); setError('');}}>{s.title} · {s.artist}<small>등록됨 · 기존 곡 편집</small></button>) : <p className="sb-note">현재 노래책에는 일치하는 곡이 없습니다.</p>}
        </section>
        <section className="sb3-external" aria-label="외부 음악 검색 결과"><h4>다른 음악 목록에서 찾은 곡 <small>{results.length}</small></h4>
          {busy && <p role="status">외부 음악 목록을 검색하는 중…</p>}
          <p className="sb-note" role="status">{searchMessage}</p>
          <div className="sb3-search-results">{results.map((r,i)=>{
            const found=existingMatch(store.songs,r);
            return <article key={`${r.title}-${r.artist}-${i}`}><SongCover song={{...r,videoUrls:[]}}/><button type="button" onClick={()=>select(r)}><strong>{r.title}</strong><span>{r.artist}</span><span className="sb4-result-labels"><small>{titleLabel(r)}</small>{versionLabel(r.title) && <small className="sb4-version">{versionLabel(r.title)}</small>}</span><small>{[r.album,r.releaseDate,durationLabel(r.duration)].filter(Boolean).join(' · ')}</small><em>{found?'등록됨 · 기존 곡에 정보 적용':'선택하여 가져오기'}</em></button>{r.aliases.length>0 && <details className="sb4-aliases"><summary>다른 표기</summary><span>{r.aliases.join(' · ')}</span></details>}</article>;
          })}</div>
        </section>
      </div>}
      <p className="sb-note">한국어명이 확인되지 않은 결과는 원문 제목으로 표시합니다. 검색어를 자동 번역하거나 곡명으로 확정하지 않습니다. 원하는 곡이 없으면 직접 등록할 수 있습니다.</p>
    </section>}
    {importNotice&&<p className="sp-import-notice" role="status">{importNotice}</p>}
    <form className="sb2-form" onSubmit={async e=>{e.preventDefault();setError('');try{saved(await store.saveSong(draft));}catch(err){setError(err.message);}}}>
      <h3>2. 정보 확인 후 저장 {draft.id && <small>· 기존 곡 편집</small>}</h3>
      <div className="sb3-editor-cover"><SongCover song={draft}/><div><strong>{draft.title || '곡 이름'}</strong><p className="sb-note">{draft.album || '앨범 이미지가 없으면 연결 영상의 썸네일을 표시합니다.'}</p>
        {draft.artworkUrl && <button type="button" className="sb-reset" onClick={()=>setDraft({...draft,artworkUrl:'',musicUrl:'',album:''})}>앨범 이미지 연결 해제</button>}
      </div></div>
      <div className="sb2-form-grid"><label>곡명<input required maxLength={200} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>가수·작품{allowUnknownArtist&&<small>선택 · 모르면 공란으로 두세요</small>}<input required={!allowUnknownArtist} maxLength={200} value={draft.artist} onChange={e=>setDraft({...draft,artist:e.target.value})}/></label></div>
      {suggestedTitle && <p className="sb4-title-suggestion">한국어 제목 제안: <strong>{suggestedTitle}</strong> <button type="button" className="sb-button" onClick={()=>{setDraft({...draft,title:suggestedTitle,aliases:mergedAliases([draft.title,...draft.aliases],suggestedTitle)});setSuggestedTitle('');}}>한국어 제목 적용</button></p>}
      {searched && !/^https:/i.test(searched) && draft.title && normalize(searched)!==normalize(draft.title) && !draft.aliases.some(alias=>normalize(alias)===normalize(searched)) && <button type="button" className="sb-button sb3-alias-action" onClick={()=>setDraft({...draft,aliases:[...new Set([...draft.aliases,searched])].slice(0,20)})}>검색어 ‘{searched}’를 검색 별칭에 추가</button>}
      <fieldset className="sb2-category-select"><legend>카테고리 · 여러 개 선택 가능</legend>{choices.map(c=><label key={c}><input type="checkbox" checked={draft.categories.includes(c)} onChange={()=>setDraft({...draft,categories:draft.categories.includes(c)?draft.categories.filter(x=>x!==c):[...draft.categories,c]})}/>{c}</label>)}</fieldset>
      <div className="sb2-search-add"><input aria-label="새 카테고리" maxLength={40} value={category} onChange={e=>setCategory(e.target.value)} placeholder="새 카테고리 이름"/><button className="sb-button" type="button" onClick={()=>{const c=category.trim();if(c)setDraft({...draft,categories:[...new Set([...draft.categories,c])]});setCategory('');}}>카테고리 추가</button></div>
      <label>검색 별칭 · 쉼표로 구분<input maxLength={1000} value={draft.aliases.join(', ')} onChange={e=>setDraft({...draft,aliases:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}/></label>
      <label>연결 영상 · 한 줄에 한 주소<textarea rows={4} value={draft.videoUrls.join('\n')} onChange={e=>setDraft({...draft,videoUrls:e.target.value.split('\n')})} placeholder="YouTube 또는 SOOP VOD 주소를 모두 입력해주세요"/></label>
      <VodLinks urls={draft.videoUrls} title={draft.title || '등록할 곡'} detailed/>
      <div className="sb2-form-grid"><div><StarPicker label="난이도" value={draft.difficulty} onChange={v=>setDraft({...draft,difficulty:v})}/><button type="button" className="sb-reset" onClick={()=>setDraft({...draft,difficulty:null})}>미정으로 설정</button></div><label>신청 가능 상태<select aria-label="신청 가능 상태" value={draft.requestStatus} onChange={e=>setDraft({...draft,requestStatus:e.target.value})}><option value="unreviewed">확인 전</option><option value="available">신청 가능</option><option value="unavailable">신청 불가</option></select></label></div>
      <p className="sb-note">곡 정보 등록이 미르님의 가창 기록을 확정하지는 않습니다. 숙련도는 미르님의 평가를 관리자 계정으로 별도 등록합니다.</p>
      {error && <p role="alert" className="sb2-error">{error}</p>}
      <button type="submit" className="sb-button sb-primary" disabled={store.saving}>{store.saving?'저장 중…':draft.id?'변경사항 저장':'노래책에 추가'}</button>
    </form>
  </Modal>;
}
