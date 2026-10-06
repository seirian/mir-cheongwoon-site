import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewSearchQuery,fetchReviewCandidates} from '../src/lib/songbookReviewSearch.js';
import {savedReviewView,saveReviewView,REVIEW_TABS} from '../src/lib/songbookReviewState.js';
test('review query trims whitespace and normalizes Unicode without interpreting wildcard or filter syntax',()=>{
 assert.equal(reviewSearchQuery('  영물이다\n 이오몽  '),'영물이다 이오몽');
 assert.equal(reviewSearchQuery('Ｗｉｓｐ！'),'Wisp!');
 assert.equal(reviewSearchQuery('%_*"(),\\'),'%_*"(),\\');
 assert.equal(reviewSearchQuery(null),'');assert.equal(reviewSearchQuery('가'.repeat(201)).length,200);
});
test('review search sends typed parameters in read-only RPC before paging for every tab',async()=>{
 const calls=[],client={rpc:async(...args)=>{calls.push(args);return {data:{count:42,rows:[{id:'found-on-later-page'}]},error:null};}};
 for(const tab of REVIEW_TABS){const r=await fetchReviewCandidates(client,{tab,page:2,query:' 영물이다 이오몽 '});assert.equal(r.count,42);assert.equal(r.data[0].id,'found-on-later-page');}
 for(let i=0;i<REVIEW_TABS.length;i++)assert.deepEqual(calls[i],['songbook_review_search',{p_decision:REVIEW_TABS[i],p_query:'영물이다 이오몽',p_page:2,p_page_size:8},{get:true}]);
});
test('blank search uses the existing present/tab/ordered range query, without requesting a catalog dump',async()=>{
 const calls=[],chain={};for(const m of ['select','eq','order','range'])chain[m]=(...a)=>{calls.push([m,...a]);return chain;};chain.then=r=>Promise.resolve({data:[],count:0,error:null}).then(r);
 await fetchReviewCandidates({from:name=>{assert.equal(name,'songbook_timeline_candidates');return chain;}},{tab:'pending',page:1,query:'  '});
 assert.deepEqual(calls.slice(1),[['eq','present',true],['eq','decision','pending'],['order','first_seen_at',{ascending:false}],['order','id'],['range',8,15]]);
});
test('search failures are not presented as empty successful results and malformed payloads reject',async()=>{
 const error={code:'42501'};assert.equal((await fetchReviewCandidates({rpc:async()=>({error})},{tab:'pending',page:0,query:'곡'})).error,error);
 for(const data of [null,{}, {count:-1,rows:[]},{count:1,rows:null}])await assert.rejects(fetchReviewCandidates({rpc:async()=>({data})},{tab:'pending',page:0,query:'곡'}));
 await assert.rejects(fetchReviewCandidates({}, {tab:'bad',page:0,query:'곡'}));
});
test('query persists only in per-account session view and is bounded; older stored view defaults to empty',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 saveReviewView(storage,'one',{open:true,tab:'pending',page:2,query:'영물이다',rows:['not saved']});
 assert.equal(savedReviewView(storage,'one').query,'영물이다');assert.equal(savedReviewView(storage,'two').query,'');
 saveReviewView(storage,'two',{query:'가'.repeat(400)});assert.equal(savedReviewView(storage,'two').query.length,200);
 assert.doesNotMatch([...values.values()].join(''),/not saved/);
});
test('search is read-only and security invoker, with literal matching and no dynamic SQL',()=>{
 const sql=readFileSync(new URL('../supabase/ops/songbook_review_search.sql',import.meta.url),'utf8');
 assert.match(sql,/stable security invoker/);assert.match(sql,/strpos/);assert.match(sql,/public\.admins/);assert.match(sql,/from public,anon/);
 assert.doesNotMatch(sql,/security definer|execute format|delete from|update public|insert into/i);
});
