import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPage,savedReviewView,saveReviewView,reviewNotice} from '../src/lib/songbookReviewState.js';

test('review pagination clamps only when the current last page disappears',()=>{
 assert.equal(reviewPage(1,17),1);assert.equal(reviewPage(1,16),1);assert.equal(reviewPage(1,8),0);
 assert.equal(reviewPage(2,16),1);assert.equal(reviewPage(0,0),0);assert.equal(reviewPage(-1,10),0);
});
test('review expansion and position persist per account, without row data or credentials',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 saveReviewView(storage,'first',{open:true,tab:'excluded',page:4,access_token:'never-save',rows:['private']});
 assert.deepEqual(savedReviewView(storage,'first'),{open:true,tab:'excluded',page:4});
 assert.deepEqual(savedReviewView(storage,'other'),{open:false,tab:'pending',page:0});
 assert.doesNotMatch([...data.values()].join(''),/never-save|private|rows|access_token/);
});
test('review persistence tolerates corrupt and disabled storage',()=>{
 assert.deepEqual(savedReviewView({getItem:()=>'{broken'},'id'),{open:false,tab:'pending',page:0});
 assert.deepEqual(savedReviewView({getItem:()=>'{"open":true,"tab":"unknown","page":999999}'},'id'),{open:true,tab:'pending',page:0});
 assert.doesNotThrow(()=>saveReviewView({setItem(){throw Error();}},'id',{open:true,page:1}));
});
test('successful exclusion reports removal from the queue, not deletion of the underlying song',()=>{
 assert.match(reviewNotice('곡 제목','rejected'),/곡 제목.*확인 목록에서 삭제.*제외 기록은 보관/);
 assert.match(reviewNotice('곡 제목','approved'),/노래책에 반영/);
});
