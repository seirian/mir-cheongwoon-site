#!/usr/bin/env python3
"""Read-only production UI smoke checks; never submit a real signup or withdrawal."""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

REMOVED_POLICY_LEADS = (
    '필요한 정보만 받고, 사용 목적과 삭제 방법을 알려드립니다.',
    '무료 비공식 팬 아카이브를 함께 이용하는 기준입니다.',
    '좋아하는 마음으로 기록하고, 오류와 권리침해에 대응합니다.',
)


def assert_policy_heading(page, title):
    hero = page.locator('.policy-page .policy-hero')
    assert hero.get_by_role('heading', name=title, exact=True, level=1).is_visible()
    assert hero.locator('.policy-lead').count() == 0
    assert hero.locator('.policy-meta').is_visible()
    text = page.locator('.policy-page').inner_text()
    assert all(lead not in text for lead in REMOVED_POLICY_LEADS)


def assert_provider_copy(page):
    providers = page.locator('#processors')
    transfer = page.locator('#overseas')
    for section in [providers, transfer]:
        text = section.inner_text()
        assert all(term not in text for term in ['확인 중', '확인 범위', '미확인 처리경로'])
    assert providers.locator('thead th').count() == 2
    assert providers.locator('tbody tr').count() == 4
    for name in ['Supabase Pte. Ltd.', 'NAVER 메일', 'inour.net', '가입 인증·복구 메일']:
        assert name in providers.inner_text()
    assert '문의 접수용 NAVER 메일' in providers.inner_text()
    assert '운영 DB 저장 국가: 인도(뭄바이, ap-south-1)' in transfer.inner_text()
    assert '운영 DB 저장 국가 외의 지역' in transfer.inner_text()
    references = transfer.locator('.policy-provider-sources a')
    assert references.count() == 2
    for link, path in zip(references.all(), ['data-processing-addendum', 'subprocessor-list']):
        assert link.get_attribute('href') == 'https://supabase.com/legal/customer-resources/' + path
        assert link.get_attribute('target') == '_blank'
        assert 'noopener' in link.get_attribute('rel')


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
                    assert_policy_heading(page, title)
                    if key == 'privacy':
                        assert_provider_copy(page)
                    assert '검토' not in page.title() and '미시행' not in page.locator('.policy-page').inner_text()
                    assert page.locator('.review-banner').count() == 0
                    assert page.locator('.policy-page .policy-pending').count() == 0
                    assert '추가 확인 안내' not in page.locator('.policy-page').inner_text()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
                    page.reload(wait_until='domcontentloaded')
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                    assert_policy_heading(page, title)
                    page.screenshot(path=str(out / f'{name}-{key}-heading.png'))
                    assert page.locator('.policy-page .policy-pending').count() == 0
                    if key == 'privacy':
                        assert_provider_copy(page)
                        for snippet in ['옆군', 'sengyb@naver.com', '추가 처리 필요가 없어지면 지체 없이 삭제', '만 14세 이상 확인란']:
                            assert snippet in page.locator('.policy-page').inner_text()
                        for section_id in ['processors', 'overseas']:
                            page.locator(f'#{section_id}').screenshot(path=str(out / f'{name}-{section_id}.png'))
                        report['checks'].append({'viewport': name, 'provider_status_copy_absent': True, 'all_services_and_transfer_scope_preserved': True})
                        page.locator('.policy-toc').get_by_text('4. 보유기간과 파기', exact=True).click()
                        assert page.locator('#retention').is_visible()
                        assert '동시에 모든 사본이 삭제되는 것은 아닙니다' in page.locator('.policy-deletion-scope').inner_text()
                    page.screenshot(path=str(out / f'{name}-{key}.png'))
                    report['checks'].append({'viewport': name, 'document': key, 'direct_reload': True, 'internal_review_notes_absent': True, 'introductory_leads_absent': True})
                page.goto(base, wait_until='domcontentloaded')
                footer = page.locator('footer.site-footer')
                footer.scroll_into_view_if_needed()
                page.screenshot(path=str(out / f'{name}-footer.png'))
                for title in ['개인정보처리방침', '이용약관', '운영정책·비공식 안내']:
                    page.get_by_role('navigation', name='사이트 정책').get_by_role('link', name=title, exact=True).click()
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                    assert_policy_heading(page, title)
                    if title == '개인정보처리방침':
                        assert_provider_copy(page)
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
