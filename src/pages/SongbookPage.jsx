import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpRight, BookOpen, Check, ChevronLeft, ChevronRight, Copy, Heart, ListMusic, Music2, Search, SlidersHorizontal, X } from 'lucide-react';
import snapshot from '../data/songbookData.json';
import { downloadFile, FAVORITES_KEY, PAGE_SIZE, pageSlice, readFavorites, requestText, safeSourceUrl, selectSongs, toCsv } from '../lib/songbook';
import '../songbook.css';

const { songs } = snapshot;
const collator = new Intl.Collator('ko', { numeric: true });
const categories = [...new Set(songs.flatMap(song => song.categories))].sort(collator.compare);
const artists = [...new Set(songs.map(song => song.artist))].sort(collator.compare);
const sourceOptions = snapshot.sources.filter(source => source.importedCount > 0);

export function SourceLink({ url, children, ...props }) {
  const safe = safeSourceUrl(url);
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer" {...props}>{children}<ArrowUpRight size={14}/></a> : <span>{children}</span>;
}
function SongDialog({ song, close, copy, saved, toggle, manualCopy, message }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  return <dialog className="sb-dialog" ref={ref} aria-labelledby="song-dialog-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === ref.current) close(); }}>
    <div className="sb-dialog-content">
      <header className="sb-dialog-top"><span className="sb-overline">SONG DETAILS</span><button className="sb-icon" type="button" onClick={close} aria-label="곡 상세 닫기"><X size={22}/></button></header>
      <div className="sb-detail-intro"><span className="sb-track-icon"><Music2 size={29}/></span><div><h2 id="song-dialog-title">{song.title}</h2><p>{song.artist}</p></div></div>
      <div className="sb-tags">{song.categories.map(category => <span key={category}>{category}</span>)}</div>
      {!!song.aliases.length && <p className="sb-aliases">다른 표기: {song.aliases.join(' · ')}</p>}
      <div className="sb-detail-facts"><div><span>신청 가능 여부</span><strong>{song.requestStatus === 'available' ? '신청 가능' : '미르님 확인 전'}</strong></div><div><span>난이도 · 숙련도</span><strong>미설정</strong></div><div><span>가창 날짜</span><strong>자료 대조 필요</strong></div></div>
      <p className="sb-note">목록 등재와 영상 링크만으로 현재 신청 가능 여부나 실제 가창 날짜를 확정하지 않습니다.</p>
      <div className="sb-actions"><button className="sb-button sb-primary" type="button" onClick={() => copy(song)}><Copy size={16}/>곡 정보 복사</button><button className="sb-button" type="button" aria-pressed={saved} onClick={() => toggle(song.id)}><Heart size={16} fill={saved ? 'currentColor' : 'none'}/>{saved ? '즐겨찾기 해제' : '즐겨찾기'}</button></div>
      {message && <p className="sb-note" role="status">{message}</p>}
      {manualCopy && <label className="sb-manual-copy">자동 복사를 사용할 수 없습니다. 아래 내용을 선택해 복사해주세요.<textarea readOnly value={requestText(song)} onFocus={event => event.target.select()}/></label>}
      <section className="sb-detail-section"><h3>이 곡의 출처 <small>{song.sources.length}</small></h3><div className="sb-source-links">{song.sources.map((source, index) => <SourceLink key={`${source.id}-${index}`} url={source.url}><span><strong>{source.name}</strong><small>{source.originalTitle || song.title} · {source.originalArtist || song.artist}</small><small>원본 적응도: {source.originalProficiency == null ? '미기재' : `${source.originalProficiency}/5`} · 원본 키: {source.originalKey ?? '미기재'}</small></span></SourceLink>)}</div><p className="sb-note">원본 적응도·키는 출처에 적힌 값이며, 이 사이트에서 미르님이 승인한 설정이 아닙니다.</p></section>
      <section className="sb-detail-section"><h3>출처에 연결된 영상 <small>{song.videoLinks.length}</small></h3>{song.videoLinks.length ? <><p className="sb-note">원본 노래책의 연결 영상입니다. 현재 재생 가능 여부·본인 채널 여부·가창일·시작 구간은 전수 검증 전입니다.</p><div className="sb-source-links">{song.videoLinks.map((video, index) => <SourceLink key={video.url} url={video.url}><span>영상 {index + 1} 보기 <small>{(video.sourceNames || [video.sourceName]).join(' · ')}</small></span></SourceLink>)}</div></> : <p className="sb-note">현재 확보한 자료에 연결 영상이 없습니다. 가창하지 않았다는 의미는 아닙니다.</p>}</section>
      {!!song.backingLinks?.length && <details className="sb-detail-section"><summary>MR · 반주 링크 ({song.backingLinks.length})</summary><p className="sb-note">반주 자료입니다. 미르님의 가창 증거로 집계하지 않습니다.</p><div className="sb-source-links">{song.backingLinks.map((video, index) => <SourceLink key={video.url} url={video.url}><span>반주 {index + 1}<small>{video.sourceName}</small></span></SourceLink>)}</div></details>}
      <p className="sb-dialog-footer">직접 신청을 접수하거나 SOOP 채팅으로 전송하지 않습니다.</p>
    </div>
  </dialog>;
}

export default function SongbookPage() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') || '';
  const [query, setQuery] = useState(urlQuery);
  const [favoriteIds, setFavoriteIds] = useState(() => {
    try { return readFavorites(window.localStorage, songs.map(song => song.id)); } catch { return []; }
  });
  const [message, setMessage] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const messageTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(messageTimer.current), []);
  useEffect(() => { setQuery(urlQuery); }, [urlQuery]);
  const filters = Object.fromEntries(params);
  const results = useMemo(() => selectSongs(songs, Object.fromEntries(params), favoriteIds), [params, favoriteIds]);
  const pagination = pageSlice(results, params.get('page'));
  const selected = songs.find(song => song.id === params.get('song'));
  const videoCount = songs.filter(song => song.videoLinks.length > 0).length;
  const crossCount = songs.filter(song => new Set(song.sources.map(source => source.id)).size > 1).length;
  function notice(text) { setMessage(text); window.clearTimeout(messageTimer.current); messageTimer.current = window.setTimeout(() => setMessage(''), 5500); }
  function update(values, resetPage = true) {
    // BrowserRouter updates history synchronously, before a deferred React render.
    // useSearchParams callback setters do not queue like setState: reading the
    // rendered params here can restore stale filters during rapid reset/sort.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    if (resetPage) next.delete('page');
    setParams(next);
  }
  function toggleFavorite(id) {
    const next = favoriteIds.includes(id) ? favoriteIds.filter(value => value !== id) : [...favoriteIds, id];
    setFavoriteIds(next);
    try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); notice(next.includes(id) ? '이 브라우저의 즐겨찾기에 저장했습니다.' : '즐겨찾기에서 해제했습니다.'); }
    catch { notice('브라우저 저장이 차단되어 이번 화면에서만 유지됩니다.'); }
  }
  async function copySong(song) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(requestText(song)); setManualCopy(false); notice('곡 정보를 복사했습니다. 신청은 방송에서 직접 해주세요.');
    } catch { setManualCopy(true); update({song:song.id}, false); notice('자동 복사가 제한되어 직접 복사할 내용을 표시합니다.'); }
  }
  const tabs = [{id:'', label:'전체 노래', count:songs.length}, {id:'videos', label:'영상 있는 곡', count:videoCount}, {id:'favorites', label:'즐겨찾기', count:favoriteIds.length}];
  const activeFilters = !!(filters.q || filters.category || filters.artist || filters.source || filters.status);
  return <div className="songbook-page">
    <section className="section-wrap sb-hero">
      <div className="sb-hero-copy"><span className="sb-overline"><BookOpen size={15}/> MIR'S MUSIC LIBRARY <b>1차 초안</b></span><h1>미르의 노래책<span>목소리로 남긴 순간들.</span></h1><p>다시 듣고 싶은 노래를 찾고,<br className="sb-mobile-break"/> 다음 방송에서 함께할 곡을 골라보세요.</p><div className="sb-hero-links"><a href="#songbook-search">노래 찾아보기 <ChevronRight size={16}/></a><Link to="/songbook/review">수록 기준과 검토 현황 <ArrowUpRight size={16}/></Link></div></div>
      <div className="sb-record" aria-hidden="true"><div className="sb-record-ring"><div><Music2 size={38}/><b>MIR</b><span>SONGBOOK · VOL. 01</span></div></div></div>
    </section>
    <section className="section-wrap sb-stats" aria-label="노래책 집계"><div><span>목록 대조 후 수록</span><strong>{songs.length.toLocaleString()}<small>곡</small></strong></div><div><span>출처에 영상 링크 있음</span><strong>{videoCount.toLocaleString()}<small>곡</small></strong></div><div><span>둘 이상의 자료에 등재</span><strong>{crossCount.toLocaleString()}<small>곡</small></strong></div><div className="sb-scope"><span>가창 기록 조사 대상</span><strong>2022.10.26 <span>— 2026.10.01</span></strong><small>전곡 수록·가창일 검증 완료를 뜻하지 않습니다.</small></div></section>
    <div className="section-wrap sb-disclaimer"><span className="sb-status-dot"/><p>공개 목록을 대조한 초안입니다. <strong>신청 가능 여부와 난이도는 미르님 확인 전</strong>이며, 미리내 게시물 검증 현황은 검토실에서 확인할 수 있습니다.</p></div>
    <section className="section-wrap sb-library" aria-label="노래 검색과 목록">
      <div className="sb-tabs" aria-label="목록 보기">{tabs.map(tab => <button type="button" key={tab.id} aria-pressed={(filters.view || '') === tab.id} onClick={() => update({view:tab.id, song:''})}>{tab.id === 'favorites' && <Heart size={15}/>}<span>{tab.label}</span><small>{tab.count}</small></button>)}</div>
      <form className="sb-search" onSubmit={event => { event.preventDefault(); update({q:query.trim(), song:''}); }} id="songbook-search"><Search size={21}/><label className="sb-sr-only" htmlFor="song-query">곡명, 가수, 초성 검색</label><input id="song-query" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="곡명, 가수, 초성으로 검색해보세요" autoComplete="off"/><button type="submit" className="sb-search-button">검색</button></form>
      <div className="sb-filter-row"><span className="sb-filter-label"><SlidersHorizontal size={15}/>필터</span><label><span className="sb-sr-only">분류</span><select aria-label="분류" value={filters.category || ''} onChange={event => update({category:event.target.value})}><option value="">모든 분류</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label><label><span className="sb-sr-only">가수</span><select aria-label="가수" value={filters.artist || ''} onChange={event => update({artist:event.target.value})}><option value="">모든 가수·작품</option>{artists.map(artist => <option key={artist}>{artist}</option>)}</select></label><label><span className="sb-sr-only">출처</span><select aria-label="출처" value={filters.source || ''} onChange={event => update({source:event.target.value})}><option value="">모든 출처</option>{sourceOptions.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><label><span className="sb-sr-only">신청 상태</span><select aria-label="신청 상태" value={filters.status || ''} onChange={event => update({status:event.target.value})}><option value="">모든 신청 상태</option><option value="available">신청 가능 확인됨</option><option value="unreviewed">본인 확인 전</option></select></label>{activeFilters && <button className="sb-reset" type="button" onClick={() => {setQuery('');update({q:'',category:'',artist:'',source:'',status:''});}}><X size={13}/>초기화</button>}</div>
      <div className="sb-result-bar"><p role="status">{filters.q && <span>‘{filters.q}’ 검색 · </span>}총 <strong>{results.length.toLocaleString()}곡</strong><small> / {songs.length}곡</small></p><div><button className="sb-export" type="button" onClick={() => downloadFile(toCsv(results), 'text/csv;charset=utf-8', 'mir-songbook-draft.csv')}><ArrowDownToLine size={15}/><span>목록 내보내기</span></button><select aria-label="정렬" value={filters.sort || ''} onChange={event => update({sort:event.target.value})}><option value="">제목순</option><option value="artist">가수순</option><option value="sources">출처 많은 순</option><option value="videos">영상 많은 순</option></select></div></div>
      {pagination.items.length ? <><div className="sb-list" data-testid="song-list"><div className="sb-list-head" aria-hidden="true"><span>곡명 · 가수</span><span>분류 · 출처</span><span>영상</span><span>보관</span></div>{pagination.items.map(song => <article className="sb-song" key={song.id} data-song-id={song.id}><button type="button" className="sb-song-title" onClick={() => {setManualCopy(false);update({song:song.id}, false);}} aria-label={`${song.title} 상세 보기`}><span className="sb-small-track" aria-hidden="true"><Music2 size={18}/></span><span><strong>{song.title}</strong><small>{song.artist}</small></span></button><div className="sb-song-meta"><div className="sb-tags">{song.categories.slice(0,2).map(category => <span key={category}>{category}</span>)}</div><small>{[...new Set(song.sources.map(source => source.name))].join(' · ')}</small></div><button type="button" className="sb-video-count" disabled={!song.videoLinks.length} onClick={() => {setManualCopy(false);update({song:song.id}, false);}} aria-label={`${song.title} 연결 영상 ${song.videoLinks.length}개`}>{song.videoLinks.length ? <><ListMusic size={16}/><span>{song.videoLinks.length}</span></> : <span>—</span>}</button><div className="sb-song-actions"><button type="button" className={`sb-icon${favoriteIds.includes(song.id) ? ' is-saved' : ''}`} aria-label={`${song.title} 즐겨찾기`} aria-pressed={favoriteIds.includes(song.id)} onClick={() => toggleFavorite(song.id)}><Heart size={18} fill={favoriteIds.includes(song.id) ? 'currentColor' : 'none'}/></button><button type="button" className="sb-icon sb-copy" aria-label={`${song.title} 곡 정보 복사`} onClick={() => copySong(song)}><Copy size={16}/></button></div></article>)}</div><nav className="sb-pagination" aria-label="노래 목록 페이지"><button type="button" disabled={pagination.page === 1} aria-label="이전 페이지" onClick={() => update({page:String(pagination.page - 1)}, false)}><ChevronLeft size={19}/></button><span><strong>{pagination.page}</strong> / {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} aria-label="다음 페이지" onClick={() => update({page:String(pagination.page + 1)}, false)}><ChevronRight size={19}/></button><small>페이지당 {PAGE_SIZE}곡</small></nav></> : <div className="sb-empty"><Search size={30}/><h2>{filters.view === 'favorites' && !activeFilters ? '아직 보관한 곡이 없어요' : '조건에 맞는 노래가 없어요'}</h2><p>{filters.status === 'available' ? '현재 초안에는 신청 가능 여부를 본인이 승인한 곡이 없습니다.' : '다른 검색어나 필터를 선택해보세요. 하트를 누르면 이 브라우저에 곡을 보관할 수 있어요.'}</p><button className="sb-button" type="button" onClick={() => {setQuery('');setParams({});}}>전체 노래 보기</button></div>}
      <div className="sb-bottom-note"><Check size={16}/><p>즐겨찾기는 이 브라우저에만 저장됩니다. {snapshot.snapshotDate} 수집 자료이며 자동으로 갱신되지 않습니다.</p><Link to="/songbook/review">검토실 <ArrowUpRight size={14}/></Link></div>
    </section>
    {selected && <SongDialog key={selected.id} song={selected} close={() => {setManualCopy(false);update({song:''}, false);}} saved={favoriteIds.includes(selected.id)} toggle={toggleFavorite} copy={copySong} manualCopy={manualCopy} message={message}/>}
    <div className={`sb-toast${message && !selected ? ' is-visible' : ''}`} role="status" aria-live="polite">{selected ? '' : message}</div>
  </div>;
}
