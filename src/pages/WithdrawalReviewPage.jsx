import { useState } from 'react';
import { Link } from 'react-router-dom';
import AccountWithdrawalForm from '../components/AccountWithdrawalForm';
import '../withdrawal-review-contrast.css';

export default function WithdrawalReviewPage() {
  const [mode, setMode] = useState('account');
  const [scenario, setScenario] = useState('normal');
  const request = async ({ password }) => {
    await new Promise(resolve => setTimeout(resolve, 350));
    if (scenario === 'uncertain') return { error: 'deletion_unconfirmed' };
    if (scenario === 'managed') return { error: 'managed_account' };
    return password === 'Review-Only-123!' ? { ok: true } : { error: 'password_mismatch' };
  };
  return <div className="withdrawal-review">
    <header className="withdrawal-review-heading"><span className="policy-kicker">ACCOUNT · REVIEW 03</span><h1>회원 탈퇴 흐름 검토</h1><p>예시 계정으로 화면과 오류 처리를 확인합니다. 실제 회원정보는 변경하지 않습니다.</p></header>
    <aside className="withdrawal-demo-banner"><strong>실제 비밀번호 입력 금지 · 모의 동작</strong><p>예시 비밀번호는 <code>Review-Only-123!</code> 입니다. 틀린 값을 입력하면 삭제 없이 오류가 표시됩니다. 실제 계정 삭제 API는 이 화면에서 호출하지 않습니다.</p></aside>
    {mode === 'account' ? <section className="withdrawal-card"><h2>내 정보</h2><strong>mir_fan_example</strong><p>example@example.invalid</p><label>확인할 상황<select value={scenario} onChange={event => setScenario(event.target.value)}><option value="normal">정상 / 비밀번호 오류</option><option value="uncertain">응답 유실 · 결과 확인 불가</option><option value="managed">관리자 · 자료 인계 필요</option></select></label><button className="withdrawal-delete" onClick={() => setMode('withdraw')}>회원 탈퇴</button></section>
      : mode === 'done' ? <section className="withdrawal-card" role="status"><h2>예시 계정 탈퇴가 완료되었습니다.</h2><p>삭제 성공 안내와 로그인 종료 화면입니다. 실제 계정은 삭제하지 않았습니다.</p><button className="withdrawal-cancel" onClick={() => setMode('account')}>예시 계정으로 다시 확인</button></section>
      : <AccountWithdrawalForm userId="review-account" onRequest={request} onCancel={() => setMode('account')} onDeleted={() => setMode('done')} demo/>}
    <nav className="withdrawal-review-links"><Link to="/policies/privacy#retention">보유기간·삭제 범위</Link><Link to="/policies/review">정책 3차 검토실</Link></nav>
  </div>;
}
