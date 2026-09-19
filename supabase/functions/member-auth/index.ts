import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const normalizeUsername = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const validUsername = (value: string) =>
  /^[a-z0-9_.-]{4,24}$/.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anonKey || !serviceKey) return json({ error: "auth_unavailable" }, 503);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const action = String(body.action ?? "");
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (action === "username-available") {
    const username = normalizeUsername(body.username);
    if (!validUsername(username)) return json({ available: false, error: "invalid_username" }, 400);
    const { data, error } = await admin
      .from("member_profiles")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();
    if (error) return json({ error: "lookup_failed" }, 503);
    return json({ available: !data });
  }

  if (action !== "login") return json({ error: "invalid_action" }, 400);

  const identifier = String(body.identifier ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!identifier || password.length < 1 || password.length > 256) {
    return json({ error: "invalid_credentials" }, 401);
  }

  let email = identifier;
  if (!identifier.includes("@")) {
    if (!validUsername(identifier)) return json({ error: "invalid_credentials" }, 401);
    const { data, error } = await admin
      .from("member_profiles")
      .select("email")
      .eq("username", identifier)
      .maybeSingle();
    if (error) return json({ error: "auth_unavailable" }, 503);
    if (!data?.email) return json({ error: "invalid_credentials" }, 401);
    email = String(data.email).toLowerCase();
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    const emailNotConfirmed = String(error?.message || "").toLowerCase().includes("email not confirmed");
    return json({ error: emailNotConfirmed ? "email_not_confirmed" : "invalid_credentials" }, 401);
  }

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    user_id: data.user?.id ?? null,
  });
});
