// Parse only the channel's selected Shorts tab, never recommendations or duration guesses.
export const SHORTS_LIMIT = 10;
export const MIR_CHANNEL_ID = 'UCNKFX8Kwk0LgX8VqyWFqF3Q';
export class ShortsSyncError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}

function text(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value?.runs)) return value.runs.map((r) => r.text || '').join('').trim();
  return String(value?.simpleText || value?.content || '').trim();
}

export function extractInitialData(html) {
  const marker = /(?:var\s+ytInitialData|window\["ytInitialData"\]|ytInitialData)\s*=\s*\{/g;
  for (const match of html.matchAll(marker)) {
    const start = match.index + match[0].length - 1;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < html.length; i += 1) {
      const c = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth += 1;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  throw new ShortsSyncError('youtube_initial_data_missing');
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) walk(value, visit);
}

export function parseLatestShorts(html, channelId = MIR_CHANNEL_ID) {
  const root = extractInitialData(html);
  const actualId = root.metadata?.channelMetadataRenderer?.externalId;
  if (actualId !== channelId) throw new ShortsSyncError('youtube_channel_mismatch');
  const tabs = root.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const tab = tabs.map((t) => t.tabRenderer).find((t) => t?.selected === true);
  const path = tab?.endpoint?.commandMetadata?.webCommandMetadata?.url || '';
  if (!/\/shorts(?:[?/#]|$)/.test(path)) throw new ShortsSyncError('youtube_shorts_tab_missing');
  const grid = tab.content?.richGridRenderer;
  if (!Array.isArray(grid?.contents)) throw new ShortsSyncError('youtube_shorts_grid_missing');

  // YouTube has shipped both chip renderer forms. Fail closed if the sort is unknown.
  const selectedSorts = [];
  walk(tab.content, (node) => {
    const chip = node.chipViewModel || node.chipCloudChipRenderer;
    if (chip?.selected === true || chip?.isSelected === true) selectedSorts.push(text(chip.text));
  });
  if (!selectedSorts.length || selectedSorts.some((s) => !/^(최신순|최신|Latest|Newest)$/i.test(s))) {
    throw new ShortsSyncError('youtube_shorts_latest_sort_unverified');
  }

  const videos = [], seen = new Set();
  let malformed = false;
  for (const item of grid.contents) {
    const content = item.richItemRenderer?.content || item;
    const renderer = content.shortsLockupViewModel || content.reelItemRenderer;
    if (!renderer) continue;
    const endpoint = renderer.onTap?.innertubeCommand || renderer.navigationEndpoint;
    const videoId = endpoint?.reelWatchEndpoint?.videoId || renderer.videoId;
    const endpointPath = endpoint?.commandMetadata?.webCommandMetadata?.url;
    const title = text(renderer.overlayMetadata?.primaryText) || text(renderer.headline) || text(renderer.title);
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '') || !title ||
        (endpointPath && endpointPath !== `/shorts/${videoId}`)) { malformed = true; break; }
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    videos.push({ video_id: videoId, title: title.slice(0, 300), youtube_url: `https://www.youtube.com/shorts/${videoId}` });
    if (videos.length === SHORTS_LIMIT) break;
  }
  const continuation = grid.contents.some((item) => item.continuationItemRenderer);
  if (malformed || !videos.length || (videos.length < SHORTS_LIMIT && continuation)) {
    throw new ShortsSyncError('youtube_shorts_incomplete');
  }
  return videos;
}

export async function fetchLatestShorts(channelId = MIR_CHANNEL_ID, fetcher = fetch) {
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) throw new ShortsSyncError('invalid_channel_id', 503);
  const url = new URL(`https://www.youtube.com/channel/${channelId}/shorts`);
  url.searchParams.set('hl', 'ko');
  url.searchParams.set('gl', 'KR');
  url.searchParams.set('sort', 'dd');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: { 'Accept': 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36' },
    });
    if (!response.ok) throw new ShortsSyncError(`youtube_http_${response.status}`);
    if (!(response.headers.get('content-type') || '').includes('text/html')) throw new ShortsSyncError('youtube_content_type');
    // Bound memory use even if the source changes or sends an oversized response.
    const reader = response.body?.getReader();
    if (!reader) throw new ShortsSyncError('youtube_empty_response');
    const decoder = new TextDecoder();
    let html = '', bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 5 * 1024 * 1024) { await reader.cancel(); throw new ShortsSyncError('youtube_response_too_large'); }
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally { reader.releaseLock(); }
    return parseLatestShorts(html, channelId);
  } catch (error) {
    if (error instanceof ShortsSyncError) throw error;
    if (controller.signal.aborted) throw new ShortsSyncError('youtube_timeout', 504);
    throw new ShortsSyncError('youtube_fetch_failed');
  } finally { clearTimeout(timer); }
}
