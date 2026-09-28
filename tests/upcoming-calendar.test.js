import test from 'node:test';
import assert from 'node:assert/strict';
import { getUpcomingEvents } from '../src/lib/promotion.js';

const now = new Date('2026-09-29T01:00:00Z');
const item = (title) => ({ id: title, event_date: '2026-10-03', title, category: '기타' });
test('homepage upcoming activities exclude bare calendar holidays without removing their calendar data', () => {
  const events = ['개천절', '한글날', '추석 연휴', '대체공휴일'].map(item);
  assert.deepEqual(getUpcomingEvents(events, now), []);
  assert.equal(events.length, 4);
});
test('holiday-themed streams and concerts remain discoverable', () => {
  const events = ['한글날 특별방송', '추석 연휴 노래 방송', '크리스마스 콘서트'].map(item);
  assert.equal(getUpcomingEvents(events, now).length, 3);
});
test('calendar holidays cannot take the real next activity slot', () => {
  const show = { ...item('밴드 라이브'), event_date: '2026-10-04', start_time: '20:00:00' };
  assert.deepEqual(getUpcomingEvents([item('개천절'), show], now, 1), [show]);
});
