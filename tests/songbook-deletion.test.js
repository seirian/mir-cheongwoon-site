import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleSongs,deletionResult} from '../src/lib/songbookDeletion.js';
import {timelineSongs} from '../src/lib/songbookTimeline.js';
import {csv,pageSlice} from '../src/lib/songbookV2.js';
const song={id:'mir-000000000001',title:'원래 곡',artist:'가수',categories:['가요'],aliases:[],videoUrls:[]};
test('deleted static/manual/automatic songs cannot reappear through catalog merging or CSV',()=>{
 const all=timelineSongs([song],[{...song,title:'관리자 수정',video_urls:[]}],[{song_id:song.id,proficiency:4}],[{...song,id:'custom-test'}],[]);
 const result=visibleSongs(all,[{song_id:song.id},{song_id:'custom-test'}]);
 assert.deepEqual(result,[]);assert.doesNotMatch(csv(result),/원래 곡|관리자 수정/);
 assert.equal(all.find(s=>s.id===song.id).proficiency,4);
});
test('missing deletion data fails closed instead of exposing the static fallback',()=>{
 assert.deepEqual(visibleSongs([song],null),[]);assert.deepEqual(visibleSongs([song],undefined),[]);
 assert.deepEqual(visibleSongs([song],[]),[song]);
});
test('valid deletion result must acknowledge the exact requested song and operation',()=>{
 assert.equal(deletionResult({data:{status:'deleted',song_id:song.id}},song.id,'deleted').song_id,song.id);
 for(const data of [null,{}, {status:'deleted',song_id:'other'},{status:'restored',song_id:song.id}])assert.throws(()=>deletionResult({data},song.id,'deleted'));
});
test('delete failures and optimistic conflicts never report success or expose upstream details',()=>{
 assert.throws(()=>deletionResult({error:{code:'40001',message:'secret'}},song.id,'deleted'),/다른 화면/);
 assert.throws(()=>deletionResult({error:{code:'42501'}},song.id,'deleted'),/관리자 권한/);
 assert.throws(()=>deletionResult({error:{code:'500',message:'secret'}},song.id,'deleted'),error=>!error.message.includes('secret'));
});
test('deleting the last song clamps page without resetting unrelated filters',()=>{
 const rows=Array.from({length:25},(_,n)=>({...song,id:String(n)}));
 assert.equal(pageSlice(rows,2).page,2);assert.equal(pageSlice(rows.slice(0,24),2).page,1);
});
test('deletion SQL has explicit auth/grants and keeps source records for recovery and deduplication',()=>{
 const sql=readFileSync(new URL('../supabase/ops/songbook_deletion.sql',import.meta.url),'utf8');
 assert.match(sql,/auth\.uid\(\)/);assert.match(sql,/public\.admins/);assert.match(sql,/p_expected_revision/);assert.match(sql,/p_delete_token/);
 assert.match(sql,/grant select\(song_id\)/);assert.match(sql,/set search_path=pg_catalog/g);
 assert.doesNotMatch(sql,/delete from public\.songbook_(entries|ratings|auto_entries|auto_links|timeline_candidates)\b/);
 assert.match(sql,/alter policy sb_links_public/);assert.match(sql,/sb_deleted_review_guard/);
});
