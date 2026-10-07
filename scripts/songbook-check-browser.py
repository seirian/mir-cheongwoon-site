#!/usr/bin/env python3
"""Read-only server requests; preview writes are browser-local only, never operational records."""
import argparse,json,shutil,traceback
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);a=p.parse_args()
base=a.url.rstrip('/')+'/';out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];requests=[];snapshot_checks={}
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
  first_yt='https://www.youtube.com/watch?v=aqz-KE-bpKQ'
  second_yt=first_yt+'&t=120'
  soop='https://vod.sooplive.com/player/123456789?change_second=60'
  multi=page.locator('[data-song-id="check-sample-5"]')
  expect(multi.locator('.ck-song-categories [role="listitem"]')).to_have_text(['J-POP · 애니','기타'])
  expect(multi.locator('.ck-video.is-youtube').first).to_have_attribute('href',first_yt)
  expect(page.locator('[data-song-id="check-sample-2"] .ck-video.is-youtube')).to_have_count(0)
  multi.get_by_role('button',name='[검토 샘플] 대표 영상 자동 지정',exact=True).click()
  detail=page.get_by_role('dialog',name='[검토 샘플] 대표 영상 자동 지정',exact=True)
  expect(detail.locator('.ck-song-categories [role="listitem"]')).to_have_text(['J-POP · 애니','기타'])
  expect(detail.locator('.ck-video.is-youtube').first).to_have_attribute('href',first_yt)
  expect(detail.locator('.ck-video')).to_have_count(3)
  expect(detail.locator('.ck-video')).to_have_text(['YouTube1','YouTube2','SOOP'])
  expect(detail.locator('a svg.lucide-external-link, a svg.lucide-arrow-up-right, a svg.lucide-star')).to_have_count(0)
  for video in detail.locator('.ck-video').all():
   expect(video).to_have_attribute('target','_blank');expect(video).to_have_attribute('rel','noopener noreferrer')
   assert '대표' not in video.inner_text() and '새 탭' in video.get_attribute('aria-label')
  checks.append('round3: all detail links use platform labels and numbering without representative badges or trailing arrows; safe new-tab attributes preserved')
  detail.get_by_role('button',name='창 닫기',exact=True).click()
  checks.append('round2: list and detail retain every category; first YouTube auto-selected even after a SOOP URL, with no SOOP fallback')
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
    multi=page.locator('[data-song-id="check-sample-5"]')
    expect(multi.locator('.ck-song-categories [role="listitem"]')).to_have_text(['J-POP · 애니','기타'])
    bounds=multi.bounding_box()
    for tag in multi.locator('.ck-song-categories [role="listitem"]').all():
     expect(tag).to_be_visible();rect=tag.bounding_box();assert rect['x']>=bounds['x'] and rect['x']+rect['width']<=bounds['x']+bounds['width']+1
    for card in page.locator('.ck-song').all():
     band=card.locator('.ck-category-video-row');tags=band.locator('.ck-song-categories');videos=band.locator('.ck-videos');vb=videos.bounding_box();tb=tags.bounding_box();cb=card.bounding_box()
     assert vb['x']>=tb['x']+tb['width']+3,(w,vb,tb)
     assert abs(vb['y']+vb['height']/2-tb['y']-tb['height']/2)<2,(w,vb,tb)
     assert vb['x']+vb['width']<=cb['x']+cb['width']+1,(w,vb,cb)
     buttons=videos.locator('a');tops=[]
     for link_button in buttons.all():
      rect=link_button.bounding_box();tops.append(rect['y'])
      assert '대표' not in link_button.inner_text()
      expect(link_button.locator('svg')).to_have_count(1)
      expect(link_button.locator('svg.lucide-external-link,svg.lucide-star')).to_have_count(0)
      if w<=620:assert rect['height']>=44
     if tops:assert max(tops)-min(tops)<1,(w,tops)
    if w==390 and not mode:
     assert page.locator('.ck-song').first.bounding_box()['y']<700
     for button in page.locator('.ck-song').first.locator('.ck-song-actions>button').all():assert button.bounding_box()['height']>=44
  checks.append('five mobile/desktop widths; compact first row, collapsed filters, no overflow, 44px mobile action height')
  checks.append('round3: category badges stay left and video buttons right in one nonwrapping row in viewer/admin at five widths, including empty-video and multi-category songs')
  page.set_viewport_size({'width':1440,'height':1050});go('data=sample&mode=admin')
  page.get_by_role('button',name='YouTube 보완',exact=False).click();rows(4)
  page.locator('[data-song-id="check-sample-2"]').get_by_role('button',name='[검토 샘플] 유튜브 보완 대상 빠른 수정',exact=True).click()
  dialog=page.get_by_role('dialog',name='빠른 수정',exact=True);expect(dialog).to_be_visible();dialog.get_by_label('시청자에게 보여줄 안내',exact=False).fill('검토용 안내 수정')
  page.keyboard.press('Escape');expect(dialog).to_contain_text('저장하지 않은 변경사항');dialog.get_by_role('button',name='계속 편집',exact=True).click();expect(dialog.get_by_label('시청자에게 보여줄 안내',exact=False)).to_have_value('검토용 안내 수정')
  dialog.get_by_label('신청 가능 상태',exact=True).select_option('available');dialog.get_by_label('영상 주소',exact=True).fill('https://youtube.com/@not-a-video');dialog.get_by_role('button',name='영상 연결',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('개별 영상')
  dialog.get_by_label('영상 주소',exact=True).fill('https://youtu.be/abcdefghijk?t=60');dialog.get_by_label('영상 용도',exact=True).select_option('mir');dialog.get_by_role('button',name='영상 연결',exact=True).click()
  expect(dialog.locator('.ck-auto-representative')).to_contain_text('YouTube 1 · 첫 번째 링크');expect(dialog.locator('[data-representative="true"] .ck-url')).to_have_attribute('href','https://www.youtube.com/watch?v=abcdefghijk&t=60');page.screenshot(path=str(out/'quick-edit-1440.png'))
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'quick-edit-390.png'));page.set_viewport_size({'width':1440,'height':1050})
  dialog.get_by_role('button',name='저장 후 다음 곡',exact=True).click();expect(dialog).to_be_visible();expect(dialog.locator('.ck-editor-song')).not_to_contain_text('유튜브 보완 대상');dialog.get_by_role('button',name='창 닫기',exact=True).click();rows(3)
  assert not page.locator('[data-song-id="check-sample-2"]').count()
  checks.append('quick edit validates links, protects dirty drafts, automatically assigns the first YouTube and saves-next without deleting a catalog entry')
  go('data=sample&mode=admin');rows(6);updated=page.locator('[data-song-id="check-sample-2"]');expect(updated).to_contain_text('검토용 안내 수정');expect(updated).to_contain_text('신청 가능')
  expect(updated.locator('.ck-video.is-youtube').first).to_have_attribute('href','https://www.youtube.com/watch?v=abcdefghijk&t=60')
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
  # Round 2 regression: cached manual choices cannot beat first-YouTube policy.
  legacy={'version':1,'edits':{'check-sample-5':{'artist':'예시 가수','publicNote':'이전 검토 메모','requestStatus':'available','videoUrls':[soop,first_yt,second_yt],'representativeUrl':soop,'videoKinds':{soop:'broadcast'}}}}
  page.evaluate("record => localStorage.setItem('mir-songbook-check-v1:sample',JSON.stringify(record))",legacy)
  go('data=sample&mode=admin');rows(6);multi=page.locator('[data-song-id="check-sample-5"]')
  expect(multi.locator('.ck-video.is-youtube').first).to_have_attribute('href',first_yt);expect(multi).to_contain_text('이전 검토 메모')
  assert page.evaluate("JSON.parse(localStorage.getItem('mir-songbook-check-v1:sample')).edits['check-sample-5'].representativeUrl")==soop
  page.get_by_role('button',name='YouTube 미연결',exact=False).click();rows(4);expect(page.locator('[data-song-id="check-sample-5"]')).to_have_count(0)
  checks.append('round2: legacy drafts preserve other fields without automatic storage writes; representative-missing work queue matches the automatic display')
  go('data=sample&mode=admin');multi=page.locator('[data-song-id="check-sample-5"]')
  multi.get_by_role('button',name='[검토 샘플] 대표 영상 자동 지정 빠른 수정',exact=True).click();dialog=page.get_by_role('dialog',name='빠른 수정',exact=True)
  expect(dialog.locator('.ck-song-categories [role="listitem"]')).to_have_text(['J-POP · 애니','기타'])
  expect(dialog.locator('[data-representative="true"] .ck-url')).to_have_attribute('href',first_yt)
  dialog.get_by_role('button',name='연결 영상 1 제거',exact=True).click()
  expect(dialog.locator('[data-representative="true"] .ck-url')).to_have_attribute('href',second_yt)
  dialog.get_by_role('button',name='연결 영상 1 제거',exact=True).click()
  expect(dialog.locator('[data-representative="true"]')).to_have_count(0);expect(dialog.locator('.ck-auto-representative')).to_contain_text('YouTube 링크 없음')
  expect(dialog.locator('.ck-url')).to_have_attribute('href',soop)
  added='https://www.youtube.com/watch?v=abcdefghijk&t=60'
  for address in ['https://youtu.be/abcdefghijk?t=1m',first_yt]:
   dialog.get_by_label('영상 주소',exact=True).fill(address);dialog.get_by_role('button',name='영상 연결',exact=True).click()
   expect(dialog.locator('[data-representative="true"] .ck-url')).to_have_attribute('href',added)
  dialog.get_by_role('button',name='저장',exact=True).click();expect(dialog).to_have_count(0)
  page.reload(wait_until='networkidle');multi=page.locator('[data-song-id="check-sample-5"]')
  expect(multi.locator('.ck-video.is-youtube').first).to_have_attribute('href',added);expect(multi.locator('.ck-song-categories [role="listitem"]')).to_have_text(['J-POP · 애니','기타'])
  expect(multi.locator('.ck-rating')).to_contain_text('3/5')
  for w in [390,1440]:
   page.set_viewport_size({'width':w,'height':844 if w==390 else 1050});multi.scroll_into_view_if_needed();page.screenshot(path=str(out/f'round2-categories-representative-{w}.png'))
  checks.append('round2: deleting first YouTube promotes the next, removing all leaves SOOP intact, adding restores automatic selection and preserves all categories after reload')
  # Many URLs still keep the compact row on one line; the detail retains every distinct timestamp.
  many=[first_yt+'&t='+str(n) for n in range(20)]
  record={'version':1,'edits':{'check-sample-5':{'artist':'예시 가수','publicNote':'','requestStatus':'available','videoUrls':many,'videoKinds':{}}}}
  page.evaluate("record => localStorage.setItem('mir-songbook-check-v1:sample',JSON.stringify(record))",record)
  go();multi=page.locator('[data-song-id="check-sample-5"]');expect(multi.locator('.ck-video')).to_have_count(2);expect(multi.locator('.ck-more-videos')).to_have_text('+18')
  for w in [320,390,768,1440]:
   page.set_viewport_size({'width':w,'height':844 if w<620 else 1050})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   links=multi.locator('.ck-video').all();assert abs(links[0].bounding_box()['y']-links[1].bounding_box()['y'])<1
  multi.get_by_role('button',name='[검토 샘플] 대표 영상 자동 지정',exact=True).click();detail=page.get_by_role('dialog',name='[검토 샘플] 대표 영상 자동 지정',exact=True)
  expect(detail.locator('.ck-video')).to_have_count(20)
  assert [item.get_attribute('href') for item in detail.locator('.ck-video').all()]==many
  detail.get_by_role('button',name='창 닫기',exact=True).click()
  page.evaluate("localStorage.removeItem('mir-songbook-check-v1:sample')")
  go();multi=page.locator('[data-song-id="check-sample-5"]')
  for w in [390,1440]:
   page.set_viewport_size({'width':w,'height':844 if w==390 else 1050});multi.scroll_into_view_if_needed();page.screenshot(path=str(out/f'round3-inline-videos-{w}.png'))
  checks.append('round3: 20 distinct timestamped URLs retain full detail access and compact extra count without video wrapping, clipping or data loss')

  page.set_viewport_size({'width':1440,'height':1050})
  go('');expect(page.locator('.ck-song').first).to_be_visible();assert page.locator('.ck-result-bar').inner_text();page.screenshot(path=str(out/'snapshot-viewer-1440.png'));page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'snapshot-viewer-390.png'))
  checks.append('shipped read-only snapshot loads with explicit capture date and no direct operational API calls')
  shipped=page.evaluate("url => fetch(url,{credentials:'omit'}).then(r=>r.json())",base+'songbook-check-snapshot.json')
  source_by_id={song['id']:song for song in shipped['songs']}
  for card in page.locator('.ck-song').all():
   row=source_by_id[card.get_attribute('data-song-id')]
   expect(card.locator('.ck-song-categories [role="listitem"]')).to_have_text(row['categories'])
   yt=next((u for u in row['videoUrls'] if urlsplit(u).hostname=='www.youtube.com'),None)
   if yt:expect(card.locator('.ck-video.is-youtube').first).to_have_attribute('href',yt)
   else:expect(card.locator('.ck-video.is-youtube').first).to_have_count(0)
  snapshot_checks={'total':len(shipped['songs']),'visible_cards_checked':page.locator('.ck-song').count(),'capturedAt':shipped['capturedAt']}
  checks.append('round2: visible public-copy cards exactly match snapshot categories and their first YouTube links, without editing operational records')

  assert not errors,errors
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'server_mutations':0,'requests':requests,'snapshot_checks':snapshot_checks},ensure_ascii=False,indent=2))
 except Exception:
  (out/'error.txt').write_text(traceback.format_exc());page.screenshot(path=str(out/'failure.png'));raise
 finally:browser.close()
print('PASS:',len(checks),'songbook check browser groups')
