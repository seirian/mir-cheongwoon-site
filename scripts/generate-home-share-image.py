"""Capture the candidate build's public hero, never an authenticated/admin page.

Production output is a release-scoped PNG, not a browser-side metadata mutation.
Only a successful stored-image lookup (including a confirmed empty result) may
produce a snapshot. Network/image errors fail before replacing the prior asset.
"""
import argparse
import base64
from datetime import datetime, timezone
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import struct
from threading import Thread
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

PRODUCTION = 'nohboljeugjmtwnvtayu.supabase.co'
FIXTURE = 'preview-fixture.supabase.co'
FOLDER = 'site-hero/production'
OBJECT = '/storage/v1/object/public/gallery/' + FOLDER + '/current.webp'


def generate(dist, asset_base, report_dir, fixture=None, executable=None):
    dist, report_dir = Path(dist).resolve(), Path(report_dir).resolve()
    if not re.fullmatch(r'/(?:_yeop_releases/r[0-9]{14}_[a-f0-9]{8}/)?', asset_base):
        raise ValueError('Expected root or release-scoped asset base')
    if not (dist / 'index.html').is_file():
        raise ValueError('Build index.html is missing')
    # All non-home assets (including the BLUED-specific thumbnail) must be preserved.
    target = dist / 'og/home.png'
    preserved = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in dist.rglob('*') if p.is_file() and p != target}
    report_dir.mkdir(parents=True, exist_ok=True)

    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if not urlsplit(self.path).path.startswith(asset_base):
                self.send_error(404)
                return
            self.path = '/' + self.path[len(asset_base):]
            super().do_GET()

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(dist)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    state = {'lookup': False, 'saved': False, 'errors': []}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(**({'executable_path': executable} if executable else {}))
            try:
                context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce', service_workers='block')
                project = FIXTURE if fixture else PRODUCTION

                def intercept(route):
                    request, url = route.request, urlsplit(route.request.url)
                    cors = {'access-control-allow-origin': '*'}
                    if url.hostname == project and url.path in ['/storage/v1/object/list/gallery', OBJECT] and request.method == 'OPTIONS':
                        return route.fulfill(status=204, headers={**cors, 'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info'})
                    if url.hostname == project and url.path == '/storage/v1/object/list/gallery' and request.method == 'POST':
                        body = request.post_data_json
                        if body != {'prefix': FOLDER, 'limit': 1, 'offset': 0, 'sortBy': {'column': 'name', 'order': 'asc'}, 'search': 'current.webp'}:
                            # SDKs may omit defaults; the security-relevant fields are fixed.
                            if not isinstance(body, dict) or body.get('prefix') != FOLDER or body.get('search') != 'current.webp' or body.get('limit') != 1:
                                return route.abort()
                        if fixture:
                            data = [] if fixture == 'empty' else [{'name': 'current.webp', 'updated_at': '2026-09-29T00:00:00Z'}]
                            if fixture == 'outage':
                                return route.fulfill(status=503, content_type='application/json', body='{"message":"synthetic outage"}', headers=cors)
                        else:
                            response = route.fetch(timeout=20000)
                            if response.status != 200:
                                state['errors'].append('Hero metadata request failed')
                                return route.fulfill(response=response)
                            data = response.json()
                        if not isinstance(data, list):
                            raise ValueError('Unexpected hero metadata response')
                        state['lookup'] = True
                        state['saved'] = any(row.get('name') == 'current.webp' for row in data)
                        return route.fulfill(status=200, content_type='application/json', body=json.dumps(data), headers=cors)
                    if request.method not in ['GET', 'HEAD', 'OPTIONS']:
                        return route.abort()  # No auth, upload, RPC, or data mutation.
                    if url.hostname == project and url.path == OBJECT:
                        if fixture:
                            if fixture == 'image-error':
                                return route.fulfill(status=404, body='Synthetic missing image')
                            return route.fulfill(status=200, content_type='image/webp', body=(dist / 'mir-profile-site.webp').read_bytes(), headers=cors)
                        return route.continue_()
                    if url.hostname == project and url.path.startswith('/rest/v1/'):
                        # Non-hero sections are not in the capture; do not query their data.
                        return route.fulfill(status=200, content_type='application/json', body='[]', headers=cors)
                    if url.hostname == '127.0.0.1' and url.port == server.server_port:
                        if '/api/' in url.path:
                            return route.fulfill(status=200, content_type='application/json', body='{"status":"unknown"}')
                        return route.continue_()
                    if not fixture and url.scheme == 'https' and url.hostname in ['fonts.googleapis.com', 'fonts.gstatic.com']:
                        return route.continue_()
                    return route.abort()

                context.route('**/*', intercept)
                page = context.new_page()
                page.on('pageerror', lambda error: state['errors'].append(str(error)))
                page.goto(origin + asset_base, wait_until='domcontentloaded')
                page.wait_for_function("""() => {
                  const image = document.querySelector('.promo-mir-portrait');
                  return document.querySelector('.hero-image-feedback button') ||
                    (image && image.complete && image.naturalWidth > 0 && getComputedStyle(image).visibility === 'visible');
                }""", timeout=35000)
                if not state['lookup'] or state['errors'] or page.locator('.hero-image-feedback button').count():
                    raise RuntimeError('No verified current hero image; snapshot not replaced')
                image = page.locator('.promo-mir-portrait')
                source = image.get_attribute('src')
                if (state['saved'] and urlsplit(source).path != OBJECT) or (not state['saved'] and not source.endswith('/mir-profile-still.webp')):
                    raise RuntimeError('Snapshot would use the wrong hero image')
                if page.locator('.review-banner,.hero-image-manage,.promo-art-index').count():
                    raise RuntimeError('Preview, administrator or image-overlap decoration is present')
                page.evaluate('document.fonts.ready')
                # Time-dependent live status does not belong in a cached sharing card.
                # This only affects the isolated capture, never the served page or CSS.
                page.add_style_tag(content='.promo-live-status { visibility:hidden !important; }')
                hero = page.locator('.promo-hero')
                screenshot = hero.screenshot(animations='disabled')
                encoded = page.evaluate("""async (source) => {
                  const image = new Image(); image.src = source; await image.decode();
                  const canvas = document.createElement('canvas'); canvas.width=1200; canvas.height=630;
                  const ctx=canvas.getContext('2d'); ctx.fillStyle='#0d1424'; ctx.fillRect(0,0,1200,630);
                  const ratio=Math.min(1120/image.width,582/image.height);
                  const w=image.width*ratio,h=image.height*ratio;
                  ctx.drawImage(image,(1200-w)/2,(630-h)/2,w,h);
                  return canvas.toDataURL('image/png').split(',')[1];
                }""", 'data:image/png;base64,' + base64.b64encode(screenshot).decode())
                png = base64.b64decode(encoded, validate=True)
                if png[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('!II', png[16:24]) != (1200, 630) or not 5000 < len(png) < 5_000_000:
                    raise RuntimeError('Invalid sharing PNG')
                html = (dist / 'index.html').read_text(encoding='utf-8')
                expected = 'https://mir.yeop.net' + asset_base + 'og/home.png'
                if f'property="og:image" content="{expected}"' not in html or f'name="twitter:image" content="{expected}"' not in html:
                    raise RuntimeError('Raw HTML does not reference the generated sharing image')
                target.parent.mkdir(parents=True, exist_ok=True)
                temp = target.with_suffix('.tmp')
                temp.write_bytes(png)
                temp.replace(target)
                if any(hashlib.sha256(path.read_bytes()).hexdigest() != checksum for path, checksum in preserved.items()):
                    raise RuntimeError('Non-home build contents changed')
                report = {'status': 'generated', 'captured_at': datetime.now(timezone.utc).isoformat(),
                          'asset_base': asset_base, 'image_url': expected, 'hero_source': source,
                          'saved_image': state['saved'], 'width': 1200, 'height': 630,
                          'sha256': hashlib.sha256(png).hexdigest(), 'bytes': len(png),
                          'other_build_files_unchanged': True, 'fixture': fixture,
                          'scope': 'deployment-time snapshot; external link-preview caches are not invalidated'}
                (report_dir / 'home.png').write_bytes(png)
                (report_dir / 'hero-capture.png').write_bytes(screenshot)
                (report_dir / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
                return report
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dist', default='dist')
    parser.add_argument('--asset-base', default='/')
    parser.add_argument('--report-dir', default='share-image-report')
    parser.add_argument('--fixture', choices=['saved', 'empty', 'outage', 'image-error'])
    parser.add_argument('--executable')
    options = parser.parse_args()
    result = generate(options.dist, options.asset_base, options.report_dir, options.fixture, options.executable)
    print(json.dumps({'status': result['status'], 'width': result['width'], 'height': result['height'], 'bytes': result['bytes']}))
