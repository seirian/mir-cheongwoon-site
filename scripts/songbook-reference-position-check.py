#!/usr/bin/env python3
"""Real TimelinePanel with an in-memory fixture; never use live auth or data."""
import argparse, json, shutil, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--fixture', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
checks, errors = [], []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'), args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width':1440, 'height':1000})
    ctx.route('**/*', lambda route: route.abort())
    page = ctx.new_page()
    def fresh():
        global page, panel
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(Path(args.fixture).read_text(), wait_until='domcontentloaded')
        panel = page.locator('.sb-auto-admin')
        expect(panel).to_be_visible()
        panel.locator('summary').click()
        expect(panel.locator('.sb-auto-candidate')).to_have_count(8)
    def control(name):
        page.get_by_role('button', name=name, exact=True).evaluate('(e)=>e.click()')
    def open_row(cid):
        row = panel.locator(f'[data-candidate-id="{cid}"]')
        expect(row).to_be_visible()
        row.get_by_role('button', name='정보 확인·연결', exact=True).click()
        expect(row.locator('.sb-candidate-position')).to_be_visible()
        return row
    try:
        fresh()
        row = open_row('1')
        field = row.get_by_label('VOD에서 노래 시작 위치', exact=True)
        expect(field).to_have_value('00:02:00')
        expect(row.locator('.sb-candidate-position')).to_have_attribute('data-position-kind', 'collected')
        expect(row.locator('.sb-position-origin')).to_contain_text('자동 입력했습니다')
        expect(row.locator('.sb-position-reference')).to_have_count(0)
        field.fill('01:12:30')
        row.get_by_label('기존 곡 찾기', exact=True).fill('수정한 검색어')
        expect(field).to_have_value('01:12:30')
        assert page.evaluate('window.reviewRequests.length') == 0
        checks.append('collected per-song offset still prefills automatically and search does not rewrite the draft')

        control('곡 연결 테스트 목록')
        row = open_row('2')
        field = row.get_by_label('VOD에서 노래 시작 위치', exact=True)
        reference = row.get_by_role('note', name='수집된 참고 위치 안내', exact=True)
        link = reference.get_by_role('link', name='참고 위치에서 VOD 확인 ↗', exact=True)
        expect(field).to_have_value('')
        expect(reference).to_contain_text('수집된 참고 위치: 00:02:01')
        expect(reference).to_contain_text('곡별 시작점 미확인')
        expect(reference).to_contain_text('입력칸을 비워 두었습니다')
        expect(link).to_have_attribute('href', 'https://vod.sooplive.com/player/208123456?change_second=121')
        expect(link).to_have_attribute('target', '_blank')
        expect(link).to_have_attribute('rel', 'noopener noreferrer')
        expect(row.get_by_role('link', name='입력한 위치에서 VOD 확인 ↗', exact=True)).to_have_count(0)
        row.get_by_role('button', name='가창 확인 후 반영', exact=True).click()
        expect(field).to_have_attribute('aria-invalid', 'true')
        assert page.evaluate('window.reviewRequests.length') == 0
        checks.append('section offset is shown as a reference while blank approval stays blocked and no false per-song link is generated')

        for width in [1440, 1024, 768, 390]:
            page.set_viewport_size({'width':width, 'height':1000})
            row.locator('.sb-candidate-position').scroll_into_view_if_needed()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(out/f'section-reference-{width}.png'))
        checks.append('reference explanation, link and blank input fit four desktop/mobile widths')

        field.fill('03:20')
        row.get_by_label('기존 곡 찾기', exact=True).fill('영물이다')
        results = row.get_by_role('listbox', name='연결할 곡', exact=True)
        results.select_option('wisp')
        preview = row.get_by_role('link', name='입력한 위치에서 VOD 확인 ↗', exact=True)
        expect(preview).to_have_attribute('href', 'https://vod.sooplive.com/player/208123456?change_second=200')
        expect(link).to_have_attribute('href', 'https://vod.sooplive.com/player/208123456?change_second=121')
        expect(reference).to_contain_text('00:02:01')
        link.evaluate("e=>e.addEventListener('click',event=>{event.preventDefault();window.open('about:blank','_blank')},{once:true})")
        with page.expect_popup() as opened:
            link.click()
        opened.value.close()
        page.bring_to_front()
        control('권한 재확인 시작')
        expect(field).to_be_disabled()
        expect(panel).to_have_attribute('open', '')
        control('권한 재확인 완료')
        expect(field).to_be_enabled()
        expect(field).to_have_value('00:03:20')
        expect(results).to_have_value('wisp')
        expect(link).to_have_attribute('href', 'https://vod.sooplive.com/player/208123456?change_second=121')
        expect(preview).to_have_attribute('href', 'https://vod.sooplive.com/player/208123456?change_second=200')
        assert page.evaluate('window.reviewRequests.length') == 0
        checks.append('reference and edited previews stay distinct across a new tab and same-account revalidation without writing data')

        for width in [1440, 390]:
            page.set_viewport_size({'width':width, 'height':1000})
            row.locator('.sb-candidate-position').scroll_into_view_if_needed()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(out/f'reference-and-confirmed-draft-{width}.png'))
        row.get_by_role('button', name='가창 확인 후 반영', exact=True).click()
        expect(row).to_have_count(0)
        assert page.evaluate('window.reviewRequests.length') == 1
        payload = page.evaluate('window.reviewRequests[0]')
        assert payload['seconds'] == 200 and payload['song_id'] == 'wisp' and payload['decision'] == 'approved'
        expect(panel).to_have_attribute('open', '')
        panel.get_by_role('button', name='확인 완료', exact=True).click()
        row = open_row('2')
        expect(row.get_by_label('VOD에서 노래 시작 위치', exact=True)).to_have_value('00:03:20')
        expect(row.locator('.sb-candidate-position')).to_have_attribute('data-position-kind', 'confirmed')
        expect(row.locator('.sb-position-origin')).to_contain_text('이전에 확인해 저장한')
        expect(row.locator('.sb-position-reference')).to_have_count(0)
        checks.append('approval submits only the edited per-song seconds and reopening prefers the saved confirmed value')

        panel.get_by_role('button', name='확인 대기', exact=True).click()
        row = open_row('3')
        expect(row.get_by_label('VOD에서 노래 시작 위치', exact=True)).to_have_value('00:02:02')
        expect(row.locator('.sb-position-reference')).to_have_count(0)
        assert page.evaluate('window.reviewRequests.length') == 1
        control('권한 회수')
        expect(panel).to_have_count(0)
        checks.append('switching candidates clears old reference context and confirmed permission removal hides the whole review')

        fresh()
        row = open_row('2')
        expect(row.get_by_label('VOD에서 노래 시작 위치', exact=True)).to_have_value('')
        expect(row.locator('.sb-position-reference')).to_be_visible()
        row.get_by_role('button', name='제외', exact=True).click()
        expect(row).to_have_count(0)
        expect(panel).to_have_attribute('open', '')
        expect(panel.locator('.sb-auto-notice')).to_contain_text('삭제했습니다')
        payload = page.evaluate('window.reviewRequests[0]')
        assert payload['decision'] == 'rejected' and 'seconds' not in payload
        checks.append('a reference-only item may still be excluded with no confirmed timestamp, keeping the panel and success notice')
        assert not errors
        (out/'report.json').write_text(json.dumps({'checks':checks,'javascript_errors':errors,'external_requests_allowed':0,'live_writes':0},ensure_ascii=False,indent=2)+'\n')
    except Exception:
        (out/'error.txt').write_text(traceback.format_exc())
        (out/'failure.txt').write_text(page.locator('body').inner_text())
        page.screenshot(path=str(out/'failure.png'))
        raise
    finally:
        browser.close()
print('PASS:', len(checks), 'reference-position UI groups')
