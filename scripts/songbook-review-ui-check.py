#!/usr/bin/env python3
"""Real review components; only in-memory fixtures, no credentials or live writes."""
import argparse,json,re,shutil,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--fixture',required=True);p.add_argument('--out',required=True);a=p.parse_args()
out=Path(a.out);out.mkdir(parents=True,exist_ok=True);checks=[];errors=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000});ctx.route('**/*',lambda route:route.abort())
 def fresh():
  pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.set_content(Path(a.fixture).read_text(),wait_until='domcontentloaded')
  pn=pg.locator('.sb-auto-admin');expect(pn).to_be_visible();pn.locator('summary').click();expect(pn.locator('.sb-auto-candidate')).to_have_count(8)
  return pg,pn
 def control(name):page.get_by_role('button',name=name,exact=True).evaluate('(e)=>e.click()')
 def open_row(cid,new=False):
  row=panel.locator(f'[data-candidate-id="{cid}"]');expect(row).to_be_visible()
  row.get_by_role('button',name='정보 확인·연결',exact=True).click()
  if new:row.get_by_role('button',name='새 노래로 등록',exact=True).click()
  return row
 def approve(row):row.get_by_role('button',name='가창 확인 후 반영',exact=True).click()
 def capture(target,name):
  for w in [1440,390]:
   page.set_viewport_size({'width':w,'height':1000});target.scroll_into_view_if_needed()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.screenshot(path=str(out/f'{name}-{w}.png'))
 def vod_roundtrip(row):
  link=row.get_by_role('link',name='VOD 확인 ↗',exact=True);expect(link).to_have_attribute('target','_blank')
  link.evaluate("e=>e.addEventListener('click',event=>{event.preventDefault();window.open('about:blank','_blank')},{once:true})")
  with page.expect_popup() as opened:link.click()
  opened.value.close();page.bring_to_front()
 try:
  page,panel=fresh();expect(panel.locator('.sb-auto-count')).to_contain_text('17건')
  panel.get_by_role('button',name='다음 항목',exact=True).click();expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 3')
  row=open_row('9',True);row.get_by_label('곡명',exact=True).fill('확인 중인 제목');row.get_by_label('VOD에서 노래 시작 위치').fill('07:36')
  link=row.get_by_role('link',name='VOD 확인 ↗',exact=True);assert 'change_second=128' in link.get_attribute('href');link.scroll_into_view_if_needed()
  pos=page.evaluate('scrollY');page.evaluate("window.reviewNode=document.querySelector('.sb-auto-admin')");vod_roundtrip(row)
  control('권한 재확인 시작');expect(panel).to_have_attribute('open','');expect(row.get_by_role('button',name='제외',exact=True)).to_be_disabled()
  assert page.evaluate("window.reviewNode===document.querySelector('.sb-auto-admin')")
  control('권한 재확인 완료');expect(row.get_by_role('button',name='제외',exact=True)).to_be_enabled()
  expect(row.get_by_label('곡명',exact=True)).to_have_value('확인 중인 제목');expect(row.get_by_label('VOD에서 노래 시작 위치')).to_have_value('00:07:36')
  expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 3');assert abs(page.evaluate('scrollY')-pos)<30
  checks.append('VOD popup/refocus and same-account revalidation preserve panel, page, draft, scroll and new-song selection')
  capture(panel.locator('summary'),'review-open');checks.append('desktop/mobile expanded panel fits without horizontal overflow')
  row.get_by_role('button',name='제외',exact=True).click();expect(row).to_have_count(0);expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  expect(panel).to_have_attribute('open','');expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 2');expect(panel.locator('.sb-auto-count')).to_contain_text('16건')
  expect(panel.locator('.sb-auto-notice')).to_contain_text('삭제했습니다');capture(panel.locator('.sb-auto-notice'),'review-deleted')
  checks.append('successful exclusion removes only its row, refills the current page and shows completion feedback')
  panel.get_by_role('button',name='처리 알림 닫기').click();control('다음 저장 실패');cid=panel.locator('.sb-auto-candidate').first.get_attribute('data-candidate-id')
  panel.locator('.sb-auto-candidate').first.get_by_role('button',name='제외',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('항목은 삭제하지 않았습니다')
  expect(panel.locator(f'[data-candidate-id="{cid}"]')).to_be_visible();expect(panel.locator('.sb-auto-notice')).to_have_count(0)
  checks.append('failed exclusion retains the row without false success')
  for count in range(15,7,-1):
   panel.locator('.sb-auto-candidate').first.get_by_role('button',name='제외',exact=True).click();expect(panel.locator('.sb-auto-count')).to_contain_text(f'{count}건')
   expect(panel.get_by_role('button',name='새로고침',exact=True)).to_be_enabled()
  expect(panel.get_by_test_id('review-pagination')).to_have_text('1 / 1');expect(panel.locator('.sb-auto-candidate')).to_have_count(8);expect(panel).to_have_attribute('open','')
  checks.append('continuous exclusion returns to a valid last page without collapsing')
  control('다른 창에서 제외');control('화면 복귀');expect(panel.locator('.sb-auto-count')).to_contain_text('7건');expect(panel.locator('.sb-auto-candidate')).to_have_count(7)
  checks.append('other-window changes refresh only the open list')
  panel.get_by_role('button',name='제외한 항목',exact=True).click();expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  expect(panel.locator('.sb-auto-candidate').get_by_role('button',name='제외',exact=True)).to_have_count(0)
  panel.get_by_role('button',name='자동 제외 기록',exact=True).click();expect(panel.locator('.sb-auto-candidate')).to_have_count(0);expect(panel).to_have_attribute('open','')
  checks.append('exclusion archives remain accessible without invalid delete actions')
  control('권한 회수');expect(panel).to_have_count(0);checks.append('confirmed permission removal hides private review data')

  page,panel=fresh();row=open_row('1',True);field=row.get_by_label('VOD에서 노래 시작 위치',exact=True)
  expect(field).to_have_attribute('type','text');expect(field).to_have_value('00:02:00');expect(row.get_by_label('확인한 가창 시작 시간 · 초',exact=True)).to_have_count(0)
  field.fill('01:12:30');preview=row.get_by_role('link',name='입력한 위치에서 VOD 확인 ↗',exact=True)
  expect(preview).to_have_attribute('href','https://vod.sooplive.com/player/208123456?change_second=4350');expect(preview).to_have_attribute('target','_blank')
  capture(row.locator('.sb-playback-position'),'playback-position');checks.append('saved seconds display as h:m:s and exact-position preview is retained')
  for value in ['', '00:60:00', '03:99', '48:00:01', '4350', '1:2:']:
   field.fill(value);approve(row);expect(field).to_have_attribute('aria-invalid','true');expect(row.locator('.sb-playback-position').get_by_role('alert')).to_be_visible()
   expect(preview).to_have_count(0);assert page.evaluate('window.reviewRequests.length')==0
  row.locator('form').evaluate("f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
  assert page.evaluate('window.reviewRequests.length')==0;expect(panel).to_have_attribute('open','')
  checks.append('empty, malformed and out-of-range times block native/programmatic approval without writes')
  row.get_by_role('button',name='제외',exact=True).click();expect(row).to_have_count(0);assert page.evaluate('window.reviewRequests.map(x=>x.decision)')==['rejected']
  expect(panel.locator('.sb-auto-notice')).to_contain_text('삭제했습니다');checks.append('invalid time never blocks exclusion feedback')
  row=open_row('2',True);field=row.get_by_label('VOD에서 노래 시작 위치',exact=True);expect(field).to_have_value('');field.fill('03:20');field.press('Tab');expect(field).to_have_value('00:03:20')
  approve(row);expect(row).to_have_count(0);assert page.evaluate('window.reviewRequests.at(-1).seconds')==200
  panel.get_by_role('button',name='확인 완료',exact=True).click();row=open_row('2');expect(row.get_by_label('VOD에서 노래 시작 위치',exact=True)).to_have_value('00:03:20')
  checks.append('section times stay blank until confirmed and reopen in h:m:s after integer-second submission')
  panel.get_by_role('button',name='확인 대기',exact=True).click()
  for cid,value,total in [('3','01:12:30',4350),('4','00:00:00',0),('5','48:00:00',172800)]:
   row=open_row(cid,True);row.get_by_label('VOD에서 노래 시작 위치',exact=True).fill(value);approve(row);expect(row).to_have_count(0)
   assert page.evaluate('window.reviewRequests.at(-1).seconds')==total;expect(panel).to_have_attribute('open','')
  checks.append('h:m:s, explicit start and 48-hour boundary preserve exact integer seconds')

  page,panel=fresh();control('곡 연결 테스트 목록');row=open_row('1');search=row.get_by_label('기존 곡 찾기',exact=True)
  expect(row.get_by_label('곡명',exact=True)).to_have_count(0);approve(row);expect(panel.get_by_role('alert')).to_contain_text('곡을 선택');assert page.evaluate('window.reviewRequests.length')==0
  search.fill('이오몽');results=row.get_by_role('listbox',name='연결할 곡',exact=True);expect(results).to_be_visible();assert int(results.get_attribute('size'))>1
  expect(results.locator('option:not(:disabled)')).to_have_count(2);search.press('Enter');assert page.evaluate('window.reviewRequests.length')==0
  search.fill('Wisp!');expect(results.locator('option:not(:disabled)')).to_have_count(2)
  search.fill('ㅇㅁㅇㄷ');expect(results.locator('option:not(:disabled)')).to_have_count(3)
  search.fill('私は最強');expect(results.get_by_role('option',name='나는 최강 — Ado',exact=True)).to_be_visible()
  search.fill('영물이다');expect(results.locator('option:not(:disabled)')).to_have_count(3);capture(search,'link-search')
  checks.append('title, artist, alias and initial search instantly shows expanded results without opening a dropdown or submitting')
  results.get_by_role('option',name='영물이다 — 이오몽',exact=True).click();expect(results).to_have_value('wisp')
  expect(row.locator('.sb-link-selection')).to_contain_text('영물이다 — 이오몽');expect(row.get_by_label('곡명',exact=True)).to_have_count(0);assert page.evaluate('window.reviewRequests.length')==0
  search.fill('Ado');expect(row.locator('.sb-link-selection')).to_contain_text('선택해 주세요');approve(row);expect(panel.get_by_role('alert')).to_contain_text('곡을 선택');assert page.evaluate('window.reviewRequests.length')==0
  search.fill('이오몽');search.press('ArrowDown');expect(results).to_be_focused();results.press('ArrowDown');expect(results).to_have_value('wisp');results.press('Enter');assert page.evaluate('window.reviewRequests.length')==0
  results.press('Escape');expect(search).to_be_focused();checks.append('one-click/native keyboard selection chooses an exact ID; editing search clears stale choice')
  row.get_by_label('VOD에서 노래 시작 위치',exact=True).fill('01:12:30');vod_roundtrip(row);control('권한 재확인 시작');expect(search).to_be_disabled();expect(results).to_be_disabled()
  control('권한 재확인 완료');expect(results).to_have_value('wisp');expect(search).to_have_value('이오몽');expect(panel).to_have_attribute('open','')
  approve(row);expect(row).to_have_count(0);assert page.evaluate('window.reviewRequests.at(-1).song_id')=='wisp';assert page.evaluate('window.reviewRequests.at(-1).seconds')==4350
  panel.get_by_role('button',name='확인 완료',exact=True).click();row=open_row('1');expect(row.locator('.sb-link-selection')).to_contain_text('영물이다 — 이오몽')
  checks.append('choice/time survive VOD refocus and permissions recheck; existing ID and seconds save and reopen correctly')
  panel.get_by_role('button',name='확인 대기',exact=True).click();row=open_row('2');search=row.get_by_label('기존 곡 찾기',exact=True);search.fill('등록되지 않은 노래')
  expect(row.get_by_role('listbox')).to_have_count(0);expect(row.locator('.sb-link-empty')).to_be_visible();expect(row.get_by_label('곡명',exact=True)).to_have_count(0)
  row.get_by_role('button',name='새 노래로 등록',exact=True).click();expect(row.get_by_label('곡명',exact=True)).to_have_value('미르 확인곡 02');expect(row.get_by_label('가수',exact=True)).to_have_value('테스트 가수')
  row.get_by_label('곡명',exact=True).fill('새 등록 검증곡');row.get_by_label('가수',exact=True).fill('미르');row.get_by_label('VOD에서 노래 시작 위치',exact=True).fill('03:20');capture(row.locator('.sb-link-empty'),'link-new')
  approve(row);expect(row).to_have_count(0);payload=page.evaluate('window.reviewRequests.at(-1)')
  assert payload['title']=='새 등록 검증곡' and payload['artist']=='미르' and payload['seconds']==200 and not payload.get('song_id')
  expect(panel).to_have_attribute('open','');expect(panel.locator('.sb-auto-notice')).to_be_visible();checks.append('no-result choice explicitly opens prefilled new-song form without overwriting it with an artist search')
  row=open_row('3');row.get_by_label('기존 곡 찾기',exact=True).fill('검증 가수');results=row.get_by_role('listbox',name='연결할 곡',exact=True);expect(results.locator('option:not(:disabled)')).to_have_count(8)
  while row.get_by_role('button',name=re.compile('검색 결과 더 보기')).count():row.get_by_role('button',name=re.compile('검색 결과 더 보기')).click()
  expect(results.locator('option:not(:disabled)')).to_have_count(45);results.select_option('many-44')
  control('곡 연결 목록 비우기');expect(row.locator('.sb-link-empty')).to_be_visible();before=page.evaluate('window.reviewRequests.length')
  approve(row);expect(panel.get_by_role('alert')).to_contain_text('더 이상 찾을 수 없습니다');assert page.evaluate('window.reviewRequests.length')==before
  row.get_by_role('button',name='제외',exact=True).click();expect(row).to_have_count(0);expect(panel.locator('.sb-auto-notice')).to_contain_text('삭제했습니다')
  checks.append('results past forty are selectable; removed IDs cannot be saved, while exclusion still works')
  assert not errors
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'external_requests_allowed':0,'live_writes':0},ensure_ascii=False,indent=2))
 except Exception:
  (out/'error.txt').write_text(traceback.format_exc());(out/'failure.txt').write_text(page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'));raise
 finally:browser.close()
print('PASS:',len(checks),'offline review UI groups')
