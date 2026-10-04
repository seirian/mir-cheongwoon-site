import test from 'node:test';
import assert from 'node:assert/strict';
import {pruneTimelineCandidates} from '../supabase/functions/songbook-timeline-sync/triage.js';
import {identifyCandidates,textOnly,prepareCandidates} from '../supabase/functions/songbook-timeline-sync/core.js';
const candidate=(line,extra={})=>({vod_id:'208123456',comment_id:'1',seconds:120,title:'곡',artist:'원곡 가수',line,decision:'pending',reason:'artist_metadata_required',song_id:null,...extra});
const comment=text=>({id:'1',text,author_hash:'author',created_at:'2026-01-01'});
function triage(c,comments=[comment(c.line)]){return pruneTimelineCandidates([c],comments,textOnly)[0];}
test('non-song activities are removed despite a stale singing section or music icon',()=>{
 for(const line of ['01:58:14 1라운드 : 청소부 ( 임포스터 )','04:39:00 후열 종겜 로보토미 코퍼레이션 (힐링)','02:32:55 🎶오디션 플레이 인증','02:12:13 🎵김명기 선생님의 노래 피드백']){
  const r=triage(candidate(line));assert.equal(r.decision,'excluded');assert.equal(r.reason,'non_song_activity');
 }
});
test('explicit playback references do not become repertoire; actual Mir vocal interrupts playback',()=>{
 assert.equal(triage(candidate('03:33:32 미르 BLUED 콘서트 부가땅 축하영상 ( 소리 없음 )')).reason,'playback_context');
 assert.equal(triage(candidate('01:20:11 [금뻑쇼] 제갈금자 x 모구구 - 사무라이 하트')).reason,'playback_context');
 const vocal=candidate('02:57:56 모카님(수평선) 보면서 불러보시는 미르님🎵');
 assert.equal(triage(vocal,[comment('노래 감상\n'+vocal.line)]).decision,'pending');
});
test('a non-Mir original artist is not evidence of a different performer',()=>{
 const c=candidate('01:00:37 RAY - BUMP OF CHICKEN 🎵');assert.equal(triage(c).decision,'pending');
 const a=candidate('01:00:37 RAY - BUMP OF CHICKEN 🎵',{decision:'auto',reason:'clear_timeline'});
 assert.equal(triage(a).decision,'auto');
});
test('uncertain or new author and partial Mir singing are retained, not bulk-rejected',()=>{
 for(const reason of ['unconfirmed_timeline_author','performer_uncertain','partial_or_practice','artist_conflict']){
  const c=candidate('01:20:00 노래 - 가수 🎵',{reason});assert.equal(triage(c).decision,'pending');
 }
});
test('known songs without per-song time are archived as redundant; unknown songs and exact times remain',()=>{
 const c=candidate('1. 파티 - 미세스 그린애플',{reason:'section_timestamp_only',song_id:'mir-765c78d3bd14'});
 assert.equal(triage(c).reason,'already_listed_section');
 assert.equal(triage({...c,song_id:null}).decision,'pending');
 assert.equal(triage({...c,reason:'artist_conflict'}).decision,'pending');
});
test('review decisions and source fingerprints survive triage',async()=>{
 const c=candidate('04:39:00 후열 종겜 로보토미 코퍼레이션 (힐링)');
 for(const decision of ['approved','rejected'])assert.deepEqual(triage({...c,decision}),{...c,decision});
 assert.equal((await identifyCandidates([c]))[0].id,(await identifyCandidates([triage(c)]))[0].id);
});
test('same-author reply can inherit recommendation context but unrelated author cannot',()=>{
 const c=candidate('00:02:00 노래 - 가수',{comment_id:'2'});
 const parent=comment('노래 추천');
 const child={...comment(c.line),id:'2',parent_id:'1',created_at:'2026-01-02'};
 assert.equal(triage(c,[parent,child]).reason,'playback_context');
 assert.equal(triage(c,[parent,{...child,author_hash:'other'}]).decision,'pending');
});
test('scheduled parser uses triage before constructing automatic entries',async()=>{
 const vod={id:'208123456',title:'미르',duration_seconds:40000};
 const c=comment('00:01:00 노래뱅\n01:58:14 1라운드 : 청소부 ( 임포스터 )\n02:13:48 2라운드 : 의사 ( 시민 )\n03:01:00 노래 - 가수 🎵');
 const out=await prepareCandidates(vod,[c],[],['author']);
 assert.equal(out.find(x=>x.line.includes('1라운드')).decision,'excluded');
 assert.equal(out.find(x=>x.line.includes('2라운드')).decision,'excluded');
 assert.ok(out.every(x=>x.parser_version==='1.1.0'));
});
