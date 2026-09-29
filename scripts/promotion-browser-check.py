#!/usr/bin/env python3
"""Read-only live checks; synthetic upload/auth tests run only on localhost."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from playwright.sync_api import sync_playwright
from promotion_revision_checks import run_revision_checks

parser=argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5173/')
parser.add_argument('--live', action='store_true')
parser.add_argument('--out', default='browser-report')
args=parser.parse_args()
base=args.url.rstrip('/')+'/'
out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
results=[]; errors=[]
videos=[{'id':'voice','title':'노심융해 테스트 커버','youtube_url':'https://www.youtube.com/watch?v=abcdefghijk'},{'id':'stage','title':'푸름과 여름 Live Ver. 테스트','youtube_url':'https://www.youtube.com/watch?v=lmnopqrstuv'}]
recent=[{'video_id':'stream','title':'FPS에 소질없는 테스트 방송','youtube_url':'https://www.youtube.com/watch?v=wxyzABCDEFG','position':1}]
members=[{'id':str(i),'name':n,'position':p,'comment':c,'sort_order':i} for i,(n,p,c) in enumerate([('Ray','GUITAR','청운밴드 기타리스트 Ray입니다'),('SweetBerry','BASS','청운밴드 베이시스트입니다'),('맹감자','KEYBOARD','청운밴드 키보드입니다'),('멤버 04','Position','멤버 소개와 한 줄 코멘트를 입력하세요.')])]
events=[{'id':'evt','event_date':'2026-09-30','title':'브라우저 테스트용 일정','category':'특별','start_time':'20:00:00','end_time':None,'description':'검증용 데이터입니다. 실제 일정이 아닙니다.','link_url':'https://cafe.naver.com/alice427','sort_order':1}]
events.insert(0, {'id':'holiday', 'event_date':'2026-09-29', 'title':'개천절', 'category':'기타', 'start_time':None})
mode={'value':'success'}
headings={'band':'청운밴드','history':'공연 이력','history/blued-2025':'BLUED','gallery':'영상 및 갤러리','schedule':'일정표','mir':'미르(MIR)','review':'개선안 검토실','account':'검토용 화면에서는 로그인과 편집이 잠겨 있습니다.'}

def check(name, passed, **details):
    results.append({'check':name,'passed':bool(passed),**details})
    if not passed: raise AssertionError(name+' '+str(details))

def fixture(route):
    url=route.request.url
    if '/rest/v1/' in url and 'preview-fixture.supabase.co' in url:
        table=url.split('/rest/v1/')[1].split('?')[0]
        if mode['value']=='error': return route.fulfill(status=503,content_type='application/json',body='{"message":"fixture unavailable"}')
        data={'videos':videos,'recent_videos':recent,'band_members':members,'schedule_events':events,'galleries':[]}.get(table,[]) if mode['value']!='empty' else []
        return route.fulfill(status=200,content_type='application/json',body=json.dumps(data),headers={'access-control-allow-origin':'*'})
    if 'preview-fixture.supabase.co/storage/v1/object/list/gallery' in url:
        return route.fulfill(status=200,content_type='application/json',body='[]',headers={'access-control-allow-origin':'*'})
    if '/api/soop-live.php' in url:
        return route.fulfill(status=200,content_type='application/json',body=json.dumps({'status':'unknown' if mode['value']=='error' else 'offline'}))
    if '/api/naver-fanart.php' in url: return route.fulfill(status=200,content_type='application/json',body='{"status":"unavailable"}')
    if 'i.ytimg.com' in url or 'img.youtube.com' in url:
        return route.fulfill(status=200,content_type='image/png',body=Path('public/og/home.png').read_bytes())
    if 'youtube-nocookie.com/embed' in url: return route.fulfill(status=200,content_type='text/html',body='<title>Fixture player</title><p>Test player only</p>')
    if 'fonts.googleapis.com' in url or 'fonts.gstatic.com' in url: return route.fulfill(status=204,body='')
    return route.continue_()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='America/Los_Angeles',reduced_motion='reduce')
    if not args.live: context.route('**/*',fixture)
    page=context.new_page();page.on('pageerror',lambda e: errors.append(str(e)))
    if not args.live: page.clock.install(time=datetime(2026,9,29,1,0,tzinfo=timezone.utc))
    try:
        for w,h in [(1440,1000),(390,844),(320,812),(768,1024),(1024,900)]:
            page.set_viewport_size({'width':w,'height':h})
            page.goto(base,wait_until='domcontentloaded');page.get_by_role('heading',name='각자의 매력, 함께하는 음악').wait_for();page.wait_for_timeout(1200)
            check('home stays inside preview',urlsplit(page.url).path.rstrip('/')==urlsplit(base).path.rstrip('/'),actual_url=page.url)
            overflow=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
            check('home no horizontal overflow',overflow['scroll']<=w+1,width=w,measured=overflow)
            if w in [1440,390]: page.screenshot(path=str(out/f'home-{w}.png'),full_page=True)
        for path in ['band','history','history/blued-2025','gallery','schedule','mir','review','account']:
            for w in [1440,390]:
                page.set_viewport_size({'width':w,'height':900});page.goto(urljoin(base,path),wait_until='domcontentloaded');page.wait_for_timeout(1100)
                page.get_by_role('heading',level=1,name=headings[path],exact=True).wait_for(timeout=15000)
                check('deep link shows intended page',urlsplit(page.url).path.rstrip('/')==urlsplit(urljoin(base,path)).path.rstrip('/'),route=path,actual_url=page.url,heading=page.locator('main h1').inner_text())
                overflow=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
                check('route no horizontal overflow',overflow['scroll']<=w+1,route=path,width=w,measured=overflow)
                check('preview noindex',page.locator('meta[name=robots]').get_attribute('content')=='noindex, nofollow',route=path)
                page.screenshot(path=str(out/f'{path.replace("/","-")}-{w}.png'),full_page=True)
        for route in ['history/blued-2025/','history/blued-2025/index.html','review/']:
            page.goto(urljoin(base,route),wait_until='domcontentloaded')
            logical=route.removesuffix('index.html').rstrip('/')
            page.get_by_role('heading',level=1,name=headings[logical],exact=True).wait_for(timeout=15000)
            check('static and trailing slash aliases resolve',urlsplit(page.url).path.rstrip('/')==urlsplit(urljoin(base,logical)).path.rstrip('/'),route=route,actual_url=page.url)
        page.goto(urljoin(base,'band'),wait_until='domcontentloaded');page.wait_for_timeout(1000)
        check('member templates hidden',page.get_by_role('heading',name='멤버 04',exact=True).count()==0)
        page.goto(urljoin(base,'account'));check('preview login disabled',page.locator('input[type=password]').count()==0)
        page.goto(base,wait_until='domcontentloaded');page.wait_for_timeout(1000)
        page.get_by_role('button',name='메뉴 열기').click();check('mobile menu expanded',page.get_by_role('button',name='메뉴 닫기').get_attribute('aria-expanded')=='true')
        page.keyboard.press('Escape');check('mobile menu Escape/focus',page.get_by_role('button',name='메뉴 열기').get_attribute('aria-expanded')=='false')
        if not args.live:
            page.get_by_role('link',name='대표 라이브 보기',exact=True).wait_for()
            check('holiday is not the next artist activity',page.locator('#next-event').get_by_text('개천절',exact=True).count()==0)
            check('player not loaded before click',page.locator('iframe').count()==0)
            page.get_by_role('button',name='노심융해 테스트 커버 재생').click();check('player loaded on click',page.locator('iframe').count()==1)
            with page.expect_download() as download: page.get_by_role('button',name='캘린더에 저장').first.click()
            download.value.save_as(str(out/'schedule.ics'));check('calendar KST to UTC','DTSTART:20260930T110000Z' in (out/'schedule.ics').read_text())
            mode['value']='error';page.goto(base,wait_until='domcontentloaded');page.get_by_text('일정을 불러오지 못했습니다. 일정이 없다는 뜻은 아닙니다.').wait_for()
            check('error is not empty',True);page.get_by_text('방송 상태 확인 불가 · 채널에서 확인',exact=True).wait_for();check('unknown is not offline',True)
            page.screenshot(path=str(out/'home-error.png'),full_page=True)
            mode['value']='empty';page.goto(base,wait_until='domcontentloaded');page.get_by_text('새로운 공개 일정이 등록되면 여기에 표시됩니다. 공식 채널에서 최신 공지를 확인해 주세요.').wait_for();check('empty state has official fallback',True)
            page.screenshot(path=str(out/'home-empty.png'),full_page=True)
        mode['value']='success'
        run_revision_checks(page,context,base,out,args.live,check)
        check('no JavaScript runtime errors',not errors,errors=errors)
    except Exception as exc:
        errors.append(str(exc));page.screenshot(path=str(out/'failure.png'),full_page=True)
        raise
    finally:
        (out/'results.json').write_text(json.dumps({'live':args.live,'checks':results,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()
print(json.dumps({'passed':len(results),'live':args.live},ensure_ascii=False))
