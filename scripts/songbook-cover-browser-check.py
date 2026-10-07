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
  toggle('cover');assert ids()==initial[:24];expect(page.locator('.sg-cover-card')).to_have_count(24);expect(page.locator('.ck-list-heading')).to_have_count(0)
  expect(page.locator('.sg-cover-hint')).to_have_count(0);expect(page.get_by_text('커버나 곡명을 누르면 신청 문구·연결 영상·미르 숙련도를 확인할 수 있습니다.',exact=True)).to_have_count(0)
  for card in page.locator('.sg-cover-card').all():
   song=byid[card.get_attribute('data-song-id')];expect(card.locator('.sg-card-artist')).to_have_text(song['artist'] or '가수 미확인')
   expect(card.locator('.ck-song-categories [role=listitem]')).to_have_text(song['categories'])
   expect(card.locator('.sg-card-difficulty')).to_contain_text('★'*song['difficulty'] if song['difficulty'] else '미정')
  toggle('list');assert ids()==initial
  checks.append('list defaults25 and cover defaults24 from the same sorted catalog; all card metadata matches, unwanted hint is absent')
  go(perPage='50',sort='artist',layout='list');sorted_first=ids()
  go(perPage='50',page='2',sort='artist',layout='list');before=ids();toggle('cover');assert ids()==sorted_first[:24]
  query=parse_qs(urlsplit(page.url).query);assert query=={'sort':['artist'],'layout':['cover']},query
  page.reload(wait_until='domcontentloaded');expect(page.locator('.sg-cover-card')).to_have_count(24);assert ids()==sorted_first[:24]
  page.go_back(wait_until='domcontentloaded');expect(page.locator('#songbook-results')).to_have_attribute('data-layout','list');assert ids()==before
  expect(page.get_by_label('페이지당 곡 수',exact=True)).to_have_value('50')
  category=songs[0]['categories'][0];go(category=category,layout='list',request=songs[0]['requestStatus']);before=ids();toggle('cover');assert ids()==before[:24]
  query=parse_qs(urlsplit(page.url).query);assert query['category']==[category] and query['request']==[songs[0]['requestStatus']]
  checks.append('switch resets only page and incompatible length, preserving category/status/sort; browser back restores prior list page50')
  go(layout='cover');length=page.get_by_label('페이지당 곡 수',exact=True)
  expect(length.locator('option')).to_have_text(['24곡씩','48곡씩','96곡씩']);expect(length).to_have_value('24')
  for n in (24,48,96):
   length.select_option(str(n));expect(page.locator('.sg-cover-card')).to_have_count(min(n,len(songs)))
   expect(page.locator('.ck-pagination')).to_contain_text(f'1 / {(len(songs)+n-1)//n}')
   first=ids();page.get_by_role('button',name='다음 페이지',exact=True).click()
   # Equal-sized pages can have the same count before navigation renders.
   # Wait for the actual page indicator before comparing all displayed IDs.
   expect(page.locator('.ck-pagination')).to_contain_text(f'2 / {(len(songs)+n-1)//n}')
   expect(page.locator('.sg-cover-card')).to_have_count(min(n,len(songs)-n));assert not set(first).intersection(ids())
   page.reload(wait_until='domcontentloaded');expect(page.locator('.sg-cover-card')).to_have_count(min(n,len(songs)-n));expect(length).to_have_value(str(n))
   page.get_by_role('button',name='이전 페이지',exact=True).click()
   expect(page.locator('.ck-pagination')).to_contain_text(f'1 / {(len(songs)+n-1)//n}')
   expect(page.locator('.sg-cover-card')).to_have_count(min(n,len(songs)));assert ids()==first
  length.select_option('24');checks.append('cover offers only24/48/96, default24; each length pages without overlap and survives reload')
  toggle('list');expect(length.locator('option')).to_have_text(['10곡씩','25곡씩','50곡씩','100곡씩']);expect(length).to_have_value('25')
  for n in (10,25,50,100):length.select_option(str(n));expect(page.locator('.ck-song')).to_have_count(min(n,len(songs)))
  toggle('cover');expect(length).to_have_value('24');expect(page.locator('.sg-cover-card')).to_have_count(24)
  checks.append('list retains10/25/50/100; returning to cover never inherits a list-only page length')
  for bad in ('10','25','50','100','999','bad'):
   go(layout='cover',perPage=bad);expect(length).to_have_value('24');expect(page.locator('.sg-cover-card')).to_have_count(24)
  go(layout='list',perPage='48');expect(length).to_have_value('25');expect(page.locator('.ck-song')).to_have_count(25)
  go(layout='cover',perPage='24',page='999');expect(page.locator('.sg-cover-card')).to_have_count(len(songs)%24 or 24);expect(page.get_by_role('button',name='다음 페이지',exact=True)).to_be_disabled()
  go(layout='cover',q='not-a-song-9f719383',perPage='96');expect(page.locator('.sg-cover-card')).to_have_count(0);expect(page.locator('.ck-pagination')).to_contain_text('1 / 1')
  go(layout='cover');checks.append('legacy or invalid sizes fall back per layout; last and empty pages are bounded without skipped songs')

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
   grid=page.locator('.sg-cover-grid');ncols=grid.evaluate('(e)=>getComputedStyle(e).gridTemplateColumns.split(" ").length');expected_cols=6 if width>=1024 else 4 if width>620 else 2;assert ncols==expected_cols,(width,ncols)
   row_count=grid.locator('.sg-cover-card').evaluate_all('(els)=>new Set(els.map(e=>Math.round(e.getBoundingClientRect().top))).size');assert row_count==24//expected_cols,(width,row_count)
   for c in page.locator('.sg-cover-card').all()[:12]:
    b=c.locator('.sg-cover-art').bounding_box();assert abs(b['width']-b['height'])<2,(width,b)
    outer=c.bounding_box()
    for tag in c.locator('.ck-song-categories [role=listitem]').all():
     t=tag.bounding_box();assert t['x']>=outer['x'] and t['x']+t['width']<=outer['x']+outer['width']+1
   page.screenshot(path=str(out/f'cover-{width}.png'))
   if width==1440:page.screenshot(path=str(out/'cover-24-desktop-full.png'),full_page=True)
  checks.append('exact six-column/four-row24 desktop, four-column tablet, two-column mobile at six widths; square covers and no overflow')
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
  version=page.request.get(base+'cover-version.json').json();assert version['reviewVersion']==2
  (out/'report.json').write_text(json.dumps({'url':base,'version':version,'checks':checks,'javascript_errors':errors,'writes':writes,'sensitive_requests':sensitive,'snapshot_count':len(songs),'image_mode':'live external images with real fallback' if a.live else 'external images with fallback'},ensure_ascii=False,indent=2)+'\n')
 except Exception:
  page.screenshot(path=str(out/'failure.png'));(out/'failure.txt').write_text(traceback.format_exc());raise
 finally:browser.close()
print('PASS',len(checks),'cover preview browser groups')
