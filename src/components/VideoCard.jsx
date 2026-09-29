import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { canonicalVideoUrl } from '../lib/promotion';
import { getYouTubeVideoId } from '../lib/youtube';

export default function VideoCard({ video, compact = false }) {
  const [playing, setPlaying] = useState(false);
  const url = canonicalVideoUrl(video?.youtube_url);
  const id = getYouTubeVideoId(url);
  if (!url) return <p className="promo-empty">공식 영상 링크를 준비 중입니다.</p>;
  return <article className={`promo-video${compact ? ' is-compact' : ''}`}>
    <div className="promo-video-frame">
      {playing ? <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`} title={video.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> :
        <button type="button" className="promo-play" onClick={() => setPlaying(true)} aria-label={`${video.title} 재생`}>
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" width="480" height="360" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
          <span className="promo-play-icon"><Play size={24} fill="currentColor" /></span>
          <span className="promo-video-source">공식 YouTube · 클릭하여 재생</span>
        </button>}
    </div>
    <div className="promo-video-caption"><h3>{video.title}</h3><a href={url} target="_blank" rel="noopener noreferrer">YouTube에서 보기 <ExternalLink size={14} /></a></div>
  </article>;
}
