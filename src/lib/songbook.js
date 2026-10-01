/** Pure songbook helpers: no network, auth or database dependency. */
export const PAGE_SIZE = 24;
export const FAVORITES_KEY = 'mir-songbook-favorites-v1';
const INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
export function normalize(value = '') {
  return String(value).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\p{P}\p{Z}\p{S}\s]/gu, '');
}
export function initials(value = '') {
  return [...String(value)].map((char) => {
    const code = char.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? INITIALS[Math.floor(code / 588)] : char;
  }).join('');
}
export function matchesQuery(song, query) {
  const tokens = String(query).trim().split(/\s+/u).filter(Boolean);
  const text = [song.title, song.artist, ...(song.aliases || []), ...(song.categories || [])].join(' ');
  return tokens.every((token) => /^[ㄱ-ㅎ]+$/u.test(token) ? initials(text).includes(token) : normalize(text).includes(normalize(token)));
}
export function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return '';
    const allowed = ['mir427.vercel.app', 'gurmir.com', 'cafe.naver.com', 'm.cafe.naver.com', 'www.youtube.com', 'youtube.com', 'youtu.be', 'vod.afreecatv.com', 'vod.sooplive.co.kr', 'vod.sooplive.com', 'onestage.kr', 'meloming.com', 'mir.yeop.net'];
    if (!allowed.includes(url.hostname)) return '';
    if (['youtube.com', 'www.youtube.com'].includes(url.hostname) && (url.pathname !== '/watch' || !/^[\w-]{11}$/.test(url.searchParams.get('v') || ''))) return '';
    if (url.hostname === 'youtu.be' && !/^\/[\w-]{11}$/.test(url.pathname)) return '';
    if (url.hostname.startsWith('vod.') && !/^\/player\/\d+\/?$/.test(url.pathname)) return '';
    return url.href;
  } catch { return ''; }
}
export function readFavorites(storage, validIds) {
  try {
    const value = JSON.parse(storage.getItem(FAVORITES_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    const valid = new Set(validIds);
    return [...new Set(value.filter((id) => typeof id === 'string' && valid.has(id)))];
  } catch { return []; }
}
export function selectSongs(songs, filters = {}, favorites = []) {
  const saved = new Set(favorites);
  const items = songs.filter((song) => matchesQuery(song, filters.q || '')
    && (!filters.category || song.categories.includes(filters.category))
    && (!filters.artist || song.artist === filters.artist)
    && (!filters.source || song.sources.some((source) => source.id === filters.source))
    && (filters.view !== 'videos' || song.videoLinks.length > 0)
    && (filters.view !== 'favorites' || saved.has(song.id))
    && (!filters.status || song.requestStatus === filters.status));
  const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
  return items.sort((a, b) => {
    if (filters.sort === 'artist') return collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title);
    if (filters.sort === 'sources') return new Set(b.sources.map(s => s.id)).size - new Set(a.sources.map(s => s.id)).size || collator.compare(a.title, b.title);
    if (filters.sort === 'videos') return b.videoLinks.length - a.videoLinks.length || collator.compare(a.title, b.title);
    return collator.compare(a.title, b.title);
  });
}
export function pageSlice(items, requestedPage, pageSize = PAGE_SIZE) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pages, Math.max(1, Number.isFinite(Number(requestedPage)) ? Math.floor(Number(requestedPage)) : 1));
  return { page, pages, items: items.slice((page - 1) * size, page * size) };
}
export function requestText(song) { return `${song.artist} - ${song.title}`; }
export function toCsv(songs) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]|^[\t\r]/u.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [['곡명', '가수·작품', '분류', '신청 상태', '출처', '출처 URL', '출처 연결 영상 URL', 'MR URL', '가창일 검증'],
    ...songs.map((song) => [song.title, song.artist, song.categories.join(' / '), song.requestStatus === 'available' ? '신청 가능' : '본인 확인 전', [...new Set(song.sources.map(s => s.name))].join(' / '), song.sources.map(s => s.url).join(' | '), song.videoLinks.map(v => v.url).join(' | '), (song.backingLinks || []).map(v => v.url).join(' | '), song.dateVerified ? song.performedAt : '미검증'])];
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
export function downloadFile(contents, type, filename) {
  const objectUrl = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
