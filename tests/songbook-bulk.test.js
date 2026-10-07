import test from 'node:test';
import assert from 'node:assert/strict';
import {SONGBOOK_PAGE_SIZES,songbookPageSize,songbookPage,statusWriteJob,runStatusBatch} from '../src/lib/songbookBulk.js';
import {publicSong} from '../src/lib/songbookV2.js';
const y='https://www.youtube.com/watch?v=aqz-KE-bpKQ',s='https://vod.sooplive.com/player/123456789?change_second=99';
const row={id:'song-a',title:'검사 곡',artist:'',categories:['가요','기타'],aliases:['검사'],video_urls:[y],request_status:'unreviewed',difficulty:4,revision:3,public_note:'원래 안내',video_kinds:{[y]:'original'}};
const song={...publicSong(row),proficiency:5,manualVideoUrls:[y],videoUrls:[y,s]};
const target={id:song.id,title:song.title,expectedRevision:3};
test('production page sizes are exactly 10/25/50/100 with strict default 25',()=>{
 assert.deepEqual(SONGBOOK_PAGE_SIZES,[10,25,50,100]);
 for(const n of SONGBOOK_PAGE_SIZES){assert.equal(songbookPageSize(n),n);assert.equal(songbookPageSize(String(n)),n);}
 for(const bad of [null,undefined,'',0,-1,24,1000,Infinity,'010','25.0',' 25','25garbage',[],{}])assert.equal(songbookPageSize(bad),25);
});
test('page slicing covers boundaries, invalid pages, size changes and empty results',()=>{
 const items=Array.from({length:101},(_,n)=>n);
 for(const size of SONGBOOK_PAGE_SIZES){const a=songbookPage(items,1,size);assert.equal(a.items.length,size);assert.equal(a.pages,Math.ceil(101/size));assert.equal(a.pageSize,size);assert.deepEqual(songbookPage(items,999,size).items,items.slice(Math.floor(100/size)*size));}
 assert.deepEqual(songbookPage([],999,'50'),{page:1,pages:1,pageSize:50,items:[]});
 assert.equal(songbookPage(items,-1).page,1);assert.equal(songbookPage(items,'bad').page,1);
 assert.deepEqual(songbookPage(items,2,25).items,items.slice(25,50));assert.equal(songbookPage(items,5,100).page,2);
});
test('existing rows generate only identity and request status for revision guarded PATCH',()=>{
 const job=statusWriteJob(song,row,target,'available');assert.deepEqual(job.payload,{id:row.id,request_status:'available'});assert.equal(job.previous,row);
 assert.equal(row.request_status,'unreviewed');assert.equal(song.proficiency,5);
});
test('catalog/automatic-only override preserves metadata but does not copy automatic media',()=>{
 const job=statusWriteJob(song,undefined,{...target,expectedRevision:0},'unavailable');
 assert.equal(job.previous,undefined);assert.deepEqual(job.payload.video_urls,[y]);assert.equal(job.payload.request_status,'unavailable');
 assert.deepEqual(job.payload.categories,row.categories);assert.deepEqual(job.payload.aliases,row.aliases);assert.equal(job.payload.difficulty,4);assert.equal(job.payload.artist,'');assert.equal(job.payload.public_note,row.public_note);assert.deepEqual(job.payload.video_kinds,row.video_kinds);assert.ok(!Object.hasOwn(job.payload,'proficiency'));
});
test('same state is no-op while invalid status, removed songs and stale revisions fail',()=>{
 assert.equal(statusWriteJob(song,row,target,'unreviewed').unchanged,true);
 assert.throws(()=>statusWriteJob(song,row,target,'other'));
 assert.throws(()=>statusWriteJob(null,row,target,'available'));
 assert.throws(()=>statusWriteJob(song,row,{...target,expectedRevision:2},'available'));
 assert.throws(()=>statusWriteJob(song,row,{...target,expectedRevision:undefined},'available'));
});
test('batch processes only selected unique IDs, in order, with exact partial results',async()=>{
 const ids=['a','b','c','d'];const called=[],saved=[],progress=[];
 const report=await runStatusBatch(ids.map(id=>({id,title:id})),'available',{
 allowed:()=>true,prepare:t=>t.id==='b'?{unchanged:true}:{id:t.id},
 write:async job=>{called.push(job.id);if(job.id==='c')throw Error('revision conflict');return {id:job.id,request_status:'available'};},
 committed:r=>saved.push(r.id),progress:n=>progress.push(n),
 });
 assert.deepEqual(called,['a','c','d']);assert.deepEqual(saved,['a','d']);assert.deepEqual(progress,[1,2,3,4]);assert.equal(report.updated,2);assert.equal(report.unchanged,1);assert.equal(report.failed,1);assert.equal(report.results[2].message,'revision conflict');
});
test('permission loss stops subsequent writes and does not automatically retry',async()=>{
 let access=true;const called=[];
 const report=await runStatusBatch(['a','b','c'].map(id=>({id,title:id})),'unavailable',{
 allowed:()=>access,prepare:t=>t,write:async j=>{called.push(j.id);access=false;return {id:j.id,request_status:'unavailable'};},
 });assert.deepEqual(called,['a']);assert.equal(report.updated,1);assert.equal(report.failed,2);
});
test('invalid batch inputs and unconfirmed write responses cannot report success',async()=>{
 const hooks={allowed:()=>true,prepare:t=>t,write:async()=>null};
 for(const targets of [[],Array.from({length:101},(_,i)=>({id:String(i)})),[{id:'a'},{id:'a'}],[{}]])await assert.rejects(runStatusBatch(targets,'available',hooks));
 await assert.rejects(runStatusBatch([{id:'a'}],'invalid',hooks));
 const report=await runStatusBatch([{id:'a'}],'available',hooks);assert.equal(report.updated,0);assert.equal(report.failed,1);
});
