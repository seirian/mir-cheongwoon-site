import test from 'node:test';import assert from 'node:assert/strict';
import {vodInfo,vodLinks,artworkUrl,artworkFields,musicUrl,coverFor} from '../src/lib/songbookMedia.js';
import {publicSong,validateEntry,duplicateOf,matches} from '../src/lib/songbookV2.js';
const image='https://is1-ssl.mzstatic.com/image/thumb/Music/cover.jpg/100x100bb.jpg';
const link='https://music.apple.com/us/album/wisp/1858796278?i=1858796279';
const song={id:'custom-11111111-1111-4111-8111-111111111111',title:'Wisp!',artist:'이오몽',aliases:['영물이다'],categories:['가요'],videoUrls:['https://youtu.be/abcdefghijk?t=1m2s','https://vod.sooplive.co.kr/player/123?change_second=15'],difficulty:null,artworkUrl:image,musicUrl:link,album:'Wisp!'};
test('v3 distinguishes every VOD platform, YouTube first, and numbers videos per platform',()=>{const list=vodLinks([...song.videoUrls,'https://www.youtube.com/watch?v=lmnopqrstuv',song.videoUrls[0]]);assert.equal(list.length,3);assert.deepEqual(list.map(v=>[v.platform,v.number,v.total]),[['youtube',1,2],['youtube',2,2],['soop',1,1]]);assert.ok(list[0].url.endsWith('&t=62'));assert.ok(list[2].url.endsWith('?change_second=15'));});
test('v3 mobile short and live YouTube URLs normalize without losing timestamps',()=>{for(const u of ['https://m.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/shorts/abcdefghijk','https://www.youtube.com/live/abcdefghijk'])assert.equal(vodInfo(u).id,'abcdefghijk');});
test('v3 rejects unsafe VOD and artwork URL forms',()=>{for(const s of ['https://u@youtube.com/watch?v=abcdefghijk','https://youtu.be.evil.test/abcdefghijk','https://vod.sooplive.com/redirect?next=x','javascript:alert(1)','https://youtube.com:8443/watch?v=abcdefghijk'])assert.equal(vodInfo(s),null);for(const s of ['javascript:1','https://is1-ssl.mzstatic.com.evil.test/image/thumb/a','https://u@is1-ssl.mzstatic.com/image/thumb/a','https://is1-ssl.mzstatic.com/image/thumb/a?redirect=1'])assert.equal(artworkUrl(s),'');});
test('v3 album covers require matching class of official music link; fallback is labeled video',()=>{assert.equal(artworkFields({artworkUrl:image}).artworkUrl,'');assert.equal(musicUrl(link+'&uo=4'),link);assert.equal(coverFor(song).kind,'album');assert.equal(coverFor({...song,artworkUrl:''}).kind,'video');assert.equal(coverFor({videoUrls:['https://vod.sooplive.com/player/123']}),null);});
test('v3 server and local roundtrip retain covers and multi-platform VODs without provenance',()=>{const stored=validateEntry(song),restored=publicSong(stored);assert.equal(restored.artworkUrl,image);assert.equal(restored.musicUrl,link);assert.equal(restored.album,'Wisp!');assert.equal(restored.videoUrls.length,2);assert.deepEqual(validateEntry(restored),stored);assert.equal(matches(restored,'영물이다'),true);assert.ok(!JSON.stringify(publicSong({...song,sources:['private']})).includes('private'));});
test('v3 recognizes a previously selected catalog track despite localized display names',()=>{assert.ok(duplicateOf([song],{...song,id:'other',title:'영물이다',artist:'Lee Omong'}));assert.equal(duplicateOf([song],{...song,id:'other',musicUrl:'',title:'Unrelated'}),undefined);});

test('VOD presentation groups YouTube before SOOP without mutating stored order or offsets',()=>{
  const urls=Object.freeze(['https://vod.sooplive.com/player/987?change_second=4350','https://youtu.be/lmnopqrstuv?t=90','https://vod.afreecatv.com/player/123?change_second=200','https://m.youtube.com/watch?v=abcdefghijk&t=62']);
  const before=[...urls],list=vodLinks(urls);
  assert.deepEqual(list.map(v=>v.id),['lmnopqrstuv','abcdefghijk','987','123']);
  assert.deepEqual(list.map(v=>[v.platform,v.number,v.total]),[['youtube',1,2],['youtube',2,2],['soop',1,2],['soop',2,2]]);
  assert.deepEqual(list.map(v=>v.url),['https://www.youtube.com/watch?v=lmnopqrstuv&t=90','https://www.youtube.com/watch?v=abcdefghijk&t=62',urls[0],urls[2]]);
  assert.deepEqual(urls,before);
  assert.deepEqual(vodLinks(list.map(v=>v.url)),list);
});
test('VOD grouping preserves distinct performances, removes canonical duplicates, and rejects unsafe URLs',()=>{
  const list=vodLinks(['https://vod.sooplive.com/player/123?change_second=15','https://youtu.be/abcdefghijk?t=62','https://www.youtube.com/watch?v=abcdefghijk&t=1m2s','https://youtu.be/abcdefghijk?t=200','https://vod.sooplive.com/player/123?change_second=20','javascript:alert(1)']);
  assert.equal(list.length,4);
  assert.deepEqual(list.map(v=>[v.platform,v.number,v.total]),[['youtube',1,2],['youtube',2,2],['soop',1,2],['soop',2,2]]);
  assert.deepEqual(list.map(v=>new URL(v.url).searchParams.get(v.platform==='youtube'?'t':'change_second')),['62','200','15','20']);
});
test('empty and single-platform VOD lists retain their original order and numbering',()=>{
  assert.deepEqual(vodLinks(),[]);assert.deepEqual(vodLinks(['X',null]),[]);
  for(const urls of [['https://youtu.be/lmnopqrstuv','https://youtu.be/abcdefghijk'],['https://vod.sooplive.com/player/987','https://vod.sooplive.com/player/123']]){
    assert.deepEqual(vodLinks(urls).map(v=>v.url),urls.map(u=>vodInfo(u).url));
    assert.deepEqual(vodLinks(urls).map(v=>v.number),[1,2]);
    assert.equal(vodLinks(urls.slice(0,1))[0].total,1);
  }
});
