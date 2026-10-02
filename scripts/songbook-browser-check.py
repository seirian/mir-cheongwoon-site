#!/usr/bin/env python3
"""Read-only songbook regression checks for local and staged releases."""
import argparse
import csv
import io
import json
from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--out', default='songbook-browser-report')
args = parser.parse_args()
base = args.url.rstrip('/') + '/'
url = base + 'songbook/'
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
data = json.loads(Path('src/data/songbookData.json').read_text(encoding='utf-8'))
checks, errors, writes = [], [], []
with sync_playwright() as p:
    executable = shutil.which('google-chrome') or shutil.which('chromium')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
    context = browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True, permissions=['clipboard-read','clipboard-write'], reduced_motion='reduce')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    def track(request):
        host = urlsplit(request.url).hostname or ''
        if request.method not in ('GET','HEAD','OPTIONS') and (host.endswith('.supabase.co') or host == urlsplit(base).hostname):
            writes.append({'method':request.method,'url':request.url.split('?')[0]})
    page.on('request', track)
    def go(suffix=''):
        response = page.goto(url + suffix, wait_until='domcontentloaded', timeout=45000)
        assert response and response.status == 200
        expect(page.locator('.songbook-page')).to_be_visible(timeout=20000)
    def search(query):
        page.get_by_role('searchbox', name='곡명, 가수, 초성 검색').fill(query)
        page.get_by_role('button', name='검색', exact=True).click()
    try:
        go()
        expect(page.locator('.sb-song')).to_have_count(24)
        expect(page.locator('meta[name="robots"]')).to_have_attribute('content','noindex, nofollow')
        expect(page.locator('.sb-result-bar strong')).to_have_text(str(len(data['songs'])) + '곡')
        expect(page.locator('.main-nav').get_by_role('link', name='노래책', exact=True)).to_be_visible()
        checks.append('route, lazy load, count, navigation and noindex')
        search('프리텐더')
        expect(page.locator('.sb-song')).to_have_count(1)
        expect(page.locator('.sb-song-title strong')).to_have_text('Pretender')
        search('ㄴㄴ')
        expect(page.locator('.sb-song').first).to_be_visible()
        search('NO_SUCH_SONG_8c1714')
        expect(page.get_by_role('heading', name='조건에 맞는 노래가 없어요')).to_be_visible()
        page.get_by_role('button', name='전체 노래 보기', exact=True).click()
        expect(page.locator('.sb-song')).to_have_count(24)
        checks.append('initials, aliases, empty state and reset')
        page.get_by_role('combobox', name='출처', exact=True).select_option('gurmir')
        count = sum(any(s['id']=='gurmir' for s in song['sources']) for song in data['songs'])
        expect(page.locator('.sb-result-bar strong')).to_have_text(str(count)+'곡')
        page.get_by_role('combobox', name='분류', exact=True).select_option('성악')
        expect(page.locator('.sb-song')).to_have_count(2)
        page.get_by_role('button', name='초기화', exact=True).click()
        page.get_by_role('combobox', name='신청 상태', exact=True).select_option('available')
        expect(page.locator('.sb-result-bar strong')).to_have_text('0곡')
        page.get_by_role('button', name='전체 노래 보기', exact=True).click()
        checks.append('combined filters and unapproved request empty state')
        page.get_by_role('combobox', name='정렬', exact=True).select_option('artist')
        page.get_by_role('button', name='다음 페이지', exact=True).click()
        expect(page.locator('.sb-pagination strong')).to_have_text('2')
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('.sb-pagination strong')).to_have_text('2')
        expect(page.get_by_role('combobox', name='정렬', exact=True)).to_have_value('artist')
        checks.append('sort and pagination survive reload')
        go()
        first = page.locator('.sb-song').first
        song_id = first.get_attribute('data-song-id')
        first.locator('button[aria-pressed]').click()
        page.reload(wait_until='domcontentloaded')
        page.locator('.sb-tabs').get_by_role('button', name=re.compile('즐겨찾기')).click()
        expect(page.locator('.sb-song')).to_have_count(1)
        assert page.locator('.sb-song').first.get_attribute('data-song-id') == song_id
        page.locator('.sb-song button[aria-pressed]').click()
        expect(page.locator('.sb-empty')).to_be_visible()
        checks.append('browser-only favorites persist and can be removed')
        go('?song='+song_id)
        expect(page.get_by_role('dialog')).to_be_visible()
        page.reload(wait_until='domcontentloaded')
        expect(page.get_by_role('dialog')).to_be_visible()
        for _ in range(12):
            page.keyboard.press('Tab')
            assert page.evaluate('Boolean(document.activeElement.closest("dialog"))')
        page.get_by_role('dialog').get_by_role('button', name='곡 정보 복사', exact=True).click()
        song = next(s for s in data['songs'] if s['id']==song_id)
        page.wait_for_function('expected => navigator.clipboard.readText().then(text => text === expected)', arg=song['artist']+' - '+song['title'])
        page.screenshot(path=str(out/'song-detail-desktop.png'))
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).to_have_count(0)
        checks.append('deep link, modal focus trap, Escape and clipboard')
        go()
        page.evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new Error("blocked")}}})')
        page.locator('.sb-song .sb-copy').first.click()
        expect(page.locator('.sb-manual-copy textarea')).to_be_visible()
        page.get_by_role('button', name='곡 상세 닫기', exact=True).click()
        checks.append('manual-copy fallback when clipboard is denied')
        go()
        with page.expect_download() as download:
            page.get_by_role('button', name='목록 내보내기', exact=True).click()
        content = Path(download.value.path()).read_text(encoding='utf-8-sig')
        assert len(list(csv.reader(io.StringIO(content)))) == len(data['songs'])+1
        checks.append('CSV includes all matching rows, not just current page')
        for width in (1440,1024,768,390):
            page.set_viewport_size({'width':width,'height':1000 if width>680 else 844})
            go()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'Overflow at {width}'
            page.screenshot(path=str(out/f'songbook-{width}.png'), full_page=True)
        if page.get_by_role('button', name='메뉴 열기', exact=True).is_visible():
            page.get_by_role('button', name='메뉴 열기', exact=True).click()
            expect(page.locator('.main-nav').get_by_role('link', name='노래책', exact=True)).to_be_visible()
            page.keyboard.press('Escape')
        checks.append('1440/1024/768/390 layouts and mobile navigation')
        for width in (1440,390):
            page.set_viewport_size({'width':width,'height':1000 if width>680 else 844})
            response = page.goto(base+'songbook/review/', wait_until='domcontentloaded', timeout=45000)
            assert response and response.status == 200
            expect(page.get_by_role('heading', name='노래책 1차 검토실')).to_be_visible(timeout=20000)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            expect(page.locator('meta[name="robots"]')).to_have_attribute('content','noindex, nofollow')
            page.screenshot(path=str(out/f'review-{width}.png'), full_page=True)
        with page.expect_download() as download:
            page.get_by_role('button', name='출처 포함 JSON', exact=True).click()
        exported = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
        assert len(exported['songs']) == len(data['songs']) and len(exported['cafeFindings']['findings']) == 7
        page.get_by_role('checkbox').first.check()
        checks.append('review routes, cafe candidates, checklist and JSON export')
        assert not errors, errors
        assert not writes, writes
        checks.append('no JavaScript exceptions or server mutations')
        report = {'status':'passed','base':base,'checks':checks,'javascriptErrors':errors,'serverWrites':writes}
    except Exception as error:
        page.screenshot(path=str(out/'failure.png'), full_page=True)
        report = {'status':'failed','base':base,'checks':checks,'error':str(error),'javascriptErrors':errors,'serverWrites':writes}
        (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        raise
    finally:
        browser.close()
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
