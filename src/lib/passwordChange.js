import { validatePasswordChange } from './passwordPolicy.js';
export { validatePasswordChange } from './passwordPolicy.js';

export const passwordChangeMessage = (code) => ({
  current_password_required: '기존 비밀번호를 입력해 주세요.',
  current_password_mismatch: '기존 비밀번호가 올바르지 않습니다.',
  password_mismatch: '새 비밀번호와 새 비밀번호 다시 입력이 일치하지 않습니다.',
  weak_password: '새 비밀번호는 8~128자로 입력해 주세요. 인증 서버의 보안 기준도 충족해야 합니다.',
  same_password: '새 비밀번호는 기존 비밀번호와 다르게 입력해 주세요.',
  authentication_required: '로그인 상태를 확인할 수 없습니다. 다시 로그인한 뒤 변경해 주세요.',
  additional_verification_required: '추가 인증이 필요한 계정입니다. 이메일 비밀번호 재설정 절차를 이용해 주세요.',
  rate_limited: '시도 횟수가 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.',
  change_unconfirmed: '변경 결과를 확인하지 못했습니다. 새 비밀번호로 로그인을 확인하거나 비밀번호 찾기를 이용해 주세요.',
  change_rejected: '비밀번호를 변경하지 못했습니다. 새 비밀번호의 보안 기준과 로그인 상태를 확인해 주세요.',
  auth_unavailable: '인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
}[code] || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');

// Passwords go directly to the existing Supabase Auth service, not an application endpoint.
export async function requestPasswordChange(client, values, userId, createVerificationClient) {
  const invalid = validatePasswordChange(values);
  if (invalid) return { error: invalid.code };
  if (!client || !userId) return { error: 'authentication_required' };
  let verifier; let writing = false; let changed = false;
  try {
    const current = await client.auth.getUser();
    const user = current.data?.user;
    if (current.error || !user?.email || user.id !== userId || user.is_anonymous) return { error: 'authentication_required' };
    if (user.factors?.some((factor) => factor.status === 'verified')) return { error: 'additional_verification_required' };
    verifier = createVerificationClient();
    if (!verifier) return { error: 'auth_unavailable' };
    // Auth verifies the existing password. No persisted profile field is trusted here.
    const verified = await verifier.auth.signInWithPassword({ email: user.email, password: values.currentPassword });
    if (verified.error) {
      if (verified.error.status === 429) return { error: 'rate_limited' };
      return { error: verified.error.status >= 500 || !verified.error.status ? 'auth_unavailable' : 'current_password_mismatch' };
    }
    if (!verified.data?.session?.access_token || verified.data?.user?.id !== userId) return { error: 'authentication_required' };
    // Reject an account switch or logout while reauthentication was in flight.
    const latest = await client.auth.getUser();
    if (latest.error || latest.data?.user?.id !== userId) return { error: 'authentication_required' };
    writing = true;
    const result = await verifier.auth.updateUser({ password: values.newPassword, current_password: values.currentPassword });
    if (result.error) {
      const code = result.error.code;
      if (['weak_password', 'same_password', 'current_password_mismatch', 'current_password_required'].includes(code)) return { error: code };
      if (result.error.status === 429) return { error: 'rate_limited' };
      if ([401,403].includes(result.error.status)) return { error: 'authentication_required' };
      return { error: result.error.status >= 500 || !result.error.status ? 'change_unconfirmed' : 'change_rejected' };
    }
    if (result.data?.user?.id !== userId) return { error: 'change_unconfirmed' };
    changed = true;
    return { ok: true };
  } catch {
    // Never automatically repeat a password mutation after an ambiguous response.
    return { error: writing ? 'change_unconfirmed' : 'auth_unavailable' };
  } finally {
    if (verifier) {
      try { await verifier.auth.signOut({ scope: changed ? 'global' : 'local' }); } catch { /* Do not misreport a committed change. */ }
      try { await verifier.auth.stopAutoRefresh?.(); } catch { /* Best-effort client cleanup. */ }
    }
  }
}
