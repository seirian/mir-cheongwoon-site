import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('production search stays in document flow instead of following scroll on any layout or viewport',()=>{
  const css=readFileSync('src/songbook-usability.css','utf8');
  const rules=[...css.matchAll(/\.ck-production\s+\.ck-search-sticky\s*\{([^}]+)\}/g)];
  assert.equal(rules.length,1,'Use one viewport-independent production rule');
  const rule=rules[0][1];
  assert.match(rule,/(?:^|;)\s*position\s*:\s*static\s*(?:;|$)/);
  assert.match(rule,/(?:^|;)\s*top\s*:\s*auto\s*(?:;|$)/);
  assert.match(rule,/(?:^|;)\s*z-index\s*:\s*auto\s*(?:;|$)/);
  const page=readFileSync('src/pages/SongbookUsabilityPage.jsx','utf8');
  assert(page.includes('id="songbook-search" role="search"'));
  assert(page.includes('placeholder="곡명, 가수, 초성으로 찾아보세요"'));
});
