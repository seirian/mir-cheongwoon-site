import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('songbook has no duplicate login button, modal or credential form', () => {
  const page = read('src/pages/SongbookV2Page.jsx');
  assert.doesNotMatch(page, /편집 로그인|LoginPanel|loginWithUsername|setModal\('login'\)|type="password"/);
  assert.match(read('src/components/Layout.jsx'), /로그인 \/ 회원가입/);
  assert.match(read('src/pages/AccountPage.jsx'), /loginWithUsername/);
});

test('songbook edit controls remain gated and account controls require a shared session', () => {
  const page = read('src/pages/SongbookV2Page.jsx');
  assert.match(page, /store\.canEdit&&<button[^>]+onClick=\{\(\)=>setEditing\(\{\}\)\}/);
  assert.match(page, /store\.canEdit&&<button[^>]+onClick=\{\(\)=>setEditing\(selected\)\}/);
  assert.match(page, /!demo&&store\.session&&<>/);
  assert.match(page, /store\.canRate\?<StarPicker/);
});
