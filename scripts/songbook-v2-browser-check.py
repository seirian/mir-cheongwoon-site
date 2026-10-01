#!/usr/bin/env python3
"""Read-only browsing plus explicitly local-only editor tests. No server mutations."""
import argparse, json, re, shutil, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
parser=argparse.ArgumentParser();parser.add_argument('--url',required=True);parser.add_argument('--out',required=True)
args=parser.parse_args();out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
base=args.url.rstrip('/')+'/';errors=[];writes=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def guard(route):
  request=route.request
  if request.method not in ('GET','HEAD','OPTIONS'):
   writes.append({'url':request.url,'method':request.method});route.abort()
  else:route.continue_()
 ctx.route('**/*',guard)
 def choose(role,name):
  control=page.get_by_role(role,name=name,exact=True)
  control.click()
  # React Router transitions commit after the input event; await the observable checked state.
  expect(control).to_be_checked()
 try:
  page.goto(base+'songbook/',wait_until='networkidle')
  expect(page.locator('.sb2-song')).to_have_count(24)
  if base.startswith('https://'):expect(page.locator('.sb2-error')).to_have_count(0)
  text=page.locator('body').inner_text()
  for word in ['미르실버타운','gurmir','출처','적응도']:assert word not in text,word
  video=page.locator('.sb2-title-line .sb2-video').first
  target=video.get_attribute('href');assert video.get_attribute('target')=='_blank' and video.get_attribute('rel')=='noopener noreferrer'
  ctx.route(target,lambda route:route.fulfill(status=200,content_type='text/html',body='<title>Video link test</title>'))
  with page.expect_popup() as opened:video.click()
  popup=opened.value;expect(popup).to_have_url(target);popup.close();ctx.unroute(target)
  checks.append('source-free list and adjacent icon opens a separate tab')
  choose('checkbox','가요');choose('checkbox','팝송')
  assert len(re.findall('category=',page.url))==2
  page.reload(wait_until='networkidle')
  expect(page.get_by_role('checkbox',name='가요',exact=True)).to_be_checked()
  expect(page.get_by_role('checkbox',name='팝송',exact=True)).to_be_checked()
  checks.append('multi-category selection and reload persistence')
  page.get_by_role('button',name='초기화',exact=True).click()
  for n in range(1,6):
   choose('radio',f'난이도 별 {n}개')
   for rating in page.locator('.sb2-song .sb2-stars').all():assert rating.get_attribute('aria-label')==f'난이도 {n}점'
  choose('radio','난이도 전체');expect(page.locator('.sb2-song')).to_have_count(24)
  checks.append('five difficulty levels and all filter')
  page.get_by_role('searchbox',name='곡명, 가수, 초성 검색').fill('ㄴㄴ')
  page.get_by_role('button',name='검색',exact=True).click();expect(page.locator('.sb2-song').first).to_be_visible()
  page.get_by_role('button',name='초기화',exact=True).click();expect(page.locator('.sb2-song')).to_have_count(24)
  page.locator('.sb2-title').first.click();expect(page.get_by_role('dialog')).to_be_visible()
  assert '출처' not in page.get_by_role('dialog').inner_text()
  for _ in range(12):
   page.keyboard.press('Tab');assert page.evaluate('Boolean(document.activeElement.closest("dialog"))')
  page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
  checks.append('initials search and accessible source-free details')
  with page.expect_download() as exported:page.get_by_role('button',name='CSV',exact=True).click()
  csv=Path(exported.value.path()).read_text(encoding='utf-8-sig');assert '출처' not in csv and '난이도' in csv and '미르 숙련도' in csv
  checks.append('source-free CSV export')
  for width in [1440,1024,768,390]:
   page.set_viewport_size({'width':width,'height':1000});page.goto(base+'songbook/',wait_until='networkidle')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.screenshot(path=str(out/f'songbook-v2-{width}.png'),full_page=True)
  checks.append('desktop tablet and mobile widths')
  page.set_viewport_size({'width':1440,'height':1000});page.goto(base+'songbook/?demo=1',wait_until='networkidle')
  expect(page.get_by_text('편집 체험 모드',exact=True)).to_be_visible()
  row=page.locator('.sb2-song').first;sid=row.get_attribute('data-song-id')
  row.get_by_role('button',name='미르 숙련도 4점으로 설정',exact=True).click()
  expect(row.get_by_role('button',name='미르 숙련도 4점으로 설정',exact=True)).to_have_attribute('aria-pressed','true')
  page.reload(wait_until='networkidle')
  expect(page.locator(f'[data-song-id="{sid}"]').get_by_role('button',name='미르 숙련도 4점으로 설정',exact=True)).to_have_attribute('aria-pressed','true')
  checks.append('browser-local proficiency save and reload')
  page.get_by_role('button',name='노래 추가',exact=True).click();dialog=page.get_by_role('dialog')
  dialog.get_by_label('곡명',exact=True).fill('검토용 새 노래');dialog.get_by_label('가수·작품',exact=True).fill('검토용 아티스트')
  dialog.get_by_role('checkbox',name='가요',exact=True).check();dialog.get_by_role('checkbox',name='팝송',exact=True).check()
  dialog.get_by_label('검색 별칭 · 쉼표로 구분',exact=True).fill('검토곡, Test Song')
  dialog.get_by_label('연결 영상 · 한 줄에 한 주소',exact=True).fill('https://www.youtube.com/watch?v=abcdefghijk')
  dialog.get_by_label('신청 가능 상태',exact=True).select_option('available')
  dialog.get_by_role('button',name='난이도 2점으로 설정',exact=True).click()
  page.screenshot(path=str(out/'song-editor-v2-1440.png'),full_page=True)
  dialog.get_by_role('button',name='노래책에 추가',exact=True).click()
  expect(page.get_by_role('dialog').get_by_role('heading',name='검토용 새 노래',exact=True)).to_be_visible()
  page.reload(wait_until='networkidle');dialog=page.get_by_role('dialog')
  expect(dialog.get_by_role('heading',name='검토용 새 노래',exact=True)).to_be_visible()
  expect(dialog.get_by_role('link',name='영상 1 새 탭에서 보기 ↗',exact=True)).to_have_attribute('href','https://www.youtube.com/watch?v=abcdefghijk')
  assert '신청 가능 상태: 가능' in dialog.inner_text() and 'Test Song' in dialog.inner_text()
  page.keyboard.press('Escape');checks.append('manual song add with category, aliases, video and status persisted')
  page.get_by_role('button',name='노래 추가',exact=True).click();dialog=page.get_by_role('dialog')
  ctx.route('**/api/songbook-search.php?*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'songs':[{'title':'카탈로그 선택 테스트','artist':'가수 테스트'}]})))
  dialog.get_by_label('추가할 곡 검색',exact=True).fill('선택 테스트');dialog.get_by_role('button',name='곡 검색',exact=True).click()
  dialog.get_by_role('button',name=re.compile('카탈로그 선택 테스트')).click()
  expect(dialog.get_by_label('곡명',exact=True)).to_have_value('카탈로그 선택 테스트');page.keyboard.press('Escape')
  ctx.unroute('**/api/songbook-search.php?*');checks.append('catalog search and select with isolated API fixture')
  page.get_by_role('button',name='체험 종료',exact=True).click();expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
  page.get_by_role('searchbox',name='곡명, 가수, 초성 검색').fill('검토용 새 노래');page.get_by_role('button',name='검색',exact=True).click();expect(page.locator('.sb2-song')).to_have_count(0)
  checks.append('demo data never becomes public catalog')
  page.goto(base+'songbook/review/',wait_until='networkidle');assert '출처' not in page.locator('body').inner_text()
  page.screenshot(path=str(out/'review-v2-1440.png'),full_page=True);page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/'review-v2-390.png'),full_page=True)
  checks.append('review page desktop and mobile')
  assert not errors,errors;assert not writes,writes
  (out/'report.json').write_text(json.dumps({'checks':checks,'errors':errors,'serverWrites':writes},ensure_ascii=False,indent=2))
 except Exception:
  page.screenshot(path=str(out/'failure.png'),full_page=True)
  (out/'failure.json').write_text(json.dumps({'url':page.url,'traceback':traceback.format_exc(),'errors':errors,'writes':writes,'checks':checks},ensure_ascii=False,indent=2));raise
 finally:browser.close()
