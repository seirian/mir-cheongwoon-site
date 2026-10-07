import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {usageFields,usagePayload,firstYoutube} from '../src/lib/songbookUsage.js';
import {enrichUsage,selectUsageSongs,quickDraft,quickPayload,validateQuickEdit,publicSongLink} from '../src/lib/songbookUsability.js';
import {publicSong,validateEntry} from '../src/lib/songbookV2.js';import {timelineSongs} from '../src/lib/songbookTimeline.js';
const yt='https://www.youtube.com/watch?v=abcdefghijk&t=60',other='https://www.youtube.com/watch?v=lmnopqrstuv&t=12',soop='https://vod.sooplive.com/player/123456789?change_second=60';
const row={id:'mir-000000000001',title:'테스트',artist:'가수',categories:['가요','기타'],aliases:['별칭'],videoUrls:[soop,yt,other],difficulty:4,proficiency:5,requestStatus:'unreviewed'};
const read=path=>readFileSync(path,'utf8');
test('public usage fields roundtrip through actual entry validation and public normalization',()=>{
 const saved=validateEntry({...row,publicNote:'  듀엣 시 가능  ',videoKinds:{[yt]:'original',[soop]:'mir'}});
 assert.equal(saved.public_note,'듀엣 시 가능');assert.deepEqual(saved.video_kinds,{[yt]:'original',[soop]:'mir'});
 const loaded=publicSong(saved);assert.equal(loaded.publicNote,'듀엣 시 가능');assert.deepEqual(loaded.videoKinds,saved.video_kinds);
 assert.equal(loaded.difficulty,4);assert.equal(loaded.proficiency,null);assert.deepEqual(loaded.categories,row.categories);
});
test('legacy payload omits new columns, and public data without them has safe display defaults',()=>{
 const payload=validateEntry(row);assert.ok(!Object.hasOwn(payload,'public_note'));assert.ok(!Object.hasOwn(payload,'video_kinds'));
 assert.deepEqual(usageFields(row),{publicNote:'',videoKinds:{}});
});
test('first YouTube is derived from saved order without official/performance guessing or offset changes',()=>{
 const song=enrichUsage({...row,representativeUrl:other});assert.equal(firstYoutube(song).url,yt);assert.deepEqual(song.videoKinds,{});
 assert.equal(firstYoutube({...song,videoUrls:[soop]}),null);assert.deepEqual(song.videoUrls,row.videoUrls);
});
test('quick editing never copies automatic media into manual links and preserves untouched metadata',()=>{
 const merged=timelineSongs([row],[],[{song_id:row.id,proficiency:5}],[],[{id:row.id,video_urls:[soop.replace('60','90')],total_count:12}])[0];
 const original=quickDraft(merged,7);assert.equal(original.videoUrls.length,3);assert.equal(original.automaticVideoUrls.length,1);
 const edited=validateQuickEdit(original,{...original,publicNote:'새 안내',requestStatus:'available'});
 const saved=quickPayload(original,edited);assert.equal(saved.expectedRevision,7);assert.deepEqual(saved.videoUrls,row.videoUrls);assert.equal(saved.proficiency,5);assert.equal(saved.difficulty,4);assert.deepEqual(saved.aliases,['별칭']);assert.deepEqual(saved.categories,row.categories);assert.equal(saved.publicNote,'새 안내');
});
test('quick payload does not accept incoming identity, categories, difficulty or proficiency replacements',()=>{
 const original=quickDraft(row,0);const saved=quickPayload(original,{...original,id:'bad',title:'bad',categories:['bad'],aliases:[],difficulty:1,proficiency:1});
 assert.equal(saved.id,row.id);assert.equal(saved.title,row.title);assert.deepEqual(saved.categories,row.categories);assert.equal(saved.difficulty,4);assert.equal(saved.proficiency,5);
});
test('production quick links obey existing ten-link database limit; isolated review keeps its twenty-link contract',()=>{
 const urls=Array.from({length:11},(_,i)=>yt.replace('60',String(i)));
 assert.throws(()=>validateQuickEdit(row,{...enrichUsage(row),videoUrls:urls},{maxLinks:10}));
 assert.equal(validateQuickEdit(row,{...enrichUsage(row),videoUrls:urls}).videoUrls.length,11);
});
test('malformed usage values, invalid URLs and too-long public notes are rejected',()=>{
 for(const input of [{publicNote:'x'.repeat(141)},{publicNote:12},{videoKinds:[]},{videoKinds:{[yt]:'script'}},{videoKinds:{'javascript:alert(1)':'mir'}}])assert.throws(()=>usagePayload(input,[yt]));
 assert.throws(()=>validateQuickEdit(row,{...row,videoUrls:['javascript:alert(1)']}));
 assert.deepEqual(usagePayload({videoKinds:{[yt]:'mir',[other]:'original'}},[yt]).video_kinds,{[yt]:'mir'});
});
test('request-state filters compose with category and platform criteria before paging; unreviewed is not available',()=>{
 const songs=[enrichUsage(row),enrichUsage({...row,id:'available',requestStatus:'available'}),enrichUsage({...row,id:'blocked',requestStatus:'unavailable'})];
 assert.deepEqual(selectUsageSongs(songs,new URLSearchParams('request=available&category=가요&youtube=present'),[],true).map(s=>s.id),['available']);
 assert.equal(selectUsageSongs(songs,new URLSearchParams('request=garbage'),[],true).length,3);
 assert.equal(selectUsageSongs(songs,new URLSearchParams('request=unreviewed'),[],true)[0].id,row.id);
});
test('anonymous and normal-member attention/platform URL parameters never enable administrator filters',()=>{
 assert.equal(selectUsageSongs([enrichUsage(row)],new URLSearchParams('attention=artist&youtube=missing'),[],false).length,1);
 assert.equal(selectUsageSongs([enrichUsage(row)],new URLSearchParams('attention=artist'),[],true).length,0);
});
test('public song sharing keeps release routing but excludes preview data, administrator flags and search',()=>{
 const link=publicSongLink('https://mir.yeop.net','/_yeop_releases/r_example/',row.id);
 assert.equal(link,`https://mir.yeop.net/_yeop_releases/r_example/songbook/?song=${row.id}`);
 assert.equal(publicSongLink('https://mir.yeop.net','/',row.id),`https://mir.yeop.net/songbook/?song=${row.id}`);
});
test('production route uses live shared-auth store and retains editors, deletion, rating and timeline controls',()=>{
 const page=read('src/pages/SongbookUsabilityPage.jsx'),route=read('src/pages/SongbookPage.jsx');
 assert.match(route,/IS_REVIEW_PREVIEW \? SongbookV2Page : SongbookUsabilityPage/);assert.match(page,/useSongbookStore\(false\)/);
 assert.doesNotMatch(page,/readEdits|persistEdit|SAMPLE_SONGS|songbook-check-snapshot|params.get\('mode'\)|params.get\('data'\)/);
 for(const name of ['TimelinePanel','TimelineHistory','Editor','StarPicker','DeleteSongDialog','DeletedSongsDialog','AdminVideoFilters'])assert.match(page,new RegExp('<'+name+'\\b'));
 assert.match(page,/store\.saveSong\(quickPayload/);assert.match(page,/store\.canEdit/);assert.match(page,/FAVORITES_KEY/);
});
test('quick-edit awaits server acknowledgement, disables controls while saving and retains failed drafts',()=>{
 const dialogs=read('src/songbook-check/Dialogs.jsx');assert.match(dialogs,/await save\(valid,next\)/);assert.match(dialogs,/locked=\{busy\}/);assert.match(dialogs,/disabled=\{busy\|\|disabled\}/);assert.match(dialogs,/catch\(e\)\{setError\(e.message\)/);
 assert.match(read('src/lib/songbookStore.js'),/expectedRevision/);
});
test('usage migration is additive, administrator RLS is unchanged, old clients can remove labels safely',()=>{
 const sql=read('supabase/ops/songbook_usage.sql');assert.match(sql,/add column public_note/);assert.match(sql,/add column video_kinds/);assert.match(sql,/security invoker set search_path=pg_catalog/);
 assert.doesNotMatch(sql,/drop\s+(?:table|column|policy)|alter\s+policy|disable row level security|update public\.songbook_entries|delete from/i);
 assert.match(sql,/address=any\(new.video_urls\)/);assert.match(sql,/revoke all on function/);
});
test('shared review styles have no root/body or universal global overrides on other site pages',()=>{
 const css=read('src/songbook-check/preview.css');assert.doesNotMatch(css,/:root\s*\{|(?:^|\})body\s*\{/);assert.match(css,/:where\(\.ck-app,\.ck-dialog\)/);
 const production=read('src/pages/SongbookUsabilityPage.jsx');assert.doesNotMatch(production,/standalone.css/);
});
