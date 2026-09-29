import { fanartImageUrls } from './fanartSlides.js';

export function validFanartResponse(value) {
  return value?.status === 'ok' && fanartImageUrls(value).length > 0
    && (value.fallbackKind !== 'daily_batch' || Number.isFinite(Date.parse(value.batchCollectedAt)))
    && /^https:\/\/cafe\.naver\.com\/f-e\/cafes\/31003156\/articles\/[1-9]\d*$/.test(value.articleUrl || '');
}

async function readJson(url, signal, timeoutMs, fetcher) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: controller.signal, cache: 'no-store' });
    const value = await response.json();
    if (!response.ok || !validFanartResponse(value)) throw new Error('fanart_unavailable', { cause: value });
    return value;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

// Normal request remains primary. The backup endpoint never performs upstream collection.
export async function requestFanart(base, { signal, backupOnly = false, fetcher = fetch } = {}) {
  let primaryError;
  if (!backupOnly) {
    try { return await readJson(base + 'api/naver-fanart.php', signal, 25000, fetcher); }
    catch (error) { if (signal?.aborted) throw error; primaryError = error; }
  }
  if (signal?.aborted) throw new Error('fanart_request_aborted');
  let backup;
  try { backup = await readJson(base + 'api/naver-fanart-backup.php', signal, 8000, fetcher); }
  catch (error) { throw primaryError || error; }
  if (backup.fallbackKind !== 'daily_batch') throw new Error('daily_backup_unavailable');
  return backup;
}
