import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWithdrawalHandler } from '../supabase/functions/member-withdrawal/handler.js';
import { requestAccountWithdrawal, clearWithdrawnSession, finishAccountWithdrawal } from '../src/lib/accountWithdrawal.js';
import { policyDocuments, POLICY_CONTACT, POLICY_VERSION } from '../src/data/policyContent.js';
const token = 'synthetic-only-token-not-a-real-credential';
const id = 'test-user-a'; const other = 'test-user-b';
function setup(options = {}) {
  const calls = []; let roleRead = 0; let userRead = 0;
  const user = { id, email: 'test@example.invalid', ...options.user };
  const admin = { auth: {
    getUser: async supplied => { calls.push(['validate', supplied]); userRead++; return { data: { user: userRead > 1 && options.switched ? { ...user, id: other } : user }, error: options.authError }; },
    admin: {
      signOut: async (...args) => { calls.push(['revoke', ...args]); return { error: options.revokeError }; },
      deleteUser: async (...args) => { calls.push(['delete', ...args]); if(options.deleteThrows) throw Error('transport with sensitive upstream data'); return { data: { user }, error: options.deleteError }; },
      getUserById: async target => { calls.push(['check-absent',target]); return options.notAbsent ? { data: { user } } : { data: { user: null }, error: { status: 404, code: 'user_not_found' } }; },
    },
  }, from: table => ({ select: () => ({ eq: (column, value) => ({ maybeSingle: async () => {
    calls.push(['table',table,column,value]);
    if(table==='admins') { roleRead++; return { data: options.managed || (options.promoted && roleRead>1) ? { user_id:id } : null, error:options.roleError }; }
    return { data:options.profileRemaining ? { user_id:id } : null, error:options.profileError };
  } }) }) }) };
  const verifier = { auth: {
    signInWithPassword: async values => { calls.push(['password', { ...values }]); return { data: { user: { ...user, id: options.wrongVerifiedId ? other : id }, session: options.noSession ? null : { access_token: 'verified-temp-token' } }, error: options.passwordError }; },
    getUser: async () => ({ data: { user }, error: options.verifierError }),
    signOut: async opts => { calls.push(['cleanup',opts.scope]); if(options.cleanupThrows) throw Error('cleanup'); return {}; },
    stopAutoRefresh: async () => {},
  } };
  const handler = createWithdrawalHandler({ url:'https://project.supabase.co', publicKey:'public-test',serviceKey:'secret-test', createClient: (_url,key,opts) => {
    assert.equal(opts.auth.persistSession,false); assert.equal(opts.auth.autoRefreshToken,false);
    return key==='secret-test' ? admin : verifier;
  } });
  return { handler,calls };
}
function req(body = { password:' current password ', confirmation:'DELETE_MY_ACCOUNT' }, overrides = {}) {
  return new Request('https://project.supabase.co/functions/v1/member-withdrawal', {
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',origin:'https://mir.yeop.net'},body:JSON.stringify(body),...overrides,
  });
}
const deletes = calls => calls.filter(call=>call[0]==='delete');
test('withdrawal: verifies JWT, password and same user, revokes sessions, hard-deletes only the authenticated ID',async()=>{
  const {handler,calls}=setup(); const response=await handler(req());
  assert.equal(response.status,200); assert.deepEqual(await response.json(),{ok:true,code:'ACCOUNT_DELETED'});
  assert.deepEqual(deletes(calls),[['delete',id,false]]);
  assert.deepEqual(calls.find(c=>c[0]==='password')[1],{email:'test@example.invalid',password:' current password '});
  assert.ok(calls.findIndex(c=>c[0]==='revoke')<calls.findIndex(c=>c[0]==='delete'));
  assert.ok(calls.find(c=>c[0]==='check-absent'));
  assert.equal(response.headers.get('cache-control'),'no-store');
});
for (const [name, options, code] of [
  ['invalid JWT',{authError:{status:401}},'authentication_required'],
  ['anonymous',{user:{is_anonymous:true}},'authentication_required'],
  ['missing email',{user:{email:null}},'authentication_required'],
  ['verified MFA',{user:{factors:[{status:'verified'}]}},'additional_verification_required'],
  ['managed account',{managed:true},'managed_account'],
  ['role lookup outage',{roleError:{status:500}},'service_unavailable'],
  ['wrong password',{passwordError:{status:400,message:'SENSITIVE upstream response'}},'password_mismatch'],
  ['provider rate limit',{passwordError:{status:429}},'rate_limited'],
  ['provider outage',{passwordError:{status:503}},'service_unavailable'],
  ['no reauth session',{noSession:true},'authentication_required'],
  ['different verified identity',{wrongVerifiedId:true},'authentication_required'],
  ['expired verification',{verifierError:{status:401}},'authentication_required'],
  ['account changed during reauthentication',{switched:true},'authentication_required'],
  ['role promoted during reauthentication',{promoted:true},'managed_account'],
  ['revocation failed',{revokeError:{status:500}},'service_unavailable'],
]) test('withdrawal: '+name+' never deletes',async()=>{
  const {handler,calls}=setup(options); const response=await handler(req());
  assert.deepEqual(deletes(calls),[]); const text=await response.text();
  assert.equal(JSON.parse(text).code,code); assert.doesNotMatch(text,/SENSITIVE|test@example|current password/);
});
for(const body of [null,[],{}, {password:'x',confirmation:'no'}, {password:'x',confirmation:'DELETE_MY_ACCOUNT',user_id:other}, {password:'x',confirmation:'DELETE_MY_ACCOUNT',email:'other@example.invalid'}, {password:'x'.repeat(129),confirmation:'DELETE_MY_ACCOUNT'}])
  test('withdrawal: rejects malformed body or caller-selected target '+JSON.stringify(body).slice(0,70),async()=>{
    const {handler,calls}=setup(); const response=await handler(req(body)); assert.equal(response.status,400); assert.deepEqual(calls,[]);
  });
test('withdrawal: rejects foreign origin and missing token before auth',async()=>{
  for(const headers of [{origin:'https://evil.invalid',authorization:`Bearer ${token}`},{origin:'https://mir.yeop.net'}]) {
    const {handler,calls}=setup(); assert.ok((await handler(req(undefined,{headers}))).status>=400); assert.deepEqual(calls,[]);
  }
});
test('withdrawal: malformed JSON, unsupported content and oversized streamed body never authenticate',async()=>{
  for(const request of [req(undefined,{body:'{' }), req(undefined,{headers:{authorization:`Bearer ${token}`,'content-type':'text/plain'}}),req(undefined,{body:' '.repeat(5000)})]) {
    const {handler,calls}=setup(); assert.equal((await handler(request)).status,400); assert.deepEqual(calls,[]);
  }
});
test('withdrawal: OPTIONS and GET cannot mutate',async()=>{
  for(const [method,status] of [['OPTIONS',204],['GET',405]]){
    const {handler,calls}=setup();assert.equal((await handler(new Request('https://example.invalid',{method}))).status,status);assert.deepEqual(calls,[]);
  }
});
for(const options of [{deleteThrows:true},{deleteError:{status:500}},{notAbsent:true},{profileRemaining:true},{profileError:{status:503}}])
  test('withdrawal: uncertain deletion never retries or acknowledges success '+JSON.stringify(options),async()=>{
    const {handler,calls}=setup(options); const result=await handler(req()); assert.equal(result.status,503);
    assert.equal((await result.json()).code,'deletion_unconfirmed'); assert.equal(deletes(calls).length,1);
  });
test('withdrawal: cleanup failure cannot undo acknowledged deletion',async()=>{
  const {handler}=setup({cleanupThrows:true}); assert.equal((await handler(req())).status,200);
});
function browserClient(options={}) {
  const calls=[];return {calls,auth:{getUser:async()=>({data:{user:{id:options.changed?other:id}}}),getSession:async()=>({data:{session:{user:{id},access_token:token}}}),signOut:async()=>{calls.push('signout');}},
    functions:{invoke:async(name,payload)=>{calls.push([name,payload]);if(options.throw)throw Error('transport');return options.result || {data:{ok:true,code:'ACCOUNT_DELETED'}};}}};
}
test('withdrawal client: local checks never invoke, and no caller ID/email is sent',async()=>{
  for(const values of [{password:'',confirmed:true},{password:'x',confirmed:false}]){const c=browserClient();assert.ok((await requestAccountWithdrawal(c,values,id)).error);assert.equal(c.calls.length,0);}
  const c=browserClient();assert.deepEqual(await requestAccountWithdrawal(c,{password:'x',confirmed:true},id),{ok:true});
  assert.deepEqual(c.calls[0],['member-withdrawal',{headers:{Authorization:`Bearer ${token}`},body:{password:'x',confirmation:'DELETE_MY_ACCOUNT'}}]);
});
test('withdrawal client: account mismatch prevents a request',async()=>{
  const c=browserClient({changed:true});assert.equal((await requestAccountWithdrawal(c,{password:'x',confirmed:true},id)).error,'authentication_required');assert.equal(c.calls.length,0);
});
test('withdrawal client: lost response is not retried',async()=>{
  const c=browserClient({throw:true});assert.equal((await requestAccountWithdrawal(c,{password:'x',confirmed:true},id)).error,'deletion_unconfirmed');assert.equal(c.calls.length,1);
});
test('withdrawal client: error codes parsed without showing untrusted messages',async()=>{
  const c=browserClient({result:{error:{context:new Response(JSON.stringify({code:'password_mismatch',message:'SECRET'}),{status:403})}}});
  assert.deepEqual(await requestAccountWithdrawal(c,{password:'x',confirmed:true},id),{error:'password_mismatch'});
});
test('withdrawal cleanup: only the matching account key can be removed',async()=>{
  const m=new Map([['auth',JSON.stringify({user:{id}})],['favorite','kept']]); const storage={getItem:k=>m.get(k),removeItem:k=>m.delete(k)};
  assert.equal(clearWithdrawnSession(storage,'auth',other),false);assert.equal(m.size,2);
  assert.equal(clearWithdrawnSession(storage,'auth',id),true);assert.equal(m.get('favorite'),'kept');
  m.set('auth',JSON.stringify({user:{id:other}}));
  const c=browserClient();c.auth.getSession=async()=>({data:{session:{user:{id:other}}}});
  await finishAccountWithdrawal(c,storage,'auth',id);assert.deepEqual(c.calls,[]);assert.ok(m.has('auth'));
});
test('withdrawal policy: contact, actual deletion scope and no blanket child ban are consistent',()=>{
  assert.equal(POLICY_VERSION,'v0.2 · 미시행');assert.deepEqual(POLICY_CONTACT,{name:'옆군',email:'sengyb@naver.com'});
  const text=JSON.stringify(policyDocuments);assert.match(text,/탈퇴 완료 즉시 운영 DB/);assert.match(text,/법정대리인/);assert.match(text,/일괄 제한하는 정책을 두지 않는/);
  assert.match(text,/SMTP/);assert.match(text,/별도.*백업/);
});
test('withdrawal boundary: no service key in frontend; pure demo imports no account client',()=>{
  const demo=readFileSync(new URL('../src/pages/WithdrawalReviewPage.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(demo,/supabase|fetch\(|localStorage|sessionStorage|requestAccountWithdrawal/);
  const frontend=readFileSync(new URL('../src/lib/accountWithdrawal.js',import.meta.url),'utf8');assert.doesNotMatch(frontend,/service_role|SERVICE_ROLE|deleteUser/);
});
