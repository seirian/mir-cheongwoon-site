"""Read-only anonymous production check; never submit any member's credentials."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--expected-sha', required=True)
parser.add_argument('--out', default='password-live-report')
args = parser.parse_args()
out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
checks = []
def check(name, ok, **details):
    checks.append({'check':name, 'passed':bool(ok), **details})
    if not ok: raise AssertionError(name)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for width in [1440,390]:
                context = browser.new_context(viewport={'width':width,'height':1000})
                # All mutations are blocked in this separate anonymous browser.
                context.route('**/*', lambda route: route.continue_() if route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
                page = context.new_page()
                page.goto('https://mir.yeop.net/account?mode=password',wait_until='domcontentloaded')
                page.get_by_role('heading',name='회원 로그인',exact=True).wait_for()
                release=page.locator('meta[name=yeop-release]').get_attribute('content')
                check('expected deployment active',release.endswith('_'+args.expected_sha[:8]),width=width,release=release)
                check('password form protected for logged-out visitor',page.get_by_label('기존 비밀번호',exact=True).count()==0,width=width)
                check('account remains noindex','noindex' in page.locator('meta[name=robots]').get_attribute('content'),width=width)
                check('account viewport does not overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width=width)
                page.screenshot(path=str(out/f'anonymous-{width}.png'),full_page=True)
                context.close()
        finally:
            browser.close()
finally:
    (out/'results.json').write_text(json.dumps({'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':len(checks)}))
