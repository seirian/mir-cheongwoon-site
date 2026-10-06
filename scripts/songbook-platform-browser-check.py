#!/usr/bin/env python3
"""Exercise the actual preview editor. All saves are browser-local; no auth or DB writes."""
import argparse,json,re,shutil,traceback
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--url',required=True);parser.add_argument('--out',required=True);parser.add_argument('--live',action='store_true');args=parser.parse_args()
    base=args.url.rstrip('/')+'/';out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    checks=[];errors=[];writes=[];requests=[];melon_requests=[];state={'youtube_fail':False}
    song={'provider':'apple','key':'itunes:1858796279','title':'영물이다','artist':'이오몽','aliases':['Wisp!'],'musicUrl':'https://music.apple.com/us/album/wisp/1858796278?i=1858796279','artworkUrl':'','album':'영물이다','titleStatus':'reviewed-ko'}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
        ctx=browser.new_context(viewport={'width':1440,'height':1100});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        def intercept(route):
            req=route.request;u=urlsplit(req.url)
            if (u.hostname or '')=='melon.com' or (u.hostname or '').endswith('.melon.com'):
                melon_requests.append(u.path);return route.abort()
            if req.method not in ('GET','HEAD','OPTIONS'):
                writes.append({'method':req.method,'path':u.path});return route.abort()
            if u.path.endswith('/api/songbook-platform-search.php'):
                params=parse_qs(u.query);provider=params.get('provider',[''])[0];q=params.get('q',[''])[0];requests.append({'provider':provider,'is_url':q.startswith('https://')})
                if not args.live:
                    if provider=='apple':data={'provider':'apple','state':'ok','songs':[song]}
                    elif provider=='youtube':
                        if state['youtube_fail']:return route.fulfill(status=502,content_type='application/json',body='{"error":"video_unavailable"}')
                        data={'provider':'youtube','state':'ok','songs':[{'title':'검증용 영상 제목 · 영물이다','artist':'do not use','channel':'검증용 업로드 채널','videoUrl':'https://www.youtube.com/watch?v=abcdefghijk&t=62'}]} if q.startswith('https://') else {'provider':'youtube','state':'setup_required','songs':[]}
                    # MELON_PAUSED: else:data={'provider':'melon','state':'external_only','songs':[]}
                    else:raise AssertionError('An inactive provider was requested')
                    return route.fulfill(status=200,content_type='application/json',body=json.dumps(data,ensure_ascii=False))
            if not args.live and u.netloc!=urlsplit(base).netloc:return route.abort()
            return route.continue_()
        ctx.route('**/*',intercept)
        def open_editor():
            page.get_by_role('button',name='노래 추가 검토하기',exact=True).click();expect(page.get_by_role('dialog')).to_be_visible()
            return page.get_by_role('dialog')
        def artist_field(dialog):return dialog.locator('.sb2-form-grid label').filter(has_text='가수·작품').locator('input')
        def save(dialog,title):
            dialog.get_by_label('곡명',exact=True).fill(title)
            dialog.get_by_role('checkbox',name='기타',exact=True).check()
            dialog.get_by_role('button',name=re.compile('^(노래책에 추가|변경사항 저장)$')).click();expect(page.get_by_role('dialog')).to_have_count(0)
        def capture(target,name):
            for w in (1440,390):
                page.set_viewport_size({'width':w,'height':1100});target.scroll_into_view_if_needed()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                page.screenshot(path=str(out/f'{name}-{w}.png'))
        try:
            response=page.goto(base+'songbook/',wait_until='domcontentloaded');assert response.status==200
            expect(page.get_by_role('heading',name='노래 추가, 플랫폼별로.')).to_be_visible(timeout=20000)
            expect(page.locator('meta[name=robots]')).to_have_attribute('content','noindex, nofollow')
            assert '4차 검토안' not in page.locator('body').inner_text();checks.append('isolated platform preview route, noindex and correct review label')
            capture(page.locator('.sp-preview-hero'),'two-platform-home')
            dialog=open_editor();dialog.get_by_label('추가할 곡 검색',exact=True).fill('영물이다');dialog.get_by_role('button',name='플랫폼 검색',exact=True).click()
            apple=dialog.locator('[data-provider=apple]');youtube=dialog.locator('[data-provider=youtube]')
            expect(apple.locator('.sp-result').first).to_be_visible(timeout=35000)
            expect(youtube).to_contain_text('키워드 검색 API 연결 전',timeout=25000)
            expect(dialog.locator('.sp-tabs button')).to_have_count(3)
            expect(dialog.locator('[data-provider=melon]')).to_have_count(0)
            expect(dialog.get_by_role('button',name='Melon',exact=True)).to_have_count(0)
            assert not re.search(r'Melon|멜론',dialog.inner_text(),re.I)
            expect(apple).to_contain_text('영물이다');capture(apple,'platform-results')
            checks.append('Apple and YouTube remain separated; Melon tabs, panel, labels and links are absent')
            apple.get_by_role('button',name='곡 정보 가져오기',exact=True).first.click()
            expect(dialog.get_by_label('곡명',exact=True)).to_have_value('영물이다');expect(artist_field(dialog)).to_have_value('이오몽')
            dialog.get_by_role('button',name='YouTube',exact=True).click()
            url='https://www.youtube.com/watch?v=Rdo8-3kt_JE' if args.live else 'https://youtu.be/abcdefghijk?t=1m2s'
            dialog.get_by_label('확인한 YouTube 영상 주소',exact=True).fill(url);dialog.get_by_role('button',name='영상 주소로 가져오기',exact=True).click()
            expect(youtube.locator('.sp-result').first).to_be_visible(timeout=35000);capture(youtube,'youtube-url-result')
            video_title=youtube.locator('.sp-result-copy>strong').first.inner_text()
            youtube.get_by_role('button',name='영상 정보 가져오기',exact=True).first.click()
            expect(dialog.get_by_label('곡명',exact=True)).to_have_value('영물이다');expect(artist_field(dialog)).to_have_value('이오몽')
            expect(dialog.locator('form.sb2-form textarea')).to_have_value(re.compile('youtube[.]com'))
            save(dialog,'검토용 음원·영상 연결');checks.append('select Apple metadata then append YouTube video without overwriting song title or artist')
            dialog=open_editor();dialog.get_by_role('button',name='YouTube',exact=True).click();dialog.get_by_label('확인한 YouTube 영상 주소',exact=True).fill(url);dialog.get_by_role('button',name='영상 주소로 가져오기',exact=True).click()
            youtube=dialog.locator('[data-provider=youtube]');expect(youtube.locator('.sp-result').first).to_be_visible(timeout=35000)
            youtube.get_by_role('button',name='영상 정보 가져오기',exact=True).first.click();expect(dialog.get_by_label('곡명',exact=True)).to_have_value(video_title)
            expect(artist_field(dialog)).to_have_value('');expect(artist_field(dialog)).not_to_have_attribute('required','')
            capture(dialog.locator('.sp-import-notice'),'unknown-artist-import');save(dialog,'검토용 가수 미확인 곡')
            page.reload(wait_until='domcontentloaded');expect(page.locator('.sp-saved-song')).to_have_count(2);expect(page.locator('.sp-saved-song').first).to_contain_text('가수 미확인')
            page.locator('.sp-saved-song').first.get_by_role('button',name='검토곡 수정',exact=True).click();dialog=page.get_by_role('dialog');expect(artist_field(dialog)).to_have_value('');dialog.get_by_role('button',name='창 닫기',exact=True).click()
            checks.append('video-first import leaves artist empty; local save and reload preserve the empty value without fake artist names')
            # MELON_PAUSED: original manual-import scenario retained for restoration.
            # dialog=open_editor();dialog.get_by_role('button',name='Melon',exact=True).click();melon=dialog.locator('[data-provider=melon]')
            # expect(melon.get_by_role('link',name='멜론에서 곡 검색 ↗')).to_have_attribute('target','_blank');expect(melon).to_contain_text('자동 수집하지 않습니다')
            # melon.get_by_label('멜론에서 확인한 곡명',exact=True).fill('직접 확인한 검토곡');melon.get_by_label('멜론에서 확인한 가수 · 선택',exact=True).fill('검토 가수');melon.get_by_role('button',name='직접 입력한 내용 적용',exact=True).click()
            # expect(dialog.get_by_label('곡명',exact=True)).to_have_value('직접 확인한 검토곡');expect(artist_field(dialog)).to_have_value('검토 가수');capture(melon,'melon-manual');save(dialog,'직접 확인한 검토곡')
            # checks.append('Melon external link and explicitly manual entry work without fake API results or site scraping')
            assert not re.search(r'Melon|멜론',page.locator('body').inner_text(),re.I)
            expect(page.locator('.sp-capabilities article')).to_have_count(2)
            expect(page.locator('a[href*="melon.com"]')).to_have_count(0)
            page.goto(base+'songbook/review/',wait_until='domcontentloaded')
            expect(page.get_by_role('heading',name='구현 범위와 확인 방법')).to_be_visible(timeout=20000)
            assert not re.search(r'Melon|멜론',page.locator('body').inner_text(),re.I)
            capture(page.locator('.sp-review-notes'),'active-platform-notes')
            page.goto(base+'songbook/',wait_until='domcontentloaded')
            expect(page.get_by_role('heading',name='노래 추가, 플랫폼별로.')).to_be_visible(timeout=20000)
            checks.append('landing page and review notes show only two platforms; prior local drafts are preserved')
            if not args.live:
                state['youtube_fail']=True;dialog=open_editor();dialog.get_by_label('추가할 곡 검색',exact=True).fill('검증 실패');dialog.get_by_role('button',name='플랫폼 검색',exact=True).click()
                expect(dialog.locator('[data-provider=youtube]').get_by_role('alert')).to_be_visible();expect(dialog.locator('[data-provider=apple] .sp-result')).to_have_count(1)
                dialog.get_by_label('추가할 곡 검색',exact=True).fill('바뀐 검색어');expect(dialog.locator('.sp-result')).to_have_count(0)
                dialog.get_by_role('button',name='창 닫기',exact=True).click();checks.append('one provider failure does not erase successful results; changing the query clears stale results')
            for w in (1440,1024,768,390):
                page.set_viewport_size({'width':w,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            checks.append('desktop/tablet/mobile review layouts fit without horizontal overflow')
            if args.live:
                disabled=page.request.get(base+'api/songbook-platform-search.php?provider=melon&q=test',timeout=15000)
                assert disabled.status==400 and disabled.json()=={'error':'query'}
                checks.append('disabled Melon provider is rejected by the real preview API before external lookup')
            assert not errors and not writes and not melon_requests
            assert not any(r['provider']=='melon' for r in requests)
            checks.append('no JavaScript errors, auth/data mutations or automated Melon requests')
            (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'mutation_requests':writes,'platform_requests':requests,'melon_requests':melon_requests,'live_api':args.live,'youtube_title':video_title},ensure_ascii=False,indent=2))
        except Exception:
            (out/'error.txt').write_text(traceback.format_exc());(out/'failure.txt').write_text(page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'));raise
        finally:browser.close()
    print('PASS:',len(checks),'platform discovery groups', 'live' if args.live else 'isolated')
if __name__=='__main__':main()
