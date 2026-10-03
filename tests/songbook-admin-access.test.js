import test from 'node:test';
import assert from 'node:assert/strict';
import { songbookEditAccess } from '../src/lib/songbookAccess.js';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('songbook production editing and proficiency use existing site admin only', () => {
  assert.deepEqual(songbookEditAccess({ ready: true, admin: true }), { canEdit: true, canRate: true });
  for (const role of [null, 'manager', 'owner']) for (const demo of [false, true]) {
    assert.deepEqual(songbookEditAccess({ ready: true, role, demo }), { canEdit: false, canRate: false });
  }
  for (const admin of [false, 'true', 1]) assert.equal(songbookEditAccess({ ready: true, admin }).canEdit, false);
  assert.equal(songbookEditAccess({ ready: false, admin: true }).canEdit, false);
});
test('review isolation and historical demo access are not production shortcuts', () => {
  assert.equal(songbookEditAccess({ ready: true, admin: true, reviewPreview: true }).canEdit, false);
  assert.equal(songbookEditAccess({ ready: true, demo: true, reviewPreview: true, songbookPreview: true }).canRate, true);
  assert.equal(songbookEditAccess({ ready: true, admin: true, reviewPreview: true, songbookPreview: true }).canRate, false);
});
test('production store does not depend on separate editor membership or ownership assignment', () => {
  const store = read('src/lib/songbookStore.js');
  assert.match(store, /songbookEditAccess/);
  assert.match(store, /IS_SONGBOOK_PREVIEW \? songbookClient\.from\(tables\.editors\)/);
  assert.doesNotMatch(store, /setOwner|role: 'owner'/);
  const policy = read('supabase/ops/songbook_admin_access.sql');
  assert.equal((policy.match(/ALTER POLICY/g) || []).length, 4);
  assert.doesNotMatch(policy, /songbook_editors|user_metadata|SECURITY DEFINER/);
  assert.equal((policy.match(/FROM public\.admins/g) || []).length, 6);
});
