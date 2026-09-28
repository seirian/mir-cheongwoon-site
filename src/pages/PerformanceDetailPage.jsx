import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, MapPin, Music2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { performances } from '../data/promotionData';
import { mirProfile } from '../data/siteData';
import { canonicalVideoUrl, safeExternalUrl } from '../lib/promotion';
import { supabase } from '../lib/supabase';
import ShareLink from '../components/ShareLink';
import VideoCard from '../components/VideoCard';
import PageHero from '../components/PageHero';

export default function PerformanceDetailPage() {
  const { slug } = useParams();
  const event = performances.find((item) => item.slug === slug);
  const [galleryState, setGalleryState] = useState({ galleries: [], loading: false, error: false });
  useEffect(() => {
    if (!event || !supabase) return undefined;
    let active = true; const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    setGalleryState({ galleries: [], loading: true, error: false });
    supabase.from('galleries').select('id,title,event_date,description,cover_path,gallery_images(id,file_path,sort_order)').eq('event_date', event.dateKey).limit(12).abortSignal(controller.signal)
      .then(({ data, error }) => { if (active) setGalleryState({ galleries: data || [], loading: false, error: Boolean(error) }); })
      .catch(() => { if (active) setGalleryState({ galleries: [], loading: false, error: true }); }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [event]);
  if (!event) return <section className="section-wrap promo-section"><h1>공연 기록을 찾을 수 없습니다.</h1><Link className="btn btn-ghost" to="/history">공연 이력으로 돌아가기</Link></section>;
  const shareUrl = window.location.href.split(/[?#]/)[0];
  return <>
    <PageHero eyebrow={`${event.date} / ${event.type}`} title={event.shortTitle} description={event.title}/>
    <section className="section-wrap promo-section performance-overview">
      <Link className="promo-text-link" to="/history"><ArrowLeft size={16}/>전체 공연 이력</Link>
      <div className="performance-story"><div><span className="eyebrow">THE STORY</span><h2>이 무대의 이야기</h2><p>{event.story || event.description}</p>{event.venue && <p className="promo-text-link"><MapPin size={16}/>{event.venue}</p>}<p className="promo-inline-note">기존 팬 아카이브의 공연 기록을 기준으로 정리했습니다.</p></div><aside><span className="eyebrow">KEEP THIS MOMENT</span><h3>이 무대를 소개해 주세요</h3><p>공연별 주소로 기록을 바로 공유할 수 있습니다.</p><ShareLink title={event.title} url={shareUrl}/></aside></div>
      <nav className="performance-jump" aria-label="공연 상세 바로가기"><a href="#credits">참여 정보</a><a href="#songs">공개 곡·영상</a><a href="#performance-photos">사진 기록</a></nav>
    </section>
    <section className="section-wrap promo-section" id="credits"><div className="promo-section-head"><div><span className="eyebrow">ON THIS STAGE</span><h2>함께한 아티스트</h2></div></div><div className="performance-credits"><Link to="/mir"><strong>미르</strong><span>보컬 · 버추얼 아티스트<ArrowRight size={16}/></span></Link>{event.bandCredit && <Link to="/band"><strong>청운밴드</strong><span>밴드 세션<ArrowRight size={16}/></span></Link>}</div>
      {event.memberNames.length ? <p>{event.memberNames.join(' · ')}</p> : <p className="promo-inline-note">공연별 개별 세션 참여 명단은 확인 후 추가합니다. 현재 멤버 소개와 당시 참여 이력을 동일하게 간주하지 않습니다.</p>}
    </section>
    <section className="section-wrap promo-section" id="songs"><div className="promo-section-head"><div><span className="eyebrow">SONGS & RECORDINGS</span><h2>공개 곡과 영상</h2></div></div>
      {event.recordings.length > 0 && <div className="promo-recent">{event.recordings.map((video) => <VideoCard key={video.youtube_url} video={video}/>)}</div>}
      {event.songs.length ? <div className="performance-songs">{event.songs.map((song) => <article key={song.title}><Music2 size={19}/><div><h3>{song.title}</h3><small>{song.originalArtist ? `원곡: ${song.originalArtist}` : '공연 소개에서 확인된 곡'}</small></div>{canonicalVideoUrl(song.youtubeUrl, song.seconds) ? <a className="btn btn-ghost" href={canonicalVideoUrl(song.youtubeUrl, song.seconds)} target="_blank" rel="noopener noreferrer">{Number.isInteger(song.seconds) ? `${Math.floor(song.seconds / 60)}:${String(song.seconds % 60).padStart(2, '0')}부터 보기` : '공식 영상 보기'}<ExternalLink size={14}/></a> : <span className="promo-inline-note">이 공연의 영상 링크 확인 중</span>}</article>)}</div> : <div className="promo-empty"><Music2 size={30}/><p>이 공연의 세트리스트와 곡별 영상 정보를 확인하고 있습니다.</p></div>}
      <p className="promo-inline-note">공개 곡 목록은 전체 세트리스트나 공연 순서를 뜻하지 않습니다. 확인되지 않은 영상·타임스탬프는 표시하지 않습니다.</p>
      <a className="promo-text-link" href={mirProfile.channels.find(({ label }) => label === 'YouTube').url} target="_blank" rel="noopener noreferrer">미르 공식 YouTube 채널<ExternalLink size={14}/></a>
    </section>
    <section className="section-wrap promo-section" id="performance-photos"><div className="promo-section-head"><div><span className="eyebrow">PHOTO ARCHIVE</span><h2>사진으로 남은 순간</h2></div><Link className="promo-text-link" to="/gallery?view=gallery">전체 사진 기록<ArrowRight size={16}/></Link></div>
      {galleryState.loading ? <p className="promo-empty" role="status">사진 기록을 불러오는 중…</p> : galleryState.error ? <p className="promo-empty" role="status">사진 기록을 불러오지 못했습니다. 전체 갤러리에서 다시 확인해 주세요.</p> : galleryState.galleries.length ? <div className="promo-recent">{galleryState.galleries.map((gallery) => {
        const images = [...(gallery.gallery_images || [])].sort((a, b) => a.sort_order - b.sort_order);
        const path = gallery.cover_path || images[0]?.file_path;
        const url = path ? safeExternalUrl(supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl) : '';
        return <Link className="performance-photo-card" to={`/gallery/view?id=${encodeURIComponent(gallery.id)}`} key={gallery.id}>{url && <img src={url} alt={`${gallery.title} 갤러리 대표 사진`} loading="lazy"/>}<h3>{gallery.title}</h3><span>사진 보기<ArrowRight size={16}/></span></Link>;
      })}</div> : <p className="promo-empty">연결된 사진 갤러리를 준비 중입니다.</p>}
    </section>
  </>;
}
