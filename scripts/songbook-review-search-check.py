#!/usr/bin/env python3
"""Offline component fixture with a local HTTP origin for session persistence; no live data."""
import argparse,json,shutil,threading,traceback
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--fixture',required=True);p.add_argument('--out',required=True);a=p.parse_args()
out=Path(a.out);out.mkdir(parents=True,exist_ok=True);checks=[];errors=[];body=Path(a.fixture).read_bytes()
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000})
 ctx.route('**/*',lambda route:route.continue_() if route.request.url.startswith(base+'/') else route.abort())
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def search(q):
  field.fill(q);panel.locator('.sb-auto-search').get_by_role('button',name='검색',exact=True).click()
  expect(panel.locator('.sb-auto-count')).not_to_contain_text('갱신 중')
 def control(name):page.get_by_role('button',name=name,exact=True).evaluate('(e)=>e.click()')
 def capture(target,name):
  for w in [1440,1024,768,390]:
   page.set_viewport_size({'width':w,'height':1000});target.scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/f'{name}-{w}.png'))
 def row(cid):return panel.locator(f'[data-candidate-id="{cid}"]')
 try:
  page.goto(base+'/');panel=page.locator('.sb-auto-admin');panel.locator('summary').click();expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  field=panel.get_by_label('자동 수집 확인 검색',exact=True);expect(field).to_be_visible()
  search('17');expect(row('17')).to_be_visible();expect(panel.locator('.sb-auto-count')).to_contain_text('1건');expect(panel.get_by_test_id('review-pagination')).to_have_text('1 / 1')
  assert page.evaluate('window.reviewSearchRequests.at(-1).p_page')==0;assert page.evaluate('window.reviewRequests.length')==0
  checks.append('query finds the seventeenth candidate beyond the initially visible page; search makes no review writes')
  search('테스트 가수');expect(panel.locator('.sb-auto-count')).to_contain_text('17건');panel.get_by_role('button',name='다음 항목',exact=True).click();expect(row('9')).to_be_visible()
  expect(field).to_have_value('테스트 가수');expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 3')
  row('9').get_by_role('button',name='정보 확인·연결',exact=True).click();row('9').get_by_role('button',name='새 노래로 등록',exact=True).click();row('9').get_by_label('VOD에서 노래 시작 위치',exact=True).fill('01:23:45')
  link=row('9').get_by_role('link',name='VOD 확인 ↗',exact=True);expect(link).to_have_attribute('target','_blank')
  link.evaluate("e=>e.addEventListener('click',ev=>{ev.preventDefault();window.open('about:blank','_blank')},{once:true})")
  with page.expect_popup() as popup:link.click()
  popup.value.close();page.bring_to_front();control('권한 재확인 시작');expect(field).to_be_disabled();control('권한 재확인 완료');expect(field).to_be_enabled()
  expect(field).to_have_value('테스트 가수');expect(row('9').get_by_label('VOD에서 노래 시작 위치',exact=True)).to_have_value('01:23:45');expect(panel).to_have_attribute('open','')
  checks.append('filtered pagination, VOD tab return and same-user auth refresh preserve query/page/selected draft')
  capture(panel.locator('.sb-auto-search'),'review-search')
  row('9').get_by_role('button',name='제외',exact=True).click();expect(row('9')).to_have_count(0);expect(panel.locator('.sb-auto-count')).to_contain_text('16건');expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 2');expect(field).to_have_value('테스트 가수');expect(panel.locator('.sb-auto-notice')).to_contain_text('삭제했습니다')
  checks.append('filtered exclusion keeps panel/query and reconciles page/count with success notice')
  panel.get_by_role('button',name='제외한 항목',exact=True).click();expect(row('9')).to_be_visible();expect(field).to_have_value('테스트 가수')
  panel.get_by_role('button',name='확인 완료',exact=True).click();expect(panel.locator('.sb-auto-empty')).to_contain_text('검색 결과가 없습니다');expect(field).to_have_value('테스트 가수')
  panel.get_by_role('button',name='확인 대기',exact=True).click();expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  search('17');control('다음 저장 실패');row('17').get_by_role('button',name='제외',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('삭제하지 않았습니다');expect(row('17')).to_be_visible();expect(field).to_have_value('17')
  row('17').get_by_role('button',name='제외',exact=True).click();expect(panel.locator('.sb-auto-count')).to_contain_text('0건');expect(panel.locator('.sb-auto-empty')).to_contain_text('검색 결과가 없습니다');expect(panel).to_have_attribute('open','')
  checks.append('all status tabs keep search; failed save preserves row and successful last-result removal yields explicit empty state')
  panel.get_by_role('button',name='검색 초기화',exact=True).click();expect(field).to_have_value('');expect(panel.locator('.sb-auto-count')).to_contain_text('15건');expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  search('가창 여부');expect(panel.locator('.sb-auto-count')).to_contain_text('15건')
  search('208123456');expect(panel.locator('.sb-auto-count')).to_contain_text('15건')
  search('미르 01');expect(row('1')).to_be_visible();expect(panel.locator('.sb-auto-count')).to_contain_text('1건');capture(panel.locator('.sb-auto-search'),'single-result')
  page.evaluate('window.reviewSearchFailure=true');search('실패검색');expect(panel.get_by_role('alert')).to_contain_text('검색 결과를 불러오지 못했습니다');expect(panel.locator('.sb-auto-empty')).to_have_count(0)
  search('미르 01');expect(row('1')).to_be_visible();expect(panel.get_by_role('alert')).to_have_count(0)
  checks.append('reset restores full tab; original timeline/VOD/multiword search and explicit errors are separate from zero matches')
  page.evaluate("window.reviewSearchDelays['늦은결과']=1200")
  field.fill('늦은결과');field.press('Enter');field.fill('미르 02');field.press('Enter');expect(row('2')).to_be_visible();page.wait_for_timeout(1400);expect(row('2')).to_be_visible();expect(field).to_have_value('미르 02')
  checks.append('late response cannot replace a newer search')
  search('테스트 가수');panel.get_by_role('button',name='다음 항목',exact=True).click();expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 2');page.reload();expect(panel).to_have_attribute('open','');expect(field).to_have_value('테스트 가수');expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 3');expect(row('9')).to_be_visible()
  # Fixture source resets data on reload, but session view retains filters and current page.
  checks.append('same-tab reload restores persisted expansion/search/page, independent of refreshed queue contents')
  panel.get_by_role('button',name='확인 대기',exact=True).click();expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  control('권한 회수');expect(panel).to_have_count(0);control('권한 복원');expect(panel).to_be_visible()
  checks.append('clicking active tab does not clear rows; revoked admin cannot see search or private results')
  assert not errors
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'live_writes':0,'search_transport':'mock read-only RPC; SQL verified separately'},ensure_ascii=False,indent=2))
 except Exception:
  (out/'error.txt').write_text(traceback.format_exc());(out/'failure.txt').write_text(page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'));raise
 finally:browser.close();server.shutdown()
print('PASS:',len(checks),'review search browser groups')
