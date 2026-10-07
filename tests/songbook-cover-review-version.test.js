import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('cover review title, banner, release marker and Actions summary identify round two',()=>{
 for(const path of ['songbook-cover.html','src/songbook-cover/main.jsx']){const text=readFileSync(path,'utf8');assert(text.includes('2차 검토'));assert(!text.includes('1차 검토'));}
 assert(readFileSync('scripts/build-songbook-cover.mjs','utf8').includes('reviewVersion:2'));
 assert(readFileSync('scripts/stage-songbook-cover.py','utf8').includes('Songbook list/cover review 2'));
});
