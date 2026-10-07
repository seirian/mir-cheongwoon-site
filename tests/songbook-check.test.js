import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cleanSong,parseSnapshot,validateEdit,keyFor,readEdits,mergeEdits,persistEdit,selectCheckSongs,shareLink,requestText,SAMPLE_SONGS} from '../src/songbook-check/model.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const storage=()=>{const data=new Map();return {data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const params=value=>new URLSearchParams(value);
test('request status is visible/selectable without treating unreviewed as available',()=>{
 assert.equal(selectCheckSongs(SAMPLE_SONGS,params('request=available'),[],false).length,3);
 assert.equal(selectCheckSongs(SAMPLE_SONGS,params('request=unreviewed'),[],false).length,2);
 assert.equal(selectCheckSongs(SAMPLE_SONGS,params('request=unavailable'),[],false).length,1);
 assert.equal(selectCheckSongs(SAMPLE_SONGS,params('request=invalid'),[],false).length,6);
 assert.equal(cleanSong({...SAMPLE_SONGS[0],requestStatus:'unknown'}).requestStatus,'unreviewed');
});
test('status composes with title, category, difficulty and favorites',()=>{
 const p=params('request=available&category=J-POP+·+애니&difficulty=3');
 assert.equal(selectCheckSongs(SAMPLE_SONGS,p,[],false)[0].id,'check-sample-5');
 assert.equal(selectCheckSongs(SAMPLE_SONGS,params('request=available&view=favorites'),['check-sample-1'],false).length,1);
});
test('admin-only work filters cannot silently narrow the viewer catalog',()=>{
 const p=params('youtube=missing&attention=artist');assert.equal(selectCheckSongs(SAMPLE_SONGS,p,[],false).length,6);assert.equal(selectCheckSongs(SAMPLE_SONGS,p,[],true).length,1);
 assert.equal(selectCheckSongs(SAMPLE_SONGS,params('attention=representative'),[],true).length,5);
});
test('request copy has no invented chat command and an unknown artist is not fabricated',()=>{
 assert.equal(requestText({title:'곡',artist:'가수'}),'가수 - 곡');assert.equal(requestText({title:'곡',artist:''}),'곡');
});
test('shared links preserve the review release but not admin mode, filters or local changes',()=>{
 const link=new URL(shareLink('https://mir.yeop.net','/_yeop_releases/r20261007000000_1234abcd/','check-sample-2','sample'));
 assert.equal(link.pathname,'/_yeop_releases/r20261007000000_1234abcd/songbook/');assert.deepEqual([...link.searchParams.keys()],['song','data']);
});
test('snapshot public whitelisting removes provenance, private notes and privilege fields',()=>{
 const row=cleanSong({...SAMPLE_SONGS[0],user_id:'secret',author:'hidden',privateNote:'hidden',sourceUrl:'https://example.com',admin:true});
 for(const k of ['user_id','author','privateNote','sourceUrl','admin'])assert.equal(row[k],undefined);
 assert.throws(()=>parseSnapshot({version:1,capturedAt:'bad',songs:[]}));assert.throws(()=>parseSnapshot({version:1,capturedAt:new Date().toISOString(),songs:[SAMPLE_SONGS[0],SAMPLE_SONGS[0]]}));
});
test('editing uses a whitelist and keeps ID/title/difficulty/proficiency unchanged',()=>{
 const song=SAMPLE_SONGS[0],before=JSON.stringify(song);const saved=validateEdit(song,{...song,artist:'수정',difficulty:1,proficiency:1,id:'hijack',title:'hijack',publicNote:' 안내 '});
 assert.equal(saved.artist,'수정');assert.equal(saved.publicNote,'안내');for(const key of ['id','title','difficulty','proficiency'])assert.equal(saved[key],song[key]);assert.equal(JSON.stringify(song),before);
});
test('representative selection requires a real connected valid URL and preserves timestamps',()=>{
 const song=SAMPLE_SONGS[1];const url='https://youtu.be/abcdefghijk?t=1m';const normalized='https://www.youtube.com/watch?v=abcdefghijk&t=60';
 const saved=validateEdit(song,{...song,videoUrls:[...song.videoUrls,url],representativeUrl:url,videoKinds:{[normalized]:'mir'}});assert.equal(saved.representativeUrl,normalized);assert.equal(saved.videoKinds[normalized],'mir');
 assert.throws(()=>validateEdit(song,{...song,representativeUrl:url}));
 for(const url of ['javascript:alert(1)','https://www.youtube.com/@singer','https://youtube.com.evil.example/watch?v=abcdefghijk'])assert.throws(()=>validateEdit(song,{...song,videoUrls:[url]}));
});
test('local-only persistence roundtrips separately for real copy and examples',()=>{
 const mem=storage(),song=SAMPLE_SONGS[1];const edits=persistEdit(mem,'snapshot',{},song,{...song,requestStatus:'available'});
 assert.equal(mergeEdits([song],readEdits(mem,'snapshot'))[0].requestStatus,'available');assert.deepEqual(readEdits(mem,'sample'),{});assert.ok(mem.data.has(keyFor('snapshot')));assert.equal(Object.keys(edits).length,1);
});
test('failed local saves and malformed storage do not acknowledge success or replace the prior object',()=>{
 const edits={},song=SAMPLE_SONGS[0];assert.throws(()=>persistEdit({setItem(){throw Error('quota');}},'sample',edits,song,song),/저장하지 못했습니다/);assert.deepEqual(edits,{});
 assert.throws(()=>readEdits({getItem(){return '{';}},'sample'));
});
test('adding YouTube removes only the repaired entry from the work queue',()=>{
 const song=clone(SAMPLE_SONGS[1]),url=SAMPLE_SONGS[0].videoUrls[0];assert.equal(selectCheckSongs([song],params('youtube=missing'),[],true).length,1);
 const saved=validateEdit(song,{...song,videoUrls:[...song.videoUrls,url]});assert.equal(selectCheckSongs([saved],params('youtube=missing'),[],true).length,0);assert.equal(saved.id,song.id);
});
test('preview entry never imports the production App, auth or songbook store',()=>{
 for(const path of ['src/songbook-check/main.jsx','src/songbook-check/Preview.jsx','src/songbook-check/Dialogs.jsx','src/songbook-check/model.js']){
  const source=readFileSync(path,'utf8');assert.doesNotMatch(source,/from ['"][^'"]*(?:songbookStore|supabase|\/App|AuthProvider)/);
 }
 const stage=readFileSync('scripts/stage-songbook-check.py','utf8');assert.match(stage,/refs\/heads\/feature\/songbook_check/);assert.doesNotMatch(stage,/atomic_replace\(|auth_password\(|ACTIVATE.*true/);
 const html=readFileSync('songbook-check.html','utf8');assert.match(html,/noindex, nofollow/);assert.match(html,/form-action 'none'/);
});
