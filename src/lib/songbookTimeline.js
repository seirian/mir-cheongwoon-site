import {mergeSongs,videoUrl} from './songbookV2.js';
export function timelineSongs(catalog,manual,ratings,automatic,media) {
 const songs=mergeSongs([...catalog,...automatic],manual,ratings), links=new Map(media.map(x=>[x.id,x]));
 return songs.map(s=>{
  const m=links.get(s.id), auto=[...new Set((m?.video_urls||[]).map(videoUrl).filter(Boolean))].slice(0,5);
  return {...s,manualVideoUrls:[...s.videoUrls],videoUrls:[...new Set([...s.videoUrls,...auto])],autoVideoCount:Math.max(0,Number(m?.total_count)||0)};
 });
}
export const reviewReasons = {
 artist_conflict:'동명곡 또는 가수 표기 확인',artist_metadata_required:'정확한 곡명·가수 확인',possible_title_typo:'곡명 오타 가능성',
 possible_title_variant:'다른 표기 또는 버전 확인',partial_or_practice:'부분 가창·연습 여부 확인',song_identity_required:'곡 정보 확인',
 performer_uncertain:'미르님 가창 여부 확인',singing_marker_required:'노래 표시 확인',new_song_requires_review:'새 곡 정보 확인',
 unconfirmed_timeline_author:'새 타임라인 작성자의 기록 확인',section_timestamp_only:'곡별 시간이 없는 노래 구간 목록',
 unstructured_comment:'타임라인 형식 확인',ambiguous_title:'동명곡 확인',ambiguous_credit:'가수 확인',ensemble:'합창·듀엣 확인',clear_timeline:'자동 반영',
 non_song_activity:'게임·소통·레슨 설명 (가창곡 아님)',playback_context:'다른 영상·축하 영상·음원 감상',already_listed_section:'이미 등록된 곡 · 곡별 시간 없는 중복 기록',
 other_performer:'다른 출연자의 가창',playback_or_outro:'음원 재생·감상',description_not_song:'곡이 아닌 설명',
};
export function timeLabel(n){n=Math.max(0,Math.floor(Number(n)||0));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map((v,i)=>i?String(v).padStart(2,'0'):v).join(':');}
export function timelineUrl(vod,seconds){return /^\d{6,12}$/.test(String(vod))&&Number.isInteger(seconds)&&seconds>=0&&seconds<=172800?`https://vod.sooplive.com/player/${vod}?change_second=${seconds}`:null;}
