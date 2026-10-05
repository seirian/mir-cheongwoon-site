import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findLinkSongs,linkChoiceError} from '../src/lib/songbookLinkSearch.js';
const songs=[
 {id:'wisp',title:'영물이다',artist:'이오몽',aliases:['Wisp!'],categories:['가요']},
 {id:'a',title:'나는 최강',artist:'Ado',aliases:['私は最強']},
 {id:'b',title:'영물이다 (inst)',artist:'이오몽',aliases:['Wisp! (Instrumental)']},
 {id:'c',title:'영물이다',artist:'동명곡 가수',aliases:[]},
];
test('link search finds title, artist, multiword query and Hangul initials',()=>{
 assert.equal(findLinkSongs(songs,'이오몽').length,2);
 assert.deepEqual(findLinkSongs(songs,'영물이다 이오몽').map(s=>s.id),['wisp','b']);
 assert.equal(findLinkSongs(songs,'ㅇㅁㅇㄷ').length,3);
});
test('link search supports existing aliases, normalization and case without category-only matches',()=>{
 assert.equal(findLinkSongs(songs,'WISP!')[0].id,'wisp');
 assert.equal(findLinkSongs(songs,'私は最強')[0].id,'a');
 assert.equal(findLinkSongs(songs,'  영 물 이 다 이오몽 ')[0].id,'wisp');
 assert.deepEqual(findLinkSongs(songs,'가요'),[]);
});
test('exact titles precede longer versions and same-title artists retain separate IDs',()=>{
 const found=findLinkSongs(songs,'영물이다');
 assert.equal(found.at(-1).id,'b');
 assert.equal(new Set(found.map(s=>s.id)).size,3);
});
test('blank input can browse all songs; unknown and punctuation-only input return nothing',()=>{
 assert.equal(findLinkSongs(songs,' ').length,4);
 assert.deepEqual(findLinkSongs(songs,'없는 곡'),[]);
 assert.deepEqual(findLinkSongs(songs,'!!!'),[]);
});
test('search retains more than forty matches and never modifies catalog order or fields',()=>{
 const many=Array.from({length:45},(_,i)=>({id:`song-${i}`,title:`노래 ${i}`,artist:'가수'}));
 const original=JSON.stringify(many);
 assert.equal(findLinkSongs(many,'가수').length,45);
 assert.equal(JSON.stringify(many),original);
 assert.equal(findLinkSongs([...songs,songs[0],null], '').length,4);
});
test('approval requires a current existing ID or an explicit new-song choice',()=>{
 assert.ok(linkChoiceError(songs,null));
 assert.ok(linkChoiceError(songs,'missing'));
 assert.equal(linkChoiceError(songs,'wisp'),'');
 assert.equal(linkChoiceError(songs,''),'');
});
test('review uses visible result picker instead of a second select and guards explicit selection',()=>{
 const page=readFileSync(new URL('../src/components/songbook/TimelinePanel.jsx',import.meta.url),'utf8');
 assert.match(page, /<SongLinkPicker/);
 assert.doesNotMatch(page, /<select|setSearch/);
 assert.match(page,/linkChoiceError\(store.songs,songId\)/);
 assert.match(page,/songId===''&&/);
});
