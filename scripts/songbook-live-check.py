#!/usr/bin/env python3
"""Read-only post-deployment songbook checks. Never log in or write live data."""
import argparse, json, re, shutil, traceback, urllib.request, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
p=argparse.ArgumentParser();p.add_argument('--sha',required=True);p.add_argument('--out',default='songbook-live-production');a=p.parse_args()
origin='https://mir.yeop.net';out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
def get(path):
 url=path if path.startswith('https://') else origin+path
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'MirSongbookReleaseCheck/1.0'}),timeout=35) as r:
  assert r.status==200;return r.read(3000000).decode('utf-8')
html=get('/songbook/');m=re.search(r'<meta name="yeop-release" content="([^"]+)"',html)
assert m and m[1].endswith('_'+a.sha[:8]), 'active release is not the requested commit'
rid=m[1];assert 'noindex, nofollow' not in html
checks=['songbook HTTP200, expected active release marker and index metadata'];errors=[];writes=[];api_responses=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def guard(route):
  if route.request.method not in ('GET','HEAD','OPTIONS'):
   writes.append({'method':route.request.method,'host':urllib.parse.urlsplit(route.request.url).hostname});return route.abort()
  route.continue_()
 ctx.route('**/*',guard)
 def record(response):
  u=urllib.parse.urlsplit(response.url)
  if '/rest/v1/songbook_' in u.path:api_responses.append({'path':u.path,'status':response.status})
 page.on('response',record)
 try:
  page.goto(origin+'/songbook/',wait_until='domcontentloaded')
  expect(page.locator('.sb2-song')).to_have_count(24,timeout=30000)
  expect(page.get_by_role('button',name='편집 로그인',exact=True)).to_have_count(0)
  expect(page.locator('.songbook-page input[type=password]')).to_have_count(0)
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
  expect(page.locator('.sb2-toolbar button')).to_have_count(0)
  expect(page.get_by_role('link',name='노래 찾아보기',exact=True)).to_have_count(0)
  assert '4차 검토안' not in page.locator('body').inner_text()
  assert not re.search('gurmir|mir427[.]vercel|원본 출처',page.locator('body').inner_text(),re.I)
  expect(page.locator('.sb2-error')).to_have_count(0)
  checks.append('production songbook has no account buttons or redundant search link, anonymous editing denied and acquisition labels absent')
  for w in [1440,1024,768,390]:
   page.set_viewport_size({'width':w,'height':1050});page.wait_for_timeout(200)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
   expect(page.get_by_role('button',name='편집 로그인',exact=True)).to_have_count(0)
   page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(out/f'songbook-{w}.png'))
  page.set_viewport_size({'width':1440,'height':1050});page.locator('.sb2-song').first.scroll_into_view_if_needed();page.screenshot(path=str(out/'songbook-list-1440.png'))
  checks.append('1440/1024/768/390 responsive layouts with no duplicate login button or horizontal overflow')
  page.get_by_role('link',name='로그인 / 회원가입',exact=True).click()
  expect(page.get_by_label('아이디',exact=True)).to_be_visible(timeout=20000)
  expect(page.get_by_label('아이디',exact=True)).to_have_attribute('type','text')
  expect(page.get_by_label('비밀번호',exact=True)).to_have_attribute('type','password')
  expect(page.locator('form input[type=email]')).to_have_count(0)
  for w in [1440,390]:
   page.set_viewport_size({'width':w,'height':1000});page.screenshot(path=str(out/f'account-login-{w}.png'))
  checks.append('existing footer login link opens the shared username/password account form')
  page.goto(origin+'/songbook/?demo=1',wait_until='domcontentloaded');expect(page.locator('.sb2-song')).to_have_count(24,timeout=20000)
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0);expect(page.locator('.sb2-demo')).to_have_count(0)
  expect(page.get_by_role('button',name='편집 로그인',exact=True)).to_have_count(0)
  page.goto(origin+'/songbook/review/',wait_until='domcontentloaded');expect(page).to_have_url(origin+'/songbook',timeout=20000)
  checks.append('production demo query cannot enable writes and review path redirects')
  page.goto(origin+'/songbook/?mode=admin&data=sample&attention=artist&youtube=missing',wait_until='domcontentloaded')
  expect(page.locator('.ck-production .ck-song')).to_have_count(24,timeout=20000)
  expect(page.locator('.ck-admin')).to_have_count(0)
  expect(page.get_by_role('button',name='관리자 체험',exact=True)).to_have_count(0)
  first=page.locator('.ck-song').first
  expect(first.locator('.ck-status')).to_be_visible()
  expect(first.locator('.ck-song-categories')).to_be_visible()
  expect(first.get_by_role('button',name=re.compile('신청 문구 복사$'))).to_be_visible()
  expect(first.get_by_role('button',name=re.compile('곡 링크 복사$'))).to_be_visible()
  for button in first.locator('.ck-video').all():
   assert '대표' not in button.inner_text()
   expect(button.locator('svg')).to_have_count(1)
   expect(button).to_have_attribute('target','_blank')
  checks.append('approved usage UI is active: per-song states/categories, row copy/share, platform labels without arrows; preview/admin URL flags ignored')
  assert not errors and not writes, {'errors':errors,'writes':writes}
  assert any(r['path']=='/rest/v1/songbook_entries' and r['status']==200 for r in api_responses)
  assert any(r['path']=='/rest/v1/songbook_ratings' and r['status']==200 for r in api_responses)
  assert all('songbook_preview' not in r['path'] for r in api_responses)
  checks.append('real production table reads HTTP200; no preview tables, JS exceptions or mutation requests')
 except Exception:
  traceback.print_exc()
  try:page.screenshot(path=str(out/'failure.png'));(out/'failure.txt').write_text(page.locator('body').inner_text())
  except Exception:pass
  raise
 finally:browser.close()
result=json.loads(get('/_yeop_releases/'+rid+'/api/songbook-search.php?'+urllib.parse.urlencode({'q':'영물이다','country':'AUTO'})))
assert any(s.get('title')=='영물이다' and s.get('artist')=='이오몽' for s in result.get('songs',[])), 'Korean catalog search did not return verified title'
checks.append('active release music search returns 영물이다 — 이오몽')
platform_results={}
for provider,term in [('apple','영물이다'),('youtube','영물이다 이오몽')]:
 payload=json.loads(get('/_yeop_releases/'+rid+'/api/songbook-platform-search.php?'+urllib.parse.urlencode({'provider':provider,'q':term,'country':'AUTO'})))
 assert payload.get('state')=='ok' and payload.get('songs'), 'production platform search failed: '+provider
 assert all(row.get('provider')==provider for row in payload['songs'])
 if provider=='youtube':
  assert all(row.get('artist')=='' and row.get('videoUrl','').startswith('https://www.youtube.com/watch?v=') for row in payload['songs'])
 else:
  assert any(row.get('title')=='영물이다' and row.get('artist')=='이오몽' for row in payload['songs'])
 platform_results[provider]={'status':'ok','count':len(payload['songs'])}
 checks.append('production '+provider+' platform search returns separate live results')
for suffix in ['api/_songbook_youtube_key.php','api/_songbook_youtube_key.php/test']:
 try:
  with urllib.request.urlopen(origin+'/_yeop_releases/'+rid+'/'+suffix,timeout=20) as response:status=response.status
 except urllib.error.HTTPError as error:status=error.code
 assert status in (403,404), 'private runtime URL not blocked'
checks.append('production key configuration and PATH_INFO URLs are HTTP-denied')
report={'release':rid,'source_sha':a.sha,'checks':checks,'javascript_errors':errors,'writes':writes,'production_api_reads':api_responses,'music_search_partial':result.get('partial'),'platform_results':platform_results}
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'release':rid,'checks':len(checks),'music_search_partial':result.get('partial'),'status':'passed'},ensure_ascii=False))
