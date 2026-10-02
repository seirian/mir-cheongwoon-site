#!/usr/bin/env python3
"""Production-mode ID login and shared session regression. Supabase is fully mocked."""
import argparse, base64, json, shutil, time, traceback
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
p = argparse.ArgumentParser(); p.add_argument('--url', required=True); p.add_argument('--out', required=True)
a = p.parse_args(); base = a.url.rstrip('/') + '/'; out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
uid = 'eddd3840-0000-4000-8000-000000000001'
user = {'id': uid, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'fixture@example.invalid', 'user_metadata': {'username': 'mir.review'}, 'app_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}
def enc(data): return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
token = enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc({'sub': uid, 'exp': int(time.time())+3600, 'aud': 'authenticated', 'role': 'authenticated'}) + '.fixture'
checks = []; errors = []; logins = []; changes = []; direct_password = []; tables = []; ratings = []
with sync_playwright() as pw:
 browser = pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'), args=['--no-sandbox'])
 ctx = browser.new_context(viewport={'width':1440, 'height':1000}); page = ctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
 def intercept(route):
  req=route.request; u=urlsplit(req.url); path=u.path
  def reply(data, status=200): route.fulfill(status=status, content_type='application/json', body=json.dumps(data))
  if u.hostname == 'songbook-test.supabase.co':
   if path == '/functions/v1/member-auth':
    body=req.post_data_json; logins.append({'action':body.get('action'), 'identifier':body.get('identifier')})
    assert body.get('action') == 'login' and body.get('identifier') == 'mir.review' and 'email' not in body
    if body.get('password') != ' test password ': return reply({'error':'invalid_credentials'},401)
    return reply({'access_token':token,'refresh_token':'fixture-refresh','user_id':uid})
   if path == '/auth/v1/user': return reply(user)
   if path == '/auth/v1/logout': return route.fulfill(status=204)
   if path == '/auth/v1/token':
    direct_password.append(req.url); return reply({'error':'not_allowed'},400)
   if path.startswith('/rest/v1/'):
    table=path.split('/')[-1];tables.append(table)
    assert 'songbook_preview' not in table, 'production touched preview tables'
    if req.method not in ('GET','HEAD','OPTIONS'):
     assert table=='songbook_ratings' and req.method=='POST'
     r={**req.post_data_json,'revision':1};ratings.append(r);changes.append({'table':table,'proficiency':r['proficiency']});return reply(r,201)
    obj='vnd.pgrst.object' in req.headers.get('accept','')
    if table=='songbook_editors': return reply({'role':'owner'} if obj else [{'role':'owner'}])
    if table=='admins': return reply(None if obj else [])
    if table=='member_profiles': return reply({'username':'mir.review','email':user['email']} if obj else [{'username':'mir.review','email':user['email']}])
    if table=='songbook_ratings': return reply(ratings)
    return reply([])
   return reply({},400)
  if req.method not in ('GET','HEAD','OPTIONS'): raise AssertionError('unmocked mutation blocked')
  if u.hostname in ('127.0.0.1','localhost'): return route.continue_()
  return route.abort()
 ctx.route('**/*',intercept)
 try:
  page.goto(base+'songbook/',wait_until='networkidle')
  expect(page.locator('.sb2-song')).to_have_count(24)
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
  assert '4차 검토안' not in page.locator('body').inner_text()
  expect(page.get_by_role('link',name='4차 변경점 보기 ↗')).to_have_count(0)
  checks.append('production list visible; review labels absent; anonymous editing hidden')
  page.get_by_role('button',name='편집 로그인',exact=True).click();d=page.get_by_role('dialog')
  expect(d.get_by_label('아이디',exact=True)).to_have_attribute('type','text')
  expect(d.locator('input[type=email]')).to_have_count(0)
  d.get_by_label('아이디',exact=True).fill('  Mir.Review  ');d.get_by_label('비밀번호',exact=True).fill('wrong password')
  d.get_by_role('button',name='로그인',exact=True).click();expect(d.get_by_role('alert')).to_contain_text('아이디 또는 비밀번호')
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
  checks.append('wrong ID password yields sanitized failure without editing rights')
  for width in [1440,390]:
   page.set_viewport_size({'width':width,'height':1000});page.screenshot(path=str(out/f'id-login-{width}.png'))
  d.get_by_label('비밀번호',exact=True).fill(' test password ');d.get_by_role('button',name='로그인',exact=True).click()
  expect(page.get_by_role('dialog')).to_have_count(0)
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_be_visible()
  page.locator('.sb2-song').first.get_by_role('button',name='미르 숙련도 4점으로 설정').click()
  expect(page.locator('.sb2-message')).to_contain_text('숙련도를 저장')
  assert changes==[{'table':'songbook_ratings','proficiency':4}]
  checks.append('username login installs server session and owner writes production-only rating table in fixture')
  page.goto(base+'account/',wait_until='networkidle');expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
  page.goto(base+'songbook/',wait_until='networkidle');expect(page.get_by_role('button',name='편집 로그인',exact=True)).to_have_count(0)
  expect(page.locator('.sb2-song').first.get_by_role('button',name='미르 숙련도 4점으로 설정')).to_have_attribute('aria-pressed','true')
  page.locator('.sb2-toolbar').get_by_role('button',name='로그아웃',exact=True).click()
  expect(page.get_by_role('button',name='편집 로그인',exact=True)).to_be_visible()
  page.goto(base+'account/',wait_until='networkidle');expect(page.get_by_label('아이디',exact=True)).to_be_visible()
  page.get_by_label('아이디',exact=True).fill('mir.review');page.get_by_label('비밀번호',exact=True).fill(' test password ')
  page.get_by_role('button',name='로그인',exact=True).click();expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
  page.goto(base+'songbook/',wait_until='networkidle');expect(page.get_by_role('button',name='노래 추가',exact=True)).to_be_visible()
  checks.append('site and songbook share login, reload persistence, logout and login in both directions')
  page.locator('.sb2-toolbar').get_by_role('button',name='로그아웃',exact=True).click();expect(page.get_by_role('button',name='편집 로그인',exact=True)).to_be_visible()
  page.goto(base+'songbook/?demo=1',wait_until='networkidle');expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0);expect(page.locator('.sb2-demo')).to_have_count(0)
  page.goto(base+'songbook/review/',wait_until='networkidle');expect(page).to_have_url(base+'songbook')
  checks.append('demo query cannot enable production editing; review route redirects to songbook')
  for width in [1440,1024,768,390]:
   page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(150)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
   page.screenshot(path=str(out/f'production-songbook-{width}.png'))
  checks.append('production responsive layouts without horizontal overflow')
  assert not direct_password and not errors
  assert len(logins)==3 and all(x['identifier']=='mir.review' for x in logins)
  checks.append('no direct email/password auth, no JavaScript exceptions, all auth/network calls isolated')
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'mock_logins':len(logins),'mock_changes':changes,'tables':sorted(set(tables))},ensure_ascii=False,indent=2))
 except Exception:
  traceback.print_exc()
  try:
   (out/'failure.txt').write_text(page.locator('body').inner_text())
   page.screenshot(path=str(out/'failure.png'))
  except Exception: pass
  raise
 finally: browser.close()
print('PASS:',len(checks),'production login/browser groups')
