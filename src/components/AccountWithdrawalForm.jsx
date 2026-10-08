import { useRef, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { withdrawalMessage } from '../lib/accountWithdrawal';
import '../account-withdrawal.css';

export default function AccountWithdrawalForm({ userId, onRequest, onCancel, onDeleted, demo = false }) {
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    if (!password.length) { setError('password_required'); return; }
    if (!confirmed) { setError('confirmation_required'); return; }
    lock.current = true; setBusy(true); setError('');
    let result;
    try { result = await onRequest({ password, confirmed }, userId); }
    catch { result = { error: 'deletion_unconfirmed' }; }
    setPassword('');
    if (result?.ok === true) {
      // Once acknowledged, never enable a second delete due to UI cleanup failure.
      try { await onDeleted(); } catch { setError('deletion_unconfirmed'); }
      return;
    }
    setError(result?.error || 'deletion_unconfirmed');
    setBusy(false); lock.current = false;
  }
  return <form className="withdrawal-card" onSubmit={submit} aria-busy={busy}>
    <div className="withdrawal-title"><AlertTriangle size={22}/><h2>회원 탈퇴</h2></div>
    <p className="withdrawal-lead">계정을 삭제하기 전에 확인해 주세요.</p>
    <div className="withdrawal-summary"><strong>탈퇴 완료 즉시 운영 DB의 회원 계정정보를 삭제합니다.</strong><p>아이디·이메일·비밀번호 인증정보와 계정에 연결된 프로필·로그인 세션이 삭제되며 복구할 수 없습니다. 공개된 공연·노래·영상 등 공용 아카이브는 삭제되지 않습니다.</p><p>별도 보안 로그·메일·백업은 계정 삭제와 보존 범위가 다릅니다. 상세 보유기간은 처리방침에서 확인해야 합니다.</p></div>
    <label htmlFor="withdrawal-password">{demo ? '예시 비밀번호' : '현재 비밀번호'}<input id="withdrawal-password" type="password" autoComplete={demo ? 'off' : 'current-password'} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required aria-describedby="withdrawal-password-help" /></label>
    <p id="withdrawal-password-help" className="withdrawal-help">{demo ? '실제 계정의 비밀번호를 입력하지 마세요. 예시: Review-Only-123!' : '본인 확인을 위해 비밀번호를 한 번 더 입력합니다. 이메일로 비밀번호를 보내지 마세요.'}</p>
    <label className="withdrawal-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required/><span>{demo ? '예시 계정 삭제 흐름을 확인합니다.' : '계정정보가 즉시 삭제되며 복구할 수 없음을 확인했습니다.'}</span></label>
    {error && <p className="withdrawal-error" role="alert">{withdrawalMessage(error)}</p>}
    <div className="withdrawal-actions"><button type="button" className="withdrawal-cancel" disabled={busy} onClick={() => { setPassword(''); onCancel(); }}>취소하고 돌아가기</button><button type="submit" className="withdrawal-delete" disabled={busy}>{busy ? '처리 중…' : demo ? '예시 계정 탈퇴 확인' : '확인 후 회원 탈퇴'}</button></div>
    <p className="withdrawal-help"><ShieldCheck size={14}/> {demo ? '이 화면의 입력은 네트워크 전송·브라우저 저장을 하지 않습니다.' : '잘못된 비밀번호로는 탈퇴할 수 없습니다.'}</p>
  </form>;
}
