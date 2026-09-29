import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePasswordChange } from '../src/lib/passwordPolicy.js';
import { requestPasswordChange, passwordChangeMessage } from '../src/lib/passwordChange.js';

// Native Auth methods are simulated; no production account or network is used.
const fields = { currentPassword: ' old synthetic password ', newPassword: ' new synthetic password ', confirmPassword: ' new synthetic password ' };
function fixture(options = {}) {
  const calls = []; let stored = fields.currentPassword; let reads = 0;
  const user = { id: 'synthetic-user', email: 'synthetic@example.invalid', ...options.user };
  const main = { auth: { getUser: async () => {
    calls.push('main:getUser'); reads++;
    return options.expired || (options.switched && reads > 1) ? { data: { user: null }, error: { status:401 } } : { data: { user } };
  } } };
  const verifier = { auth: {
    signInWithPassword: async (data) => {
      calls.push('reauth:signIn');
      assert.equal(data.email,user.email); assert.equal(data.password,options.expectedCurrent || fields.currentPassword);
      if (options.loginError) return { error: options.loginError };
      return { data: { user: { ...user, id: options.wrongUser ? 'other' : user.id }, session: { access_token: 'memory-only-synthetic-token' } } };
    },
    updateUser: async (data) => {
      calls.push('reauth:updateUser');
      assert.deepEqual(data,{password:fields.newPassword,current_password:fields.currentPassword});
      if (options.updateThrows) throw new Error('synthetic network failure');
      if (options.updateError) return { error: options.updateError };
      stored=data.password;
      return { data: { user } };
    },
    signOut: async ({scope}) => { calls.push('reauth:logout:'+scope); if(options.cleanupError)throw new Error('synthetic cleanup failure'); },
    stopAutoRefresh: () => { calls.push('reauth:stop'); },
  } };
  return { main, factory:()=>verifier, calls, stored:()=>stored };
}
async function run(f, values=fields) { return requestPasswordChange(f.main,values,'synthetic-user',f.factory); }
test('password: reauthenticate first, verify same user again, update only temporary session',async()=>{
  const f=fixture(); assert.deepEqual(await run(f),{ok:true}); assert.equal(f.stored(),fields.newPassword);
  assert.deepEqual(f.calls,['main:getUser','reauth:signIn','main:getUser','reauth:updateUser','reauth:logout:global','reauth:stop']);
});
for(const [name,patch,code] of [
  ['empty existing',{currentPassword:''},'current_password_required'],
  ['mismatch',{confirmPassword:'different'},'password_mismatch'],
  ['empty confirmation',{confirmPassword:''},'password_mismatch'],
  ['short new',{newPassword:'short',confirmPassword:'short'},'weak_password'],
  ['long new',{newPassword:'x'.repeat(129)},'weak_password'],
  ['same password',{newPassword:fields.currentPassword,confirmPassword:fields.currentPassword},'same_password'],
]) test('password: reject '+name+' before any request',async()=>{
  const f=fixture(); assert.equal((await run(f,{...fields,...patch})).error,code); assert.equal(f.calls.length,0); assert.equal(f.stored(),fields.currentPassword);
});
test('password: spaces are not silently trimmed or coerced',()=>{
  assert.equal(validatePasswordChange(fields),null);
  assert.equal(validatePasswordChange({...fields,confirmPassword:fields.newPassword.trim()}).code,'password_mismatch');
  assert.equal(validatePasswordChange({...fields,currentPassword:12345678}).code,'current_password_required');
  assert.equal(validatePasswordChange(null).code,'invalid_request');
});
test('password: wrong existing password never reaches update or changes main session',async()=>{
  const f=fixture({loginError:{status:400,code:'invalid_credentials'}});
  assert.equal((await run(f)).error,'current_password_mismatch'); assert.ok(!f.calls.includes('reauth:updateUser')); assert.equal(f.stored(),fields.currentPassword);
  assert.ok(f.calls.includes('reauth:logout:local'));
});
test('password: expired main session blocks reauthentication',async()=>{
  const f=fixture({expired:true});assert.equal((await run(f)).error,'authentication_required');assert.deepEqual(f.calls,['main:getUser']);
});
test('password: anonymous and MFA accounts cannot bypass auth requirements',async()=>{
  for(const user of [{is_anonymous:true},{email:''},{factors:[{status:'verified'}]}]) {
    const f=fixture({user}); assert.ok((await run(f)).error); assert.deepEqual(f.calls,['main:getUser']);
  }
});
test('password: provider reauthentication must resolve to same verified account',async()=>{
  const f=fixture({wrongUser:true}); assert.equal((await run(f)).error,'authentication_required');assert.ok(!f.calls.includes('reauth:updateUser'));
});
test('password: account switch during reauth cancels password mutation',async()=>{
  const f=fixture({switched:true});assert.equal((await run(f)).error,'authentication_required');assert.ok(!f.calls.includes('reauth:updateUser'));
});
test('password: policy rejection, rate limit and auth outage are handled without update',async()=>{
  for(const [options,code] of [[{loginError:{status:429}},'rate_limited'],[{loginError:{status:503}},'auth_unavailable'],[{updateError:{status:422,code:'weak_password'}},'weak_password'],[{updateError:{status:403}},'authentication_required']]) {
    const f=fixture(options);assert.equal((await run(f)).error,code);assert.equal(f.stored(),fields.currentPassword);
  }
});
test('password: a lost mutation response is not retried automatically',async()=>{
  const f=fixture({updateThrows:true});assert.equal((await run(f)).error,'change_unconfirmed');assert.equal(f.calls.filter(v=>v==='reauth:updateUser').length,1);
});
test('password: cleanup failure does not report successful mutation as failed',async()=>{
  const f=fixture({cleanupError:true});assert.deepEqual(await run(f),{ok:true});assert.equal(f.stored(),fields.newPassword);
});
test('password: missing verification client never mutates the account',async()=>{
  const f=fixture();f.factory=()=>null;assert.equal((await run(f)).error,'auth_unavailable');assert.equal(f.stored(),fields.currentPassword);
});
test('password: raw upstream message never shown to user',()=>{
  assert.ok(!passwordChangeMessage('untrusted raw error with secret').includes('secret'));
});
