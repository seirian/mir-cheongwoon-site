#!/usr/bin/env python3
"""Stage the songbook feature without activating or modifying production routing."""
import hashlib
import json
import os
from pathlib import Path
import mir_shared_root_deploy_ci as deploy
import yeop_deploy_ci as base

ROOTS = ('/web/.htaccess', '/web/_mir_site/.htaccess')
def fingerprints():
    with base.Remote() as remote:
        return {path: hashlib.sha256(remote.read(path) or b'').hexdigest() for path in ROOTS}

def main():
    if os.environ.get('GITHUB_REF') != 'refs/heads/feature/songbook':
        raise SystemExit('Songbook previews are restricted to feature/songbook.')
    if os.environ.get('VITE_REVIEW_PREVIEW') != 'true' or os.environ.get('VITE_SONGBOOK_PREVIEW') != 'true':
        raise SystemExit('Read-only songbook preview flags are required.')
    dist = Path(os.environ.get('DIST_DIR', 'dist'))
    for route in ('index.html', 'songbook/index.html', 'songbook/review/index.html'):
        if 'noindex, nofollow' not in (dist / route).read_text(encoding='utf-8'):
            raise SystemExit('Missing noindex metadata: ' + route)
    os.environ['ACTIVATE'] = 'false'
    before = fingerprints()
    deploy.main()
    after = fingerprints()
    if before != after:
        raise SystemExit('Production routing changed; inspect concurrent deployment before proceeding.')
    report = json.loads(Path('deploy_report.json').read_text(encoding='utf-8'))
    if report['phase'] != 'staged': raise SystemExit('Expected staging only.')
    root = deploy.CANONICAL_ORIGIN + deploy.PREFIX + report['release'] + '/'
    report.update({'production_routing_unchanged': True, 'preview_url': root, 'songbook_url': root + 'songbook/', 'review_url': root + 'songbook/review/', 'source_commit': os.environ.get('SOURCE_COMMIT')})
    Path('deploy_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('SONGBOOK PREVIEW:', report['songbook_url'])
    print('SONGBOOK REVIEW:', report['review_url'])
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as handle:
            handle.write('### Songbook draft\n\n' + report['songbook_url'] + '\n\nReview: ' + report['review_url'] + '\n\nProduction routing unchanged. No main/develop merge or activation.\n')

if __name__ == '__main__':
    main()
