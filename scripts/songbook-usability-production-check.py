#!/usr/bin/env python3
"""Approved round-three UI against the production route, with isolated auth/DB fixtures only."""
import argparse,base64,copy,json,re,shutil,time,traceback
from pathlib import Path
from urllib.parse import parse_qs,urlsplit,urlencode
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);a=p.parse_args()
base=a.url.rstrip('/')+'/';out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
uid='00000000-0000-4000-8000-000000000001'
user={'id':uid,'aud':'authenticated','role':'authenticated','email':'fixture@example.invalid','user_metadata':{'username':'mir.review'},'app_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'aud':'authenticated','role':'authenticated','exp':int(time.time())+3600})+'.fixture'
y='https://www.youtube.com/watch?v=abcdefghijk&t=60';y2='https://www.youtube.com/watch?v=lmnopqrstuv&t=12';s='https://vod.sooplive.com/player/123456789?change_second=90';auto_url='https://vod.sooplive.com/player/123456780?change_second=4350'
def item(n,title,status,urls):return {'id':f'custom-30000000-0000-4000-8000-{n:012d}','title':'통합검증 '+title,'artist':'검증 가수','categories':['가요','기타'],'aliases':['통합별칭'],'video_urls':urls,'difficulty':4,'request_status':status,'revision':1,'public_note':'기존 공개 안내','video_kinds':{}}
rows=[item(1,'가 첫 곡','available',[s,y,y2]),item(2,'나 유튜브 보완','unreviewed',[s]),item(3,'다 신청 불가','unavailable',[]),item(4,'라 가수 확인','unreviewed',[])];rows[3]['artist']=''
ratings=[{'song_id':r['id'],'proficiency':5,'revision':1} for r in rows]
original=copy.deepcopy(rows);state={'admin':True,'failure':False,'conflict':False};errors=[];writes=[];requests=[];checks=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 ctx.add_init_script("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text}}});")
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
     assert state['admin'] and table=='songbook_entries' and req.method=='PATCH', 'unexpected mutation'
     sid=params['id'][0].removeprefix('eq.');i=next(i for i,r in enumerate(rows) if r['id']==sid)
     payload=req.post_data_json;assert params['revision']==['eq.'+str(rows[i]['revision'])]
     writes.append({'id':sid,'payload':payload,'failed':state['failure'] or state['conflict']})
     if state['failure']:return reply({'message':'fixture offline','code':'XX000'},500)
     if state['conflict']:return reply({'message':'fixture conflict','code':'PGRST116'},406)
     rows[i]={**rows[i],**payload,'revision':rows[i]['revision']+1};return reply(rows[i])
    if table=='admins':return reply(({'user_id':uid} if obj else [{'user_id':uid}]) if state['admin'] else (None if obj else []))
    if table=='member_profiles':return reply({'username':'mir.review'} if obj else [{'username':'mir.review'}])
    if table=='songbook_entries':return reply(rows)
    if table=='songbook_ratings':return reply(ratings)
    if table=='songbook_auto_media':return reply([{'id':rows[1]['id'],'video_urls':[auto_url],'total_count':8}])
    return reply([])
   return reply({},400)
  assert req.method in ('GET','HEAD','OPTIONS'),'unmocked mutation blocked'
  return route.continue_() if u.netloc==urlsplit(base).netloc else route.abort()
 ctx.route('**/*',handler)
 def go(**kwargs):page.goto(base+'songbook/?'+urlencode({'q':'통합검증',**kwargs}),wait_until='networkidle')
 def count(n):expect(page.locator('.ck-song')).to_have_count(n);expect(page.locator('.ck-result-bar>p')).to_contain_text(f'{n}곡')
 def card(n):return page.locator(f'.ck-song[data-song-id="{rows[n-1]["id"]}"]')
 def login():
  page.goto(base+'account/',wait_until='networkidle');page.get_by_label('아이디',exact=True).fill('mir.review');page.get_by_label('비밀번호',exact=True).fill('fixture password');page.locator('form').get_by_role('button',name='로그인',exact=True).click();expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
 def edit(n):card(n).get_by_role('button',name=rows[n-1]['title']+' 빠른 수정',exact=True).click();d=page.get_by_role('dialog',name='빠른 수정',exact=True);expect(d).to_be_visible();return d
 try:
  go(mode='admin',data='sample',demo='1',youtube='missing',attention='artist');count(4)
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0);expect(page.locator('.ck-admin')).to_have_count(0)
  assert '관리자 체험' not in page.locator('body').inner_text() and '검토 샘플' not in page.locator('body').inner_text()
  page.evaluate("localStorage.setItem('mir-songbook-check-v1:snapshot',JSON.stringify({version:1,edits:{bad:{title:'사본 변조'}}}));localStorage.setItem('mir-songbook-favorites-v1',JSON.stringify(['"+rows[0]['id']+"']));")
  go();count(4);expect(card(1).get_by_role('button',name=rows[0]['title']+' 즐겨찾기')).to_have_attribute('aria-pressed','true')
  assert not any('songbook-check-snapshot' in r['path'] or 'songbook_preview' in r['path'] for r in requests)
  checks.append('production uses live tables and original favorites, ignores preview storage and never grants admin from mode/data/demo queries')
  go(request='available');count(1);go(request='unavailable');count(1);expect(card(3).get_by_role('button',name=rows[2]['title']+' 신청 문구 복사')).to_be_disabled()
  go(request='unreviewed',category='가요');count(2)
  card(2).get_by_role('button',name=rows[1]['title']+' 신청 문구 복사').click();assert page.evaluate('window.__copied')=='검증 가수 - '+rows[1]['title']
  expect(page.locator('.ck-toast')).to_contain_text('신청 가능 여부는 먼저 확인')
  card(2).get_by_role('button',name=rows[1]['title']+' 곡 링크 복사').click();shared=page.evaluate('window.__copied');assert parse_qs(urlsplit(shared).query)=={'song':[rows[1]['id']]}
  checks.append('request states combine with categories; unavailable copy disabled, unreviewed copy warns, shared URL contains only song ID')
  go();card(1).get_by_role('button',name=rows[0]['title']+' 상세 보기').click();d=page.get_by_role('dialog',name=rows[0]['title'],exact=True)
  expect(d.locator('.ck-video')).to_have_count(3);expect(d.locator('.ck-video').first).to_have_attribute('href',y);expect(d.locator('.ck-song-categories [role=listitem]')).to_have_text(['가요','기타']);page.keyboard.press('Escape')
  for w in [320,390,768,1024,1440,1920]:
   page.set_viewport_size({'width':w,'height':1050});page.evaluate('window.scrollTo(0,0)');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   for c in page.locator('.ck-song').all():
    tags=c.locator('.ck-song-categories');videos=c.locator('.ck-videos');tb=tags.bounding_box();vb=videos.bounding_box();cb=c.bounding_box()
    expect(tags.locator('[role=listitem]')).to_have_text(['가요','기타']);assert vb['x']>=tb['x']+tb['width']+2,(w,tb,vb);assert abs(vb['y']+vb['height']/2-tb['y']-tb['height']/2)<2
    assert vb['x']+vb['width']<=cb['x']+cb['width']+1
    for link in videos.locator('a').all():
     assert '대표' not in link.inner_text();expect(link.locator('svg')).to_have_count(1);expect(link).to_have_attribute('target','_blank');assert 'noopener' in link.get_attribute('rel')
     if w<=620:assert link.bounding_box()['height']>=44
   page.screenshot(path=str(out/f'production-viewer-{w}.png'))
  checks.append('approved category-right inline platform buttons at six widths; no representative text/arrows/overflow; safe links, timestamps and all detail media preserved')
  login();go();count(4);expect(page.locator('.ck-admin')).to_be_visible();expect(page.get_by_role('button',name='노래 추가',exact=True)).to_be_visible()
  for w in [390,1440]:
   page.set_viewport_size({'width':w,'height':1050});card(2).scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/f'production-admin-{w}.png'))
  page.set_viewport_size({'width':1440,'height':1050});go(youtube='missing');count(3);d=edit(2)
  expect(d.locator('.ck-url')).to_have_count(1);expect(d.locator('.ck-automatic-links .ck-video')).to_have_attribute('href',auto_url)
  d.get_by_label('시청자에게 보여줄 안내',exact=False).fill('실제 저장 규칙 테스트');d.get_by_label('신청 가능 상태',exact=True).select_option('available')
  page.keyboard.press('Escape');expect(d).to_contain_text('저장하지 않은 변경사항');d.get_by_role('button',name='계속 편집',exact=True).click();expect(d.get_by_label('시청자에게 보여줄 안내',exact=False)).to_have_value('실제 저장 규칙 테스트')
  d.get_by_label('영상 주소',exact=True).fill(y);d.get_by_label('영상 용도',exact=True).select_option('original');d.get_by_role('button',name='영상 연결',exact=True).click();expect(d.locator('[data-representative=true] .ck-url')).to_have_attribute('href',y)
  for w in [390,1440]:page.set_viewport_size({'width':w,'height':1050});page.screenshot(path=str(out/f'production-quick-{w}.png'))
  d.get_by_role('button',name='저장 후 다음 곡',exact=True).click();expect(d.locator('.ck-editor-song')).not_to_contain_text(rows[1]['title']);d.get_by_role('button',name='창 닫기',exact=True).click();count(2)
  saved=rows[1];assert saved['video_urls']==[s,y] and saved['public_note']=='실제 저장 규칙 테스트' and saved['request_status']=='available';assert saved['video_kinds']=={y:'original'}
  assert saved['categories']==original[1]['categories'] and saved['aliases']==original[1]['aliases'] and saved['difficulty']==4 and ratings[1]['proficiency']==5
  assert auto_url not in saved['video_urls'] and len(writes)==1
  checks.append('quick edit persists public note/status/manual video and purpose through revision-guarded server PATCH; automatic links and ratings preserved; save-next and dirty-close protection work')
  go();count(4);expect(card(2)).to_contain_text('실제 저장 규칙 테스트');expect(card(2)).to_contain_text('신청 가능');expect(card(2).locator('.ck-video').first).to_have_attribute('href',y)
  card(2).get_by_role('button',name=rows[1]['title']+' 상세 보기').click();d=page.get_by_role('dialog',name=rows[1]['title'],exact=True);expect(d.locator('.ck-video')).to_have_count(3);expect(d.locator('.ck-video').first).to_contain_text('원곡·공식')
  d.get_by_role('button',name='곡 정보 편집',exact=True).click();editor=page.get_by_role('dialog',name='곡 정보 편집',exact=True);editor.get_by_label('곡명',exact=True).fill(rows[1]['title']);editor.get_by_role('button',name='변경사항 저장',exact=True).click();expect(page.get_by_role('dialog',name=rows[1]['title'],exact=True)).to_be_visible();page.keyboard.press('Escape')
  assert rows[1]['public_note']=='실제 저장 규칙 테스트' and rows[1]['video_kinds']=={y:'original'} and rows[1]['video_urls']==[s,y]
  checks.append('live-data reload and detail reflect saved usage; original full Apple/YouTube editor preserves new fields and does not duplicate automatic media')
  d=edit(2);d.get_by_label('시청자에게 보여줄 안내',exact=False).fill('실패 보존');state['failure']=True;d.get_by_role('button',name='저장',exact=True).click();expect(d.get_by_role('alert')).to_contain_text('저장하지 못했습니다');expect(d.get_by_label('시청자에게 보여줄 안내',exact=False)).to_have_value('실패 보존');assert rows[1]['public_note']=='실제 저장 규칙 테스트'
  state.update(failure=False,conflict=True);d.get_by_role('button',name='저장',exact=True).click();expect(d.get_by_role('alert')).to_contain_text('다른 화면에서 변경');expect(d.get_by_label('시청자에게 보여줄 안내',exact=False)).to_have_value('실패 보존');state['conflict']=False
  page.keyboard.press('Escape');d.get_by_role('button',name='변경 버리고 닫기',exact=True).click()
  checks.append('server failure and optimistic concurrency conflicts retain unsaved draft and never report success or change the stored row')
  # Removing first manual YouTube promotes the next one; no separate representative DB field.
  go();d=edit(1);d.get_by_role('button',name='연결 영상 1 제거',exact=True).click();expect(d.locator('[data-representative=true] .ck-url')).to_have_attribute('href',y2);d.get_by_role('button',name='저장',exact=True).click();expect(d).to_have_count(0);expect(card(1).locator('.ck-video').first).to_have_attribute('href',y2)
  page.reload(wait_until='networkidle');expect(card(1).locator('.ck-video').first).to_have_attribute('href',y2)
  checks.append('first YouTube selection stays derived after removal/save/reload without adding a representative field or changing SOOP timestamps')
  state['admin']=False;go(mode='admin',youtube='missing',attention='artist');count(4);expect(page.locator('.ck-admin')).to_have_count(0);expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0);expect(page.locator('.ck-quick')).to_have_count(0)
  page.locator('.site-footer').get_by_role('button',name='로그아웃',exact=True).click();count(4);expect(page.get_by_role('link',name='로그인 / 회원가입',exact=True)).to_be_visible()
  assert not errors and sum(not w['failed'] for w in writes)==3
  assert all('songbook_preview' not in r['path'] and 'songbook-check-snapshot' not in r['path'] for r in requests)
  checks.append('ordinary member and logout remain read-only; no preview tables, snapshot requests, permission escalation or unexpected writes')
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'mock_writes':writes,'live_mutations':0},ensure_ascii=False,indent=2)+'\n')
 except Exception:
  (out/'error.txt').write_text(traceback.format_exc());(out/'failure.txt').write_text(page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'));raise
 finally:browser.close()
print('PASS:',len(checks),'usability production browser groups')
