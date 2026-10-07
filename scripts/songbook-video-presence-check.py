#!/usr/bin/env python3
"""Admin video filters in the production app; all auth/data calls use isolated fixtures."""
import argparse, base64, json, re, shutil, time, traceback
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from playwright.sync_api import sync_playwright, expect
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);a=p.parse_args()
base=a.url.rstrip('/')+'/';out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
uid='00000000-0000-4000-8000-000000000001'
user={'id':uid,'aud':'authenticated','role':'authenticated','email':'fixture@example.invalid','user_metadata':{'username':'mir.review'},'app_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
def enc(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'aud':'authenticated','role':'authenticated','exp':int(time.time())+3600})+'.fixture'
yt='https://www.youtube.com/watch?v=abcdefghijk';soop='https://vod.sooplive.com/player/123456789?change_second=60'
def row(n,title,urls):return {'id':f'custom-00000000-0000-4000-8000-{n:012d}','title':f'링크검증 {n:02d} {title}','artist':'테스트 가수','categories':['가요'],'aliases':[],'video_urls':urls,'difficulty':3,'revision':1,'request_status':'unreviewed'}
entries=[row(i,'숲 전용',[soop]) for i in range(1,28)]+[row(28,'유튜브 전용',[yt]),row(29,'두 플랫폼',[soop,yt]),row(30,'영상 없음',[])]
auto=row(31,'자동 숲 연결',[]);auto['active']=True
state={'admin':True};checks=[];errors=[];writes=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def handler(route):
  req=route.request;u=urlsplit(req.url);path=u.path;params=parse_qs(u.query)
  def reply(data,status=200):return route.fulfill(status=status,content_type='application/json',body=json.dumps(data,ensure_ascii=False))
  if u.hostname=='songbook-test.supabase.co':
   if path=='/functions/v1/member-auth':return reply({'access_token':token,'refresh_token':'fixture-refresh','user_id':uid})
   if path=='/auth/v1/user':return reply(user)
   if path=='/auth/v1/logout':return route.fulfill(status=204)
   if path.startswith('/rest/v1/'):
    table=path.split('/')[-1]
    if req.method not in ('GET','HEAD','OPTIONS'):
     assert state['admin'] and req.method=='PATCH' and table=='songbook_entries'
     sid=params['id'][0].removeprefix('eq.');index=next(i for i,r in enumerate(entries) if r['id']==sid)
     assert params['revision']==['eq.1'] and index==0
     entries[index]={**entries[index],**req.post_data_json,'revision':2};writes.append({'table':table,'id':sid})
     return reply(entries[index])
    obj='vnd.pgrst.object' in req.headers.get('accept','')
    if table=='admins':return reply(({'user_id':uid} if obj else [{'user_id':uid}]) if state['admin'] else (None if obj else []))
    if table=='member_profiles':return reply({'username':'mir.review'} if obj else [{'username':'mir.review'}])
    if table=='songbook_entries':return reply(entries)
    if table=='songbook_auto_entries':return reply([auto])
    if table=='songbook_auto_media':return reply([{'id':auto['id'],'video_urls':[soop],'total_count':8}])
    return reply([])
   return reply({},400)
  assert req.method in ('GET','HEAD','OPTIONS'),'unmocked mutation blocked'
  return route.continue_() if u.netloc==urlsplit(base).netloc else route.abort()
 ctx.route('**/*',handler)
 def go(**kwargs):page.goto(base+'songbook/?'+urlencode({'q':'링크검증',**kwargs}),wait_until='networkidle')
 def count(n):expect(page.locator('.sb-result-bar>p')).to_contain_text(f'{n}곡');expect(page.locator('.sb2-song')).to_have_count(min(n,25))
 def filters():return page.locator('.sb-video-filters')
 def select(y='',s=''):
  page.get_by_label('YouTube 링크 유무',exact=True).select_option(y)
  page.get_by_label('SOOP 링크 유무',exact=True).select_option(s)
 try:
  go(youtube='missing',soop='missing');count(31);expect(filters()).to_have_count(0)
  checks.append('anonymous crafted platform conditions neither expose controls nor filter public results')
  page.goto(base+'account/',wait_until='networkidle');page.get_by_label('아이디',exact=True).fill('mir.review');page.get_by_label('비밀번호',exact=True).fill('fixture password');page.locator('form').get_by_role('button',name='로그인',exact=True).click();expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
  go();expect(filters()).to_be_visible();count(31)
  expected={('',''):31,('present',''):2,('missing',''):29,('','present'):29,('','missing'):2,('present','present'):1,('present','missing'):1,('missing','present'):28,('missing','missing'):1}
  for (y,s),n in expected.items():select(y,s);count(n)
  expect(page.locator('.sb2-song')).to_contain_text('영상 없음')
  checks.append('verified admin gets independent selectors; all nine AND combinations match across the complete catalog')
  select('missing','present');count(28)
  page.get_by_role('button',name='다음 페이지',exact=True).click();expect(page.locator('.sb2-song')).to_have_count(3)
  expect(page.locator('.sb2-song').last).to_contain_text('자동 숲 연결')
  with page.expect_download() as dl:page.get_by_role('button',name='CSV',exact=True).click()
  export=Path(dl.value.path()).read_text(encoding='utf-8-sig')
  assert '자동 숲 연결' in export and '유튜브 전용' not in export and '두 플랫폼' not in export and export.count('링크검증')==28
  page.get_by_label('SOOP 링크 유무',exact=True).select_option('missing');count(1);expect(page.locator('.sb-pagination')).to_contain_text('1 / 1')
  checks.append('automatic SOOP media counts; filtering precedes pagination and full-result CSV; changed filters return to page one')
  go(youtube='missing',soop='present',category='가요',difficulty='3');count(28)
  page.reload(wait_until='networkidle');count(28);expect(page.get_by_label('YouTube 링크 유무',exact=True)).to_have_value('missing')
  filters().get_by_role('button',name='영상 조건 초기화',exact=True).click();count(31)
  assert 'category=' in page.url and 'difficulty=3' in page.url
  expect(page.get_by_label('곡명, 가수, 초성 검색',exact=True)).to_have_value('링크검증')
  page.go_back(wait_until='networkidle');count(28)
  page.locator('.sb-result-bar').get_by_role('button',name='초기화',exact=True).click()
  expect(page.get_by_label('YouTube 링크 유무',exact=True)).to_have_value('');expect(page.get_by_label('SOOP 링크 유무',exact=True)).to_have_value('')
  assert not any(k in parse_qs(urlsplit(page.url).query) for k in ['youtube','soop','q','difficulty','category'])
  checks.append('refresh/back preserve conditions; video-only reset preserves other criteria; global reset clears everything')
  go(youtube='missing',soop='present');count(28)
  for w in [320,390,768,1024,1440,1920]:
   page.set_viewport_size({'width':w,'height':1050});filters().scroll_into_view_if_needed()
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
   assert filters().bounding_box()['width']<=page.locator('.sb-library').bounding_box()['width']
   page.screenshot(path=str(out/f'video-presence-{w}.png'))
  checks.append('six mobile/desktop widths preserve content gutters, readable controls and no horizontal overflow')
  page.set_viewport_size({'width':1440,'height':1050});go(youtube='missing');count(29)
  title=entries[0]['title'];sid=entries[0]['id'];page.get_by_role('button',name=title+' 상세 보기',exact=True).click()
  page.get_by_role('button',name='곡 정보 편집',exact=True).click();d=page.get_by_role('dialog',name='곡 정보 편집',exact=True);expect(d).to_be_visible()
  links=d.locator('form.sb2-form').get_by_placeholder('YouTube 또는 SOOP VOD 주소를 모두 입력해주세요',exact=True)
  expect(links).to_have_count(1);expect(links).to_have_value(soop)
  links.fill(soop+'\n'+yt)
  d.get_by_role('button',name='변경사항 저장',exact=True).click();expect(page.get_by_role('dialog',name=title,exact=True)).to_be_visible()
  page.keyboard.press('Escape');count(28);expect(page.locator(f'.sb2-song[data-song-id="{sid}"]')).to_have_count(0)
  expect(page.get_by_label('YouTube 링크 유무',exact=True)).to_have_value('missing')
  assert len(writes)==1 and len(entries)==30 and entries[0]['video_urls']==[soop,yt]
  page.reload(wait_until='networkidle');count(28)
  checks.append('adding a YouTube link removes just that song from missing results immediately and after reload without deleting the song')
  go(youtube='present',soop='present');count(2)
  page.get_by_role('button',name=title+' 즐겨찾기',exact=True).click()
  page.get_by_role('button',name=re.compile('^즐겨찾기')).click();count(1)
  page.get_by_label('YouTube 링크 유무',exact=True).select_option('missing');count(0)
  expect(page.locator('.sb2-empty')).to_contain_text('연결 영상 조건')
  checks.append('existing favorites and empty-state guidance combine with the administrator criteria')
  state['admin']=False;go(youtube='missing',soop='missing');count(31);expect(filters()).to_have_count(0)
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
  state['admin']=True;go(youtube='missing',soop='missing');count(1);expect(filters()).to_be_visible()
  page.locator('.site-footer').get_by_role('button',name='로그아웃',exact=True).click();expect(filters()).to_have_count(0);count(31)
  assert len(writes)==1 and not errors
  checks.append('ordinary member and logout ignore saved admin criteria; no privilege changes or unintended writes')
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'mock_mutations':writes,'live_mutations':0},ensure_ascii=False,indent=2))
 except Exception:
  (out/'error.txt').write_text(traceback.format_exc());page.screenshot(path=str(out/'failure.png'));raise
 finally:browser.close()
print('PASS:',len(checks),'video presence browser groups')
