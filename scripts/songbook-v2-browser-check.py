#!/usr/bin/env python3
"""Guest and explicitly browser-local editor tests; never mutate server data."""
import argparse,json,re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);args=p.parse_args();out=Path(args.out);out.mkdir(parents=True,exist_ok=True);base=args.url.rstrip('/')+'/';errors=[];writes=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def guard(route):
  r=route.request
  if r.method not in ('GET','HEAD','OPTIONS'):writes.append({'url':r.url,'method':r.method});route.abort()
  else:route.continue_()
 ctx.route('**/*',guard)
 try:
  page.goto(base+'songbook/',wait_until='networkidle');expect(page.locator('.sb2-song').first).to_be_visible();assert page.locator('.sb2-song').count()==24
  text=page.locator('body').inner_text()
  for word in ['미르실버타운','gurmir','출처','적응도']:assert word not in text,word
  video=page.locator('.sb2-title-line .sb2-video').first;assert video.get_attribute('target')=='_blank';assert video.get_attribute('rel')=='noopener noreferrer';checks.append('source-free list and adjacent video link')
  page.get_by_role('checkbox',name='가요',exact=True).check();page.get_by_role('checkbox',name='팝송',exact=True).check();assert len(re.findall('category=',page.url))==2
  page.reload(wait_until='networkidle');expect(page.get_by_role('checkbox',name='가요',exact=True)).to_be_checked();expect(page.get_by_role('checkbox',name='팝송',exact=True)).to_be_checked();checks.append('multi-category persistence')
  page.get_by_role('button',name='초기화',exact=True).click()
  for n in range(1,6):
   page.get_by_role('radio',name=f'난이도 별 {n}개',exact=True).check();expect(page.get_by_role('radio',name=f'난이도 별 {n}개',exact=True)).to_be_checked()
   for e in page.locator('.sb2-song .sb2-stars').all():assert e.get_attribute('aria-label')==f'난이도 {n}점'
  page.get_by_role('radio',name='난이도 전체',exact=True).check();checks.append('five star filters and all')
  page.get_by_role('searchbox',name='곡명, 가수, 초성 검색').fill('ㄴㄴ');page.get_by_role('button',name='검색',exact=True).click();expect(page.locator('.sb2-song').first).to_be_visible();page.get_by_role('button',name='초기화',exact=True).click()
  page.locator('.sb2-title').first.click();expect(page.get_by_role('dialog')).to_be_visible();assert '출처' not in page.get_by_role('dialog').inner_text();page.keyboard.press('Escape');checks.append('search and detail')
  for width in [1440,1024,768,390]:
   page.set_viewport_size({'width':width,'height':1000});page.goto(base+'songbook/',wait_until='networkidle');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/f'songbook-v2-{width}.png'),full_page=True)
  checks.append('responsive widths')
  page.set_viewport_size({'width':1440,'height':1000});page.goto(base+'songbook/?demo=1',wait_until='networkidle');expect(page.get_by_text('편집 체험 모드',exact=True)).to_be_visible();row=page.locator('.sb2-song').first;sid=row.get_attribute('data-song-id');row.get_by_role('button',name='미르 숙련도 4점으로 설정',exact=True).click();expect(row.get_by_role('button',name='미르 숙련도 4점으로 설정',exact=True)).to_have_attribute('aria-pressed','true');page.reload(wait_until='networkidle');expect(page.locator(f'[data-song-id="{sid}"]').get_by_role('button',name='미르 숙련도 4점으로 설정',exact=True)).to_have_attribute('aria-pressed','true');checks.append('browser-local proficiency persistence')
  page.get_by_role('button',name='노래 추가',exact=True).click();d=page.get_by_role('dialog');d.get_by_label('곡명',exact=True).fill('검토용 새 노래');d.get_by_label('가수·작품',exact=True).fill('검토용 아티스트');d.get_by_role('checkbox',name='가요',exact=True).check();d.get_by_role('checkbox',name='팝송',exact=True).check();d.get_by_role('button',name='난이도 2점으로 설정',exact=True).click();d.get_by_role('button',name='노래책에 추가',exact=True).click();expect(page.get_by_role('dialog').get_by_role('heading',name='검토용 새 노래',exact=True)).to_be_visible();checks.append('manual song add with multiple categories')
  page.reload(wait_until='networkidle');expect(page.get_by_role('dialog').get_by_role('heading',name='검토용 새 노래',exact=True)).to_be_visible();page.keyboard.press('Escape');page.get_by_role('button',name='체험 종료',exact=True).click();expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0);checks.append('demo does not leak into real list')
  page.goto(base+'songbook/review/',wait_until='networkidle');assert '출처' not in page.locator('body').inner_text();page.screenshot(path=str(out/'review-v2-1440.png'),full_page=True);page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/'review-v2-390.png'),full_page=True)
  assert not errors,errors;assert not writes,writes
  (out/'report.json').write_text(json.dumps({'checks':checks,'errors':errors,'serverWrites':writes},ensure_ascii=False,indent=2))
 except Exception:
  page.screenshot(path=str(out/'failure.png'),full_page=True);(out/'failure.json').write_text(json.dumps({'url':page.url,'errors':errors,'writes':writes,'checks':checks},ensure_ascii=False));raise
 finally:browser.close()
