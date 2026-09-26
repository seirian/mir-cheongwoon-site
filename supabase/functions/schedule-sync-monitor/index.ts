import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.6.1";

type MonitorConfig = {
  monitor_token: string;
  enabled: boolean;
  discord_webhook_url: string | null;
};

type SyncRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  source_rows: number;
  inserted_rows: number;
  updated_rows: number;
  deleted_rows: number;
  error_code: string | null;
  details: Record<string, unknown> | null;
};

function safeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function sendDiscord(webhookUrl: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: message,
        allowed_mentions: { parse: [] },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function fmtKst(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

    const admin = ctx.supabaseAdmin;
    const { data: configData, error: configError } = await admin
      .from("schedule_monitor_config")
      .select("monitor_token,enabled,discord_webhook_url")
      .eq("id", 1)
      .single();

    if (configError || !configData) {
      return jsonResponse({ error: "monitor_config_unavailable" }, 503);
    }

    const config = configData as MonitorConfig;
    const suppliedToken = req.headers.get("x-schedule-monitor-token") || "";
    if (!safeEqual(suppliedToken, config.monitor_token)) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    if (!config.enabled) return jsonResponse({ status: "disabled" }, 503);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }
    const trigger = typeof body.trigger === "string" ? body.trigger.slice(0, 40) : "unknown";

    const now = Date.now();
    const batchCutoff = new Date(now - 25 * 60 * 1000).toISOString();

    const { data: batchData, error: batchError } = await admin
      .from("schedule_sync_runs")
      .select("id,started_at,finished_at,status,source_rows,inserted_rows,updated_rows,deleted_rows,error_code,details")
      .eq("details->>trigger", "cron")
      .gte("started_at", batchCutoff)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let status: "ok" | "alert" | "monitor_error" = "ok";
    let reason: string | null = null;
    let verification: Record<string, unknown> | null = null;
    let batch: SyncRun | null = (batchData as SyncRun | null) ?? null;

    if (batchError) {
      status = "monitor_error";
      reason = "batch_log_read_failed";
    } else if (!batch) {
      status = "alert";
      reason = "scheduled_batch_not_found";
    } else if (batch.status !== "success") {
      status = "alert";
      reason = "scheduled_batch_failed";
    } else {
      const { data: syncConfig, error: syncConfigError } = await admin
        .from("schedule_sync_config")
        .select("cron_token")
        .eq("id", 1)
        .single();

      if (syncConfigError || !syncConfig?.cron_token) {
        status = "monitor_error";
        reason = "sync_config_unavailable";
      } else {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://nohboljeugjmtwnvtayu.supabase.co";
          const verifyResponse = await fetch(`${supabaseUrl}/functions/v1/schedule-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-schedule-sync-token": syncConfig.cron_token,
            },
            body: JSON.stringify({
              trigger: "post-batch-monitor",
              dry_run: true,
            }),
          });

          let verifyPayload: Record<string, unknown> = {};
          try { verifyPayload = await verifyResponse.json(); } catch { verifyPayload = {}; }
          verification = {
            http_status: verifyResponse.status,
            ...verifyPayload,
          };

          if (!verifyResponse.ok || verifyPayload.status !== "dry_run") {
            status = "monitor_error";
            reason = "verification_request_failed";
          } else {
            const inserted = Number(verifyPayload.inserted || 0);
            const updated = Number(verifyPayload.updated || 0);
            const deleted = Number(verifyPayload.deleted || 0);
            const pending = inserted + updated + deleted;
            const memoError = String(verifyPayload.memo_sync_error || "");

            if (pending > 0) {
              status = "alert";
              reason = "unapplied_schedule_changes";
            } else if (
              verifyPayload.memo_content_synced !== true ||
              verifyPayload.memo_history_synced !== true ||
              memoError
            ) {
              status = "alert";
              reason = "memo_sync_issue";
            }
          }
        } catch {
          status = "monitor_error";
          reason = "verification_exception";
        }
      }
    }

    const details: Record<string, unknown> = {
      trigger,
      checked_at: new Date().toISOString(),
      batch: batch ? {
        id: batch.id,
        started_at: batch.started_at,
        finished_at: batch.finished_at,
        status: batch.status,
        source_rows: batch.source_rows,
        inserted_rows: batch.inserted_rows,
        updated_rows: batch.updated_rows,
        deleted_rows: batch.deleted_rows,
        error_code: batch.error_code,
        details: batch.details,
      } : null,
      verification,
    };

    let notificationStatus: "not_needed" | "sent" | "skipped_unconfigured" | "failed" = "not_needed";
    let notifiedAt: string | null = null;

    if (status !== "ok") {
      if (!config.discord_webhook_url) {
        notificationStatus = "skipped_unconfigured";
      } else {
        const verify = verification || {};
        const inserted = Number(verify.inserted || 0);
        const updated = Number(verify.updated || 0);
        const deleted = Number(verify.deleted || 0);
        const lines = [
          "🚨 **mir.yeop.net 일정표 자동 점검 이상 감지**",
          `- 점검 시각: ${fmtKst(new Date().toISOString())} KST`,
          `- 사유: ${reason || status}`,
          `- 최근 배치: ${batch ? `#${batch.id} / ${batch.status} / ${fmtKst(batch.started_at)} KST` : "확인되지 않음"}`,
        ];
        if (verification) {
          lines.push(`- 미반영 후보: 신규 ${inserted} / 수정 ${updated} / 삭제 ${deleted}`);
        }
        if (batch?.error_code) lines.push(`- 배치 오류: ${batch.error_code}`);
        lines.push("- 확인 대상: https://mir.yeop.net/schedule");

        const sent = await sendDiscord(config.discord_webhook_url, lines.join("\n"));
        notificationStatus = sent ? "sent" : "failed";
        if (sent) notifiedAt = new Date().toISOString();
      }
    }

    const { error: logError } = await admin.from("schedule_monitor_runs").insert({
      batch_started_at: batch?.started_at || null,
      batch_run_id: batch?.id || null,
      status,
      reason,
      details,
      notification_status: notificationStatus,
      notified_at: notifiedAt,
    });

    if (logError) {
      return jsonResponse({
        error: "monitor_log_write_failed",
        status,
        reason,
        notification_status: notificationStatus,
      }, 503);
    }

    return jsonResponse({
      status,
      reason,
      notification_status: notificationStatus,
      batch_run_id: batch?.id || null,
      verification,
    }, status === "ok" ? 200 : 207);
  }),
};
