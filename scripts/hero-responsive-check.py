"""Compare mobile centering and unchanged desktop rendering. Never upload data."""
import argparse
import json
from pathlib import Path
import struct
from urllib.parse import urlsplit
import zlib
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4173/')
parser.add_argument('--baseline-url', required=True)
parser.add_argument('--out', default='hero-responsive-report')
parser.add_argument('--live', action='store_true')
parser.add_argument('--expected-sha', default='')
args = parser.parse_args()
allowed_hosts = ['mir.yeop.net'] if args.live else ['127.0.0.1', 'localhost']
assert all(urlsplit(url).hostname in allowed_hosts for url in [args.url, args.baseline_url])
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
results, errors = [], []
widths = [320, 360, 390, 412, 430, 520, 640, 768, 800, 801, 1024, 1440, 1920, 2560]


def check(name, passed, **details):
    results.append({'check': name, 'passed': bool(passed), **details})
    if not passed:
        raise AssertionError(name + ' ' + str(details))


def raster(width, height):
    """Opaque, synthetic PNG of known dimensions; not a site asset or upload."""
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    raw = (b'\x00' + bytes([112, 153, 210]) * width) * height
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')


# Document coordinates exclude scroll anchoring after viewport resize/screenshots.
METRICS = """() => {
 const selectors=['.promo-hero','.promo-hero-copy','.promo-hero-art','.promo-mir-portrait','.promo-hero-art figcaption','#home-title','.promo-hero-actions'];
 const keys=['position','width','height','left','right','top','bottom','transform','objectFit','objectPosition','paddingLeft','paddingRight','fontSize','lineHeight'];
 return Object.fromEntries(selectors.map(selector=>{
  const el=document.querySelector(selector),r=el.getBoundingClientRect(),s=getComputedStyle(el);
  return [selector,{box:Object.fromEntries(['x','y','width','height'].map(k=>[k,Math.round((r[k]+(k==='x'?scrollX:k==='y'?scrollY:0))*1000)/1000])),style:Object.fromEntries(keys.map(k=>[k,s[k]]))}];
 }));
}"""
READY = """() => {const el=document.querySelector('.promo-mir-portrait');return el && el.complete && el.naturalWidth>0 && getComputedStyle(el).visibility==='visible';}"""
state = {'raster': raster(600, 600)}


def intercept(route):
    request, url = route.request, urlsplit(route.request.url)
    headers = {'access-control-allow-origin': '*'}
    is_list = url.path.endswith('/storage/v1/object/list/gallery') and request.method == 'POST'
    if args.live:
        # The Storage list POST is a read. All other non-read requests are blocked.
        if request.method not in ['GET', 'HEAD', 'OPTIONS'] and not is_list:
            return route.abort()
        return route.continue_()
    if is_list:
        return route.fulfill(status=200, content_type='application/json', headers=headers,
            body=json.dumps([{'name':'current.webp','id':'fixture-portrait','updated_at':'2026-09-29T00:00:00Z'}]))
    if '/storage/v1/object/public/gallery/site-hero/production/current.webp' in url.path:
        return route.fulfill(status=200, content_type='image/png', body=state['raster'], headers=headers)
    if '/api/' in url.path:
        return route.fulfill(status=200, content_type='application/json', body='{"status":"offline"}')
    if url.hostname and url.hostname.endswith('.supabase.co'):
        return route.fulfill(status=200, content_type='application/json', body='[]', headers=headers)
    if url.hostname in allowed_hosts:
        return route.continue_()
    return route.abort()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
    context.route('**/*', intercept)
    current, baseline = context.new_page(), context.new_page()
    for page in [current, baseline]:
        page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        variants = [('live', None)] if args.live else [('square',(600,600)),('portrait',(600,1000)),('landscape',(1000,600))]
        for variant, size in variants:
            if size:
                state['raster'] = raster(*size)
            for width in widths:
                # Load after setting the viewport. Comparing two background tabs
                # immediately after resize can observe stale breakpoint styles.
                for page, url in [(baseline,args.baseline_url),(current,args.url)]:
                    page.set_viewport_size({'width':width,'height':1000})
                    page.bring_to_front()
                    page.goto(url, wait_until='domcontentloaded')
                    page.wait_for_function(READY, timeout=30000)
                    page.evaluate('document.fonts.ready')
                    page.evaluate('window.scrollTo(0,0)')
                    page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                if args.expected_sha and width == widths[0]:
                    release = current.locator('meta[name=yeop-release]').get_attribute('content')
                    check('expected live release', release.endswith('_'+args.expected_sha[:8]), release=release)
                before, after = baseline.evaluate(METRICS), current.evaluate(METRICS)
                (out/f'metrics-{variant}-{width}.json').write_text(json.dumps({'before':before,'after':after},ensure_ascii=False,indent=2),encoding='utf-8')
                check('no page-wide overflow', current.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), width=width, variant=variant)
                check('visible image has no vertical archive label', current.locator('.promo-art-index').count()==0, width=width, variant=variant)
                image, frame = after['.promo-mir-portrait'], after['.promo-hero-art']['box']
                old_image = before['.promo-mir-portrait']
                if width <= 800:
                    box = image['box']
                    gap_left, gap_right = box['x']-frame['x'], frame['x']+frame['width']-box['x']-box['width']
                    check('mobile image box centered', abs(gap_left-gap_right)<1, width=width, variant=variant, left=gap_left, right=gap_right)
                    check('contained image pixels centered with original bottom alignment', image['style']['objectPosition']=='50% 100%' and image['style']['objectFit']=='contain', width=width, variant=variant)
                    check('mobile image size unchanged', all(abs(box[k]-old_image['box'][k])<1 for k in ['width','height','y']), width=width, variant=variant, before=old_image['box'], after=box)
                    check('mobile hero text caption and frame unchanged', all(after[key]==before[key] for key in after if key!='.promo-mir-portrait'), width=width, variant=variant)
                    old_box=old_image['box']
                    old_delta=abs(old_box['x']+old_box['width']/2-frame['x']-frame['width']/2)
                    check('baseline reproduces right aligned image', old_delta>1, width=width, variant=variant, center_offset=old_delta)
                else:
                    check('desktop geometry and styles identical to pre-fix CSS', after==before, width=width, variant=variant)
                    if not args.live:
                        old_png = baseline.locator('.promo-hero').screenshot(animations='disabled')
                        new_png = current.locator('.promo-hero').screenshot(animations='disabled')
                        (out/f'desktop-before-{variant}-{width}.png').write_bytes(old_png)
                        (out/f'desktop-after-{variant}-{width}.png').write_bytes(new_png)
                        check('desktop hero pixel-identical', old_png==new_png, width=width, variant=variant)
                if variant in ['square','live'] and width in [390,1440]:
                    for name, page in [('before',baseline),('after',current)]:
                        page.locator('.promo-hero-art').screenshot(path=str(out/f'{name}-image-{width}.png'), animations='disabled')
                        page.evaluate('window.scrollTo(0,0)')
                        page.screenshot(path=str(out/f'{name}-top-{width}.png'), animations='disabled')
        check('no JavaScript errors', not errors, errors=errors)
    except Exception:
        for name, page in [('before',baseline),('after',current)]:
            page.screenshot(path=str(out/f'failure-{name}.png'),full_page=True,animations='disabled')
        raise
    finally:
        (out/'results.json').write_text(json.dumps({'live':args.live,'checks':results,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()
print(json.dumps({'passed':len(results),'live':args.live}))
