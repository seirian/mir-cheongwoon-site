"""Password form UI regression; all credentials and mutations are synthetic."""
import argparse
import base64
import json
from pathlib import Path
import time
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4173/')
parser.add_argument('--out', default='password-ui-report')
args = parser.parse_args()
assert urlsplit(args.url).hostname in ['localhost', '127.0.0.1']
out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
results = []

def check(name, ok, **details):
    results.append({'check': name, 'passed': bool(ok), **details})
    if not ok:
        raise AssertionError(name)

uid = '11111111-1111-4111-8111-111111111111'
user = {'id': uid, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'fixture@example.invalid', 'email_confirmed_at': '2026-01-01T00:00:00Z', 'app_metadata': {'provider': 'email'}, 'user_metadata': {}, 'identities': []}
def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = '.'.join([encode({'alg':'HS256','typ':'JWT'}), encode({'sub':uid,'exp':int(time.time())+3600,'aud':'authenticated','role':'authenticated'}), 'synthetic-signature'])
session = {'access_token': token, 'refresh_token':'synthetic-refresh', 'expires_at':int(time.time())+3600, 'expires_in':3600, 'token_type':'bearer', 'user':user}
fresh_token = '.'.join([encode({'alg':'HS256','typ':'JWT'}), encode({'sub':uid,'exp':int(time.time())+3600,'aud':'authenticated','role':'authenticated','session_id':'verification-only'}), 'synthetic-signature'])
fresh_session = {**session,'access_token':fresh_token,'refresh_token':'verification-only-refresh'}
old, new = 'Synthetic-old-123!', 'Synthetic-new-123!'

with sync_playwright() as p:
    browser = p.chromium.launch()
    try:
        for width in [1440, 390]:
            context = browser.new_context(viewport={'width':width,'height':1000})
            context.add_init_script('localStorage.setItem("sb-preview-fixture-auth-token", '+json.dumps(json.dumps(session))+');')
            state = {'calls':0,'writes':0,'error':None,'signed_out':False,'expired':False}
            errors = []
            def route_request(route):
                req = route.request; url = urlsplit(req.url)
                headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*'}
                def reply(data, status=200):
                    route.fulfill(status=status, content_type='application/json', headers=headers, body=json.dumps(data))
                if url.hostname == 'preview-fixture.supabase.co':
                    if req.method == 'OPTIONS': return reply({})
                    if url.path == '/auth/v1/token' and req.method == 'POST':
                        state['calls'] += 1
                        data = req.post_data_json
                        check('existing password verified against current user email',data.get('email')==user['email'],width=width)
                        if state['error']=='rate_limited': return reply({'code':'over_request_rate_limit','msg':'Synthetic rate limit'},429)
                        if data.get('password')!=old: return reply({'code':'invalid_credentials','msg':'Invalid login credentials'},400)
                        return reply(fresh_session)
                    if url.path == '/auth/v1/user' and req.method == 'PUT':
                        state['writes'] += 1; data = req.post_data_json
                        check('mutation uses only temporary reauthenticated token',req.headers.get('authorization')=='Bearer '+fresh_token,width=width)
                        check('new and existing passwords reach native Auth unchanged',data.get('password')==new and data.get('current_password')==old,width=width)
                        if state['error']=='change_unconfirmed': return reply({'code':'unexpected_failure','msg':'Synthetic transport failure'},503)
                        return reply(user)
                    if url.path == '/auth/v1/user': return reply({'code':'bad_jwt'} if state['expired'] else user, 401 if state['expired'] else 200)
                    if url.path == '/auth/v1/logout':
                        if req.headers.get('authorization')=='Bearer '+token: state['signed_out'] = True
                        return reply({})
                    if url.path == '/rest/v1/member_profiles': return reply({'username':'테스트회원','email':user['email']})
                    if url.path.startswith('/functions/v1/'):
                        raise AssertionError('Password flow must not use an application credential endpoint')
                    return reply([])
                if url.hostname in ['127.0.0.1','localhost']: return route.continue_()
                return route.abort()
            context.route('**/*', route_request)
            page = context.new_page(); page.on('pageerror',lambda error: errors.append(str(error)))
            try:
                page.goto(args.url+'account',wait_until='domcontentloaded')
                page.get_by_role('heading',name='내 정보',exact=True).wait_for()
                page.get_by_role('button',name='비밀번호 변경',exact=True).click()
                page.get_by_role('heading',name='비밀번호 변경',exact=True).wait_for()
                check('dedicated password mode is linked from account', 'mode=password' in page.url, width=width)
                check('three masked fields only', page.locator('form input[type=password]').count()==3, width=width)
                page.screenshot(path=str(out/f'form-{width}.png'), full_page=True)
                def fill(current=old, password=new, confirmation=new):
                    page.get_by_label('기존 비밀번호',exact=True).fill(current)
                    page.get_by_label('새 비밀번호',exact=True).fill(password)
                    page.get_by_label('새 비밀번호 다시 입력',exact=True).fill(confirmation)
                def submit(): page.get_by_role('button',name='비밀번호 변경',exact=True).click()
                fill(confirmation='Synthetic-mismatch-123!'); submit()
                page.get_by_role('alert').filter(has_text='일치하지 않습니다').wait_for()
                check('confirmation mismatch never sends mutation',state['calls']==0,width=width)
                fill(password='short',confirmation='short'); submit()
                page.get_by_role('alert').filter(has_text='8~128').wait_for()
                check('invalid length never sends mutation',state['calls']==0,width=width)
                fill(current='Synthetic-wrong-123!'); submit()
                page.get_by_role('alert').filter(has_text='기존 비밀번호가 올바르지 않습니다').wait_for()
                check('wrong current password stays on form',state['calls']==1 and state['writes']==0 and not state['signed_out'],width=width)
                check('wrong current field cleared',page.get_by_label('기존 비밀번호',exact=True).input_value()=='',width=width)
                state['error']='rate_limited'; fill(); submit()
                page.get_by_role('alert').filter(has_text='시도 횟수').wait_for()
                check('rate limit does not report success',state['writes']==0 and not state['signed_out'],width=width)
                state['error']='change_unconfirmed'; fill(); submit()
                page.get_by_role('alert').filter(has_text='변경 결과를 확인하지 못했습니다').wait_for()
                check('unknown outcome has no automatic retry',state['calls']==3 and state['writes']==1,width=width)
                check('verification tokens never replace stored main session',page.evaluate('(values)=>!values.some(v=>JSON.stringify(localStorage).includes(v)||JSON.stringify(sessionStorage).includes(v))',[fresh_token,'verification-only-refresh']),width=width)
                state['error']=None; state['expired']=True; fill(); submit()
                page.get_by_role('alert').filter(has_text='로그인 상태').wait_for()
                check('expired identity blocks mutation',state['calls']==3,width=width)
                state['expired']=False
                page.get_by_role('button',name='내 정보로 돌아가기').click()
                page.get_by_role('heading',name='내 정보',exact=True).wait_for()
                page.get_by_role('button',name='비밀번호 변경',exact=True).click()
                check('cancel clears password fields',all(value=='' for value in page.locator('form input').evaluate_all('(items)=>items.map(el=>el.value)')),width=width)
                page.reload(wait_until='domcontentloaded'); page.get_by_label('기존 비밀번호',exact=True).wait_for()
                fill()
                page.evaluate('document.querySelector("form").requestSubmit(); document.querySelector("form").requestSubmit();')
                page.get_by_role('heading',name='회원 로그인',exact=True).wait_for()
                page.get_by_role('status').filter(has_text='비밀번호가 변경되었습니다').wait_for()
                check('valid change succeeds once and returns to login',state['calls']==4 and state['writes']==2 and state['signed_out'],width=width)
                check('passwords never persisted or added to URL',page.evaluate('(values)=>!values.some(v=>JSON.stringify(localStorage).includes(v)||JSON.stringify(sessionStorage).includes(v)||location.href.includes(v))',[old,new]),width=width)
                check('responsive form has no page-wide overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width=width)
                page.screenshot(path=str(out/f'success-{width}.png'),full_page=True)
                check('no JavaScript errors',not errors,width=width)
            finally:
                context.close()
        # Separate fresh anonymous browser: direct password URLs must show only login.
        guest = browser.new_context(viewport={'width':390,'height':900})
        guest.route('**/*',lambda route: route.continue_() if urlsplit(route.request.url).hostname in ['localhost','127.0.0.1'] else route.abort())
        page = guest.new_page(); page.goto(args.url+'account?mode=password',wait_until='domcontentloaded')
        page.get_by_role('heading',name='회원 로그인',exact=True).wait_for()
        check('anonymous direct access requires login',page.get_by_label('기존 비밀번호',exact=True).count()==0)
        page.goto(args.url+'account?mode=recovery',wait_until='domcontentloaded')
        page.get_by_text('이메일 인증 필요',exact=True).wait_for()
        check('existing email recovery guard preserved',page.get_by_label('새 비밀번호',exact=True).count()==0)
        guest.close()
    finally:
        (out/'results.json').write_text(json.dumps({'checks':results},ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()
print(json.dumps({'passed':len(results)}))
