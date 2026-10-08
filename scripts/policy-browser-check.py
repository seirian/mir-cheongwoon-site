#!/usr/bin/env python3
"""Read-only UI checks; block all account writes and external providers."""
import argparse
import os
import json
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
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    report = {'base': base, 'checks': [], 'attempted_writes': [], 'page_errors': []}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or None)
        try:
            for name, width, height in [('desktop', 1440, 1000), ('mobile', 390, 844)]:
                context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
                page = context.new_page()
                page.on('pageerror', lambda error: report['page_errors'].append(str(error)))
                def intercept(route):
                    request = route.request
                    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                        report['attempted_writes'].append({'method': request.method, 'host': urlparse(request.url).netloc})
                        return route.abort()
                    if urlparse(request.url).netloc != origin:
                        return route.abort()
                    return route.continue_()
                page.route('**/*', intercept)
                for key, title in [('review', '이용자 안내 2차 검토실'), ('privacy', '개인정보처리방침'), ('terms', '이용약관'), ('operation', '운영정책·비공식 안내')]:
                    response = page.goto(base + 'policies/' + key + '/index.html', wait_until='domcontentloaded')
                    assert response.status == 200
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                    assert 'noindex' in page.locator('meta[name=robots]').get_attribute('content')
                    assert page.get_by_label('검토안 상태').is_visible()
                    assert page.locator('form').count() == 0
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), (name, key)
                    page.screenshot(path=str(output / f'{name}-{key}.png'), full_page=False)
                    if key == 'privacy':
                        page.get_by_role('navigation', name='문서 목차').get_by_text('6. 개인정보의 국외 이전', exact=True).click()
                        assert page.locator('#overseas').is_visible()
                        page.screenshot(path=str(output / f'{name}-overseas.png'))
                    page.reload(wait_until='domcontentloaded')
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                    report['checks'].append({'viewport': name, 'route': key, 'direct_reload': True, 'overflow': False})
                page.goto(base, wait_until='domcontentloaded')
                footer = page.locator('footer.site-footer')
                footer.scroll_into_view_if_needed()
                page.screenshot(path=str(output / f'{name}-home-footer.png'))
                for label, key, title in [('개인정보처리방침', 'privacy', '개인정보처리방침'), ('이용약관', 'terms', '이용약관'), ('운영정책·비공식 안내', 'operation', '운영정책·비공식 안내')]:
                    page.get_by_role('navigation', name='사이트 정책').get_by_role('link', name=label, exact=True).click()
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                    assert '/policies/' + key in page.url
                    report['checks'].append({'viewport': name, 'footer_link': key, 'passed': True})
                page.goto(base + 'account/', wait_until='domcontentloaded')
                page.get_by_role('heading', name='회원가입 시점 안내 시안', exact=True).wait_for()
                assert '/policies/review' in page.url
                assert page.get_by_role('button', name='검토용 · 회원가입을 받지 않습니다').is_disabled()
                assert page.locator('input:not([disabled])').count() == 0
                page.locator('#signup').scroll_into_view_if_needed()
                page.screenshot(path=str(output / f'{name}-signup-notice.png'))
                page.get_by_role('navigation', name='사이트 정책').get_by_role('link', name='개인정보처리방침', exact=True).focus()
                page.keyboard.press('Enter')
                page.get_by_role('heading', name='개인정보처리방침', level=1, exact=True).wait_for()
                assert page.evaluate('Object.keys(localStorage).filter(k => /auth-token|mir-readonly-review/.test(k)).length') == 0
                report['checks'].append({'viewport': name, 'signup_disabled_keyboard_footer_storage': True})
                context.close()
            assert not report['attempted_writes'], report['attempted_writes']
            assert not report['page_errors'], report['page_errors']
            report['passed'] = True
        finally:
            (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            browser.close()
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
