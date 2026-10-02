#!/usr/bin/env python3
"""Exercise revision two regressions and revision three discovery/media. Never write server data."""
import argparse,json,shutil,subprocess,sys,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('--url',required=True);parser.add_argument('--out',required=True);parser.add_argument('--live-catalog',action='store_true');args=parser.parse_args()
out=Path(args.out);out.mkdir(parents=True,exist_ok=True);base=args.url.rstrip('/')+'/'
subprocess.run([sys.executable,'scripts/songbook-v2-browser-check.py','--url',base,'--out',str(out/'baseline')],check=True)
base_report=json.loads((out/'baseline/report.json').read_text());checks=base_report['checks'];errors=[];writes=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def guard(route):
  if route.request.method not in ('GET','HEAD','OPTIONS'):
   writes.append(route.request.url);route.abort()
  else:route.continue_()
 ctx.route('**/*',guard)
 try:
  page.goto(base+'songbook/?demo=1',wait_until='networkidle')
  expect(page.locator('.sb2-song')).to_have_count(24)
  mixed=next(r for r in page.locator('.sb2-song').all() if r.locator('.sb3-vod.is-soop').count() and r.locator('.sb3-vod.is-youtube').count())
  for link in mixed.locator('.sb3-vod').all():
   assert link.get_attribute('target')=='_blank'
   assert link.get_attribute('rel')=='noopener noreferrer'
  assert page.locator('.sb3-cover.is-video img').count()>0
  soop=mixed.locator('.sb3-vod.is-soop').first;target=soop.get_attribute('href')
  ctx.route(target,lambda r:r.fulfill(status=200,content_type='text/html',body='<title>VOD link test</title>'))
  with page.expect_popup() as event:soop.click()
  popup=event.value;expect(popup).to_have_url(target);popup.close();ctx.unroute(target)
  checks.append('all VOD platforms displayed; SOOP and YouTube each open separately; square VOD covers')
  page.get_by_role('button',name='노래 추가',exact=True).click();dialog=page.get_by_role('dialog')
  fixture={'songs':[{'title':'Wisp!','artist':'이오몽','album':'Wisp! - Single','artworkUrl':'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/40/6a/38/406a387f-ebd7-307b-78d6-51b08dcdcbee/8800348779697_cover.jpg/100x100bb.jpg','musicUrl':'https://music.apple.com/us/album/wisp/1858796278?i=1858796279'}]}
  ctx.route('**/api/songbook-search.php?*',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps(fixture)))
  dialog.get_by_label('추가할 곡 검색',exact=True).fill('영물이다');dialog.get_by_role('button',name='곡 검색',exact=True).click()
  expect(dialog.locator('.sb3-search-results button').first).to_contain_text('Wisp!');dialog.locator('.sb3-search-results button').first.click()
  expect(dialog.get_by_label('가수·작품',exact=True)).to_have_value('이오몽')
  dialog.get_by_role('button',name='검색어 ‘영물이다’를 검색 별칭에 추가',exact=True).click()
  dialog.get_by_role('checkbox',name='가요',exact=True).check()
  dialog.get_by_label('연결 영상 · 한 줄에 한 주소',exact=True).fill('https://www.youtube.com/watch?v=abcdefghijk\nhttps://vod.sooplive.com/player/123?change_second=42\nhttps://www.youtube.com/watch?v=lmnopqrstuv')
  page.screenshot(path=str(out/'editor-external-v3-1440.png'),full_page=True)
  dialog.get_by_role('button',name='노래책에 추가',exact=True).click();expect(page.get_by_role('dialog').get_by_role('heading',name='Wisp!',exact=True)).to_be_visible()
  page.reload(wait_until='networkidle');dialog=page.get_by_role('dialog')
  expect(dialog.locator('.sb3-vod')).to_have_count(3);expect(dialog.locator('.sb3-cover.is-album img')).to_have_attribute('src',fixture['songs'][0]['artworkUrl'])
  expect(dialog.get_by_role('link',name='Wisp! SOOP VOD 새 탭에서 보기',exact=True)).to_have_attribute('href','https://vod.sooplive.com/player/123?change_second=42')
  page.keyboard.press('Escape')
  page.get_by_role('searchbox',name='곡명, 가수, 초성 검색').fill('영물이다');page.get_by_role('button',name='검색',exact=True).click();expect(page.locator('.sb2-song')).to_have_count(1)
  checks.append('external song import, album artwork and three numbered VODs survive refresh; Korean alias searchable')
  page.get_by_role('button',name='노래 추가',exact=True).click();dialog=page.get_by_role('dialog')
  dialog.get_by_label('추가할 곡 검색',exact=True).fill('영물이다');dialog.get_by_role('button',name='곡 검색',exact=True).click()
  expect(dialog.locator('.sb3-existing button')).to_have_count(1);expect(dialog.locator('.sb3-search-results button').first).to_contain_text('등록됨')
  dialog.locator('.sb3-search-results button').first.click();expect(dialog.get_by_role('button',name='변경사항 저장',exact=True)).to_be_visible()
  page.keyboard.press('Escape');ctx.unroute('**/api/songbook-search.php?*')
  checks.append('existing catalog and external results shown together; duplicate track opens editing rather than inserts')
  page.get_by_role('button',name='노래 추가',exact=True).click();dialog=page.get_by_role('dialog')
  ctx.route('**/api/songbook-search.php?*',lambda r:r.fulfill(status=502,content_type='application/json',body=json.dumps({'error':'search_unavailable'})))
  dialog.get_by_label('추가할 곡 검색',exact=True).fill('없는노래');dialog.get_by_role('button',name='곡 검색',exact=True).click()
  expect(dialog.get_by_text('외부 음악 검색에 연결하지 못했습니다. 직접 입력은 사용할 수 있습니다.',exact=True)).to_be_visible()
  expect(dialog.get_by_label('곡명',exact=True)).to_be_enabled();page.keyboard.press('Escape');ctx.unroute('**/api/songbook-search.php?*')
  checks.append('upstream failure distinguished from no results; manual registration remains enabled')
  if args.live_catalog:
   page.get_by_role('button',name='노래 추가',exact=True).click();dialog=page.get_by_role('dialog')
   dialog.get_by_label('추가할 곡 검색',exact=True).fill('영물이다');dialog.get_by_role('button',name='곡 검색',exact=True).click()
   expect(dialog.locator('.sb3-search-results')).to_contain_text('Wisp!',timeout=30000);expect(dialog.locator('.sb3-search-results')).to_contain_text('이오몽')
   (out/'live-catalog-example.txt').write_text(dialog.locator('.sb3-search-results').inner_text(),encoding='utf-8')
   page.screenshot(path=str(out/'live-external-search-v3.png'),full_page=True)
   page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/'live-external-search-v3-mobile.png'),full_page=True)
   page.keyboard.press('Escape');checks.append('LIVE external 영물이다 query resolves Wisp by 이오몽, no seeded catalog entry')
  for width in [1440,1024,768,390]:
   page.set_viewport_size({'width':width,'height':1000});page.goto(base+'songbook/',wait_until='networkidle')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   expect(page.locator('.sb2-song')).to_have_count(24)
   for word in ['gurmir','미르실버타운','출처','적응도']:assert word not in page.locator('body').inner_text()
   page.screenshot(path=str(out/f'top-songbook-v3-{width}.png'),full_page=False)
  checks.append('revision three public desktop/mobile images and controls; no fan-source labels')
  assert not errors,errors;assert not writes,writes
  (out/'report.json').write_text(json.dumps({'checks':checks,'errors':errors,'serverWrites':writes,'baseline':base_report},ensure_ascii=False,indent=2),encoding='utf-8')
 except Exception:
  page.screenshot(path=str(out/'failure.png'),full_page=True)
  (out/'failure.json').write_text(json.dumps({'url':page.url,'traceback':traceback.format_exc(),'errors':errors,'writes':writes,'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8');raise
 finally:browser.close()
