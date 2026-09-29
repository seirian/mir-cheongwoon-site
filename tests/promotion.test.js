import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarIcs, canonicalVideoUrl, getKstDateKey, getKstCivilDate, getUpcomingEvents, isPublishableMember, isValidDateKey, safeExternalUrl, selectEditorialVideo } from '../src/lib/promotion.js';
import { getPageMetadata, metadataRoutes } from '../src/data/pageMetadata.js';
import { createReadOnlyFetch } from '../src/lib/previewFetch.js';
import { renderPageHead } from '../scripts/page-metadata.mjs';
import { performances } from '../src/data/promotionData.js';

const date = new Date('2026-09-28T16:00:00Z'); // Sept 29 01:00 KST, independently of runner TZ.
const event = {id:'calendar-test',event_date:'2026-09-29',title:'테스트 일정',category:'특별',start_time:'20:00:00'};
const video = {title:'푸름과 여름 테스트',youtube_url:'https://www.youtube.com/watch?v=abcdefghijk'};

test('incomplete member templates are not published, real names stay visible', () => {
  const valid={name:'Ray',position:'GUITAR',comment:'소개'};
  assert.equal(isPublishableMember(valid),true);
  for (const changed of [{name:'멤버 04'},{name:'Member08'},{position:'Position'},{comment:'한 줄 코멘트를 입력하세요.'},{comment:'준비 중'},{is_published:false},{status:'draft'},{comment:'  '}]) assert.equal(isPublishableMember({...valid,...changed}),false);
  assert.equal(isPublishableMember(null),false);
});
test('external links reject executable schemes and credential URLs', () => {
  for(const url of ['javascript:alert(1)','data:text/html,hi','https://user:pass@example.com','/relative']) assert.equal(safeExternalUrl(url),'');
  assert.equal(safeExternalUrl('https://example.com'),'https://example.com/');
});
test('video pins validate IDs, preserve explicit timestamps and strip tracking', () => {
  assert.equal(canonicalVideoUrl('https://youtu.be/abcdefghijk?foo=bar',75),'https://www.youtube.com/watch?v=abcdefghijk&t=75s');
  for(const url of ['https://evil.com/watch?v=abcdefghijk','https://www.youtube.com/watch?v=short','javascript:alert(1)']) assert.equal(canonicalVideoUrl(url),'');
});
test('editorial music recommendations never fall back to unrelated latest content', () => {
  const pick={source:'covers',candidates:['푸름과 여름'],youtubeUrl:''};
  assert.equal(selectEditorialVideo(pick,[video]),video);
  assert.equal(selectEditorialVideo(pick,[],[video]),null);
  assert.equal(selectEditorialVideo({...pick,youtubeUrl:video.youtube_url},[]).pinned,true);
  assert.equal(selectEditorialVideo({source:'recent',candidates:['missing']},[],[video]),video);
});
test('Korea civil dates cross midnight independently of browser time zone', () => {
  assert.equal(getKstDateKey(new Date('2026-09-28T14:59:59Z')),'2026-09-28');
  assert.equal(getKstDateKey(new Date('2026-09-28T15:00:00Z')),'2026-09-29');
  const civil=getKstCivilDate(date);assert.equal(civil.getDate(),29);assert.equal(civil.getHours(),1);
});
test('dates reject rollover/nonexistent calendar dates', () => {
  assert.equal(isValidDateKey('2026-02-29'),false);assert.equal(isValidDateKey('2028-02-29'),true);
  assert.equal(isValidDateKey('2026-13-01'),false);assert.equal(isValidDateKey('bad'),false);
});
test('upcoming events exclude past, canceled, draft, break and practice', () => {
  const invalid=[{event_date:'2026-09-28'},{start_time:'00:30'},{title:'휴방'},{category:'휴방'},{title:'정기 밴드 연습'},{title:'방송 취소'},{status:'cancelled'},{status:'draft'},{is_published:false},{event_date:'bad'},{title:''}].map((entry)=>({...event,...entry}));
  assert.deepEqual(getUpcomingEvents(invalid,date),[]);
  const later={...event,id:'later',event_date:'2026-09-30'};
  const unknown={...event,id:'unknown',start_time:null};
  assert.deepEqual(getUpcomingEvents([later,unknown,event],date).map(x=>x.id),['calendar-test','unknown','later']);
  assert.equal(getUpcomingEvents([event,later],date,1).length,1);
});
test('ICS timed event converts KST to UTC without inventing end time', () => {
  const result=buildCalendarIcs(event,date);
  assert.match(result,/DTSTART:20260929T110000Z\r\n/);assert.doesNotMatch(result,/DTEND:/);
  assert.match(result,/DTSTAMP:20260928T160000Z\r\n/);assert.ok(result.endsWith('\r\n'));
});
test('ICS unknown time is explicit all-day date with exclusive end, leap day works', () => {
  const result=buildCalendarIcs({...event,start_time:null,event_date:'2028-02-29'},date).replace(/\r\n /g,'');
  assert.match(result,/DTSTART;VALUE=DATE:20280229/);assert.match(result,/DTEND;VALUE=DATE:20280301/);assert.match(result,/시작 시간 미정/);
  assert.throws(()=>buildCalendarIcs({...event,event_date:'2026-02-29'},date));
});
test('ICS overnight end, text escaping and UTF8 75 octet folding', () => {
  const result=buildCalendarIcs({...event,start_time:'23:00',end_time:'01:00',title:'제목,;\\\n'+ '가'.repeat(100),link_url:'javascript:alert(1)'},date);
  assert.match(result,/DTEND:20260929T160000Z/);assert.match(result,/SUMMARY:제목\\,\\;\\\\\\n/);assert.doesNotMatch(result,/URL:/);
  for(const line of result.split('\r\n')) assert.ok(Buffer.byteLength(line,'utf8')<=75);
});
test('read-only preview blocks all mutation methods before network and allows GET/HEAD', async () => {
  let calls=0;const fetcher=createReadOnlyFetch(async()=>{calls++;return new Response('ok');});
  for(const method of ['POST','PUT','PATCH','DELETE']) {const result=await fetcher('https://example.com',{method});assert.equal(result.status,403);}
  assert.equal((await fetcher(new Request('https://example.com',{method:'POST'}))).status,403);
  assert.equal(calls,0);await fetcher('https://example.com');await fetcher('https://example.com',{method:'HEAD'});assert.equal(calls,2);
});
test('every known performance has unique share path and no fabricated recording times', () => {
  assert.equal(new Set(performances.map(e=>e.slug)).size,performances.length);
  for(const e of performances){assert.ok(e.slug);assert.ok(isValidDateKey(e.dateKey));for(const song of e.songs)assert.equal(song.seconds,null);}
});
test('metadata differs per page, remains release-base aware and preview is noindex', () => {
  const base='/_yeop_releases/r20260929000000_12345678/';
  const band=getPageMetadata('/band',{assetBase:base,preview:true});
  assert.match(band.title,/청운밴드 소개/);assert.equal(band.robots,'noindex, nofollow');assert.equal(band.canonical,'https://mir.yeop.net/band');assert.equal(band.image,'https://mir.yeop.net'+base+'og/home.png');
  assert.match(getPageMetadata('/history/blued-2025').image,/blued.png$/);
  assert.equal(getPageMetadata('/admin').robots,'noindex, nofollow');assert.equal(getPageMetadata('/history/no-such-show').robots,'noindex, nofollow');
  assert.match(getPageMetadata('/gallery/view?id=123').title,/사진 갤러리/);
  assert.equal(new Set(metadataRoutes).size,metadataRoutes.length);
});
test('static HTML metadata is escaped, unique, and keeps the release marker', () => {
  const meta=getPageMetadata('/band');meta.title='A "quote" <script>&';
  const html=renderPageHead('<head><title>old</title><meta name="description" content="old"><meta property="og:title" content="old"><meta name="yeop-release" content="release-id"></head>',meta);
  assert.equal((html.match(/<title>/g)||[]).length,1);assert.equal((html.match(/property="og:title"/g)||[]).length,1);
  assert.match(html,/&lt;script&gt;&amp;/);assert.match(html,/name="yeop-release"/);
});
