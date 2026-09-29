"""Revision 2 UI checks. Authentication/uploads use a local intercepted backend only."""
import base64
from email import policy
from email.parser import BytesParser
import json
from pathlib import Path
from urllib.parse import urljoin, urlsplit


def run_revision_checks(page, context, base, out, live, check):
    for width in [1440, 1920, 2560, 390, 320]:
        page.set_viewport_size({'width': width, 'height': 1000})
        page.goto(base, wait_until='domcontentloaded')
        page.locator('#home-title').wait_for()
        page.wait_for_timeout(600)
        hero = page.locator('.promo-hero').bounding_box()
        padding = page.locator('.promo-hero-copy').evaluate('(el) => parseFloat(getComputedStyle(el).paddingLeft)')
        check('v2 hero centered and bounded', abs(hero['x'] - (width - hero['x'] - hero['width'])) <= 2 and padding <= 60, width=width, left=hero['x'], padding=padding)
        check('v2 hero requested live URL', page.get_by_role('link', name='대표 라이브 보기', exact=True).get_attribute('href') == 'https://www.youtube.com/watch?v=Gh4PqvQVWRc', width=width)
        check('v2 viewport no overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), width=width)
        titles = page.locator('.promo-picks .promo-video-caption h3')
        if titles.count():
            metrics = titles.evaluate_all('(items) => items.map(el => ({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight)}))')
            check('v2 titles reserve two lines', all(abs(m['height']-m['line']*2)<1 for m in metrics), width=width, metrics=metrics)
        if width == 1440 and page.locator('.promo-picks .promo-pick').count() == 3:
            boxes = page.locator('.promo-picks .promo-pick').evaluate_all('(items) => items.map(el=>el.getBoundingClientRect().height)')
            check('v2 all three cards equal height', max(boxes)-min(boxes)<2, heights=boxes)
        if width in [1440,390]: page.screenshot(path=str(out/f'v2-home-{width}.png'), full_page=True)

    for width in [1440, 390]:
        page.set_viewport_size({'width':width,'height':1000})
        page.goto(urljoin(base,'schedule'),wait_until='domcontentloaded')
        page.get_by_role('heading',level=1,name='일정표',exact=True).wait_for()
        intro=page.locator('.page-hero > p')
        metrics=intro.evaluate('(el)=>({whiteSpace:getComputedStyle(el).whiteSpace,height:el.clientHeight,line:parseFloat(getComputedStyle(el).lineHeight),scroll:el.scrollWidth,width:el.clientWidth})')
        check('schedule hero description alone remains one line',metrics['whiteSpace']=='nowrap' and metrics['height']<=metrics['line']+6,width=width,metrics=metrics)
        if width==1440: check('schedule desktop intro completely visible',metrics['scroll']<=metrics['width']+1)
        page.wait_for_timeout(800)
        text=page.locator('.schedule-event-title,.schedule-event-description,.day-summary-event p')
        if text.count():
            styles=text.evaluate_all('(items)=>items.map(el=>({whiteSpace:getComputedStyle(el).whiteSpace,overflowX:getComputedStyle(el).overflowX}))')
            check('schedule entries restore original wrapping without forced scrolling',all(s['whiteSpace']=='pre-wrap' and s['overflowX']!='auto' for s in styles),width=width,count=len(styles))
        if not live:
            title=page.locator('.schedule-event-title').first
            title.wait_for()
            original=title.text_content()
            try:
                title.evaluate('(el)=>{el.textContent="긴 일정 제목의 자연스러운 줄바꿈 확인 ".repeat(8)}')
                lines=title.evaluate('(el)=>{const r=document.createRange();r.selectNodeContents(el);return new Set([...r.getClientRects()].map(rect=>Math.round(rect.top))).size}')
                check('long calendar titles wrap onto multiple lines',lines>1,width=width,lines=lines)
            finally:
                title.evaluate('(el,text)=>{el.textContent=text}',original)
        check('v2 schedule viewport no overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),width=width)
        page.screenshot(path=str(out/f'v2-schedule-{width}.png'),full_page=True)

    page.goto(base,wait_until='domcontentloaded')
    page.get_by_role('button',name='관리자 이미지 관리',exact=True).click()
    page.locator('.hero-image-dialog input[type=email]').wait_for()
    check('v2 review login is reachable from home',page.locator('.hero-image-dialog').evaluate('(el)=>el.open'))
    page.screenshot(path=str(out/'v2-hero-login-390.png'),full_page=True)
    page.keyboard.press('Escape')
    check('v2 dialog Escape closes and restores focus',not page.locator('.hero-image-dialog').evaluate('(el)=>el.open') and page.locator('.hero-image-manage').evaluate('(el)=>document.activeElement===el'))
    if live:
        return  # Never submit real credentials or mutate real storage from a live check.

    assert urlsplit(base).hostname in ['127.0.0.1','localhost'], 'Synthetic login must only run locally'
    state={'admin':False,'stored':None,'failed_upload':False,'attempts':0,'successes':0}
    user={'id':'00000000-0000-4000-8000-000000000002','aud':'authenticated','role':'authenticated','email':'review-admin@example.invalid','app_metadata':{'provider':'email'},'user_metadata':{}}
    token='.'.join(base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=') for value in [{'alg':'HS256','typ':'JWT'},{'sub':user['id'],'exp':4102444800,'role':'authenticated'},'synthetic-signature'])
    folder='site-hero/promotion-discovery-preview'
    def hero_fixture(route):
        request=route.request; path=urlsplit(request.url).path
        data=None
        if path=='/auth/v1/token': data={'access_token':token,'refresh_token':'synthetic-refresh-only','expires_in':3600,'expires_at':4102444800,'token_type':'bearer','user':user}
        elif path=='/auth/v1/user': data=user
        elif path=='/auth/v1/logout': data={}
        elif path=='/rest/v1/admins': data=[{'user_id':user['id']}] if state['admin'] else []
        elif path=='/storage/v1/object/list/gallery':
            assert request.post_data_json['prefix']==folder
            data=[{'name':'current.webp','id':'synthetic-image','updated_at':'2026-09-29T01:00:00Z'}] if state['stored'] else []
        elif path==f'/storage/v1/object/gallery/{folder}/current.webp':
            state['attempts']+=1
            if not state['admin'] or state['failed_upload']:
                return route.fulfill(status=403,content_type='application/json',body='{"message":"synthetic denied"}',headers={'access-control-allow-origin':'*'})
            message=BytesParser(policy=policy.default).parsebytes(('Content-Type: '+request.headers['content-type']+'\r\n\r\n').encode()+request.post_data_buffer)
            payload=next(part.get_payload(decode=True) for part in message.walk() if part.get_content_type()=='image/webp')
            assert payload.startswith(b'RIFF') and payload[8:12]==b'WEBP'
            state['stored']=payload;state['successes']+=1
            data={'Key':f'gallery/{folder}/current.webp','Id':'synthetic-image'}
        elif path==f'/storage/v1/object/public/gallery/{folder}/current.webp':
            return route.fulfill(status=200,content_type='image/webp',body=state['stored'] or Path('public/mir-profile-still.webp').read_bytes())
        else: return route.fallback()
        return route.fulfill(status=200,content_type='application/json',body=json.dumps(data),headers={'access-control-allow-origin':'*'})
    context.route('https://preview-fixture.supabase.co/**',hero_fixture)
    page.goto(base,wait_until='domcontentloaded')
    page.get_by_role('button',name='관리자 이미지 관리',exact=True).click()
    def sign_in():
        page.get_by_label('관리자 이메일',exact=True).fill(user['email'])
        page.get_by_label('비밀번호',exact=True).fill('synthetic-password-only')
        page.get_by_role('button',name='관리자 로그인',exact=True).click()
    sign_in()
    page.get_by_text('이 계정에는 관리자 권한이 없습니다. 이미지 업로드는 관리자만 가능합니다.',exact=True).wait_for()
    check('v2 nonadmin has no upload input',page.locator('input[type=file]').count()==0 and state['attempts']==0)
    page.get_by_role('button',name='다른 계정으로 로그인',exact=True).click()
    state['admin']=True
    sign_in()
    file_input=page.get_by_label('새 홈 이미지',exact=True)
    file_input.wait_for()
    check('v2 verified admin can select image',True)
    file_input.set_input_files({'name':'bad.svg','mimeType':'image/svg+xml','buffer':b'<svg></svg>'})
    page.get_by_role('alert').filter(has_text='JPG, PNG, WebP').wait_for()
    check('v2 unsupported upload rejected',page.get_by_role('button',name='이미지 저장',exact=True).is_disabled() and state['attempts']==0)
    file_input.set_input_files(str(Path('public/mir-profile-site.webp')))
    page.get_by_alt_text('저장 전 선택 이미지 미리보기').wait_for()
    page.get_by_role('button',name='취소',exact=True).click()
    check('v2 cancel never uploads',state['attempts']==0)
    page.get_by_role('button',name='홈 이미지 교체',exact=True).click()
    file_input.set_input_files(str(Path('public/mir-profile-site.webp')))
    page.get_by_alt_text('저장 전 선택 이미지 미리보기').wait_for()
    for width in [1440,390]:
        page.set_viewport_size({'width':width,'height':1000})
        check('v2 editor contained in viewport',page.locator('.hero-image-dialog').evaluate('(el)=>el.getBoundingClientRect().width<=innerWidth && el.getBoundingClientRect().height<=innerHeight'),width=width)
        page.screenshot(path=str(out/f'v2-admin-image-editor-{width}.png'),full_page=True)
    state['failed_upload']=True
    old=page.locator('.promo-mir-portrait').get_attribute('src')
    page.get_by_role('button',name='이미지 저장',exact=True).click()
    page.get_by_role('alert').filter(has_text='기존 이미지는 유지됩니다').wait_for()
    check('v2 failed save retains previous image',page.locator('.promo-mir-portrait').get_attribute('src')==old and state['successes']==0)
    state['failed_upload']=False
    page.get_by_role('button',name='이미지 저장',exact=True).click()
    page.locator('.hero-image-dialog').wait_for(state='hidden')
    check('v2 successful upload uses preview-only object',state['successes']==1 and folder in page.locator('.promo-mir-portrait').get_attribute('src'))
    other=context.new_page()
    other.goto(base,wait_until='domcontentloaded')
    other.wait_for_function('(folder)=>document.querySelector(".promo-mir-portrait")?.src.includes(folder)',arg=folder)
    check('v2 new visitor reads persisted replacement',True)
    other.close()
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('(folder)=>document.querySelector(".promo-mir-portrait")?.src.includes(folder)',arg=folder)
    check('v2 reload preserves saved image but isolates login',page.get_by_role('button',name='관리자 이미지 관리',exact=True).count()==1)
    context.unroute('https://preview-fixture.supabase.co/**',hero_fixture)
