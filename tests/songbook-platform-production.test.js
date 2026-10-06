import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateEntry,publicSong,duplicateOf,mergeSongs} from '../src/lib/songbookV2.js';
const read=p=>readFileSync(p,'utf8');
const unknown={id:'custom-11111111-2222-4333-8444-555555555551',title:'미확인 가수 곡',artist:'',categories:['가요'],aliases:[],videoUrls:['https://youtu.be/abcdefghijk?t=62'],difficulty:4,requestStatus:'unreviewed'};
test('production editor enables reviewed search and optional artist while historical preview stays isolated',()=>{
 const page=read('src/pages/SongbookV2Page.jsx');
 assert.match(page,/platformSearch=\{!IS_REVIEW_PREVIEW\} allowUnknownArtist=\{!IS_REVIEW_PREVIEW\}/);
 assert.match(read('src/lib/songbookStore.js'),/validateEntry\(\{ \.\.\.input[\s\S]*allowUnknownArtist: !IS_REVIEW_PREVIEW/);
 assert.doesNotMatch(read('src/components/songbook/SongEditor.jsx'),/검토 내용은 이 브라우저에만 저장됩니다/);
});
test('empty artist survives actual payload normalization and manual overlay without fabricated proficiency',()=>{
 const stored=validateEntry(unknown,{allowUnknownArtist:true});
 const [restored]=mergeSongs([], [stored]);
 assert.equal(restored.artist,'');assert.equal(restored.difficulty,4);assert.equal(restored.proficiency,null);
 assert.equal(restored.videoUrls[0],'https://www.youtube.com/watch?v=abcdefghijk&t=62');
 assert.deepEqual(validateEntry(publicSong(stored),{allowUnknownArtist:true}),stored);
 assert.throws(()=>validateEntry(unknown));
});
test('unknown artists retain duplicate identity protection without merging known different artists',()=>{
 assert.ok(duplicateOf([unknown],{...unknown,id:'new'}));
 assert.equal(duplicateOf([unknown],{...unknown,id:'new',artist:'다른 가수'}),undefined);
 assert.equal(duplicateOf([unknown],{...unknown}),undefined);
});
test('production rollout prepares private runtime before activation; key is deploy-step-only',()=>{
 const script=read('scripts/mir_shared_root_deploy_ci.py');
 assert.ok(script.indexOf('runtime.run(production=True)')<script.indexOf('report["phase"] = "activating"'));
 assert.ok(script.indexOf('runtime.run(production=True)')>script.indexOf('if os.environ.get("ACTIVATE", "") != "true":'));
 const workflow=read('.github/workflows/deploy-yeop.yml');
 assert.equal((workflow.match(/secrets.SONGBOOK_YOUTUBE_API_KEY/g)||[]).length,1);
 const [before,after]=workflow.split('- name: Deploy, verify and activate');
 assert.ok(!before.includes('secrets.SONGBOOK_YOUTUBE_API_KEY'));
 assert.ok(after.includes('secrets.SONGBOOK_YOUTUBE_API_KEY'));
 for(const flag of ['VITE_REVIEW_PREVIEW','VITE_SONGBOOK_PREVIEW','VITE_SONGBOOK_PLATFORM_PREVIEW'])assert.ok(workflow.includes(`${flag}: 'false'`));
});
test('migration changes only artist length and leaves RLS and other constraints in place',()=>{
 const sql=read('supabase/ops/songbook_optional_artist.sql');
 assert.match(sql,/between 0 and 200/);
 assert.doesNotMatch(sql,/disable row|drop not null|create policy|grant |revoke |update public|delete from/i);
 assert.ok(read('src/pages/SongbookV2Page.jsx').includes("s.artist||'가수 미확인'"));
});
