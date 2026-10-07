import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cleanSong,parseSnapshot,representative,validateEdit,mergeEdits,persistEdit,readEdits,selectCheckSongs,SAMPLE_SONGS} from '../src/songbook-check/model.js';
import {csv} from '../src/lib/songbookV2.js';
const y='https://www.youtube.com/watch?v=abcdefghijk&t=60';
const y2='https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=120';
const s='https://vod.sooplive.com/player/123456789?change_second=60';
const base={...SAMPLE_SONGS[4],videoUrls:[s,y,y2],representativeUrl:s};
test('round2: first valid YouTube is representative regardless of prior selection and SOOP placement',()=>{
 const before=JSON.stringify(base);const song=cleanSong(base);
 assert.equal(song.representativeUrl,y);assert.equal(representative(song).url,y);
 assert.deepEqual(song.videoUrls,[s,y,y2]);assert.equal(JSON.stringify(base),before);
 assert.deepEqual(song.videoKinds,{}); // automatic designation is not a claim of official or Mir vocals
});
test('round2: supported short/live/shorts URLs retain offsets and ignore unsafe or nonvideo links',()=>{
 for(const raw of ['https://youtu.be/abcdefghijk?t=1m','https://m.youtube.com/watch?v=abcdefghijk&t=60','https://youtube.com/shorts/abcdefghijk?t=60','https://youtube.com/live/abcdefghijk?t=60']) {
  assert.equal(representative({videoUrls:['https://youtube.com/@channel','https://youtube.com.evil.invalid/watch?v=abcdefghijk',s,raw,y2]}).url,y);
 }
 assert.equal(representative({videoUrls:null}),null);
});
test('round2: SOOP-only, cover-only and unlinked selections never become representative videos',()=>{
 for(const videoUrls of [[],[s]]){
  const song=cleanSong({...base,videoUrls,representativeUrl:y,musicUrl:y});
  assert.equal(song.representativeUrl,'');assert.equal(representative(song),null);assert.deepEqual(song.videoUrls,videoUrls);
 }
});
test('round2: first-YouTube removal promotes the next, final removal clears, additions do not replace the first',()=>{
 const song=cleanSong(base);
 const removed=validateEdit(song,{...song,videoUrls:[s,y2]});assert.equal(removed.representativeUrl,y2);
 const empty=validateEdit(song,{...removed,videoUrls:[s]});assert.equal(empty.representativeUrl,'');
 const added=validateEdit(song,{...empty,videoUrls:[s,y2,y]});assert.equal(added.representativeUrl,y2);
 assert.deepEqual(added.videoUrls,[s,y2,y]);assert.equal(added.proficiency,song.proficiency);
});
test('round2: legacy local drafts are derived without rewriting storage or discarding other edits',()=>{
 const edits={[base.id]:{...base,publicNote:'이전 검토 메모',artist:'검토 가수',requestStatus:'unavailable'}};
 const raw=JSON.stringify({version:1,edits});let reads=0;
 const storage={getItem(){reads++;return raw;},setItem(){assert.fail('read path cannot save');}};
 const saved=mergeEdits([cleanSong(base)],readEdits(storage,'snapshot'))[0];
 assert.equal(reads,1);assert.equal(saved.representativeUrl,y);assert.equal(saved.publicNote,'이전 검토 메모');assert.equal(saved.artist,'검토 가수');assert.equal(saved.requestStatus,'unavailable');assert.equal(edits[base.id].representativeUrl,s);
});
test('round2: all original categories and their order survive quick edits, persistence and export',()=>{
 const categories=['J-POP · 애니','기타','뮤지컬 · 디즈니'];const song=cleanSong({...base,categories});let raw;
 const storage={setItem(k,v){raw=v;},getItem(){return raw;}};
 persistEdit(storage,'sample',{},song,{...song,categories:['임의 변경 금지'],videoUrls:[s,y2]});
 const saved=mergeEdits([song],readEdits(storage,'sample'))[0];assert.deepEqual(saved.categories,categories);assert.equal(saved.representativeUrl,y2);assert.ok(csv([saved]).includes(categories.join(' / ')));
 for(const key of ['id','title','difficulty','proficiency'])assert.equal(saved[key],song[key]);
});
test('round2: snapshot and missing-representative queue use exactly the same first-YouTube policy',()=>{
 const snapshot=parseSnapshot({version:1,capturedAt:'2026-10-07T00:00:00Z',songs:[base,{...base,id:'soop-only',videoUrls:[s]}]});
 assert.equal(snapshot.songs[0].representativeUrl,y);assert.equal(snapshot.songs[1].representativeUrl,'');
 assert.deepEqual(selectCheckSongs(snapshot.songs,new URLSearchParams('attention=representative'),[],true).map(song=>song.id),['soop-only']);
});
test('round2: categories render in list, detail and quick edit, with wrap-only styling and correct review labels',()=>{
 const page=readFileSync('src/songbook-check/Preview.jsx','utf8');const dialogs=readFileSync('src/songbook-check/Dialogs.jsx','utf8');
 assert.match(page,/<SongCategories song=\{song\}\/>/);assert.equal((dialogs.match(/<SongCategories song=\{song\}\/>/g)||[]).length,2);
 const badges=readFileSync('src/songbook-check/SongCategories.jsx','utf8');assert.match(badges,/categories\.map/);assert.doesNotMatch(badges,/\.slice\(/);
 const css=readFileSync('src/songbook-check/round2.css','utf8');assert.match(css,/flex-wrap:wrap/);assert.match(css,/overflow-wrap:anywhere/);assert.doesNotMatch(css,/display:none|line-clamp|text-overflow|overflow:hidden/);
 assert.match(dialogs,/const rep=representative\(draft\)/);assert.doesNotMatch(dialogs,/type="radio" name="representative"/);
 for(const text of [page,dialogs,readFileSync('songbook-check.html','utf8')]){assert.match(text,/2차 검토/);assert.doesNotMatch(text,/1차 검토/);}
});
