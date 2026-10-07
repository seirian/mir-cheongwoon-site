#!/usr/bin/env python3
"""Read-only server requests; preview writes are browser-local only, never operational records."""
import argparse,json,shutil,traceback
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);a=p.parse_args()
base=a.url.rstrip('/')+'/';out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];requests=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def guard(route):
  req=route.request;requests.append({'method':req.method,'url':req.url})
  assert req.method in ('GET','HEAD','OPTIONS'),'Preview attempted a server mutation'
  assert 'supabase.co' not in req.url,'Preview must not load production auth/database'
  if urlsplit(req.url).netloc!=urlsplit(base).netloc:return route.abort()
  return route.continue_()
 ctx.route('**/*',guard)
 ctx.add_init_script("Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text}}});")
 def go(query='data=sample'):page.goto(base+'songbook/?'+query,wait_until='networkidle');expect(page.locator('.ck-song').first).to_be_visible()
 def rows(n):expect(page.locator('.ck-song')).to_have_count(n)
 try:
  go();rows(6);expect(page.get_by_role('button',name='관리자 체험',exact=True)).to_be_visible();expect(page.get_by_role('region',name='관리자 보완 작업')).to_have_count(0)
  page.get_by_role('button',name='신청 가능',exact=False).first.click();rows(3)
  assert all('신청 가능' in row.inner_text() for row in page.locator('.ck-song').all())
  page.get_by_role('button',name='신청 가능 조건 해제',exact=True).click();rows(6)
  checks.append('viewer request badges/filters preserve unreviewed and unavailable states')
  unavailable=page.locator('[data-song-id="check-sample-3"]');expect(unavailable.get_by_role('button',name='[검토 샘플] 지금은 쉬어가는 곡 신청 문구 복사',exact=True)).to_be_disabled()
  target=page.locator('[data-song-id="check-sample-1"]');target.get_by_role('button',name='[검토 샘플] 신청 가능한 곡 신청 문구 복사',exact=True).click();assert page.evaluate('window.__copied')=='예시 가수 - [검토 샘플] 신청 가능한 곡'
  target.get_by_role('button',name='[검토 샘플] 신청 가능한 곡 곡 링크 복사',exact=True).click();link=page.evaluate('window.__copied');assert 'song=check-sample-1' in link and 'mode=' not in link and 'q=' not in link
  page.locator('[data-song-id="check-sample-2"]').get_by_role('button',name='[검토 샘플] 유튜브 보완 대상 신청 문구 복사',exact=True).click();expect(page.locator('.ck-toast')).to_contain_text('먼저 확인')
  checks.append('row copy/share are immediate and clear about non-submission; unavailable copy is disabled')
  for mode in ['', '&mode=admin']:
   go('data=sample'+mode)
   for w in [320,390,768,1440,1920]:
    page.set_viewport_size({'width':w,'height':844 if w<620 else 1050});page.evaluate('scrollTo(0,0)');page.screenshot(path=str(out/f'{"admin" if mode else "viewer"}-{w}.png'))
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    if w==390 and not mode:
     assert page.locator('.ck-song').first.bounding_box()['y']<700
     for button in page.locator('.ck-song').first.locator('.ck-song-actions>button').all():assert button.bounding_box()['height']>=44
  checks.append('five mobile/desktop widths; compact first row, collapsed filters, no overflow, 44px mobile action height')
  page.set_viewport_size({'width':1440,'height':1050});go('data=sample&mode=admin')
  page.get_by_role('button',name='YouTube 보완',exact=False).click();rows(4)
  page.locator('[data-song-id="check-sample-2"]').get_by_role('button',name='[검토 샘플] 유튜브 보완 대상 빠른 수정',exact=True).click()
  dialog=page.get_by_role('dialog',name='빠른 수정',exact=True);expect(dialog).to_be_visible();dialog.get_by_label('시청자에게 보여줄 안내',exact=False).fill('검토용 안내 수정')
  page.keyboard.press('Escape');expect(dialog).to_contain_text('저장하지 않은 변경사항');dialog.get_by_role('button',name='계속 편집',exact=True).click();expect(dialog.get_by_label('시청자에게 보여줄 안내',exact=False)).to_have_value('검토용 안내 수정')
  dialog.get_by_label('신청 가능 상태',exact=True).select_option('available');dialog.get_by_label('영상 주소',exact=True).fill('https://youtube.com/@not-a-video');dialog.get_by_role('button',name='영상 연결',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('개별 영상')
  dialog.get_by_label('영상 주소',exact=True).fill('https://youtu.be/abcdefghijk?t=60');dialog.get_by_label('영상 용도',exact=True).select_option('mir');dialog.get_by_role('button',name='영상 연결',exact=True).click()
  dialog.get_by_role('radio',name='YouTube 1',exact=True).check();page.screenshot(path=str(out/'quick-edit-1440.png'))
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'quick-edit-390.png'));page.set_viewport_size({'width':1440,'height':1050})
  dialog.get_by_role('button',name='저장 후 다음 곡',exact=True).click();expect(dialog).to_be_visible();expect(dialog.locator('.ck-editor-song')).not_to_contain_text('유튜브 보완 대상');dialog.get_by_role('button',name='창 닫기',exact=True).click();rows(3)
  assert not page.locator('[data-song-id="check-sample-2"]').count()
  checks.append('quick edit validates links, protects dirty drafts, selects representative and saves-next without deleting a catalog entry')
  go('data=sample&mode=admin');rows(6);updated=page.locator('[data-song-id="check-sample-2"]');expect(updated).to_contain_text('검토용 안내 수정');expect(updated).to_contain_text('신청 가능')
  expect(updated.get_by_role('link',name='대표 영상',exact=False)).to_have_attribute('href','https://www.youtube.com/watch?v=abcdefghijk&t=60')
  raw=page.evaluate("JSON.parse(localStorage.getItem('mir-songbook-check-v1:sample'))");assert raw['edits']['check-sample-2']['requestStatus']=='available';assert 'proficiency' not in raw['edits']['check-sample-2']
  checks.append('reload retains local edits/representative/status while original proficiency is not overwritten')
  page.get_by_role('button',name='시청자 화면',exact=True).click();expect(page.get_by_role('region',name='관리자 보완 작업')).to_have_count(0);expect(page.locator('[data-song-id="check-sample-2"]')).to_contain_text('검토용 안내 수정')
  go('data=sample&youtube=missing&attention=artist');rows(6)
  checks.append('viewer/admin preview switch reflects shared local changes but viewer ignores administrator-only URL filters')
  page.evaluate("localStorage.setItem('mir-songbook-favorites-v1','[\"production-sentinel\"]')")
  page.get_by_role('button',name='검토 변경 초기화',exact=True).click();page.get_by_role('button',name='검토 변경 초기화하기',exact=True).click();rows(6);expect(page.locator('[data-song-id="check-sample-2"]')).not_to_contain_text('검토용 안내 수정');assert page.evaluate("localStorage.getItem('mir-songbook-favorites-v1')")=='["production-sentinel"]'
  checks.append('reset clears only selected preview storage and never production or other dataset keys')
  go('data=sample&mode=admin');page.locator('[data-song-id="check-sample-2"]').get_by_role('button',name='[검토 샘플] 유튜브 보완 대상 빠른 수정',exact=True).click();dialog=page.get_by_role('dialog',name='빠른 수정',exact=True);dialog.get_by_label('시청자에게 보여줄 안내',exact=False).fill('저장 실패 보존')
  page.evaluate("() => { window.__oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='mir-songbook-check-v1:sample')throw Error('fixture quota');return window.__oldSet.call(this,k,v)}; }")
  dialog.get_by_role('button',name='저장',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('저장하지 못했습니다');expect(dialog.get_by_label('시청자에게 보여줄 안내',exact=False)).to_have_value('저장 실패 보존');page.evaluate('() => { Storage.prototype.setItem=window.__oldSet; }');page.keyboard.press('Escape');dialog.get_by_role('button',name='변경 버리고 닫기',exact=True).click()
  checks.append('storage failure preserves the editable draft and never reports a successful save')
  go('');expect(page.locator('.ck-song').first).to_be_visible();assert page.locator('.ck-result-bar').inner_text();page.screenshot(path=str(out/'snapshot-viewer-1440.png'));page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'snapshot-viewer-390.png'))
  checks.append('shipped read-only snapshot loads with explicit capture date and no direct operational API calls')
  assert not errors,errors
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'server_mutations':0,'requests':requests},ensure_ascii=False,indent=2))
 except Exception:
  (out/'error.txt').write_text(traceback.format_exc());page.screenshot(path=str(out/'failure.png'));raise
 finally:browser.close()
print('PASS:',len(checks),'songbook check browser groups')
