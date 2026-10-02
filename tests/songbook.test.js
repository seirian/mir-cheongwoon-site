import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesQuery, normalize, safeSourceUrl, readFavorites, selectSongs, pageSlice, toCsv } from '../src/lib/songbook.js';
const song = { id:'one', title:'나는 최강', artist:'Ado', aliases:['私は最強', '아도'], categories:['J-POP'], sources:[{id:'silver', name:'미르실버타운', url:'https://mir427.vercel.app/songs/1'}], videoLinks:[], requestStatus:'unreviewed' };
test('song search handles Korean, Japanese, aliases, initials and mixed tokens', () => {
  for (const q of ['나는최강', '私は最強', '아도', 'ㄴㄴ', 'Ado 최강', 'jpop']) assert.equal(matchesQuery(song, q), true, q);
  assert.equal(matchesQuery(song, '없는곡'), false);
  assert.equal(normalize('ＡＤＯ'), normalize('ado'));
});
test('filters and favorites do not mutate source data', () => {
  const list = [song, {...song, id:'two', title:'노심융해', artist:'iroha', videoLinks:[{url:'https://youtu.be/abcdefghijk'}]}];
  assert.equal(selectSongs(list, {view:'videos'}).length, 1);
  assert.deepEqual(selectSongs(list, {view:'favorites'}, ['one']).map(s=>s.id), ['one']);
  assert.equal(selectSongs(list, {status:'available'}).length, 0);
  assert.equal(selectSongs(list, {artist:'iroha', category:'J-POP', source:'silver'}).length, 1);
  assert.deepEqual(list.map(s=>s.id), ['one', 'two']);
});
test('pagination clamps invalid, empty and overlarge page numbers', () => {
  assert.deepEqual(pageSlice([], 'NaN'), {page:1,pages:1,items:[]});
  assert.equal(pageSlice(Array.from({length:25}), 999).page, 2);
  assert.equal(pageSlice([1,2], -1).page, 1);
  assert.equal(pageSlice([1,2], 'Infinity').page, 1);
  assert.equal(pageSlice([1,2], 1, 0).pages, 1);
});
test('favorites tolerate corruption and reject unknown entries', () => {
  assert.deepEqual(readFavorites({getItem:()=>'{oops'}, ['one']), []);
  assert.deepEqual(readFavorites({getItem:()=>'{}'}, ['one']), []);
  assert.deepEqual(readFavorites({getItem:()=> '["one","one","bad",5]'}, ['one']), ['one']);
});
test('URLs refuse unsafe schemes, misleading hosts, credentials and redirect endpoints', () => {
  for (const value of ['javascript:alert(1)', 'https://evil.test', 'https://youtube.com.evil.test/', 'https://me:pass@youtu.be/abcdefghijk', 'http://youtu.be/abcdefghijk', 'https://youtube.com/redirect?q=https://evil.test', 'https://youtu.be:9443/abcdefghijk', '']) assert.equal(safeSourceUrl(value), '');
  assert.equal(safeSourceUrl('https://youtu.be/abcdefghijk?t=2'), 'https://youtu.be/abcdefghijk?t=2');
  assert.equal(safeSourceUrl('https://vod.afreecatv.com/player/105576775'), 'https://vod.afreecatv.com/player/105576775');
});
test('CSV quotes multiline data and neutralizes formulas', () => {
  const output = toCsv([{...song,title:'=1+1',artist:'가수,"별명"\n테스트'}]);
  assert.ok(output.startsWith('\uFEFF'));
  assert.ok(output.includes('"\'=1+1"'));
  assert.ok(output.includes('"가수,""별명""\n테스트"'));
});
const data = JSON.parse(readFileSync(new URL('../src/data/songbookData.json', import.meta.url), 'utf8'));
test('snapshot reconciles every input row and preserves provenance', () => {
  assert.equal(data.songs.length, 342);
  assert.equal(data.songs.reduce((n,s)=>n+s.sources.length, 0), 672);
  assert.equal(new Set(data.songs.map(s=>s.id)).size, 342);
  assert.equal(data.audit.invalidLinkCount, 23);
  assert.equal(data.songs.filter(s=>s.videoLinks.length).length, data.audit.videoSongCount);
  for (const s of data.songs) {
    assert.ok(s.title && s.artist && s.categories.length && s.sources.length);
    for (const link of [...s.sources, ...s.videoLinks, ...s.backingLinks]) assert.ok(safeSourceUrl(link.url), link.url);
    assert.equal(new Set(s.videoLinks.map(v=>v.url)).size, s.videoLinks.length);
  }
});
test('source listings never silently become approved requests or verified dated performances', () => {
  assert.equal(data.scope.complete, false);
  for (const s of data.songs) {
    assert.equal(s.requestStatus, 'unreviewed');
    assert.equal(s.performedAt, null);
    assert.equal(s.dateVerified, false);
    assert.equal(s.difficulty, null);
  }
  assert.equal(data.sources.find(s=>s.id==='cafe').importedCount, 0);
});
test('reviewed aliases merge but conflicting artist credits remain separate', () => {
  assert.equal(selectSongs(data.songs, {q:'프리텐더'}).length, 1);
  assert.equal(data.songs.filter(s=>s.title==='도리도리쏭').length, 2);
});
