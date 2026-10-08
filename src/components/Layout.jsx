import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import PageMetadata from './PageMetadata';
import PolicyFooter from './PolicyFooter';
import { IS_REVIEW_PREVIEW, IS_SONGBOOK_PREVIEW, IS_SONGBOOK_PLATFORM_PREVIEW, IS_POLICY_PREVIEW } from '../lib/preview';
import { supabase } from '../lib/supabase';

const BRAND_ICON = import.meta.env.BASE_URL + 'icon_img.png';
const links = [
  ['/mir', '미르'],
  ['/band', '청운밴드'],
  ['/history', '공연 이력'],
  ['/songbook', '노래책'],
  ['/schedule', '일정표'],
  ['/gallery', '영상 및 갤러리'],
];

export default function Layout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const resolveSession = async (nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession?.user) { setIsAdmin(false); setAuthReady(true); return; }
      const { data } = await supabase.from('admins').select('user_id').eq('user_id', nextSession.user.id).maybeSingle();
      if (!active) return;
      setIsAdmin(Boolean(data)); setAuthReady(true);
    };
    supabase.auth.getSession().then(({ data }) => resolveSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => { if (active) resolveSession(nextSession); }, 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    setOpen(false);
    const frame = requestAnimationFrame(() => {
      if (location.hash) {
        try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); } catch { /* Ignore malformed fragment. */ }
      } else window.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') { setOpen(false); document.querySelector('.mobile-menu')?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const handleLogout = async () => { setOpen(false); if (!supabase) return; await supabase.auth.signOut(); };
  const reviewPath = IS_POLICY_PREVIEW ? '/policies/review' : IS_SONGBOOK_PREVIEW ? '/songbook/review' : '/review';
  return (
    <div className="site-shell">
      <PageMetadata/>
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      {IS_REVIEW_PREVIEW && <div className="review-banner"><span>{IS_POLICY_PREVIEW ? '이용자 안내 3차 검토안 · 미시행 · 운영 사이트와 분리' : IS_SONGBOOK_PLATFORM_PREVIEW ? '플랫폼 검색 1차 검토안 · 이 브라우저에만 저장' : IS_SONGBOOK_PREVIEW ? '노래책 4차 검토안 · 운영과 분리된 편집 공간' : '2차 검토용 · 홈 이미지만 별도 저장 가능'}</span><Link to={reviewPath}>{IS_POLICY_PREVIEW ? '확인 사항 보기 ↗' : IS_SONGBOOK_PREVIEW ? '노래책 검토실 ↗' : '2차 변경점 보기 ↗'}</Link></div>}
      <header className="site-header">
        <Link to="/" className="brand" onClick={() => setOpen(false)}><img className="brand-icon" src={BRAND_ICON} alt="" width="36" height="36" aria-hidden="true"/><span>미르 <b>×</b> 청운밴드</span></Link>
        <button className="mobile-menu" onClick={() => setOpen(v => !v)} type="button" aria-label={open ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={open} aria-controls="site-navigation">{open ? <X size={22}/> : <Menu size={22}/>}</button>
        <nav id="site-navigation" aria-label="주 메뉴" className={open ? 'main-nav is-open' : 'main-nav'}>{links.map(([to,label]) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({isActive}) => isActive ? 'active' : ''}>{label}</NavLink>)}{authReady && session && <NavLink to="/account" onClick={() => setOpen(false)} className={({isActive}) => isActive ? 'active' : ''}>내 정보</NavLink>}</nav>
      </header>
      <main id="main-content" tabIndex={-1}><Outlet/></main>
      <footer className={IS_POLICY_PREVIEW ? 'site-footer policy-footer-shell' : 'site-footer'}>
        <div><strong>미르 × 청운밴드 Archive</strong><p>미르님과 청운밴드가 같이 만들어간 추억을 오래 남기기 위한 비공식 사이트 입니다.</p></div>
        <div className="footer-account-links">{IS_REVIEW_PREVIEW && <Link className="footer-admin" to={reviewPath}>{IS_POLICY_PREVIEW ? '3차 검토실' : IS_SONGBOOK_PREVIEW ? '노래책 검토실' : '개선안 검토실'}</Link>}{IS_POLICY_PREVIEW && <Link className="footer-admin" to="/policies/review#signup">가입 안내 시안</Link>}{!IS_REVIEW_PREVIEW && (authReady && session ? <button type="button" className="footer-admin footer-logout" onClick={handleLogout}>로그아웃</button> : <Link to="/account" className="footer-admin">로그인 / 회원가입</Link>)}{authReady && session && isAdmin && <Link to="/admin" className="footer-admin">관리자</Link>}</div>
        {IS_POLICY_PREVIEW && <PolicyFooter />}
      </footer>
    </div>
  );
}
