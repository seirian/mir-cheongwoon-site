"""Offline browser proof: real PHP daily metadata and bytes; injected primary failures."""
import base64,json,shutil,socket,subprocess,tempfile,time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
out=Path('daily-review');out.mkdir(exist_ok=True);checks=[]
def check(name,ok,**extra):
    checks.append(dict(name=name,passed=bool(ok),**extra))
    if not ok:raise AssertionError(name)
with tempfile.TemporaryDirectory() as temp:
    root=Path(temp);api=root/'api';shutil.copytree('server/api',api);store=root/'daily';store.mkdir()
    (store/'.htaccess').write_text('Require all denied\nOptions -Indexes\n')
    (api/'config.php').write_text("<?php return ['release'=>'fixture','api_base'=>'/api/','naver_enabled'=>true,'fanart_daily_dir'=>"+repr(str(store))+"];")
    seed=r'''<?php
require $argv[1].'/_core.php';require $argv[1].'/_cache.php';require $argv[1].'/_fanart_daily.php';
$s=new \YeopMigration\DailyFanartStore($argv[2],fn()=>strtotime('2026-09-30T01:00:00+09:00'));
$meta=['status'=>'ok','articleId'=>222,'articleUrl'=>'https://cafe.naver.com/f-e/cafes/31003156/articles/222','title'=>'01시 일배치 팬아트','author'=>'검증 작가','sourceDate'=>'2026-09-29','imageUrls'=>['/api/naver-fanart-image.php?url=https%3A%2F%2Fphinf.pstatic.net%2Fa.png','/api/naver-fanart-image.php?url=https%3A%2F%2Fphinf.pstatic.net%2Fb.gif']];
$png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLVcAAAAASUVORK5CYII=');
$gif=base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
$s->refresh(fn()=>$meta,fn($url)=>str_ends_with($url,'.gif')?['body'=>$gif,'mime'=>'image/gif']:['body'=>$png,'mime'=>'image/png']);
$c=new \YeopMigration\SharedCache($argv[1].'/_cache');$c->remember('fanart',fn()=>[['public'=>['status'=>'unavailable','reason'=>'upstream_unavailable']],3600]);
'''
    seedpath=root/'seed.php';seedpath.write_text(seed);subprocess.run(['php',str(seedpath),str(api),str(store)],check=True)
    with socket.socket()as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    origin=f'http://127.0.0.1:{port}'
    server=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:payload=json.load(urlopen(origin+'/api/naver-fanart-backup.php'));break
            except OSError:time.sleep(.1)
        with sync_playwright()as p:
            browser=p.chromium.launch()
            for width in [1440,390]:
                for mode in ['server-fallback','http-failure','bad-json','image-failure','primary-wins']:
                    context=browser.new_context(viewport={'width':width,'height':1000});calls=[];errors=[]
                    def intercept(route):
                        req=route.request;u=urlsplit(req.url);path=u.path
                        if path.endswith('naver-fanart.php'):
                            calls.append('primary')
                            if mode=='http-failure':return route.fulfill(status=503,body='offline')
                            if mode=='bad-json':return route.fulfill(status=200,body='<html>upstream broken</html>')
                            if mode in ['image-failure','primary-wins']:
                                live={**payload,'articleId':999,'title':'실시간 팬아트 우선','articleUrl':'https://cafe.naver.com/f-e/cafes/31003156/articles/999','fallback':False,'stale':False,'fallbackKind':None,'imageUrls':['/api/naver-fanart-image.php?id='+'f'*64],'imageUrl':'/api/naver-fanart-image.php?id='+'f'*64}
                                return route.fulfill(status=200,content_type='application/json',body=json.dumps(live))
                            return route.fulfill(response=route.fetch(url=origin+path))
                        if path.endswith('naver-fanart-backup.php'):
                            calls.append('backup');return route.fulfill(response=route.fetch(url=origin+path))
                        if path.endswith('naver-fanart-image.php'):
                            if 'id='in u.query:
                                if mode=='image-failure':return route.fulfill(status=502,body='bad')
                                return route.fulfill(response=route.fetch(url=origin+payload['imageUrl']))
                            return route.fulfill(response=route.fetch(url=origin+path+'?'+u.query))
                        if path.endswith('naver-fanart-daily.php'):raise AssertionError('visitors must never trigger batch')
                        if u.hostname=='preview-fixture.supabase.co':return route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body='[]')
                        if u.hostname in ['127.0.0.1','localhost']:return route.continue_()
                        return route.abort()
                    context.route('**/*',intercept);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
                    try:
                        page.goto('http://127.0.0.1:4173/schedule',wait_until='domcontentloaded');card=page.locator('.fanart-card');card.scroll_into_view_if_needed();page.mouse.move(0,0)
                        page.locator('.fanart-slide.is-active').wait_for()
                        if mode=='primary-wins':
                            check('primary data displayed',card.get_by_text('실시간 팬아트 우선',exact=True).count()==1,width=width)
                            check('no daily fetch when live succeeds',calls==['primary'],width=width)
                        else:
                            card.get_by_text('01시 일배치 팬아트',exact=True).wait_for()
                            check('daily attribution not stale emergency',card.locator('.fanart-post-link').get_attribute('href')==payload['articleUrl'],width=width,mode=mode)
                            check('backup explanation visible',card.get_by_text('실시간 조회가 원활하지 않아 일배치 저장본을 표시합니다.',exact=False).count()==1,width=width,mode=mode)
                            check('daily image slider has two slides',card.locator('.fanart-slide-count').text_content().endswith('/ 2'),width=width,mode=mode)
                            if mode=='server-fallback':
                                page.wait_for_function("document.querySelector('.fanart-slide-count')?.textContent==='2 / 2'",timeout=12000)
                                check('real daily image bytes rotate',True,width=width)
                                card.screenshot(path=str(out/f'daily-fallback-{width}.png'))
                            else:check('single separate backup request',calls.count('backup')==1,width=width,mode=mode)
                        check('calendar unchanged',page.locator('.schedule-grid').count()==1,width=width,mode=mode)
                        check('no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width=width,mode=mode)
                        check('no JS errors',not errors,width=width,mode=mode)
                    except Exception:
                        page.screenshot(path=str(out/f'failure-{mode}-{width}.png'),full_page=True);raise
                    finally:context.close()
            browser.close()
    finally:
        server.terminate();server.wait(timeout=5);(out/'results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(checks)}))
