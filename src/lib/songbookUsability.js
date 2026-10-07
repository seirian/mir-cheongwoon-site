import {selectSongs,publicSong,videoUrl} from './songbookV2.js';
import {filterVideoPresence} from './songbookVideoPresence.js';
import {REQUEST_STATES,firstYoutube,usageFields,usagePayload} from './songbookUsage.js';

export function enrichUsage(song) {return {...song,...usageFields(song),requestStatus:Object.hasOwn(REQUEST_STATES,song.requestStatus)?song.requestStatus:'unreviewed'};}
export function selectUsageSongs(songs,params,favorites,admin) {
  let result=filterVideoPresence(selectSongs(songs,params,favorites),params,admin);
  const status=params.get('request');
  if(Object.hasOwn(REQUEST_STATES,status))result=result.filter(song=>song.requestStatus===status);
  if(admin===true)switch(params.get('attention')) {
    case 'representative':result=result.filter(song=>!firstYoutube(song));break;
    case 'artist':result=result.filter(song=>!song.artist);break;
    case 'proficiency':result=result.filter(song=>song.proficiency===null);break;
    case 'status':result=result.filter(song=>song.requestStatus==='unreviewed');break;
  }
  return result;
}
export const requestText = song => song.artist?`${song.artist} - ${song.title}`:song.title;
export function publicSongLink(origin,base,id) {
  const root=new URL(base,origin),url=new URL('songbook/',root.href.endsWith('/')?root.href:root.href+'/');
  url.searchParams.set('song',id);return url.href;
}
export function quickDraft(song,revision) {
  const manual=[...(song.manualVideoUrls??song.videoUrls)];
  return {...enrichUsage(song),videoUrls:manual,automaticVideoUrls:song.videoUrls.filter(url=>!manual.includes(url)),expectedRevision:revision};
}
export function quickPayload(original,edited) {
  // Whitelist changes while retaining identity, categories, aliases, artwork and difficulty.
  const manual=edited.videoUrls;
  return {...publicSong(original),artist:edited.artist,requestStatus:edited.requestStatus,publicNote:edited.publicNote,
    videoUrls:manual,videoKinds:edited.videoKinds,expectedRevision:original.expectedRevision};
}

export function validateQuickEdit(song,input,{maxLinks=20}={}) {
  const artist=String(input.artist??'').trim(),publicNote=String(input.publicNote??'').trim();
  if(artist.length>200||publicNote.length>140)throw Error('가수는 200자, 공개 안내는 140자 이내로 입력해 주세요.');
  if(!Object.hasOwn(REQUEST_STATES,input.requestStatus))throw Error('신청 상태를 선택해 주세요.');
  if(!Array.isArray(input.videoUrls)||input.videoUrls.length>maxLinks)throw Error(`직접 연결하는 영상은 ${maxLinks}개까지 저장할 수 있습니다.`);
  const videoUrls=publicSong({...song,videoUrls:input.videoUrls}).videoUrls;
  if(input.videoUrls.some(url=>!videoUrl(url)))throw Error('YouTube 또는 SOOP 영상 주소를 확인해 주세요.');
  const fields=usagePayload({...input,publicNote},videoUrls);
  const result={...song,artist,requestStatus:input.requestStatus,videoUrls,publicNote,videoKinds:fields.video_kinds||{}};
  return {...result,representativeUrl:firstYoutube(result)?.url||''};
}
