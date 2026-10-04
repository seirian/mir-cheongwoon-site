#!/usr/bin/env python3
"""Offline UI checks: in-memory props only, no login, credentials or external API."""
import argparse,json,shutil,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--fixture',required=True);p.add_argument('--out',required=True);a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000});ctx.route('**/*',lambda route:route.abort())
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));panel=page.locator('.sb-auto-admin')
 def control(name):page.get_by_role('button',name=name,exact=True).evaluate('(e)=>e.click()')
 try:
  page.set_content(Path(a.fixture).read_text(),wait_until='domcontentloaded');expect(panel).to_be_visible()
  panel.locator('summary').click();expect(panel.locator('.sb-auto-candidate')).to_have_count(8);expect(panel.locator('.sb-auto-count')).to_contain_text('17건')
  panel.get_by_role('button',name='다음 항목',exact=True).click();expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 3')
  expect(panel.locator('[data-candidate-id="9"]')).to_be_visible()
  row=panel.locator('[data-candidate-id="9"]');row.get_by_role('button',name='정보 확인·연결',exact=True).click()
  row.get_by_label('곡명',exact=True).fill('확인 중인 제목');row.get_by_label('확인한 가창 시작 시간 · 초').fill('456')
  link=row.get_by_role('link',name='VOD 확인 ↗',exact=True);expect(link).to_have_attribute('target','_blank');assert 'change_second=128' in link.get_attribute('href')
  # Do not contact the real VOD service. Exercise a real new tab with about:blank.
  link.evaluate("e=>e.addEventListener('click',event=>{event.preventDefault();window.open('about:blank','_blank')},{once:true})")
  link.scroll_into_view_if_needed();pos=page.evaluate('scrollY');page.evaluate("window.reviewNode=document.querySelector('.sb-auto-admin')")
  with page.expect_popup() as opened:link.click()
  opened.value.close();page.bring_to_front();control('권한 재확인 시작')
  expect(panel).to_have_attribute('open','');expect(row.get_by_role('button',name='제외',exact=True)).to_be_disabled()
  assert page.evaluate("window.reviewNode===document.querySelector('.sb-auto-admin')")
  control('권한 재확인 완료');expect(row.get_by_role('button',name='제외',exact=True)).to_be_enabled()
  expect(row.get_by_label('곡명',exact=True)).to_have_value('확인 중인 제목');expect(row.get_by_label('확인한 가창 시작 시간 · 초')).to_have_value('456');expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 3')
  assert abs(page.evaluate('scrollY')-pos)<30
  checks.append('new-tab return and same-account permission recheck preserve panel, page, draft and scroll; writes pause')
  for w in [1440,390]:
   page.set_viewport_size({'width':w,'height':1000});panel.locator('summary').scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/f'review-open-{w}.png'))
  checks.append('desktop/mobile open panel and form fit without horizontal overflow')
  row.get_by_role('button',name='제외',exact=True).click();expect(row).to_have_count(0);expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  expect(panel).to_have_attribute('open','');expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 2');expect(panel.locator('.sb-auto-count')).to_contain_text('16건');expect(panel.locator('.sb-auto-notice')).to_contain_text('확인 목록에서 삭제했습니다')
  for w in [1440,390]:
   page.set_viewport_size({'width':w,'height':1000});panel.locator('.sb-auto-notice').scroll_into_view_if_needed();page.screenshot(path=str(out/f'review-deleted-{w}.png'))
  checks.append('successful removal refills only the current list and displays a visible success message')
  panel.get_by_role('button',name='처리 알림 닫기').click();control('다음 저장 실패');cid=panel.locator('.sb-auto-candidate').first.get_attribute('data-candidate-id')
  panel.locator('.sb-auto-candidate').first.get_by_role('button',name='제외',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('항목은 삭제하지 않았습니다');expect(panel.locator(f'[data-candidate-id="{cid}"]')).to_be_visible();expect(panel.locator('.sb-auto-notice')).to_have_count(0)
  checks.append('failed removal preserves the row and displays no false success')
  for count in range(15,7,-1):
   panel.locator('.sb-auto-candidate').first.get_by_role('button',name='제외',exact=True).click();expect(panel.locator('.sb-auto-count')).to_contain_text(f'{count}건');expect(panel.get_by_role('button',name='새로고침',exact=True)).to_be_enabled()
  expect(panel.get_by_test_id('review-pagination')).to_have_text('1 / 1');expect(panel.locator('.sb-auto-candidate')).to_have_count(8);expect(panel).to_have_attribute('open','')
  checks.append('continuous removal clamps an emptied last page without collapsing or leaving an empty list')
  control('다른 창에서 제외');control('화면 복귀');expect(panel.locator('.sb-auto-count')).to_contain_text('7건');expect(panel.locator('.sb-auto-candidate')).to_have_count(7)
  checks.append('other-session changes reconcile on focus while the panel remains open')
  panel.get_by_role('button',name='제외한 항목',exact=True).click();expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  expect(panel.locator('.sb-auto-candidate').get_by_role('button',name='제외',exact=True)).to_have_count(0)
  panel.get_by_role('button',name='자동 제외 기록',exact=True).click();expect(panel.locator('.sb-auto-candidate')).to_have_count(0);expect(panel).to_have_attribute('open','')
  checks.append('manual and automatic exclusion archives are accessible without exposing an invalid delete action')
  control('권한 회수');expect(panel).to_have_count(0);assert not errors
  checks.append('confirmed permission removal clears private review content')
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'external_requests_allowed':0,'live_writes':0},ensure_ascii=False,indent=2))
 except Exception:
  (out/'error.txt').write_text(traceback.format_exc());(out/'failure.txt').write_text(page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'));raise
 finally:browser.close()
print('PASS:',len(checks),'offline review UI groups')
