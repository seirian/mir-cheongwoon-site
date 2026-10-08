import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('policy review separates personal-data status from the social-club exemption', () => {
  const scope = read('../src/components/PolicyLegalScope.jsx');
  assert.match(scope, /제58조제3항/);
  assert.match(scope, /제30조의3/);
  assert.match(scope, /인터넷 커뮤니티/);
  assert.match(scope, /추가 확인/);
  assert.match(read('../src/pages/PolicyPage.jsx'), /<PolicyLegalScope\/>/);
});
test('policy preview never mounts the unrelated hero login or storage listing UI', () => {
  assert.match(read('../src/pages/HomePage.jsx'), /IS_POLICY_PREVIEW \? <PolicyPreviewHero\/> : <HomeHeroImage\/>/);
  const hero = read('../src/components/PolicyPreviewHero.jsx');
  assert.doesNotMatch(hero, /createClient|\.auth\.|<form|<dialog|\.list\(|upload\(/);
  assert.match(hero, /storage\/v1\/object\/public/);
});
test('unrecognized and prototype policy routes cannot crash the document renderer', () => {
  assert.match(read('../src/pages/PolicyPage.jsx'), /Object\.hasOwn\(policyDocuments, document\)/);
});
