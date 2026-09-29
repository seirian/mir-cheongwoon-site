"""Real React build + real PHP proxy, with synthetic cached article/images only."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import socket
import struct
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import urlopen
import zlib
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser(); parser.add_argument('--url',default='http://127.0.0.1:4173/'); parser.add_argument('--out',default='fanart-review'); args=parser.parse_args()
assert urlsplit(args.url).hostname in ['127.0.0.1','localhost']
out=Path(args.out); out.mkdir(parents=True,exist_ok=True); checks=[]
def check(name,ok,**details):
    checks.append({'check':name,'passed':bool(ok),**details})
    if not ok: raise AssertionError(name+' '+str(details))
def png(width,height,color):
    def chunk(kind,data): return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+bytes(color)*width)*height))+chunk(b'IEND',b'')
images=[png(500,500,(91,77,123)),png(450,700,(99,156,197)),png(700,450,(177,126,167))]
sources=['https://phinf.pstatic.net/test/'+str(i)+'.png' for i in range(3)]
ids=[hashlib.sha256(i.encode()).hexdigest() for i in sources]
urls=['/api/naver-fanart-image.php?id='+i for i in ids]
article={'status':'ok','articleId':123,'title':'같은 게시글 · 표지와 팬아트 2장','author':'테스트 작가','articleUrl':'https://cafe.naver.com/f-e/cafes/31003156/articles/123','imageUrl':urls[0],'imageUrls':urls,'imageCount':3,'sourceDate':'2026-09-30','isToday':True}
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory); shutil.copytree('server/api',root/'api'); cache=root/'api/_cache'
    (root/'api/config.php').write_text("<?php return ['release'=>'fixture','api_base'=>'/api/','naver_enabled'=>true];")
    def save(key,value):
        (cache/(key+'.state.php')).write_text('<?php http_response_code(404); exit; __halt_compiler();\n'+json.dumps({'saved':int(time.time()),'expires':int(time.time())+3600,'value':value}))
    save('fanart',{'public':article,'source':sources[0],'sources':sources})
    for i in range(3): save('image' if i==0 else 'fanart-image-'+str(i),{'id':ids[i],'mime':'image/png','data':base64.b64encode(images[i]).decode()})
    with socket.socket() as sock: sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
    server=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    origin=f'http://127.0.0.1:{port}'
    try:
        for _ in range(50):
            try: urlopen(origin+'/api/health.php',timeout=1); break
            except OSError: time.sleep(.1)
        payload=json.load(urlopen(origin+'/api/naver-fanart.php'))
        check('real PHP metadata exposes all image URLs and legacy imageUrl',payload['imageUrls']==urls and payload['imageUrl']==urls[0])
        for i,url in enumerate(urls): check('real PHP serves each independent cache slot',urlopen(origin+url).read()==images[i],slide=i+1)
        for query,status in [('?id='+'f'*64,404),('?url=https://evil.test/a.png',400),('?id[]=x',400)]:
            try: urlopen(origin+'/api/naver-fanart-image.php'+query); check('unsafe proxy request rejected',False)
            except HTTPError as error: check('unsafe proxy request rejected',error.code==status)
        with sync_playwright() as p:
            browser=p.chromium.launch()
            try:
                for width in [1440,390]:
                    for mode in ['multi','single','legacy','broken','all-broken','reduced','slow','empty']:
                        context=browser.new_context(viewport={'width':width,'height':1000},reduced_motion='reduce' if mode=='reduced' else 'no-preference')
                        errors=[]; requests=[]; pending=[]
                        def intercept(route):
                            req=route.request; path=urlsplit(req.url).path
                            if path.endswith('/api/naver-fanart.php'):
                                value=payload.copy()
                                if mode in ['single','legacy']: value['imageUrls']=[urls[0]]; value['imageCount']=1
                                if mode=='legacy': value.pop('imageUrls'); value['fallback']=True; value['stale']=True
                                if mode=='empty': value={'status':'empty'}
                                return route.fulfill(status=200,content_type='application/json',body=json.dumps(value))
                            if path.endswith('/api/naver-fanart-image.php'):
                                requests.append(req.url)
                                if mode=='all-broken' or (mode=='broken' and ids[1] in req.url): return route.fulfill(status=502,body='unavailable')
                                if mode=='slow' and ids[1] in req.url: pending.append(route); return
                                return route.fulfill(response=route.fetch(url=origin+path+'?'+urlsplit(req.url).query))
                            if req.method not in ['GET','HEAD','OPTIONS']: return route.abort()
                            if urlsplit(req.url).hostname=='preview-fixture.supabase.co':
                                return route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body='[]')
                            if urlsplit(req.url).hostname in ['127.0.0.1','localhost']: return route.continue_()
                            return route.abort()
                        context.route('**/*',intercept)
                        page=context.new_page(); page.on('pageerror',lambda error:errors.append(str(error)))
                        def wait_image(url): page.wait_for_function("(src)=>document.querySelector('.fanart-slide.is-active')?.getAttribute('src')===src",arg=url,timeout=12000)
                        try:
                            page.goto(args.url+'schedule',wait_until='domcontentloaded')
                            card=page.locator('.fanart-card'); card.scroll_into_view_if_needed(); page.mouse.move(0,0)
                            if mode=='empty':
                                page.get_by_text('팬아트 게시판에서 보기',exact=True).wait_for(); check('empty state retains board link',card.locator('.fanart-slideshow').count()==0,width=width)
                                continue
                            if mode=='all-broken':
                                card.get_by_text('원본 게시글에서 확인해 주세요.',exact=False).wait_for(); check('all failed images retain attribution and original link',card.locator('.fanart-post-link').count()==1,width=width)
                                continue
                            page.locator('.fanart-slide.is-active').wait_for()
                            stage=card.locator('.fanart-slide-stage'); before=stage.bounding_box()
                            first=page.locator('.fanart-slide.is-active').get_attribute('src')
                            if mode in ['single','legacy']:
                                check('single and old cache have no rotation controls',card.locator('.fanart-slide-controls').count()==0,width=width,mode=mode)
                                check('single image remains visible',first==urls[0],width=width,mode=mode)
                            elif mode=='multi':
                                wait_image(urls[1]); check('cover advances automatically to second body image',True,width=width)
                                page.get_by_role('button',name='팬아트 자동 넘김 일시정지').click(); page.mouse.move(0,0)
                                current=page.locator('.fanart-slide.is-active').get_attribute('src'); page.wait_for_timeout(5400)
                                check('pause stays on current artwork',page.locator('.fanart-slide.is-active').get_attribute('src')==current,width=width)
                                page.get_by_role('button',name='다음 팬아트 이미지').click(); wait_image(urls[2])
                                page.get_by_role('button',name='다음 팬아트 이미지').click(); wait_image(urls[0])
                                check('manual next wraps without changing article',card.locator('.fanart-post-link').get_attribute('href')==article['articleUrl'],width=width)
                                page.get_by_role('button',name='이전 팬아트 이미지').click(); wait_image(urls[2]); check('manual previous wraps',True,width=width)
                                page.wait_for_timeout(500);card.screenshot(path=str(out/f'fanart-{width}.png'))
                            elif mode=='reduced':
                                check('reduced motion disables automatic start',card.get_by_role('button',name='팬아트 자동 넘김 시작').count()==1,width=width)
                                check('reduced motion has no fade',page.locator('.fanart-slide.is-active').evaluate('(el)=>getComputedStyle(el).transitionDuration') in ['0s','1e-05s'],width=width)
                                page.get_by_role('button',name='다음 팬아트 이미지').focus(); page.keyboard.press('ArrowRight'); wait_image(urls[1]);check('keyboard navigation works',True,width=width)
                            elif mode=='broken':
                                page.wait_for_function("document.querySelector('.fanart-slide-count')?.textContent==='1 / 2'")
                                page.get_by_role('button',name='다음 팬아트 이미지').click(); wait_image(urls[2]);check('failed cover or artwork skipped individually',True,width=width)
                            elif mode=='slow':
                                page.get_by_role('button',name='다음 팬아트 이미지').click(); page.wait_for_timeout(500)
                                check('previous image remains until next download finishes',page.locator('.fanart-slide.is-active').get_attribute('src')==urls[0],width=width)
                                for route in pending:route.fulfill(status=200,content_type='image/png',body=images[1])
                                wait_image(urls[1]);check('downloaded image replaces previous image',True,width=width)
                            after=stage.bounding_box(); check('image changes preserve stage dimensions',abs(before['width']-after['width'])<1 and abs(before['height']-after['height'])<1,width=width,mode=mode)
                            check('images fit without cropping',page.locator('.fanart-slide.is-active').evaluate('(el)=>getComputedStyle(el).objectFit')=='contain',width=width,mode=mode)
                            check('no page horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width=width,mode=mode)
                            check('calendar remains present',page.locator('.schedule-grid').count()==1,width=width,mode=mode)
                            check('no JS errors',not errors,width=width,mode=mode)
                        except Exception:
                            page.screenshot(path=str(out/f'failure-{width}-{mode}.png'),full_page=True)
                            raise
                        finally: context.close()
            finally: browser.close()
    finally:
        server.terminate();server.wait(timeout=5)
        (out/'results.json').write_text(json.dumps({'checks':checks},ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(checks)}))
