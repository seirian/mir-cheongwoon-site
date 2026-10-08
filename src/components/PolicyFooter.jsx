import { Link } from 'react-router-dom';
import '../policies.css';

export default function PolicyFooter() {
  return <div className="policy-footer-row">
    <nav className="policy-footer-nav" aria-label="사이트 정책">
      <Link className="policy-privacy-link" to="/policies/privacy">개인정보처리방침</Link>
      <Link to="/policies/terms">이용약관</Link>
      <Link to="/policies/operation">운영정책·비공식 안내</Link>
    </nav>
    <a className="policy-footer-contact" href="mailto:sengyb@naver.com">운영자 옆군 · sengyb@naver.com</a>
    <span className="policy-footer-status">2차 검토안 · 아직 시행되지 않았습니다</span>
  </div>;
}
