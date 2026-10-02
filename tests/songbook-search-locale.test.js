import test from 'node:test';
import assert from 'node:assert/strict';
import {existingMatch, mergedAliases, searchRows, selectionDraft, titleLabel, versionLabel} from '../src/lib/songbookSearchLocale.js';
const musicUrl = 'https://music.apple.com/us/album/wisp/1858796278?i=1858796279';
const row = {title:'영물이다',artist:'이오몽',aliases:['Wisp!'],musicUrl,titleStatus:'reviewed-ko',album:'영물이다'};
test('v4 keeps Korean API titles and aliases; drops collection metadata', () => {
 const [r] = searchRows([{...row, sources:['not public'], originalProficiency:5}]);
 assert.equal(r.title,'영물이다');assert.deepEqual(r.aliases,['Wisp!']);assert.equal(r.key,'itunes:1858796279');
 assert.equal(titleLabel(r),'한국어 제목');assert.equal(r.sources,undefined);assert.equal(r.originalProficiency,undefined);
});
test('v4 saved title wins by recording ID, with explicit Korean correction suggestion', () => {
 const saved = {id:'my-song',title:'Wisp!',artist:'이오몽',aliases:['기존 별칭'],musicUrl};
 const [r] = searchRows([row],[saved]);
 assert.equal(r.title,'Wisp!');assert.equal(r.suggestedTitle,'영물이다');assert.equal(titleLabel(r),'등록한 제목');
 assert.ok(r.aliases.includes('영물이다'));assert.equal(existingMatch([saved],r),saved);
});
test('v4 existing Korean title cannot be overwritten by overseas catalog', () => {
 const saved = {...row,id:'my-song',title:'내가 정한 제목',categories:['가요'],videoUrls:['https://youtu.be/abcdefghijk'],proficiency:4,difficulty:5};
 const imported = {title:'Wisp!',artist:'이오몽',musicUrl,aliases:['영물이다']};
 const next = selectionDraft(saved, imported, {});
 assert.equal(next.title,saved.title);assert.deepEqual(next.videoUrls,saved.videoUrls);assert.equal(next.proficiency,4);assert.equal(next.difficulty,5);
 assert.deepEqual(next.categories,['가요']);assert.ok(next.aliases.includes('Wisp!'));assert.ok(next.aliases.includes('영물이다'));
});
test('v4 same title with distinct recording IDs is not treated as existing song', () => {
 const other = {...row,id:'alternate',musicUrl:musicUrl.replace('1858796279','1858796280')};
 assert.equal(existingMatch([other],row),undefined);
});
test('v4 ambiguous title-only candidates are not automatically edited', () => {
 assert.equal(existingMatch([{...row,id:'1',musicUrl:''},{...row,id:'2',musicUrl:''}],{...row,musicUrl:''}),undefined);
 assert.equal(existingMatch([{...row,id:'1',musicUrl:''}],{...row,musicUrl:''})?.id,'1');
});
test('v4 instrumental and live versions stay distinct from the normal recording', () => {
 assert.equal(versionLabel('영물이다 (inst)'),'반주');assert.equal(versionLabel('Song (Live)'),'라이브');
 assert.equal(versionLabel('Song - Remix'),'리믹스');assert.equal(versionLabel('Live Your Life'),'');
 assert.equal(existingMatch([{id:'i',title:'영물이다 (inst)',artist:'이오몽'}],row),undefined);
});
test('v4 unknown overseas titles are not replaced with the query or guesses', () => {
 const [r] = searchRows([{title:'Unverified song',artist:'가수',aliases:[]}]);
 assert.equal(r.title,'Unverified song');assert.equal(titleLabel(r),'원문 제목 · 한국어명 미확인');
 const [english] = searchRows([{title:'Hello',artist:'Adele'}]);assert.equal(titleLabel(english),'원문 제목');
});
test('v4 import automatically retains English alias without manual search-term additions', () => {
 const draft = selectionDraft(null,row,{categories:[],videoUrls:[],proficiency:null});
 assert.equal(draft.title,'영물이다');assert.deepEqual(draft.aliases,['Wisp!']);
 assert.deepEqual(mergedAliases(['영물이다','Wisp!','wisp!','',{},'a'.repeat(101)],'영물이다'),['Wisp!']);
});
