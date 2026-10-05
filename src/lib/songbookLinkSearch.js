import {matches,normalize} from './songbookV2.js';

export const LINK_RESULT_STEP=8;
const collator=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
/** Search only public song names/artists/aliases. Never change or merge song IDs. */
export function findLinkSongs(songs,query='') {
 const text=String(query??'').trim(),key=normalize(text);
 if(text&&!key)return [];
 const unique=new Map();
 for(const song of songs||[]) {
  if(typeof song?.id!=='string'||!song.id||typeof song.title!=='string'||typeof song.artist!=='string')continue;
  const aliases=Array.isArray(song.aliases)?song.aliases.filter(v=>typeof v==='string'):[];
  if(matches({...song,aliases,categories:[]},text))unique.set(song.id,song);
 }
 const rank=s=>!key?3:normalize(s.title)===key?0:
  (Array.isArray(s.aliases)?s.aliases:[]).some(a=>typeof a==='string'&&normalize(a)===key)?1:normalize(s.title).startsWith(key)?2:3;
 return [...unique.values()].sort((a,b)=>rank(a)-rank(b)||collator.compare(a.title,b.title)||collator.compare(a.artist,b.artist)||collator.compare(a.id,b.id));
}
/** null means no choice; empty string means an explicitly selected new song. */
export function linkChoiceError(songs,songId) {
 if(songId==='')return '';
 if(songId==null)return '검색 결과에서 곡을 선택하거나 ‘새 노래로 등록’을 눌러 주세요.';
 return songs.some(s=>s.id===songId)?'':'선택한 곡을 더 이상 찾을 수 없습니다. 연결할 곡을 다시 선택해 주세요.';
}
