import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loginWithUsername, songbookTables } from '../src/lib/usernameLogin.js';
import { restrictedFetch } from '../src/lib/songbookV2.js';

function fixture(response = { data: { access_token: 'server-access', refresh_token: 'server-refresh' } }) {
  const calls = [];
  const session = { user: { id: 'verified-user' } };
  return { calls, session, client: {
    functions: { invoke: async (...args) => { calls.push(['invoke', ...args]); return response; } },
    auth: { setSession: async tokens => { calls.push(['session', tokens]); return { data: { session }, error: null }; } },
  } };
}
test('ID login reuses member-auth, normalizes username and preserves password exactly', async () => {
  const f = fixture();
  assert.equal(await loginWithUsername(f.client, '  Mir.User_1  ', ' pass word '), f.session);
  assert.deepEqual(f.calls, [
    ['invoke', 'member-auth', { body: { action: 'login', identifier: 'mir.user_1', password: ' pass word ' } }],
    ['session', { access_token: 'server-access', refresh_token: 'server-refresh' }],
  ]);
});
test('invalid ID and password never trigger network or session creation', async () => {
  for (const [id, pw] of [['', 'password'], ['mir', 'password'], ['mir@example.com', 'password'], ['valid.user', ''], ['valid.user', 'x'.repeat(129)], ['admin user', 'password']]) {
    const f = fixture(); await assert.rejects(loginWithUsername(f.client, id, pw)); assert.equal(f.calls.length, 0);
  }
});
test('failed or malformed authentication never installs a session; raw errors are not exposed', async () => {
  for (const response of [{ error: { message: 'private upstream detail' } }, { data: {} }, { data: { access_token: 'x' } }, { data: { access_token: 1, refresh_token: 'y' } }]) {
    const f = fixture(response);
    await assert.rejects(loginWithUsername(f.client, 'valid.user', 'password'), error => !error.message.includes('private upstream'));
    assert.equal(f.calls.filter(c => c[0] === 'session').length, 0);
  }
});
test('network/session failures are handled and never reported as successful login', async () => {
  const f = fixture(); f.client.functions.invoke = async () => { throw Error('private'); };
  await assert.rejects(loginWithUsername(f.client, 'valid.user', 'password'), /로그인 서비스를/);
  const g = fixture(); g.client.auth.setSession = async () => ({ error: Error('private') });
  await assert.rejects(loginWithUsername(g.client, 'valid.user', 'password'), /로그인 세션/);
  await assert.rejects(loginWithUsername(null, 'valid.user', 'password'));
});
test('production and review data use disjoint tables', () => {
  assert.deepEqual(songbookTables(), { entries: 'songbook_entries', ratings: 'songbook_ratings', editors: 'songbook_editors' });
  for (const value of Object.values(songbookTables(true))) assert.match(value, /^songbook_preview_/);
});
test('preview guard allows only the existing username login action, not signup or production writes', async () => {
  const base = 'https://example.supabase.co', calls = [];
  const fetcher = restrictedFetch(base, async (url, init) => { calls.push(url); return new Response('{}'); });
  const request = body => ({ method: 'POST', body: JSON.stringify(body) });
  assert.equal((await fetcher(base + '/functions/v1/member-auth', request({ action: 'login', identifier: 'mir.user', password: 'password' }))).status, 200);
  for (const body of [{ action: 'signup' }, { action: 'username-available', username: 'admin' }, { action: 'login', identifier: 'mir.user', password: 'password', role: 'owner' }]) {
    assert.equal((await fetcher(base + '/functions/v1/member-auth', request(body))).status, 403);
  }
  assert.equal((await fetcher(base + '/rest/v1/songbook_entries', request({}))).status, 403);
  assert.equal((await fetcher(base + '/functions/v1/other', request({}))).status, 403);
  assert.equal(calls.length, 1);
});
test('production shares site auth; review labels and demo remain preview-only', () => {
  const store = readFileSync(new URL('../src/lib/songbookStore.js', import.meta.url), 'utf8');
  assert.match(store, /!IS_REVIEW_PREVIEW \? supabase/);
  const page = readFileSync(new URL('../src/pages/SongbookV2Page.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /signInWithPassword|type="email"/);
  assert.match(page, /loginWithUsername\(store.client,identifier,password\)/);
  assert.match(page, /IS_SONGBOOK_PREVIEW&&params.get\('demo'\)/);
});
