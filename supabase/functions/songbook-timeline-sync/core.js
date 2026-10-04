import {pruneTimelineCandidates} from './triage.js';
import {titleAliases} from './aliases.js';
/** Pure timeline rules shared by the scheduled worker, import endpoint and tests. */
export const CHANNEL = 'alice427';
export const STATION = 24957466;
export const BBS = 90135165;
export const SINCE = Date.parse('2025-01-01T00:00:00+09:00');
export const DELAY = 7 * 86400000;
export const PARSER_VERSION = '1.1.0';
export const norm = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ko').replace(/[\p{P}\p{Z}\p{S}\s]+/gu, '');
const SONG_ID = /^(?:mir-[a-f0-9]{12}|custom-[a-f0-9-]{36})$/;
const NOTES = /[🎵🎶🎤♪♫]/u;
const PARTIAL = /[0-9]+트|피드백|수련|목풀기|한\s*소절|짧게|짤노래|찍먹|메들리|(?:^|\s)[12]절(?:\s|$)|후렴만|조금만|잠깐만|연습|부분\s*가창/i;
const PLAYBACK = /모니터링|립싱크|틀어|듣기|듣는|들어보|감상|도방|리액션|뮤비|m\s*\/\s*v|(?:^|\s)(?:bgm|mr|mv)(?:\s|$)|ai\s*커버|원곡\s*재생|방종곡|엔딩곡\s*재생/i;
const CHAT = /보여주는|부르는|불러주는|부르기|소통|노가리|토론|구간|노래\s*설명|가창법|발성|관련|반응|마이크\s*(?:온|off|on)|페이셜|시작|종료|공지|준비|이야기|후기|광고|노래하는|드시는|알려주|말씀|목\s*푸는|분석|레슨/i;
export function textOnly(value) {
  if (typeof value !== 'string' || value.length > 120000) throw Error('comment_size');
  return value.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e) => {
      if (e[0] !== '#') return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[e.toLowerCase()];
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2),16) : Number(e.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }).replace(/\r/g, '').replace(/[\u200b-\u200d\ufeff]/g, '');
}
export function eligible(vod, now = Date.now()) {
  const uploaded = Date.parse(vod.uploaded_at);
  return vod.channel_id === CHANNEL && Number(vod.station_no) === STATION && Number(vod.bbs_no) === BBS &&
    /^\d{6,12}$/.test(String(vod.id)) && vod.public === true && Number.isInteger(vod.duration_seconds) && vod.duration_seconds > 0 &&
    Number.isFinite(uploaded) && uploaded >= SINCE && uploaded + DELAY <= now;
}
export function nextCheck(vod, now = Date.now(), failed = false) {
  const upload = Date.parse(vod.uploaded_at);
  if (!Number.isFinite(upload)) throw Error('upload_date');
  if (upload + DELAY > now) return new Date(upload + DELAY).toISOString();
  const age = (now-upload)/86400000;
  return new Date(now + (failed ? 86400000 : age <= 28 ? 86400000 : age <= 90 ? 7*86400000 : 30*86400000)).toISOString();
}
export function parseTime(value) {
  const parts = String(value).split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(n => !Number.isInteger(n) || n < 0)) return null;
  if (parts.at(-1) > 59 || (parts.length === 3 && parts[1] > 59)) return null;
  const n = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts[0]*60+parts[1];
  return n <= 172800 ? n : null;
}
const ARTIST_GROUPS = [
 ['미세스 그린애플','Mrs. GREEN APPLE','ミセスグリーンアップル'],
 ['오피셜히게단디즘','Official髭男dism','Official Higedandism','Official Hige Dandism','히게단'],
 ['아도','Ado'],['우즈','WOODZ'],['범프 오브 치킨','BUMP OF CHICKEN'],['바운디','Vaundy'],['에메','Aimer'],
 ['험프백','Hump Back'],['스파이에어','SPYAIR'],['세카이노오와리','SEKAI NO OWARI'],['츠키','tuki.'],
 ['요아소비','YOASOBI'],['이브','Eve'],['유우리','Yuuri','優里'],['티케이','TK from Ling tosite sigure'],
 ['노벨브라이트','Novelbright'],['미르','미르(MIR)','MIR'],['체리필터','Cherry Filter'],['호시노 겐','Gen Hoshino'],
 ['녹황색사회','Ryokuoushoku Shakai','緑黄色社会'],['원오크락','ONE OK ROCK'],['히구치 아이','Ai Higuchi'],['요네즈 켄시','Kenshi Yonezu']
 ];
export function artistKey(x) {
 const clean=String(x).replace(/\([^)]*(?:OST|주제곡|삽입곡)[^)]*\)/gi,'').trim();
 const k=norm(clean);return norm(ARTIST_GROUPS.find(g=>g.some(v=>norm(v)===k))?.[0]||clean);
}
function sameArtist(a,b) {
 const variants=x=>[x,...(String(x).match(/\(([^)]*)\)/g)||[]).map(v=>v.slice(1,-1)),String(x).replace(/\([^)]*\)/g,'').trim()].filter(Boolean).map(artistKey);
 return variants(a).some(k=>variants(b).includes(k));
}
function titleVariants(x){return [x,...(String(x).match(/\(([^)]*)\)/g)||[]).map(v=>v.slice(1,-1)),String(x).replace(/\([^)]*\)/g,'').trim()].filter(Boolean);}
function clean(value) {
  return String(value).replace(/[🎵🎶🎤♪♫💙❤️🐼]+/gu,' ').replace(/^\s*(?:[└┗ㄴ•·▶▷▼▽◆◇#*\-–—:：]+\s*)+/, '')
    .replace(/^\d{1,2}[.)]\s*/, '').replace(/\s*\([+-]?\d+\s*키\)/gi,'').replace(/\s*\((?:완곡|완창|노래)\)\s*$/,'').replace(/\s+/g,' ').trim();
}
function looksName(x) {
  return x && x.length <= 150 && x.split(/\s+/).length <= 20 && /[\p{L}\p{N}]/u.test(x) && !/[<>]|https?:|[?？]/i.test(x);
}
function nearName(a,b) {
 if(Math.abs(a.length-b.length)>1||Math.min(a.length,b.length)<3)return false;
 let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;}else{if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}}
 return edits+(a.length-i)+(b.length-j)<=1;
}
export function catalogIndex(catalog) {
  const byTitle = new Map();
  for (const row of catalog) {
    if (!SONG_ID.test(row.id) || !row.title || !row.artist) continue;
    const names=[row.title,...(row.aliases||[])];
    for(const [id,title,artist,variants] of titleAliases)if(row.id===id&&norm(row.title)===norm(title)&&artistKey(row.artist)===artistKey(artist))names.push(...variants);
    const bracketTitle=row.title.match(/^([^()]+)\([^()]+\)$/);if(bracketTitle)names.push(bracketTitle[1].trim());
    for (const a of row.aliases||[]) {if(a.startsWith(row.title+' '))names.push(a.slice(row.title.length+1));else if(a.endsWith(' '+row.title))names.push(a.slice(0,-row.title.length-1));}
    for (const name of names) {
      const k=norm(name); if (!k) continue;
      if (!byTitle.has(k)) byTitle.set(k,[]);
      if (!byTitle.get(k).some(s=>s.id===row.id)) byTitle.get(k).push(row);
    }
  }
  return byTitle;
}
function resolveLabel(label,index) {
  let parts=label.split(/\s+[-–—]\s+|\s*[／]\s*/).map(clean).filter(Boolean);
  const direct = index.get(norm(label)) || [];
  if (direct.length===1) return {song:direct[0],title:direct[0].title,artist:direct[0].artist,explicit:false};
  if (direct.length>1) return {title:label,artist:'',reason:'ambiguous_title'};
  if (parts.length===2) {
    const [a,b]=parts;
    const ab=titleVariants(a).flatMap(t=>index.get(norm(t))||[]).filter(x=>sameArtist(x.artist,b));
    const ba=titleVariants(b).flatMap(t=>index.get(norm(t))||[]).filter(x=>sameArtist(x.artist,a));
    const matches=[...new Map([...ab,...ba].map(x=>[x.id,x])).values()];
    if (matches.length===1) return {song:matches[0],title:matches[0].title,artist:matches[0].artist,explicit:true};
    if (matches.length>1) return {title:a,artist:b,reason:'ambiguous_credit'};
    // The observed timeline convention is title - artist; never silently use a different artist's same-title recording.
    if ((index.get(norm(a))||[]).length || (index.get(norm(b))||[]).length) return {title:a,artist:b,reason:'artist_conflict',explicit:true};
    if (looksName(a)&&looksName(b)) return {title:a,artist:b,explicit:true,unknown:true};
  }
  const paren=label.match(/^(.+?)\s+\(([^()]{1,100})\)$/);
  if(paren) return resolveLabel(paren[1]+' - '+paren[2],index);
  return {title:label,artist:'',reason:'song_identity_required'};
}
/** Extract song candidates only, not a copy of the whole comment. No HTML is rendered. */
export function parseTimeline(vod, comments, catalog, trustedAuthors = []) {
  if (!Array.isArray(comments) || comments.length > 300) throw Error('comment_count_limit');
  const index=catalogIndex(catalog), result=[], trusted=new Set(trustedAuthors), contexts=new Map();
  const knownArtists=new Set([...catalog.map(x=>artistKey(x.artist)),...ARTIST_GROUPS.flat().map(artistKey)]);
  const collaboration = /싱크룸|노래\s*사무소|합방|합동|듀엣|(?:\s|\[)(?:w\.|with)\s/i.test(vod.title || '');
  const ordered=[...comments].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id)-Number(b.id));
  for (const comment of ordered) {
    const text=textOnly(comment.text ?? comment.comment ?? '');
    const key=String(comment.parent_id || comment.id)+'|'+String(comment.author_hash || '');
    let section=contexts.get(key)?.section||'unknown', sectionTime=contexts.get(key)?.time||null;
    const structural=(text.match(/(?:^|\n)[^\n\d]{0,10}\d{1,3}:\d{2}(?::\d{2})?/g)||[]).length >= 3 ||
      Boolean(comment.parent_id && contexts.has(key));
    for (const raw of text.split('\n')) {
      const line=raw.trim(); if (!line) continue;
      let sectionOnly=false;
      let stamp=line.match(/^(?:[\s└┗ㄴ•·▶▷🎵🎶🎤♪♫\-]*)?(\d{1,3}:\d{2}(?::\d{2})?)(?:\s*[:：\-]\s*|\s+|(?=[\p{L}]))(.*)$/u);
      if(!stamp && section==='singing' && sectionTime && /^\d{1,2}[.)]\s+/.test(line)){stamp=[line,sectionTime,line];sectionOnly=true;}
      if (!stamp) {
        if (PLAYBACK.test(line)) section='playback';
        else if (/노래\s*(?:뱅|방송|방|부르기)|가창\s*타임|^\[(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열).*곡\]/i.test(line) && line.length<80) section='singing';
        else if (/싱크룸|노래\s*사무소|합동|듀엣/.test(line)&&line.length<100) section='collaboration';
        else if (/^[▼▽▶◆#]|^(?:예열|후열|중간|1부|2부)\s*(?:소통|토크)|게임\s*시작/.test(line)) section='unknown';
        continue;
      }
      const seconds=parseTime(stamp[1]), body=stamp[2].trim(); let marked=NOTES.test(line);
      if (seconds===null || seconds>=vod.duration_seconds || body.length>600) continue;
      let [label,...credits]=body.split(/\s*[|｜]\s*/);let performer=credits.join(' | ');
      const cover=label.match(/\(cover\.?\s*([^)]*)\)/i);
      if(cover){performer=cover[1];label=label.replace(cover[0],'');marked=true;}
      if(/^(?:모캡\s*)?노래\s*[/:]/.test(label)){label=label.replace(/^(?:모캡\s*)?노래\s*[/:]\s*/,'');marked=true;}
      const emojiCredit=label.match(/\s+-\s+([\p{Extended_Pictographic}\uFE0F]+)\s*([^|]+)$/u);
      if(emojiCredit){performer=emojiCredit[2];label=label.slice(0,emojiCredit.index);}
      label=clean(label);performer=clean(performer);
      if(/노래\s*뱅/.test(body)&&label.length<80&&!/ - /.test(body)){section='singing';sectionTime=stamp[1];continue;}
      const found=resolveLabel(label,index);
      if (!marked && section!=='singing' && !found.song) {
        if (/소통|게임|토론|합방|싱크룸|후열/.test(body)) section='unknown';
        continue;
      }
      if (!looksName(label)) continue;
      if(!marked && (!found.song && (!found.explicit || CHAT.test(body) || /미르님|구르미|ASMR/i.test(body)))) continue;
      let reason=found.reason||'clear_timeline', decision='pending';
      if (PLAYBACK.test(body) || section==='playback') reason='playback_or_outro';
      else if (performer && !/미르(?:님)?|\bMIR\b|본인/i.test(performer)) reason='other_performer';
      else if (PARTIAL.test(body)) reason='partial_or_practice';
      else if (CHAT.test(body) && !found.song) reason='description_not_song';
      else if ((collaboration || section==='collaboration') && !performer) reason='performer_uncertain';
      else if (performer && /(?:미르(?:님)?|MIR).*(?:[&+]|함께|듀엣)|(?:[&+]).*(?:미르|MIR)/i.test(performer)) reason='ensemble';
      else if(sectionOnly)reason='section_timestamp_only';
      else if (!structural) reason='unstructured_comment';
      else if (!trusted.has(String(comment.author_hash))) reason='unconfirmed_timeline_author';
      else if (found.reason) reason=found.reason;
      else if(found.unknown && !knownArtists.has(artistKey(found.artist)))reason='artist_metadata_required';
      else if(found.unknown && ((index.get(norm(found.title.replace(/\([^)]*\)/g,'')))||[]).length))reason='possible_title_variant';
      else if(found.unknown && catalog.some(x=>artistKey(x.artist)===artistKey(found.artist)&&nearName(norm(x.title),norm(found.title))))reason='possible_title_typo';
      else if(found.unknown && (/(?:OST|주제곡|삽입곡|목풀기|불러|모찌송|[()])/i.test(found.artist)))reason='artist_metadata_required';
      else if (!marked && section!=='singing') reason='singing_marker_required';
      else if (found.unknown && !marked && !ARTIST_GROUPS.some(g=>g.some(a=>artistKey(a)===artistKey(found.artist)))) reason='new_song_requires_review';
      else decision='auto';
      if (['other_performer','playback_or_outro','description_not_song'].includes(reason)) decision='excluded';
      result.push({vod_id:String(vod.id),comment_id:String(comment.id),parent_id:String(comment.parent_id||''),seconds,
        title:found.title.slice(0,200),artist:found.artist.slice(0,200),song_id:found.song?.id||null,
        line:line.slice(0,500),reason,decision,marked,author_hash:String(comment.author_hash||''),
        section,parser_version:PARSER_VERSION});
    }
    contexts.set(key,{section,time:sectionTime});
  }
  return result;
}
export async function hexHash(text) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function identifyCandidates(candidates) {
  const out=[];
  for (const c of candidates) out.push({...c,id:await hexHash(`${c.vod_id}|${c.comment_id}|${c.seconds}|${norm(c.line)}`)});
  return out;
}
export function publicVod(row) {
  const u=row.ucc || {}, upload=String(row.reg_date||'');
  if (row.user_id!==CHANNEL || Number(row.station_no)!==STATION) throw Error('vod_channel_contract');
  if(u.file_type!=='REVIEW')return null;
  if(Number(row.bbs_no)!==BBS)throw Error('vod_board_contract');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(upload)) throw Error('vod_upload_contract');
  return {id:String(row.title_no),channel_id:CHANNEL,station_no:STATION,bbs_no:BBS,board_type:105,title:String(row.title_name||'').slice(0,200),
    uploaded_at:upload.replace(' ','T')+'+09:00',duration_seconds:Math.floor(Number(u.total_file_duration)/1000),
    public:Number(row.auth_no)===101 && Number(u.grade)===0 && !u.paid_ppv,comment_count:Number(row.count?.comment_cnt||0)};
}
export function validGithubClaims(p) {
  return (!p.job_workflow_ref || p.job_workflow_ref === p.workflow_ref) && p.repository_id==='1366316295' && p.repository_owner_id==='1607031' && p.repository==='seirian/mir-cheongwoon-site' &&
    ['refs/heads/main','refs/heads/develop'].includes(p.ref) && ['workflow_run','workflow_dispatch'].includes(p.event_name) &&
    p.workflow_ref===`seirian/mir-cheongwoon-site/.github/workflows/songbook-timeline-backfill.yml@${p.ref}` &&
    p.runner_environment==='github-hosted' && /^\d+$/.test(String(p.run_id)) && /^\d+$/.test(String(p.run_attempt));
}
export async function newSongIdentity(title,artist) {
  if(!looksName(title)||!looksName(artist))throw Error('song_identity');
  const identity_key=norm(title)+'|'+artistKey(artist), h=await hexHash(identity_key);
  const id='custom-'+[h.slice(0,8),h.slice(8,12),'5'+h.slice(13,16),'a'+h.slice(17,20),h.slice(20,32)].join('-');
  return {id,identity_key,title,artist,create:true};
}
export async function prepareCandidates(vod,comments,catalog,trustedAuthors) {
  const list=await identifyCandidates(pruneTimelineCandidates(parseTimeline(vod,comments,catalog,trustedAuthors),comments,textOnly));
  for(const c of list) {
    if(c.decision==='auto'&&!c.song_id)c.new_song=await newSongIdentity(c.title,c.artist);
    // Only minimal song evidence enters the database; author hashes are used in memory for trust matching.
    delete c.author_hash;delete c.parent_id;delete c.section;delete c.marked;
  }
  if(list.length>500)throw Error('candidate_limit');
  return list;
}