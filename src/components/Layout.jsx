import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BRAND_ICON = import.meta.env.BASE_URL + 'icon_img.png';

const links = [
  ['/mir', '미르'],
  ['/band', '청운밴드'],
  ['/history', '공연 이력'],
  ['/schedule', '일정표'],
  ['/gallery', '영상 및 갤러리'],
];

export default function Layout() {
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

      if (!nextSession?.user) {
        setIsAdmin(false);
        setAuthReady(true);
        return;
      }

      const { data } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', nextSession.user.id)
        .maybeSingle();

      if (!active) return;
      setIsAdmin(Boolean(data));
      setAuthReady(true);
    };

    supabase.auth.getSession().then(({ data }) => resolveSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      resolveSession(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <img className="brand-icon" src={BRAND_ICON} alt="" width="36" height="36" aria-hidden="true" />
          <span>미르 <b>×</b> 청운밴드</span>
        </Link>
        <button className="mobile-menu" onClick={() => setOpen((v) => !v)} aria-label="메뉴 열기">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className={open ? 'main-nav is-open' : 'main-nav'}>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
          {authReady && session && (
            <NavLink to="/account" onClick={() => setOpen(false)} className={({ isActive }) => (isActive ? 'active' : '')}>
              내 정보
            </NavLink>
          )}
        </nav>
      </header>

      <main><Outlet /></main>

      <footer className="site-footer">
        <div>
          <strong>미르 × 청운밴드 Archive</strong>
          <p>미르님과 청운밴드가 같이 만들어간 추억을 오래 남기기 위한 비공식 사이트 입니다.</p>
        </div>
        <div className="footer-account-links">
          {authReady && session ? (
            <button type="button" className="footer-admin footer-logout" onClick={handleLogout}>로그아웃</button>
          ) : (
            <Link to="/account" className="footer-admin">로그인 / 회원가입</Link>
          )}
          {authReady && session && isAdmin && <Link to="/admin" className="footer-admin">관리자</Link>}
        </div>
      </footer>
    </div>
  );
}
