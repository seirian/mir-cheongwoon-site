import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {videoPresence,videoPresenceFilters,filterVideoPresence} from '../src/lib/songbookVideoPresence.js';
import {selectSongs,pageSlice,csv} from '../src/lib/songbookV2.js';
import {timelineSongs} from '../src/lib/songbookTimeline.js';
const yt='https://youtu.be/abcdefghijk', soop='https://vod.sooplive.com/player/123456789?change_second=60';
const song=(id,videoUrls)=>({id,title:id,artist:'검증 가수',categories:['가요'],aliases:[],videoUrls,difficulty:3,proficiency:null});
const songs=[song('both',[soop,yt]),song('youtube',[yt]),song('soop',[soop]),song('neither',[])];
const p=(youtube='',soop='')=>new URLSearchParams({youtube,soop});
test('all nine platform combinations use AND; originals and order are preserved',()=>{
  const before=JSON.stringify(songs);
  for(const youtube of ['','present','missing'])for(const soop of ['','present','missing']){
    const expected=songs.filter(s=>(!youtube||(s.id==='both'||s.id==='youtube')===(youtube==='present'))&&(!soop||(s.id==='both'||s.id==='soop')===(soop==='present')));
    assert.deepEqual(filterVideoPresence(songs,p(youtube,soop),true),expected);
  }
  assert.equal(JSON.stringify(songs),before);
});
test('anonymous and member cannot activate the filter through URL parameters',()=>{
  for(const admin of [undefined,false,null,0,1,'true']){
    assert.deepEqual(videoPresenceFilters(p('missing','present'),admin),{youtube:'',soop:''});
    assert.equal(filterVideoPresence(songs,p('missing','present'),admin),songs);
  }
});
test('invalid filter values are ignored rather than treated as absence',()=>{
  assert.equal(filterVideoPresence(songs,p('none','false'),true),songs);
  assert.deepEqual(filterVideoPresence(songs,p('bad','present'),true).map(s=>s.id),['both','soop']);
});
test('supported short, watch, mobile, music, live, embed and shorts URLs match the icons',()=>{
  for(const url of [yt,'https://www.youtube.com/watch?v=abcdefghijk','https://m.youtube.com/watch?v=abcdefghijk&t=1m','https://music.youtube.com/watch?v=abcdefghijk','https://youtube.com/live/abcdefghijk','https://youtube.com/shorts/abcdefghijk','https://www.youtube.com/embed/abcdefghijk?start=5'])assert.equal(videoPresence(song('x',[url])).youtube,true,url);
  for(const host of ['vod.sooplive.com','vod.sooplive.co.kr','vod.afreecatv.com'])assert.equal(videoPresence(song('x',[`https://${host}/player/123456789`])).soop,true,host);
});
test('invalid hosts, non-video pages, unsafe URLs and cover-only links do not count',()=>{
  for(const url of ['https://youtube.com.evil.example/watch?v=abcdefghijk','https://youtube.com/@artist','https://youtube.com/watch?v=short','https://www.sooplive.com/station/alice427','http://youtu.be/abcdefghijk','javascript:alert(1)','https://user:pass@youtu.be/abcdefghijk'])assert.deepEqual(videoPresence(song('x',[url])),{youtube:false,soop:false},url);
  assert.deepEqual(videoPresence({musicUrl:yt,artworkUrl:yt}),{youtube:false,soop:false});
});
test('automatic SOOP links count alongside manual YouTube while unlinked automatic entries remain missing',()=>{
  const merged=timelineSongs([song('base',[yt])],[],[],[song('auto',[])],[{id:'base',video_urls:[soop],total_count:8}]);
  assert.deepEqual(videoPresence(merged[0]),{youtube:true,soop:true});
  assert.deepEqual(filterVideoPresence(merged,p('','missing'),true).map(s=>s.id),['auto']);
});
test('full-catalog filtering precedes pagination and CSV and composes with existing search',()=>{
  const catalog=Array.from({length:60},(_,i)=>song(`검증 ${String(i).padStart(2,'0')}`,i<30?[yt]:[soop]));
  const params=new URLSearchParams('q=검증&category=가요&difficulty=3&youtube=missing&soop=present&page=2');
  const filtered=filterVideoPresence(selectSongs(catalog,params),params,true);
  assert.equal(filtered.length,30);assert.equal(pageSlice(filtered,2).items.length,6);
  const exported=csv(filtered);assert.ok(exported.includes('검증 59'));assert.ok(!exported.includes('검증 00'));
  const favorites=filterVideoPresence(selectSongs(catalog,new URLSearchParams('view=favorites'),['검증 59']),p('missing'),true);
  assert.equal(favorites.length,1);
});
test('adding a YouTube link removes the song from missing results without deleting it',()=>{
  const original=song('대상',[soop]);assert.equal(filterVideoPresence([original],p('missing'),true).length,1);
  const edited={...original,videoUrls:[soop,yt]};assert.equal(filterVideoPresence([edited],p('missing'),true).length,0);assert.equal(edited.title,original.title);
});
test('page gates admin controls, uses merged songs and clears platform conditions on reset',()=>{
  const page=readFileSync(new URL('../src/pages/SongbookV2Page.jsx',import.meta.url),'utf8');
  assert.match(page,/store\.admin&&<AdminVideoFilters/);
  assert.match(page,/filterVideoPresence\(selectSongs\(store\.songs,params,favorites\),params,store\.admin\)/);
  assert.match(page,/youtube:'',soop:''/);
  assert.match(page,/store\.songs,params,favorites,store\.admin/);
});
