import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('production songbook and dialogs use the site-loaded Korean webfont, not an assumed local CJK font',()=>{
 const styles=readFileSync('src/styles.css','utf8'),usage=readFileSync('src/songbook-usability.css','utf8');
 assert.match(styles,/fonts\.googleapis\.com[^\n]+Noto\+Sans\+KR/);
 assert.match(usage,/\.ck-production,\.ck-dialog\{font-family:'Noto Sans KR',/);
 const workflow=readFileSync('.github/workflows/songbook-live-verify.yml','utf8'),script=readFileSync('scripts/songbook-font-live-check.py','utf8');
 assert.match(workflow,/python scripts\/songbook-font-live-check\.py/);
 assert.match(script,/document\.fonts\.load/);assert.match(script,/info\['faces'\]/);assert.match(script,/route\.abort\(\)/);
 assert.doesNotMatch(workflow,/apt-get.*fonts/);
});
