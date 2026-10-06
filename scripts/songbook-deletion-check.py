#!/usr/bin/env python3
"""Production app with isolated auth/API; never deletes a real user's song."""
import argparse,base64,json,shutil,time,traceback
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--out',required=True);a=p.parse_args()
base=a.url.rstrip('/')+'/';out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
uid='00000000-0000-4000-8000-000000000001'
user={'id':uid,'aud':'authenticated','role':'authenticated','email':'fixture@example.invalid','user_metadata':{'username':'mir.review'},'app_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
def enc(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'aud':'authenticated','role':'authenticated','exp':int(time.time())+3600})+'.fixture'
raw=json.loads(Path('src/data/songbookCatalog.json').read_text());seed=raw[0]
manual={'id':'custom-00000000-0000-4000-8000-000000000001','title':'삭제 검증곡','artist':'','categories':['가요'],'aliases':[],'video_urls':[],'difficulty':4,'revision':3,'request_status':'unreviewed'}
auto={'id':'custom-00000000-0000-4000-8000-000000000002','title':'자동 보관 테스트곡','artist':'검증 가수','categories':['가요'],'aliases':[],'active':True}
state={'admin':True,'fail':False,'fail_read':False};deletions={};writes=[];checks=[];errors=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def handler(route):
  req=route.request;u=urlsplit(req.url);params=parse_qs(u.query);path=u.path
  def reply(data,status=200):return route.fulfill(status=status,content_type='application/json',body=json.dumps(data,ensure_ascii=False))
  if u.hostname=='songbook-test.supabase.co':
   if path=='/functions/v1/member-auth':return reply({'access_token':token,'refresh_token':'fixture-refresh','user_id':uid})
   if path=='/auth/v1/user':return reply(user)
   if path=='/auth/v1/logout':return route.fulfill(status=204)
   if '/rest/v1/rpc/' in path:
    name=path.split('/')[-1]
    if name=='songbook_deleted_list':
     assert req.method=='GET';rows=list(deletions.values());start=int(params.get('p_page',['0'])[0])*20
     return reply({'count':len(rows),'rows':rows[start:start+20]}) if state['admin'] else reply({'code':'42501'},403)
    assert req.method=='POST' and name in ('songbook_delete','songbook_restore')
    body=req.post_data_json;sid=body['p_song_id'];writes.append({'rpc':name,'song_id':sid})
    if state['fail']:return reply({'code':'40001'},409)
    if not state['admin']:return reply({'code':'42501'},403)
    if name=='songbook_delete':
     s=next(x for x in [manual,auto,seed] if x['id']==sid)
     assert body['p_expected_revision']==(3 if sid==manual['id'] else 0)
     deletions[sid]={'song_id':sid,'title':s['title'],'artist':s['artist'],'delete_token':'00000000-0000-4000-8000-000000000099','deleted_at':'2026-10-06T00:00:00Z'}
     return reply({'status':'deleted','song_id':sid})
    assert body['p_delete_token']==deletions[sid]['delete_token'];del deletions[sid]
    return reply({'status':'restored','song_id':sid})
   if path.startswith('/rest/v1/'):
    table=path.split('/')[-1];assert req.method in ('GET','HEAD','OPTIONS'),'unexpected data mutation'
    obj='vnd.pgrst.object' in req.headers.get('accept','')
    if table=='admins':return reply(({'user_id':uid} if obj else [{'user_id':uid}]) if state['admin'] else (None if obj else []))
    if table=='member_profiles':return reply({'username':'mir.review'} if obj else [{'username':'mir.review'}])
    if table=='songbook_deletions':
     assert params.get('select')==['song_id']
     return reply({'code':'unavailable'},503) if state['fail_read'] else reply([{'song_id':sid} for sid in deletions])
    if table=='songbook_entries':return reply([] if manual['id'] in deletions else [manual])
    if table=='songbook_ratings':return reply([] if manual['id'] in deletions else [{'song_id':manual['id'],'proficiency':5,'revision':1}])
    # Deliberately return the automatic raw row, to also prove client-side suppression after re-scan.
    if table=='songbook_auto_entries':return reply([auto])
    return reply([])
   return reply({},400)
  assert req.method in ('GET','HEAD','OPTIONS'),'unexpected external mutation'
  return route.continue_() if u.netloc==urlsplit(base).netloc else route.abort()
 ctx.route('**/*',handler)
 def go(q=''):
  from urllib.parse import urlencode
  page.goto(base+'songbook/?'+urlencode({'q':q}),wait_until='networkidle')
 def detail(title):
  page.get_by_role('button',name=title+' 상세 보기',exact=True).click();expect(page.get_by_role('dialog',name=title,exact=True)).to_be_visible()
 def confirm():
  page.get_by_role('button',name='노래 삭제',exact=True).click();d=page.get_by_role('dialog',name='노래 삭제 확인',exact=True);expect(d).to_be_visible();return d
 try:
  go(manual['title']);detail(manual['title']);expect(page.get_by_role('button',name='노래 삭제',exact=True)).to_have_count(0);page.keyboard.press('Escape')
  expect(page.get_by_role('button',name='삭제한 노래',exact=True)).to_have_count(0)
  checks.append('anonymous visitor has neither deletion nor recovery controls')
  page.goto(base+'account/',wait_until='networkidle');page.get_by_label('아이디',exact=True).fill('mir.review');page.get_by_label('비밀번호',exact=True).fill('fixture password');page.locator('form').get_by_role('button',name='로그인',exact=True).click();expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
  go(manual['title']);page.get_by_role('button',name=manual['title']+' 즐겨찾기',exact=True).click();detail(manual['title']);d=confirm()
  expect(d.get_by_text('가수 미확인',exact=True)).to_be_visible();expect(d).to_contain_text('자동 수집으로 다시 표시되지 않습니다')
  d.get_by_role('button',name='취소',exact=True).click();expect(page.get_by_role('dialog',name=manual['title'],exact=True)).to_be_visible();assert not writes
  checks.append('administrator sees specific song confirmation; cancel makes no mutation')
  d=confirm()
  for w in [1440,1024,768,390]:
   page.set_viewport_size({'width':w,'height':1050});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/f'delete-confirm-{w}.png'))
  state['fail']=True;d.get_by_role('button',name='삭제하기',exact=True).click();expect(d.get_by_role('alert')).to_contain_text('다른 화면');assert not deletions
  expect(d).to_be_visible();checks.append('failed/conflicting deletion preserves the song and confirmation with an error')
  state['fail']=False;before=len(writes);d.get_by_role('button',name='삭제하기',exact=True).evaluate('(b)=>{b.click();b.click()}')
  expect(page.get_by_role('dialog')).to_have_count(0);expect(page.locator('.sb-delete-notice')).to_contain_text('삭제했습니다');assert len(writes)==before+1
  expect(page.get_by_role('button',name=manual['title']+' 상세 보기',exact=True)).to_have_count(0)
  assert manual['id'] in deletions and manual['difficulty']==4 and manual['revision']==3
  expect(page.get_by_label('곡명, 가수, 초성 검색',exact=True)).to_have_value(manual['title'])
  checks.append('successful double-click issues one delete; catalog/count/notice update without clearing the search')
  page.reload(wait_until='networkidle');expect(page.get_by_role('button',name=manual['title']+' 상세 보기',exact=True)).to_have_count(0)
  with page.expect_download() as dl:page.get_by_role('button',name='CSV',exact=True).click()
  download=dl.value;assert manual['title'] not in Path(download.path()).read_text(encoding='utf-8-sig')
  checks.append('deletion survives page reload and removes the song from CSV')
  page.get_by_role('button',name='삭제한 노래',exact=True).click();d=page.get_by_role('dialog',name='삭제한 노래',exact=True);expect(d.get_by_role('button',name=manual['title']+' 복원',exact=True)).to_be_visible()
  for w in [1440,390]:
   page.set_viewport_size({'width':w,'height':1050});page.screenshot(path=str(out/f'deleted-list-{w}.png'))
  d.get_by_role('button',name=manual['title']+' 복원',exact=True).click();expect(d.get_by_role('status')).to_contain_text('복원했습니다');expect(d.get_by_text('삭제한 노래가 없습니다.',exact=True)).to_be_visible();page.keyboard.press('Escape')
  detail(manual['title']);expect(page.get_by_role('dialog').get_by_role('button',name='미르 숙련도 5점으로 설정')).to_have_attribute('aria-pressed','true');page.keyboard.press('Escape')
  checks.append('recovery restores server-backed empty artist song and original proficiency/difficulty')
  go(seed['title']);detail(seed['title']);d=confirm();d.get_by_role('button',name='삭제하기',exact=True).click();expect(page.get_by_role('dialog')).to_have_count(0);page.reload(wait_until='networkidle');expect(page.get_by_role('button',name=seed['title']+' 상세 보기',exact=True)).to_have_count(0)
  checks.append('base catalog song deletion cannot fall back to the bundled original after reload')
  go(auto['title']);detail(auto['title']);d=confirm();d.get_by_role('button',name='삭제하기',exact=True).click();expect(page.get_by_role('dialog')).to_have_count(0);page.reload(wait_until='networkidle');expect(page.get_by_role('button',name=auto['title']+' 상세 보기',exact=True)).to_have_count(0)
  checks.append('automatic raw data returned on later refresh cannot republish a deleted song')
  state['admin']=False;go(manual['title']);detail(manual['title']);expect(page.get_by_role('button',name='노래 삭제',exact=True)).to_have_count(0);page.keyboard.press('Escape');expect(page.get_by_role('button',name='삭제한 노래',exact=True)).to_have_count(0)
  state['fail_read']=True;go();expect(page.locator('.sb2-error')).to_contain_text('삭제 상태');expect(page.locator('.sb2-song')).to_have_count(0)
  checks.append('ordinary members remain read-only; failed initial deletion lookup never exposes static fallback')
  assert not errors
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'mock_mutations':writes,'live_mutations':0},ensure_ascii=False,indent=2))
 except Exception:
  (out/'error.txt').write_text(traceback.format_exc());(out/'failure.txt').write_text(page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'));raise
 finally:browser.close()
print('PASS:',len(checks),'deletion browser groups')
