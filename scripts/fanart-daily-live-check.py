"""Read-only verification. Simulate main API failure in this browser only."""
import json,re
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
out=Path('daily-live-review');out.mkdir(exist_ok=True);checks=[]
def check(name,ok,**extra):
    checks.append(dict(name=name,passed=bool(ok),**extra))
    if not ok:raise AssertionError(name)
origin='https://mir.yeop.net'
status=json.load(urlopen(origin+'/api/naver-fanart-daily.php?status=1',timeout=30))
backup=json.load(urlopen(origin+'/api/naver-fanart-backup.php',timeout=30))
check('daily backup is a completed successful collection',status['lastRun']['status']=='success' and backup.get('fallbackKind')=='daily_batch')
check('metadata includes collected time distinct from original post date',bool(backup.get('batchCollectedAt')) and bool(backup.get('sourceDate')))
try:
    urlopen(origin+'/_fanart_daily/snapshot.php',timeout=30);check('storage protected',False)
except HTTPError as error:check('storage protected',error.code in [403,404])
for url in backup['imageUrls']:
    check('image URL is same-site issued',bool(re.fullmatch(r'/(?:_yeop_releases/r[0-9]{14}_[a-f0-9]{8}/)?api/naver-fanart-image\.php\?daily=[a-f0-9]{64}', url)))
    with urlopen(origin+url,timeout=30)as response:
        check('saved image served locally',response.status==200 and response.headers.get_content_type().startswith('image/') and bool(response.read(1024)))
with sync_playwright()as p:
    browser=p.chromium.launch()
    try:
        for width in [1440,390]:
            for simulate in [False,True]:
                context=browser.new_context(viewport={'width':width,'height':1000});errors=[]
                def intercept(route):
                    req=route.request
                    if req.method not in ['GET','HEAD','OPTIONS']:return route.abort()
                    if simulate and urlsplit(req.url).path.endswith('/api/naver-fanart.php'):return route.fulfill(status=503,body='simulated failure in verification browser only')
                    return route.continue_()
                context.route('**/*',intercept);page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
                try:
                    page.goto(origin+'/schedule',wait_until='domcontentloaded',timeout=60000);card=page.locator('.fanart-card');card.scroll_into_view_if_needed();page.mouse.move(0,0)
                    page.locator('.fanart-slide.is-active').wait_for(timeout=35000)
                    if simulate:
                        check('real daily backup used after primary HTTP failure',card.locator('.fanart-post-link').get_attribute('href')==backup['articleUrl'],width=width)
                        check('daily fallback note visible',card.get_by_text('실시간 조회가 원활하지 않아 일배치 저장본을 표시합니다.',exact=False).count()==1,width=width)
                        if backup['imageCount']>1:
                            initial=page.locator('.fanart-slide.is-active').get_attribute('src')
                            page.wait_for_function('(initial)=>document.querySelector(".fanart-slide.is-active")?.getAttribute("src")!==initial',arg=initial,timeout=12000)
                            check('real daily saved images automatically advance',True,width=width)
                    else:check('normal primary request still displayed',card.get_by_text('실시간 조회가 원활하지 않아 일배치 저장본을 표시합니다.',exact=False).count()==0,width=width)
                    check('calendar preserved',page.locator('.schedule-grid').count()==1,width=width,simulate=simulate)
                    check('no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width=width,simulate=simulate)
                    check('no JS errors',not errors,width=width,simulate=simulate)
                    card.screenshot(path=str(out/f'daily-{simulate}-{width}.png'))
                finally:context.close()
    finally:
        browser.close();(out/'report.json').write_text(json.dumps({'status':status,'backup':backup,'checks':checks},ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(checks),'batch':status['lastRun']},ensure_ascii=False))
