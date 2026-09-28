import { ArrowRight, ArrowUpRight, Music2, Play, Radio, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mirProfile } from '../data/siteData';
import { editorialPicks, featuredPerformance } from '../data/promotionData';
import { canonicalVideoUrl, selectEditorialVideo } from '../lib/promotion';
import usePromotionContent from '../hooks/usePromotionContent';
import useSoopStatus from '../hooks/useSoopStatus';
import StartHere from '../components/StartHere';
import UpcomingSchedule from '../components/UpcomingSchedule';
import OfficialChannels from '../components/OfficialChannels';
import VideoCard from '../components/VideoCard';
import CHEONGWOON_HERO_IMAGE from '../data/cheongwoonHeroImage';

export default function HomePage() {
  const content = usePromotionContent();
  const liveStatus = useSoopStatus();
  const stageVideo = selectEditorialVideo(editorialPicks[1], content.covers, content.recent);
  const stageUrl = canonicalVideoUrl(stageVideo?.youtube_url);
  const soop = mirProfile.channels.find(({ label }) => label === 'SOOP').url;
  const youtube = mirProfile.channels.find(({ label }) => label === 'YouTube').url;
  const statusLabel = { checking: '방송 상태 확인 중', live: '지금 SOOP에서 방송 중', offline: '다음 방송은 공식 채널에서', unknown: '방송 상태 확인 불가 · 채널에서 확인' }[liveStatus];
  return <div className="promotion-home">
    <section className="promo-hero" aria-labelledby="home-title">
      <div className="promo-hero-copy">
        <span className="eyebrow"><Sparkles size={14}/> MIR × CHEONGWOON BAND</span>
        <h1 id="home-title">목소리와 연주가 만나<br/><em>하나의 무대</em>가<br className="promo-desktop-break"/> 되는 순간</h1>
        <p>버튜버 미르의 목소리, 청운밴드의 연주.<br/>함께 만든 음악과 무대의 기억을 만나보세요.</p>
        <div className="promo-hero-actions"><a className="btn promo-primary" href={stageUrl || `${youtube}/videos`} target="_blank" rel="noopener noreferrer"><Play size={17} fill="currentColor"/>{stageUrl ? '대표 라이브 보기' : '공식 라이브 둘러보기'}</a><a className="btn btn-ghost" href={soop} target="_blank" rel="noopener noreferrer">미르 방송 보러 가기<ArrowUpRight size={17}/></a></div>
        <a className={`promo-live-status ${liveStatus === 'live' ? 'is-live' : ''}`} href={soop} target="_blank" rel="noopener noreferrer"><span aria-hidden="true"/><span aria-live="polite">{statusLabel}</span></a>
        <Link className="promo-text-link promo-hero-archive" to="/history/blued-2025">미르와 청운밴드가 함께한 공연 기록<ArrowRight size={15}/></Link>
      </div>
      <figure className="promo-hero-art">
        <span className="promo-art-word" aria-hidden="true">MIR</span>
        <div className="promo-art-ring" aria-hidden="true"/>
        <img className="promo-mir-portrait" src={`${import.meta.env.BASE_URL}mir-profile-still.webp`} alt="청룡 버튜버 미르 캐릭터" width="548" height="574" fetchPriority="high" decoding="async"/>
        <figcaption><span>VIRTUAL VOICE. LIVE SOUND.</span><strong>미르 <b>×</b> 청운밴드</strong><small>노래로 만나, 무대로 이어지는 이야기</small></figcaption>
        <span className="promo-art-index" aria-hidden="true">MIR / CHEONGWOON<br/>FAN ARCHIVE</span>
      </figure>
    </section>
    <div className="section-wrap promo-intro-line"><span><Radio size={16}/>방송에서 만나고</span><i aria-hidden="true"/><span><Music2 size={16}/>음악으로 가까워지고</span><i aria-hidden="true"/><span><Sparkles size={16}/>무대의 기억을 함께 남깁니다</span></div>
    <StartHere {...content}/>
    <section className="section-wrap promo-section" aria-labelledby="duo-title"><div className="promo-section-head"><div><span className="eyebrow">TWO STORIES, ONE STAGE</span><h2 id="duo-title">각자의 매력, 함께하는 음악</h2></div></div>
      <div className="promo-duo">
        <Link className="promo-artist-card" to="/mir"><div><span className="eyebrow">VIRTUAL ARTIST</span><h3>미르</h3><p>여러분의 수호신 청룡.<br/>노래, 소통, 게임으로 만나는 버추얼 아티스트.</p><b>미르 알아보기<ArrowRight size={16}/></b></div><img src={`${import.meta.env.BASE_URL}mir-profile-site.webp`} alt="" width="400" height="225" loading="lazy"/></Link>
        <Link className="promo-artist-card" to="/band"><div><span className="eyebrow">LIVE SESSION</span><h3>청운밴드</h3><p>미르와 함께 여름을 노래하는 동료.<br/>무대의 소리를 채우는 밴드와 멤버들.</p><b>밴드 만나보기<ArrowRight size={16}/></b></div><img src={CHEONGWOON_HERO_IMAGE} alt="" loading="lazy"/></Link>
      </div>
    </section>
    <UpcomingSchedule/>
    <section className="section-wrap promo-section" aria-labelledby="featured-stage-title"><div className="promo-section-head"><div><span className="eyebrow">A STAGE TO REMEMBER</span><h2 id="featured-stage-title">다시 꺼내 보는, 함께한 무대</h2></div><Link className="promo-text-link" to="/history">공연 이력 전체 보기<ArrowRight size={16}/></Link></div>
      <Link className="promo-featured-stage" to="/history/blued-2025"><div><span className="eyebrow">2025.08.09 · OFFLINE CONCERT</span><h3>BLUED<span>MIR THE 1ST OFFLINE CONCERT</span></h3><p>{featuredPerformance.story}</p><b>공연의 이야기와 기록 보기<ArrowRight size={18}/></b></div><div className="promo-stage-ticket" aria-hidden="true"><span>SEOUL / NSP HALL</span><strong>08<span>09</span></strong><small>MIR × CHEONGWOON BAND</small></div></Link>
    </section>
    <section className="section-wrap promo-section" aria-labelledby="home-recent-title"><div className="promo-section-head"><div><span className="eyebrow">LATEST FROM MIR</span><h2 id="home-recent-title">그리고, 요즘의 미르</h2></div><Link className="promo-text-link" to="/gallery">영상 아카이브<ArrowRight size={16}/></Link></div><p className="promo-inline-note">입문 추천과 별도로, 공식 채널에서 갱신된 최신 영상입니다.</p>
      {content.recent.length ? <div className="promo-recent">{content.recent.map((video) => <VideoCard key={video.video_id || video.id || video.youtube_url} video={video}/>)}</div> : <div className="promo-empty"><p>{content.loading ? '최신 영상을 불러오는 중…' : '최신 영상은 공식 채널에서 확인해 주세요.'}</p><a className="btn btn-ghost" href={`${youtube}/videos`} target="_blank" rel="noopener noreferrer">YouTube 채널로 이동<ArrowUpRight size={16}/></a></div>}
    </section>
    <OfficialChannels/>
  </div>;
}
