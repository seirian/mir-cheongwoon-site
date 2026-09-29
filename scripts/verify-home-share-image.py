"""Read-only raw HTTP verification: a crawler need not execute JavaScript."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import struct
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            name = attrs.get('property') or attrs.get('name')
            self.meta.setdefault(name, []).append(attrs.get('content'))


def get(url):
    if urlsplit(url).scheme != 'https' or urlsplit(url).hostname != 'mir.yeop.net':
        raise ValueError('Only public mir.yeop.net resources may be fetched')
    req = Request(url, headers={'User-Agent': 'MirShareVerification/1.0', 'Cache-Control': 'no-cache'})
    with urlopen(req, timeout=30) as response:
        if urlsplit(response.url).hostname != 'mir.yeop.net' or response.status != 200:
            raise RuntimeError('Unexpected response or redirect')
        return response.read(5_000_001), response.headers.get_content_type()


def verify(expected_sha, capture_report, output):
    expected = json.loads(Path(capture_report).read_text())
    checks = []
    for path in ['/', '/?share=' + expected_sha[:8], '/schedule', '/history/blued-2025']:
        raw, content_type = get('https://mir.yeop.net' + path)
        assert content_type == 'text/html'
        head = Head()
        head.feed(raw.decode('utf-8'))
        meta = head.meta
        assert len(meta.get('og:image', [])) == len(meta.get('twitter:image', [])) == 1
        release = meta.get('yeop-release', [''])[0]
        assert re.fullmatch(r'r[0-9]{14}_' + re.escape(expected_sha[:8]), release), release
        image = meta['og:image'][0]
        assert image == meta['twitter:image'][0]
        assert image.startswith('https://mir.yeop.net/_yeop_releases/' + release + '/og/')
        assert meta.get('og:image:width') == ['1200'] and meta.get('og:image:height') == ['630']
        assert meta.get('robots') == ['index, follow']
        png, mime = get(image)
        assert mime == 'image/png' and png[:8] == b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('!II', png[16:24]) == (1200, 630)
        digest = hashlib.sha256(png).hexdigest()
        if path == '/history/blued-2025':
            assert image.endswith('/og/blued.png')
        else:
            assert image == expected['image_url'] and digest == expected['sha256']
        checks.append({'path': path, 'release': release, 'image': image, 'sha256': digest, 'passed': True})
    Path(output).write_text(json.dumps({'status': 'verified', 'checks': checks}, indent=2), encoding='utf-8')
    print(json.dumps({'verified_raw_html_routes': len(checks), 'status': 'verified'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-sha', required=True)
    parser.add_argument('--capture-report', default='share-image-report/report.json')
    parser.add_argument('--out', default='share-image-report/live-verification.json')
    args = parser.parse_args()
    verify(args.expected_sha, args.capture_report, args.out)
