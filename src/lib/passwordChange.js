export { validatePasswordChange } from '../../supabase/functions/_shared/password-policy.mjs';

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

export async function requestPasswordChange(client, values, userId) {
  // Validate the active user again immediately before transmitting credentials.
  const current = await client.auth.getUser();
  if (current.error || !current.data?.user?.id || current.data.user.id !== userId) return { error: 'authentication_required' };
  const { data, error } = await client.functions.invoke('member-password', { body: values });
  if (error) {
    let payload;
    try { payload = await error.context?.json(); } catch { /* Never render raw errors. */ }
    return { error: payload?.error || data?.error || 'change_unconfirmed' };
  }
  return data?.ok === true ? { ok: true } : { error: data?.error || 'change_unconfirmed' };
}
