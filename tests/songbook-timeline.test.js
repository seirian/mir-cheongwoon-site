import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eligible,nextCheck,parseTime,textOnly,parseTimeline,prepareCandidates,identifyCandidates,validGithubClaims,newSongIdentity,publicVod,CHANNEL,STATION,BBS} from '../supabase/functions/songbook-timeline-sync/core.js';
import {soopReader} from '../supabase/functions/songbook-timeline-sync/soop.js';
import {timelineSongs,timelineUrl} from '../src/lib/songbookTimeline.js';
const author='a'.repeat(64),today=Date.parse('2026-10-04T00:00:00+09:00');
const vod={id:'208100000',channel_id:CHANNEL,station_no:STATION,bbs_no:BBS,title:'미르 노래 방송',duration_seconds:36000,uploaded_at:'2026-09-26T00:00:00+09:00',public:true};
const song={id:'mir-000000000001',title:'샘플곡',artist:'가수',aliases:['Sample Song'],categories:['가요'],videoUrls:[],difficulty:3};
const comment=text=>({id:'123',parent_id:'',author_hash:author,created_at:'2026-10-03 00:00:00',text});
const timeline=body=>[comment(`00:00:01 인사\n00:00:20 준비\n${body}`)];
const parse=(body,catalog=[song],v=vod)=>parseTimeline(v,timeline(body),catalog,[author]);
test('timeline eligibility is upload + seven full days in KST, never broadcast day or a page number',()=>{
 assert.equal(eligible(vod,today),true);assert.equal(eligible({...vod,uploaded_at:'2026-09-27T00:00:01+09:00'},today),false);
 for(const change of [{channel_id:'other'},{station_no:42},{bbs_no:3},{public:false},{uploaded_at:'2024-12-31T23:59:59+09:00'},{uploaded_at:'2028-01-01T00:00:00Z'},{duration_seconds:0}])assert.equal(eligible({...vod,...change},today),false);
});
test('waiting and late timelines receive bounded retries including old records',()=>{
 assert.equal(nextCheck({...vod,uploaded_at:'2026-10-03T00:00:00+09:00'},today),'2026-10-09T15:00:00.000Z');
 assert.equal(Date.parse(nextCheck(vod,today))-today,86400000);
 assert.equal(Date.parse(nextCheck({...vod,uploaded_at:'2026-07-25T00:00:00Z'},today))-today,7*86400000);
 assert.equal(Date.parse(nextCheck({...vod,uploaded_at:'2025-01-05T00:00:00Z'},today))-today,30*86400000);
 assert.equal(Date.parse(nextCheck(vod,today,true))-today,86400000);
});
test('HTML comments are text only; malformed/oversized input is rejected and times are bounded',()=>{
 assert.equal(textOnly('a<br />b&nbsp;&amp;&#x1f3b5;<script>bad()</script>'),'a\nb &🎵');
 assert.throws(()=>textOnly('x'.repeat(120001)));assert.equal(parseTime('01:02:03'),3723);assert.equal(parseTime('92:03'),5523);assert.equal(parseTime('01:99:00'),null);
 assert.equal(parse('99:00:00 샘플곡 - 가수 🎵').length,0);
});
test('clear marked song matches existing title, artist and aliases without a duplicate',()=>{
 const r=parse('01:02:03 Sample Song - 가수 🎵')[0];assert.equal(r.decision,'auto');assert.equal(r.song_id,song.id);assert.equal(r.seconds,3723);
 assert.equal(parse('01:02:03 가수 - 샘플곡 🎵')[0].song_id,song.id);
});
test('another singer on Mir channel is never imported as Mir singing',()=>{
 const other=parse('01:02:03 샘플곡 - 가수 | 상득님 🐼🎵')[0];assert.equal(other.decision,'excluded');assert.equal(other.reason,'other_performer');
 assert.equal(parse('01:02:03 🎶 샘플곡 - 🥷다른분')[0].decision,'excluded');
 assert.equal(parse('01:02:03 샘플곡 - 가수 🎵',[song],{...vod,title:'합방 싱크룸'})[0].decision,'pending');
 assert.equal(parse('01:02:03 샘플곡 - 가수 | 미르님💙🎵',[song],{...vod,title:'합방 싱크룸'})[0].decision,'auto');
});
test('playback, outro, monitoring, medleys and practice do not become automatic repertoire',()=>{
 for(const body of ['01:02:03 샘플곡 - 가수 감상 🎵','01:02:03 샘플곡 - 가수 모니터링 🎵','▼ 방종곡\n01:02:03 샘플곡 - 가수 🎵'])assert.equal(parse(body)[0].decision,'excluded');
 for(const body of ['01:02:03 샘플곡 - 가수 🎵 (짧게)','01:02:03 (2트) 샘플곡 - 가수 🎵','01:02:03 한 소절 샘플곡 - 가수 🎵'])assert.equal(parse(body)[0].decision,'pending');
});
test('section headings support unmarked songs but never give an invented per-song time',()=>{
 assert.equal(parse('중간 노래뱅\n01:02:03 샘플곡 - 가수')[0].decision,'auto');
 const r=parse('00:39:16 예열 노래뱅\n1. 샘플곡 - 가수')[0];assert.equal(r.reason,'section_timestamp_only');assert.equal(r.decision,'pending');assert.equal(r.seconds,2356);
 assert.equal(parse('예열 소통\n01:02:03 드시는 미르님 - 음식').length,0);
});
test('new or untrusted author, unknown artist and ambiguous same-title records are held for review',()=>{
 assert.equal(parseTimeline(vod,timeline('01:02:03 샘플곡 - 가수 🎵'),[song],[])[0].reason,'unconfirmed_timeline_author');
 assert.equal(parse('01:02:03 완전 새 곡 - 처음 보는 가수 🎵')[0].decision,'pending');
 const two=[song,{...song,id:'mir-000000000002',artist:'다른 가수'}];assert.equal(parse('01:02:03 샘플곡 🎵',two)[0].reason,'ambiguous_title');
 assert.equal(parse('01:02:03 샘플곡 - 다른 가수 🎵')[0].reason,'artist_conflict');
});
test('new explicit song from known credited artist is safe only after structural and singer checks',async()=>{
 const r=await prepareCandidates(vod,timeline('01:02:03 정말 새로운 노래 - 가수 🎵'),[song],[author]);assert.equal(r[0].decision,'auto');assert.ok(r[0].new_song.id.startsWith('custom-'));assert.equal(r[0].author_hash,undefined);
 assert.equal(r[0].proficiency,undefined);assert.equal(r[0].difficulty,undefined);
});
test('comment replies inherit the same-author section and song fingerprint survives local title edits',async()=>{
 const comments=[comment('00:00:01 인사\n00:00:10 준비\n00:39:16 예열 노래뱅'),{...comment('00:40:00 샘플곡 - 가수 🎵'),id:'456',parent_id:'123',created_at:'2026-10-03 00:01:00'}];
 const r=parseTimeline(vod,comments,[song],[author]);assert.equal(r.length,1);assert.equal(r[0].decision,'auto');
 const a=await identifyCandidates(r),b=await identifyCandidates(parseTimeline(vod,comments,[{...song,title:'관리자가 고친 제목',aliases:['샘플곡']}],[author]));assert.equal(a[0].id,b[0].id);
});
test('reviewed artist/title spelling aliases do not overwrite the base catalog or make near guesses',()=>{
 const cat=JSON.parse(readFileSync(new URL('../src/data/songbookCatalog.json',import.meta.url)));
 const r=parse('01:02:03 Magic - Mrs. GREEN APPLE 🎵',cat)[0];assert.equal(r.song_id,'mir-aeae7cb3ecd6');assert.equal(r.title,'매직');
 const typo=parse('01:02:03 정세생물 - Mrs. GREEN APPLE 🎵',cat)[0];assert.notEqual(typo.decision,'auto');
 assert.equal(parse('01:02:03 Drowing(드라우닝) - WOODZ 🎵',cat)[0].song_id,'mir-1ad7f0887ec8');
});
test('new song identity tolerates supported artist spellings but not different titles',async()=>{
 assert.equal((await newSongIdentity('New Track','Mrs. GREEN APPLE')).id,(await newSongIdentity('New Track','미세스 그린애플')).id);
 assert.notEqual((await newSongIdentity('A','가수')).id,(await newSongIdentity('B','가수')).id);
});
test('GitHub workload identity excludes forks, PRs, other workflows, feature branches and reusable-workflow swaps',()=>{
 const p={repository_id:'1366316295',repository_owner_id:'1607031',repository:'seirian/mir-cheongwoon-site',ref:'refs/heads/main',event_name:'workflow_run',workflow_ref:'seirian/mir-cheongwoon-site/.github/workflows/songbook-timeline-backfill.yml@refs/heads/main',runner_environment:'github-hosted',run_id:'123',run_attempt:'1'};
 assert.equal(validGithubClaims(p),true);
 for(const c of [{job_workflow_ref:'evil'},{repository_id:'1'},{repository_owner_id:'1'},{event_name:'pull_request'},{ref:'refs/heads/feature/evil'},{workflow_ref:'seirian/mir-cheongwoon-site/.github/workflows/other.yml@refs/heads/main'}])assert.equal(validGithubClaims({...p,...c}),false);
});
test('public VOD contract excludes uploads inadvertently mixed into REVIEW list',()=>{
 const r={title_no:208100000,user_id:CHANNEL,station_no:STATION,bbs_no:BBS,reg_date:'2026-09-01 12:00:00',auth_no:101,title_name:'방송',ucc:{file_type:'REVIEW',total_file_duration:3600000,grade:0}};
 assert.equal(publicVod(r).duration_seconds,3600);assert.equal(publicVod({...r,ucc:{...r.ucc,file_type:'NORMAL'}}),null);assert.throws(()=>publicVod({...r,user_id:'other'}));
});
function mockedReader(payloads){const requests=[];const reader=soopReader(async(url,options)=>{requests.push({url,options});const d=payloads.shift();if(d instanceof Error)throw d;return new Response(JSON.stringify(d),{status:200});},async()=>{});return {reader,requests};}
const parent={p_comment_no:'123',title_no:vod.id,user_id:'writer',comment:'00:00:01 인사<br>00:02:00 샘플곡 - 가수 🎵',c_comment_cnt:'1',reg_date:'2026-10-03 00:00:00'};
const root=(rows,more=false,total=rows.length)=>({CHANNEL:{RESULT:1,DATA:{user_data:{writer_id:CHANNEL},list_data:rows,has_more:more,total_cnt:total}}});
test('collector reads every root page and child reply, removing irrelevant personal fields',async()=>{
 const child={p_comment_no:'123',c_comment_no:'456',user_id:'writer',comment:'00:03:00 샘플곡 - 가수 🎵',reg_date:'2026-10-03 00:01:00',ip_inet:'private-data'};
 const {reader,requests}=mockedReader([root([parent],true,2),root([{...parent,p_comment_no:'124',c_comment_cnt:'0'}],false,2),{CHANNEL:{RESULT:1,DATA:{list_data:[child],total_cnt:1}}}]);
 const r=await reader.comments(vod);assert.equal(r.complete,true);assert.equal(r.root_count,2);assert.equal(r.reply_count,1);assert.equal(r.comments.length,3);
 assert.ok(requests.some(x=>new URL(x.url).searchParams.get('szAction')==='get_reply'));
 assert.ok(requests.every(x=>!x.options.method));assert.ok(!JSON.stringify(r).includes('ip_inet'));assert.ok(!JSON.stringify(r).includes('private-data'));
});
test('collector rejects truncated replies, mismatching VODs and repeated cursors rather than stamping complete',async()=>{
 await assert.rejects(mockedReader([root([parent]),{CHANNEL:{RESULT:1,DATA:{list_data:[],total_cnt:3}}}]).reader.comments(vod),/incomplete/);
 await assert.rejects(mockedReader([root([{...parent,title_no:'111111'}])]).reader.comments(vod),/vod_contract/);
 await assert.rejects(mockedReader([root([parent],true,3),root([parent],true,3)]).reader.comments(vod),/stalled/);
});
test('automatic overlays preserve manual metadata, manual video editing and Mir proficiency',()=>{
 const base={...song,videoUrls:['https://youtu.be/abcdefghijk']};
 const r=timelineSongs([base],[{...song,videoUrls:undefined,title:'관리자 제목',difficulty:5,video_urls:['https://youtu.be/lmnopqrstuv']}],[{song_id:song.id,proficiency:4}],[],[{id:song.id,video_urls:['https://vod.sooplive.com/player/208100000?change_second=30'],total_count:90}])[0];
 assert.equal(r.title,'관리자 제목');assert.equal(r.difficulty,5);assert.equal(r.proficiency,4);assert.equal(r.autoVideoCount,90);assert.equal(r.manualVideoUrls.length,1);assert.equal(r.videoUrls.length,2);
 assert.equal(timelineUrl('../attack',2),null);assert.equal(timelineUrl(vod.id,-1),null);
});
