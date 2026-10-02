import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('songbook direct URLs and refresh are included in production routing and deployment smoke',()=>{
  const source=readFileSync('scripts/mir_shared_root_deploy_ci.py','utf8');
  assert.ok(source.includes('^(mir|band|history|schedule|gallery|account|admin|songbook)/?$'));
  assert.ok(source.includes('RewriteRule ^songbook/review/?$ /songbook [R=302,L,NE]'));
  assert.ok(source.includes('for route in ["index.html", "songbook/index.html", "api/health.php"]:'));
  assert.ok(source.includes('"/songbook", "/songbook/"]'));
});
