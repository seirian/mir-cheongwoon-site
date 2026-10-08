// Shared by the hosted Edge entry point and offline tests. Never log request bodies.
const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const BODY_LIMIT = 4096;
async function readBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('body');
  if (Number(request.headers.get('content-length')) > BODY_LIMIT) throw new Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) { await reader.cancel(); throw new Error('body'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function createWithdrawalHandler({ createClient, url, publicKey, serviceKey, origin = 'https://mir.yeop.net' }) {
  return async (request) => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (status, code) => new Response(JSON.stringify(status === 200 ? { ok: true, code } : { ok: false, code }), { status, headers });
    if (request.headers.get('origin') && request.headers.get('origin') !== origin) return reply(403, 'origin_rejected');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, 'method_rejected');
    if (!url || !publicKey || !serviceKey) return reply(503, 'service_unavailable');
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer [^\s]{20,8192}$/i.test(authorization)) return reply(401, 'authentication_required');
    const token = authorization.slice(7);
    let body;
    try { body = await readBody(request); } catch { return reply(400, 'invalid_request'); }
    // No email, user_id or caller-selected deletion target is accepted.
    if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'confirmation,password'
      || body.confirmation !== 'DELETE_MY_ACCOUNT' || typeof body.password !== 'string'
      || body.password.length < 1 || body.password.length > 128) return reply(400, 'invalid_request');
    let verifier; let deletionSent = false;
    try {
      const admin = createClient(url, serviceKey, CLIENT_OPTIONS);
      const current = await admin.auth.getUser(token);
      const user = current.data?.user;
      if (current.error || !user?.id || !user.email || user.is_anonymous) return reply(401, 'authentication_required');
      if (user.factors?.some(factor => factor.status === 'verified')) return reply(409, 'additional_verification_required');
      // Public archive files and the sole operator must not disappear accidentally.
      const managed = await admin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
      if (managed.error) return reply(503, 'service_unavailable');
      if (managed.data) return reply(409, 'managed_account');
      verifier = createClient(url, publicKey, CLIENT_OPTIONS);
      const check = await verifier.auth.signInWithPassword({ email: user.email, password: body.password });
      body.password = ''; // Do not retain the supplied credential beyond reauthentication.
      if (check.error) return reply(check.error.status === 429 ? 429 : check.error.status >= 500 || !check.error.status ? 503 : 403,
        check.error.status === 429 ? 'rate_limited' : check.error.status >= 500 || !check.error.status ? 'service_unavailable' : 'password_mismatch');
      if (!check.data?.session?.access_token || check.data?.user?.id !== user.id) return reply(401, 'authentication_required');
      const verified = await verifier.auth.getUser();
      const latest = await admin.auth.getUser(token);
      if (verified.error || latest.error || verified.data?.user?.id !== user.id || latest.data?.user?.id !== user.id)
        return reply(401, 'authentication_required');
      // Recheck role after reauthentication; fail closed if management access changed.
      const managedAgain = await admin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
      if (managedAgain.error) return reply(503, 'service_unavailable');
      if (managedAgain.data) return reply(409, 'managed_account');
      const revoked = await admin.auth.admin.signOut(check.data.session.access_token, 'global');
      if (revoked.error) return reply(503, 'service_unavailable');
      deletionSent = true;
      const removed = await admin.auth.admin.deleteUser(user.id, false); // Hard deletion, never soft-delete.
      if (removed.error) return reply(removed.error.status >= 500 || !removed.error.status ? 503 : 409,
        removed.error.status >= 500 || !removed.error.status ? 'deletion_unconfirmed' : 'deletion_rejected');
      const absent = await admin.auth.admin.getUserById(user.id);
      if (absent.data?.user || !(absent.error?.status === 404 || absent.error?.code === 'user_not_found'))
        return reply(503, 'deletion_unconfirmed');
      const profile = await admin.from('member_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
      if (profile.error || profile.data) return reply(503, 'deletion_unconfirmed');
      return reply(200, 'ACCOUNT_DELETED');
    } catch { return reply(503, deletionSent ? 'deletion_unconfirmed' : 'service_unavailable'); }
    finally {
      body.password = '';
      if (verifier) {
        try { await verifier.auth.signOut({ scope: 'local' }); } catch { /* Never misreport an acknowledged deletion. */ }
        try { await verifier.auth.stopAutoRefresh(); } catch { /* Memory-only client. */ }
      }
    }
  };
}
