import { useEffect, useState } from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getYouTubeEmbedUrl } from '../lib/youtube';
import '../shorts-gallery.css';

const CHANNEL_SHORTS_URL = 'https://www.youtube.com/@%EB%AF%B8%EB%A5%B4MIR/shorts';

export default function ShortsArchive() {
  const [shorts, setShorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        if (!supabase) throw new Error('not_configured');
        const { data, error: queryError } = await supabase.from('recent_shorts')
          .select('video_id,title,youtube_url,position,synced_at')
          .order('position', { ascending: true }).limit(10);
        if (queryError) throw queryError;
        if (active) setShorts((data || []).filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.video_id || '')).slice(0, 10));
      } catch {
        if (active) setError('쇼츠 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [attempt]);

  return (
    <section className="shorts-archive" role="tabpanel" id="media-shorts-panel" aria-labelledby="media-shorts-tab">
      <div className="video-archive-group-head">
        <div>
          <span className="video-archive-kicker">Latest Shorts</span>
          <p>미르님 공식 채널의 최신 쇼츠 10개를 모아봅니다. 매일 00:00(KST)에 최신순으로 갱신됩니다.</p>
        </div>
        <a className="video-channel-link" href={CHANNEL_SHORTS_URL} target="_blank" rel="noreferrer">
          미르님 채널 쇼츠 <ExternalLink size={14} />
        </a>
      </div>
      {loading ? <div className="loading" role="status">쇼츠를 불러오는 중...</div> : error ? (
        <div className="shorts-message" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-ghost" onClick={() => setAttempt((n) => n + 1)}>다시 시도</button>
        </div>
      ) : shorts.length ? (
        <div className="shorts-gallery-grid">
          {shorts.map((video) => (
            <article className="video-gallery-card shorts-card" key={video.video_id} data-video-id={video.video_id}>
              <div className="shorts-gallery-frame">
                <iframe src={`${getYouTubeEmbedUrl(`https://www.youtube.com/shorts/${video.video_id}`)}?playsinline=1`}
                  title={video.title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
              </div>
              <div className="video-gallery-caption shorts-caption">
                <span>YOUTUBE SHORTS</span>
                <h2>{video.title}</h2>
                <a className="shorts-external-link" href={`https://www.youtube.com/shorts/${video.video_id}`} target="_blank" rel="noreferrer">
                  YouTube에서 보기 <ExternalLink size={13} />
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><Smartphone size={42}/><h2>등록된 쇼츠가 없습니다.</h2><p>채널 쇼츠가 동기화되면 이곳에 표시됩니다.</p></div>
      )}
    </section>
  );
}
