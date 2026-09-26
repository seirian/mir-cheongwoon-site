import { fetchLatestShorts, ShortsSyncError } from './source.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Inject I/O for offline tests. Production receives a server-only Supabase client factory.
export function createShortsSyncHandler({ createClient, url, serviceKey, loadSource = fetchLatestShorts }) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!url || !serviceKey) return json({ error: 'sync_service_unavailable' }, 503);
    const token = req.headers.get('x-recent-shorts-sync-token') || '';
    if (!token) return json({ error: 'unauthorized' }, 401);
    let admin, runId;
    try {
      admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data: config, error: configError } = await admin.from('recent_shorts_sync_config')
        .select('cron_token,channel_id,enabled').eq('id', 1).single();
      if (configError || !config) return json({ error: 'sync_config_unavailable' }, 503);
      if (!safeEqual(token, config.cron_token)) return json({ error: 'unauthorized' }, 401);
      if (!config.enabled) return json({ status: 'disabled' }, 503);
      let body = {};
      try { body = await req.json() || {}; } catch { /* cron's empty body is allowed */ }
      const dryRun = body.dry_run === true;
      const trigger = typeof body.trigger === 'string' ? body.trigger.slice(0, 40) : 'unknown';
      const { error: staleError } = await admin.from('recent_shorts_sync_runs')
        .update({ status: 'failed', finished_at: new Date().toISOString(), error_code: 'stale_run_recovered' })
        .eq('status', 'running').lt('started_at', new Date(Date.now() - 20 * 60000).toISOString());
      if (staleError) return json({ error: 'sync_log_unavailable' }, 503);
      const { data: run, error: runError } = await admin.from('recent_shorts_sync_runs')
        .insert({ status: 'running', details: { trigger, dry_run: dryRun } }).select('id').single();
      if (runError || !run) return json({ error: runError?.code === '23505' ? 'sync_already_running' : 'sync_log_unavailable' }, runError?.code === '23505' ? 409 : 503);
      runId = run.id;
      const videos = await loadSource(config.channel_id);
      if (dryRun) {
        const { error } = await admin.from('recent_shorts_sync_runs').update({ status: 'dry_run',
          finished_at: new Date().toISOString(), source_rows: videos.length, video_ids: videos.map((v) => v.video_id) })
          .eq('id', runId).eq('status', 'running');
        if (error) throw new ShortsSyncError('sync_log_finish_failed', 503);
        return json({ status: 'dry_run', run_id: runId, videos });
      }
      // Cache replacement and success log are committed together in one DB transaction.
      const { data, error } = await admin.rpc('replace_recent_shorts', { p_run_id: runId, p_videos: videos });
      if (error) throw new ShortsSyncError('shorts_cache_commit_failed', 503);
      return json({ ...data, run_id: runId, videos });
    } catch (error) {
      const code = error instanceof ShortsSyncError ? error.code : 'unexpected_error';
      if (admin && runId) {
        await admin.from('recent_shorts_sync_runs').update({ status: 'failed',
          finished_at: new Date().toISOString(), error_code: code }).eq('id', runId).eq('status', 'running');
      }
      return json({ error: code }, error instanceof ShortsSyncError ? error.status : 500);
    }
  };
}
