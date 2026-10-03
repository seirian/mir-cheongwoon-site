import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeSongs, selectSongs, validateEntry } from '../src/lib/songbookV2.js';
const json = file => JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const report = json('docs/reviews/songbook-difficulty-audit.json');
const raw = json('src/data/songbookData.json').songs;
const scores = json('src/data/songbookDifficulty.json');
const catalog = json('src/data/songbookCatalog.json');

test('difficulty audit accounts for every originally-unset song without replacing the original 49 scores', () => {
  assert.equal(raw.length, 342);
  assert.equal(Object.keys(report.preserved_ratings).length, 49);
  assert.equal(report.records.length, 293);
  assert.equal(new Set(report.records.map(r => r.id)).size, 293);
  assert.deepEqual(new Set(report.records.map(r => r.id)), new Set(raw.filter(s => !(s.id in report.preserved_ratings)).map(s => s.id)));
  for (const [id, value] of Object.entries(report.preserved_ratings)) assert.equal(scores[id], value);
  assert.equal(report.records.filter(r => r.difficulty !== null).length, 90);
  assert.equal(report.records.filter(r => r.difficulty === null).length, 203);
  assert.equal(Object.keys(scores).length, 139);
});

test('new difficulties have same-song evidence, one vote per non-default-dominated catalog, and reproducible aggregation', () => {
  const excluded = new Set(report.excluded_default_dominated_catalogs);
  for (const row of report.records) {
    if (row.difficulty === null) { assert.equal(scores[row.id], undefined); continue; }
    assert.equal(row.status, 'matched_reference');
    assert.ok(Number.isInteger(row.difficulty) && row.difficulty >= 1 && row.difficulty <= 5);
    assert.equal(scores[row.id], row.difficulty);
    assert.ok(row.references.length > 0);
    const voters = new Map();
    for (const ref of row.references) {
      assert.ok(!excluded.has(ref.catalog));
      assert.ok(ref.title && ref.artist && /^https:\/\//.test(ref.url));
      if (voters.has(ref.catalog)) assert.equal(voters.get(ref.catalog), ref.difficulty);
      voters.set(ref.catalog, ref.difficulty);
    }
    const votes = [...voters.values()].sort((a,b) => a-b);
    assert.deepEqual(votes, row.votes);
    const range = votes.at(-1) - votes[0];
    if (range <= 2) {
      const middle = Math.floor(votes.length/2);
      const median = votes.length%2 ? votes[middle] : (votes[middle-1]+votes[middle])/2;
      assert.equal(row.difficulty, Math.floor(median+.5));
      assert.ok(!(votes.length === 1 && votes[0] === 1));
    } else {
      assert.ok(votes.length >= 3);
      assert.ok(votes.filter(v => v === row.difficulty).length/votes.length >= 2/3);
    }
  }
});

test('published catalog reflects 139 reference ratings while retaining all 203 unknowns and no fabricated proficiency', () => {
  assert.equal(catalog.length, 342);
  for (const song of catalog) {
    assert.equal(song.difficulty, scores[song.id] ?? null);
    assert.equal(song.proficiency, null);
    for (const key of ['references','votes','catalog','status','reference_sha256']) assert.ok(!(key in song));
  }
  assert.equal(selectSongs(catalog, new URLSearchParams('difficulty=unset')).length, 203);
  assert.equal([1,2,3,4,5].reduce((n,r) => n+selectSongs(catalog,new URLSearchParams('difficulty='+r)).length,0),139);
});

test('a saved administrator evaluation remains authoritative over the new static reference score', () => {
  const row = report.records.find(r => r.difficulty !== null);
  const song = catalog.find(s => s.id === row.id);
  const merged = mergeSongs(catalog,[{...validateEntry(song), difficulty: 1}], [{song_id:song.id,proficiency:4}]);
  assert.equal(merged.find(s => s.id === song.id).difficulty,1);
  assert.equal(merged.find(s => s.id === song.id).proficiency,4);
});
