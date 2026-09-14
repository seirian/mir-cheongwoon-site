export function getYouTubeVideoId(value) {
  if (!value || typeof value !== 'string') return '';

  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || '';
    }

    if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return '';

    if (url.pathname === '/watch') return url.searchParams.get('v') || '';

    const parts = url.pathname.split('/').filter(Boolean);
    if (['shorts', 'live', 'embed'].includes(parts[0])) return parts[1] || '';

    return '';
  } catch {
    return '';
  }
}

export function getYouTubeEmbedUrl(value) {
  const videoId = getYouTubeVideoId(value);
  return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : '';
}
