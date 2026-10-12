import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCalendarGridStart } from '../supabase/functions/schedule-sync/calendar-grid.mjs';

function grid(start) {
  const epoch = Date.parse(start);
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) =>
    String(new Date(epoch + (week * 7 + day) * 86400000).getUTCDate())));
}
const november = [
  ['25','26','27','28','29','30','31'],
  ['1','2','3','4','5','6','7'],
  ['8','9','10','11','12','13','14'],
  ['15','16','17','18','19','20','21'],
  ['22','23','24','25','26','27','28'],
  ['29','30','1','2','3','4','5'],
];

test('2026.11 observed leading previous week resolves to October 25, not November 1', () => {
  assert.equal(resolveCalendarGridStart(2026, 11, november).toISOString(), '2026-10-25T00:00:00.000Z');
});
test('November event coordinates stay on November 2/3 and 30, never shift one week', () => {
  const start = resolveCalendarGridStart(2026, 11, november).getTime();
  const dateAt = (week, day) => new Date(start + (week * 7 + day) * 86400000).toISOString().slice(0,10);
  assert.equal(dateAt(1,1), '2026-11-02');
  assert.equal(dateAt(1,2), '2026-11-03');
  assert.equal(dateAt(5,1), '2026-11-30');
  assert.equal(dateAt(0,0), '2026-10-25');
});
test('existing September and October layouts remain unchanged', () => {
  for (const [month, start] of [[9,'2026-08-30'],[10,'2026-09-27']]) {
    assert.equal(resolveCalendarGridStart(2026, month, grid(start)).toISOString().slice(0,10), start);
  }
});
test('standard November starting at day 1 also remains valid', () => {
  assert.equal(resolveCalendarGridStart(2026,11,grid('2026-11-01')).toISOString().slice(0,10), '2026-11-01');
});
test('every corrupted date cell, including out-of-month labels, fails closed', () => {
  for (let i=0; i<42; i++) {
    const copy=november.map(row=>[...row]);
    copy[Math.floor(i/7)][i%7]='0';
    assert.throws(()=>resolveCalendarGridStart(2026,11,copy), /calendar_layout_changed/);
  }
});
test('truncated, missing, reordered, duplicated and malformed rows are rejected', () => {
  for (const days of [[],november.slice(0,5),[november[1],november[0],...november.slice(2)],
    [november[0],november[0],...november.slice(2)],
    november.map((r,i)=>i===0?r.slice(0,6):r),
    november.map((r,i)=>i===0?[null,...r.slice(1)]:r),
    november.map((r,i)=>i===0?['25abc',...r.slice(1)]:r),
    november.map((r,i)=>i===0?['025',...r.slice(1)]:r)]) {
    assert.throws(()=>resolveCalendarGridStart(2026,11,days), /calendar_layout_changed/);
  }
});
test('other-month or arbitrary one-week shifts are not accepted', () => {
  for (const start of ['2026-10-18','2026-11-08','2026-09-27']) {
    assert.throws(()=>resolveCalendarGridStart(2026,11,grid(start)), /calendar_layout_changed/);
  }
  assert.throws(()=>resolveCalendarGridStart(2026,10,grid('2026-09-20')), /calendar_layout_changed/);
});
test('leap years, year boundaries and all weekdays across 2024-2032 stay valid', () => {
  for(let year=2024;year<=2032;year++) for(let month=1;month<=12;month++) {
    const first=new Date(Date.UTC(year,month-1,1));
    const normal=new Date(Date.UTC(year,month-1,1-first.getUTCDay()));
    assert.equal(resolveCalendarGridStart(year,month,grid(normal.toISOString())).getTime(),normal.getTime());
    if(first.getUTCDay()===0) {
      const prior=new Date(normal.getTime()-7*86400000);
      assert.equal(resolveCalendarGridStart(year,month,grid(prior.toISOString())).getTime(),prior.getTime());
    }
  }
});
test('invalid month/year input cannot roll over into another calendar',()=>{
  for(const [year,month] of [[2026,0],[2026,13],[2026,1.5],[26,11],[NaN,11]])
    assert.throws(()=>resolveCalendarGridStart(year,month,november), /calendar_layout_changed/);
});
test('production loader uses the resolver before events and preserves all write protections',()=>{
  const source=readFileSync(new URL('../supabase/functions/schedule-sync/index.ts',import.meta.url),'utf8');
  assert.ok(source.includes('resolveCalendarGridStart(year, month, dateGrid)'));
  assert.ok(source.indexOf('resolveCalendarGridStart(year, month, dateGrid)') < source.indexOf('events.push({'));
  for(const fragment of ['actualDay !== String(gridDate.getUTCDate())','gridDate.getUTCMonth() + 1 !== month',
    'if (marker !== key)', 'else if (old.manual_override) continue;',
    'changeCount > config.max_changes || deleteKeys.length > config.max_deletes',
    'if (!dryRun)', 'safeEqual(suppliedToken, config.cron_token)',
    '.eq("manual_override", false)']) assert.ok(source.includes(fragment), fragment);
});
