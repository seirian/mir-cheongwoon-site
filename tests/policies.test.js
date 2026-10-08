import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { policyDocuments, policyBlockers, policySources } from '../src/data/policyContent.js';
import { getPageMetadata, metadataRoutes } from '../src/data/pageMetadata.js';

test('review policies have complete unique sections and explicit unresolved facts', () => {
  assert.equal(Object.keys(policyDocuments).length, 3);
  for (const document of Object.values(policyDocuments)) {
    assert.ok(document.title && document.summary && document.sections.length >= 6);
    assert.equal(new Set(document.sections.map(section => section.id)).size, document.sections.length);
    assert.ok(document.sections.some(section => section.pending));
    for (const section of document.sections) assert.ok(section.paragraphs?.length || section.table);
  }
  assert.equal(policyBlockers.length, 5);
  assert.ok(policySources.every(source => new URL(source.url).protocol === 'https:'));
});
test('draft routes have direct static documents and stay noindex', () => {
  for (const key of ['review', 'privacy', 'terms', 'operation']) {
    const route = `/policies/${key}`;
    assert.ok(metadataRoutes.includes(route));
    for (const preview of [false, true]) {
      const meta = getPageMetadata(route, { preview, assetBase: '/_yeop_releases/r20261008000000_12345678/' });
      assert.equal(meta.robots, 'noindex, nofollow');
      assert.ok(meta.title.includes('검토'));
    }
  }
});
test('review UI cannot collect account data and production remains gated', () => {
  const page = readFileSync(new URL('../src/pages/PolicyPage.jsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /supabase|fetch\(|localStorage|sessionStorage|type="password"|type="email"|onSubmit=/);
  assert.match(page, /type="checkbox" disabled/);
  assert.match(page, /policy-demo-submit" disabled/);
  assert.match(app, /IS_POLICY_PREVIEW \? <PolicyPage/);
  assert.match(app, /IS_POLICY_PREVIEW \? <Navigate to="\/policies\/review#signup"/);
});
