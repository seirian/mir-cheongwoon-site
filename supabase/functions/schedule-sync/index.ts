import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.6.1";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_CELL_LENGTH = 6000;
const DATE_ROWS = [6, 11, 16, 21, 26, 31];
const EVENT_ROWS = [7, 12, 17, 22, 27, 32];
const CALENDAR_OFFSETS = [0, 2, 4, 6, 8, 10, 12];

type SyncConfig = {
  cron_token: string;
  sheet_id: string;
  enabled: boolean;
  max_changes: number;
  max_deletes: number;
};

type SyncEvent = {
  event_date: string;
  title: string;
  category: string;
  source_type: "google_sheet";
  source_key: string;
  updated_at: string;
};

class SyncError extends Error {
  constructor(public code: string, public status = 500) { super(code); }
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ""; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function normalizeCell(value: string | undefined): string {
  const text = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if (text.length > MAX_CELL_LENGTH) throw new SyncError("source_cell_too_large", 422);
  return text;
}

function pad(value: number): string { return String(value).padStart(2, "0"); }
function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function monthParts(offset: number): { year: number; month: number; key: string } {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + offset, 1));
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  return { year, month, key: `${year}.${month}` };
}

function monthBounds(year: number, month: number): [string, string] {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return [dateKey(start), dateKey(end)];
}

function classify(title: string): string {
  if (title.includes("휴방")) return "휴방";
  if (title.includes("합방")) return "합방";
  if (title.includes("대회")) return "대회";
  return "기타";
}

function safeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function fetchCsv(sheetId: string, sheetName: string, range: string): Promise<string> {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  url.searchParams.set("tqx", "out:csv");
  url.searchParams.set("headers", "0");
  url.searchParams.set("sheet", sheetName);
  url.searchParams.set("range", range);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) throw new SyncError(`source_http_${response.status}`, 502);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("csv") && !contentType.startsWith("text/")) {
      throw new SyncError("source_content_type", 502);
    }
    const text = await response.text();
    if (text.length > 512 * 1024) throw new SyncError("source_response_too_large", 502);
    return text;
  } catch (error) {
    if (error instanceof SyncError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new SyncError("source_timeout", 504);
    throw new SyncError("source_fetch_failed", 502);
  } finally { clearTimeout(timeout); }
}

type MonthLoad = { key: string; year: number; month: number; exists: boolean; events: SyncEvent[] };

async function loadMonth(sheetId: string, year: number, month: number): Promise<MonthLoad> {
  const key = `${year}.${month}`;
  const markerRows = parseCsv(await fetchCsv(sheetId, key, "C1:C1"));
  const marker = normalizeCell(markerRows[0]?.[0]);
  if (marker !== key) return { key, year, month, exists: false, events: [] };

  const requests: Promise<string>[] = [];
  for (let week = 0; week < 6; week += 1) {
    requests.push(fetchCsv(sheetId, key, `B${DATE_ROWS[week]}:N${DATE_ROWS[week]}`));
    requests.push(fetchCsv(sheetId, key, `B${EVENT_ROWS[week]}:N${EVENT_ROWS[week]}`));
  }
  const raw = await Promise.all(requests);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - first.getUTCDay()));
  const events: SyncEvent[] = [];
  const updatedAt = new Date().toISOString();

  for (let week = 0; week < 6; week += 1) {
    const dateFields = parseCsv(raw[week * 2])[0] || [];
    const eventFields = parseCsv(raw[week * 2 + 1])[0] || [];
    for (let day = 0; day < 7; day += 1) {
      const gridDate = new Date(gridStart.getTime() + (week * 7 + day) * 86400000);
      const actualDay = normalizeCell(dateFields[CALENDAR_OFFSETS[day]]);
      if (actualDay !== String(gridDate.getUTCDate())) throw new SyncError("calendar_layout_changed", 422);
      if (gridDate.getUTCFullYear() !== year || gridDate.getUTCMonth() + 1 !== month) continue;
      const title = normalizeCell(eventFields[CALENDAR_OFFSETS[day]]);
      if (!title) continue;
      const eventDate = dateKey(gridDate);
      events.push({
        event_date: eventDate,
        title,
        category: classify(title),
        source_type: "google_sheet",
        source_key: `sheet-${eventDate}`,
        updated_at: updatedAt,
      });
    }
  }
  if (events.length > 31) throw new SyncError("source_month_too_many_rows", 422);
  return { key, year, month, exists: true, events };
}

function sameManagedFields(left: any, right: SyncEvent): boolean {
  return left.event_date === right.event_date
    && String(left.title || "") === right.title
    && String(left.category || "기타") === right.category
    && left.source_type === "google_sheet";
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
    const admin = ctx.supabaseAdmin;
    const { data: configData, error: configError } = await admin
      .from("schedule_sync_config")
      .select("cron_token,sheet_id,enabled,max_changes,max_deletes")
      .eq("id", 1)
      .single();
    if (configError || !configData) return jsonResponse({ error: "sync_config_unavailable" }, 503);
    const config = configData as SyncConfig;
    const suppliedToken = req.headers.get("x-schedule-sync-token") || "";
    if (!safeEqual(suppliedToken, config.cron_token)) return jsonResponse({ error: "unauthorized" }, 401);
    if (!config.enabled) return jsonResponse({ status: "disabled" }, 503);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }
    const dryRun = body.dry_run === true;
    const trigger = typeof body.trigger === "string" ? body.trigger.slice(0, 40) : "unknown";
    const staleCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await admin.from("schedule_sync_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error_code: "stale_run_recovered",
    }).eq("status", "running").lt("started_at", staleCutoff);

    const { data: runData, error: runError } = await admin.from("schedule_sync_runs").insert({
      status: "running",
      details: { trigger, dry_run: dryRun },
    }).select("id").single();
    if (runError) {
      if (runError.code === "23505") return jsonResponse({ error: "sync_already_running" }, 409);
      return jsonResponse({ error: "sync_log_unavailable" }, 503);
    }
    const runId = runData.id;

    try {
      const monthTargets = [-1, 0, 1].map(monthParts);
      const loaded: MonthLoad[] = [];
      for (const target of monthTargets) {
        loaded.push(await loadMonth(config.sheet_id, target.year, target.month));
      }
      const synced = loaded.filter((item) => item.exists);
      const syncedMonths = synced.map((item) => item.key);
      const incoming = synced.flatMap((item) => item.events);
      if (!synced.length) throw new SyncError("no_month_sheet_found", 502);

      const firstBound = monthBounds(synced[0].year, synced[0].month)[0];
      const lastItem = synced[synced.length - 1];
      const lastBound = monthBounds(lastItem.year, lastItem.month)[1];
      const { data: existingData, error: existingError } = await admin
        .from("schedule_events")
        .select("id,event_date,title,category,source_type,source_key")
        .eq("source_type", "google_sheet")
        .gte("event_date", firstBound)
        .lte("event_date", lastBound);
      if (existingError) throw new SyncError("existing_read_failed", 503);

      const syncedSet = new Set(syncedMonths);
      const existing = (existingData || []).filter((row: any) => {
        const [year, month] = String(row.event_date).split("-");
        return syncedSet.has(`${year}.${Number(month)}`);
      });
      const existingMap = new Map(existing.map((row: any) => [row.source_key, row]));
      const incomingMap = new Map(incoming.map((row) => [row.source_key, row]));
      const inserts: SyncEvent[] = [];
      const updates: SyncEvent[] = [];
      for (const row of incoming) {
        const old = existingMap.get(row.source_key);
        if (!old) inserts.push(row);
        else if (!sameManagedFields(old, row)) updates.push(row);
      }
      const deleteKeys = existing
        .filter((row: any) => row.source_key && !incomingMap.has(row.source_key))
        .map((row: any) => row.source_key as string);
      const changeCount = inserts.length + updates.length + deleteKeys.length;
      const details = {
        trigger, dry_run: dryRun,
        found_months: syncedMonths,
        missing_months: loaded.filter((item) => !item.exists).map((item) => item.key),
        change_count: changeCount,
      };
      if (changeCount > config.max_changes || deleteKeys.length > config.max_deletes) {
        await admin.from("schedule_sync_runs").update({
          status: "guard_blocked", finished_at: new Date().toISOString(), months: syncedMonths,
          source_rows: incoming.length, inserted_rows: inserts.length, updated_rows: updates.length,
          deleted_rows: deleteKeys.length, error_code: "change_guard_exceeded", details,
        }).eq("id", runId);
        return jsonResponse({ status: "guard_blocked", ...details }, 409);
      }

      if (!dryRun) {
        const toWrite = [...inserts, ...updates];
        if (toWrite.length) {
          const { error } = await admin.from("schedule_events").upsert(toWrite, { onConflict: "source_key" });
          if (error) throw new SyncError("schedule_upsert_failed", 503);
        }
        if (deleteKeys.length) {
          const { error } = await admin.from("schedule_events")
            .delete().eq("source_type", "google_sheet").in("source_key", deleteKeys);
          if (error) throw new SyncError("schedule_delete_failed", 503);
        }
      }

      const finalStatus = dryRun ? "dry_run" : "success";
      const { error: finishError } = await admin.from("schedule_sync_runs").update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        months: syncedMonths,
        source_rows: incoming.length,
        inserted_rows: inserts.length,
        updated_rows: updates.length,
        deleted_rows: deleteKeys.length,
        details,
      }).eq("id", runId);
      if (finishError) throw new SyncError("sync_log_finish_failed", 503);

      return jsonResponse({
        status: finalStatus,
        months: syncedMonths,
        missing_months: details.missing_months,
        source_rows: incoming.length,
        inserted: inserts.length,
        updated: updates.length,
        deleted: deleteKeys.length,
      });
    } catch (error) {
      const syncError = error instanceof SyncError ? error : new SyncError("unexpected_error", 500);
      await admin.from("schedule_sync_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_code: syncError.code,
        details: { trigger, dry_run: dryRun },
      }).eq("id", runId);
      console.error("schedule-sync failed", syncError.code);
      return jsonResponse({ error: syncError.code }, syncError.status);
    }
  }),
};
