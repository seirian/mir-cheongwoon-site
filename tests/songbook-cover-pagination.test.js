import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SONGBOOK_PAGE_SIZES,SONGBOOK_COVER_PAGE_SIZES,songbookPageSizes,songbookPageSize,songbookPage} from '../src/lib/songbookBulk.js';
const rows=Array.from({length:106},(_,id)=>({id}));
test('list options remain unchanged; cover has only 24/48/96',()=>{
 assert.deepEqual(SONGBOOK_PAGE_SIZES,[10,25,50,100]);assert.deepEqual(SONGBOOK_COVER_PAGE_SIZES,[24,48,96]);
 assert.deepEqual(songbookPageSizes('cover'),[24,48,96]);assert.deepEqual(songbookPageSizes('list'),[10,25,50,100]);
 assert(Object.isFrozen(SONGBOOK_COVER_PAGE_SIZES));
});
test('missing, invalid and legacy cover page lengths default to 24, not 25',()=>{
 for(const value of [undefined,null,'',0,10,25,50,100,NaN,Infinity,-24,'024','24.0','24x'])assert.equal(songbookPageSize(value,'cover'),24);
 for(const value of [undefined,null,'',24,48,96])assert.equal(songbookPageSize(value,'list'),25);
 assert.equal(songbookPageSize(100,'unknown'),100);
});
test('all cover sizes work from URL strings and numeric input',()=>{
 for(const n of [24,48,96]){assert.equal(songbookPageSize(n,'cover'),n);assert.equal(songbookPageSize(String(n),'cover'),n);}
});
test('cover pagination covers every song once including a partial final page',()=>{
 for(const n of [24,48,96]){
  const first=songbookPage(rows,1,n,'cover');assert.equal(first.pageSize,n);assert.equal(first.pages,Math.ceil(rows.length/n));
  assert.equal(first.items.length,n);const all=[];
  for(let page=1;page<=first.pages;page++)all.push(...songbookPage(rows,page,n,'cover').items);
  assert.deepEqual(all,rows);assert.deepEqual(songbookPage(rows,999,n,'cover').items,rows.slice((first.pages-1)*n));
 }
});
test('empty and invalid requested pages are bounded without changing default layout behavior',()=>{
 assert.deepEqual(songbookPage([],999,96,'cover'),{page:1,pages:1,pageSize:96,items:[]});
 for(const p of [NaN,-1,0,'invalid'])assert.equal(songbookPage(rows,p,48,'cover').page,1);
 assert.equal(songbookPage(rows,1,25).items.length,25);assert.equal(songbookPage(rows,1).pageSize,25);
});
test('deleting the last song on a cover page uses the cover length when clamping',()=>{
 const before=Array.from({length:25},(_,id)=>({id}));assert.equal(songbookPage(before,2,24,'cover').items.length,1);
 assert.deepEqual(songbookPage(before.slice(0,-1),2,24,'cover'),{page:1,pages:1,pageSize:24,items:before.slice(0,-1)});
 const page=readFileSync('src/pages/SongbookUsabilityPage.jsx','utf8');assert(page.includes('page.page,page.pageSize,layout)'));
});
test('unneeded cover hint is removed while cover detail actions stay available',()=>{
 const page=readFileSync('src/pages/SongbookUsabilityPage.jsx','utf8'),card=readFileSync('src/components/songbook/SongbookCoverCard.jsx','utf8');
 assert(!page.includes('커버나 곡명을 누르면'));assert(!page.includes('sg-cover-hint'));assert(card.includes('onClick={open}'));
});
test('desktop covers use six columns with four/two column responsive fallback',()=>{
 const css=readFileSync('src/songbook-cover.css','utf8');
 for(const n of [6,4,2])assert(css.includes(`grid-template-columns:repeat(${n},minmax(0,1fr))`));
 assert(!css.includes('repeat(auto-fill'));assert(!css.includes('sg-cover-hint'));
});
