import { useEffect, useState } from 'react';
import { ExternalLink, Plus, Trash2, Video } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getYouTubeEmbedUrl, getYouTubeVideoId } from '../lib/youtube';

export default function VideoManager({ onMessage }) {
  const [videos, setVideos] = useState([]);
  const [form, setForm] = useState({ title: '', youtube_url: '' });
  const [saving, setSaving] = useState(false);

  const loadVideos = async () => {
    const { data, error } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
    if (error) return onMessage(error.message);
    setVideos(data || []);
  };

  useEffect(() => { loadVideos(); }, []);

  const createVideo = async (event) => {
    event.preventDefault();
    onMessage('');

    const title = form.title.trim();
    const youtubeUrl = form.youtube_url.trim();
    if (!getYouTubeVideoId(youtubeUrl)) {
      onMessage('유효한 YouTube 링크를 입력해 주세요.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('videos').insert({ title, youtube_url: youtubeUrl });
    setSaving(false);

    if (error) {
      if (error.code === '23505') return onMessage('이미 등록된 YouTube 영상입니다.');
      return onMessage(error.message);
    }

    setForm({ title: '', youtube_url: '' });
    onMessage('영상을 등록했습니다.');
    loadVideos();
  };

  const deleteVideo = async (video) => {
    if (!confirm(`“${video.title}” 영상을 삭제할까요?`)) return;
    const { error } = await supabase.from('videos').delete().eq('id', video.id);
    if (error) return onMessage(error.message);
    onMessage('영상을 삭제했습니다.');
    loadVideos();
  };

  return (
    <div className="admin-layout admin-tab-panel video-admin-layout">
      <form className="admin-card video-admin-form" onSubmit={createVideo}>
        <div className="admin-card-title"><Video /> 새 영상</div>
        <label>
          영상 제목
          <input
            value={form.title}
            maxLength={200}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
          />
        </label>
        <label>
          YouTube 링크
          <input
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={form.youtube_url}
            onChange={(event) => setForm({ ...form, youtube_url: event.target.value })}
            required
          />
        </label>
        <p className="video-admin-help">일반 영상, youtu.be, Shorts, Live 링크를 사용할 수 있습니다.</p>
        <button className="btn btn-primary" disabled={saving}><Plus size={17}/>{saving ? '등록 중...' : '영상 등록'}</button>
      </form>

      <div className="admin-list">
        <div className="admin-topbar"><div><h2>등록된 영상</h2><p>영상 제목과 YouTube 링크만 관리합니다.</p></div></div>
        {videos.length === 0 ? <div className="empty-state"><p>등록된 영상이 없습니다.</p></div> : videos.map((video) => {
          const embedUrl = getYouTubeEmbedUrl(video.youtube_url);
          return (
            <article className="admin-gallery video-admin-item" key={video.id}>
              {embedUrl && (
                <div className="video-admin-preview">
                  <iframe
                    src={embedUrl}
                    title={video.title}
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              )}
              <div className="admin-gallery-head">
                <div>
                  <span>YOUTUBE</span>
                  <h3>{video.title}</h3>
                  <a className="video-admin-link" href={video.youtube_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> 원본 영상 열기</a>
                </div>
                <button type="button" className="icon-danger" onClick={() => deleteVideo(video)} title="영상 삭제"><Trash2/></button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
