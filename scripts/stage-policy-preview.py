#!/usr/bin/env python3
"""Stage only the policy review. Never activate or alter production routing."""
import hashlib
import json
import os
from pathlib import Path
import mir_shared_root_deploy_ci as deploy
import yeop_deploy_ci as base

BRANCH = 'refs/heads/feature/privacy-account-review'
ROOTS = ('/web/.htaccess', '/web/_mir_site/.htaccess')

def routing_fingerprints():
    with base.Remote() as remote:
        return {path: hashlib.sha256(remote.read(path) or b'').hexdigest() for path in ROOTS}

def main():
    if os.environ.get('GITHUB_REF') != BRANCH:
        raise SystemExit('Policy staging is restricted to its review branch.')
    if any(os.environ.get(flag) != 'true' for flag in ('VITE_REVIEW_PREVIEW', 'VITE_POLICY_PREVIEW')):
        raise SystemExit('Read-only policy preview flags are required.')
    dist = Path(os.environ.get('DIST_DIR', 'dist'))
    for route in ('index.html', 'policies/review/index.html', 'policies/privacy/index.html', 'policies/terms/index.html', 'policies/operation/index.html', 'account/withdraw-review/index.html'):
        if 'noindex, nofollow' not in (dist / route).read_text(encoding='utf-8'):
            raise SystemExit('Missing noindex: ' + route)
    os.environ['ACTIVATE'] = 'false'
    before = routing_fingerprints()
    deploy.main()
    after = routing_fingerprints()
    if before != after:
        raise SystemExit('Production routing changed; inspect concurrent deployment.')
    report = json.loads(Path('deploy_report.json').read_text(encoding='utf-8'))
    if report['phase'] != 'staged':
        raise SystemExit('Expected staged-only release.')
    report['production_routing_unchanged'] = True
    report['preview_url'] = deploy.CANONICAL_ORIGIN + deploy.PREFIX + report['release'] + '/'
    report['policy_review_url'] = report['preview_url'] + 'policies/review/'
    Path('deploy_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('POLICY REVIEW URL:', report['policy_review_url'])
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as handle:
            handle.write('### Policy review (not active)\n\n' + report['policy_review_url'] + '\n\nHome/footer: ' + report['preview_url'] + '\n\nProduction routing unchanged; no account or schema writes.\n')

if __name__ == '__main__':
    main()
