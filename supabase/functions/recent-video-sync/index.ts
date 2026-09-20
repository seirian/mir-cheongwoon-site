import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.6.1";

type SyncConfig = {
  cron_token: string;
  channel_url: string;
  channel_id: string;
  enabled: boolean;
};

type RecentVideo = {
  video_id: string;
  title: string;
  youtube_url: string;
  position: number;
  synced_at: string;
};

class SyncError extends Error {
  constructor(public code: string, public status = 500) {
    super(code);
  }
}

function safeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function textValue(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value.simpleText === "string") return value.simpleText.trim();
  if (typeof value.content === "string") return value.content.trim();
  if (Array.isArray(value.runs)) {
    return value.runs.map((item: any) => String(item?.text || "")).join("").trim();
  }
  return "";
}

function balancedJsonAt(input: string, start: number): string {
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];

    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, index + 1);
    }
  }

  throw new SyncError("youtube_initial_data_unbalanced", 502);
}

function extractInitialData(html: string): any {
  const markers = [
    "var ytInitialData = ",
    "ytInitialData = ",
    'window["ytInitialData"] = ',
  ];

  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) continue;
    const objectStart = html.indexOf("{", markerIndex + marker.length);
    if (objectStart < 0) continue;

    try {
      return JSON.parse(balancedJsonAt(html, objectStart));
    } catch {
      continue;
    }
  }

  const scriptMatch = html.match(/<script[^>]+id=["'](?:page-manager|ytInitialData)["'][^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch?.[1]) {
    try {
      return JSON.parse(scriptMatch[1]);
    } catch {
      // Fall through to a clear source error.
    }
  }

  throw new SyncError("youtube_initial_data_missing", 502);
}

function rendererVideo(renderer: any): Omit<RecentVideo, "position" | "synced_at"> | null {
  const videoId = String(renderer?.videoId || renderer?.contentId || "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

  const title =
    textValue(renderer?.title)
    || textValue(renderer?.headline)
    || textValue(renderer?.metadata?.lockupMetadataViewModel?.title)
    || textValue(renderer?.metadata?.lockupMetadataViewModel?.title?.content);

  if (!title) return null;

  const endpointUrl =
    renderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url
    || renderer?.onTap?.innertubeCommand?.commandMetadata?.webCommandMetadata?.url
    || "";

  if (String(endpointUrl).startsWith("/shorts/")) return null;

  return {
    video_id: videoId,
    title: title.slice(0, 300),
    youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function findSelectedTabContent(root: any): any | null {
  let selected: any | null = null;

  const visit = (node: any) => {
    if (selected || !node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object") return;

    const tab = node.tabRenderer;
    if (tab?.selected === true && tab?.content) {
      selected = tab.content;
      return;
    }

    for (const value of Object.values(node)) visit(value);
  };

  visit(root);
  return selected;
}

function collectVideos(root: any): Omit<RecentVideo, "position" | "synced_at">[] {
  const output: Omit<RecentVideo, "position" | "synced_at">[] = [];
  const seen = new Set<string>();

  const add = (renderer: any) => {
    const video = rendererVideo(renderer);
    if (!video || seen.has(video.video_id)) return;
    seen.add(video.video_id);
    output.push(video);
  };

  const visit = (node: any) => {
    if (!node || output.length >= 12) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
        if (output.length >= 12) break;
      }
      return;
    }
    if (typeof node !== "object") return;

    if (node.videoRenderer) add(node.videoRenderer);
    if (node.gridVideoRenderer) add(node.gridVideoRenderer);
    if (node.lockupViewModel) add(node.lockupViewModel);

    for (const value of Object.values(node)) {
      visit(value);
      if (output.length >= 12) break;
    }
  };

  visit(findSelectedTabContent(root) || root);
  return output;
}

function fallbackVideosFromHtml(html: string): Omit<RecentVideo, "position" | "synced_at">[] {
  const output: Omit<RecentVideo, "position" | "synced_at">[] = [];
  const seen = new Set<string>();
  const pattern = /"videoId":"([A-Za-z0-9_-]{11})"/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && output.length < 8) {
    const videoId = match[1];
    if (seen.has(videoId)) continue;

    const context = html.slice(match.index, Math.min(html.length, match.index + 5000));
    if (context.includes(`/shorts/${videoId}`)) continue;

    const titleMatch =
      context.match(/"title":\{"runs":\[\{"text":"((?:\\.|[^"\\])*)"/)
      || context.match(/"title":\{"simpleText":"((?:\\.|[^"\\])*)"/);

    if (!titleMatch?.[1]) continue;

    let title = "";
    try {
      title = JSON.parse(`"${titleMatch[1]}"`);
    } catch {
      continue;
    }

    if (!title.trim()) continue;
    seen.add(videoId);
    output.push({
      video_id: videoId,
      title: title.trim().slice(0, 300),
      youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  return output;
}

async function fetchLatestVideos(channelUrl: string): Promise<Omit<RecentVideo, "position" | "synced_at">[]> {
  const url = new URL(channelUrl);
  url.searchParams.set("hl", "ko");
  url.searchParams.set("gl", "KR");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
        "Cache-Control": "no-cache",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) throw new SyncError(`youtube_http_${response.status}`, 502);
    const html = await response.text();
    if (html.length < 5000) throw new SyncError("youtube_response_too_small", 502);
    if (html.length > 10 * 1024 * 1024) throw new SyncError("youtube_response_too_large", 502);

    let videos: Omit<RecentVideo, "position" | "synced_at">[] = [];
    try {
      videos = collectVideos(extractInitialData(html));
    } catch (error) {
      if (!(error instanceof SyncError)) throw error;
    }

    if (videos.length < 2) videos = fallbackVideosFromHtml(html);
    if (videos.length < 2) throw new SyncError("youtube_recent_videos_missing", 502);

    return videos.slice(0, 2);
  } catch (error) {
    if (error instanceof SyncError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SyncError("youtube_timeout", 504);
    }
    throw new SyncError("youtube_fetch_failed", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function sameVideoRows(existing: any[], incoming: RecentVideo[]): boolean {
  if (existing.length !== incoming.length) return false;
  const current = [...existing].sort((a, b) => Number(a.position) - Number(b.position));
  return incoming.every((video, index) => {
    const old = current[index];
    return old
      && old.video_id === video.video_id
      && old.title === video.title
      && old.youtube_url === video.youtube_url
      && Number(old.position) === video.position;
  });
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

    const admin = ctx.supabaseAdmin;
    const { data: configData, error: configError } = await admin
      .from("recent_video_sync_config")
      .select("cron_token,channel_url,channel_id,enabled")
      .eq("id", 1)
      .single();

    if (configError || !configData) return jsonResponse({ error: "sync_config_unavailable" }, 503);

    const config = configData as SyncConfig;
    const suppliedToken = req.headers.get("x-recent-video-sync-token") || "";
    if (!safeEqual(suppliedToken, config.cron_token)) return jsonResponse({ error: "unauthorized" }, 401);
    if (!config.enabled) return jsonResponse({ status: "disabled" }, 503);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const dryRun = body.dry_run === true;
    const trigger = typeof body.trigger === "string" ? body.trigger.slice(0, 40) : "unknown";
    const staleCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    await admin
      .from("recent_video_sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_code: "stale_run_recovered",
      })
      .eq("status", "running")
      .lt("started_at", staleCutoff);

    const { data: runData, error: runError } = await admin
      .from("recent_video_sync_runs")
      .insert({ status: "running", details: { trigger, dry_run: dryRun } })
      .select("id")
      .single();

    if (runError) {
      if (runError.code === "23505") return jsonResponse({ error: "sync_already_running" }, 409);
      return jsonResponse({ error: "sync_log_unavailable" }, 503);
    }

    const runId = runData.id;

    try {
      const latest = await fetchLatestVideos(config.channel_url);
      const syncedAt = new Date().toISOString();
      const incoming: RecentVideo[] = latest.map((video, index) => ({
        ...video,
        position: index + 1,
        synced_at: syncedAt,
      }));

      const { data: existingData, error: existingError } = await admin
        .from("recent_videos")
        .select("video_id,title,youtube_url,position,synced_at")
        .order("position", { ascending: true });

      if (existingError) throw new SyncError("existing_read_failed", 503);

      const existing = existingData || [];
      const changed = !sameVideoRows(existing, incoming);

      if (!dryRun && changed) {
        const incomingIds = new Set(incoming.map((video) => video.video_id));
        const deleteIds = existing
          .filter((video: any) => !incomingIds.has(video.video_id))
          .map((video: any) => video.video_id);

        if (deleteIds.length) {
          const { error: deleteError } = await admin
            .from("recent_videos")
            .delete()
            .in("video_id", deleteIds);
          if (deleteError) throw new SyncError("recent_video_delete_failed", 503);
        }

        const { error: upsertError } = await admin
          .from("recent_videos")
          .upsert(incoming, { onConflict: "video_id" });
        if (upsertError) throw new SyncError("recent_video_upsert_failed", 503);
      }

      const finalStatus = dryRun ? "dry_run" : changed ? "success" : "no_change";
      const videoIds = incoming.map((video) => video.video_id);

      const { error: finishError } = await admin
        .from("recent_video_sync_runs")
        .update({
          status: finalStatus,
          finished_at: new Date().toISOString(),
          source_rows: incoming.length,
          video_ids: videoIds,
          details: {
            trigger,
            dry_run: dryRun,
            changed,
            channel_id: config.channel_id,
            titles: incoming.map((video) => video.title),
          },
        })
        .eq("id", runId);

      if (finishError) throw new SyncError("sync_log_finish_failed", 503);

      return jsonResponse({
        status: finalStatus,
        changed,
        videos: incoming.map(({ video_id, title, youtube_url, position }) => ({
          video_id,
          title,
          youtube_url,
          position,
        })),
      });
    } catch (error) {
      const syncError = error instanceof SyncError ? error : new SyncError("unexpected_error", 500);

      await admin
        .from("recent_video_sync_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_code: syncError.code,
          details: { trigger, dry_run: dryRun },
        })
        .eq("id", runId);

      console.error("recent-video-sync failed", syncError.code);
      return jsonResponse({ error: syncError.code }, syncError.status);
    }
  }),
};
