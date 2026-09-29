#!/usr/bin/env python3
"""Stage a read-only review release; never activate or overwrite production."""
import hashlib
import json
import os
from pathlib import Path
import mir_shared_root_deploy_ci as deploy
import yeop_deploy_ci as base

BRANCH = 'refs/heads/feature/promotion-discovery-preview'
ROOTS = ('/web/.htaccess', '/web/_mir_site/.htaccess')

def routing_fingerprints():
    with base.Remote() as remote:
        return {path: hashlib.sha256(remote.read(path) or b'').hexdigest() for path in ROOTS}

def main():
    if os.environ.get('GITHUB_REF') != BRANCH:
        raise SystemExit('Preview deployment is restricted to the review feature branch.')
    if os.environ.get('VITE_REVIEW_PREVIEW') != 'true':
        raise SystemExit('Refusing a build without read-only preview mode.')
    dist = Path(os.environ.get('DIST_DIR', 'dist'))
    for route in ('index.html', 'review/index.html', 'history/blued-2025/index.html'):
        text = (dist / route).read_text(encoding='utf-8')
        if 'noindex, nofollow' not in text:
            raise SystemExit('Preview page is missing noindex: ' + route)
    os.environ['ACTIVATE'] = 'false'  # Not an input or caller-controlled activation switch.
    before = routing_fingerprints()
    deploy.main()
    after = routing_fingerprints()
    if before != after:
        raise SystemExit('Production routing changed during staging; inspect concurrent deployment before proceeding.')
    report = json.loads(Path('deploy_report.json').read_text(encoding='utf-8'))
    if report['phase'] != 'staged':
        raise SystemExit('Expected a staged-only release.')
    report['production_routing_unchanged'] = True
    report['preview_url'] = deploy.CANONICAL_ORIGIN + deploy.PREFIX + report['release'] + '/'
    Path('deploy_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('READ-ONLY PREVIEW:', report['preview_url'])
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as handle:
            handle.write('### Promotion preview\n\n' + report['preview_url'] + '\n\nReview checklist: ' + report['preview_url'] + 'review/\n\nProduction routing unchanged. No merge or activation.\n')

if __name__ == '__main__':
    main()
