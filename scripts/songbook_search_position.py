"""Shared read-only scroll regression, using the actual app and its unmodified CSS."""
from pathlib import Path
from playwright.sync_api import expect


def check_search_position(page, out, role):
    """Verify both layouts at six widths; neither scrolling nor screenshots alter data."""
    out = Path(out) / 'search-position'
    out.mkdir(parents=True, exist_ok=True)
    viewport = page.viewport_size
    original_layout = page.locator('#songbook-results').get_attribute('data-layout')
    measurements = []

    def layout(value):
        page.get_by_role('group', name='노래책 보기 방식').get_by_role(
            'button', name='목록형' if value == 'list' else '커버형', exact=True,
        ).click()
        expect(page.locator('#songbook-results')).to_have_attribute('data-layout', value)

    def scroll(top):
        page.evaluate('(top)=>window.scrollTo({top,behavior:"instant"})', top)
        # Read after two animation frames, never compare stale pre-scroll coordinates.
        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')

    try:
        for mode in ('list', 'cover'):
            layout(mode)
            for width in (320, 390, 768, 1024, 1440, 1920):
                page.set_viewport_size({'width': width, 'height': 900})
                scroll(0)
                bar = page.locator('.ck-production .ck-search-sticky')
                expect(bar).to_have_count(1)
                expect(bar).to_have_css('position', 'static')
                initial = bar.bounding_box()
                document_y = initial['y'] + page.evaluate('window.scrollY')
                target = document_y + initial['height'] + 160
                old_url = page.url
                old_query = page.get_by_role('searchbox', name='곡명, 가수, 초성 검색').input_value()
                old_ids = page.locator('#songbook-results>[data-song-id]').evaluate_all('(els)=>els.map(e=>e.dataset.songId)')
                points = []
                if width in (390, 1440):
                    page.screenshot(path=str(out / f'{role}-{mode}-{width}-before.png'))
                for top in (max(0, document_y - 24), target, target + 160, 0):
                    scroll(top)
                    box = bar.bounding_box()
                    y = page.evaluate('window.scrollY')
                    assert abs(box['y'] + y - document_y) < 2, (role, mode, width, 'search followed scroll', box, y, document_y)
                    assert abs(box['height'] - initial['height']) < 2
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    if top == target:
                        assert box['y'] + box['height'] < 0, (role, mode, width, 'search overlays scrolled songs')
                        if width in (390, 1440):
                            page.screenshot(path=str(out / f'{role}-{mode}-{width}-scrolled.png'))
                    points.append({'scroll_y': y, 'search_top': box['y'], 'search_bottom': box['y'] + box['height']})
                assert page.url == old_url
                assert page.get_by_role('searchbox', name='곡명, 가수, 초성 검색').input_value() == old_query
                assert page.locator('#songbook-results>[data-song-id]').evaluate_all('(els)=>els.map(e=>e.dataset.songId)') == old_ids
                measurements.append({'role': role, 'layout': mode, 'width': width, 'document_y': document_y, 'points': points})
    finally:
        layout(original_layout)
        page.set_viewport_size(viewport)
        scroll(0)
    return measurements
