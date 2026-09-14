const BOARD_URL = 'https://cafe.naver.com/f-e/cafes/31003156/menus/10?viewType=I';

const isAllowedHost = (hostname) =>
  /(^|\.)pstatic\.net$/i.test(hostname)
  || /(^|\.)naver\.net$/i.test(hostname)
  || /(^|\.)naver\.com$/i.test(hostname);

const parseAllowedUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !isAllowedHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
};

const fetchImage = async (initialUrl) => {
  let current = initialUrl;

  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    const response = await fetch(current, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: BOARD_URL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
      },
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      const next = location ? parseAllowedUrl(new URL(location, current).toString()) : null;
      if (!next) throw new Error('invalid_image_redirect');
      current = next;
      continue;
    }

    return response;
  }

  throw new Error('too_many_image_redirects');
};

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const requestUrl = new URL(req.url);
  const sourceUrl = parseAllowedUrl(requestUrl.searchParams.get('url'));
  if (!sourceUrl) {
    return new Response('Invalid image URL', { status: 400 });
  }

  try {
    const upstream = await fetchImage(sourceUrl);
    if (!upstream.ok) {
      return new Response('Image fetch failed', { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return new Response('Unexpected image response', { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Netlify-CDN-Cache-Control': 'public, durable, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('Naver fan art image proxy failed', error);
    return new Response('Image unavailable', { status: 502 });
  }
};
