// Stable, distinct object names: review uploads never replace the production hero.
export const HERO_BUCKET = 'gallery';
export const HERO_FILE = 'current.webp';
export const HERO_MAX_BYTES = 5 * 1024 * 1024;
export const HERO_LIVE_URL = 'https://www.youtube.com/watch?v=Gh4PqvQVWRc';
export const heroFolder = (preview) => `site-hero/${preview ? 'promotion-discovery-preview' : 'production'}`;
export const heroPath = (preview) => `${heroFolder(preview)}/${HERO_FILE}`;

export function validateHeroFile(file) {
  if (!file || !Number.isInteger(file.size) || file.size <= 0) throw new Error('이미지 파일을 선택해 주세요.');
  if (file.size > HERO_MAX_BYTES) throw new Error('5MB 이하의 이미지를 선택해 주세요.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 이미지만 사용할 수 있습니다.');
}

export function detectHeroMime(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

// Decode and re-encode to a bounded, static raster; never upload user HTML/SVG bytes.
export async function prepareHeroImage(file) {
  validateHeroFile(file);
  if (detectHeroMime(new Uint8Array(await file.slice(0, 16).arrayBuffer())) !== file.type) throw new Error('이미지 형식이 올바르지 않습니다. 다른 파일을 선택해 주세요.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('이미지를 읽지 못했습니다. 파일을 확인해 주세요.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24000000) throw new Error('이미지는 2,400만 화소 이하로 준비해 주세요.');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이 브라우저에서 이미지를 처리할 수 없습니다.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob || blob.type !== 'image/webp' || blob.size > HERO_MAX_BYTES) throw new Error('이미지 변환에 실패했습니다. 더 작은 이미지를 사용해 주세요.');
    return blob;
  } finally { bitmap.close(); }
}

export async function hasHeroAdminAccess(client) {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.id) return false;
  const result = await client.from('admins').select('user_id').eq('user_id', data.user.id).limit(1);
  return !result.error && result.data?.some((row) => row.user_id === data.user.id) === true;
}

export async function readHeroImage(client, preview) {
  if (!client) return '';
  const storage = client.storage.from(HERO_BUCKET);
  const { data, error } = await storage.list(heroFolder(preview), { limit: 1, search: HERO_FILE });
  if (error) throw new Error('저장된 홈 이미지를 확인하지 못했습니다.');
  const file = data?.find((item) => item.name === HERO_FILE);
  if (!file) return '';
  const url = storage.getPublicUrl(heroPath(preview)).data.publicUrl;
  return `${url}?v=${encodeURIComponent(file.updated_at || file.id || 'current')}`;
}

export async function saveHeroImage(client, blob, preview) {
  if (!client || !(await hasHeroAdminAccess(client))) throw new Error('관리자 권한을 확인하지 못했습니다. 다시 로그인해 주세요.');
  validateHeroFile(blob);
  if (blob.type !== 'image/webp') throw new Error('변환된 WebP 이미지만 저장할 수 있습니다.');
  const storage = client.storage.from(HERO_BUCKET);
  const { error } = await storage.upload(heroPath(preview), blob, { upsert: true, cacheControl: '0', contentType: 'image/webp' });
  if (error) throw new Error('이미지 저장에 실패했습니다. 기존 이미지는 유지됩니다. 잠시 후 다시 시도해 주세요.');
  return `${storage.getPublicUrl(heroPath(preview)).data.publicUrl}?v=${Date.now()}`;
}

// Defense in depth only. Storage RLS remains the authoritative admin check.
export function createHeroPreviewFetch(origin, fetchImpl) {
  const expectedOrigin = new URL(origin).origin;
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const path = url.pathname;
    let allowed = url.origin === expectedOrigin && (
      (method === 'GET' && ['/auth/v1/user', '/rest/v1/admins'].includes(path))
      || (method === 'POST' && path === '/auth/v1/token' && ['password', 'refresh_token'].includes(url.searchParams.get('grant_type')))
      || (method === 'POST' && path === '/auth/v1/logout' && url.searchParams.get('scope') === 'local')
      || (method === 'POST' && path === `/storage/v1/object/${HERO_BUCKET}/${heroPath(true)}`)
    );
    if (url.origin === expectedOrigin && method === 'POST' && path === `/storage/v1/object/list/${HERO_BUCKET}`) {
      try {
        const body = init.body ?? (input instanceof Request ? await input.clone().text() : '');
        const data = JSON.parse(body);
        allowed = data.prefix === heroFolder(true) && data.search === HERO_FILE && data.limit === 1;
      } catch { allowed = false; }
    }
    if (!allowed) return new Response(JSON.stringify({ message: '검토용 홈 이미지 이외의 변경은 차단되었습니다.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    return fetchImpl(input, init);
  };
}
