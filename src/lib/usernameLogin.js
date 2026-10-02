/** Existing member-auth is the only ID/password entrypoint. Never resolve emails in the browser. */
export async function loginWithUsername(client, identifier, password) {
  const username = typeof identifier === 'string' ? identifier.trim().toLowerCase() : '';
  if (!/^[a-z0-9_.-]{4,24}$/.test(username) || typeof password !== 'string' || !password.length || password.length > 128) {
    throw new Error('아이디와 비밀번호를 확인해 주세요.');
  }
  if (!client) throw new Error('로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  let response;
  try {
    response = await client.functions.invoke('member-auth', {
      body: { action: 'login', identifier: username, password },
    });
  } catch { throw new Error('로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'); }
  const { data, error } = response || {};
  if (error || !data || typeof data.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string' || !data.refresh_token) {
    throw new Error(data?.error === 'email_not_confirmed' ? '가입 시 계정 인증을 완료한 뒤 로그인해 주세요.' : '로그인에 실패했습니다. 아이디 또는 비밀번호를 확인해 주세요.');
  }
  // Install only the server-issued tokens; password is neither stored nor logged.
  try {
    const installed = await client.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    if (installed.error || !installed.data?.session) throw new Error();
    return installed.data.session;
  } catch { throw new Error('로그인 세션을 생성하지 못했습니다. 다시 시도해 주세요.'); }
}

export function songbookTables(preview = false) {
  const prefix = preview ? 'songbook_preview_' : 'songbook_';
  return Object.freeze({ entries: prefix + 'entries', ratings: prefix + 'ratings', editors: prefix + 'editors' });
}
