import { Link } from 'react-router-dom';
import { accountNotice } from '../data/policyPublished';
import '../published-policies.css';
export default function SignupPolicyNotice({ accepted, onAccepted, disabled }) {
  return <div className="signup-policy-box"><section aria-labelledby="signup-policy-title"><h3 id="signup-policy-title">회원 계정정보 처리 안내</h3>{accountNotice.map(text => <p key={text}>{text}</p>)}<p>자동 생성되는 인증·세션 정보와 위탁·국외 이전은 <Link to="/policies/privacy" target="_blank" rel="noopener noreferrer">개인정보처리방침</Link>에서 확인해 주세요.</p></section><label className="signup-terms-check"><input type="checkbox" name="termsAccepted" checked={accepted} onChange={event => onAccepted(event.target.checked)} required disabled={disabled}/><span><Link to="/policies/terms" target="_blank" rel="noopener noreferrer">이용약관</Link>을 확인하고 동의합니다. (필수)</span></label><p className="signup-policy-caption">개인정보 처리 안내에 대한 포괄 동의나 연령 확인을 받는 확인란은 아닙니다.</p></div>;
}
