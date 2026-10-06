#!/usr/bin/env python3
"""Stage only this reviewed branch; never activate production or alter root routing."""
import json,os
from pathlib import Path
import mir_shared_root_deploy_ci as deploy
import yeop_deploy_ci as base
import hashlib

def fingerprints():
    with base.Remote() as remote:
        return {path:hashlib.sha256(remote.read(path) or b'').hexdigest() for path in ('/web/.htaccess','/web/_mir_site/.htaccess')}

def main():
    if os.environ.get('GITHUB_REF')!='refs/heads/feature/songbook-platform-search':
        raise SystemExit('Only the platform preview branch may be staged here.')
    for flag in ('VITE_REVIEW_PREVIEW','VITE_SONGBOOK_PREVIEW','VITE_SONGBOOK_PLATFORM_PREVIEW'):
        if os.environ.get(flag)!='true':raise SystemExit('Preview flags are required.')
    for route in ('index.html','songbook/index.html','songbook/review/index.html'):
        if 'noindex, nofollow' not in (Path('dist')/route).read_text():raise SystemExit('Missing noindex metadata.')
    for endpoint in ('api/songbook-platform-search.php','api/_songbook_youtube.php'):
        if endpoint not in base.API_FILES:base.API_FILES.append(endpoint)
    os.environ['ACTIVATE']='false'
    before=fingerprints();deploy.main();after=fingerprints()
    if before!=after:raise SystemExit('Production routing changed; inspect concurrent deployment.')
    path=Path('deploy_report.json');report=json.loads(path.read_text())
    if report['phase']!='staged':raise SystemExit('Expected stage only.')
    root=deploy.CANONICAL_ORIGIN+deploy.PREFIX+report['release']+'/'
    report.update(production_routing_unchanged=True,preview_url=root+'songbook/',editor_url=root+'songbook/?add=1',review_url=root+'songbook/review/',source_commit=os.environ.get('SOURCE_COMMIT'))
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('PREVIEW:',report['preview_url'])
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as handle:handle.write('### Platform search review\n\n'+report['editor_url']+'\n\nProduction routing unchanged.\n')

if __name__=='__main__':main()
