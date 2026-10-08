import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('published policy headers omit introductory copy without an empty lead placeholder', () => {
  const page = read('src/pages/PublishedPolicyPage.jsx');
  assert.doesNotMatch(page, /doc\.lead|className="policy-lead"/);
  assert.match(page, /<h1>\{doc\.title\}<\/h1><div className="policy-meta">/);
  assert.match(page, /PUBLISHED_POLICY_VERSION/);
  assert.match(page, /POLICY_EFFECTIVE_DATE/);
  assert.match(page, /s\.paragraphs\?\.map/);
  assert.match(page, /s\.table\.rows\.map/);
});

test('production browser checks all three removed sentences after direct load, reload and footer navigation', () => {
  const check = read('scripts/policy-production-check.py');
  for (const lead of [
    '필요한 정보만 받고, 사용 목적과 삭제 방법을 알려드립니다.',
    '무료 비공식 팬 아카이브를 함께 이용하는 기준입니다.',
    '좋아하는 마음으로 기록하고, 오류와 권리침해에 대응합니다.',
  ]) assert.ok(check.includes(lead));
  assert.match(check, /all\(lead not in text for lead in REMOVED_POLICY_LEADS\)/);
  assert.equal((check.match(/assert_policy_heading\(page, title\)/g) || []).length, 4);
  assert.match(check, /introductory_leads_absent/);
});
