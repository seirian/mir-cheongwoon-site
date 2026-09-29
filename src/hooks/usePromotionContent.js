import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function usePromotionContent() {
  const [state, setState] = useState({ covers: [], recent: [], loading: Boolean(supabase), error: false });
  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    Promise.all([
      supabase.from('videos').select('id,title,youtube_url').order('created_at', { ascending: false }).limit(100).abortSignal(controller.signal),
      supabase.from('recent_videos').select('video_id,title,youtube_url,position,synced_at').order('position', { ascending: true }).limit(2).abortSignal(controller.signal),
    ]).then(([covers, recent]) => {
      if (active) setState({ covers: covers.data || [], recent: recent.data || [], loading: false, error: Boolean(covers.error || recent.error) });
    }).catch(() => { if (active) setState({ covers: [], recent: [], loading: false, error: true }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);
  return state;
}
