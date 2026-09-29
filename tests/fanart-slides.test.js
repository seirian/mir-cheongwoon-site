import test from 'node:test';
import assert from 'node:assert/strict';
import { fanartImageUrls, nextFanartImage, FANART_INTERVAL_MS } from '../src/lib/fanartSlides.js';
const url = (i) => `/api/naver-fanart-image.php?id=${i.toString(16).padStart(64,'0')}`;
test('fanart: preserves body order and deduplicates proxy images', () => {
  assert.deepEqual(fanartImageUrls({imageUrls:[url(1),url(2),url(1),url(3)]}),[url(1),url(2),url(3)]);
});
test('fanart: supports existing single-image and fallback caches', () => {
  assert.deepEqual(fanartImageUrls({imageUrl:url(1)}),[url(1)]);
  assert.equal(fanartImageUrls({imageUrl:url(1).replace('?id=','?fallback=')}).length,1);
  assert.equal(fanartImageUrls({imageUrl:`https://mir.yeop.net/_yeop_releases/r20260929135620_189d2cec${url(1)}`}).length,1);
});
test('fanart: rejects arbitrary URLs, executable schemes, foreign hosts and malformed IDs', () => {
  assert.deepEqual(fanartImageUrls({imageUrls:['javascript:alert(1)','https://evil.test/a.jpg','//mir.yeop.net'+url(1),url(1)+'&url=x',null,{}]}),[]);
});
test('fanart: list is bounded to twelve images', () => {
  assert.equal(fanartImageUrls({imageUrls:Array.from({length:50},(_,i)=>url(i))}).length,12);
});
test('fanart: cycles in either direction and skips failed images', () => {
  const images=[url(1),url(2),url(3)];
  assert.equal(nextFanartImage(images,url(1)),url(2));
  assert.equal(nextFanartImage(images,url(3)),url(1));
  assert.equal(nextFanartImage(images,url(1),{},-1),url(3));
  assert.equal(nextFanartImage(images,url(1),{[url(2)]:true}),url(3));
  assert.equal(nextFanartImage(images,url(1),Object.fromEntries(images.map(i=>[i,true]))),'');
});
test('fanart: single slide stays still, no image has no candidate, interval is five seconds', () => {
  assert.equal(nextFanartImage([url(1)],url(1)),url(1)); assert.equal(nextFanartImage([],''),''); assert.equal(FANART_INTERVAL_MS,5000);
});
