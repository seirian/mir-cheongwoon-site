#!/usr/bin/env python3
"""Shared account login and songbook permissions; all auth/DB requests are fixtures."""
import argparse, base64, json, re, shutil, time, traceback
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
permission = {'admin': True, 'role': None}
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
     assert table=='songbook_ratings' and req.method=='POST' and permission['admin']
     r={**req.post_data_json,'revision':1};ratings.append(r);changes.append({'table':table,'proficiency':r['proficiency']});return reply(r,201)
    obj='vnd.pgrst.object' in req.headers.get('accept','')
    if table=='songbook_editors':
     rows=[{'role':permission['role']}] if permission['role'] else []
     return reply((rows[0] if rows else None) if obj else rows)
    if table=='admins': return reply(({'user_id':uid} if obj else [{'user_id':uid}]) if permission['admin'] else (None if obj else []))
    if table=='member_profiles': return reply({'username':'mir.review','email':user['email']} if obj else [{'username':'mir.review','email':user['email']}])
    if table=='songbook_ratings': return reply(ratings)
    return reply([])
   return reply({},400)
  if req.method not in ('GET','HEAD','OPTIONS'): raise AssertionError('unmocked mutation blocked')
  if u.hostname in ('127.0.0.1','localhost'): return route.continue_()
  return route.abort()
 ctx.route('**/*',intercept)
 def no_duplicate_login():
  expect(page.get_by_role('button',name='편집 로그인',exact=True)).to_have_count(0)
  expect(page.get_by_role('dialog',name='노래책 편집 로그인',exact=True)).to_have_count(0)
  expect(page.locator('.songbook-page input[type=password]')).to_have_count(0)
  expect(page.locator('.sb2-toolbar').get_by_role('button',name='로그아웃',exact=True)).to_have_count(0)
  expect(page.locator('.sb2-toolbar').get_by_role('button',name='관리자',exact=True)).to_have_count(0)
  expect(page.get_by_role('link',name='노래 찾아보기',exact=True)).to_have_count(0)
  expect(page.get_by_role('button',name='계정 연결',exact=True)).to_have_count(0)
 def visit_songbook():
  page.goto(base+'songbook/',wait_until='networkidle')
  expect(page.locator('.sb2-song')).to_have_count(24)
  no_duplicate_login()
 def account_login():
  page.goto(base+'account/',wait_until='networkidle')
  expect(page.get_by_label('아이디',exact=True)).to_have_attribute('type','text')
  expect(page.locator('form input[type=email]')).to_have_count(0)
  page.get_by_label('아이디',exact=True).fill('  Mir.Review  ')
  page.get_by_label('비밀번호',exact=True).fill(' test password ')
  page.locator('form').get_by_role('button',name='로그인',exact=True).click()
  expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
 try:
  visit_songbook()
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
  expect(page.locator('.sb2-toolbar button')).to_have_count(0)
  assert '4차 검토안' not in page.locator('body').inner_text()
  expect(page.get_by_role('link',name='4차 변경점 보기 ↗')).to_have_count(0)
  for width in [1440,1024,768,390]:
   page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(150)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
   no_duplicate_login();page.screenshot(path=str(out/f'no-editor-login-{width}.png'))
  checks.append('anonymous songbook has no login form/button or edit controls at four viewport sizes')
  page.get_by_role('link',name='로그인 / 회원가입',exact=True).click()
  expect(page.get_by_label('아이디',exact=True)).to_have_attribute('type','text')
  expect(page.locator('form input[type=email]')).to_have_count(0)
  page.get_by_label('아이디',exact=True).fill('mir.review');page.get_by_label('비밀번호',exact=True).fill('wrong password')
  page.locator('form').get_by_role('button',name='로그인',exact=True).click()
  expect(page.get_by_text('로그인에 실패했습니다. 아이디 또는 비밀번호를 확인해 주세요.',exact=True)).to_be_visible()
  visit_songbook();expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
  checks.append('existing footer account entry and wrong-password handling remain functional')
  account_login();visit_songbook()
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_be_visible()
  expect(page.locator('.sb2-picker')).to_have_count(24)
  expect(page.locator('.sb2-toolbar button')).to_have_count(1)
  page.get_by_role('button',name='노래 추가',exact=True).click();expect(page.get_by_role('dialog')).to_be_visible()
  page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
  page.locator('.sb2-title').first.click()
  expect(page.get_by_role('button',name='곡 정보 편집',exact=True)).to_be_visible()
  page.get_by_role('button',name='곡 정보 편집',exact=True).click()
  expect(page.get_by_role('dialog',name='곡 정보 편집',exact=True)).to_be_visible()
  page.keyboard.press('Escape')
  expect(page.get_by_role('button',name='곡 정보 편집',exact=True)).to_be_visible()
  page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
  checks.append('existing site administrator can add/edit songs without separate login, and can register Mir proficiency using the same admin grant')
  page.reload(wait_until='networkidle');expect(page.get_by_role('button',name='노래 추가',exact=True)).to_be_visible();no_duplicate_login()
  for width in [1440,390]:
   page.set_viewport_size({'width':width,'height':1000});page.evaluate('window.scrollTo(0,0)')
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
   page.screenshot(path=str(out/f'shared-admin-{width}.png'))
  page.locator('.site-footer').get_by_role('button',name='로그아웃',exact=True).click()
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
  expect(page.locator('.sb2-toolbar button')).to_have_count(0);no_duplicate_login()
  checks.append('shared admin session persists on reload and site logout removes edit controls without restoring duplicate login')
  permission.update(admin=False,role=None);account_login();visit_songbook()
  expect(page.locator('.sb2-toolbar button')).to_have_count(0)
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
  expect(page.locator('.sb2-picker')).to_have_count(0)
  page.locator('.sb2-title').first.click()
  expect(page.get_by_role('dialog')).to_be_visible()
  expect(page.get_by_role('dialog').get_by_role('button',name='곡 정보 편집',exact=True)).to_have_count(0)
  page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
  page.locator('.site-footer').get_by_role('button',name='로그아웃',exact=True).click()
  expect(page.get_by_role('link',name='로그인 / 회원가입',exact=True)).to_be_visible()
  checks.append('ordinary site member remains read-only without any increase in permissions')
  permission.update(admin=True,role=None);account_login();visit_songbook()
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_be_visible()
  page.locator('.sb2-song').first.get_by_role('button',name='미르 숙련도 4점으로 설정').click()
  expect(page.locator('.sb2-message')).to_contain_text('숙련도를 저장')
  assert changes==[{'table':'songbook_ratings','proficiency':4}]
  page.reload(wait_until='networkidle')
  expect(page.locator('.sb2-song').first.get_by_role('button',name='미르 숙련도 4점으로 설정')).to_have_attribute('aria-pressed','true')
  no_duplicate_login();page.locator('.site-footer').get_by_role('button',name='로그아웃',exact=True).click()
  expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0);no_duplicate_login()
  checks.append('admin proficiency persists and logout is only provided by the shared site menu')
  page.goto(base+'songbook/?demo=1',wait_until='networkidle');expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0);expect(page.locator('.sb2-demo')).to_have_count(0);no_duplicate_login()
  page.goto(base+'songbook/review/',wait_until='networkidle');expect(page).to_have_url(base+'songbook');no_duplicate_login()
  checks.append('demo query cannot enable production editing; review path remains redirected')
  for legacy in ['owner', 'manager']:
   permission.update(admin=False,role=legacy);account_login();visit_songbook()
   expect(page.locator('.sb2-toolbar button')).to_have_count(0)
   expect(page.locator('.sb2-picker')).to_have_count(0)
   page.locator('.site-footer').get_by_role('button',name='로그아웃',exact=True).click()
   expect(page.get_by_role('link',name='로그인 / 회원가입',exact=True)).to_be_visible()
  checks.append('legacy songbook roles without the site-admin grant cannot edit or rate')
  assert not direct_password and not errors
  assert 'songbook_editors' not in tables, 'production still queries the obsolete editor membership'
  assert len(logins)==6 and all(x['identifier']=='mir.review' for x in logins)
  checks.append('all six logins used existing username entrypoint; no direct password auth or JavaScript exceptions')
  (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'mock_logins':len(logins),'mock_changes':changes,'tables':sorted(set(tables))},ensure_ascii=False,indent=2))
 except Exception:
  traceback.print_exc()
  try:
   (out/'failure.txt').write_text(page.locator('body').inner_text())
   page.screenshot(path=str(out/'failure.png'))
  except Exception: pass
  raise
 finally: browser.close()
print('PASS:',len(checks),'shared-login/browser groups')
