export const FANART_MAX_IMAGES = 12;
export const FANART_INTERVAL_MS = 5000;

// Only server-issued, same-site proxy IDs; never turn article HTML into executable UI.
export function fanartImageUrls(fanart) {
  const values = Array.isArray(fanart?.imageUrls) && fanart.imageUrls.length ? fanart.imageUrls : [fanart?.imageUrl];
  return [...new Set(values.filter((value) => typeof value === 'string' &&
    /^(?:https:\/\/mir\.yeop\.net)?\/(?:_yeop_releases\/r\d{14}_[a-f0-9]{8}\/)?api\/naver-fanart-image\.php\?(?:id|fallback)=[a-f0-9]{64}$/.test(value)))].slice(0, FANART_MAX_IMAGES);
}

export function nextFanartImage(images, current, failed = {}, direction = 1) {
  const remaining = images.filter((url) => !failed[url]);
  if (!remaining.length) return '';
  const index = remaining.indexOf(current);
  return remaining[(index < 0 ? 0 : (index + direction + remaining.length) % remaining.length)];
}
