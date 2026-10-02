import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
test('production deploy includes all songbook PHP endpoints and checks them before activation',()=>{
  const source=readFileSync('scripts/mir_shared_root_deploy_ci.py','utf8');
  for(const path of ['api/songbook-search.php','api/_songbook_localization.php','api/_songbook_korean_titles.php']){
    assert.ok(source.includes('"'+path+'"'),path);
    assert.ok(existsSync('server/'+path),path);
  }
  assert.ok(source.includes('base.API_FILES.append(endpoint)'));
  const check=source.indexOf('report["songbook_api_check"] = songbook_api_smoke(rid)');
  assert.ok(check>0 && check<source.indexOf('report["phase"] = "activating"'));
});
