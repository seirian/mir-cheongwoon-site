#!/usr/bin/env python3
"""Import vetted public rendered snapshots, without fetching or executing source HTML.

python scripts/import-songbook.py --input DIR --output src/data/songbookData.json
Inputs: silver.html, gurmir.html. Requires beautifulsoup4==4.13.4.
The generated dataset is committed. Site visitors never scrape external sources.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit
from bs4 import BeautifulSoup

SOURCE_NAMES = {'silver': '미르실버타운', 'gurmir': 'gurmir', 'cafe': '미리내 팬카페'}
SOURCE_URLS = {'silver': 'https://mir427.vercel.app/songs', 'gurmir': 'https://gurmir.com/songbook/', 'cafe': 'https://cafe.naver.com/alice427'}
MEDIA_HOSTS = {'www.youtube.com', 'youtube.com', 'youtu.be', 'vod.afreecatv.com', 'vod.sooplive.co.kr', 'vod.sooplive.com'}
CATEGORIES = {'일식/애니': 'J-POP · 애니', 'Jpop': 'J-POP · 애니', '뮤지컬': '뮤지컬 · 디즈니', '뮤지컬/디즈니': '뮤지컬 · 디즈니'}
# Explicitly reviewed spellings, not fuzzy matching. Artist identity must also match.
TITLE_ALIASES = {
    'About Me 어바웃 미': 'About Me', 'Cry Baby 크라이 베이비': 'Cry Baby',
    'God Knows 갓 노우즈': 'God Knows', 'MAKE ME WONDER 메이크 미 원더': 'MAKE ME WONDER',
    'Mela! 멜라': 'Mela!', 'Mixed nuts 믹스 너츠': 'Mixed nuts',
    'My Dearest 마이 디어리스트': 'My Dearest', 'My Self 마이 셀프': 'My Self',
    'New Future 뉴 퓨처': 'New Future', 'Pretender 프리텐더': 'Pretender',
    'RAY 레이': 'RAY', 'SAME BLUE 세임 블루': 'SAME BLUE',
    'Shout Baby 샤우트 베이비': 'Shout Baby', 'Stellar Stellar 스텔라 스텔라': 'Stellar Stellar',
    'Sweet Dreams My Dear 스윗 드림': 'Sweet Dreams My Dear', 'Unravel 언래블': 'Unravel',
    'Yesterday 예스터데이': 'Yesterday', '칠드런 레코드': '칠드런 레코드 (チルドレンレコード)',
    '푸르름이 사는 곳': '푸르름이 사는 곳 (青のすみか)',
}

def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', value).casefold() if c.isalnum())

def clean_video(value):
    try:
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or parsed.hostname not in MEDIA_HOSTS or parsed.username or parsed.password or parsed.port not in (None, 443):
            return ''
        query = parse_qs(parsed.query)
        if parsed.hostname in ('www.youtube.com', 'youtube.com', 'youtu.be'):
            vid = parsed.path.strip('/') if parsed.hostname == 'youtu.be' else query.get('v', [''])[0]
            if not re.fullmatch(r'[A-Za-z0-9_-]{11}', vid): return ''
            if parsed.hostname != 'youtu.be' and parsed.path != '/watch': return ''
            kept = {'v': vid}
            for key in ('t', 'start'):
                if query.get(key) and re.fullmatch(r'[0-9hms]+', query[key][0]): kept[key] = query[key][0]
            return 'https://www.youtube.com/watch?' + urlencode(kept)
        if not re.fullmatch(r'/player/[0-9]+/?', parsed.path): return ''
        return urlunsplit(('https', parsed.netloc, parsed.path, parsed.query, ''))
    except ValueError:
        return ''

def extract_silver(html):
    soup = BeautifulSoup(html, 'html.parser')
    records = []
    for link in soup.select('li a[href^="/songs/"]'):
        row = link.find_parent('li')
        facts = row.select_one('div.min-w-0').find_all('div', recursive=False)[1]
        spans = facts.find_all('span', recursive=False)
        rating = row.select_one('[aria-label^="적응도 "]')
        key = next((span.get_text(' ', strip=True).removeprefix('key ').strip() for span in spans if span.get_text(' ', strip=True).startswith('key')), None)
        records.append({'source': 'silver', 'sourceRowId': link['href'].rsplit('/', 1)[-1], 'sourceUrl': 'https://mir427.vercel.app' + link['href'], 'title': link.get_text(' ', strip=True), 'artist': spans[0].get_text(' ', strip=True), 'category': spans[1].get_text(' ', strip=True), 'sourceProficiency': int(re.search(r'(\d)/5', rating['aria-label'])[1]) if rating else None, 'sourceKey': key, 'clip': next((a['href'] for a in row.select('a[href]') if a.get_text(strip=True) == '클립'), ''), 'backing': next((a['href'] for a in row.select('a[href]') if a.get_text(strip=True) == 'MR'), '')})
    return records

def extract_gurmir(html):
    soup = BeautifulSoup(html, 'html.parser')
    records = []
    for index, row in enumerate(soup.select('#song-list .song-card')):
        key = row.select_one('.tag-key')
        records.append({'source': 'gurmir', 'sourceRowId': str(index + 1), 'sourceUrl': SOURCE_URLS['gurmir'], 'title': row.select_one('.song-card__title').get_text(' ', strip=True), 'artist': row.select_one('.song-card__artist').get_text(' ', strip=True), 'category': row.select_one('.tag-genre').get_text(' ', strip=True), 'sourceProficiency': None, 'sourceKey': key.get_text(' ', strip=True) if key else None, 'clip': row.get('href', ''), 'backing': ''})
    return records

def merge_rows(rows):
    songs, rejected = {}, []
    for row in rows:
        title = TITLE_ALIASES.get(row['title'], row['title'])
        key = normalized(row['artist']) + '|' + normalized(title)
        if not all(key.split('|')): raise ValueError('Empty title or artist in source row')
        song = songs.setdefault(key, {'id': 'mir-' + hashlib.sha256(key.encode()).hexdigest()[:12], 'title': title, 'artist': row['artist'], 'aliases': [], 'categories': [], 'requestStatus': 'unreviewed', 'difficulty': None, 'proficiency': None, 'performedAt': None, 'dateVerified': False, 'sources': [], 'videoLinks': [], 'backingLinks': []})
        category = CATEGORIES.get(row['category'], row['category'])
        if category not in song['categories']: song['categories'].append(category)
        if row['title'] != song['title'] and row['title'] not in song['aliases']: song['aliases'].append(row['title'])
        for alias in re.findall(r'[（(]([^()（）]+)[）)]', row['title']):
            if alias not in song['aliases']: song['aliases'].append(alias)
        song['sources'].append({'id': row['source'], 'name': SOURCE_NAMES[row['source']], 'url': row['sourceUrl'], 'rowId': row['sourceRowId'], 'originalTitle': row['title'], 'originalArtist': row['artist'], 'originalCategory': row['category'], 'originalProficiency': row['sourceProficiency'], 'originalKey': row['sourceKey']})
        for kind, target in [('clip', 'videoLinks'), ('backing', 'backingLinks')]:
            raw = row[kind]
            if not raw: continue
            url = clean_video(raw)
            if not url:
                rejected.append({'sourceId': row['source'], 'sourceRowId': row['sourceRowId'], 'songId': song['id'], 'kind': kind, 'rawValue': raw, 'reason': 'Not an allowed HTTPS video URL; not treated as evidence.'})
                continue
            existing = next((v for v in song[target] if v['url'] == url), None)
            if existing:
                if SOURCE_NAMES[row['source']] not in existing['sourceNames']: existing['sourceNames'].append(SOURCE_NAMES[row['source']])
            else:
                song[target].append({'url': url, 'sourceName': SOURCE_NAMES[row['source']], 'sourceNames': [SOURCE_NAMES[row['source']]], 'originalUrl': raw, 'verification': 'source-linked-unverified'})
    return sorted(songs.values(), key=lambda s: (normalized(s['title']), normalized(s['artist']))), rejected

def build_snapshot(directory):
    paths = {key: directory / (key + '.html') for key in ('silver', 'gurmir')}
    silver, gurmir = extract_silver(paths['silver'].read_text(encoding='utf-8')), extract_gurmir(paths['gurmir'].read_text(encoding='utf-8'))
    if len(silver) != 334 or len(gurmir) != 338:
        raise ValueError(f'Snapshot counts changed: silver={len(silver)}, gurmir={len(gurmir)}; review before importing.')
    songs, rejected = merge_rows(silver + gurmir)
    counts = Counter(row['source'] for row in silver + gurmir)
    sources = [{'id': key, 'name': SOURCE_NAMES[key], 'url': SOURCE_URLS[key], 'importedCount': counts[key], 'status': '공개 목록 수집 완료 · 가창일 미검증', 'sha256': hashlib.sha256(paths[key].read_bytes()).hexdigest()} for key in paths]
    sources.append({'id': 'cafe', 'name': SOURCE_NAMES['cafe'], 'url': SOURCE_URLS['cafe'], 'importedCount': 0, 'status': '노래책 메뉴 링크 확인 · 게시물 본문 및 가창일 검증 대기', 'linkedSongbook': 'https://meloming.com/channel/mir/musicbook'})
    return {'schemaVersion': 1, 'snapshotDate': '2026-10-02', 'collectedAt': '2026-10-02T00:30:00+09:00', 'scope': {'from': '2022-10-26', 'through': '2026-10-01', 'timezone': 'Asia/Seoul', 'complete': False, 'note': '조사 대상 기간입니다. 목록의 모든 곡이 기간 내 가창되었다는 뜻은 아닙니다.'}, 'sources': sources, 'audit': {'inputRows': len(silver) + len(gurmir), 'catalogEntries': len(songs), 'mergedRows': len(silver) + len(gurmir) - len(songs), 'videoSongCount': sum(bool(s['videoLinks']) for s in songs), 'crossListedCount': sum(len({r['id'] for r in s['sources']}) > 1 for s in songs), 'invalidLinkCount': len(rejected), 'rejectedLinks': rejected, 'reviewedTitleAliasCount': len(TITLE_ALIASES), 'mergeRule': '검토한 표기 별칭 19쌍 적용 후 NFKC, 대소문자, 공백·문장부호 정규화 후 곡명과 가수 모두 일치할 때만 통합. 번안·동명 이곡·편곡은 임의 병합하지 않음.', 'limitations': ['동일 원본을 공유할 수 있으므로 여러 자료 등재를 독립 검증으로 간주하지 않습니다.', '2026-10-02 공개 목록 수집본입니다. 2026-10-01 이전 가창 여부는 별도 확인이 필요합니다.', '신청 가능 상태와 난이도·숙련도는 본인 승인 전입니다.', '미리내 메뉴와 검색 경로는 확인했으나 게시물 전수 검증은 완료하지 않았습니다.', 'MR 링크는 가창 영상과 분리했으며 잘못된 URL은 제외했습니다.']}, 'songs': songs}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    data = build_snapshot(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in data['audit'].items() if k not in ('rejectedLinks', 'limitations')}, ensure_ascii=False))
