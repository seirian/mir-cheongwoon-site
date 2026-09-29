import { createClient } from '@supabase/supabase-js';
import { IS_REVIEW_PREVIEW } from './preview';

// A separate, memory-only Auth client. It must never replace the main login session.
export function createPasswordVerificationClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (IS_REVIEW_PREVIEW || !url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey: `mir-password-verification-${crypto.randomUUID()}`,
    },
  });
}
