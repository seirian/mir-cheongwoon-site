#!/usr/bin/env python3
"""Korean-first discovery, saved names and variants. All editor writes stay in demo storage."""
import argparse, json, shutil, subprocess, sys, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
parser=argparse.ArgumentParser()
parser.add_argument('--url',required=True);parser.add_argument('--out',required=True)
parser.add_argument('--live-catalog',action='store_true');parser.add_argument('--skip-baseline',action='store_true')
args=parser.parse_args();base=args.url.rstrip('/')+'/';out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];writes=[]
if not args.skip_baseline:
 subprocess.run([sys.executable,'scripts/songbook-v3-browser-check.py','--url',base,'--out',str(out/'baseline')],check=True)
 checks=json.loads((out/'baseline/report.json').read_text())['checks']
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page()
 page.on('pageerror',lambda e:errors.append(str(e)))
 def guard(route):
  if route.request.method not in ('GET','HEAD','OPTIONS'):
   writes.append(route.request.url);route.abort()
  else:route.continue_()
 ctx.route('**/*',guard)
 canonical={'key':'itunes:1858796279','title':'영물이다','artist':'이오몽','album':'영물이다','aliases':['Wisp!'],'titleStatus':'reviewed-ko','releaseDate':'2025-12-12','duration':219000,'musicUrl':'https://music.apple.com/us/album/wisp/1858796278?i=1858796279'}
 instrumental={**canonical,'key':'itunes:1858796280','title':'영물이다 (inst)','aliases':['Wisp! (inst)'],'musicUrl':canonical['musicUrl'].replace('1858796279','1858796280')}
 def api(rows):
  ctx.route('**/api/songbook-search.php?*',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps({'songs':rows,'displayLocale':'ko-KR'})))
 def open_search(term):
  page.get_by_role('button',name='노래 추가',exact=True).click()
  d=page.get_by_role('dialog');d.get_by_label('추가할 곡 검색',exact=True).fill(term)
  d.get_by_role('button',name='곡 검색',exact=True).click()
  return d
 try:
  page.goto(base+'songbook/?demo=1',wait_until='networkidle')
  api([canonical,instrumental]);d=open_search('영물이다')
  expect(d.locator('.sb3-search-results strong').first).to_have_text('영물이다')
  expect(d.locator('.sb4-version')).to_have_text('반주')
  expect(d.locator('.sb3-search-results')).to_contain_text('3:39')
  page.screenshot(path=str(out/'korean-search-fixture-1440.png'),full_page=False)
  d.locator('.sb3-search-results button').first.click()
  expect(d.get_by_label('곡명',exact=True)).to_have_value('영물이다')
  expect(d.get_by_label('검색 별칭 · 쉼표로 구분',exact=True)).to_have_value('Wisp!')
  expect(d.get_by_role('button',name='검색어 ‘영물이다’를 검색 별칭에 추가',exact=True)).to_have_count(0)
  d.get_by_role('checkbox',name='가요',exact=True).check();d.get_by_role('button',name='노래책에 추가',exact=True).click()
  expect(page.get_by_role('dialog').get_by_role('heading',name='영물이다',exact=True)).to_be_visible()
  page.reload(wait_until='networkidle')
  expect(page.get_by_role('dialog').get_by_role('heading',name='영물이다',exact=True)).to_be_visible()
  page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
  for term in ['영물이다','Wisp!']:
   page.get_by_role('searchbox',name='곡명, 가수, 초성 검색').fill(term)
   page.get_by_role('button',name='검색',exact=True).click()
   expect(page.locator('.sb2-song')).to_have_count(1)
   expect(page.locator('.sb2-song .sb2-title')).to_have_text('영물이다')
  checks.append('Korean title imports automatically; original title alias retained; both names find the same saved song after reload')
  d=open_search('Wisp!');expect(d.locator('.sb3-search-results button').first).to_contain_text('등록됨')
  d.locator('.sb3-search-results button').first.click()
  expect(d.get_by_role('button',name='변경사항 저장',exact=True)).to_be_visible()
  d.get_by_label('곡명',exact=True).fill('내가 정한 표시 제목');d.get_by_role('button',name='변경사항 저장',exact=True).click()
  expect(page.get_by_role('dialog').get_by_role('heading',name='내가 정한 표시 제목',exact=True)).to_be_visible()
  page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0);d=open_search('영물이다')
  expect(d.locator('.sb3-search-results strong').first).to_have_text('내가 정한 표시 제목')
  d.locator('.sb3-search-results button').first.click()
  expect(d.get_by_label('곡명',exact=True)).to_have_value('내가 정한 표시 제목')
  d.get_by_role('button',name='한국어 제목 적용',exact=True).click()
  expect(d.get_by_label('곡명',exact=True)).to_have_value('영물이다')
  d.get_by_role('button',name='변경사항 저장',exact=True).click()
  expect(page.get_by_role('dialog').get_by_role('heading',name='영물이다',exact=True)).to_be_visible()
  page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
  checks.append('saved operator name overrides imported title; Korean suggestion requires explicit click; stable ID prevents duplicates')
  d=open_search('영물이다');d.locator('.sb3-search-results button').nth(1).click()
  expect(d.get_by_label('곡명',exact=True)).to_have_value('영물이다 (inst)')
  expect(d.get_by_role('button',name='노래책에 추가',exact=True)).to_be_visible();page.keyboard.press('Escape')
  checks.append('instrumental has distinct label and record identity, never edits vocal recording')
  ctx.unroute('**/api/songbook-search.php?*')
  api([{'title':'Unverified song','artist':'한국 가수','aliases':[]}]);d=open_search('찾고 싶은 한국 제목')
  expect(d.locator('.sb3-search-results')).to_contain_text('원문 제목 · 한국어명 미확인')
  d.locator('.sb3-search-results button').first.click()
  expect(d.get_by_label('곡명',exact=True)).to_have_value('Unverified song');page.keyboard.press('Escape')
  checks.append('unconfirmed foreign title remains original rather than being changed to search query')
  ctx.unroute('**/api/songbook-search.php?*')
  if args.live_catalog:
   # Live API must itself localize; a browser-only fixture or query substitution cannot pass this.
   response=ctx.request.get(base+'api/songbook-search.php?q=%EC%98%81%EB%AC%BC%EC%9D%B4%EB%8B%A4&country=AUTO',timeout=35000)
   assert response.status==200, response.text()
   data=response.json();song=next(r for r in data['songs'] if r['key']=='itunes:1858796279')
   assert song['title']=='영물이다' and song['artist']=='이오몽' and 'Wisp!' in song['aliases'], song
   assert data['songs'][0]['title']=='영물이다',data['songs'][0]
   (out/'live-korean-api.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
   # Clear only browser-local fixture state, never actual catalog records.
   page.evaluate("localStorage.removeItem('mir-songbook-v2-demo')")
   page.goto(base+'songbook/?demo=1',wait_until='networkidle');d=open_search('영물이다')
   expect(d.locator('.sb3-search-results strong').first).to_have_text('영물이다',timeout=30000)
   expect(d.locator('.sb3-search-results')).to_contain_text('이오몽')
   (out/'live-korean-search.txt').write_text(d.locator('.sb3-search-results').inner_text(),encoding='utf-8')
   page.screenshot(path=str(out/'live-korean-search-1440.png'),full_page=False)
   page.set_viewport_size({'width':390,'height':844})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   d.locator('.sb3-search-results').scroll_into_view_if_needed()
   page.screenshot(path=str(out/'live-korean-search-390.png'),full_page=False)
   d.locator('.sb3-search-results button').first.click()
   expect(d.get_by_label('곡명',exact=True)).to_have_value('영물이다')
   expect(d.get_by_label('검색 별칭 · 쉼표로 구분',exact=True)).to_have_value('Wisp!')
   d.get_by_label('곡명',exact=True).scroll_into_view_if_needed()
   page.screenshot(path=str(out/'live-korean-import-390.png'),full_page=False)
   page.keyboard.press('Escape')
   checks.append('LIVE API and UI return 영물이다 — 이오몽 with Wisp alias; automatic form population; actual search screenshots')
  for width in [1440,1024,768,390]:
   page.set_viewport_size({'width':width,'height':1000});page.goto(base+'songbook/',wait_until='networkidle')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   expect(page.locator('.sb2-song')).to_have_count(24)
   page.screenshot(path=str(out/f'songbook-v4-{width}.png'),full_page=False)
  page.goto(base+'songbook/review/',wait_until='networkidle')
  expect(page.get_by_role('heading',level=1)).to_contain_text('4차 검토안')
  for word in ['gurmir','미르실버타운','출처']:assert word not in page.locator('body').inner_text()
  page.screenshot(path=str(out/'review-v4-390.png'),full_page=False)
  checks.append('four viewport sizes and fourth review copy; no collection-site labels')
  assert not errors,errors;assert not writes,writes
  (out/'report.json').write_text(json.dumps({'checks':checks,'errors':errors,'serverWrites':writes,'baselineIncluded':not args.skip_baseline},ensure_ascii=False,indent=2))
 except Exception:
  page.screenshot(path=str(out/'failure.png'),full_page=True)
  (out/'failure.json').write_text(json.dumps({'url':page.url,'traceback':traceback.format_exc(),'errors':errors,'writes':writes,'checks':checks},ensure_ascii=False,indent=2));raise
 finally:browser.close()
