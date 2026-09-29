"""Distinguish stale saved artwork from freshly collected artwork without external writes."""
import base64
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

out = Path('fanart-review'); out.mkdir(exist_ok=True)
checks = []
def check(name, ok, **details):
    checks.append({'check': name, 'passed': bool(ok), **details})
    if not ok: raise AssertionError(name)

png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLVcAAAAASUVORK5CYII=')
image = '/api/naver-fanart-image.php?id=' + 'a'*64
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for width in [1440, 390]:
                for stale in [True, False]:
                    context = browser.new_context(viewport={'width': width, 'height': 1000})
                    feature = {'status': 'ok', 'articleId': 123, 'title': '테스트 팬아트', 'author': '테스트 작가',
                               'articleUrl': 'https://cafe.naver.com/f-e/cafes/31003156/articles/123',
                               'sourceDate': '2026-09-21' if stale else '2026-09-30', 'isToday': not stale,
                               'fallback': stale, 'stale': stale, 'imageUrl': image, 'imageUrls': [image]}
                    def intercept(route):
                        req = route.request; url = urlsplit(req.url)
                        if req.method not in ['GET', 'HEAD', 'OPTIONS']: return route.abort()
                        if url.path.endswith('/api/naver-fanart.php'):
                            return route.fulfill(content_type='application/json', body=json.dumps(feature))
                        if url.path.endswith('/api/naver-fanart-image.php'):
                            return route.fulfill(content_type='image/png', body=png)
                        if url.hostname == 'preview-fixture.supabase.co':
                            return route.fulfill(content_type='application/json', body='[]', headers={'access-control-allow-origin': '*'})
                        if url.hostname in ['127.0.0.1', 'localhost']: return route.continue_()
                        return route.abort()
                    context.route('**/*', intercept)
                    page = context.new_page()
                    try:
                        page.goto('http://127.0.0.1:4173/schedule', wait_until='domcontentloaded')
                        card = page.locator('.fanart-card'); card.scroll_into_view_if_needed()
                        page.locator('.fanart-slide.is-active').wait_for()
                        check('explicit freshness badge', card.locator('.fanart-heading small').inner_text() == ('저장본 · 9월 21일' if stale else 'TODAY'), width=width, stale=stale)
                        if stale:
                            text = card.inner_text()
                            check('actual backup date and failed lookup visible', '최신 팬아트를 확인하지 못했습니다.' in text and '2026-09-21 게시글의 저장본' in text, width=width)
                        else:
                            check('fresh article has no stale warning', card.locator('.fanart-slide-note').count() == 0, width=width)
                        check('original link retained', card.locator('.fanart-post-link').get_attribute('href') == feature['articleUrl'], width=width, stale=stale)
                        check('calendar retained', page.locator('.schedule-grid').count() == 1, width=width, stale=stale)
                        check('no page overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), width=width, stale=stale)
                        card.screenshot(path=str(out/f'freshness-{stale}-{width}.png'))
                    finally:
                        context.close()
        finally:
            browser.close()
finally:
    (out/'freshness-results.json').write_text(json.dumps({'checks': checks}, ensure_ascii=False, indent=2))
print(json.dumps({'passed': len(checks)}))
