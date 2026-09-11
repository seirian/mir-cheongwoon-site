import { useEffect, useState } from 'react';
import { ArrowRight, Images } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero';
import EmptyVisual from '../components/EmptyVisual';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function GalleryPage() {
  const [galleries, setGalleries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return; }
      const { data } = await supabase.from('galleries').select('*, gallery_images(id, file_path, sort_order)').order('event_date', { ascending: false });
      setGalleries(data || []); setLoading(false);
    }
    load();
  }, []);

  const publicUrl = (path) => supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl;

  return (
    <>
      <PageHero eyebrow="PHOTO GALLERY" title="공연 갤러리" description="특정 콘서트와 공연을 하나의 앨범처럼 모아보는 공간입니다." />
      <section className="section-wrap">
        {!isSupabaseConfigured && <div className="setup-banner">Supabase 연결 전입니다. <code>.env</code> 설정 후 관리자에서 첫 갤러리를 생성해 주세요.</div>}
        {loading ? <div className="loading">갤러리를 불러오는 중...</div> : galleries.length ? (
          <div className="gallery-grid">
            {galleries.map((gallery) => {
              const images = [...(gallery.gallery_images || [])].sort((a,b) => a.sort_order - b.sort_order);
              const cover = gallery.cover_path || images[0]?.file_path;
              return (
                <Link to={`/gallery/${gallery.id}`} className="gallery-card" key={gallery.id}>
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
