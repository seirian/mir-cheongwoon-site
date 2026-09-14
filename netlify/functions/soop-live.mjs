const SOOP_CHANNEL_ID = 'alice427';
const SOOP_PLAY_URL = `https://play.sooplive.com/${SOOP_CHANNEL_ID}`;
const SOOP_LIVE_API = 'https://live.sooplive.com/afreeca/player_live_api.php';

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=15',
  'Netlify-CDN-Cache-Control': 'public, durable, max-age=30, stale-while-revalidate=30',
};

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: responseHeaders });

export default async (req) => {
  if (req.method !== 'GET') {
    return json({ status: 'unknown', error: 'method_not_allowed' }, 405);
  }

  try {
    const pageResponse = await fetch(SOOP_PLAY_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MirCheongwoonSite/1.0; +https://mir-cheongwoon.netlify.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!pageResponse.ok) {
      return json({ status: 'unknown', channelId: SOOP_CHANNEL_ID });
    }

    const html = await pageResponse.text();
    const broadcastMatch = html.match(/window\.nBroadNo\s*=\s*(\d+)\s*;/);
    const broadcastNo = broadcastMatch?.[1];

    if (!broadcastNo) {
      const isExplicitlyOffline =
        html.includes('스트리머가 오프라인입니다') ||
        /window\.nBroadNo\s*=\s*(?:0|null|undefined)\s*;/.test(html);

      return json({
        status: isExplicitlyOffline ? 'offline' : 'unknown',
        channelId: SOOP_CHANNEL_ID,
      });
    }

    const form = new URLSearchParams({
      from_api: '0',
      mode: 'landing',
      player_type: 'html5',
      stream_type: 'common',
      type: 'live',
      bid: SOOP_CHANNEL_ID,
      bno: broadcastNo,
      pwd: '',
    });

    const liveResponse = await fetch(SOOP_LIVE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'https://play.sooplive.com',
        Referer: SOOP_PLAY_URL,
        'User-Agent': 'Mozilla/5.0 (compatible; MirCheongwoonSite/1.0; +https://mir-cheongwoon.netlify.app)',
      },
      body: form,
    });

    if (!liveResponse.ok) {
      return json({ status: 'unknown', channelId: SOOP_CHANNEL_ID });
    }

    const liveData = await liveResponse.json();
    const channel = liveData?.CHANNEL;
    const result = Number(channel?.RESULT);
    const isLive = result === 1 && Boolean(channel?.BNO || broadcastNo);

    if (!isLive) {
      return json({ status: 'unknown', channelId: SOOP_CHANNEL_ID });
    }

    return json({
      status: 'live',
      channelId: SOOP_CHANNEL_ID,
      broadcastNo: channel?.BNO || broadcastNo,
      title: channel?.TITLE || '',
      streamer: channel?.BJNICK || '미르_MIR',
      watchUrl: SOOP_PLAY_URL,
    });
  } catch (error) {
    console.error('SOOP live status check failed', error);
    return json({ status: 'unknown', channelId: SOOP_CHANNEL_ID });
  }
};
