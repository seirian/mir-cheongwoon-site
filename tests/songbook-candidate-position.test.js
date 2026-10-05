import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidatePlaybackPosition as position} from '../src/lib/candidatePlaybackPosition.js';

const base = {seconds:19647,approved_seconds:null,reason:'section_timestamp_only'};

test('per-song collection still prefills h:m:s without asking for a manual timestamp', () => {
  assert.deepEqual(position({seconds:4350,reason:'artist_metadata_required'}), {
    kind:'collected',initialValue:'01:12:30',referencePosition:'',referenceSeconds:null,
  });
});
test('both section-only reasons keep a visible reference, not a confirmed input', () => {
  for (const reason of ['section_timestamp_only','already_listed_section']) {
    assert.deepEqual(position({...base,reason}), {
      kind:'section',initialValue:'',referencePosition:'05:27:27',referenceSeconds:19647,
    });
  }
});
test('a saved human-confirmed position takes priority even for a section candidate', () => {
  for (const reason of ['section_timestamp_only','already_listed_section','artist_conflict']) {
    assert.deepEqual(position({...base,reason,approved_seconds:200}), {
      kind:'confirmed',initialValue:'00:03:20',referencePosition:'',referenceSeconds:null,
    });
  }
});
test('explicit zero remains valid for collected, reference and confirmed positions', () => {
  assert.equal(position({seconds:0}).initialValue,'00:00:00');
  assert.equal(position({...base,seconds:0}).referenceSeconds,0);
  assert.equal(position({...base,seconds:0}).referencePosition,'00:00:00');
  assert.equal(position({...base,approved_seconds:0}).initialValue,'00:00:00');
});
test('missing or invalid values never become a zero timestamp or a reference link', () => {
  for (const seconds of [undefined,null,'100',NaN,Infinity,-1,172801,1.5]) {
    assert.equal(position({seconds}).initialValue,'');
    assert.equal(position({seconds}).kind,'missing');
    assert.equal(position({...base,seconds}).referenceSeconds,null);
    assert.equal(position({...base,seconds}).referencePosition,'');
  }
});
test('an invalid saved position does not fall back to an unconfirmed section offset', () => {
  for (const approved_seconds of ['200',-1,NaN,172801]) {
    const result = position({...base,approved_seconds});
    assert.equal(result.kind,'missing');assert.equal(result.initialValue,'');
    assert.equal(result.referenceSeconds,null);
  }
});
test('48h boundary, unknown reasons and candidate objects remain unchanged', () => {
  const candidate = Object.freeze({seconds:172800,reason:'future_reason'});
  assert.equal(position(candidate).initialValue,'48:00:00');
  assert.equal(position({...base,seconds:172800}).referencePosition,'48:00:00');
  assert.equal(position().initialValue,'');
  assert.equal(candidate.seconds,172800);
});
test('review uses a shared initial-value policy and a separate reference display', () => {
  const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const panel = read('src/components/songbook/TimelinePanel.jsx');
  assert.match(panel,/setPosition\(candidatePlaybackPosition\(c\)\.initialValue\)/);
  assert.match(panel,/<CandidatePlaybackPosition[^>]+candidate=\{selected\}/);
  const component = read('src/components/songbook/CandidatePlaybackPosition.jsx');
  assert.match(component,/수집된 참고 위치/);
  assert.match(component,/target="_blank" rel="noopener noreferrer"/);
  assert.match(component,/<PlaybackPositionInput value=\{value\} onChange=\{onChange\}/);
  assert.doesNotMatch(component,/useEffect|onChange\(context|setPosition/);
});
