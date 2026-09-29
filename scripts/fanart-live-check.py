"""Read the production API and schedule without authentication or writes."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urljoin
from urllib.request import urlopen, Request
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--expected-sha',default='');parser.add_argument('--out',default='fanart-live-review');args=parser.parse_args()
out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
def get(url):
    with urlopen(Request(url,headers={'User-Agent':'MirFanartReview/1.0'}),timeout=35) as response:return response.read(7*1024*1024)
html=get('https://mir.yeop.net/schedule').decode()
release=re.search(r'name="yeop-release" content="([^"]+)"',html).group(1)
if args.expected_sha:assert release.endswith('_'+args.expected_sha[:8])
base='https://mir.yeop.net/_yeop_releases/'+release+'/'
feature=json.loads(get(base+'api/naver-fanart.php'))
report={'release':release,'status':feature.get('status'),'articleId':feature.get('articleId'),'fallback':feature.get('fallback',False),'reason':feature.get('reason'),'image_count':len(feature.get('imageUrls',[])),'viewports':[]}
try:
    if feature.get('status')=='ok':
        urls=feature.get('imageUrls',[feature['imageUrl']]);assert 1<=len(urls)<=12 and feature['imageUrl']==urls[0]
        report['image_count']=len(urls)
        for url in urls[:2]:
            assert re.fullmatch(r'(?:https://mir\.yeop\.net)?/_yeop_releases/'+re.escape(release)+r'/api/naver-fanart-image\.php\?(id|fallback)=[a-f0-9]{64}',url)
            data=get(urljoin(base,url));assert len(data)>10
    with sync_playwright() as p:
        browser=p.chromium.launch()
        try:
            for width in [1440,390]:
                context=browser.new_context(viewport={'width':width,'height':1000})
                context.route('**/*',lambda route:route.continue_() if route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
                page=context.new_page();page.goto('https://mir.yeop.net/schedule',wait_until='domcontentloaded');card=page.locator('.fanart-card');card.scroll_into_view_if_needed()
                if feature.get('status')=='ok':page.locator('.fanart-slide.is-active').wait_for(timeout=40000)
                assert page.locator('.schedule-grid').count()==1
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                card.screenshot(path=str(out/f'fanart-{width}.png'))
                report['viewports'].append({'width':width,'controls':card.locator('.fanart-slide-controls').count(),'passed':True})
                context.close()
        finally:browser.close()
finally:(out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
