"""No-flash and decorative-label regression. No production writes/auth."""
import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from playwright.async_api import async_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4173/')
parser.add_argument('--out', default='hero-image-report')
parser.add_argument('--live', action='store_true')
parser.add_argument('--expected-sha', default='')
args = parser.parse_args()
base = args.url.rstrip('/') + '/'
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
assert urlsplit(base).hostname in (['mir.yeop.net'] if args.live else ['127.0.0.1', 'localhost'])
results = []

def check(name, passed, **details):
    results.append({'check': name, 'passed': bool(passed), **details})
    if not passed:
        raise AssertionError(name + ' ' + str(details))

TRACE = """(() => {
  window.heroSources = [];
  window.heroLabelOverlap = false;
  const capture = () => {
    for (const img of document.querySelectorAll('.promo-mir-portrait')) {
      const src = img.getAttribute('src');
      if (!window.heroSources.includes(src)) window.heroSources.push(src);
      const label = document.querySelector('.promo-art-index');
      if (getComputedStyle(img).visibility === 'visible' && label && getComputedStyle(label).visibility === 'visible' && getComputedStyle(label).display !== 'none') window.heroLabelOverlap = true;
    }
  };
  new MutationObserver(capture).observe(document, {subtree:true, childList:true, attributes:true, attributeFilter:['src','style']});
})();"""

async def scenario(browser, width, mode):
    context = await browser.new_context(viewport={'width': width, 'height': 1000}, reduced_motion='reduce')
    await context.add_init_script(TRACE)
    page = await context.new_page()
    errors = []
    fallback_requests = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: fallback_requests.append(request.url) if urlsplit(request.url).path.endswith('/mir-profile-still.webp') else None)
    lookup_gate, image_gate = asyncio.Event(), asyncio.Event()
    lookup_seen, image_seen = asyncio.Event(), asyncio.Event()
    state = {'mode': mode}
    custom_path = '/storage/v1/object/public/gallery/site-hero/production/current.webp'

    async def route_request(route):
        request = route.request
        url = urlsplit(request.url)
        headers = {'access-control-allow-origin': '*'}
        if url.path.endswith('/storage/v1/object/list/gallery') and request.method == 'POST':
            lookup_seen.set()
            await lookup_gate.wait()
            await asyncio.sleep(0.15)
            if args.live:
                return await route.continue_()
            data = [] if state['mode'] in ['empty', 'empty-broken'] else [{'name':'current.webp', 'id':'test-image', 'updated_at':'2026-09-29T01:00:00Z'}]
            if state['mode'] == 'lookup-error':
                return await route.fulfill(status=503, content_type='application/json', body='{"message":"test outage"}', headers=headers)
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps(data), headers=headers)
        if url.path == custom_path:
            image_seen.set()
            await image_gate.wait()
            if args.live:
                return await route.continue_()
            if state['mode'] == 'image-error':
                return await route.fulfill(status=404, body='test missing image')
            return await route.fulfill(status=200, content_type='image/webp', body=Path('public/mir-profile-site.webp').read_bytes(), headers=headers)
        if args.live:
            # Fresh anonymous browser: block writes; the exact list POST above is read-only.
            if request.method not in ['GET', 'HEAD', 'OPTIONS']:
                return await route.abort()
            return await route.continue_()
        if url.path.endswith('/mir-profile-still.webp') and state['mode'] == 'empty-broken':
            return await route.fulfill(status=404, body='test missing bundled image')
        if '/api/' in url.path:
            return await route.fulfill(status=200, content_type='application/json', body='{"status":"offline"}')
        if url.hostname in ['127.0.0.1', 'localhost']:
            return await route.continue_()
        if url.hostname and url.hostname.endswith('.supabase.co'):
            return await route.fulfill(status=200, content_type='application/json', body='[]', headers=headers)
        return await route.abort()

    await context.route('**/*', route_request)
    try:
        await page.goto(base, wait_until='domcontentloaded')
        await page.locator('#home-title').wait_for()
        await asyncio.wait_for(lookup_seen.wait(), timeout=20)
        if args.expected_sha:
            release = await page.locator('meta[name="yeop-release"]').get_attribute('content')
            check('expected production release', release.endswith('_' + args.expected_sha[:8]), release=release)
        await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        check('no portrait before saved-image lookup resolves', await page.locator('.promo-mir-portrait').count() == 0, width=width, mode=mode)
        check('bundled image never requested while lookup is pending', not fallback_requests, width=width, mode=mode)
        check('vertical archive label remains while portrait is absent', await page.locator('.promo-art-index').is_visible(), width=width, mode=mode)
        before = await page.locator('.promo-hero-art').bounding_box()
        if mode == 'saved':
            await page.screenshot(path=str(out / f'pending-{width}.png'), full_page=True)
        lookup_gate.set()
        retry = page.get_by_role('button', name='이미지 다시 불러오기', exact=True)
        if mode == 'lookup-error':
            await retry.wait_for()
            check('lookup failure is not treated as missing custom image', not fallback_requests and await page.locator('.promo-mir-portrait').count() == 0, width=width)
            check('lookup error retains decorative label without portrait', await page.locator('.promo-art-index').is_visible(), width=width)
            state['mode'] = 'saved'
            await retry.click()
        if mode not in ['empty', 'empty-broken']:
            await asyncio.wait_for(image_seen.wait(), timeout=20)
            await page.locator('.promo-mir-portrait').wait_for(state='attached')
            check('selected image stays hidden until load completes', not await page.locator('.promo-mir-portrait').is_visible() and not fallback_requests, width=width, mode=mode)
            check('vertical label remains until portrait actually loads', await page.locator('.promo-art-index').is_visible(), width=width, mode=mode)
        image_gate.set()
        if mode in ['image-error', 'empty-broken']:
            await retry.wait_for()
            count = len(fallback_requests)
            await page.wait_for_timeout(250)
            check('failed image has no fallback flash or retry loop', await page.locator('.promo-mir-portrait').count() == 0 and len(fallback_requests) == count and count == (1 if mode == 'empty-broken' else 0), width=width, mode=mode)
            check('image error retains decorative label without portrait', await page.locator('.promo-art-index').is_visible(), width=width, mode=mode)
            state['mode'] = 'saved'
            await retry.click()
        await page.wait_for_function("""() => { const img=document.querySelector('.promo-mir-portrait'); return img && img.naturalWidth>0 && getComputedStyle(img).visibility==='visible'; }""")
        src = await page.locator('.promo-mir-portrait').get_attribute('src')
        check('only resolved portrait becomes visible', '/mir-profile-still.webp' in src if mode == 'empty' else custom_path in src, width=width, mode=mode)
        check('visible portrait removes only vertical archive label', await page.locator('.promo-art-index').count() == 0, width=width, mode=mode)
        caption = page.locator('.promo-hero-art figcaption')
        check('bottom artist caption is preserved', await caption.is_visible() and '미르 × 청운밴드' in await caption.inner_text(), width=width, mode=mode)
        after = await page.locator('.promo-hero-art').bounding_box()
        check('portrait loading keeps hero dimensions stable', abs(before['width']-after['width'])<1 and abs(before['height']-after['height'])<1, width=width, mode=mode)
        check('no page-wide horizontal overflow', await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), width=width, mode=mode)
        check('portrait and vertical label never become visible together', not await page.evaluate('window.heroLabelOverlap'), width=width, mode=mode)
        if mode == 'saved':
            for visit in ['reload', 'return-home']:
                if visit == 'reload':
                    await page.reload(wait_until='domcontentloaded')
                else:
                    await page.locator('a.promo-artist-card[href$="/band"]').click()
                    await page.get_by_role('heading', name='청운밴드', level=1, exact=True).wait_for()
                    await page.locator('a.brand').click()
                await page.wait_for_function("""() => { const img=document.querySelector('.promo-mir-portrait'); return img && img.naturalWidth>0 && getComputedStyle(img).visibility==='visible'; }""")
                sources = await page.evaluate('window.heroSources')
                check('revisit never requests or mounts bundled portrait', not fallback_requests and all(custom_path in source for source in sources), width=width, visit=visit, sources=sources)
                check('revisit portrait hides vertical label without overlap', await page.locator('.promo-art-index').count() == 0 and not await page.evaluate('window.heroLabelOverlap'), width=width, visit=visit)
            await page.screenshot(path=str(out / f'ready-{width}.png'), full_page=True)
        check('no JavaScript errors', not errors, width=width, mode=mode, errors=errors)
    except Exception:
        await page.screenshot(path=str(out / f'failure-{mode}-{width}.png'), full_page=True)
        raise
    finally:
        lookup_gate.set()
        image_gate.set()
        await context.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            for width in [1440, 390]:
                for mode in (['saved'] if args.live else ['saved', 'empty', 'lookup-error', 'image-error', 'empty-broken']):
                    await scenario(browser, width, mode)
        finally:
            await browser.close()

try:
    asyncio.run(main())
finally:
    (out / 'results.json').write_text(json.dumps({'live':args.live,'checks':results}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed':len(results),'live':args.live}))
