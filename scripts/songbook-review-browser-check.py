#!/usr/bin/env python3
"""Isolated regressions for review-panel focus, auth refresh, removal and feedback."""
import argparse, base64, json, shutil, time, traceback
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright, expect
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);a=p.parse_args()
base=a.url.rstrip('/')+'/';out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
uid='eddd3840-0000-4000-8000-000000000001'
user={'id':uid,'aud':'authenticated','role':'authenticated','email':'fixture@example.invalid','user_metadata':{'username':'mir.review'},'app_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
def enc(data):return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'exp':int(time.time())+3600,'aud':'authenticated','role':'authenticated'})+'.fixture'
rows=[{'id':f'{i:064x}','vod_id':'208123456','seconds':120+i,'approved_seconds':None,'title':f'미르 확인곡 {i:02}','artist':'테스트 가수','reason':'artist_metadata_required','line':f'00:02:{i:02} 미르 확인곡 {i:02} - 테스트 가수 🎵','revision':1,'song_id':None,'decision':'pending','present':True} for i in range(1,18)]
flags={'admin':True,'failure':False};auth_reads=[];writes=[];errors=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def intercept(route):
  req=route.request;u=urlsplit(req.url);path=u.path;qs=parse_qs(u.query)
  def reply(data,status=200,headers=None):route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers=headers or {})
  if u.hostname=='songbook-test.supabase.co':
   if path=='/functions/v1/member-auth':
    b=req.post_data_json;assert b['action']=='login' and b['identifier']=='mir.review' and b['password']==' test password '
    return reply({'access_token':token,'refresh_token':'fixture-refresh','user_id':uid})
   if path=='/auth/v1/user':return reply(user)
   if path=='/auth/v1/logout':return route.fulfill(status=204)
   if path=='/functions/v1/songbook-timeline-sync':
    b=req.post_data_json;assert b['action']=='review' and flags['admin'];writes.append(b)
    c=next(x for x in rows if x['id']==b['id'])
    if flags['failure']:return reply({'error':'candidate_changed'},409)
    assert b['revision']==c['revision'];c['decision']=b['decision'];c['revision']+=1
    return reply({'status':b['decision'],'song_id':c['song_id']})
   if path.startswith('/rest/v1/'):
    assert req.method=='GET', 'unexpected table mutation'
    table=path.split('/')[-1];obj='vnd.pgrst.object' in req.headers.get('accept','')
    if table=='admins':auth_reads.append(time.time());return reply(({'user_id':uid} if obj else [{'user_id':uid}]) if flags['admin'] else (None if obj else []))
    if table=='member_profiles':return reply({'username':'mir.review','email':user['email']} if obj else [{'username':'mir.review','email':user['email']}])
    if table=='songbook_timeline_candidates':
     decision=qs.get('decision',['eq.pending'])[0][3:];data=[c for c in rows if c['decision']==decision and c['present']]
     offset=int(qs.get('offset',['0'])[0]);limit=int(qs.get('limit',['8'])[0]);sliced=data[offset:offset+limit]
     return reply(sliced,headers={'Content-Range':f'{offset}-{offset+len(sliced)-1}/{len(data)}'})
    if table=='songbook_sync_runs':return reply([{'id':'fixture-run','started_at':'2026-10-04T00:00:00Z','status':'success','stats':{'checked':1,'new_songs':0}}])
    return reply([])
   return reply({'error':'blocked'},400)
  if u.hostname=='vod.sooplive.com' and req.method=='GET':return route.fulfill(status=200,content_type='text/html',body='<title>VOD fixture</title><p>Read-only VOD fixture</p>')
  if req.method not in ('GET','HEAD','OPTIONS'):raise AssertionError('unmocked mutation blocked')
  if u.hostname in ('localhost','127.0.0.1'):return route.continue_()
  return route.abort()
 ctx.route('**/*',intercept)
 panel=page.locator('.sb-auto-admin')
 def notify(event='SIGNED_IN'):
  before=len(auth_reads)
  page.evaluate('''event=>{const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));if(!key)throw Error('no shared session');const session=JSON.parse(localStorage.getItem(key));const channel=new BroadcastChannel(key);channel.postMessage({event,session});setTimeout(()=>channel.close(),100);}''',event)
  for _ in range(100):
   page.wait_for_timeout(30)
   if len(auth_reads)>before:break
  assert len(auth_reads)>before,'auth event did not revalidate'
  if flags['admin']:expect(panel.get_by_role('button',name='새로고침',exact=True)).to_be_enabled()
 try:
  page.goto(base+'account/',wait_until='networkidle')
  page.get_by_label('아이디',exact=True).fill('mir.review');page.get_by_label('비밀번호',exact=True).fill(' test password ')
  page.locator('form').get_by_role('button',name='로그인',exact=True).click();expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
  page.goto(base+'songbook/',wait_until='networkidle');expect(panel).to_be_visible()
  panel.locator('summary').click();expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  panel.get_by_role('button',name='다음 항목',exact=True).click();expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 3')
  first=panel.locator('.sb-auto-candidate').first;cid=first.get_attribute('data-candidate-id')
  first.get_by_role('button',name='정보 확인·연결',exact=True).click();first.get_by_label('확인한 가창 시작 시간 · 초').fill('456');first.get_by_label('곡명',exact=True).fill('확인 중인 제목')
  first.get_by_role('link',name='VOD 확인 ↗',exact=True).scroll_into_view_if_needed();position=page.evaluate('scrollY')
  page.evaluate("window.reviewNode=document.querySelector('.sb-auto-admin')")
  with page.expect_popup() as opened:first.get_by_role('link',name='VOD 확인 ↗',exact=True).click()
  popup=opened.value;popup.wait_for_load_state();popup.close();page.bring_to_front();notify()
  expect(panel).to_have_attribute('open','');assert page.evaluate('window.reviewNode===document.querySelector(".sb-auto-admin")')
  expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 3');expect(panel.get_by_label('곡명',exact=True)).to_have_value('확인 중인 제목');expect(panel.get_by_label('확인한 가창 시작 시간 · 초')).to_have_value('456')
  assert abs(page.evaluate('scrollY')-position)<30
  notify('TOKEN_REFRESHED');expect(panel).to_have_attribute('open','');expect(panel.get_by_label('곡명',exact=True)).to_have_value('확인 중인 제목')
  checks.append('VOD return, SIGNED_IN and token refresh preserve the same panel, page, draft and scroll')
  for width in [1440,390]:
   page.set_viewport_size({'width':width,'height':1050});panel.scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/f'review-open-{width}.png'))
  checks.append('open review and editing form fit desktop and mobile')
  first=panel.locator(f'[data-candidate-id="{cid}"]');first.get_by_role('button',name='제외',exact=True).click()
  expect(panel.locator(f'[data-candidate-id="{cid}"]')).to_have_count(0);expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  expect(panel).to_have_attribute('open','');expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 2');expect(panel.locator('.sb-auto-count')).to_contain_text('16건');expect(panel.locator('.sb-auto-notice')).to_contain_text('확인 목록에서 삭제했습니다')
  for width in [1440,390]:
   page.set_viewport_size({'width':width,'height':1050});panel.locator('.sb-auto-notice').scroll_into_view_if_needed();page.screenshot(path=str(out/f'review-deleted-{width}.png'))
  checks.append('successful exclusion removes only its row, refills current page and shows a removal notice')
  panel.get_by_role('button',name='처리 알림 닫기').click();flags['failure']=True
  failid=panel.locator('.sb-auto-candidate').first.get_attribute('data-candidate-id');panel.locator('.sb-auto-candidate').first.get_by_role('button',name='제외',exact=True).click()
  expect(panel.get_by_role('alert')).to_contain_text('항목은 삭제하지 않았습니다');expect(panel.locator(f'[data-candidate-id="{failid}"]')).to_be_visible();expect(panel.locator('.sb-auto-notice')).to_have_count(0);flags['failure']=False
  checks.append('failed save keeps its row and reports failure without a false success')
  page.reload(wait_until='networkidle');expect(panel).to_have_attribute('open','');expect(panel.get_by_test_id('review-pagination')).to_have_text('2 / 2')
  checks.append('reload restores the account-specific expanded panel, tab and page')
  for _ in range(8):
   old=sum(c['decision']=='pending' for c in rows);panel.locator('.sb-auto-candidate').first.get_by_role('button',name='제외',exact=True).click();expect(panel.locator('.sb-auto-count')).to_contain_text(f'{old-1}건');expect(panel.get_by_role('button',name='새로고침',exact=True)).to_be_enabled()
  expect(panel.get_by_test_id('review-pagination')).to_have_text('1 / 1');expect(panel.locator('.sb-auto-candidate')).to_have_count(8);expect(panel).to_have_attribute('open','')
  checks.append('deleting the last row of a last page moves back one page without collapsing')
  external=next(c for c in rows if c['decision']=='pending');external['decision']='rejected';external['revision']+=1
  page.evaluate("window.dispatchEvent(new Event('focus'))");expect(panel.locator('.sb-auto-count')).to_contain_text('7건');expect(panel.locator('.sb-auto-candidate')).to_have_count(7)
  checks.append('focus refresh reflects other-session changes without a document reload')
  panel.get_by_role('button',name='제외한 항목',exact=True).click();expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
  expect(panel.locator('.sb-auto-candidate').get_by_role('button',name='제외',exact=True)).to_have_count(0)
  page.reload(wait_until='networkidle');expect(panel).to_have_attribute('open','');expect(panel.get_by_role('button',name='제외한 항목',exact=True)).to_have_attribute('aria-pressed','true')
  checks.append('excluded records remain available and the selected tab survives reload')
  flags['admin']=False;notify();expect(panel).to_have_count(0)
  flags['admin']=True;notify();expect(panel).to_be_visible()
  page.locator('.site-footer').get_by_role('button',name='로그아웃',exact=True).click();expect(panel).to_have_count(0)
  checks.append('revoked permission and actual shared logout still hide the administrator panel')
  assert not errors
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'mock_review_requests':len(writes),'auth_rechecks':len(auth_reads),'live_writes':0},ensure_ascii=False,indent=2))
 except Exception:
  traceback.print_exc()
  try:page.screenshot(path=str(out/'failure.png'));(out/'failure.txt').write_text(page.locator('body').inner_text())
  except Exception:pass
  raise
 finally:browser.close()
print('PASS:',len(checks),'persistent review browser groups')
