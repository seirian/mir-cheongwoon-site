import { useEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function GalleryDetailPage() {
  const { id: pathId } = useParams();
  const [searchParams] = useSearchParams();
  const id = pathId || searchParams.get('id') || '';
  const [gallery, setGallery] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return; }
      const { data } = await supabase.from('galleries').select('*, gallery_images(*)').eq('id', id).single();
      setGallery(data || null); setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <div className="section-wrap loading">불러오는 중...</div>;
  if (!gallery) return <div className="section-wrap empty-state"><h2>갤러리를 찾을 수 없습니다.</h2><Link to="/gallery?view=gallery">목록으로</Link></div>;

  const images = [...(gallery.gallery_images || [])].sort((a,b) => a.sort_order - b.sort_order);
  const publicUrl = (path) => supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl;
  const visibleCaption = (caption) => {
    const text = String(caption || '').trim();
    if (!text) return '';
    return /^[^\/:*?"<>|]+\.(?:jpe?g|png|gif|webp|avif|bmp|heic|heif)$/i.test(text) ? '' : text;
  };

  return (
    <>
      <section className="gallery-detail-head section-wrap">
        <Link to="/gallery?view=gallery"><ArrowLeft size={16}/> 갤러리 목록</Link>
        <span className="eyebrow">{gallery.event_date}</span><h1>{gallery.title}</h1><p>{gallery.description}</p>
      </section>
      <section className="section-wrap photo-masonry">
        {images.map((image) => { const caption = visibleCaption(image.caption); return <button key={image.id} onClick={() => setSelected(image)}><img src={publicUrl(image.file_path)} alt={caption || gallery.title}/>{caption && <span>{caption}</span>}</button>; })}
      </section>
      {selected && (() => { const caption = visibleCaption(selected.caption); return <div className="lightbox" role="dialog" onClick={() => setSelected(null)}><button className="lightbox-close"><X/></button><img src={publicUrl(selected.file_path)} alt={caption || gallery.title}/>{caption && <p>{caption}</p>}</div>; })()}
    </>
  );
}
