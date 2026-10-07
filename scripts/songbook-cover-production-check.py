#!/usr/bin/env python3
"""Cover layout against the real app, with existing isolated login/catalog fixtures only."""
import argparse,base64,copy,json,shutil,time,traceback
from pathlib import Path
from urllib.parse import parse_qs,urlsplit,urlencode
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);a=p.parse_args()
base=a.url.rstrip('/')+'/';out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
uid='00000000-0000-4000-8000-000000000001'
user={'id':uid,'aud':'authenticated','role':'authenticated','email':'fixture@example.invalid','user_metadata':{'username':'mir.review'},'app_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'aud':'authenticated','role':'authenticated','exp':int(time.time())+3600})+'.fixture'
y='https://www.youtube.com/watch?v=abcdefghijk&t=60';auto_url='https://vod.sooplive.com/player/123456780?change_second=4350'
def item(n):return {'id':f'bulk-fixture-{n:03d}','title':f'일괄검증 {n:03d} 곡','artist':'검증 가수','categories':['가요','기타'],'aliases':['일괄검증별칭'],'video_urls':[y],'difficulty':4,'request_status':'available' if n==3 else 'unreviewed','revision':1,'public_note':'기존 공개 안내','video_kinds':{y:'original'}}
rows=[item(n) for n in range(1,106)];automatic={**item(0),'video_urls':[],'video_kinds':{},'artist':''}
ratings=[{'song_id':r['id'],'proficiency':5,'revision':1} for r in rows]
original=copy.deepcopy(rows);state={'admin':True,'failure_id':None,'conflict_id':None};errors=[];writes=[];requests=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def handler(route):
  req=route.request;u=urlsplit(req.url);params=parse_qs(u.query);path=u.path;requests.append({'path':path,'method':req.method})
  def reply(data,status=200):return route.fulfill(status=status,content_type='application/json',body=json.dumps(data,ensure_ascii=False))
  if u.hostname=='songbook-test.supabase.co':
   if path=='/functions/v1/member-auth':return reply({'access_token':token,'refresh_token':'fixture-refresh','user_id':uid})
   if path=='/auth/v1/user':return reply(user)
   if path=='/auth/v1/logout':return route.fulfill(status=204)
   if path.startswith('/rest/v1/'):
    table=path.split('/')[-1];obj='vnd.pgrst.object' in req.headers.get('accept','')
    if req.method not in ('GET','HEAD','OPTIONS'):
     assert state['admin'] and table=='songbook_entries' and req.method in ('PATCH','POST'), 'unexpected mutation'
     payload=req.post_data_json;sid=payload['id'];failed=sid in (state['failure_id'],state['conflict_id']);writes.append({'id':sid,'payload':payload,'failed':failed,'method':req.method})
     if req.method=='PATCH':
      r=next(r for r in rows if r['id']==sid);assert params['id']==['eq.'+sid] and params['revision']==['eq.'+str(r['revision'])]
      assert set(payload)=={'id','request_status'},'bulk PATCH must not overwrite metadata'
      if state['failure_id']==sid:return reply({'message':'fixture offline','code':'XX000'},500)
      if state['conflict_id']==sid:return reply({'message':'fixture conflict','code':'PGRST116'},406)
      r.update(payload);r['revision']+=1;return reply(r)
     assert sid==automatic['id'] and not any(r['id']==sid for r in rows)
     assert payload['video_urls']==[], 'automatic media must not be copied into manual videos'
     saved={**payload,'revision':1};rows.append(saved);return reply(saved)
    if table=='admins':return reply(({'user_id':uid} if obj else [{'user_id':uid}]) if state['admin'] else (None if obj else []))
    if table=='member_profiles':return reply({'username':'mir.review'} if obj else [{'username':'mir.review'}])
    if table=='songbook_entries':return reply(rows)
    if table=='songbook_ratings':return reply(ratings)
    if table=='songbook_auto_entries':return reply([automatic])
    if table=='songbook_auto_media':return reply([{'id':automatic['id'],'video_urls':[auto_url],'total_count':1}])
    return reply([])
   return reply({},400)
  assert req.method in ('GET','HEAD','OPTIONS'),'unmocked mutation blocked'
  return route.continue_() if u.netloc==urlsplit(base).netloc else route.abort()
 ctx.route('**/*',handler)
 def go(**kwargs):page.goto(base+'songbook/?'+urlencode({'q':'일괄검증',**kwargs}),wait_until='networkidle')
 def card(n):return page.locator(f'.ck-song[data-song-id="bulk-fixture-{n:03d}"]')
 def select(n):card(n).locator('.ck-song-select input').check()
 def toolbar():return page.get_by_role('region',name='신청 상태 일괄 변경')
 def open_confirm(status):
  page.get_by_label('일괄 변경할 신청 상태',exact=True).select_option(status);page.get_by_role('button',name='선택 곡 상태 변경',exact=True).click()
  d=page.get_by_role('dialog',name='선택 곡 신청 상태 변경',exact=True);expect(d).to_be_visible();return d
 try:
  go();expect(page.locator('.ck-song')).to_have_count(25);before=page.locator('.ck-song').evaluate_all('(els)=>els.map(e=>e.dataset.songId)')
  page.get_by_role('button',name='커버형',exact=True).click();expect(page.locator('.sg-cover-card')).to_have_count(25);assert before==page.locator('.sg-cover-card').evaluate_all('(els)=>els.map(e=>e.dataset.songId)')
  assert not page.locator('.sg-card-select').count();checks.append('production viewer shares identical data between list/cover and gets no administrator selection')
  page.goto(base+'account/',wait_until='networkidle');page.get_by_label('아이디',exact=True).fill('mir.review');page.get_by_label('비밀번호',exact=True).fill('fixture password');page.locator('form').get_by_role('button',name='로그인',exact=True).click();expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
  go(layout='list',perPage='25');select(1);select(2);expect(toolbar()).to_contain_text('2곡 선택')
  page.get_by_role('button',name='커버형',exact=True).click();expect(page.locator('.sg-card-select input:checked')).to_have_count(2);expect(toolbar()).to_contain_text('2곡 선택')
  d=open_confirm('available');expect(d.locator('.ck-bulk-targets li')).to_have_count(2);d.get_by_role('button',name='취소',exact=True).click();assert not writes
  checks.append('administrator checkbox selection survives presentation changes; bulk confirmation still targets only selected records, cancel never writes')
  page.locator('.sg-cover-card[data-song-id="bulk-fixture-001"]').get_by_role('button',name='일괄검증 001 곡 빠른 수정',exact=True).click();d=page.get_by_role('dialog',name='빠른 수정',exact=True);expect(d.get_by_label('신청 가능 상태',exact=True)).to_have_value('unreviewed');expect(d).to_contain_text('기존 공개 안내');d.get_by_role('button',name='취소',exact=True).click()
  page.get_by_label('이 페이지 전체 선택',exact=True).check();expect(page.locator('.sg-card-select input:checked')).to_have_count(25)
  page.get_by_role('button',name='목록형',exact=True).click();expect(page.locator('.ck-song-select input:checked')).to_have_count(25)
  page.get_by_role('button',name='커버형',exact=True).click();page.get_by_label('페이지당 곡 수',exact=True).select_option('10');expect(page.locator('.sg-cover-card')).to_have_count(10);expect(toolbar()).to_contain_text('0곡 선택')
  checks.append('quick editor preserves original metadata; select-page works in cover and returns to list, page-length change clears selection')
  for width in [320,390,768,1440,1920]:
   page.set_viewport_size({'width':width,'height':1050});page.locator('.sg-display-controls').scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   for c in page.locator('.sg-cover-card').all():
    b=c.bounding_box();cb=c.locator('.sg-card-select').bounding_box();assert cb['x']>=b['x'] and cb['x']+cb['width']<=b['x']+b['width']
   page.screenshot(path=str(out/f'cover-admin-{width}.png'))
  checks.append('administrator cover selection/quick actions stay within cards at five widths without horizontal overflow')
  state['admin']=False;page.reload(wait_until='networkidle');expect(page.locator('.sg-cover-card')).to_have_count(10);expect(page.locator('.sg-card-select,.ck-bulk-toolbar')).to_have_count(0)
  assert not writes and not errors;checks.append('server-denied member sees cover layout without bulk/quick-edit controls; no writes made')
  (out/'report.json').write_text(json.dumps({'checks':checks,'writes':writes,'javascript_errors':errors,'live_mutations':0},ensure_ascii=False,indent=2)+'\n')
 except Exception:
  page.screenshot(path=str(out/'failure.png'));(out/'failure.txt').write_text(traceback.format_exc());raise
 finally:browser.close()
print('PASS',len(checks),'isolated production cover checks')
