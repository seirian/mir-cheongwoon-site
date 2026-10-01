import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type ReportMode = "midnight" | "fanart" | "noon";

type MonitorConfig = {
  monitor_token: string;
  discord_webhook_url: string | null;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: any): boolean {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "PGRST303"
    || message.includes("JWT")
    || message.includes("401")
    || message.includes("503")
    || message.includes("520");
}

async function retryQuery(operation: () => PromiseLike<any>): Promise<any> {
  const delays = [0, 300, 1000];
  let last: any = null;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) await wait(delays[attempt]);
    const result = await operation();
    if (!result?.error) return result;
    last = result;
    if (!isRetryable(result.error)) break;
    console.warn("daily-batch-report query retry", {
      attempt: attempt + 1,
      code: result.error?.code || null,
    });
  }
  return last;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function currentKstDate(): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function windowIso(reportDate: string, mode: ReportMode): {
  batchStart: string;
  batchEnd: string;
  monitorStart: string;
  monitorEnd: string;
} {
  if (mode === "midnight") {
    return {
      batchStart: new Date(`${reportDate}T00:00:00+09:00`).toISOString(),
      batchEnd: new Date(`${reportDate}T00:12:59+09:00`).toISOString(),
      monitorStart: new Date(`${reportDate}T00:09:00+09:00`).toISOString(),
      monitorEnd: new Date(`${reportDate}T00:12:59+09:00`).toISOString(),
    };
  }
  if (mode === "noon") {
    return {
      batchStart: new Date(`${reportDate}T12:00:00+09:00`).toISOString(),
      batchEnd: new Date(`${reportDate}T12:12:59+09:00`).toISOString(),
      monitorStart: new Date(`${reportDate}T12:09:00+09:00`).toISOString(),
      monitorEnd: new Date(`${reportDate}T12:12:59+09:00`).toISOString(),
    };
  }
  return {
    batchStart: new Date(`${reportDate}T01:00:00+09:00`).toISOString(),
    batchEnd: new Date(`${reportDate}T01:05:59+09:00`).toISOString(),
    monitorStart: new Date(`${reportDate}T01:00:00+09:00`).toISOString(),
    monitorEnd: new Date(`${reportDate}T01:05:59+09:00`).toISOString(),
  };
}

function recoveredSchedule(startedAt: string | null | undefined): boolean {
  if (!startedAt) return false;
  const shifted = new Date(new Date(startedAt).getTime() + KST_OFFSET_MS);
  const minute = shifted.getUTCMinutes();
  return minute >= 2 && minute <= 7;
}

async function latestRun(
  admin: any,
  table: string,
  select: string,
  timeColumn: string,
  start: string,
  end: string,
  triggerCron = false,
): Promise<{ data: any | null; error: any | null }> {
  const result = await retryQuery(() => {
    let query = admin
      .from(table)
      .select(select)
      .gte(timeColumn, start)
      .lte(timeColumn, end)
      .order(timeColumn, { ascending: false })
      .limit(1);
    if (triggerCron) query = query.eq("details->>trigger", "cron");
    return query.maybeSingle();
  });
  return { data: result?.data ?? null, error: result?.error ?? null };
}

async function fetchFanartStatus(): Promise<{ data: any | null; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://mir.yeop.net/api/naver-fanart-daily.php?status=1", {
      headers: { "Accept": "application/json" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) return { data: null, error: `fanart_status_http_${response.status}` };
    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { data: null, error: "fanart_status_timeout" };
    }
    return { data: null, error: "fanart_status_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendDiscord(webhookUrl: string, content: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          allowed_mentions: { parse: [] },
        }),
      });
      if (response.ok) return true;
    } catch {
      // retry once
    }
    if (attempt === 0) await wait(500);
  }
  return false;
}

function resultLabel(row: any | null, successStatuses: string[]): {
  ok: boolean;
  status: string;
  error: string | null;
} {
  if (!row) return { ok: false, status: "실행 기록 없음", error: null };
  const status = String(row.status || "unknown");
  return {
    ok: successStatuses.includes(status),
    status,
    error: row.error_code ? String(row.error_code) : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "report_service_unavailable" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const configResult = await retryQuery(() => admin
    .from("schedule_monitor_config")
    .select("monitor_token,discord_webhook_url")
    .eq("id", 1)
    .single());

  if (configResult?.error || !configResult?.data) {
    return jsonResponse({ error: "report_config_unavailable" }, 503);
  }

  const config = configResult.data as MonitorConfig;
  const suppliedToken = req.headers.get("x-daily-batch-report-token") || "";
  if (!safeEqual(suppliedToken, config.monitor_token)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  const mode = body.mode;
  if (mode !== "midnight" && mode !== "fanart" && mode !== "noon") {
    return jsonResponse({ error: "invalid_report_mode" }, 400);
  }

  const reportMode = mode as ReportMode;
  const reportDate = isValidDate(body.report_date) ? body.report_date : currentKstDate();
  const dryRun = body.dry_run === true;
  const force = body.force === true;
  const window = windowIso(reportDate, reportMode);

  if (!dryRun && !force) {
    const existing = await retryQuery(() => admin
      .from("daily_batch_report_runs")
      .select("id,notification_status")
      .eq("report_date", reportDate)
      .eq("report_mode", reportMode)
      .maybeSingle());

    if (existing?.error) return jsonResponse({ error: "report_log_read_failed" }, 503);
    if (existing?.data?.notification_status === "sent") {
      return jsonResponse({
        status: "already_reported",
        report_date: reportDate,
        report_mode: reportMode,
      });
    }
  }

  const lines: string[] = [];
  const details: Record<string, unknown> = {};
  let allOk = true;

  if (reportMode === "midnight" || reportMode === "noon") {
    const schedule = await latestRun(
      admin,
      "schedule_sync_runs",
      "id,started_at,finished_at,status,source_rows,inserted_rows,updated_rows,deleted_rows,error_code,details",
      "started_at",
      window.batchStart,
      window.batchEnd,
      true,
    );
    if (schedule.error) return jsonResponse({ error: "schedule_run_read_failed" }, 503);

    const scheduleResult = resultLabel(schedule.data, ["success"]);
    allOk = allOk && scheduleResult.ok;
    details.schedule = schedule.data;

    if (scheduleResult.ok) {
      const recovered = recoveredSchedule(schedule.data.started_at);
      lines.push(
        `✅ 일정 동기화: 성공 (신규 ${Number(schedule.data.inserted_rows || 0)} / 수정 ${Number(schedule.data.updated_rows || 0)} / 삭제 ${Number(schedule.data.deleted_rows || 0)})${recovered ? " · 자동 복구 사용" : ""}`,
      );
      lines.push(`↪ 자동 복구: ${recovered ? "사용됨" : "불필요"}`);
    } else {
      lines.push(
        `❌ 일정 동기화: ${scheduleResult.status}${scheduleResult.error ? ` (${scheduleResult.error})` : ""}`,
      );
      lines.push("↪ 자동 복구: 최종 성공 기록 없음");
    }

    const monitor = await latestRun(
      admin,
      "schedule_monitor_runs",
      "id,checked_at,status,reason,details,notification_status",
      "checked_at",
      window.monitorStart,
      window.monitorEnd,
      false,
    );
    if (monitor.error) return jsonResponse({ error: "schedule_monitor_read_failed" }, 503);

    const monitorOk = monitor.data?.status === "ok";
    allOk = allOk && monitorOk;
    details.schedule_monitor = monitor.data;
    lines.push(
      monitorOk
        ? "✅ 일정 사후 점검: 정상"
        : `❌ 일정 사후 점검: ${monitor.data?.reason || monitor.data?.status || "실행 기록 없음"}`,
    );

    if (reportMode === "midnight") {
      const video = await latestRun(
        admin,
        "recent_video_sync_runs",
        "id,started_at,finished_at,status,source_rows,video_ids,error_code,details",
        "started_at",
        window.batchStart,
        window.batchEnd,
        true,
      );
      if (video.error) return jsonResponse({ error: "video_run_read_failed" }, 503);

      const videoResult = resultLabel(video.data, ["success", "no_change"]);
      allOk = allOk && videoResult.ok;
      details.recent_video = video.data;
      if (videoResult.ok) {
        lines.push(
          `✅ 최신 영상 동기화: 성공 (${video.data.status === "no_change" ? "변경 없음 · " : ""}${Number(video.data.source_rows || 0)}건 확인)`,
        );
      } else {
        lines.push(
          `❌ 최신 영상 동기화: ${videoResult.status}${videoResult.error ? ` (${videoResult.error})` : ""}`,
        );
      }

      const shorts = await latestRun(
        admin,
        "recent_shorts_sync_runs",
        "id,started_at,finished_at,status,source_rows,video_ids,error_code,details",
        "started_at",
        window.batchStart,
        window.batchEnd,
        true,
      );
      if (shorts.error) return jsonResponse({ error: "shorts_run_read_failed" }, 503);

      const shortsResult = resultLabel(shorts.data, ["success", "no_change"]);
      allOk = allOk && shortsResult.ok;
      details.recent_shorts = shorts.data;
      if (shortsResult.ok) {
        lines.push(
          `✅ 쇼츠 동기화: 성공 (${shorts.data.status === "no_change" ? "변경 없음 · " : ""}${Number(shorts.data.source_rows || 0)}건 확인)`,
        );
      } else {
        lines.push(
          `❌ 쇼츠 동기화: ${shortsResult.status}${shortsResult.error ? ` (${shortsResult.error})` : ""}`,
        );
      }
    }
  } else {
    const fanart = await fetchFanartStatus();
    if (fanart.error) {
      allOk = false;
      details.fanart = { error: fanart.error };
      lines.push(`❌ 팬아트 일일 백업: 상태 확인 실패 (${fanart.error})`);
    } else {
      const lastRun = fanart.data?.lastRun || null;
      const sameDate = lastRun?.batchDate === reportDate;
      const ok = sameDate && lastRun?.status === "success";
      allOk = allOk && ok;
      details.fanart = lastRun;
      if (ok) {
        lines.push(
          `✅ 팬아트 일일 백업: 성공 (게시글 #${Number(lastRun.articleId || 0)} / 이미지 ${Number(lastRun.imageCount || 0)}장 / 원본 ${String(lastRun.sourceDate || "-")})`,
        );
      } else {
        lines.push(
          `❌ 팬아트 일일 백업: ${sameDate ? String(lastRun?.status || "unknown") : "오늘 실행 기록 없음"}${lastRun?.error ? ` (${lastRun.error})` : ""}`,
        );
      }
    }
  }

  const label = reportMode === "midnight"
    ? "00시 일배치"
    : reportMode === "fanart"
      ? "01시 팬아트 일배치"
      : "12시 일정 배치";
  const prefix = allOk ? "✅" : "🚨";
  const message = [
    `${prefix} **mir.yeop.net ${label} 결과**`,
    `- 기준일: ${reportDate} KST`,
    ...lines.map((line) => `- ${line}`),
  ].join("\n");

  if (dryRun) {
    return jsonResponse({
      status: allOk ? "success" : "failure",
      report_date: reportDate,
      report_mode: reportMode,
      message,
      details,
      notification_status: "dry_run",
    }, allOk ? 200 : 207);
  }

  let notificationStatus = "skipped_unconfigured";
  let notifiedAt: string | null = null;

  if (config.discord_webhook_url) {
    const sent = await sendDiscord(config.discord_webhook_url, message);
    notificationStatus = sent ? "sent" : "failed";
    if (sent) notifiedAt = new Date().toISOString();
  }

  const logResult = await retryQuery(() => admin
    .from("daily_batch_report_runs")
    .upsert({
      report_date: reportDate,
      report_mode: reportMode,
      checked_at: new Date().toISOString(),
      status: allOk ? "success" : "failure",
      details: { items: details, message },
      notification_status: notificationStatus,
      notified_at: notifiedAt,
    }, { onConflict: "report_date,report_mode" }));

  if (logResult?.error) {
    return jsonResponse({
      error: "report_log_write_failed",
      status: allOk ? "success" : "failure",
      notification_status: notificationStatus,
    }, 503);
  }

  return jsonResponse({
    status: allOk ? "success" : "failure",
    report_date: reportDate,
    report_mode: reportMode,
    notification_status: notificationStatus,
    details,
  }, allOk && notificationStatus === "sent" ? 200 : 207);
});
