#!/usr/bin/env python3
"""Verify the approved cover view on the active site; block all server mutations."""
import argparse
import json
import re
import shutil
import traceback
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--sha', required=True)
args = parser.parse_args()
if not re.fullmatch(r'[a-f0-9]{40}', args.sha):
    raise SystemExit('A full deployment commit SHA is required')
origin = 'https://mir.yeop.net'
out = Path('songbook-live-production/cover-layout')
out.mkdir(parents=True, exist_ok=True)
checks, errors, writes, snapshot_requests = [], [], [], []
release = None
with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=shutil.which('google-chrome') or shutil.which('chromium'),
        args=['--no-sandbox'],
    )
    context = browser.new_context(viewport={'width': 1440, 'height': 1050})
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))

    def guard(route):
        request = route.request
        path = urlsplit(request.url).path
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            writes.append({'method': request.method, 'path': path})
            return route.abort()
        if 'songbook-cover-snapshot.json' in path or 'songbook_preview' in path:
            snapshot_requests.append(path)
            return route.abort()
        return route.continue_()

    context.route('**/*', guard)

    def ready():
        expect(page.locator('.ck-library')).to_have_attribute('aria-busy', 'false', timeout=30000)
        expect(page.locator('.sb2-error')).to_have_count(0)
        expect(page.locator('.sg-preview-banner,.sg-preview-header')).to_have_count(0)
        expect(page.locator('.sg-card-select,.ck-song-select,.ck-bulk-toolbar')).to_have_count(0)
        marker = page.locator('meta[name=yeop-release]').get_attribute('content')
        assert marker and marker.endswith('_' + args.sha[:8]), 'Unexpected active release'
        return marker

    def go(**params):
        page.goto(origin + '/songbook/' + ('?' + urlencode(params) if params else ''), wait_until='domcontentloaded')
        return ready()

    def ids():
        return page.locator('#songbook-results>[data-song-id]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.songId)')

    def expect_ids(expected):
        page.wait_for_function(
            '(expected)=>JSON.stringify(Array.from(document.querySelectorAll("#songbook-results>[data-song-id]"),n=>n.dataset.songId))===JSON.stringify(expected)',
            arg=expected, timeout=30000,
        )

    def toggle(layout):
        page.get_by_role('group', name='노래책 보기 방식').get_by_role(
            'button', name='커버형' if layout == 'cover' else '목록형', exact=True,
        ).click()
        expect(page.locator('#songbook-results')).to_have_attribute('data-layout', layout)

    def expect_page(number, pages):
        expect(page.locator('.ck-pagination>span')).to_have_text(f'{number} / {pages}')

    try:
        release = go()
        total = int(page.locator('.ck-result-bar p strong').inner_text())
        assert total > 0, 'Public catalog is unexpectedly empty'
        length = page.get_by_label('페이지당 곡 수', exact=True)
        expect(page.locator('#songbook-results')).to_have_attribute('data-layout', 'list')
        expect(page.locator('.ck-song')).to_have_count(min(25, total))
        expect(length).to_have_value('25')
        expect(length.locator('option')).to_have_text(['10곡씩', '25곡씩', '50곡씩', '100곡씩'])
        initial = ids()
        first = page.locator('.ck-song').first
        first_title = first.locator('.sb2-title').inner_text()
        first_categories = first.locator('.ck-song-categories [role=listitem]').all_text_contents()
        checks.append('active production defaults to list25 with original list options and no preview or anonymous editing controls')

        # Only this fresh test browser changes preferences; no account or server state is touched.
        page.evaluate("localStorage.setItem('mir-songbook-cover-preview-layout-v1','list')")
        toggle('cover')
        expect(length).to_have_value('24')
        expect(length.locator('option')).to_have_text(['24곡씩', '48곡씩', '96곡씩'])
        expect_ids(initial[:24])
        expect(page.locator('.sg-cover-hint')).to_have_count(0)
        expect(page.get_by_text('커버나 곡명을 누르면 신청 문구·연결 영상·미르 숙련도를 확인할 수 있습니다.', exact=True)).to_have_count(0)
        card = page.locator('.sg-cover-card').first
        expect(card.locator('.sg-card-title')).to_have_text(first_title)
        expect(card.locator('.ck-song-categories [role=listitem]')).to_have_text(first_categories)
        expect(card.locator('.sg-card-artist,.sg-card-difficulty')).to_have_count(2)
        card.locator('.sg-art-button').click()
        dialog = page.get_by_role('dialog')
        expect(dialog).to_be_visible()
        expect(dialog.locator('h2')).to_have_text(first_title)
        expect(dialog.get_by_role('button', name='곡 링크 복사', exact=True)).to_be_visible()
        for link in dialog.locator('.ck-video').all():
            expect(link).to_have_attribute('target', '_blank')
            assert 'noopener' in (link.get_attribute('rel') or '')
        page.keyboard.press('Escape')
        expect(dialog).to_have_count(0)
        checks.append('cover defaults24 from the same songs; all categories and difficulty retained, removed hint absent and cover detail works')

        for size in (24, 48, 96):
            length.select_option(str(size))
            pages = max(1, (total + size - 1) // size)
            expect_page(1, pages)
            expect(page.locator('.sg-cover-card')).to_have_count(min(size, total))
            first_page = ids()
            if pages > 1:
                page.get_by_role('button', name='다음 페이지', exact=True).click()
                expect_page(2, pages)
                expect(page.locator('.sg-cover-card')).to_have_count(min(size, total - size))
                second_page = ids()
                assert not set(first_page).intersection(second_page), 'Repeated songs across pages'
                page.reload(wait_until='domcontentloaded')
                ready()
                expect_page(2, pages)
                expect(length).to_have_value(str(size))
                expect_ids(second_page)
                page.get_by_role('button', name='이전 페이지', exact=True).click()
                expect_page(1, pages)
                expect_ids(first_page)
        toggle('list')
        expect(length).to_have_value('25')
        expect_ids(initial)
        checks.append('24/48/96 each paginate without overlap and survive reload; returning to list resets only length/page to25/1')

        query = {'layout': 'list', 'q': first_title, 'sort': 'artist'}
        if first_categories:
            query['category'] = first_categories[0]
        go(**query)
        filtered = ids()
        assert filtered, 'Known song search returned no results'
        toggle('cover')
        expect_ids(filtered[:24])
        params = parse_qs(urlsplit(page.url).query)
        assert params['q'] == [first_title] and params['sort'] == ['artist']
        if first_categories:
            assert params['category'] == [first_categories[0]]
        go(layout='cover', perPage='25')
        expect(length).to_have_value('24')
        go(layout='list', perPage='48')
        expect(length).to_have_value('25')
        go(layout='cover', perPage='96', q='__deployment_no_match_04c7__')
        expect(page.locator('.sg-cover-card')).to_have_count(0)
        expect_page(1, 1)
        checks.append('title/category/sort filters survive layout changes; invalid lengths and empty results stay bounded')

        go(layout='list')
        toggle('cover')
        go()
        expect(page.locator('#songbook-results')).to_have_attribute('data-layout', 'cover')
        assert page.evaluate("localStorage.getItem('mir-songbook-layout-v1')") == 'cover'
        assert page.evaluate("localStorage.getItem('mir-songbook-cover-preview-layout-v1')") == 'list'
        go(layout='list')
        expect(page.locator('#songbook-results')).to_have_attribute('data-layout', 'list')
        checks.append('production preference persists in its own key; explicit list URL wins and preview preference is not imported')

        go(layout='cover')
        dimensions = []
        for width in (320, 390, 768, 1024, 1440, 1920):
            page.set_viewport_size({'width': width, 'height': 1050})
            page.locator('.sg-display-controls').scroll_into_view_if_needed()
            page.wait_for_timeout(250)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), width
            grid = page.locator('.sg-cover-grid')
            columns = grid.evaluate('(e)=>getComputedStyle(e).gridTemplateColumns.split(" ").length')
            expected_columns = 6 if width >= 1024 else 4 if width > 620 else 2
            assert columns == expected_columns, (width, columns)
            row_count = grid.locator('.sg-cover-card').evaluate_all('(nodes)=>new Set(nodes.map(n=>Math.round(n.getBoundingClientRect().top))).size')
            assert row_count == (min(total, 24) + columns - 1) // columns, (width, row_count)
            for cover in grid.locator('.sg-cover-art').all():
                box = cover.bounding_box()
                assert abs(box['width'] - box['height']) < 2, (width, box)
            dimensions.append({'width': width, 'columns': columns, 'rows': row_count})
            if width in (390, 1440):
                # Scroll to lazy images instead of fabricating artwork or changing page styles.
                for index in range(0, min(total, 24), columns):
                    grid.locator('.sg-cover-card').nth(index).scroll_into_view_if_needed()
                    page.wait_for_timeout(150)
                page.locator('.sg-display-controls').scroll_into_view_if_needed()
                page.wait_for_timeout(500)
                page.screenshot(path=str(out / f'cover-{width}.png'))
                if width == 1440:
                    page.screenshot(path=str(out / 'cover-24-desktop-full.png'), full_page=True)
        go(layout='list')
        page.set_viewport_size({'width': 1440, 'height': 1050})
        page.locator('.sg-display-controls').scroll_into_view_if_needed()
        page.screenshot(path=str(out / 'list-1440.png'))
        checks.append('actual production CSS has six desktop columns/four rows for24, four tablet and two mobile columns with square covers and no overflow')
        assert not errors and not writes and not snapshot_requests, (errors, writes, snapshot_requests)
        report = {'source_sha': args.sha, 'release': release, 'checks': checks,
                  'public_song_count': total, 'dimensions': dimensions,
                  'javascript_errors': errors, 'writes': writes, 'snapshot_requests': snapshot_requests}
        (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    except Exception:
        (out / 'failure.txt').write_text(traceback.format_exc(), encoding='utf-8')
        (out / 'failure-requests.json').write_text(json.dumps({'writes': writes, 'snapshot_requests': snapshot_requests, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
        page.screenshot(path=str(out / 'failure.png'))
        raise
    finally:
        browser.close()
print('PASS:', len(checks), 'read-only production cover checks')
