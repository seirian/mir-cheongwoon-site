import {vodInfo, vodLinks, musicUrl} from './songbookMedia.js';
import {searchRows} from './songbookSearchLocale.js';
export const PLATFORM_NAMES = {apple:'Apple Music',youtube:'YouTube',melon:'Melon'};
export const PLATFORM_DRAFT_KEY = 'mir-songbook-platform-review-v1';
export function externalSearch(provider, query='') {
  const term=String(query).trim().slice(0,300);
  if(provider==='youtube')return 'https://www.youtube.com/results?'+new URLSearchParams({search_query:term});
  if(provider==='melon')return 'https://www.melon.com/search/song/index.htm?'+new URLSearchParams({q:term});
  return '';
}
export function melonSongUrl(value) {
  try {const u=new URL(value);const id=u.searchParams.get('songId');return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['www.melon.com','melon.com'].includes(u.hostname)&&u.pathname==='/song/detail.htm'&&/^\d{1,12}$/.test(id||'')?'https://www.melon.com/song/detail.htm?songId='+id:'';}catch{return '';}
}
export function platformRows(provider,rows,songs=[]) {
  if(!Array.isArray(rows))return [];
  if(provider==='apple')return searchRows(rows.filter(r=>String(r?.key||'').startsWith('itunes:')&&musicUrl(r.musicUrl)),songs).map(r=>({...r,provider:'apple'}));
  if(provider!=='youtube')return [];
  const seen=new Set();
  return rows.flatMap(r=>{
    const video=vodInfo(r?.videoUrl);if(!video||video.platform!=='youtube'||typeof r.title!=='string'||!r.title.trim()||seen.has(video.url))return [];
    seen.add(video.url);
    return [{provider:'youtube',key:'youtube:'+video.id,title:r.title.slice(0,200),artist:'',channel:typeof r.channel==='string'?r.channel.slice(0,200):'',videoUrl:video.url,thumbnail:video.thumbnail,aliases:[]}];
  });
}
export function videoSelection(draft,result) {
  const video=vodInfo(result.videoUrl);if(!video||video.platform!=='youtube')throw Error('YouTube 영상 주소를 확인해 주세요.');
  const urls=vodLinks([...(draft.videoUrls||[]),video.url]).map(v=>v.url);
  if(urls.length>10)throw Error('연결 영상은 10개까지 추가할 수 있습니다.');
  return {...draft,title:draft.title||result.title,artist:draft.artist||'',videoUrls:urls};
}
