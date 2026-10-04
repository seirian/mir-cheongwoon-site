import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPlaybackPosition,parsePlaybackPosition,MAX_PLAYBACK_SECONDS} from '../src/lib/playbackPosition.js';

test('playback position accepts pasted h:m:s and m:s without mental second conversion', () => {
  for (const [input, expected] of [['01:12:30',4350],['1:12:30',4350],['03:20',200],['3:20',200],['12:30',750],['72:30',4350],['1:2:3',3723],[' 01:12:30 ',4350],['０１：１２：３０',4350]]) {
    assert.deepEqual(parsePlaybackPosition(input), {seconds:expected,error:''});
  }
});
test('playback position formats existing integer seconds without altering saved offsets', () => {
  for (const [seconds,text] of [[0,'00:00:00'],[59,'00:00:59'],[60,'00:01:00'],[200,'00:03:20'],[4350,'01:12:30'],[7510,'02:05:10'],[86400,'24:00:00'],[172800,'48:00:00']]) {
    assert.equal(formatPlaybackPosition(seconds),text);
    assert.equal(parsePlaybackPosition(text).seconds,seconds);
  }
});
test('playback position roundtrips across the full existing API range including multi-day VODs', () => {
  for(let n=0;n<=MAX_PLAYBACK_SECONDS;n+=37) assert.equal(parsePlaybackPosition(formatPlaybackPosition(n)).seconds,n);
  assert.equal(parsePlaybackPosition('2880:00').seconds,MAX_PLAYBACK_SECONDS);
});
test('blank or missing positions stay unconfirmed rather than becoming timestamp zero', () => {
  for(const value of ['', ' ',null,undefined,0,4350]) {
    assert.equal(parsePlaybackPosition(value).seconds,null);
    assert.ok(parsePlaybackPosition(value).error);
  }
  assert.equal(parsePlaybackPosition('00:00').seconds,0);
  assert.equal(formatPlaybackPosition(null),'');
});
test('invalid components and over-limit times are rejected rather than wrapped or clamped', () => {
  for(const value of ['00:60:00','1:00:60','03:99','48:00:01','49:00:00','2880:01','9999:00','-1:00','1:-2:00']) {
    assert.equal(parsePlaybackPosition(value).seconds,null,value);
    assert.ok(parsePlaybackPosition(value).error,value);
  }
});
test('raw seconds, partial values, floats, signs, expressions and external URLs are not interpreted as positions', () => {
  for(const value of ['4350','0','12:',':30','1::30','1:2:3:4','1:02.5','1e2:00','+01:20','01: 20','01:0x10','1/2:30','https://vod.sooplive.com/player/208123456','1'.repeat(33)]) {
    assert.equal(parsePlaybackPosition(value).seconds,null,value);
    assert.ok(parsePlaybackPosition(value).error,value);
  }
});
test('invalid stored values cannot be silently presented as a verified start position', () => {
  for(const value of [null,undefined,'4350',-1,1.5,NaN,Infinity,MAX_PLAYBACK_SECONDS+1]) assert.equal(formatPlaybackPosition(value),'');
});
