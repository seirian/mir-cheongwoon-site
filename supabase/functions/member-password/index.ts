import { createPasswordHandler } from './handler.mjs';

Deno.serve(createPasswordHandler({
  url: Deno.env.get('SUPABASE_URL') || '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
}));
