import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFanart, unavailableFanart, fanartMessage, safeEqual, kstClock, notificationPlan } from '../supabase/functions/fanart-daily-recovery/policy.mjs';
const now = Date.parse('2026-10-10T06:20:00+09:00');
const fixture = (state='waiting', attempts=0, clock=now) => ({
  retry: { version:2, batchDate:kstClock(clock).date, checkedAt:new Date(clock).toISOString(), state, attemptsToday:attempts,
    maxAttempts:4, nextAttemptAt:'2026-10-10T07:00:00+09:00', reason:'upstream_backoff_active' },
  lastRun:{ status:'deferred', batchDate:'2026-10-10' },
  snapshot:{ batchDate:'2026-10-09', articleId:123, imageCount:2, batchCollectedAt:'2026-10-09T01:00:02+09:00' },
});
test('waiting does not trigger source and is not final failure', () => {
  const d=evaluateFanart(fixture(),'tick',now);
  assert.equal(d.mayRun,false); assert.equal(d.outcome,'waiting'); assert.equal(d.terminal,false);
  assert.match(fanartMessage(d,'initial'),/아직 최종 실패 아님/);
  assert.match(fanartMessage(d,'initial'),/2026-10-10 07:00:00 KST/);
});
test('only tick may collect a ready state', () => {
  assert.equal(evaluateFanart(fixture('ready'),'tick',now).mayRun,true);
  for (const mode of ['initial','final']) assert.equal(evaluateFanart(fixture('ready'),mode,now).mayRun,false);
});
test('old, missing, stale or inconsistent API state cannot trigger collection', () => {
  assert.throws(()=>evaluateFanart({lastRun:{status:'failed'}},'tick',now));
  const x=fixture('ready'); x.retry.checkedAt=new Date(now-180000).toISOString();
  assert.throws(()=>evaluateFanart(x,'tick',now));
  const y=fixture('success'); assert.throws(()=>evaluateFanart(y,'tick',now));
  const z=fixture('ready',5); assert.throws(()=>evaluateFanart(z,'tick',now));
  assert.equal(unavailableFanart('fanart_status_unavailable',now).mayRun,false);
});
test('confirmed current-date snapshot reports recovered success', () => {
  const x=fixture('success',2); x.lastRun={status:'success',batchDate:'2026-10-10',articleId:123}; x.snapshot.batchDate='2026-10-10';
  const d=evaluateFanart(x,'tick',now); assert.equal(d.outcome,'success'); assert.equal(d.terminal,true); assert.equal(d.mayRun,false);
  assert.match(fanartMessage(d,'final'),/최종 백업 성공/);
});
test('four actual attempts are terminal; end-of-day closes pending work', () => {
  const d=evaluateFanart(fixture('exhausted',4),'tick',now); assert.equal(d.outcome,'failure'); assert.equal(d.mayRun,false);
  const cutoff=Date.parse('2026-10-10T23:55:00+09:00');
  const final=evaluateFanart(fixture('closed',1,cutoff),'final',cutoff);
  assert.equal(final.outcome,'failure'); assert.equal(final.reason,'daily_retry_window_closed');
  assert.equal(unavailableFanart('fanart_status_unavailable',cutoff).terminal,true);
});
test('23:50 cutoff and KST day boundary are respected', () => {
  const cutoff=Date.parse('2026-10-10T23:50:00+09:00');
  assert.equal(evaluateFanart(fixture('ready',1,cutoff),'tick',cutoff).mayRun,false);
  assert.equal(kstClock(Date.parse('2026-10-10T15:00:00Z')).date,'2026-10-11');
});
test('token comparison rejects missing, unequal and different-length values', () => {
  assert.equal(safeEqual('',''),false); assert.equal(safeEqual('a','b'),false); assert.equal(safeEqual('a','aa'),false); assert.equal(safeEqual('abc','abc'),true);
});

test('missed initial reports are retried; successful initial suppresses duplicate final', () => {
  assert.equal(notificationPlan({terminal:false,outcome:'waiting'},'tick',null),'initial');
  assert.equal(notificationPlan({terminal:true,outcome:'success'},'tick',{delivery:'sent',outcome:'success'}),null);
  assert.equal(notificationPlan({terminal:true,outcome:'success'},'tick',{delivery:'sent',outcome:'waiting'}),'final');
  assert.equal(notificationPlan({terminal:true,outcome:'success'},'tick',{delivery:'sent',outcome:'failure'}),'final');
  assert.equal(notificationPlan({terminal:true,outcome:'failure'},'final',{delivery:'sent',outcome:'waiting'}),'final');
});
