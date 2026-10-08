export const withdrawalMessage = (code) => ({
  password_required: '현재 비밀번호를 입력해 주세요.',
  confirmation_required: '삭제 안내를 확인하고 확인란을 선택해 주세요.',
  password_mismatch: '현재 비밀번호가 올바르지 않습니다. 계정은 삭제되지 않았습니다.',
  authentication_required: '로그인 상태가 바뀌었습니다. 다시 로그인한 뒤 탈퇴해 주세요.',
  managed_account: '관리자 계정은 공용 자료와 운영 권한 인계가 필요합니다. 옆군(sengyb@naver.com)에게 탈퇴를 요청해 주세요.',
  additional_verification_required: '추가 인증이 필요한 계정입니다. 옆군(sengyb@naver.com)에게 문의해 주세요.',
  rate_limited: '시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요.',
  deletion_rejected: '삭제가 완료되지 않았습니다. 다시 로그인해 확인하거나 옆군에게 문의해 주세요.',
  deletion_unconfirmed: '서버의 삭제 결과를 확인하지 못했습니다. 자동 재시도하지 않습니다. 로그인 가능 여부를 확인하거나 sengyb@naver.com으로 문의해 주세요.',
  service_unavailable: '탈퇴 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하거나 이메일로 문의해 주세요.',
}[code] || '탈퇴를 처리하지 못했습니다. 이메일로 문의해 주세요.');

export async function requestAccountWithdrawal(client, { password, confirmed }, expectedUserId) {
  if (typeof password !== 'string' || !password.length || password.length > 128) return { error: 'password_required' };
  if (confirmed !== true) return { error: 'confirmation_required' };
  if (!client || !expectedUserId) return { error: 'authentication_required' };
  let sent = false;
  try {
    const current = await client.auth.getUser();
    const session = await client.auth.getSession();
    if (current.error || session.error || current.data?.user?.id !== expectedUserId
      || session.data?.session?.user?.id !== expectedUserId || !session.data.session.access_token)
      return { error: 'authentication_required' };
    sent = true;
    const result = await client.functions.invoke('member-withdrawal', {
      headers: { Authorization: `Bearer ${session.data.session.access_token}` },
      body: { password, confirmation: 'DELETE_MY_ACCOUNT' },
    });
    if (!result.error && result.data?.ok === true && result.data?.code === 'ACCOUNT_DELETED') return { ok: true };
    let code = result.data?.code;
    if (!code && result.error?.context instanceof Response) {
      try { code = (await result.error.context.clone().json())?.code; } catch { /* Do not display raw upstream data. */ }
    }
    const known = ['password_mismatch','authentication_required','managed_account','additional_verification_required',
      'rate_limited','deletion_rejected','deletion_unconfirmed','service_unavailable'];
    return { error: known.includes(code) ? code : 'deletion_unconfirmed' };
  } catch { return { error: sent ? 'deletion_unconfirmed' : 'service_unavailable' }; }
}

// A successful server deletion must not remove a different account's browser session.
export function clearWithdrawnSession(storage, storageKey, userId) {
  try {
    const raw = storage?.getItem(storageKey);
    const session = raw ? JSON.parse(raw) : null;
    if (session?.user?.id === userId) { storage.removeItem(storageKey); return true; }
  } catch { /* Storage may be blocked. Never clear unrelated preferences. */ }
  return false;
}

export async function finishAccountWithdrawal(client, storage, storageKey, userId) {
  try {
    const { data } = await client.auth.getSession();
    if (data?.session?.user?.id !== userId) return;
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* Server deletion already succeeded. */ }
    clearWithdrawnSession(storage, storageKey, userId);
  } catch { clearWithdrawnSession(storage, storageKey, userId); }
}
