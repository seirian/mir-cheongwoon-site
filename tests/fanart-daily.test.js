import test from 'node:test';
import assert from 'node:assert/strict';
import { requestFanart, validFanartResponse } from '../src/lib/fanartRequest.js';
import { fanartImageUrls } from '../src/lib/fanartSlides.js';
const primary = { status: 'ok', articleUrl:'https://cafe.naver.com/f-e/cafes/31003156/articles/222', imageUrl:'/api/naver-fanart-image.php?id='+'a'.repeat(64) };
const backup = { ...primary, articleUrl:'https://cafe.naver.com/f-e/cafes/31003156/articles/111', imageUrl:'/api/naver-fanart-image.php?daily='+'b'.repeat(64), fallbackKind:'daily_batch', batchCollectedAt:'2026-09-30T16:00:03Z' };
function fixture(values, calls) { return async url => { calls.push(url); const v=values[calls.length-1]; if(v instanceof Error) throw v; return {ok:v?.status==='ok',json:async()=>v}; }; }
test('live success wins and does not request the daily backup',async()=> {const calls=[];assert.deepEqual(await requestFanart('/',{fetcher:fixture([primary],calls)}),primary);assert.equal(calls.length,1);});
for (const [name,error] of [['network',new Error('offline')],['HTTP or upstream failure',{status:'unavailable'}],['malformed response',{}]]) {
  test(name+' selects daily backup',async()=>{const calls=[];assert.deepEqual(await requestFanart('/',{fetcher:fixture([error,backup],calls)}),backup);assert.equal(calls[1],'/api/naver-fanart-backup.php');});
}
test('image failure requests only the read-only backup',async()=>{const calls=[];await requestFanart('/',{backupOnly:true,fetcher:fixture([backup],calls)});assert.deepEqual(calls,['/api/naver-fanart-backup.php']);});
test('bad daily timestamp, unknown IDs and arbitrary original URLs rejected',()=>{assert.equal(validFanartResponse({...backup,batchCollectedAt:'bad'}),false);assert.equal(validFanartResponse({...primary,articleUrl:'https://evil.test'}),false);assert.deepEqual(fanartImageUrls({imageUrl:'/api/naver-fanart-image.php?daily=../../config'}),[]);});
test('daily image order and deduplication retained',()=>{const u=backup.imageUrl;assert.deepEqual(fanartImageUrls({imageUrls:[u,u,u.replace(/b/g,'c')]}),[u,u.replace(/b/g,'c')]);});
test('unavailable backup does not silently return an invalid payload',async()=>{await assert.rejects(requestFanart('/',{fetcher:fixture([new Error('offline'),{status:'unavailable'}],[])}));});
test('unmounted request does not initiate a fallback',async()=>{const controller=new AbortController();controller.abort();const calls=[];await assert.rejects(requestFanart('/',{backupOnly:true,signal:controller.signal,fetcher:fixture([backup],calls)}));assert.equal(calls.length,0);});
