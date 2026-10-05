#!/usr/bin/env python3
"""Render real public VOD components offline; no login or production data writes."""
import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BUILD = r"""
import {build} from 'esbuild';
const source = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {VodLinks} from './src/components/songbook/SongMedia.jsx';
import './src/styles.css';
import './src/songbook.css';
import './src/songbook-v2.css';
import './src/songbook-v3.css';
const urls = Object.freeze([
 'https://vod.sooplive.com/player/987?change_second=4350',
 'https://youtu.be/abcdefghijk?t=1m2s',
 'https://vod.afreecatv.com/player/123?change_second=200',
 'https://www.youtube.com/live/lmnopqrstuv?t=90',
 'https://www.youtube.com/watch?v=abcdefghijk&t=62',
 'invalid-video'
]);
createRoot(document.getElementById('root')).render(
 <main className="songbook-page sb2-page"><section className="section-wrap sb-library">
 <h1>노래책 영상 순서</h1><p>표시 순서 확인용 테스트 화면</p>
 <h2>곡 목록</h2><div className="sb2-title-line" data-testid="compact"><strong>영상 순서 확인곡</strong><VodLinks urls={urls} title="영상 순서 확인곡"/></div>
 <h2>곡 상세 · 연결 영상</h2><div data-testid="detailed"><VodLinks urls={urls} title="영상 순서 확인곡" detailed/></div>
 <h2>영상이 하나인 곡</h2><div data-testid="youtube-only"><VodLinks urls={[urls[1]]} title="YouTube 단일 영상"/></div>
 <div data-testid="soop-only"><VodLinks urls={[urls[0]]} title="SOOP 단일 영상"/></div>
 <div data-testid="empty"><VodLinks urls={[]} title="영상 없음"/></div>
 </section></main>
);
`;
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'video-order-fixture',jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"production"'},loader:{'.png':'dataurl','.jpg':'dataurl','.svg':'dataurl','.woff2':'dataurl'}});
console.log(JSON.stringify({js:result.outputFiles.find(f=>f.path.endsWith('.js')).text,css:result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||''}));
"""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    bundle = json.loads(subprocess.run(['node', '--input-type=module'], input=BUILD, text=True, capture_output=True, check=True, timeout=60).stdout)
    html = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + bundle['css'] + '\nbody{margin:0}.sb-library{padding:24px}h2{margin-top:32px}</style><div id="root"></div><script>' + bundle['js'].replace('</script', '<\\/script') + '</script></html>'
    expected = ['https://www.youtube.com/watch?v=abcdefghijk&t=62', 'https://www.youtube.com/watch?v=lmnopqrstuv&t=90', 'https://vod.sooplive.com/player/987?change_second=4350', 'https://vod.afreecatv.com/player/123?change_second=200']
    checks, errors = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'), args=['--no-sandbox'])
        ctx = browser.new_context(viewport={'width':1440, 'height':1000})
        ctx.route('**/*', lambda route: route.abort())
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        try:
            page.set_content(html, wait_until='domcontentloaded')
            for mode in ['compact', 'detailed']:
                links = page.get_by_test_id(mode).locator('a.sb3-vod')
                expect(links).to_have_count(4)
                assert links.evaluate_all('(nodes)=>nodes.map(n=>n.href)') == expected
                for i, platform in enumerate(['youtube', 'youtube', 'soop', 'soop']):
                    expect(links.nth(i)).to_have_class(re.compile('is-' + platform))
                    expect(links.nth(i)).to_have_attribute('target', '_blank')
                    expect(links.nth(i)).to_have_attribute('rel', 'noopener noreferrer')
                assert links.locator('small').all_text_contents() == ['1', '2', '1', '2']
            checks.append('compact and detailed links show YouTube 1/2 then SOOP 1/2 with original offsets, safe targets and deduplication')
            for mode in ['youtube-only', 'soop-only']:
                expect(page.get_by_test_id(mode).locator('a')).to_have_count(1)
                expect(page.get_by_test_id(mode).locator('small')).to_have_count(0)
            expect(page.get_by_test_id('empty').locator('a')).to_have_count(0)
            checks.append('single-platform and empty lists retain their normal labels without extra numbering')
            for width in [1440, 1024, 768, 390]:
                page.set_viewport_size({'width':width, 'height':1000})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                page.screenshot(path=str(out / f'video-order-{width}.png'))
            checks.append('1440/1024/768/390px layouts preserve platform order without horizontal overflow')
            links = page.get_by_test_id('compact').locator('a.sb3-vod')
            links.first.focus()
            for i in range(1, 4):
                page.keyboard.press('Tab')
                expect(links.nth(i)).to_be_focused()
            links.first.evaluate("e=>e.addEventListener('click',event=>{event.preventDefault();window.open('about:blank','_blank')},{once:true})")
            with page.expect_popup() as opened:
                links.first.click()
            opened.value.close()
            assert not errors
            checks.append('keyboard order matches visible platform order and VOD activation still opens a new tab')
            (out / 'report.json').write_text(json.dumps({'checks':checks, 'javascript_errors':errors, 'external_requests_allowed':0, 'live_writes':0}, ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception:
            page.screenshot(path=str(out / 'failure.png'))
            raise
        finally:
            browser.close()
    print('PASS:', len(checks), 'VOD display-order browser groups')

if __name__ == '__main__':
    main()
