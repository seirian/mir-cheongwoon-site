import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

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
          <span className="brand-mark">M</span>
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
          <p>팬과 공연의 기억을 오래 남기기 위한 비공식/공식 홍보 사이트용 초안입니다.</p>
        </div>
        <Link to="/admin" className="footer-admin">관리자</Link>
      </footer>
    </div>
  );
}
