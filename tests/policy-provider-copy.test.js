import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishedPolicies, POLICY_OPERATOR, POLICY_EFFECTIVE_DATE, PUBLISHED_POLICY_VERSION } from '../src/data/policyPublished.js';
const section = id => publishedPolicies.privacy.sections.find(item => item.id === id);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('provider table keeps all four services and purposes without internal status columns', () => {
  const providers = section('processors');
  assert.deepEqual(providers.table.headers, ['서비스', '업무·정보']);
  assert.deepEqual(providers.table.rows, [
    ['Supabase / Supabase Pte. Ltd.(공식 DPA 기준)', '회원 인증, 계정·프로필·세션 저장, 계정 복구 및 삭제'],
    ['NAVER 메일 / 네이버 주식회사', 'sengyb@naver.com 문의의 송수신·보관'],
    ['웹 호스팅(inour.net 호스트)', '웹사이트·PHP API 제공, 접속·보안 기록 처리'],
    ['가입 인증·복구 메일', 'Supabase Auth를 통한 인증·복구 메일 전송'],
  ]);
  assert.match(providers.paragraphs.join(' '), /NAVER 메일.*인증.*별도로 운영/);
  for (const id of ['processors', 'overseas']) {
    assert.doesNotMatch(JSON.stringify(section(id)), /확인 중|확인 범위|미확인 처리경로|확인 완료|해당 없음/);
    assert.equal(Object.hasOwn(section(id), 'note'), false);
  }
});

test('transfer disclosure labels India as DB storage and preserves other-region scope and contact', () => {
  const transfer = section('overseas');
  const rows = Object.fromEntries(transfer.table.rows);
  assert.equal(rows['이전 국가'], '운영 DB 저장 국가: 인도(뭄바이, ap-south-1)');
  assert.match(transfer.paragraphs.join(' '), /운영 DB 저장 국가 외의 지역/);
  assert.match(transfer.paragraphs.join(' '), /재수탁자와 서비스별 처리 지역/);
  assert.match(rows['이전받는 자·연락처'], /Supabase Pte\. Ltd\..*privacy@supabase\.com/);
  for (const key of ['이전 정보', '목적', '시기·방법', '보유기간', '거부 방법과 영향']) assert.ok(rows[key]);
  assert.match(rows['보유기간'], /별도 감사로그·백업의 처리 범위는 제4절/);
  assert.doesNotMatch(JSON.stringify(transfer), /모든.*인도|인도에서만|국내에서만/);
  const renderer = read('src/pages/PublishedPolicyPage.jsx');
  assert.match(renderer, /s\.id === 'overseas'/);
  for (const path of ['data-processing-addendum', 'subprocessor-list']) {
    assert.ok(renderer.includes(`https://supabase.com/legal/customer-resources/${path}`));
  }
  assert.match(renderer, /policy-provider-sources/);
});

test('editorial cleanup preserves approved identity, publication version and account deletion limits', () => {
  assert.deepEqual(POLICY_OPERATOR, { name: '옆군', email: 'sengyb@naver.com' });
  assert.equal(POLICY_EFFECTIVE_DATE, '2026-10-08');
  assert.equal(PUBLISHED_POLICY_VERSION, '1.0');
  assert.match(section('retention').paragraphs.join(' '), /탈퇴 완료 즉시 운영 DB/);
  const renderer = read('src/pages/PublishedPolicyPage.jsx');
  assert.match(renderer, /동시에 모든 사본이 삭제되는 것은 아닙니다/);
  assert.doesNotMatch(renderer, /doc\.lead|policy-pending|s\.note/);
  const check = read('scripts/policy-production-check.py');
  assert.match(check, /assert_provider_copy/);
  assert.match(check, /provider_status_copy_absent/);
});
