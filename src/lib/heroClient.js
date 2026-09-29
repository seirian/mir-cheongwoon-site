import { createClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { IS_REVIEW_PREVIEW } from './preview';
import { createHeroPreviewFetch } from './heroImage';

// Normal builds recognize the site's existing login. Review login is isolated:
// it cannot inherit a production session or unlock the other review pages.
export const heroClient = !isSupabaseConfigured ? null : IS_REVIEW_PREVIEW
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { storageKey: 'mir-hero-review-v2', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createHeroPreviewFetch(import.meta.env.VITE_SUPABASE_URL, globalThis.fetch.bind(globalThis)) },
  }) : supabase;
