import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

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
        </nav>
      </header>

      <main><Outlet /></main>

      <footer className="site-footer">
        <div>
          <strong>미르 × 청운밴드 Archive</strong>
          <p>미르님과 청운밴드가 같이 만들어간 추억을 오래 남기기 위한 비공식 사이트 초안입니다.</p>
        </div>
        <Link to="/admin" className="footer-admin">관리자</Link>
      </footer>
    </div>
  );
}
