#!/usr/bin/env python3
"""Viewer preview regression. Only static reads and isolated preference/clipboard changes."""
import argparse,json,re,shutil,traceback
from pathlib import Path
from urllib.parse import urlsplit,parse_qs,urlencode
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);p.add_argument('--live',action='store_true');a=p.parse_args()
base=a.url.rstrip('/')+'/';out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];writes=[];sensitive=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page()
 page.on('pageerror',lambda e:errors.append(str(e)))
 ctx.add_init_script("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text}}});")
 def guard(route):
  r=route.request
  if r.method not in ('GET','HEAD','OPTIONS'):writes.append(r.url);return route.abort()
  if '/auth/v1/' in r.url or '/rest/v1/' in r.url or '/api/' in urlsplit(r.url).path and urlsplit(r.url).netloc==urlsplit(base).netloc:sensitive.append(r.url);return route.abort()
  return route.continue_()
 ctx.route('**/*',guard)
 def go(**params):
  page.goto(base+'songbook/?'+urlencode(params),wait_until='domcontentloaded');expect(page.locator('.ck-library')).to_have_attribute('aria-busy','false',timeout=30000)
 def ids():return page.locator('#songbook-results>[data-song-id]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.songId)')
 def toggle(mode):page.get_by_role('group',name='노래책 보기 방식').get_by_role('button',name='커버형' if mode=='cover' else '목록형',exact=True).click();expect(page.locator('#songbook-results')).to_have_attribute('data-layout',mode)
 def detail():return page.get_by_role('dialog').filter(has=page.locator('h2'))
 try:
  go();expect(page.locator('#songbook-results')).to_have_attribute('data-layout','list');expect(page.locator('.ck-song')).to_have_count(25)
  snapshot=page.request.get(base+'songbook-cover-snapshot.json').json();songs=snapshot['songs'];byid={s['id']:s for s in songs}
  assert len(songs)>=25;initial=ids();assert not page.locator('.ck-bulk-toolbar,.ck-song-select,.ck-admin').count()
  page.evaluate("localStorage.setItem('mir-songbook-favorites-v1','[\"operational-sentinel\"]');localStorage.setItem('mir-songbook-layout-v1','list')")
  checks.append('current production list is default25; static snapshot only, no admin controls or authentication')
  toggle('cover');assert ids()==initial;expect(page.locator('.sg-cover-card')).to_have_count(25);expect(page.locator('.ck-list-heading')).to_have_count(0)
  for card in page.locator('.sg-cover-card').all():
   song=byid[card.get_attribute('data-song-id')];expect(card.locator('.sg-card-artist')).to_have_text(song['artist'] or '가수 미확인')
   expect(card.locator('.ck-song-categories [role=listitem]')).to_have_text(song['categories'])
   expect(card.locator('.sg-card-difficulty')).to_contain_text('★'*song['difficulty'] if song['difficulty'] else '미정')
  toggle('list');assert ids()==initial
  checks.append('same page identities/count/order in both layouts; card title, artist, all categories and difficulty match source')
  go(perPage='50',page='2',sort='artist',layout='list');before=ids();url_before=parse_qs(urlsplit(page.url).query);toggle('cover');assert ids()==before
  url_after=parse_qs(urlsplit(page.url).query);assert {k:v for k,v in url_before.items() if k!='layout'}=={k:v for k,v in url_after.items() if k!='layout'}
  page.reload(wait_until='domcontentloaded');expect(page.locator('.sg-cover-card')).to_have_count(len(before));assert ids()==before
  page.go_back(wait_until='domcontentloaded');expect(page.locator('#songbook-results')).to_have_attribute('data-layout','list');assert ids()==before
  category=songs[0]['categories'][0];go(category=category,layout='list',request=songs[0]['requestStatus']);before=ids();toggle('cover');assert ids()==before
  checks.append('layout switch preserves search/status/category/sort/page/page-size; reload and browser back keep the same records')
  go(layout='cover');length=page.get_by_label('페이지당 곡 수',exact=True)
  for n in (10,25,50,100):length.select_option(str(n));expect(page.locator('.sg-cover-card')).to_have_count(min(n,len(songs)))
  length.select_option('25');checks.append('10/25/50/100 lengths and default25 reused by cover layout, not a separate filtered catalog')
  card=page.locator('.sg-cover-card').first;sid=card.get_attribute('data-song-id');song=byid[sid]
  card.get_by_role('button',name=song['title']+' 즐겨찾기',exact=True).click();expect(page.get_by_role('dialog')).to_have_count(0)
  toggle('list');row=page.locator(f'[data-song-id="{sid}"]');expect(row.get_by_role('button',name=song['title']+' 즐겨찾기',exact=True)).to_have_attribute('aria-pressed','true')
  toggle('cover');page.get_by_role('button',name='즐겨찾기',exact=True).click();expect(page.locator('.sg-cover-card')).to_have_count(1)
  page.reload(wait_until='domcontentloaded');expect(page.locator('.sg-cover-card')).to_have_count(1)
  assert page.evaluate("localStorage.getItem('mir-songbook-favorites-v1')")=='["operational-sentinel"]';assert page.evaluate("localStorage.getItem('mir-songbook-layout-v1')")=='list'
  checks.append('favorite control never opens detail; both views share preview favorites, with production storage untouched')
  card=page.locator('.sg-cover-card').first;art=card.get_by_role('button',name=song['title']+' 커버로 상세 보기',exact=True);art.focus();page.keyboard.press('Enter');d=page.get_by_role('dialog');expect(d).to_be_visible()
  expect(d.locator('h2')).to_have_text(song['title']);expect(d.locator('.ck-song-categories [role=listitem]')).to_have_text(song['categories'])
  expect(d.locator('.ck-video')).to_have_count(len(song['videoUrls']))
  for link in d.locator('.ck-video').all():assert link.get_attribute('target')=='_blank' and 'noopener' in link.get_attribute('rel');assert not link.locator('.lucide-external-link').count()
  if song['requestStatus']!='unavailable':d.get_by_role('button',name='신청 문구 복사',exact=True).click();assert page.evaluate('window.__copied')==(song['artist']+' - ' if song['artist'] else '')+song['title']
  d.get_by_role('button',name='곡 링크 복사',exact=True).click();shared=page.evaluate('window.__copied');assert parse_qs(urlsplit(shared).query)=={'song':[sid]}
  page.keyboard.press('Escape');expect(d).to_have_count(0);expect(art).to_be_focused();checks.append('cover/keyboard opens full existing detail; safe platform links, request copy/share and Escape focus return work')
  go(layout='cover');toggle('list');page.screenshot(path=str(out/'list-1440.png'))
  toggle('cover')
  for width in (320,390,768,1024,1440,1920):
   page.set_viewport_size({'width':width,'height':1050});page.locator('.sg-display-controls').scroll_into_view_if_needed();page.wait_for_timeout(600)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
   grid=page.locator('.sg-cover-grid');ncols=grid.evaluate('(e)=>getComputedStyle(e).gridTemplateColumns.split(" ").length');assert ncols>=2,(width,ncols)
   for c in page.locator('.sg-cover-card').all()[:12]:
    b=c.locator('.sg-cover-art').bounding_box();assert abs(b['width']-b['height'])<2,(width,b)
    outer=c.bounding_box()
    for tag in c.locator('.ck-song-categories [role=listitem]').all():
     t=tag.bounding_box();assert t['x']>=outer['x'] and t['x']+t['width']<=outer['x']+outer['width']+1
   page.screenshot(path=str(out/f'cover-{width}.png'))
  checks.append('two-column mobile and responsive desktop grid at six widths; square covers, all categories retained and no horizontal overflow')
  go();expect(page.locator('#songbook-results')).to_have_attribute('data-layout','cover');go(layout='unsupported');expect(page.locator('#songbook-results')).to_have_attribute('data-layout','list');go(layout='list');expect(page.locator('#songbook-results')).to_have_attribute('data-layout','list')
  checks.append('saved preference applies to return visits; explicit list URL overrides cover and invalid layouts fall back safely')
  # Edge cases replace only this context static snapshot; no server records change.
  sample={'id':'edge-1','title':'아주 긴 곡 제목을 확인하는 검토용 예시 '*5,'artist':'','aliases':[],'categories':['가요','긴 카테고리 이름이 여러 줄로 표시되는지 확인합니다','기타'],'difficulty':None,'proficiency':None,'requestStatus':'unreviewed','videoUrls':['https://www.youtube.com/watch?v=abcdefghijk&t=70'],'artworkUrl':'https://is1-ssl.mzstatic.com/image/thumb/test/300x300bb.jpg','musicUrl':'https://music.apple.com/kr/album/test/123?i=123'}
  ctx.route('**/songbook-cover-snapshot.json',lambda r:r.fulfill(content_type='application/json',body=json.dumps({'version':1,'capturedAt':snapshot['capturedAt'],'songs':[sample]},ensure_ascii=False)))
  failed_art=[]
  def fail_image(r):failed_art.append(r.request.url);r.fulfill(status=404,body='not found')
  ctx.route('https://is1-ssl.mzstatic.com/**',fail_image);ctx.route('https://i.ytimg.com/**',fail_image)
  go(layout='cover');edge=page.locator('.sg-cover-card');expect(edge.locator('.sg-empty-art')).to_be_visible();assert len(failed_art)>=2;expect(edge.locator('.sg-card-artist')).to_have_text('가수 미확인');expect(edge.locator('.sg-card-difficulty')).to_contain_text('미정')
  for width in (320,390,1440):
   page.set_viewport_size({'width':width,'height':1050});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');expect(edge.locator('.ck-song-categories [role=listitem]')).to_have_text(sample['categories'])
  checks.append('album error tries video fallback once, then music placeholder; unknown artist/difficulty and long multiple categories remain usable')
  # Deliberately denied preference writes must not break the switch or display.
  ctx.add_init_script("const g=Storage.prototype.getItem,s=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(k.includes('cover-preview-layout'))throw Error('blocked');return g.call(this,k)};Storage.prototype.setItem=function(k,v){if(k.includes('cover-preview-layout'))throw Error('blocked');return s.call(this,k,v)};")
  go();expect(page.locator('#songbook-results')).to_have_attribute('data-layout','list');toggle('cover');expect(edge).to_have_count(1)
  checks.append('disabled browser preference storage still allows list/cover switching without an exception')
  assert not errors and not writes and not sensitive,(errors,writes,sensitive)
  version=page.request.get(base+'cover-version.json').json()
  (out/'report.json').write_text(json.dumps({'url':base,'version':version,'checks':checks,'javascript_errors':errors,'writes':writes,'sensitive_requests':sensitive,'snapshot_count':len(songs),'image_mode':'live external images with real fallback' if a.live else 'external images with fallback'},ensure_ascii=False,indent=2)+'\n')
 except Exception:
  page.screenshot(path=str(out/'failure.png'));(out/'failure.txt').write_text(traceback.format_exc());raise
 finally:browser.close()
print('PASS',len(checks),'cover preview browser groups')
