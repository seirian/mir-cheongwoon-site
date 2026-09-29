import { ArrowUpRight, Music2, Radio, Sparkles } from 'lucide-react';
import { editorialPicks } from '../data/promotionData';
import { mirProfile } from '../data/siteData';
import { selectEditorialVideo } from '../lib/promotion';
import VideoCard from './VideoCard';

export default function StartHere({ covers = [], recent = [], loading = false, error = false }) {
  const channel = mirProfile.channels.find(({ label }) => label === 'YouTube').url;
  const icons = [Sparkles, Music2, Radio];
  return <section className="section-wrap promo-section" id="start-here" aria-labelledby="start-here-title">
    <div className="promo-section-head"><div><span className="eyebrow">START HERE</span><h2 id="start-here-title">처음 만나는 미르의 세 가지 장면</h2></div><p>목소리부터 무대, 그리고 방송까지.<br />마음에 드는 장면에서 시작해 보세요.</p></div>
    {error && <p className="promo-inline-note" role="status">일부 영상을 불러오지 못했습니다. 공식 채널에서도 감상할 수 있어요.</p>}
    <div className="promo-picks">{editorialPicks.map((pick, index) => {
      const video = selectEditorialVideo(pick, covers, recent);
      const Icon = icons[index];
      return <div className="promo-pick" key={pick.id}>
        <div className="promo-pick-intro"><span className="eyebrow">{pick.eyebrow}</span><h3><Icon size={20} />{pick.title}</h3><p>{pick.description}</p></div>
        {video ? <VideoCard video={video} compact /> : <div className="promo-pick-fallback"><Icon size={34} aria-hidden="true"/><p>{loading ? '공식 영상을 불러오는 중…' : '공식 채널에서 이어서 감상하세요.'}</p><a className="btn btn-ghost" href={`${channel}/${pick.fallbackPath}`} target="_blank" rel="noopener noreferrer">{pick.fallbackLabel}<ArrowUpRight size={16}/></a></div>}
      </div>;
    })}</div>
  </section>;
}
