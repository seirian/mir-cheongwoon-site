/** VOD identity and public artwork fields; no acquisition-site metadata. */
const youtubeHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];
const soopHosts = ['vod.sooplive.com', 'vod.sooplive.co.kr', 'vod.afreecatv.com'];
function httpsUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > 1500 || /[\\\s]/u.test(value)) return null;
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}
export function timestamp(value) {
  if (!value) return '';
  if (/^\d+s?$/.test(value)) return String(Math.min(604800, parseInt(value, 10)));
  const parts = String(value).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return parts && parts[0] ? String(Math.min(604800, Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0))) : '';
}
export function vodInfo(value) {
  const u = httpsUrl(value);
  if (!u) return null;
  let id;
  if (youtubeHosts.includes(u.hostname)) {
    id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/)?.[1];
  } else if (u.hostname === 'youtu.be') id = u.pathname.match(/^\/([\w-]{11})\/?$/)?.[1];
  if (id && /^[\w-]{11}$/.test(id)) {
    const t = timestamp(u.searchParams.get('t') || u.searchParams.get('start'));
    return { platform: 'youtube', label: 'YouTube VOD', id, url: `https://www.youtube.com/watch?v=${id}${t ? `&t=${t}` : ''}`, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  }
  if (soopHosts.includes(u.hostname) && /^\/player\/\d+\/?$/.test(u.pathname)) {
    const t = timestamp(u.searchParams.get('change_second'));
    return { platform: 'soop', label: 'SOOP VOD', id: u.pathname.match(/\d+/)[0], url: u.origin + u.pathname.replace(/\/$/, '') + (t ? `?change_second=${t}` : ''), thumbnail: '' };
  }
  return null;
}
export function vodLinks(urls = []) {
  const seen = new Set(), counts = {};
  const values = urls.map(vodInfo).filter(v => v && !seen.has(v.url) && seen.add(v.url));
  // Presentation only: YouTube first, preserving the original order within each platform.
  // Sort the derived array, never the stored URLs or automatic timeline history.
  const priority = { youtube: 0, soop: 1 };
  values.sort((a, b) => priority[a.platform] - priority[b.platform]);
  for (const v of values) counts[v.platform] = (counts[v.platform] || 0) + 1;
  const index = {};
  return values.map(v => ({ ...v, number: (index[v.platform] = (index[v.platform] || 0) + 1), total: counts[v.platform] }));
}
export function artworkUrl(value) {
  const u = httpsUrl(value);
  return u && /^is\d+-ssl\.mzstatic\.com$/.test(u.hostname) && u.pathname.startsWith('/image/thumb/') && !u.search && !u.hash ? u.href : '';
}
export function musicUrl(value) {
  const u = httpsUrl(value);
  if (!u || !['music.apple.com', 'itunes.apple.com'].includes(u.hostname) || !/^\/[a-z]{2}\/album\/.+\/\d+$/.test(u.pathname)) return '';
  const id = u.searchParams.get('i');
  return u.origin + u.pathname + (id && /^\d+$/.test(id) ? `?i=${id}` : '');
}
export function artworkFields(input) {
  const image = artworkUrl(input.artworkUrl || input.artwork_url || '');
  const link = musicUrl(input.musicUrl || input.music_url || '');
  return { artworkUrl: image && link ? image : '', musicUrl: link, album: String(input.album || input.album_title || '').slice(0, 200) };
}
export function coverFor(song) {
  const art = artworkFields(song);
  if (art.artworkUrl) return { url: art.artworkUrl, href: art.musicUrl, kind: 'album', label: '앨범 커버' };
  const video = (song.videoUrls || []).map(vodInfo).find(v => v?.thumbnail);
  return video ? { url: video.thumbnail, href: video.url, kind: 'video', label: '연결 영상 썸네일' } : null;
}
export function musicIdentity(row) {
  const norm = v => String(v || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\p{S}\s]/gu, '');
  return `${norm(row.title)}|${norm(row.artist)}`;
}
