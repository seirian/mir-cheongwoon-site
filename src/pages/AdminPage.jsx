import { useEffect, useState } from 'react';
import { CalendarDays, ImagePlus, Images, LogIn, LogOut, Plus, Trash2 } from 'lucide-react';
import PageHero from '../components/PageHero';
import ScheduleManager from '../components/ScheduleManager';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('gallery');
  const [galleries, setGalleries] = useState([]);
  const [message, setMessage] = useState('');
  const [login, setLogin] = useState({ email: '', password: '' });
  const [form, setForm] = useState({ title: '', event_date: '', description: '' });

  const loadGalleries = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('galleries').select('*, gallery_images(*)').order('event_date', { ascending: false });
    setGalleries(data || []);
  };

  const checkAdmin = async (currentSession) => {
    if (!supabase || !currentSession?.user) { setIsAdmin(false); return; }
    const { data } = await supabase.from('admins').select('user_id').eq('user_id', currentSession.user.id).maybeSingle();
    setIsAdmin(Boolean(data));
  };

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); checkAdmin(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); checkAdmin(next); });
    loadGalleries();
    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (e) => {
    e.preventDefault(); setMessage('');
    const { error } = await supabase.auth.signInWithPassword(login);
    setMessage(error ? error.message : '로그인했습니다.');
  };

  const createGallery = async (e) => {
    e.preventDefault(); setMessage('');
    const { error } = await supabase.from('galleries').insert(form);
    if (error) return setMessage(error.message);
    setForm({ title: '', event_date: '', description: '' }); setMessage('갤러리를 생성했습니다.'); loadGalleries();
  };

  const deleteGallery = async (gallery) => {
    if (!confirm(`“${gallery.title}” 갤러리를 삭제할까요?`)) return;
    const paths = (gallery.gallery_images || []).map((image) => image.file_path);
    if (paths.length) await supabase.storage.from('gallery').remove(paths);
    const { error } = await supabase.from('galleries').delete().eq('id', gallery.id);
    setMessage(error ? error.message : '갤러리를 삭제했습니다.'); loadGalleries();
  };

  const uploadImages = async (galleryId, files) => {
    if (!files?.length) return;
    setMessage('사진 업로드 중...');
    for (const file of [...files]) {
      const ext = file.name.split('.').pop();
      const path = `${galleryId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('gallery').upload(path, file, { cacheControl: '3600', upsert: false });
      if (uploadError) { setMessage(uploadError.message); return; }
      const { error: dbError } = await supabase.from('gallery_images').insert({ gallery_id: galleryId, file_path: path, caption: file.name });
      if (dbError) { setMessage(dbError.message); return; }
    }
    setMessage('사진 업로드가 완료되었습니다.'); loadGalleries();
  };

  const deleteImage = async (image) => {
    await supabase.storage.from('gallery').remove([image.file_path]);
    const { error } = await supabase.from('gallery_images').delete().eq('id', image.id);
    setMessage(error ? error.message : '사진을 삭제했습니다.'); loadGalleries();
  };

  if (!isSupabaseConfigured) return <><PageHero eyebrow="ADMIN" title="관리자" description="갤러리와 일정표를 관리하는 전용 화면입니다."/><section className="section-wrap"><div className="setup-banner">먼저 <code>.env</code>에 Supabase URL과 Anon Key를 설정해야 관리자 기능을 사용할 수 있습니다.</div></section></>;

  if (!session) return (
    <><PageHero eyebrow="ADMIN" title="관리자 로그인" description="허가된 관리자 계정만 콘텐츠를 수정할 수 있습니다." />
    <section className="section-wrap admin-narrow"><form className="admin-card login-form" onSubmit={signIn}><label>이메일<input type="email" value={login.email} onChange={(e)=>setLogin({...login,email:e.target.value})} required/></label><label>비밀번호<input type="password" value={login.password} onChange={(e)=>setLogin({...login,password:e.target.value})} required/></label><button className="btn btn-primary"><LogIn size={17}/> 로그인</button>{message && <p className="admin-message">{message}</p>}</form></section></>
  );

  if (!isAdmin) return <><PageHero eyebrow="ADMIN" title="접근 권한 없음" description="로그인은 되었지만 관리자 목록에 등록되지 않은 계정입니다."/><section className="section-wrap admin-narrow"><div className="admin-card"><p>Supabase의 <code>admins</code> 테이블에 현재 사용자 ID를 등록해 주세요.</p><button className="btn btn-ghost" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/> 로그아웃</button></div></section></>;

  return (
    <>
      <PageHero eyebrow="ADMIN" title="콘텐츠 관리" description="공연 갤러리와 2026년 월별 일정을 관리합니다."/>
      <section className="section-wrap admin-content-wrap">
        <div className="admin-management-bar">
          <div className="admin-tabs">
            <button className={activeTab === 'gallery' ? 'active' : ''} onClick={() => { setActiveTab('gallery'); setMessage(''); }}><Images size={17}/> 갤러리 관리</button>
            <button className={activeTab === 'schedule' ? 'active' : ''} onClick={() => { setActiveTab('schedule'); setMessage(''); }}><CalendarDays size={17}/> 일정표 관리</button>
          </div>
          <button className="btn btn-ghost" onClick={()=>supabase.auth.signOut()}><LogOut size={16}/> 로그아웃</button>
        </div>
        {message && <div className="admin-message">{message}</div>}

        {activeTab === 'gallery' ? (
          <div className="admin-layout admin-tab-panel">
            <form className="admin-card" onSubmit={createGallery}><div className="admin-card-title"><Plus/> 새 갤러리</div><label>공연/콘서트명<input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} required/></label><label>공연일<input type="date" value={form.event_date} onChange={(e)=>setForm({...form,event_date:e.target.value})}/></label><label>설명<textarea rows="4" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label><button className="btn btn-primary">갤러리 생성</button></form>
            <div className="admin-list"><div className="admin-topbar"><h2>등록된 갤러리</h2></div>
            {galleries.map((gallery)=><article className="admin-gallery" key={gallery.id}><div className="admin-gallery-head"><div><span>{gallery.event_date}</span><h3>{gallery.title}</h3><p>{gallery.description}</p></div><button className="icon-danger" onClick={()=>deleteGallery(gallery)} title="갤러리 삭제"><Trash2/></button></div><label className="upload-zone"><ImagePlus/><span>사진 추가</span><small>JPG, PNG, WEBP 등 이미지 파일</small><input type="file" accept="image/*" multiple onChange={(e)=>uploadImages(gallery.id,e.target.files)}/></label><div className="admin-photo-grid">{(gallery.gallery_images||[]).map((image)=><div key={image.id}><img src={supabase.storage.from('gallery').getPublicUrl(image.file_path).data.publicUrl} alt=""/><button onClick={()=>deleteImage(image)}><Trash2 size={14}/></button></div>)}</div></article>)}
            </div>
          </div>
        ) : <div className="admin-tab-panel"><ScheduleManager onMessage={setMessage} /></div>}
      </section>
    </>
  );
}
