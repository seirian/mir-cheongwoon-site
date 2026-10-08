import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { policyDocuments, policyBlockers, policySources, policySignupNotice, POLICY_VERSION, POLICY_CONTACT } from '../src/data/policyContent.js';
import { policyDocuments as v02, POLICY_VERSION as oldVersion } from '../src/data/policyContentV02.js';
import { getPageMetadata } from '../src/data/pageMetadata.js';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const section = id => policyDocuments.privacy.sections.find(item => item.id === id);

test('review three declares a narrow account-service basis and reuses the approved signup notice', () => {
  assert.equal(POLICY_VERSION, 'v0.3 · 미시행');
  assert.deepEqual(POLICY_CONTACT, { name: '옆군', email: 'sengyb@naver.com' });
  assert.equal(policySignupNotice.paragraphs.length, 4);
  for (const paragraph of policySignupNotice.paragraphs) assert.ok(section('basis').paragraphs.includes(paragraph));
  assert.match(JSON.stringify(section('basis')), /제15조제1항제4호/);
  assert.match(JSON.stringify(section('basis')), /제22조제3항/);
  assert.match(JSON.stringify(section('basis')), /입증책임/);
  assert.deepEqual(section('basis').table.rows.map(row => row[0]), ['아이디', '비밀번호', '이메일 주소']);
  assert.match(policySignupNotice.paragraphs[3], /홍보·마케팅 목적으로 사용하지 않습니다/);
});
test('current account signup has no blanket age or parental-auth prerequisite', () => {
  const children = section('children');
  assert.equal(children.pending, null);
  assert.match(JSON.stringify(children), /모든 회원의 연령 확인이나 보호자 인증 시스템을 일률적인 가입 조건으로 추가하지 않습니다/);
  assert.match(JSON.stringify(children), /나이를 모른다는 이유/);
  assert.match(JSON.stringify(children), /앞으로 별도 동의가 필요한 처리/);
  assert.match(JSON.stringify(children), /제22조의2/);
  assert.match(JSON.stringify(policyBlockers), /현재 가입에 연령 확인·보호자 인증 구축을 필수사항으로 요구하지 않습니다/);
  const page = read('../src/pages/PolicyPage.jsx');
  assert.match(page, /policySignupNotice\.paragraphs\.map/);
  assert.doesNotMatch(page, /type="(?:date|password|email)"|onSubmit=|fetch\(|localStorage|sessionStorage/);
  assert.equal((page.match(/type="checkbox"/g) || []).length, 1);
  assert.match(page, /이용약관 동의 위치 예시/);
});
test('review three keeps withdrawal and unresolved provider/log facts unchanged from review two', () => {
  assert.equal(oldVersion, 'v0.2 · 미시행');
  for (const id of ['retention', 'processors', 'overseas']) {
    assert.deepEqual(section(id), v02.privacy.sections.find(item => item.id === id));
  }
  assert.match(JSON.stringify(section('collection')), /IP|브라우저/);
  assert.doesNotMatch(JSON.stringify(policyDocuments), /[12]차 검토안|v0\.[12]/);
  assert.equal(new Set(policySources.map(item => item.url)).size, policySources.length);
});
test('review-three label is consistent across footer, banner, metadata and the withdrawal demo', () => {
  assert.match(read('../src/components/Layout.jsx'), /이용자 안내 3차 검토안/);
  assert.match(read('../src/components/PolicyFooter.jsx'), /3차 검토안/);
  assert.match(read('../src/pages/WithdrawalReviewPage.jsx'), /REVIEW 03/);
  assert.match(getPageMetadata('/policies/review', { preview: true }).title, /3차 검토실/);
  assert.match(read('../src/pages/PolicyPage.jsx'), /이용자 안내 3차 검토실/);
});
