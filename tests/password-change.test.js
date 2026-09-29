import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordHandler } from '../supabase/functions/member-password/handler.mjs';
import { validatePasswordChange } from '../supabase/functions/_shared/password-policy.mjs';
import { requestPasswordChange, passwordChangeMessage } from '../src/lib/passwordChange.js';

// Synthetic credentials only; no network or production users are involved.
const fields = { currentPassword: ' old synthetic password ', newPassword: ' new synthetic password ', confirmPassword: ' new synthetic password ' };
const originalToken = 'synthetic-original-session';
const freshToken = 'synthetic-fresh-session';
function fixture(options = {}) {
  const calls = []; let stored = fields.currentPassword;
  const user = { id: 'synthetic-user', email: 'synthetic@example.invalid', ...options.user };
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname.replace('/auth/v1', '') + new URL(url).search;
    const payload = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: init.method, token: init.headers.Authorization, payload });
    if (options.onCall) await options.onCall(path, init);
    if (path === '/user' && init.method === 'GET') return Response.json(user, { status: options.identityStatus || 200 });
    if (path.startsWith('/token')) {
      if (options.loginStatus) return Response.json({ error_code: 'test_error' }, { status: options.loginStatus });
      if (payload.email !== user.email || payload.password !== stored) return Response.json({ error_code: 'invalid_credentials' }, { status: 400 });
      return Response.json({ access_token: freshToken, user: { ...user, id: options.wrongUser ? 'other-user' : user.id } });
    }
    if (path === '/user' && init.method === 'PUT') {
      assert.equal(init.headers.Authorization, `Bearer ${freshToken}`);
      assert.equal(payload.current_password, stored);
      assert.deepEqual(Object.keys(payload).sort(), ['current_password', 'password']);
      if (options.updateThrows) throw new Error('synthetic network error');
      if (options.updateStatus) return Response.json({ code: options.updateCode }, { status: options.updateStatus });
      stored = payload.password;
      return Response.json(user);
    }
    if (path.startsWith('/logout')) {
      if (options.cleanupThrows) throw new Error('synthetic cleanup error');
      return new Response(null, { status: 204 });
    }
    throw new Error('Unexpected synthetic endpoint');
  };
  const handler = createPasswordHandler({ url: 'https://auth.example.invalid', anonKey: 'synthetic-public-key', fetchImpl, now: options.now || (() => 1000) });
  const request = (body = fields, extra = {}) => new Request('https://edge.example.invalid/member-password', {
    method: 'POST', headers: { authorization: `Bearer ${originalToken}`, 'content-type': 'application/json', origin: 'https://mir.yeop.net', ...extra.headers },
    body: JSON.stringify(body), ...extra,
  });
  return { handler, calls, request, stored: () => stored };
}
const writes = (f) => f.calls.filter((c) => c.method === 'PUT');

test('password: correct existing + matching new changes only the authenticated user', async () => {
  const f = fixture(); const response = await f.handler(f.request());
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  assert.equal(f.stored(), fields.newPassword); assert.equal(writes(f).length, 1);
  assert.equal(f.calls[0].token, `Bearer ${originalToken}`);
  assert.equal(f.calls.at(-1).path, '/logout?scope=global');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
for (const [name, patch, code] of [
  ['existing required', { currentPassword: '' }, 'current_password_required'],
  ['confirmation differs', { confirmPassword: 'not equal' }, 'password_mismatch'],
  ['confirmation missing', { confirmPassword: '' }, 'password_mismatch'],
  ['weak new', { newPassword: 'short', confirmPassword: 'short' }, 'weak_password'],
  ['oversized new', { newPassword: 'x'.repeat(129) }, 'weak_password'],
  ['same password', { newPassword: fields.currentPassword, confirmPassword: fields.currentPassword }, 'same_password'],
  ['wrong existing', { currentPassword: 'wrong synthetic password' }, 'current_password_mismatch'],
]) {
  test('password: rejects ' + name + ' without changing credentials', async () => {
    const f = fixture(); const response = await f.handler(f.request({ ...fields, ...patch }));
    assert.equal((await response.json()).error, code); assert.equal(writes(f).length, 0); assert.equal(f.stored(), fields.currentPassword);
  });
}
test('password: preserves whitespace and does not coerce non-string input', () => {
  assert.equal(validatePasswordChange(fields), null);
  assert.equal(validatePasswordChange({ ...fields, confirmPassword: fields.newPassword.trim() }).code, 'password_mismatch');
  assert.equal(validatePasswordChange({ ...fields, currentPassword: 123456789 }).code, 'current_password_required');
  assert.equal(validatePasswordChange(null).code, 'invalid_request');
});
test('password: rejects body-supplied target user/email', async () => {
  for (const key of ['email', 'user_id']) {
    const f = fixture(); const response = await f.handler(f.request({ ...fields, [key]: 'other-user' }));
    assert.equal(response.status, 400); assert.equal(f.calls.length, 0);
  }
});
test('password: missing and expired bearer cannot reach password verification', async () => {
  const f = fixture(); const req = f.request(); req.headers.delete('authorization');
  assert.equal((await f.handler(req)).status, 401); assert.equal(f.calls.length, 0);
  const expired = fixture({ identityStatus: 401 });
  assert.equal((await expired.handler(expired.request())).status, 401); assert.equal(expired.calls.length, 1);
});
test('password: anonymous and MFA users cannot bypass their authentication requirement', async () => {
  for (const user of [{ is_anonymous: true }, { email: '' }, { factors: [{ status: 'verified' }] }]) {
    const f = fixture({ user }); const res = await f.handler(f.request());
    assert.ok([401,403].includes(res.status)); assert.equal(f.calls.length, 1);
  }
});
test('password: reauthenticated identity must match original verified user', async () => {
  const f = fixture({ wrongUser: true }); const response = await f.handler(f.request());
  assert.equal(response.status, 401); assert.equal(writes(f).length, 0); assert.equal(f.calls.at(-1).path, '/logout?scope=local');
});
test('password: backend policy errors and rate limits are safe and do not change password', async () => {
  for (const options of [{ loginStatus: 429 }, { loginStatus: 503 }, { updateStatus: 422, updateCode: 'weak_password' }, { updateStatus: 403 }]) {
    const f = fixture(options); const response = await f.handler(f.request());
    assert.ok(response.status >= 400); assert.equal(f.stored(), fields.currentPassword);
    const text = await response.text(); assert.ok(!text.includes(fields.currentPassword)); assert.ok(!text.includes(freshToken));
  }
});
test('password: timed-out mutation is never automatically retried', async () => {
  const f = fixture({ updateThrows: true }); const response = await f.handler(f.request());
  assert.equal((await response.json()).error, 'change_unconfirmed'); assert.equal(writes(f).length, 1);
});
test('password: logout transport failure never reports a committed change as failed', async () => {
  const f = fixture({ cleanupThrows: true }); const response = await f.handler(f.request());
  assert.deepEqual(await response.json(), { ok: true }); assert.equal(f.stored(), fields.newPassword);
});
test('password: simultaneous attempts cannot release another request lock', async () => {
  let release, started;
  const gate = new Promise((resolve) => { release = resolve; });
  const seen = new Promise((resolve) => { started = resolve; });
  const f = fixture({ onCall: async (path) => { if (path.startsWith('/token')) { started(); await gate; } } });
  const first = f.handler(f.request()); await seen;
  for (let i = 0; i < 2; i++) assert.equal((await f.handler(f.request())).status, 429);
  release(); assert.equal((await first).status, 200); assert.equal(writes(f).length, 1);
});
test('password: bounded attempt guard expires and allows later attempts', async () => {
  let now = 1000; const f = fixture({ now: () => now });
  for (let i = 0; i < 5; i++) await f.handler(f.request({ ...fields, currentPassword: 'wrong' }));
  assert.equal((await f.handler(f.request())).status, 429); now += 600001;
  assert.equal((await f.handler(f.request())).status, 200);
});
test('password: origin, method, malformed JSON and oversized body are rejected', async () => {
  const f = fixture();
  const origin = f.request(); origin.headers.set('origin', 'https://evil.example'); assert.equal((await f.handler(origin)).status, 403);
  assert.equal((await f.handler(new Request('https://edge.example'))).status, 405);
  const options = new Request('https://edge.example', { method: 'OPTIONS', headers: { origin: 'https://mir.yeop.net' } });
  assert.equal((await f.handler(options)).status, 204);
  const headers = { authorization: `Bearer ${originalToken}`, 'content-type': 'application/json' };
  assert.equal((await f.handler(new Request('https://edge.example', { method: 'POST', headers, body: '{' }))).status, 400);
  assert.equal((await f.handler(new Request('https://edge.example', { method: 'POST', headers, body: 'x'.repeat(4097) }))).status, 413);
  assert.equal(f.calls.length, 0);
});
test('password client: account switch or expired session blocks submission', async () => {
  let invoked = false;
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'other' } } }) }, functions: { invoke: async () => { invoked = true; } } };
  assert.equal((await requestPasswordChange(client, fields, 'original')).error, 'authentication_required'); assert.equal(invoked, false);
});
test('password client: reads safe error code, never renders raw upstream error', async () => {
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'same' } } }) }, functions: { invoke: async () => ({ error: { context: Response.json({ error: 'current_password_mismatch', debug: 'secret' }) } }) } };
  const response = await requestPasswordChange(client, fields, 'same');
  assert.equal(response.error, 'current_password_mismatch'); assert.ok(!passwordChangeMessage('secret').includes('secret'));
});
