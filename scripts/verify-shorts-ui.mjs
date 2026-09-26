import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.SHORTS_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let mode = 'normal';
const rows = Array.from({ length: 10 }, (_, i) => ({ video_id: `short${String(i).padStart(6,'0')}`, title: `쇼츠 테스트 ${i+1}`, youtube_url: `https://www.youtube.com/shorts/short${String(i).padStart(6,'0')}`, position: i+1, synced_at: '2026-09-27T00:00:00Z' }));
await page.route('https://**.supabase.co/**', async (route) => {
  const url = new URL(route.request().url());
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (url.pathname.endsWith('/recent_shorts')) {
    assert.equal(url.searchParams.get('limit'), '10');
    assert.equal(url.searchParams.get('order'), 'position.asc');
    if (mode === 'loading') await new Promise((resolve) => setTimeout(resolve, 1200));
    return route.fulfill({ status: mode === 'error' ? 503 : 200, headers,
      body: JSON.stringify(mode === 'error' ? { message: 'test outage' } : mode === 'empty' ? [] : rows) });
  }
  const data = url.pathname.endsWith('/recent_videos') ? [{ video_id: 'video000001', title: '최신 일반영상 테스트', youtube_url: 'https://www.youtube.com/watch?v=video000001', position: 1 }]
    : url.pathname.endsWith('/videos') ? [{ id: 'cover', title: '커버 테스트', youtube_url: 'https://www.youtube.com/watch?v=video000002' }]
    : url.pathname.endsWith('/galleries') ? [{ id: 'gallery-test', title: '공연 갤러리 테스트', event_date: '2026-09-01', gallery_images: [] }]
    : [];
  return route.fulfill({ status: 200, headers, body: JSON.stringify(data) });
});
await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"offline"}' }));
await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Isolated video player fixture</p>' }));
await mkdir('shorts-test-results', { recursive: true });
try {
  await page.goto('http://127.0.0.1:4173/gallery');
  await page.getByRole('heading', { name: '최신 일반영상 테스트' }).waitFor();
  assert.deepEqual((await page.getByRole('tab').allTextContents()).map((v) => v.trim()), ['영상','쇼츠','갤러리']);
  await page.getByRole('tab', { name: '쇼츠', exact: true }).click();
  await page.locator('.shorts-card').nth(9).waitFor();
  assert.equal(await page.locator('.shorts-card').count(), 10);
  assert.equal(new URL(page.url()).searchParams.get('view'), 'shorts');
  assert.deepEqual(await page.locator('.shorts-card h2').allTextContents(), rows.map((r) => r.title));
  assert.equal(await page.locator('.shorts-card a').first().getAttribute('href'), rows[0].youtube_url);
  await page.reload(); await page.locator('.shorts-card').nth(9).waitFor();
  for (const [name,width,height] of [['desktop',1440,1080],['tablet',768,1024],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    const size = await page.locator('.shorts-gallery-frame').first().boundingBox();
    assert.ok(size.width >= 200, 'YouTube minimum player width');
    assert.ok(Math.abs(size.width / size.height - 9/16) < 0.01, 'portrait ratio');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow');
    await page.screenshot({path:`shorts-test-results/${name}.png`,fullPage:true});
  }
  await page.getByRole('tab', { name: '갤러리', exact: true }).click();
  await page.getByRole('heading', { name: '공연 갤러리 테스트' }).waitFor();
  assert.equal(await page.locator('.shorts-card').count(),0);
  await page.getByRole('tab', { name: '영상', exact: true }).click();
  await page.getByRole('heading', { name: '커버 테스트' }).waitFor();
  await page.goBack(); await page.getByRole('heading', { name: '공연 갤러리 테스트' }).waitFor();
  mode='empty'; await page.goto('http://127.0.0.1:4173/gallery?view=shorts');
  await page.getByRole('heading', { name: '등록된 쇼츠가 없습니다.' }).waitFor();
  mode='error'; await page.reload(); await page.getByRole('alert').waitFor();
  mode='normal'; await page.getByRole('button', {name:'다시 시도'}).click(); await page.locator('.shorts-card').nth(9).waitFor();
  mode='loading'; await page.reload(); await page.getByRole('status').filter({hasText:'쇼츠를 불러오는 중'}).waitFor();
  await page.locator('.shorts-card').nth(9).waitFor();
  await page.goto('http://127.0.0.1:4173/gallery?view=unknown');
  await page.getByRole('heading', { name: '최신 일반영상 테스트' }).waitFor();
  assert.deepEqual(errors, []);
  const result = { status:'passed', checks:['tab order','ten Shorts','latest order','deep link/reload','history navigation','general-video/gallery regression','desktop/tablet/mobile sizing','empty state','error/retry','loading state','invalid tab fallback','no page errors'] };
  await writeFile('shorts-test-results/ui.json', JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
