import { createClient } from '@supabase/supabase-js';
import { IS_REVIEW_PREVIEW } from './preview';
import { createReadOnlyFetch } from './previewFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, IS_REVIEW_PREVIEW ? {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mir-readonly-review' },
    global: { fetch: createReadOnlyFetch(globalThis.fetch.bind(globalThis)) },
  } : {})
  : null;
