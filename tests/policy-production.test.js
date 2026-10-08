import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishedPolicies, accountNotice, POLICY_OPERATOR } from '../src/data/policyPublished.js';
import { getPageMetadata } from '../src/data/pageMetadata.js';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('published policies implement approved contact, deletion and inquiry retention without claiming unknown provider facts', () => {
  assert.deepEqual(POLICY_OPERATOR, { name: '옆군', email: 'sengyb@naver.com' });
  const text=JSON.stringify(publishedPolicies);
  assert.match(text,/추가 처리 필요가 없어지면 지체 없이 삭제/);
  assert.match(text,/자료·권한 인계/);
  assert.match(text,/탈퇴 완료 즉시 운영 DB/);
  assert.match(text,/확인 중/);
  assert.doesNotMatch(text,/미시행|검토안/);
  assert.equal(accountNotice.length,4);
  for(const [name,doc] of Object.entries(publishedPolicies)) {
    assert.ok(doc.sections.length>=6);
    assert.equal(new Set(doc.sections.map(s=>s.id)).size,doc.sections.length);
    assert.doesNotMatch(getPageMetadata('/policies/'+name).title,/검토/);
    assert.match(getPageMetadata('/policies/'+name,{preview:true}).title,/검토/);
  }
});
test('production route and footer are active, but review and real account paths remain distinct', () => {
  assert.match(read('src/App.jsx'),/IS_POLICY_PREVIEW \? <PolicyPage \/> : <PublishedPolicyPage \/>/);
  assert.match(read('src/components/Layout.jsx'),/!IS_REVIEW_PREVIEW && <PublishedPolicyFooter/);
  assert.match(read('scripts/mir_policy_deploy_ci.py'),/engine\.canonical_smoke = policy_smoke/);
  assert.match(read('scripts/mir_policy_deploy_ci.py'),/policies\/\(privacy\|terms\|operation\)/);
  assert.match(read('.github/workflows/deploy-yeop.yml'),/mir_policy_deploy_ci.py/);
});
test('signup notice separates terms agreement and personal-data notice without collecting age', () => {
  const account=read('src/pages/AccountPage.jsx'),notice=read('src/components/SignupPolicyNotice.jsx');
  assert.match(account,/if \(!termsAccepted\)/);
  assert.match(account,/terms_version: PUBLISHED_POLICY_VERSION/);
  assert.match(account,/<SignupPolicyNotice/);
  assert.match(notice,/name="termsAccepted"/);
  assert.doesNotMatch(notice,/type="date"|name="age"|name="birthdate"/);
  assert.match(account,/기존 회원의 약관 동의를 자동으로 간주하지 않습니다/);
});
