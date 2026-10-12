import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { evaluateFanart, unavailableFanart, fanartMessage, kstClock, safeEqual, notificationPlan } from "./policy.mjs";

const ENDPOINT = "https://mir.yeop.net/api/naver-fanart-daily.php";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function readStatus(): Promise<any> {
  const result = await fetch(ENDPOINT + "?status=1", {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error("fanart_status_http_" + result.status);
  return await result.json();
}
async function inspect(mode: string): Promise<any> {
  try { return evaluateFanart(await readStatus(), mode, Date.now()); }
  catch (error) {
    const code = error instanceof Error && /^fanart_[a-z0-9_]+$/.test(error.message)
      ? error.message : "fanart_status_unavailable";
    return unavailableFanart(code, Date.now());
  }
}

// Atomic INSERT / compare-and-set UPDATE prevents concurrent ticks from sending the same phase.
// Ambiguous HTTP delivery is recorded as unknown and is NOT blindly retried.
async function notify(admin: any, webhook: string | null, decision: any, phase: string, allowNew: boolean): Promise<string> {
  const date = decision.date;
  const { data: old, error: readError } = await admin.from("fanart_recovery_notifications")
    .select("delivery,attempt,updated_at,outcome").eq("batch_date", date).eq("phase", phase).maybeSingle();
  if (readError) throw new Error("notification_read_failed");
  if (!old && !allowNew) return "not_requested";
  if (old && (old.delivery !== "failed" || old.attempt >= 3 || Date.now() - Date.parse(old.updated_at) < 1800000)) return old.delivery;
  if (!webhook) return "unconfigured";
  let url: URL;
  try { url = new URL(webhook); } catch { return "unconfigured"; }
  if (url.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(url.hostname)
      || !/^\/api\/webhooks\/\d+\//.test(url.pathname)) return "unconfigured";
  url.searchParams.set("wait", "true");
  const attempt = old ? old.attempt + 1 : 1;
  const message = fanartMessage(decision, phase);
  const row = { batch_date: date, phase, outcome: decision.outcome, delivery: "sending", attempt,
    updated_at: new Date().toISOString(), details: { message, retry: decision.retry, reason: decision.reason } };
  const claim = old
    ? await admin.from("fanart_recovery_notifications").update(row).eq("batch_date", date).eq("phase", phase)
      .eq("delivery", "failed").eq("attempt", old.attempt).select("attempt")
    : await admin.from("fanart_recovery_notifications").insert(row).select("attempt");
  if (claim.error?.code === "23505" || (!claim.error && !claim.data?.length)) return "claimed_elsewhere";
  if (claim.error) throw new Error("notification_claim_failed");
  let delivery = "unknown"; let messageId: string | null = null;
  try {
    const result = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(10000) });
    if (result.ok) {
      delivery = "sent";
      try { messageId = String((await result.json()).id || "") || null; } catch { /* HTTP success is sufficient. */ }
    } else if (result.status >= 400 && result.status < 500) delivery = "failed";
    // Timeouts/network failures/5xx are ambiguous: preserve unknown to avoid duplicate messages.
  } catch { /* No webhook/token/error body is logged or returned. */ }
  const saved = await admin.from("fanart_recovery_notifications").update({ delivery, message_id: messageId,
    updated_at: new Date().toISOString() }).eq("batch_date", date).eq("phase", phase).eq("attempt", attempt).eq("delivery", "sending");
  if (saved.error) throw new Error("notification_save_failed");
  return delivery;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  const supplied = req.headers.get("x-fanart-recovery-token") || "";
  if (!supplied) return response({ error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return response({ error: "service_unavailable" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const config = await admin.from("schedule_monitor_config").select("monitor_token,discord_webhook_url").eq("id", 1).single();
    if (config.error) return response({ error: "config_unavailable" }, 503);
    if (!safeEqual(supplied, config.data.monitor_token)) return response({ error: "unauthorized" }, 401);
    let body: any;
    try { body = await req.json(); } catch { return response({ error: "invalid_body" }, 400); }
    if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some(k => !["mode", "dry_run"].includes(k))
        || !["tick", "initial", "final"].includes(body.mode)
        || (body.dry_run !== undefined && typeof body.dry_run !== "boolean")) return response({ error: "invalid_body" }, 400);
    const mode = body.mode;
    const clock = kstClock();
    if (clock.minutes < 65 || (mode === "final" && clock.minutes < 23 * 60 + 55)) return response({ status: "not_due" });
    let decision = await inspect(mode);
    if (body.dry_run === true) return response({ dry_run: true, decision,
      message: fanartMessage(decision, mode === "initial" ? "initial" : "final") });
    let dispatched = false;
    if (decision.mayRun) {
      dispatched = true;
      try {
        // One fixed-source request only. PHP rechecks the lock/backoff/attempt budget atomically.
        const result = await fetch(ENDPOINT, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(55000) });
        await result.body?.cancel();
      } catch { /* Read actual persisted state; a timeout is not proof that collection failed. */ }
      decision = await inspect(mode);
      if (decision.date !== clock.date) return response({ status: "date_changed" });
    }
    const saved = await admin.from("fanart_recovery_state").upsert({ batch_date: decision.date,
      checked_at: new Date().toISOString(), outcome: decision.outcome, details: { ...decision, dispatched, mode } });
    if (saved.error) throw new Error("state_save_failed");
    const initial = await admin.from("fanart_recovery_notifications").select("outcome,delivery")
      .eq("batch_date", decision.date).eq("phase", "initial").maybeSingle();
    if (initial.error) throw new Error("notification_read_failed");
    const phase = notificationPlan(decision, mode, initial.data);
    const notification = phase
      ? await notify(admin, config.data.discord_webhook_url, decision, phase, true) : "not_required";
    return response({ status: decision.outcome, dispatched, notification, retry: decision.retry });
  } catch {
    return response({ error: "fanart_recovery_failed" }, 503);
  }
});
