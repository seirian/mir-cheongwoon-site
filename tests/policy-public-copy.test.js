import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishedPolicies, POLICY_OPERATOR, accountNotice } from '../src/data/policyPublished.js';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('published policies do not render internal review note callouts', () => {
  const page = read('src/pages/PublishedPolicyPage.jsx');
  assert.doesNotMatch(page, /s\.note|policy-pending|추가 확인 안내|전체 이전 요건 충족을 보증/);
  assert.match(page, /s\.paragraphs\?\.map/);
  assert.match(page, /s\.table\.rows\.map/);
});

test('public deletion scope remains truthful without the internal-review box', () => {
  const page = read('src/pages/PublishedPolicyPage.jsx');
  assert.match(page, /s\.id === 'retention'/);
  assert.match(page, /policy-deletion-scope/);
  assert.match(page, /운영 DB의 회원 계정정보/);
  assert.match(page, /동시에 모든 사본이 삭제되는 것은 아닙니다/);
  assert.match(page, /실제 보관기간과 삭제 주기는 아직 확인되지 않았습니다/);
  const privacy = publishedPolicies.privacy.sections;
  assert.doesNotMatch(JSON.stringify(privacy.find(s => s.id === 'processors').table), /확인 중/);
  assert.match(JSON.stringify(privacy.find(s => s.id === 'overseas').table), /Supabase.*인도/);
});

test('approved operator choices and the read-only live regression are preserved', () => {
  assert.deepEqual(POLICY_OPERATOR, { name: '옆군', email: 'sengyb@naver.com' });
  assert.equal(accountNotice.length, 4);
  const text = JSON.stringify(publishedPolicies);
  assert.match(text, /추가 처리 필요가 없어지면 지체 없이 삭제/);
  assert.match(text, /관리자 계정은 자료·권한 인계/);
  assert.match(text, /생년월일/);
  const check = read('scripts/policy-production-check.py');
  assert.match(check, /internal_review_notes_absent/);
  assert.match(check, /policy-deletion-scope/);
});
