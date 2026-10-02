import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSong,validateEntry} from '../src/lib/songbookV2.js';
test('editor snapshot roundtrip preserves video links, categories and request status',()=>{
 const input={id:'custom-11111111-1111-4111-8111-111111111111',title:'New song',artist:'MIR',categories:['가요','팝송'],aliases:['별칭'],videoUrls:['https://youtu.be/abcdefghijk'],difficulty:2,requestStatus:'available'};
 const saved=validateEntry(input);
 const restored=validateEntry(publicSong(JSON.parse(JSON.stringify(saved))));
 assert.deepEqual(restored,saved);
});
