#!/usr/bin/env python3
"""Offline matching of captured vocal difficulty ratings; never a runtime crawler.

Only the source-free score map is public. Evidence is stored outside src/public.
Existing ratings are preserved. This import is bound to a reviewed snapshot.
"""
from pathlib import Path
import argparse, collections, hashlib, json, math, re, statistics, unicodedata

def norm(x):
    return ''.join(c for c in unicodedata.normalize('NFKC', x).casefold() if c.isalnum())

ARTIST_GROUPS = [
    ['아이유','IU'], ['악동뮤지션','AKMU','악뮤'], ['아도','Ado'], ['요아소비','YOASOBI'],
    ['오피셜히게단디즘','히게단','Official髭男dism','Official HIGE DANdism'],
    ['미세스그린애플','Mrs. GREEN APPLE'], ['요네즈켄시','米津玄師','Kenshi Yonezu'],
    ['RADWIMPS','래드윔프스','레드윔프스'], ['M.C the MAX','엠씨더맥스','앰씨더맥스','MC THE MAX (엠씨더맥스)'],
    ['10cm','십센치'], ['데이식스','DAY6'], ['유우리','優里','Yuuri'], ['YUI','유이'],
    ['마크툽','MAKTUB'], ['에일리','Ailee'], ['볼빨간사춘기','BOL4'], ['다비치','DAVICHI'],
    ['잔나비','JANNABI'], ['체리필터','cherryfilter','cherryfilter [체리필터]'], ['윤하','YOUNHA'],
    ['정국','Jung Kook'], ['백예린','Yerin Baek'], ['유다빈밴드','YUDABINBAND'], ['옥상달빛','옥달'],
    ['우즈','WOODZ'], ['이브','Eve'], ['리사','LiSA'], ['원오크락','ONE OK ROCK'],
    ['바운디','Vaundy'], ['요루시카','ヨルシカ','Yorushika'], ['츠키','tuki.'],
    ['스파이에어','SPYAIR'], ['허니웍스','HoneyWorks'], ['범프오브치킨','BUMP OF CHICKEN'],
]
ARTISTS = {norm(n): norm(group[0]) for group in ARTIST_GROUPS for n in group}

def art(text):
    value = norm(text)
    if value in ARTISTS:
        return ARTISTS[value]
    match = re.fullmatch(r'(.+?)\s*[\[(]([^\])]+)[\])]', text)
    if match:
        a = ARTISTS.get(norm(match[1]), norm(match[1]))
        b = ARTISTS.get(norm(match[2]), norm(match[2]))
        if a == b:
            return a
    return value

BLOCKED = re.compile(r'\b(inst|instrumental|live|remix|version|ver|cover|piano|feat)\b|버전|한국어버전|메들리|피아노|라이브|어쿠스틱', re.I)
def different(a, b):
    korean = lambda x: bool(re.search('[가-힣]', x))
    other = lambda x: bool(re.search('[ぁ-ヿ一-鿿]|[A-Za-z]{2}', x))
    return (korean(a) and other(b)) or (korean(b) and other(a))

def variants(text):
    """Use explicitly co-listed language spellings, never translate or drop a version."""
    result = {norm(text)}
    if BLOCKED.search(text):
        return result
    match = re.fullmatch(r'(.+?)\s*[\[(]([^\])]+)[\])]', text)
    if match and different(*match.groups()):
        result |= {norm(match[1]), norm(match[2])}
    parts = re.split(r'\s+/\s+', text)
    if len(parts) == 2 and different(*parts):
        result |= {norm(x) for x in parts}
    match = re.fullmatch(r"([A-Za-z0-9?!.,' :%-]+)\s+([가-힣][가-힣\s?!.,]+)", text)
    if match and re.search('[A-Za-z]{2}', match[1]):
        result |= {norm(match[1]), norm(match[2])}
    match = re.fullmatch(r'([가-힣][가-힣\s]+)\s+([A-Za-z][A-Za-z\s!?]+)', text)
    if match and re.search('[A-Za-z]{2}', match[2]):
        result |= {norm(match[1]), norm(match[2])}
    return {x for x in result if x}

def choose_score(votes):
    if not votes:
        return None, 'no_reliable_same_song_rating'
    counts = collections.Counter(votes)
    mode, frequency = counts.most_common(1)[0]
    if max(votes) - min(votes) > 2:
        if len(votes) < 3 or frequency / len(votes) < 2/3:
            return None, 'conflicting_ratings'
        return mode, 'matched_reference'
    if len(votes) == 1 and votes[0] == 1:
        return None, 'single_minimum_rating_unconfirmed'
    return math.floor(statistics.median(votes) + .5), 'matched_reference'

def reconcile(songs, known, rows):
    if any(type(r.get('difficulty')) is not int or not 1 <= r['difficulty'] <= 5 for r in rows):
        raise ValueError('Expected explicit one-to-five difficulty ratings')
    stats = collections.defaultdict(collections.Counter)
    for row in rows:
        stats[row['catalog']][row['difficulty']] += 1
    excluded = {c for c, count in stats.items() if len(count) < 2
                or count[1] / sum(count.values()) > .7
                or max(count.values()) / sum(count.values()) > .9}
    index = collections.defaultdict(list)
    for row in rows:
        if row['catalog'] not in excluded:
            for title in variants(row['title']):
                index[(title, art(row['artist']))].append(row)
    records, additions = [], {}
    for song in songs:
        if song['id'] in known:
            continue
        found = []
        for title in [song['title'], *song.get('aliases', [])]:
            for candidate in variants(title):
                found.extend(index[(candidate, art(song['artist']))])
        found = list({r['url']: r for r in found}.values())
        by_catalog = collections.defaultdict(set)
        for row in found:
            by_catalog[row['catalog']].add(row['difficulty'])
        valid = {c: next(iter(v)) for c, v in by_catalog.items() if len(v) == 1}
        votes = sorted(valid.values())
        value, status = choose_score(votes)
        if value is not None:
            additions[song['id']] = value
        records.append({'id': song['id'], 'title': song['title'], 'artist': song['artist'],
                        'status': status, 'difficulty': value, 'votes': votes,
                        'references': [r for r in found if r['catalog'] in valid],
                        'excluded_conflicting_catalogs': sorted(c for c, v in by_catalog.items() if len(v) > 1)})
    return additions, records, sorted(excluded)

def self_test():
    assert choose_score([]) == (None, 'no_reliable_same_song_rating')
    assert choose_score([1])[0] is None
    assert choose_score([1, 1])[0] == 1
    assert choose_score([3, 4])[0] == 4
    assert choose_score([1, 3, 5])[0] is None
    assert choose_score([1, 5, 5])[0] == 5
    assert art('IU') == art('아이유') and art('Ado') == art('아도')
    assert art('이브') != art('IVE')
    assert norm('나는 최강') in variants('나는 최강 / 私は最強')
    assert norm('I') in variants('I')
    assert norm('곡') not in variants('곡 (Live)')
    assert norm('곡') not in variants('곡 (inst)')
    rows = []
    for i, value in enumerate([3, 4]):
        rows.extend([{'title':'테스트곡','artist':'아이유','difficulty':value,'catalog':str(i),'url':str(i)+'#1'},
                     {'title':'다른 곡','artist':'아이유','difficulty':2,'catalog':str(i),'url':str(i)+'#2'}])
    songs = [{'id':'a','title':'테스트곡','artist':'IU'},
             {'id':'b','title':'테스트곡','artist':'다른 가수'},
             {'id':'c','title':'테스트곡 (Live)','artist':'IU'}]
    additions, records, _ = reconcile(songs, {}, rows)
    assert additions == {'a':4} and len(records) == 3
    assert reconcile(songs, {'a':1}, rows)[0] == {}
    print('PASS: difficulty decisions, variants, artist identity, and existing score protection')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference-dir', type=Path)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.reference_dir:
        parser.error('--reference-dir is required')
    root = Path(__file__).resolve().parents[1]
    songs = json.loads((root/'src/data/songbookData.json').read_text(encoding='utf-8'))['songs']
    score_path = root/'src/data/songbookDifficulty.json'
    known = json.loads((args.baseline or score_path).read_text(encoding='utf-8'))
    body = (args.reference_dir/'ratings.json').read_bytes()
    expected_digest = '12bc9a8433a2e1a0b5d6bb890ffd6ffcc700b97cab54857a5638f584a7b98427'
    if hashlib.sha256(body).hexdigest() != expected_digest:
        raise ValueError('Reference snapshot differs from the reviewed input')
    rows = json.loads(body)
    if len(songs) != 342 or len(known) != 49:
        raise ValueError('Expected the reviewed 342-entry catalog and 49-score baseline')
    additions, records, excluded = reconcile(songs, known, rows)
    if len(records) != 293 or len(additions) != 90:
        raise ValueError('Unexpected reviewed match totals')
    report = {'review_date':'2026-10-04', 'base_count':len(songs), 'previous_rated':len(known),
              'investigated_unrated':len(records), 'added':len(additions),
              'remaining_unrated':len(records)-len(additions),
              'reference_rows':len(rows), 'reference_sha256':expected_digest,
              'fully_paged_catalogs':43, 'probed_catalogs':90,
              'excluded_default_dominated_catalogs':excluded,
              'reference_runs':[37130267803,37131104709],
              'counts':dict(collections.Counter(r['status'] for r in records)),
              'preserved_ratings':known, 'records':records}
    if args.write:
        combined = dict(known, **additions)
        current = json.loads(score_path.read_text(encoding='utf-8'))
        if current != known and current != combined:
            raise ValueError('Scores changed since review; reconcile manually')
        audit = root/'docs/reviews/songbook-difficulty-audit.json'
        audit.parent.mkdir(parents=True, exist_ok=True)
        audit.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        score_path.write_text(json.dumps(combined, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('records','preserved_ratings','excluded_default_dominated_catalogs')}, ensure_ascii=False))

if __name__ == '__main__':
    main()
