import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vodLinks} from '../src/lib/songbookMedia.js';
import {cleanSong,representative,validateEdit,SAMPLE_SONGS} from '../src/songbook-check/model.js';
const read=path=>readFileSync(path,'utf8');
test('round3: platform-labelled links reuse the existing marks without representative or external-arrow decoration',()=>{
 const file=read('src/songbook-check/Dialogs.jsx');
 const links=file.slice(file.indexOf('export function VideoLinks('),file.indexOf('export function QuickEdit('));
 assert.match(links,/<VideoMark platform=\{v.platform\}/);
 assert.match(links,/YouTube/);assert.match(links,/SOOP/);
 assert.doesNotMatch(links,/<ExternalLink|<Star|대표|representative/);
 assert.match(links,/target="_blank" rel="noopener noreferrer"/);assert.match(links,/aria-label=/);
 assert.match(links,/links.slice\(0,2\)/);assert.match(links,/v.total>1/);
});
test('round3: categories and compact video controls share a nonwrapping row rather than separate vertical blocks',()=>{
 const page=read('src/songbook-check/Preview.jsx');
 assert.match(page,/<div className="ck-category-video-row"><SongCategories song=\{song\}\/><VideoLinks song=\{song\} compact\/><\/div>/);
 const css=read('src/songbook-check/round3.css');
 assert.match(css,/\.ck-category-video-row\{[^}]*flex-wrap:nowrap/);
 assert.match(css,/\.ck-category-video-row>\.ck-videos.compact\{[^}]*flex-wrap:nowrap/);
 assert.doesNotMatch(css,/overflow:hidden|line-clamp|text-overflow|display:none/);
 assert.match(css,/min-height:44px/);
 const entry=read('src/songbook-check/main.jsx');assert.ok(entry.indexOf("'./round3.css'")>entry.indexOf("'./preview.css'"));
});
test('round3: presentation changes do not alter first-YouTube selection, timestamps, categories or editing protection',()=>{
 const urls=['https://vod.sooplive.com/player/123456789?change_second=60','https://youtu.be/abcdefghijk?t=60','https://youtu.be/aqz-KE-bpKQ?t=120'];
 const song=cleanSong({...SAMPLE_SONGS[4],videoUrls:urls});const before=JSON.stringify(song);
 const links=vodLinks(song.videoUrls);assert.equal(links[0].url,representative(song).url);assert.ok(links[0].url.endsWith('&t=60'));assert.equal(links[2].platform,'soop');
 assert.equal(JSON.stringify(song),before);
 const changed=validateEdit(song,{...song,videoUrls:[urls[0],urls[2]]});assert.ok(representative(changed).url.endsWith('&t=120'));assert.deepEqual(changed.categories,song.categories);assert.equal(changed.proficiency,song.proficiency);
});
test('round3: page, help, HTML and release marker consistently identify review three',()=>{
 for(const path of ['src/songbook-check/Preview.jsx','src/songbook-check/Dialogs.jsx','songbook-check.html']){assert.match(read(path),/3차 검토/);assert.doesNotMatch(read(path),/2차 검토/);}
 assert.match(read('scripts/build-songbook-check.mjs'),/reviewVersion:3/);
});
