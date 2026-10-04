/** Conservative review-queue triage. Never promotes an uncertain item to a sung song. */
export const TRIAGE_VERSION = '1.1.0';
const stamp = /^[\s└┗ㄴ•·▶▷🎵🎶🎤♪♫-]*(\d{1,3}:\d{2}(?::\d{2})?)(?:\s*[:：-]\s*|\s+)(.*)$/u;
const note = /[🎵🎶🎤♪♫]/u;
const mirSinging = /미르(?:님)?[^\n]{0,25}(?:부르|불러|가창|열창|순서)|(?:부르|불러)[^\n]{0,15}미르(?:님)?/i;
const nonSong = /(?:^|\s)\d+라운드\s*[:：]|후열\s*(?:종겜|게임)|도파미르\s*오락실|오디션\s*플레이\s*인증|PPT\s*발표|일정\s*정리|팀\s*이름\s*후보|얼빡\s*ON|쿨찐\s*미르\s*ON|추가\s*속보|모바일게임이\s*무서운\s*이유|새로운\s*장난감\s*\(\s*얼굴\s*낙서|선생님(?:의|께)\s*노래\s*(?:피드백|배우기)/i;
const mediaHeading = /^(?:(?:카페\s*탐방)[^\n]{0,15})?노래\s*(?:감상|추천)|^커버곡\s*레퍼런스/i;
function contextChange(body, isHeading) {
 const clean=body.replace(/^[\s▼▽▶◆#📢🎵🎶🎤♪♫\[\]]+/u,'').trim();
 if(mediaHeading.test(clean))return 'playback';
 if(/노래\s*(?:뱅|방송)(?:\s|$|시작|[-:])/.test(clean) && clean.length<100 && !/할 때|아닐|했을|클립|감상|추천|이야기|후기/.test(clean))return 'singing';
 if(isHeading && /소통|토크|게임|종겜|합방|싱크룸|노래|방종|미이봤|카페/.test(clean))return 'unknown';
 if(nonSong.test(body))return 'unknown';
 return null;
}
export function pruneTimelineCandidates(candidates,comments,toText=value=>String(value)) {
 const contexts=new Map(), atLine=new Map();
 for(const c of [...comments].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||Number(a.id)-Number(b.id))) {
  const key=String(c.parent_id||c.id)+'|'+String(c.author_hash||'');
  let context=contexts.get(key)||'unknown';
  for(const raw of toText(c.text??c.comment??'').split('\n')) {
   const line=raw.trim();if(!line)continue;
   const m=line.match(stamp),body=m?m[2]:line;
   const changed=contextChange(body,!m || /^[▼▽▶◆#]/.test(line));
   if(changed)context=changed;
   atLine.set(String(c.id)+'|'+line,{context,body});
  }
  contexts.set(key,context);
 }
 return candidates.map(c=>{
  // A user-approved or rejected entry is immutable to this classification pass.
  if(!['auto','pending'].includes(c.decision))return c;
  const data=atLine.get(String(c.comment_id)+'|'+c.line);
  const body=data?.body||c.line.replace(stamp,'$2');
  let reason=null;
  if(nonSong.test(body)&&!mirSinging.test(body))reason='non_song_activity';
  else if(/\[미이봤\]|축하영상|안무가\s*버전|\[금뻑쇼\]/.test(body)&&!mirSinging.test(body))reason='playback_context';
  // A marked song or an explicit Mir vocal can interrupt a media-viewing section.
  else if(data?.context==='playback'&&!note.test(body)&&!mirSinging.test(body))reason='playback_context';
  // These records contain no per-song time and cannot add a new song: retain them
  // in the excluded archive rather than repeatedly asking for a redundant approval.
  else if(c.reason==='section_timestamp_only'&&c.song_id)reason='already_listed_section';
  return reason?{...c,reason,decision:'excluded',parser_version:TRIAGE_VERSION}:c;
 });
}
