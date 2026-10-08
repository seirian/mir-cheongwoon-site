#!/usr/bin/env python3
"""Inventory code references without printing runtime config or personal values."""
import json
import re
from pathlib import Path

PATTERNS = {
    'browser_storage': r'localStorage|sessionStorage|document\.cookie',
    'analytics_reference': r'googletagmanager|google-analytics|gtag\(|plausible|posthog|sentry|clarity\(',
    'account_deletion': r'deleteUser|delete_user|withdraw|회원탈퇴|회원 탈퇴',
    'external_media': r'youtube(?:-nocookie)?\.com|ytimg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com',
    'server_access_metadata': r'REMOTE_ADDR|HTTP_USER_AGENT|HTTP_X_FORWARDED_FOR',
}
rows = []
for root in ('src', 'server', 'supabase', 'netlify'):
    for path in sorted(Path(root).rglob('*')):
        if not path.is_file() or path.suffix not in ('.js', '.jsx', '.ts', '.php', '.css', '.sql'):
            continue
        if 'policy' in path.name.lower() or 'policies' in path.name.lower():
            continue
        for line_number, line in enumerate(path.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
            for category, pattern in PATTERNS.items():
                if re.search(pattern, line, re.IGNORECASE):
                    rows.append({'path': path.as_posix(), 'line': line_number, 'category': category})
report = {'scope': 'source references only, not proof of live use or retention', 'matches': rows}
Path('policy-source-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
