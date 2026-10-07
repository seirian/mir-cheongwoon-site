#!/usr/bin/env python3
"""Verify actual Korean web font rendering resources without installing runner fonts or writing live data."""
import argparse,json,re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--sha',required=True);a=p.parse_args()
out=Path('songbook-live-production/font-check');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1050});writes=[]
 def guard(route):
  if route.request.method not in ('GET','HEAD','OPTIONS'):writes.append(route.request.method);return route.abort()
  return route.continue_()
 page.route('**/*',guard)
 try:
  page.goto('https://mir.yeop.net/songbook/',wait_until='domcontentloaded')
  expect(page.locator('.ck-song')).to_have_count(25,timeout=30000)
  marker=page.locator('meta[name=yeop-release]').get_attribute('content');assert marker.endswith('_'+a.sha[:8])
  info=page.evaluate('''async()=>{
    const family=getComputedStyle(document.querySelector('.ck-production')).fontFamily;
    const loaded=await document.fonts.load('700 32px "Noto Sans KR"','미르의 노래책 신청 가능 확인 필요');
    await document.fonts.ready;
    return {family,faces:loaded.map(f=>({family:f.family,status:f.status})),ready:document.fonts.check('700 32px "Noto Sans KR"','미르의 노래책')};
  }''')
  assert 'Noto Sans KR' in info['family'] and info['faces'] and info['ready'],info
  assert all(f['status']=='loaded' for f in info['faces']) and not writes
  for width in [1440,390]:
   page.set_viewport_size({'width':width,'height':1050});page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(250)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.screenshot(path=str(out/f'songbook-korean-{width}.png'))
  (out/'report.json').write_text(json.dumps({'release':marker,'checks':['production uses the existing Korean web font; matching Korean font faces downloaded and loaded without runner font installation'],'font':info,'writes':writes},ensure_ascii=False,indent=2)+'\n')
 finally:browser.close()
print('PASS: Korean web font loaded on the production route')
