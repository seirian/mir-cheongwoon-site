import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, Images, PlaySquare, Smartphone } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHero from '../components/PageHero';
import EmptyVisual from '../components/EmptyVisual';
import ShortsArchive from '../components/ShortsArchive';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { getYouTubeEmbedUrl } from '../lib/youtube';

const MIR_YOUTUBE_VIDEOS_URL = 'https://www.youtube.com/@%EB%AF%B8%EB%A5%B4MIR/videos';

export default function GalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [galleries, setGalleries] = useState([]);
  const [coverVideos, setCoverVideos] = useState([]);
  const [recentVideos, setRecentVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const requestedView = searchParams.get('view');
  const activeView = ['shorts', 'gallery'].includes(requestedView) ? requestedView : 'video';

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const [galleryResult, coverVideoResult, recentVideoResult] = await Promise.all([
        supabase.from('galleries').select('*, gallery_images(id, file_path, sort_order)').order('event_date', { ascending: false }),
        supabase.from('videos').select('*').order('created_at', { ascending: false }),
        supabase.from('recent_videos').select('video_id,title,youtube_url,position,synced_at').order('position', { ascending: true }).limit(2),
      ]);

      setGalleries(galleryResult.data || []);
      setCoverVideos(coverVideoResult.data || []);
      setRecentVideos(recentVideoResult.data || []);
      setLoading(false);
    }

    load();
  }, []);

  const publicUrl = (path) => supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl;
  const selectView = (view) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (view === 'video') next.delete('view');
    else next.set('view', view);
    return next;
  });

  const renderVideoCard = (video, key) => {
    const embedUrl = getYouTubeEmbedUrl(video.youtube_url);
    return (
      <article className="video-gallery-card" key={key}>
        <div className="video-gallery-frame">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={video.title}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="video-invalid"><PlaySquare size={38} /><span>영상을 불러올 수 없습니다.</span></div>
          )}
        </div>
        <div className="video-gallery-caption">
          <span>YOUTUBE</span>
          <h2>{video.title}</h2>
        </div>
      </article>
    );
  };

  return (
    <>
      <PageHero eyebrow="MEDIA ARCHIVE" title="영상 및 갤러리" description="미르와 청운밴드의 영상, 쇼츠와 공연 사진을 한곳에서 모아보는 아카이브입니다." />
      <section className="section-wrap media-archive-section">
        {!isSupabaseConfigured && <div className="setup-banner">Supabase 연결 전입니다. <code>.env</code> 설정 후 관리자에서 콘텐츠를 등록해 주세요.</div>}

        <div className="media-subnav media-subnav-three" role="tablist" aria-label="영상, 쇼츠 및 갤러리 구분">
          <button type="button" role="tab" aria-selected={activeView === 'video'} className={activeView === 'video' ? 'active' : ''} onClick={() => selectView('video')}>
            <PlaySquare size={18} /> 영상
          </button>
          <button type="button" role="tab" id="media-shorts-tab" aria-controls="media-shorts-panel" aria-selected={activeView === 'shorts'} className={activeView === 'shorts' ? 'active' : ''} onClick={() => selectView('shorts')}>
            <Smartphone size={18} /> 쇼츠
          </button>
          <button type="button" role="tab" aria-selected={activeView === 'gallery'} className={activeView === 'gallery' ? 'active' : ''} onClick={() => selectView('gallery')}>
            <Images size={18} /> 갤러리
          </button>
        </div>

        {activeView === 'shorts' ? <ShortsArchive /> : loading ? <div className="loading">콘텐츠를 불러오는 중...</div> : activeView === 'video' ? (
          <div className="video-archive-groups">
            <section className="video-archive-group" aria-labelledby="recent-videos-heading">
              <div className="video-archive-group-head">
                <div>
                  <span className="video-archive-kicker" id="recent-videos-heading">Recent Videos</span>
                  <p>미르님 공식 채널의 최신 동영상 2개를 매일 자정 기준으로 확인합니다.</p>
                </div>
                <a className="video-channel-link" href={MIR_YOUTUBE_VIDEOS_URL} target="_blank" rel="noreferrer">
                  미르님 채널 영상 <ExternalLink size={14} />
                </a>
              </div>

              {recentVideos.length ? (
                <div className="video-gallery-grid">
                  {recentVideos.map((video) => renderVideoCard(video, `recent-${video.video_id}`))}
                </div>
              ) : (
                <div className="video-section-empty"><PlaySquare size={28}/><span>최신 채널 영상을 불러오는 중입니다.</span></div>
              )}
            </section>

            <section className="video-archive-group" aria-labelledby="cover-videos-heading">
              <div className="video-archive-group-head">
                <div>
                  <span className="video-archive-kicker" id="cover-videos-heading">Cover Videos</span>
                  <p>기존에 등록된 미르님의 커버 영상을 모아봅니다.</p>
                </div>
              </div>

              {coverVideos.length ? (
                <div className="video-gallery-grid">
                  {coverVideos.map((video) => renderVideoCard(video, `cover-${video.id}`))}
                </div>
              ) : (
                <div className="empty-state"><PlaySquare size={42}/><h2>등록된 영상이 없습니다.</h2><p>관리자 페이지에서 YouTube 영상을 등록할 수 있습니다.</p></div>
              )}
            </section>
          </div>
        ) : galleries.length ? (
          <div className="gallery-grid">
            {galleries.map((gallery) => {
              const images = [...(gallery.gallery_images || [])].sort((a,b) => a.sort_order - b.sort_order);
              const cover = gallery.cover_path || images[0]?.file_path;
              return (
                <Link to={`/gallery/view?id=${encodeURIComponent(gallery.id)}`} className="gallery-card" key={gallery.id}>
                  {cover ? <img src={publicUrl(cover)} alt={gallery.title} /> : <EmptyVisual label="공연 대표 이미지" className="gallery-cover-empty" />}
                  <div className="gallery-overlay"><span>{gallery.event_date || 'DATE'}</span><h2>{gallery.title}</h2><p>{gallery.description}</p><b>사진 보기 <ArrowRight size={16}/></b></div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-state"><Images size={42}/><h2>등록된 갤러리가 없습니다.</h2><p>관리자 페이지에서 공연별 갤러리를 만들 수 있습니다.</p></div>
        )}
      </section>
    </>
  );
}
