import {vodInfo} from './songbookMedia.js';

// Public, non-private song notes. This file contains neither preview fixtures nor authentication.
export const REQUEST_STATES = {available:'신청 가능',unreviewed:'확인 필요',unavailable:'신청 불가'};
export const VIDEO_KINDS = {'':'용도 미지정',original:'원곡·공식',mir:'미르 가창',broadcast:'방송 다시보기',other:'기타'};
export function usageFields(row) {
  const publicNote=typeof (row.publicNote??row.public_note)==='string'?(row.publicNote??row.public_note).slice(0,140):'';
  const raw=row.videoKinds??row.video_kinds,videoKinds={};
  if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(const [address,kind] of Object.entries(raw)) {
    const url=vodInfo(address)?.url;
    if(url&&Object.hasOwn(VIDEO_KINDS,kind))videoKinds[url]=kind;
  }
  return {publicNote,videoKinds};
}
export function usagePayload(input,urls) {
  const payload={};
  // Old clients/preview schemas can omit these fields. Never clear them simply because they were omitted.
  if(Object.hasOwn(input,'publicNote')) {
    if(typeof input.publicNote!=='string'||input.publicNote.trim().length>140)throw Error('공개 안내는 140자 이내로 입력해 주세요.');
    payload.public_note=input.publicNote.trim();
  }
  if(Object.hasOwn(input,'videoKinds')) {
    if(!input.videoKinds||typeof input.videoKinds!=='object'||Array.isArray(input.videoKinds))throw Error('영상 용도를 확인해 주세요.');
    const kinds={};
    for(const [address,kind] of Object.entries(input.videoKinds)) {
      if(!Object.hasOwn(VIDEO_KINDS,kind))throw Error('영상 용도를 확인해 주세요.');
      const url=vodInfo(address)?.url;
      if(!url)throw Error('영상 용도의 연결 주소를 확인해 주세요.');
      if(urls.includes(url))kinds[url]=kind;
    }
    payload.video_kinds=kinds;
  }
  return payload;
}
export const firstYoutube = song => (song.videoUrls||[]).map(vodInfo).find(v=>v?.platform==='youtube')||null;
