#!/usr/bin/env python3
"""Bulk status and variable page length on the real production route; isolated HTTP fixtures only."""
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
  go(mode='admin',data='sample');expect(page.locator('.ck-song')).to_have_count(25);expect(page.locator('.ck-song-select')).to_have_count(0);expect(toolbar()).to_have_count(0)
  length=page.get_by_label('페이지당 곡 수',exact=True);expect(length).to_have_value('25');expect(length.locator('option')).to_have_text(['10곡씩','25곡씩','50곡씩','100곡씩'])
  for size in [10,25,50,100]:length.select_option(str(size));expect(page.locator('.ck-song')).to_have_count(size);expect(page.locator('.ck-pagination>span')).to_have_text(f'1 / {(106+size-1)//size}')
  page.get_by_role('button',name='다음 페이지',exact=True).click();expect(page.locator('.ck-song')).to_have_count(6);page.reload(wait_until='networkidle');expect(length).to_have_value('100');expect(page.locator('.ck-pagination>span')).to_have_text('2 / 2')
  length.select_option('25');expect(page.locator('.ck-song')).to_have_count(25);expect(page.locator('.ck-pagination>span')).to_have_text('1 / 5')
  go(perPage='999');expect(length).to_have_value('25');expect(page.locator('.ck-song')).to_have_count(25)
  checks.append('anonymous users get exact 10/25/50/100 choices, default and invalid fallback25, full last-page counts, reload persistence and page reset on size change; no admin URL bypass')
  go(perPage='10');page.get_by_label('곡명, 가수, 초성 검색',exact=True).fill('일괄검증 999');page.locator('#songbook-search').get_by_role('button',name='검색',exact=True).click();expect(page.locator('.ck-song')).to_have_count(0);expect(length).to_have_value('10');expect(page.locator('.ck-pagination>span')).to_have_text('1 / 1')
  checks.append('empty/filter results retain page-size option and never create page zero')
  page.goto(base+'account/',wait_until='networkidle');page.get_by_label('아이디',exact=True).fill('mir.review');page.get_by_label('비밀번호',exact=True).fill('fixture password');page.locator('form').get_by_role('button',name='로그인',exact=True).click();expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
  go(perPage='10');expect(page.locator('.ck-song-select input')).to_have_count(10);expect(page.get_by_role('button',name='선택 곡 상태 변경',exact=True)).to_be_disabled()
  select(1);expect(toolbar()).to_contain_text('1곡 선택');assert page.get_by_label('이 페이지 전체 선택',exact=True).evaluate('(e)=>e.indeterminate')
  page.get_by_label('이 페이지 전체 선택',exact=True).check();expect(page.locator('.ck-song-select input:checked')).to_have_count(10)
  page.get_by_role('button',name='다음 페이지',exact=True).click();expect(page.locator('.ck-song-select input:checked')).to_have_count(0);expect(toolbar()).to_contain_text('0곡 선택')
  length.select_option('25');expect(page.locator('.ck-pagination>span')).to_have_text('1 / 5');select(1);length.select_option('10');expect(toolbar()).to_contain_text('0곡 선택')
  checks.append('administrator row checkboxes, indeterminate page selection and disabled empty action; page/size changes clear prior selections')
  select(1);select(3);d=open_confirm('available');expect(d.locator('.ck-bulk-targets li')).to_have_count(2);expect(d).to_contain_text('일괄검증 001 곡');d.get_by_role('button',name='취소',exact=True).click();assert len(writes)==0
  d=open_confirm('available');d.get_by_role('button',name='2곡 상태 변경하기',exact=True).click();expect(d).to_have_count(0);expect(page.locator('.ck-toast')).to_contain_text('변경 완료 1곡 · 같은 상태 1곡');assert len(writes)==1 and rows[0]['request_status']=='available' and rows[2]['request_status']=='available'
  checks.append('explicit target/status confirmation and cancel-without-write; only checked songs change, same status no-op, acknowledgement clears selection and displays exact result')
  select(2);select(4);state['failure_id']='bulk-fixture-002';d=open_confirm('unavailable');d.get_by_role('button',name='2곡 상태 변경하기',exact=True).click();expect(d.get_by_role('alert')).to_contain_text('변경 완료 1곡 · 같은 상태 0곡 · 미처리/확인 필요 1곡');assert rows[1]['request_status']=='unreviewed' and rows[3]['request_status']=='unavailable';expect(d.get_by_role('alert')).to_contain_text('일괄검증 002 곡');d.get_by_role('button',name='닫기',exact=True).click();expect(page.locator('.ck-song-select input:checked')).to_have_count(1)
  state['failure_id']=None;state['conflict_id']='bulk-fixture-002';d=open_confirm('available');d.get_by_role('button',name='1곡 상태 변경하기',exact=True).click();expect(d.get_by_role('alert')).to_contain_text('다른 화면에서 변경');assert len(writes)==4;d.get_by_role('button',name='닫기',exact=True).click();state['conflict_id']=None
  checks.append('network failure and revision conflict report individual unresolved targets, preserve acknowledged successes and failed selection; no silent success or automatic retries')
  go(perPage='10');select(0);d=open_confirm('available');d.get_by_role('button',name='1곡 상태 변경하기',exact=True).click();expect(d).to_have_count(0);saved=next(r for r in rows if r['id']==automatic['id']);assert saved['video_urls']==[] and saved['artist']=='';expect(card(0).locator('.ck-video')).to_have_attribute('href',auto_url)
  checks.append('automatic-only song creates valid status override with unknown artist and no duplicated automatic media; linked SOOP timestamp preserved')
  go(perPage='100');page.get_by_label('이 페이지 전체 선택',exact=True).check();expect(toolbar()).to_contain_text('100곡 선택');d=open_confirm('unavailable');expect(d.locator('.ck-bulk-targets li')).to_have_count(100);d.get_by_role('button',name='100곡 상태 변경하기',exact=True).click();expect(d).to_have_count(0,timeout=60000)
  for r in rows:
   n=int(r['id'].split('-')[-1]);assert r['request_status']==('unavailable' if n<=99 else 'unreviewed')
  for before in original:
   after=next(r for r in rows if r['id']==before['id']);assert {k:v for k,v in after.items() if k not in ('request_status','revision')}=={k:v for k,v in before.items() if k not in ('request_status','revision')}
  assert all(r['proficiency']==5 for r in ratings)
  checks.append('maximum100 current-page targets process serially, leave off-page songs and all metadata/ratings untouched, and do not expand selection to search-wide matches')
  go(perPage='10',request='unreviewed');expect(page.locator('.ck-song')).to_have_count(6);page.get_by_label('이 페이지 전체 선택',exact=True).check();d=open_confirm('available');d.get_by_role('button',name='6곡 상태 변경하기',exact=True).click();expect(d).to_have_count(0);expect(page.locator('.ck-song')).to_have_count(0);expect(page.locator('.ck-pagination>span')).to_have_text('1 / 1');assert parse_qs(urlsplit(page.url).query)['request']==['unreviewed']
  checks.append('status-filtered rows leave the result immediately after acknowledgement, filter remains and empty pagination clamps safely')
  go(perPage='10')
  for width in [320,390,768,1024,1440,1920]:
   page.set_viewport_size({'width':width,'height':1050});page.locator('.ck-list-controls').scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
   cb=page.locator('.ck-list-controls').bounding_box();sb=page.locator('.ck-page-size').bounding_box();assert abs(sb['x']+sb['width']-cb['x']-cb['width'])<2,(width,cb,sb)
   assert sb['y']+sb['height']<=page.locator('.ck-songs').bounding_box()['y']+1
   if width in [390,1440]:page.screenshot(path=str(out/f'bulk-admin-{width}.png'))
  page.set_viewport_size({'width':390,'height':1050});select(1);d=open_confirm('available');page.screenshot(path=str(out/'bulk-confirm-390.png'));d.get_by_role('button',name='취소',exact=True).click()
  checks.append('six viewport widths: page size aligned to right edge above list, checkbox/toolbar accessible, dialog usable and no horizontal overflow')
  state['admin']=False;go(mode='admin');expect(toolbar()).to_have_count(0);expect(page.locator('.ck-song-select')).to_have_count(0);expect(length).to_have_value('25')
  page.locator('.site-footer').get_by_role('button',name='로그아웃',exact=True).click();expect(toolbar()).to_have_count(0);expect(page.locator('.ck-song-select')).to_have_count(0)
  assert not errors
  checks.append('ordinary member and logout remove selection and all bulk writes, without hiding read-only pagination controls')
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'mock_writes':writes,'live_mutations':0},ensure_ascii=False,indent=2)+'\n')
 except Exception:
  (out/'error.txt').write_text(traceback.format_exc());(out/'failure.txt').write_text(page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'));raise
 finally:browser.close()
print('PASS:',len(checks),'bulk status/page size browser groups')
