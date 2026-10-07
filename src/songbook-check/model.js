import {publicSong, selectSongs} from '../lib/songbookV2.js';
import {vodInfo} from '../lib/songbookMedia.js';
import {filterVideoPresence} from '../lib/songbookVideoPresence.js';

export const STATUS = {available:'신청 가능', unreviewed:'확인 필요', unavailable:'신청 불가'};
export const VIDEO_KINDS = {'':'용도 미지정', original:'원곡·공식', mir:'미르 가창', broadcast:'방송 다시보기', other:'기타'};
export const REVIEW_KEY = 'mir-songbook-check-v1';
export const statusOf = value => Object.hasOwn(STATUS,value) ? value : 'unreviewed';
export const keyFor = dataset => `${REVIEW_KEY}:${dataset === 'sample' ? 'sample' : 'snapshot'}`;
export const requestText = song => song.artist ? `${song.artist} - ${song.title}` : song.title;
export function cleanSong(row) {
  const song = publicSong(row);
  const representativeUrl = vodInfo(row.representativeUrl)?.url || '';
  const videoKinds = {};
  for(const url of song.videoUrls) {
    const kind = row.videoKinds?.[url];
    if(Object.hasOwn(VIDEO_KINDS,kind)) videoKinds[url] = kind;
  }
  return {...song,requestStatus:statusOf(song.requestStatus),publicNote:String(row.publicNote||'').slice(0,140),representativeUrl:song.videoUrls.includes(representativeUrl)?representativeUrl:'',videoKinds};
}
export function parseSnapshot(value) {
  if(value?.version!==1 || !Array.isArray(value.songs) || !value.songs.length || value.songs.length>10000 || !Number.isFinite(Date.parse(value.capturedAt))) throw Error('검토용 목록을 불러오지 못했습니다. 다시 불러오거나 샘플 화면으로 확인해 주세요.');
  const ids=new Set();
  for(const row of value.songs) {
    if(typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.title!=='string'||!row.title||typeof row.artist!=='string'||!Array.isArray(row.videoUrls)) throw Error('검토용 목록 형식이 올바르지 않습니다.');
    ids.add(row.id);
  }
  return {version:1,capturedAt:value.capturedAt,songs:value.songs.map(cleanSong)};
}
export function validateEdit(song, input) {
  const artist=String(input.artist??'').trim(), publicNote=String(input.publicNote??'').trim();
  if(artist.length>200 || publicNote.length>140) throw Error('가수는 200자, 공개 안내는 140자 이내로 입력해 주세요.');
  if(!Object.hasOwn(STATUS,input.requestStatus)) throw Error('신청 상태를 선택해 주세요.');
  if(!Array.isArray(input.videoUrls)||input.videoUrls.length>20) throw Error('연결 영상은 최대 20개까지 검토할 수 있습니다.');
  const urls=input.videoUrls.map(url=>vodInfo(url)?.url);
  if(urls.some(url=>!url)) throw Error('YouTube 또는 SOOP 영상 주소를 확인해 주세요.');
  const videoUrls=[...new Set(urls)];
  const representativeUrl=input.representativeUrl?vodInfo(input.representativeUrl)?.url:'';
  if(input.representativeUrl && (!representativeUrl||!videoUrls.includes(representativeUrl))) throw Error('대표 영상은 연결된 영상 중에서 선택해 주세요.');
  // Whitelist only the fields this preview edits; never overwrite difficulty/proficiency or catalog identity.
  return cleanSong({...song,artist,publicNote,requestStatus:input.requestStatus,videoUrls,representativeUrl,videoKinds:input.videoKinds});
}
export function readEdits(storage,dataset) {
  const raw=storage.getItem(keyFor(dataset));
  if(!raw)return {};
  const parsed=JSON.parse(raw);
  if(parsed.version!==1 || !parsed.edits || typeof parsed.edits!=='object'||Array.isArray(parsed.edits)) throw Error('저장된 검토 변경을 읽지 못했습니다. 검토 변경 초기화 후 다시 시도해 주세요.');
  return parsed.edits;
}
export function mergeEdits(songs,edits) {
  return songs.map(song=>Object.hasOwn(edits,song.id)?validateEdit(song,edits[song.id]):song);
}
export function persistEdit(storage,dataset,edits,song,draft) {
  const saved=validateEdit(song,draft);
  const {artist,publicNote,requestStatus,videoUrls,representativeUrl,videoKinds}=saved;
  const next={...edits,[song.id]:{artist,publicNote,requestStatus,videoUrls,representativeUrl,videoKinds}};
  try{storage.setItem(keyFor(dataset),JSON.stringify({version:1,edits:next}));}
  catch{throw Error('브라우저에 저장하지 못했습니다. 변경 내용을 유지했으니 저장 공간·차단 설정을 확인하고 다시 시도해 주세요.');}
  return next;
}
export function selectCheckSongs(songs,params,favorites,admin) {
  let result=filterVideoPresence(selectSongs(songs,params,favorites),params,admin);
  const status=params.get('request');
  if(Object.hasOwn(STATUS,status))result=result.filter(song=>song.requestStatus===status);
  if(admin) {
    const attention=params.get('attention');
    if(attention==='representative')result=result.filter(song=>!song.representativeUrl);
    if(attention==='artist')result=result.filter(song=>!song.artist);
    if(attention==='proficiency')result=result.filter(song=>song.proficiency===null);
    if(attention==='status')result=result.filter(song=>song.requestStatus==='unreviewed');
  }
  return result;
}
export function shareLink(origin,base,id,dataset='snapshot') {
  const root=new URL(base,origin);
  const url=new URL('songbook/',root.href.endsWith('/')?root.href:root.href+'/');
  url.searchParams.set('song',id);
  if(dataset==='sample')url.searchParams.set('data','sample');
  return url.href;
}
export function representative(song) {
  return song.representativeUrl ? vodInfo(song.representativeUrl) : null;
}
const sample=(n,title,status,urls,extra={})=>cleanSong({id:`check-sample-${n}`,title:`[검토 샘플] ${title}`,artist:'예시 가수',categories:['가요'],aliases:[],videoUrls:urls,requestStatus:status,difficulty:3,proficiency:null,...extra});
const y='https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const s='https://vod.sooplive.com/player/123456789?change_second=60';
export const SAMPLE_SONGS=[
 sample(1,'신청 가능한 곡','available',[y],{proficiency:4,representativeUrl:y,publicNote:'기능 확인용 안내입니다. 실제 신청 가능 판정이 아닙니다.'}),
 sample(2,'유튜브 보완 대상','unreviewed',[s]),
 sample(3,'지금은 쉬어가는 곡','unavailable',[],{publicNote:'이 상태에서는 신청 문구를 복사할 수 없습니다.'}),
 sample(4,'가수 확인이 필요한 곡','unreviewed',[],{artist:'',difficulty:null}),
 sample(5,'대표 영상 선택 연습','available',[y,s],{categories:['J-POP · 애니'],proficiency:3}),
 sample(6,'평가 전인 곡','available',[],{difficulty:null}),
];
