import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fetchLatestShorts, MIR_CHANNEL_ID } from '../supabase/functions/recent-shorts-sync/source.mjs';

// Public GET only: no service key, production DB writes, or scheduling here.
const videos = await fetchLatestShorts();
assert.equal(videos.length, 10, 'The configured MIR channel should currently provide ten Shorts');
assert.equal(new Set(videos.map((v) => v.video_id)).size, 10);
await mkdir('shorts-test-results', { recursive: true });
await writeFile('shorts-test-results/live-source.json', JSON.stringify({ checked_at: new Date().toISOString(), channel_id: MIR_CHANNEL_ID, videos }, null, 2));
console.log(JSON.stringify({ source_check: 'passed', channel_id: MIR_CHANNEL_ID, count: videos.length, videos }, null, 2));
