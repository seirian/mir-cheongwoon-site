#!/usr/bin/env python3
"""Synthetic UI checks only. Never log into, send passwords to, or delete real accounts."""
import argparse
import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--out', default='withdrawal-browser-report')
    parser.add_argument('--account-fixture', action='store_true')
    args = parser.parse_args()
    base = args.url.rstrip('/') + '/'
    if args.account_fixture and urlparse(base).hostname not in ('127.0.0.1', 'localhost'):
        raise SystemExit('Account fixtures are restricted to localhost. No real accounts permitted.')
    output = Path(args.out); output.mkdir(parents=True, exist_ok=True)
    report = {'mode': 'synthetic-account' if args.account_fixture else 'isolated-review', 'checks': [], 'unexpected_writes': [], 'page_errors': [], 'passed': False}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or None)
        try:
            for name, viewport in [('desktop', {'width': 1440, 'height': 1000}), ('mobile', {'width': 390, 'height': 844})]:
                context = browser.new_context(viewport=viewport)
                state = {'deleted': False, 'delete_calls': 0}
                uid = '00000000-0000-4000-8000-000000000001'
                user = {'id': uid, 'email': 'example@example.invalid', 'aud': 'authenticated', 'role': 'authenticated', 'created_at': '2026-10-08T00:00:00Z', 'app_metadata': {'provider': 'email'}, 'user_metadata': {}}
                session = {'access_token': '.'.join(base64.urlsafe_b64encode(json.dumps(part).encode()).decode().rstrip('=') for part in [{'alg': 'HS256'}, {'sub': uid, 'exp': int(time.time()) + 3600, 'role': 'authenticated'}, 'not-a-signature']), 'refresh_token': 'synthetic-only', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
                if args.account_fixture:
                    context.add_init_script("if(!sessionStorage.getItem('fixture-seeded')){localStorage.setItem('sb-policy-fixture-auth-token'," + json.dumps(json.dumps(session)) + ");sessionStorage.setItem('fixture-seeded','1');}")
                page = context.new_page()
                page.on('pageerror', lambda error: report['page_errors'].append(str(error)))
                def intercept(route):
                    request = route.request
                    address = urlparse(request.url)
                    def fulfill(payload, status=200):
                        return route.fulfill(status=status, content_type='application/json', body=json.dumps(payload), headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'})
                    if args.account_fixture and address.hostname == 'policy-fixture.supabase.co':
                        if request.method == 'OPTIONS': return fulfill({})
                        if address.path == '/functions/v1/member-withdrawal' and request.method == 'POST':
                            body = request.post_data_json
                            assert set(body) == {'password', 'confirmation'}
                            assert body['confirmation'] == 'DELETE_MY_ACCOUNT'
                            assert request.headers.get('authorization', '').startswith('Bearer ')
                            state['delete_calls'] += 1
                            if body['password'] != 'Review-Only-123!': return fulfill({'ok': False, 'code': 'password_mismatch'}, 403)
                            state['deleted'] = True
                            return fulfill({'ok': True, 'code': 'ACCOUNT_DELETED'})
                        if address.path == '/auth/v1/logout' and request.method == 'POST': return fulfill({})
                        if request.method in ('GET', 'HEAD'):
                            if address.path == '/auth/v1/user': return fulfill({'code': 'user_not_found'}, 404) if state['deleted'] else fulfill(user)
                            if address.path == '/rest/v1/member_profiles': return fulfill(None if state['deleted'] else {'username': 'mir_fan_example', 'email': user['email']})
                            return fulfill([])
                    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                        report['unexpected_writes'].append({'method': request.method, 'host': address.hostname, 'path': address.path})
                        return route.abort()
                    if address.netloc != urlparse(base).netloc: return route.abort()
                    return route.continue_()
                page.route('**/*', intercept)
                route_url = base + ('account/' if args.account_fixture else 'account/withdraw-review/')
                page.goto(route_url, wait_until='domcontentloaded')
                page.get_by_role('heading', name='내 정보', exact=True).wait_for()
                page.get_by_role('button', name='회원 탈퇴', exact=True).click()
                field = page.locator('#withdrawal-password')
                field.wait_for()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
                page.screenshot(path=str(output / f'{name}-withdrawal-form.png'))
                field.fill('cancelled-synthetic-password')
                page.get_by_role('button', name='취소하고 돌아가기').click()
                page.get_by_role('button', name='회원 탈퇴', exact=True).click()
                assert field.input_value() == ''
                report['checks'].append({'viewport': name, 'cancel_clears_password': True})
                field.fill('wrong-synthetic-password')
                page.locator('.withdrawal-confirm input').check()
                submit = page.locator('.withdrawal-delete').last
                submit.click()
                page.get_by_role('alert').filter(has_text='현재 비밀번호가 올바르지 않습니다').wait_for()
                assert field.input_value() == '' and not state['deleted']
                page.screenshot(path=str(output / f'{name}-withdrawal-password-error.png'))
                report['checks'].append({'viewport': name, 'wrong_password_preserves_account': True})
                field.fill('Review-Only-123!')
                submit.click()
                if args.account_fixture:
                    page.get_by_text('회원 탈퇴가 완료되었습니다. 운영 DB의 회원 계정정보를 삭제했습니다.', exact=True).wait_for()
                    assert page.evaluate("localStorage.getItem('sb-policy-fixture-auth-token')") is None
                    assert state['delete_calls'] == 2 and state['deleted']
                    page.reload(wait_until='domcontentloaded')
                    page.get_by_role('heading', name='회원 로그인', exact=True).wait_for()
                    report['checks'].append({'viewport': name, 'success_clears_session_and_reload_stays_logged_out': True})
                else:
                    page.get_by_role('heading', name='예시 계정 탈퇴가 완료되었습니다.').wait_for()
                    assert page.evaluate('localStorage.length') == 0
                    page.screenshot(path=str(output / f'{name}-withdrawal-success.png'))
                    report['checks'].append({'viewport': name, 'demo_success_without_network_or_storage': True})
                    for scenario, snippet in [('uncertain', '서버의 삭제 결과를 확인하지 못했습니다'), ('managed', '관리자 계정은 공용 자료')]:
                        page.goto(route_url, wait_until='domcontentloaded')
                        page.get_by_label('확인할 상황').select_option(scenario)
                        page.get_by_role('button', name='회원 탈퇴', exact=True).click()
                        field.fill('Review-Only-123!'); page.locator('.withdrawal-confirm input').check(); submit.click()
                        page.get_by_role('alert').filter(has_text=snippet).wait_for()
                        assert field.input_value() == ''
                        report['checks'].append({'viewport': name, 'scenario': scenario, 'no_false_success': True})
                context.close()
            assert not report['page_errors'], report['page_errors']
            assert not report['unexpected_writes'], report['unexpected_writes']
            report['passed'] = True
        finally:
            (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            browser.close()
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
