import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scheduleNotice,NOTICE_VISIBLE_MS,NOTICE_FADE_MS} from '../src/lib/noticeTimer.js';
function fakeClock(){
 let now=0,id=0;const jobs=new Map();
 return {setTimeout(fn,ms){const n=++id;jobs.set(n,{fn,at:now+ms});return n;},clearTimeout(n){jobs.delete(n);},
  tick(ms){now+=ms;for(const [n,j] of [...jobs].sort((a,b)=>a[1].at-b[1].at))if(j.at<=now&&jobs.delete(n))j.fn();},get size(){return jobs.size;}};
}
test('completion notices wait ten seconds, fade for 300ms, then dismiss',()=>{
 const clock=fakeClock(),events=[];scheduleNotice(()=>events.push('fade'),()=>events.push('dismiss'),clock);
 assert.equal(NOTICE_VISIBLE_MS,10000);assert.equal(NOTICE_FADE_MS,300);
 clock.tick(9999);assert.deepEqual(events,[]);clock.tick(1);assert.deepEqual(events,['fade']);clock.tick(299);assert.deepEqual(events,['fade']);clock.tick(1);assert.deepEqual(events,['fade','dismiss']);
});
test('clearing a notice or unmounting cancels every callback',()=>{
 const clock=fakeClock(),events=[];const cancel=scheduleNotice(()=>events.push('fade'),()=>events.push('dismiss'),clock);
 cancel();cancel();clock.tick(30000);assert.deepEqual(events,[]);assert.equal(clock.size,0);
});
test('new feedback after nine seconds gets a fresh lifetime, even with the same text',()=>{
 const clock=fakeClock(),events=[];const cancel=scheduleNotice(()=>events.push('old'),()=>events.push('old'),clock);
 clock.tick(9000);cancel();scheduleNotice(()=>events.push('new fade'),()=>events.push('new dismissed'),clock);
 clock.tick(1300);assert.deepEqual(events,[]);clock.tick(8700);assert.deepEqual(events,['new fade']);clock.tick(300);assert.deepEqual(events,['new fade','new dismissed']);
});
test('new feedback during fade cannot be dismissed by the older timer',()=>{
 const clock=fakeClock(),events=[];const cancel=scheduleNotice(()=>events.push('fade'),()=>events.push('old dismissed'),clock);
 clock.tick(10000);cancel();scheduleNotice(()=>events.push('new fade'),()=>events.push('new dismissed'),clock);clock.tick(300);assert.deepEqual(events,['fade']);
});
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('all completion surfaces share the hook; errors and manual-copy instructions opt out',()=>{
 for(const path of ['src/pages/SongbookV2Page.jsx','src/components/songbook/SongDeletion.jsx','src/components/songbook/TimelinePanel.jsx','src/components/songbook/SongEditor.jsx'])assert.match(read(path),/useTimedNotice/);
 const page=read('src/pages/SongbookV2Page.jsx');assert.match(page,/setMessage\(e.message,\{autoDismiss:false\}\)/);
 assert.match(page,/직접 복사해주세요\.',\{autoDismiss:false\}\)/);assert.match(page,/브라우저 저장이 차단되어[^']*',\{autoDismiss:false\}\)/);
 assert.match(page,/\{\.\.\.messageNoticeProps\}/);assert.match(page,/\{\.\.\.deleteNoticeProps\}/);
 const hook=read('src/lib/useTimedNotice.js');assert.match(hook,/previous.id \+ 1/);assert.match(hook,/current.id === id/);assert.match(hook,/return scheduleNotice/);
});
test('fade is opacity-only, respects reduced motion and does not override existing notice gutters',()=>{
 const css=read('src/songbook-notice.css');assert.match(css,/transition:opacity 300ms ease/);assert.match(css,/prefers-reduced-motion:reduce/);assert.doesNotMatch(css,/width:|margin:|position:|transform:/);
});
