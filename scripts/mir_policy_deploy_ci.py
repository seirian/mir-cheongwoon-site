#!/usr/bin/env python3
"""Add published policy routes to the existing atomic deploy/rollback engine."""
import json
import subprocess
import sys
from pathlib import Path
import mir_shared_root_deploy_ci as engine
import yeop_deploy_ci as base

original_router = engine.site_root_htaccess
original_smoke = engine.canonical_smoke
POLICIES = ('privacy', 'terms', 'operation')


def policy_router(release):
    data = original_router(release)
    marker = b'# Release-scoped assets and APIs are served directly from disk.'
    if data.count(marker) != 1:
        raise base.Stop('Unexpected canonical router; policy routing not installed')
    rule = (f'RewriteRule ^policies/(privacy|terms|operation)/?$ _yeop_releases/{release}/policies/$1/index.html [L,QSA]\n').encode()
    return data.replace(marker, rule + marker)


def policy_smoke(release):
    results = original_smoke(release)
    for name in POLICIES:
        path = '/policies/' + name
        code, body, _ = base.http(engine.CANONICAL_ORIGIN + path)
        ok = code == 200 and release.encode() in body
        if not ok:
            raise base.Stop('Policy canonical route failed: ' + name)
        results[path] = {'status': code, 'passed': ok}
    # Run while inside the original activation try/except so a failure rolls back.
    subprocess.run([sys.executable, str(Path(__file__).with_name('policy-production-check.py')),
                    '--url', engine.CANONICAL_ORIGIN + '/', '--out', 'policy-live-report'], check=True)
    report = json.loads(Path('policy-live-report/report.json').read_text())
    if report.get('passed') is not True:
        raise base.Stop('Public policy UI checks failed')
    results['policy_browser'] = {'passed': True, 'checks': len(report['checks'])}
    return results


if __name__ == '__main__':
    engine.site_root_htaccess = policy_router
    engine.canonical_smoke = policy_smoke
    engine.main()
