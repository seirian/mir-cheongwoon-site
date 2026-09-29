import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { passwordChangeMessage, requestPasswordChange, validatePasswordChange } from '../lib/passwordChange';

const blank = () => ({ currentPassword: '', newPassword: '', confirmPassword: '' });
export default function PasswordChangeForm({ userId, onCancel, onChanged }) {
  const [values, setValues] = useState(blank);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(false);
  const inputs = useRef({});
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!busy && error?.field) inputs.current[error.field]?.focus(); }, [busy, error]);
  const report = (issue) => {
    setError(issue);
    if (issue.field) inputs.current[issue.field]?.focus();
  };
  async function submit(event) {
    event.preventDefault();
    if (lock.current || !supabase) return;
    const issue = validatePasswordChange(values);
    if (issue) { report(issue); return; }
    lock.current = true; setBusy(true); setError(null);
    try {
      const result = await requestPasswordChange(supabase, values, userId);
      if (!mounted.current) return;
      if (result.ok) {
        setValues(blank());
        await onChanged();
      } else {
        const field = result.error === 'current_password_mismatch' ? 'currentPassword' : result.error === 'password_mismatch' ? 'confirmPassword' : result.error === 'weak_password' || result.error === 'same_password' ? 'newPassword' : undefined;
        // Never retain an incorrectly entered existing password for a later attempt.
        if (field === 'currentPassword') setValues((previous) => ({ ...previous, currentPassword: '' }));
        report({ code: result.error, field });
      }
    } catch {
      if (mounted.current) report({ code: 'change_unconfirmed' });
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const fields = [['currentPassword', '기존 비밀번호', 'current-password'], ['newPassword', '새 비밀번호', 'new-password'], ['confirmPassword', '새 비밀번호 다시 입력', 'new-password']];
  return <form className="account-auth-card" onSubmit={submit} noValidate aria-busy={busy}>
    <div className="account-auth-title"><KeyRound size={20}/><strong>비밀번호 변경</strong></div>
    <p className="account-auth-note" id="password-change-guide">기존 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다. 새 비밀번호는 8~128자로 입력해 주세요. 변경 후에는 다시 로그인해 주세요.</p>
    {fields.map(([name, label, autoComplete]) => <label key={name} htmlFor={`change-${name}`}>{label}<input
      ref={(element) => { inputs.current[name] = element; }} id={`change-${name}`} name={name} type="password" autoComplete={autoComplete}
      value={values[name]} onChange={(event) => { setValues((previous) => ({ ...previous, [name]: event.target.value })); setError(null); }}
      required minLength={name === 'currentPassword' ? 1 : 8} maxLength={name === 'currentPassword' ? 256 : 128} disabled={busy}
      aria-invalid={error?.field === name ? 'true' : undefined} aria-describedby={error?.field === name ? 'password-change-error' : 'password-change-guide'}/></label>)}
    {error && <p className="account-auth-message" id="password-change-error" role="alert">{passwordChangeMessage(error.code)}</p>}
    <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '비밀번호 확인 및 변경 중…' : '비밀번호 변경'}</button>
    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setValues(blank()); onCancel(); }}><ArrowLeft size={17}/> 내 정보로 돌아가기</button>
  </form>;
}
