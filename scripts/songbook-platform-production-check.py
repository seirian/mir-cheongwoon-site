#!/usr/bin/env python3
"""Actual production app with isolated auth, catalog and DB fixtures. No live writes."""
import argparse, base64, json, re, shutil, time, traceback
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright, expect

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--url',required=True);parser.add_argument('--out',required=True);args=parser.parse_args()
    base=args.url.rstrip('/')+'/';out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    uid='00000000-0000-4000-8000-000000000001'
    user={'id':uid,'aud':'authenticated','role':'authenticated','email':'fixture@example.invalid','user_metadata':{'username':'mir.review'},'app_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
    def enc(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
    token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'aud':'authenticated','role':'authenticated','exp':int(time.time())+3600})+'.fixture'
    state={'admin':True,'fail_write':False};entries=[];writes=[];reads=[];checks=[];errors=[]
    apple={'provider':'apple','key':'itunes:1234567','title':'플랫폼 합치기 검증곡','artist':'검증 가수','aliases':[],'musicUrl':'https://music.apple.com/kr/album/test/123456?i=1234567','album':'검증 앨범'}
    video={'provider':'youtube','title':'영상에서 가져온 검증곡','artist':'not-an-artist','channel':'업로드 채널','videoUrl':'https://www.youtube.com/watch?v=abcdefghijk&t=62'}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
        ctx=browser.new_context(viewport={'width':1440,'height':1050});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        def route_handler(route):
            req=route.request;url=urlsplit(req.url);params=parse_qs(url.query);path=url.path
            def reply(data,status=200):return route.fulfill(status=status,content_type='application/json',body=json.dumps(data,ensure_ascii=False))
            if path.endswith('/api/songbook-platform-search.php'):
                provider=params.get('provider',[''])[0];reads.append(provider);assert provider in ('apple','youtube')
                return reply({'provider':provider,'state':'ok','songs':[apple if provider=='apple' else video]})
            if url.hostname=='songbook-test.supabase.co':
                if path=='/functions/v1/member-auth':
                    assert req.post_data_json=={'action':'login','identifier':'mir.review','password':'fixture password'}
                    return reply({'access_token':token,'refresh_token':'fixture-refresh','user_id':uid})
                if path=='/auth/v1/user':return reply(user)
                if path=='/auth/v1/logout':return route.fulfill(status=204)
                if path.startswith('/rest/v1/'):
                    table=path.split('/')[-1];assert not table.startswith('songbook_preview_')
                    if req.method not in ('GET','HEAD','OPTIONS'):
                        assert state['admin'] and table=='songbook_entries' and req.method in ('POST','PATCH')
                        payload=req.post_data_json;assert 'proficiency' not in payload
                        if state['fail_write']:return reply({'code':'42501'},403)
                        if req.method=='PATCH':
                            old=next(r for r in entries if r['id']==params['id'][0].removeprefix('eq.'))
                            assert params['revision'][0]=='eq.'+str(old['revision']);old.update(payload);old['revision']+=1;saved=dict(old)
                        else:
                            saved={**payload,'revision':1};entries.append(saved)
                        writes.append({'method':req.method,'id':saved['id'],'artist':saved['artist'],'title':saved['title']});return reply(saved,201 if req.method=='POST' else 200)
                    obj='vnd.pgrst.object' in req.headers.get('accept','')
                    if table=='admins':return reply(({'user_id':uid} if obj else [{'user_id':uid}]) if state['admin'] else (None if obj else []))
                    if table=='member_profiles':return reply({'username':'mir.review','email':user['email']} if obj else [{'username':'mir.review','email':user['email']}])
                    if table=='songbook_entries':return reply(entries)
                    return reply([])
                return reply({},400)
            assert req.method in ('GET','HEAD','OPTIONS'),'unexpected external mutation'
            if url.netloc==urlsplit(base).netloc:return route.continue_()
            return route.abort()
        ctx.route('**/*',route_handler)
        def login():
            page.goto(base+'account/',wait_until='networkidle')
            page.get_by_label('아이디',exact=True).fill('mir.review');page.get_by_label('비밀번호',exact=True).fill('fixture password')
            page.locator('form').get_by_role('button',name='로그인',exact=True).click()
            expect(page.get_by_role('heading',name='mir.review',exact=True)).to_be_visible()
            page.goto(base+'songbook/',wait_until='networkidle')
        def add():
            page.get_by_role('button',name='노래 추가',exact=True).click();d=page.get_by_role('dialog',name='노래 추가',exact=True);expect(d).to_be_visible();return d
        def artist(d):return d.locator('label').filter(has_text='가수·작품').locator('input')
        def check_identity_alignment(d, mode):
            title=d.get_by_label('곡명',exact=True)
            singer=artist(d)
            group=d.locator('.sb2-form-grid').first
            hint=group.get_by_text('선택 · 모르면 공란으로 두세요',exact=True)
            expect(hint).to_be_visible()
            assert title.evaluate('(e)=>e.required') and not singer.evaluate('(e)=>e.required')
            for width in (320,390,768,1024,1440,1920):
                page.set_viewport_size({'width':width,'height':1050})
                group.scroll_into_view_if_needed()
                t=title.bounding_box();a=singer.bounding_box();h=hint.bounding_box()
                assert t and a and h,(mode,width,'missing fields')
                assert abs(t['height']-a['height'])<=1,(mode,width,t,a)
                if width>620:
                    assert abs(t['y']-a['y'])<=1,(mode,width,'input tops differ',t,a)
                else:
                    assert a['y']>=t['y']+t['height'],(mode,width,'mobile fields overlap')
                    assert abs(t['x']-a['x'])<=1 and abs(t['width']-a['width'])<=1
                assert h['y']>=a['y']+a['height'],(mode,width,'hint must be below artist input')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                group.screenshot(path=str(out/f'editor-{mode}-aligned-{width}.png'))
            page.set_viewport_size({'width':1440,'height':1050})
            checks.append(f'{mode} editor: title/artist inputs align with equal height; optional hint below input; six responsive widths')
        def search(d):
            d.get_by_label('추가할 곡 검색',exact=True).fill('검증곡');d.get_by_role('button',name='플랫폼 검색',exact=True).click()
            expect(d.locator('[data-provider=youtube] .sp-result')).to_have_count(1)
            expect(d.locator('[data-provider=apple] .sp-result')).to_have_count(1)
        def category(d):d.locator('.sb2-category-select').get_by_role('checkbox',name='가요',exact=True).check()
        def save(d):d.locator('form.sb2-form').get_by_role('button',name='노래책에 추가',exact=True).click()
        try:
            page.goto(base+'songbook/?add=1&demo=1',wait_until='networkidle')
            expect(page.get_by_role('dialog')).to_have_count(0);expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0)
            expect(page.locator('.sp-preview,.sp-local-notice')).to_have_count(0)
            checks.append('production query parameters cannot enable preview editing or local-only mode')
            login();d=add();check_identity_alignment(d,'add');search(d)
            expect(d.get_by_role('button',name='Melon',exact=True)).to_have_count(0)
            assert not re.search(r'멜론|Melon|이 브라우저에서만',d.inner_text())
            for width in (1440,1024,768,390):
                page.set_viewport_size({'width':width,'height':1050});d.locator('.sp-tabs').scroll_into_view_if_needed()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                page.screenshot(path=str(out/f'production-platforms-{width}.png'))
            checks.append('admin gets separate Apple/YouTube results and no Melon/preview UI at four widths')
            d.locator('[data-provider=youtube]').get_by_role('button',name='영상 정보 가져오기',exact=True).click()
            expect(artist(d)).to_have_value('');assert not artist(d).evaluate('(e)=>e.required')
            d.get_by_label('곡명',exact=True).fill('운영 저장 검증곡');category(d)
            d.get_by_role('button',name='난이도 4점으로 설정',exact=True).click();save(d)
            expect(page.get_by_role('dialog',name='운영 저장 검증곡',exact=True)).to_be_visible()
            assert len(entries)==1 and entries[0]['artist']=='' and entries[0]['difficulty']==4
            assert entries[0]['video_urls']==['https://www.youtube.com/watch?v=abcdefghijk&t=62'] and entries[0]['request_status']=='unreviewed'
            expect(page.get_by_role('dialog').get_by_text('가수 미확인',exact=True)).to_be_visible()
            checks.append('real production store sends empty artist to songbook_entries; channel is never persisted as singer')
            page.reload(wait_until='networkidle');d=page.get_by_role('dialog',name='운영 저장 검증곡',exact=True);expect(d).to_be_visible()
            expect(d.get_by_text('가수 미확인',exact=True)).to_be_visible();d.get_by_role('button',name='곡 정보 편집',exact=True).click()
            d=page.get_by_role('dialog',name='곡 정보 편집',exact=True);expect(artist(d)).to_have_value('')
            check_identity_alignment(d,'edit')
            for width in (1440,390):
                page.set_viewport_size({'width':width,'height':1050});artist(d).scroll_into_view_if_needed();page.screenshot(path=str(out/f'production-empty-artist-{width}.png'))
            artist(d).fill('확인된 가수');state['fail_write']=True
            d.get_by_role('button',name='변경사항 저장',exact=True).click();expect(d.get_by_role('alert')).to_contain_text('저장하지 못했습니다')
            expect(artist(d)).to_have_value('확인된 가수');assert entries[0]['artist']==''
            state['fail_write']=False;d.get_by_role('button',name='변경사항 저장',exact=True).click()
            expect(page.get_by_role('dialog',name='운영 저장 검증곡',exact=True)).to_be_visible()
            assert entries[0]['artist']=='확인된 가수' and entries[0]['revision']==2 and entries[0]['difficulty']==4
            checks.append('empty artist reloads and can be filled later; failed saves preserve draft and optimistic revision')
            page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
            d=add();search(d)
            d.locator('[data-provider=apple]').get_by_role('button',name='곡 정보 가져오기',exact=True).click()
            expect(artist(d)).to_have_value('검증 가수')
            d.locator('[data-provider=youtube]').get_by_role('button',name='영상 정보 가져오기',exact=True).click()
            expect(d.get_by_label('곡명',exact=True)).to_have_value(apple['title']);expect(artist(d)).to_have_value(apple['artist'])
            category(d);save(d);expect(page.get_by_role('dialog',name=apple['title'],exact=True)).to_be_visible()
            assert len(entries)==2 and entries[1]['music_url']==apple['musicUrl'] and entries[1]['video_urls']
            checks.append('Apple metadata survives appended YouTube video and saves to server rather than local preview')
            page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0);d=add()
            d.get_by_label('곡명',exact=True).fill(apple['title']);artist(d).fill(apple['artist']);category(d);before=len(writes);save(d)
            expect(d.get_by_role('alert')).to_contain_text('같은 곡');assert len(writes)==before
            checks.append('duplicate title/artist is rejected before server mutation')
            page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
            state['admin']=False;page.reload(wait_until='networkidle')
            expect(page.get_by_role('button',name='노래 추가',exact=True)).to_have_count(0);expect(page.locator('.sb2-picker')).to_have_count(0)
            assert not page.evaluate("Object.keys(localStorage).some(k=>k.startsWith('mir-songbook-platform-review'))")
            checks.append('regular member remains read-only and production writes never use preview draft storage')
            assert not errors and set(reads)=={'apple','youtube'} and len(writes)==3
            (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'mock_db_changes':writes,'live_writes':0,'providers':sorted(set(reads))},ensure_ascii=False,indent=2),encoding='utf-8')
        except Exception:
            traceback.print_exc();page.screenshot(path=str(out/'failure.png'));(out/'failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8');raise
        finally:browser.close()
    print('PASS:',len(checks),'platform production browser groups')
if __name__=='__main__':main()
