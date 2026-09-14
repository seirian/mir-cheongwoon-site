const CAFE_ID = '31003156';
const MENU_ID = '10';
const BOARD_URL = `https://cafe.naver.com/f-e/cafes/${CAFE_ID}/menus/${MENU_ID}?viewType=I`;
const ARTICLE_LIST_URL = `https://apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/${CAFE_ID}/menus/${MENU_ID}/articles`;
const ARTICLE_URL = (articleId) => `https://apis.naver.com/cafe-web/cafe-articleapi/v3/cafes/${CAFE_ID}/articles/${articleId}`;
const ARTICLE_PAGE_URL = (articleId) => `https://cafe.naver.com/f-e/cafes/${CAFE_ID}/articles/${articleId}`;
const IMAGE_PROXY_PATH = '/.netlify/functions/naver-fanart-image';

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'Netlify-CDN-Cache-Control': 'public, durable, max-age=600, stale-while-revalidate=1800',
};

const naverHeaders = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://cafe.naver.com',
  Referer: BOARD_URL,
  'X-Cafe-Product': 'pc',
  'User-Agent': 'Mozilla/5.0 (compatible; MirCheongwoonSite/1.0; +https://mir-cheongwoon.netlify.app)',
};

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: responseHeaders });

const unwrap = (data) => {
  if (!data || typeof data !== 'object') return {};
  if (data.message?.result && typeof data.message.result === 'object') return data.message.result;
  if (data.result && typeof data.result === 'object') return data.result;
  return data;
};

const articleNode = (entry) => (entry?.item && typeof entry.item === 'object' ? entry.item : entry || {});

const toMillis = (value) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value >= 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim()) {
    const text = value.trim();
    if (/^\d+$/.test(text)) {
      const numeric = Number(text);
      return numeric >= 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const articleTimestamp = (node) => {
  for (const key of ['writeDateTimestamp', 'writeDate', 'addDate', 'menuArticleWriteDate']) {
    const millis = toMillis(node?.[key]);
    if (millis) return millis;
  }
  return 0;
};

const kstDateKey = (millis = Date.now()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(millis));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const decodeHtml = (value = '') => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

const normalizeImageUrl = (value) => {
  if (typeof value !== 'string') return '';
  let url = decodeHtml(value.trim());
  if (url.startsWith('//')) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) return '';
  return url;
};

const isLikelyContentImage = (url) => {
  if (!url) return false;
  if (!/(?:pstatic\.net|naver\.net|naver\.com)/i.test(url)) return false;
  return !/(?:profile|emoticon|sticker|cafe_icon|default|banner|sp_|ico_)/i.test(url);
};

const imageFromTag = (tag) => {
  for (const attribute of ['data-lazy-src', 'data-src', 'src']) {
    const pattern = new RegExp(`(?:^|\\s)${attribute}\\s*=\\s*["']([^"']+)["']`, 'i');
    const match = tag.match(pattern);
    const url = normalizeImageUrl(match?.[1]);
    if (isLikelyContentImage(url)) return url;
  }
  return '';
};

const imagesFromHtml = (html = '') => {
  const images = [];
  for (const tagMatch of html.matchAll(/<img\b[^>]*>/gi)) {
    const url = imageFromTag(tagMatch[0]);
    if (url && !images.includes(url)) images.push(url);
  }
  return images;
};

const imagesFromObject = (value, keyHint = '', found = [], depth = 0) => {
  if (depth > 7 || found.length >= 12 || value == null) return found;
  if (typeof value === 'string') {
    if (/(?:image|photo|thumb|src|url)/i.test(keyHint)) {
      const url = normalizeImageUrl(value);
      if (isLikelyContentImage(url) && !found.includes(url)) found.push(url);
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => imagesFromObject(item, keyHint, found, depth + 1));
    return found;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => imagesFromObject(item, key, found, depth + 1));
  }
  return found;
};

const firstText = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const authorFrom = (article, listNode) => {
  const writer = article?.writer || article?.member || article?.author || {};
  const writerInfo = listNode?.writerInfo || {};
  return firstText(
    writer.nickName,
    writer.nick,
    writer.nickname,
    writer.name,
    writer.memberNickname,
    writerInfo.nickName,
    writerInfo.nick,
    writerInfo.nickname,
    article?.writerNickname,
    article?.writerName,
    article?.memberNickname,
    listNode?.writerNickname,
    listNode?.writerName,
    listNode?.memberNickname,
    listNode?.nickName,
    listNode?.nickname,
  ) || '작성자';
};

const stableHash = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const stableOrder = (items, seed) => [...items].sort((a, b) => {
  const aScore = stableHash(`${seed}:${a.articleId}`);
  const bScore = stableHash(`${seed}:${b.articleId}`);
  return aScore - bScore;
});

const listArticles = async () => {
  const url = new URL(ARTICLE_LIST_URL);
  url.searchParams.set('page', '1');
  url.searchParams.set('pageSize', '50');
  url.searchParams.set('sortBy', 'TIME');
  url.searchParams.set('viewType', 'L');

  const response = await fetch(url, { headers: naverHeaders, redirect: 'follow' });
  if (!response.ok) throw new Error(`article_list_http_${response.status}`);

  const data = unwrap(await response.json());
  const raw = data.articleList || data.articles || [];
  return raw
    .filter((entry) => !entry?.type || entry.type === 'ARTICLE')
    .map((entry) => {
      const node = articleNode(entry);
      const articleId = Number(node.articleId || node.articleid || 0);
      const timestamp = articleTimestamp(node);
      if (!articleId || !timestamp) return null;
      return {
        articleId,
        title: firstText(node.subject, node.title),
        timestamp,
        date: kstDateKey(timestamp),
        node,
      };
    })
    .filter(Boolean);
};

const loadArticle = async (candidate) => {
  const url = new URL(ARTICLE_URL(candidate.articleId));
  url.searchParams.set('query', '');
  url.searchParams.set('useCafeId', 'true');
  url.searchParams.set('requestFrom', 'A');

  const response = await fetch(url, { headers: naverHeaders, redirect: 'follow' });
  if (!response.ok) return null;

  const result = unwrap(await response.json());
  const article = result.article && typeof result.article === 'object' ? result.article : null;
  if (!article) return null;

  const contentHtml = firstText(article.contentHtml, article.content);
  const contentImages = imagesFromHtml(contentHtml);
  const structuredImages = imagesFromObject(article);
  const sourceImageUrl = contentImages[0] || structuredImages[0] || '';
  if (!sourceImageUrl) return null;

  return {
    articleId: candidate.articleId,
    title: firstText(article.subject, candidate.title, '팬아트'),
    author: authorFrom(article, candidate.node),
    imageUrl: `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(sourceImageUrl)}`,
    articleUrl: ARTICLE_PAGE_URL(candidate.articleId),
    sourceDate: candidate.date,
  };
};

export default async (req) => {
  if (req.method !== 'GET') {
    return json({ status: 'error', error: 'method_not_allowed' }, 405);
  }

  try {
    const articles = await listArticles();
    if (!articles.length) return json({ status: 'empty', boardUrl: BOARD_URL });

    const today = kstDateKey();
    const todayArticles = articles.filter((item) => item.date === today);
    const latestDate = articles[0]?.date || today;
    const pool = todayArticles.length
      ? todayArticles
      : articles.filter((item) => item.date === latestDate);

    for (const candidate of stableOrder(pool, `${today}:${pool.length}`).slice(0, 12)) {
      const featured = await loadArticle(candidate);
      if (featured) {
        return json({
          status: 'ok',
          isToday: featured.sourceDate === today,
          today,
          boardUrl: BOARD_URL,
          ...featured,
        });
      }
    }

    return json({
      status: 'empty',
      today,
      sourceDate: pool[0]?.date || latestDate,
      boardUrl: BOARD_URL,
      error: 'no_image_post_found',
    });
  } catch (error) {
    console.error('Naver fan art lookup failed', error);
    return json({ status: 'error', boardUrl: BOARD_URL, error: 'fanart_lookup_failed' }, 502);
  }
};
