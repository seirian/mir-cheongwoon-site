import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.6.1";
import { strFromU8, unzipSync } from "fflate";

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

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function xmlAttr(tag: string, name: string): string {
  const marker = name + '="';
  const start = tag.indexOf(marker);
  if (start < 0) return "";
  const valueStart = start + marker.length;
  const valueEnd = tag.indexOf('"', valueStart);
  if (valueEnd < 0) return "";
  return decodeXmlEntities(tag.slice(valueStart, valueEnd));
}

function normalizeZipPath(value: string): string {
  const parts: string[] = [];
  for (const rawPart of value.replace(/^\/+/, "").split("/")) {
    const part = rawPart.trim();
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function directoryName(value: string): string {
  const index = value.lastIndexOf("/");
  return index >= 0 ? value.slice(0, index) : "";
}

function baseName(value: string): string {
  const index = value.lastIndexOf("/");
  return index >= 0 ? value.slice(index + 1) : value;
}

function commentText(commentsXml: string, ref: string): string {
  const commentTags = commentsXml.match(/<comment\b[^>]*>[\s\S]*?<\/comment>/g) || [];
  const target = commentTags.find((tag) => {
    const opening = tag.match(/<comment\b[^>]*>/)?.[0] || "";
    return xmlAttr(opening, "ref") === ref;
  });
  if (!target) return "";

  const pieces = Array.from(target.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXmlEntities(String(match[1] || "").replace(/<[^>]+>/g, "")));
  return normalizeCell(pieces.join(""));
}

async function fetchWorkbookArchive(sheetId: string): Promise<Record<string, Uint8Array>> {
  const url = "https://docs.google.com/spreadsheets/d/" + sheetId + "/export?format=xlsx";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "User-Agent": "Mozilla/5.0 (compatible; yeop.net schedule sync)",
      },
    });
    if (!response.ok) throw new SyncError("memo_export_http_" + response.status, 502);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1000) throw new SyncError("memo_export_too_small", 502);
    if (bytes.byteLength > 30 * 1024 * 1024) throw new SyncError("memo_export_too_large", 502);
    return unzipSync(bytes);
  } catch (error) {
    if (error instanceof SyncError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new SyncError("memo_export_timeout", 504);
    throw new SyncError("memo_export_failed", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function extractSheetComments(
  archive: Record<string, Uint8Array>,
  sheetName: string,
): { waktaverseHistory: string; vrMocapHistory: string } {
  const workbookBytes = archive["xl/workbook.xml"];
  const workbookRelsBytes = archive["xl/_rels/workbook.xml.rels"];
  if (!workbookBytes || !workbookRelsBytes) throw new SyncError("memo_workbook_metadata_missing", 502);

  const workbookXml = strFromU8(workbookBytes);
  const workbookRelsXml = strFromU8(workbookRelsBytes);
  const sheetTags = workbookXml.match(/<sheet\b[^>]*\/?\s*>/g) || [];
  const sheetTag = sheetTags.find((tag) => xmlAttr(tag, "name") === sheetName);
  if (!sheetTag) throw new SyncError("memo_sheet_missing", 422);

  const relationId = xmlAttr(sheetTag, "r:id");
  if (!relationId) throw new SyncError("memo_sheet_relation_missing", 502);

  const relationshipTags = workbookRelsXml.match(/<Relationship\b[^>]*\/?\s*>/g) || [];
  const sheetRelationship = relationshipTags.find((tag) => xmlAttr(tag, "Id") === relationId);
  const sheetTarget = sheetRelationship ? xmlAttr(sheetRelationship, "Target") : "";
  if (!sheetTarget) throw new SyncError("memo_sheet_target_missing", 502);

  const sheetPath = normalizeZipPath(sheetTarget.startsWith("xl/") ? sheetTarget : "xl/" + sheetTarget);
  const sheetRelsPath = normalizeZipPath(
    directoryName(sheetPath) + "/_rels/" + baseName(sheetPath) + ".rels",
  );
  const sheetRelsBytes = archive[sheetRelsPath];
  if (!sheetRelsBytes) throw new SyncError("memo_sheet_rels_missing", 502);

  const sheetRelsXml = strFromU8(sheetRelsBytes);
  const sheetRelationshipTags = sheetRelsXml.match(/<Relationship\b[^>]*\/?\s*>/g) || [];
  const commentsRelationship = sheetRelationshipTags.find((tag) => xmlAttr(tag, "Type").endsWith("/comments"));
  const commentsTarget = commentsRelationship ? xmlAttr(commentsRelationship, "Target") : "";
  if (!commentsTarget) throw new SyncError("memo_comments_relation_missing", 502);

  const commentsPath = normalizeZipPath(directoryName(sheetPath) + "/" + commentsTarget);
  const commentsBytes = archive[commentsPath];
  if (!commentsBytes) throw new SyncError("memo_comments_file_missing", 502);

  const commentsXml = strFromU8(commentsBytes);
  return {
    waktaverseHistory: commentText(commentsXml, "Q21"),
    vrMocapHistory: commentText(commentsXml, "Q23"),
  };
}

async function loadScheduleMemo(
  sheetId: string,
  sheetName: string,
): Promise<{
  content: string;
  sourceSheet: string;
  waktaverseHistory?: string;
  vrMocapHistory?: string;
  historySynced: boolean;
  historyError?: string;
}> {
  const memoRows = parseCsv(await fetchCsv(sheetId, sheetName, "Q18:Q19"));
  const content = memoRows
    .map((row) => normalizeCell(row[0]))
    .filter(Boolean)
    .join("\n");

  let waktaverseHistory = "";
  let vrMocapHistory = "";
  let historySynced = false;
  let historyError = "";

  try {
    const archive = await fetchWorkbookArchive(sheetId);
    const comments = extractSheetComments(archive, sheetName);
    waktaverseHistory = comments.waktaverseHistory;
    vrMocapHistory = comments.vrMocapHistory;
    historySynced = Boolean(waktaverseHistory || vrMocapHistory);
  } catch (error) {
    historyError = error instanceof SyncError ? error.code : "memo_history_unexpected_error";
  }

  return {
    content,
    sourceSheet: sheetName,
    ...(waktaverseHistory ? { waktaverseHistory } : {}),
    ...(vrMocapHistory ? { vrMocapHistory } : {}),
    historySynced,
    ...(historyError ? { historyError } : {}),
  };
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

      const currentMonth = monthParts(0);
      let memoData: Awaited<ReturnType<typeof loadScheduleMemo>> | null = null;
      let memoSyncError = "";
      try {
        memoData = await loadScheduleMemo(config.sheet_id, currentMonth.key);
      } catch (error) {
        memoSyncError = error instanceof SyncError ? error.code : "memo_sync_unexpected_error";
      }

      const firstBound = monthBounds(synced[0].year, synced[0].month)[0];
      const lastItem = synced[synced.length - 1];
      const lastBound = monthBounds(lastItem.year, lastItem.month)[1];
      const { data: existingData, error: existingError } = await admin
        .from("schedule_events")
        .select("id,event_date,title,category,source_type,source_key,manual_override")
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
        else if (old.manual_override) continue;
        else if (!sameManagedFields(old, row)) updates.push(row);
      }
      const deleteKeys = existing
        .filter((row: any) => !row.manual_override && row.source_key && !incomingMap.has(row.source_key))
        .map((row: any) => row.source_key as string);
      const changeCount = inserts.length + updates.length + deleteKeys.length;
      const details: Record<string, any> = {
        trigger, dry_run: dryRun,
        found_months: syncedMonths,
        missing_months: loaded.filter((item) => !item.exists).map((item) => item.key),
        manual_overrides: existing.filter((row: any) => row.manual_override).length,
        change_count: changeCount,
        memo_sheet: memoData?.sourceSheet || currentMonth.key,
        memo_content_synced: Boolean(memoData),
        memo_history_synced: memoData?.historySynced || false,
        memo_sync_error: memoSyncError || memoData?.historyError || null,
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

        if (memoData) {
          const nowIso = new Date().toISOString();
          const memoUpdate: Record<string, unknown> = {
            content: memoData.content,
            source_sheet: memoData.sourceSheet,
            synced_at: nowIso,
            updated_at: nowIso,
          };
          if (memoData.waktaverseHistory) memoUpdate.waktaverse_history = memoData.waktaverseHistory;
          if (memoData.vrMocapHistory) memoUpdate.vr_mocap_history = memoData.vrMocapHistory;

          const { error: memoError } = await admin
            .from("schedule_memo")
            .update(memoUpdate)
            .eq("id", 1);
          if (memoError) details.memo_sync_error = "memo_database_update_failed";
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
        memo_sheet: details.memo_sheet,
        memo_content_synced: details.memo_content_synced,
        memo_history_synced: details.memo_history_synced,
        memo_sync_error: details.memo_sync_error,
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
