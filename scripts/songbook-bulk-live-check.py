#!/usr/bin/env python3
"""Read-only deployment check for public page length and absence of administrator selection controls."""
import argparse,json,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--sha',required=True);a=p.parse_args();out=Path('songbook-live-production/bulk-pagination');out.mkdir(parents=True,exist_ok=True)
writes=[];errors=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1050});page.on('pageerror',lambda e:errors.append(str(e)))
 def guard(route):
  if route.request.method not in ('GET','HEAD','OPTIONS'):writes.append(route.request.method);return route.abort()
  return route.continue_()
 page.route('**/*',guard)
 try:
  page.goto('https://mir.yeop.net/songbook/',wait_until='domcontentloaded');expect(page.locator('.ck-song')).to_have_count(25,timeout=30000)
  marker=page.locator('meta[name=yeop-release]').get_attribute('content');assert marker.endswith('_'+a.sha[:8])
  length=page.get_by_label('페이지당 곡 수',exact=True);expect(length).to_have_value('25');expect(length.locator('option')).to_have_text(['10곡씩','25곡씩','50곡씩','100곡씩'])
  for size in [10,25,50,100]:length.select_option(str(size));expect(page.locator('.ck-song')).to_have_count(size)
  page.reload(wait_until='domcontentloaded');expect(page.locator('.ck-song')).to_have_count(100,timeout=30000);expect(length).to_have_value('100');length.select_option('25')
  expect(page.locator('.ck-song-select,.ck-bulk-toolbar')).to_have_count(0)
  checks.append('default25 and all four lengths work with real public songs, reload preserves chosen length, anonymous bulk controls absent')
  for width in [1440,390]:
   page.set_viewport_size({'width':width,'height':1050});page.locator('.ck-page-size').scroll_into_view_if_needed();page.wait_for_timeout(200)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   outer=page.locator('.ck-list-controls').bounding_box();inner=page.locator('.ck-page-size').bounding_box();assert abs(outer['x']+outer['width']-inner['x']-inner['width'])<2
   page.screenshot(path=str(out/f'page-size-{width}.png'))
  checks.append('page size appears at right above list on desktop/mobile without overflow; production font and existing layout retained')
  assert not writes and not errors
  (out/'report.json').write_text(json.dumps({'release':marker,'checks':checks,'writes':writes,'javascript_errors':errors},ensure_ascii=False,indent=2)+'\n')
 finally:browser.close()
print('PASS:',len(checks),'read-only bulk/pagination deployment checks')
