import { validatePasswordChange } from '../_shared/password-policy.mjs';

// No service-role key, user-supplied target ID/email, password logging or database access.
export function createPasswordHandler({ url, anonKey, fetchImpl = fetch, now = Date.now }) {
  const attempts = new Map();
  const authBase = `${String(url || '').replace(/\/$/, '')}/auth/v1`;
  const headers = {
    'Access-Control-Allow-Origin': 'https://mir.yeop.net',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const fail = (code, status = 400) => json({ error: code }, status);
  const call = async (path, token, method = 'GET', body, timeout = 12000) => {
    const response = await fetchImpl(authBase + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(timeout),
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data = null;
    try { data = await response.json(); } catch { /* Never expose upstream bodies. */ }
    return { status: response.status, ok: response.ok, data };
  };
  return async (req) => {
    const origin = req.headers.get('origin');
    if (origin && origin !== 'https://mir.yeop.net') return fail('origin_not_allowed', 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return fail('method_not_allowed', 405);
    const token = /^Bearer ([A-Za-z0-9_.-]{16,8192})$/i.exec(req.headers.get('authorization') || '')?.[1];
    if (!token) return fail('authentication_required', 401);
    if (!url || !anonKey || !String(url).startsWith('https://')) return fail('auth_unavailable', 503);
    if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') || '')) return fail('invalid_request');
    let body;
    try {
      // Enforce a bound even for chunked bodies without Content-Length.
      const reader = req.body?.getReader();
      if (!reader) return fail('invalid_request');
      const chunks = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return fail('request_too_large', 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch { return fail('invalid_request'); }
    const invalid = validatePasswordChange(body);
    if (invalid) return fail(invalid.code);
    if (Object.keys(body).some((key) => !['currentPassword', 'newPassword', 'confirmPassword'].includes(key))) return fail('invalid_request');

    let temporaryToken = ''; let changing = false; let changed = false; let entry; let acquired = false;
    try {
      // Authoritative session validation, not a decoded/unverified JWT payload.
      const identity = await call('/user', token);
      if (!identity.ok) return fail(identity.status >= 500 ? 'auth_unavailable' : 'authentication_required', identity.status >= 500 ? 503 : 401);
      const user = identity.data;
      if (!user?.id || !user.email || user.is_anonymous) return fail('authentication_required', 401);
      // Do not bypass a configured second factor with a password-only reauthentication.
      if (user.factors?.some((factor) => factor.status === 'verified')) return fail('additional_verification_required', 403);
      const time = now();
      for (const [id, item] of attempts) if (item.until <= time && !item.busy) attempts.delete(id);
      entry = attempts.get(user.id);
      if (entry?.busy || (entry && entry.count >= 5)) return fail('rate_limited', 429);
      if (!entry) {
        if (attempts.size >= 2000) return fail('rate_limited', 429);
        entry = { count: 0, busy: false, until: time + 600000 };
        attempts.set(user.id, entry);
      }
      entry.count += 1; entry.busy = true; acquired = true;
      // Auth's own rate limits still apply. This bounded per-isolate guard is additional.
      const verified = await call('/token?grant_type=password', anonKey, 'POST', {
        email: user.email, password: body.currentPassword,
      });
      if (!verified.ok) {
        if (verified.status === 429) return fail('rate_limited', 429);
        return fail(verified.status >= 500 ? 'auth_unavailable' : 'current_password_mismatch', verified.status >= 500 ? 503 : 400);
      }
      temporaryToken = verified.data?.access_token || '';
      if (!temporaryToken || verified.data?.user?.id !== user.id) return fail('authentication_required', 401);
      changing = true;
      // Update ONLY through the reauthenticated user's token, never auth.admin APIs.
      const update = await call('/user', temporaryToken, 'PUT', {
        password: body.newPassword, current_password: body.currentPassword,
      });
      if (!update.ok) {
        changing = false;
        const code = update.data?.code || update.data?.error_code;
        if (['weak_password', 'same_password', 'current_password_mismatch', 'current_password_required'].includes(code)) return fail(code);
        if (update.status === 429) return fail('rate_limited', 429);
        if (update.status === 401 || update.status === 403) return fail('authentication_required', 401);
        return fail(update.status >= 500 ? 'change_unconfirmed' : 'change_rejected', update.status >= 500 ? 503 : 400);
      }
      changed = true;
      return json({ ok: true });
    } catch {
      // A lost PUT response is ambiguous: never retry a credential mutation automatically.
      return fail(changing ? 'change_unconfirmed' : 'auth_unavailable', 503);
    } finally {
      if (temporaryToken) {
        try { await call(`/logout?scope=${changed ? 'global' : 'local'}`, temporaryToken, 'POST', undefined, 3000); } catch { /* A committed password change remains successful. */ }
      }
      if (acquired) entry.busy = false;
    }
  };
}
