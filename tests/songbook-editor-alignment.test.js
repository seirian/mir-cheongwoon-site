import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const editor=readFileSync('src/components/songbook/SongEditor.jsx','utf8');
const identity=editor.match(/<div className="sb2-form-grid"><label>곡명[\s\S]*?<\/div>/)?.[0];

test('editor title and artist inputs both follow their label without a helper row above',()=>{
  assert(identity,'shared song identity fields exist');
  assert.match(identity,/<label>곡명<input required maxLength=\{200\}/);
  assert.match(identity,/<label>가수·작품<input required=\{!allowUnknownArtist\} maxLength=\{200\}/);
  assert.match(identity,/<input[^>]*value=\{draft\.artist\}[\s\S]*?\/>\{allowUnknownArtist&&<small>선택 · 모르면 공란으로 두세요<\/small>\}<\/label>/);
});

test('alignment preserves controlled inputs and existing responsive grid without spacer hacks',()=>{
  assert(identity.includes('value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}'));
  assert(identity.includes('value={draft.artist} onChange={e=>setDraft({...draft,artist:e.target.value})}'));
  assert(!identity.includes('aria-hidden')&&!identity.includes('style='));
  const css=readFileSync('src/songbook-v2.css','utf8');
  assert(css.includes('.sb2-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}'));
  assert(css.includes('.sb2-form-grid{grid-template-columns:1fr;gap:16px}'));
});
