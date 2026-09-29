"""Only anonymous/invalid-token requests: never submit any member's credentials."""
import argparse
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
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

endpoint = 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/member-password'
# No email/user ID, real password, session or publishable key is used here.
synthetic = json.dumps({'currentPassword':'Not-a-member-credential', 'newPassword':'Synthetic-new-not-used', 'confirmPassword':'Synthetic-new-not-used'}).encode()
try:
    for case, method, expected, extra in [
        ('preflight','OPTIONS',204,{}), ('get rejected','GET',405,{}),
        ('anonymous rejected','POST',401,{}),
        ('invalid token rejected','POST',401,{'Authorization':'Bearer invalid-synthetic-session-token'}),
        ('cross-origin rejected','POST',403,{'Origin':'https://example.invalid'}),
    ]:
        req = Request(endpoint, method=method, data=synthetic if method=='POST' else None,
            headers={'Content-Type':'application/json','Origin':'https://mir.yeop.net', **extra})
        try:
            response = urlopen(req, timeout=30)
        except HTTPError as response_error:
            response = response_error
        with response:
            status, headers, body = response.status, response.headers, response.read(16384)
        check(case, status==expected, status=status)
        check(case+' is not cached', headers.get('Cache-Control')=='no-store')
        if case in ['anonymous rejected','invalid token rejected']:
            check(case+' has safe authentication error',json.loads(body).get('error')=='authentication_required')
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
