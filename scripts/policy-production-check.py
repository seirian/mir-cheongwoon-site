#!/usr/bin/env python3
"""Read-only production UI smoke checks; never submit a real signup or withdrawal."""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    base = args.url.rstrip('/') + '/'
    origin = urlparse(base).netloc
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report = {'base': base, 'checks': [], 'writes': [], 'errors': [], 'passed': False}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or None)
        try:
            for name, width, height in [('desktop', 1440, 1000), ('mobile', 390, 844)]:
                context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
                page = context.new_page()
                page.on('pageerror', lambda error: report['errors'].append(str(error)))
                def intercept(route):
                    request = route.request
                    address = urlparse(request.url)
                    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                        # The existing public hero lookup uses a read-only storage list POST.
                        if address.path == '/storage/v1/object/list/gallery':
                            return route.fulfill(status=200, content_type='application/json', body='[]', headers={'Access-Control-Allow-Origin': '*'})
                        report['writes'].append({'method': request.method, 'path': address.path})
                        return route.abort()
                    if address.netloc != origin:
                        return route.abort()
                    return route.continue_()
                page.route('**/*', intercept)
                for key, title in [('privacy', '개인정보처리방침'), ('terms', '이용약관'), ('operation', '운영정책·비공식 안내')]:
                    response = page.goto(base + 'policies/' + key, wait_until='domcontentloaded')
                    assert response.status == 200
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                    assert '검토' not in page.title() and '미시행' not in page.locator('.policy-page').inner_text()
                    assert page.locator('.review-banner').count() == 0
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
                    page.reload(wait_until='domcontentloaded')
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                    if key == 'privacy':
                        for snippet in ['옆군', 'sengyb@naver.com', '추가 처리 필요가 없어지면 지체 없이 삭제', '만 14세 이상 확인란', '확인 중']:
                            assert snippet in page.locator('.policy-page').inner_text()
                        page.locator('.policy-toc').get_by_text('4. 보유기간과 파기', exact=True).click()
                        assert page.locator('#retention').is_visible()
                    page.screenshot(path=str(out / f'{name}-{key}.png'))
                    report['checks'].append({'viewport': name, 'document': key, 'direct_reload': True})
                page.goto(base, wait_until='domcontentloaded')
                footer = page.locator('footer.site-footer')
                footer.scroll_into_view_if_needed()
                page.screenshot(path=str(out / f'{name}-footer.png'))
                for title in ['개인정보처리방침', '이용약관', '운영정책·비공식 안내']:
                    page.get_by_role('navigation', name='사이트 정책').get_by_role('link', name=title, exact=True).click()
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                    report['checks'].append({'viewport': name, 'footer': title, 'passed': True})
                page.goto(base + 'account', wait_until='domcontentloaded')
                page.get_by_role('heading', name='회원 로그인', exact=True).wait_for()
                page.locator('.account-auth-tabs').get_by_role('button', name='회원가입', exact=True).click()
                notice = page.locator('.signup-policy-box')
                notice.wait_for()
                assert '제15조제1항제4호' in notice.inner_text()
                assert '홍보·마케팅 목적으로 사용하지 않습니다' in notice.inner_text()
                assert page.locator('input[name=termsAccepted]').count() == 1
                assert not page.locator('input[name=termsAccepted]').is_checked()
                assert page.locator('input[type=date], input[name=age], input[name=birthdate]').count() == 0
                assert page.locator('form input').count() == 5
                submit = page.locator('form button[type=submit], form .btn-primary').last
                assert notice.bounding_box()['y'] < submit.bounding_box()['y']
                notice.screenshot(path=str(out / f'{name}-signup-notice.png'))
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
                assert page.evaluate('localStorage.length') == 0
                report['checks'].append({'viewport': name, 'signup_notice_no_age_no_submission': True})
                context.close()
            assert not report['errors'], report['errors']
            assert not report['writes'], report['writes']
            report['passed'] = True
        finally:
            (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            browser.close()
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    main()
