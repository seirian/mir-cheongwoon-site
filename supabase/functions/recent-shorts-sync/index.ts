import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createShortsSyncHandler } from "./handler.mjs";

// JWT verification is disabled only because this endpoint validates its own cron token.
Deno.serve(createShortsSyncHandler({
  createClient,
  url: Deno.env.get("SUPABASE_URL") || "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
}));
