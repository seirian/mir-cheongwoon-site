import test from 'node:test';
import assert from 'node:assert/strict';
import { MIR_CHANNEL_ID, parseLatestShorts, extractInitialData, fetchLatestShorts, ShortsSyncError } from '../supabase/functions/recent-shorts-sync/source.mjs';
import { createShortsSyncHandler } from '../supabase/functions/recent-shorts-sync/handler.mjs';

const id = (i) => `short${String(i).padStart(6, '0')}`;
const item = (i) => ({ richItemRenderer: { content: { shortsLockupViewModel: {
  onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: id(i) }, commandMetadata: { webCommandMetadata: { url: `/shorts/${id(i)}` } } } },
  overlayMetadata: { primaryText: { content: `쇼츠 ${i} {"테스트"} 💙` } },
} } } });
function fixture(count = 12, sort = '최신순') {
  return { metadata: { channelMetadataRenderer: { externalId: MIR_CHANNEL_ID } }, contents: {
    twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true,
      endpoint: { commandMetadata: { webCommandMetadata: { url: '/@미르MIR/shorts' } } },
      content: { richGridRenderer: { header: { chipBarViewModel: { chips: [{ chipViewModel: { text: sort, selected: true } }] } },
        contents: Array.from({ length: count }, (_, i) => item(i)) } },
    } }] },
  } };
}
const html = (root) => `<script>var ytInitialData = ${JSON.stringify(root)};</script>`;
const grid = (root) => root.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer;

test('shorts: latest order, ten cap, escaped titles and canonical URLs', () => {
  const rows = parseLatestShorts(html(fixture()));
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((v) => v.video_id), Array.from({ length: 10 }, (_, i) => id(i)));
  assert.match(rows[0].title, /\{"테스트"\}/);
  assert.equal(rows[0].youtube_url, `https://www.youtube.com/shorts/${id(0)}`);
});
test('shorts: initial-data parsing never evaluates script', () => {
  assert.deepEqual(extractInitialData('window["ytInitialData"]={"x":"}\\\"{"};evil()'), { x: '}"{' });
  assert.throws(() => extractInitialData('<html>blocked</html>'), /initial_data_missing/);
});
test('shorts: rejects wrong channel, wrong tab, unverified or popular order', () => {
  const wrong = fixture(); wrong.metadata.channelMetadataRenderer.externalId = 'another';
  assert.throws(() => parseLatestShorts(html(wrong)), /channel_mismatch/);
  const tab = fixture(); tab.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.endpoint.commandMetadata.webCommandMetadata.url = '/videos';
  assert.throws(() => parseLatestShorts(html(tab)), /tab_missing/);
  assert.throws(() => parseLatestShorts(html(fixture(12, '인기순'))), /sort_unverified/);
  const missing = fixture(); delete grid(missing).header;
  assert.throws(() => parseLatestShorts(html(missing)), /sort_unverified/);
});
test('shorts: excludes recommendations and general videos; deduplicates IDs', () => {
  const root = fixture();
  root.recommendations = item(99);
  grid(root).contents.unshift({ videoRenderer: { videoId: id(90), title: { simpleText: '일반영상' } } });
  grid(root).contents.splice(2, 0, item(0));
  assert.deepEqual(parseLatestShorts(html(root)).map((v) => v.video_id), Array.from({ length: 10 }, (_, i) => id(i)));
});
test('shorts: supports legacy reel renderers and chip renderers', () => {
  const root = fixture();
  grid(root).header = { feedFilterChipBarRenderer: { contents: [{ chipCloudChipRenderer: { text: { simpleText: 'Latest' }, isSelected: true } }] } };
  grid(root).contents = Array.from({ length: 10 }, (_, i) => ({
    richItemRenderer: {
      content: {
        reelItemRenderer: { videoId: id(i), headline: { runs: [{ text: `Legacy ${i}` }] } },
      },
    },
  }));
  assert.equal(parseLatestShorts(html(root)).length, 10);
});
test('shorts: short complete channels allowed; empty, malformed or partial responses rejected', () => {
  assert.equal(parseLatestShorts(html(fixture(3))).length, 3);
  assert.throws(() => parseLatestShorts(html(fixture(0))), /incomplete/);
  const partial = fixture(3); grid(partial).contents.push({ continuationItemRenderer: {} });
  assert.throws(() => parseLatestShorts(html(partial)), /incomplete/);
  const bad = fixture(); grid(bad).contents[0].richItemRenderer.content.shortsLockupViewModel.overlayMetadata.primaryText.content = '';
  assert.throws(() => parseLatestShorts(html(bad)), /incomplete/);
});
test('shorts: bounded public fetch and HTTP error handling', async () => {
  let source;
  const rows = await fetchLatestShorts(MIR_CHANNEL_ID, async (url) => { source = url; return new Response(html(fixture()), { headers: { 'Content-Type': 'text/html' } }); });
  assert.equal(rows.length, 10); assert.equal(source.searchParams.get('sort'), 'dd');
  await assert.rejects(fetchLatestShorts(MIR_CHANNEL_ID, async () => new Response('', { status: 503 })), /youtube_http_503/);
  await assert.rejects(fetchLatestShorts(MIR_CHANNEL_ID, async () => new Response('{}', { headers: { 'content-type': 'application/json' } })), /content_type/);
  await assert.rejects(fetchLatestShorts('https://evil.example'), /invalid_channel_id/);
});

function mockClient({ configError = false, enabled = true, busy = false, rpcError = false } = {}) {
  const calls = [];
  return { calls, from(table) {
    const call = { table }; calls.push(call);
    const chain = { select() { return this; }, eq() { return this; }, lt() { return this; },
      update(value) { call.update = value; return this; }, insert(value) { call.insert = value; return this; },
      single() { return this; }, then(resolve, reject) {
        const result = table === 'recent_shorts_sync_config' ? { data: configError ? null : { cron_token: 'test-secret', channel_id: MIR_CHANNEL_ID, enabled }, error: configError ? {} : null }
          : call.insert ? (busy ? { error: { code: '23505' } } : { data: { id: 1 } }) : { error: null };
        return Promise.resolve(result).then(resolve, reject);
      } };
    return chain;
  }, async rpc(name, args) { calls.push({ rpc: name, args }); return rpcError ? { error: {} } : { data: { status: 'success', source_rows: args.p_videos.length } }; } };
}
const request = (body = {}, token = 'test-secret') => new Request('https://local/sync', { method: 'POST', headers: { 'x-recent-shorts-sync-token': token }, body: JSON.stringify(body) });
const handler = (client, loadSource = async () => parseLatestShorts(html(fixture()))) => createShortsSyncHandler({ createClient: () => client, url: 'https://local', serviceKey: 'not-a-real-key', loadSource });

test('shorts handler: missing/wrong auth and disabled config never fetch or replace cache', async () => {
  for (const [options, token, status] of [[{}, '', 401], [{}, 'wrong', 401], [{ enabled: false }, 'test-secret', 503], [{ configError: true }, 'test-secret', 503]]) {
    const client = mockClient(options);
    assert.equal((await handler(client)(request({}, token))).status, status);
    assert.ok(!client.calls.some((c) => c.rpc || c.insert));
  }
});
test('shorts handler: concurrent run is rejected', async () => {
  const client = mockClient({ busy: true });
  assert.equal((await handler(client)(request())).status, 409);
  assert.ok(!client.calls.some((c) => c.rpc));
});
test('shorts handler: dry-run leaves public cache untouched', async () => {
  const client = mockClient();
  const response = await handler(client)(request({ dry_run: true, trigger: 'test' }));
  assert.equal((await response.json()).status, 'dry_run');
  assert.ok(!client.calls.some((c) => c.rpc || c.table === 'recent_shorts'));
});
test('shorts handler: success uses only atomic cache RPC', async () => {
  const client = mockClient();
  assert.equal((await handler(client)(request())).status, 200);
  assert.equal(client.calls.filter((c) => c.rpc).length, 1);
  assert.equal(client.calls.find((c) => c.rpc).args.p_videos.length, 10);
});
test('shorts handler: failed source does not delete last known good cache', async () => {
  const client = mockClient();
  const response = await handler(client, async () => { throw new ShortsSyncError('youtube_timeout', 504); })(request());
  assert.equal(response.status, 504);
  assert.ok(!client.calls.some((c) => c.rpc || c.table === 'recent_shorts'));
  assert.ok(client.calls.some((c) => c.update?.error_code === 'youtube_timeout'));
});
test('shorts handler: transaction failure is logged', async () => {
  const client = mockClient({ rpcError: true });
  assert.equal((await handler(client)(request())).status, 503);
  assert.ok(client.calls.some((c) => c.update?.error_code === 'shorts_cache_commit_failed'));
});
