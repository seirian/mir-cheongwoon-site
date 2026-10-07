import {coverFor,vodInfo} from './songbookMedia.js';
/** Presentation preference only; never changes catalog filters, ordering or pagination. */
export const SONGBOOK_LAYOUT_KEY='mir-songbook-layout-v1';
export const SONGBOOK_LAYOUTS=['list','cover'];
export const isSongbookLayout=value=>SONGBOOK_LAYOUTS.includes(value);
export function readSongbookLayout(storage,key=SONGBOOK_LAYOUT_KEY) {
  try {const value=storage?.getItem(key);return isSongbookLayout(value)?value:'list';}
  catch {return 'list';}
}
export function resolveSongbookLayout(value,preferred='list') {
  // Explicit URL choices override this browser's preference, without rewriting it.
  if(value!==null&&value!==undefined)return isSongbookLayout(value)?value:'list';
  return isSongbookLayout(preferred)?preferred:'list';
}
export function writeSongbookLayout(storage,value,key=SONGBOOK_LAYOUT_KEY) {
  if(!isSongbookLayout(value))return false;
  try {storage?.setItem(key,value);return Boolean(storage);}catch {return false;}
}

/** Reuse validated album/video URLs. Never infer new artwork or external music metadata. */
export function coverChoices(song) {
  const cover=coverFor(song),video=(song.videoUrls||[]).map(vodInfo).find(v=>v?.thumbnail);
  const fallback=video?{url:video.thumbnail,href:video.url,kind:'video',label:'연결 영상 썸네일'}:null;
  return [cover,fallback].filter((c,i,all)=>c&&all.findIndex(x=>x?.url===c.url)===i);
}
