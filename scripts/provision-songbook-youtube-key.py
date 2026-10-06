#!/usr/bin/env python3
"""Install one release-scoped key over pinned SFTP; never print/save its value locally."""
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import stat
import urllib.error
import urllib.parse
import urllib.request

import mir_shared_root_deploy_ci as deploy
import yeop_deploy_ci as base

PRIVATE_DIR = '/.mir_songbook_keys'
CONFIG_NAME = '_songbook_youtube_key.php'


def config_bytes(key):
    if key and not re.fullmatch(r'[A-Za-z0-9_-]{20,200}', key):
        raise base.Stop('The registered API key has an invalid format.')
    return ("<?php\nif (!defined('SONGBOOK_PRIVATE_CONFIG')) { http_response_code(404); exit; }\nreturn '" + key + "';\n").encode()


def new_private_file(remote, path, data):
    if remote.info(path) is not None:
        raise base.Stop('Refusing to replace an existing credential file.')
    # Create empty, chmod first, then transfer credential bytes. No public-mode window.
    created = False
    try:
        with remote.s.open(path, 'wx') as handle:
            created = True
            remote.s.chmod(path, 0o600)
            handle.write(data)
            handle.flush()
        info = remote.info(path)
        if not info or not stat.S_ISREG(info.st_mode) or info.st_uid != base.OWNER_UID or stat.S_IMODE(info.st_mode) != 0o600:
            raise base.Stop('Private file permissions or owner do not match.')
        if remote.read(path, 1024) != data:
            raise base.Stop('Private file verification failed.')
    except Exception:
        if created:
            remote.s.remove(path)
        raise



def checked_get(url, headers=None):
    # All callers below use fixed, previously validated deployment origins.
    request = urllib.request.Request(url, headers={'User-Agent':'MirSongbookKeySetup/1.0', **(headers or {})})
    try:
        response = urllib.request.urlopen(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read(2000001)
        if len(body) > 2000000:
            raise base.Stop('Runtime check response exceeded its size limit.')
        return response.status, body


def routing_hashes(remote):
    return {p:hashlib.sha256(remote.read(p) or b'').hexdigest() for p in ('/web/.htaccess','/web/_mir_site/.htaccess')}


def run():
    if os.environ.get('GITHUB_REF') != 'refs/heads/feature/songbook-platform-search':
        raise base.Stop('Credential provisioning is restricted to the preview branch.')
    if any(os.environ.get(f) != 'true' for f in ('VITE_REVIEW_PREVIEW','VITE_SONGBOOK_PREVIEW','VITE_SONGBOOK_PLATFORM_PREVIEW')):
        raise base.Stop('All three preview flags are required.')
    report_path = Path('platform-report/youtube-runtime.json')
    report_path.parent.mkdir(exist_ok=True, parents=True)
    staged = json.loads(Path('deploy_report.json').read_text())
    rid = os.environ.get('RELEASE_ID', '')
    if not deploy.RID_RE.fullmatch(rid) or staged.get('release') != rid or staged.get('phase') != 'staged' or staged.get('production_routing_unchanged') is not True:
        raise base.Stop('A verified stage-only release is required.')
    if staged.get('source_commit') != os.environ.get('GITHUB_SHA'):
        raise base.Stop('Staged source commit mismatch.')
    key = os.environ.get('SONGBOOK_YOUTUBE_API_KEY', '').strip()
    if not key:
        raise base.Stop('SONGBOOK_YOUTUBE_API_KEY is not available to this job.')
    payload, placeholder = config_bytes(key), config_bytes('')
    # Defense in depth: no key is allowed in code, frontend output, or report files.
    for folder in ('src','server','dist','platform-report'):
        for path in Path(folder).rglob('*'):
            if path.is_file() and key.encode() in path.read_bytes():
                raise base.Stop('Credential found in a public build or report. Provisioning stopped.')
    remote_api = deploy.SITE_WEB + deploy.PREFIX + rid + '/api/'
    root = deploy.CANONICAL_ORIGIN + deploy.PREFIX + rid + '/'
    local_path = remote_api + CONFIG_NAME
    outside_path = PRIVATE_DIR + '/' + rid + '.php'
    probe_name = 'songbook-runtime-check-' + secrets.token_hex(12) + '.php'
    token = secrets.token_hex(32)
    marker = hashlib.sha256(placeholder).hexdigest()
    # Temporary authenticated diagnostic contains NO API key. It is always removed.
    probe = ("""<?php
header('Content-Type: application/json'); header('Cache-Control: no-store');
if (!hash_equals('TOKEN', $_SERVER['HTTP_X_SONGBOOK_PROBE'] ?? '')) { http_response_code(404); exit; }
function ready($p) { return !@is_link($p) && @is_readable($p) && @hash_file('sha256',$p)==='MARKER'; }
$outside=dirname(__DIR__,5).'/.mir_songbook_keys/RELEASE.php';
$ip='';
if (function_exists('curl_init')) {
 $ch=curl_init('https://www.cloudflare.com/cdn-cgi/trace');
 curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>8,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_IPRESOLVE=>CURL_IPRESOLVE_V4]);
 $body=curl_exec($ch); $code=curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch);
 if ($code===200 && is_string($body) && strlen($body)<10000 && preg_match('/^ip=([0-9.]+)$/m',$body,$m) && filter_var($m[1],FILTER_VALIDATE_IP,FILTER_FLAG_IPV4)) $ip=$m[1];
}
echo json_encode(['outside_ready'=>ready($outside),'local_ready'=>ready(__DIR__.'/_songbook_youtube_key.php'),'egress_ipv4'=>$ip]);
""".replace('TOKEN', token).replace('MARKER', marker).replace('RELEASE', rid)).encode()
    created, keep = {}, None
    result = {'release':rid,'secret_value_logged':False,'production_routing_unchanged':False,'status':'failed'}
    with base.Remote() as remote:
        before = routing_hashes(remote)
        try:
            outside = False
            directory = remote.info(PRIVATE_DIR)
            if directory is None:
                try:
                    remote.s.mkdir(PRIVATE_DIR, 0o700)
                    remote.s.chmod(PRIVATE_DIR, 0o700)
                    directory = remote.info(PRIVATE_DIR)
                except OSError as error:
                    if error.errno not in (13,30):
                        raise base.Stop('Cannot prepare the private configuration directory.') from None
            if directory is not None:
                if not stat.S_ISDIR(directory.st_mode) or directory.st_uid != base.OWNER_UID or stat.S_IMODE(directory.st_mode) != 0o700:
                    raise base.Stop('Unexpected private directory owner or permissions.')
                new_private_file(remote, outside_path, placeholder)
                created[outside_path] = placeholder
                outside = True
            new_private_file(remote, local_path, placeholder)
            created[local_path] = placeholder
            probe_path = remote_api + probe_name
            remote.new_file(probe_path, probe)
            created[probe_path] = probe
            status, body = checked_get(root + 'api/' + probe_name, {'X-Songbook-Probe':token})
            if status != 200:
                raise base.Stop('The PHP runtime diagnostic could not be read.')
            diagnostic = json.loads(body)
            if diagnostic.get('egress_ipv4'):
                result['egress_ipv4'] = str(ipaddress.IPv4Address(diagnostic['egress_ipv4']))
            else:
                raise base.Stop('Could not verify the PHP server outbound IPv4 address.')
            if outside and diagnostic.get('outside_ready') is True:
                target = outside_path
                result['storage'] = 'outside_web_root'
            elif diagnostic.get('local_ready') is True:
                target = local_path
                result['storage'] = 'denied_release_php'
            else:
                raise base.Stop('PHP cannot read a private 0600 configuration; no key was installed.')
            # Test the fallback path before any key is sent there, including physical aliases.
            urls = [root+'api/'+CONFIG_NAME, root+'api/'+CONFIG_NAME+'/anything',
                    deploy.CANONICAL_ORIGIN+'/_mir_site'+deploy.PREFIX+rid+'/api/'+CONFIG_NAME,
                    deploy.PERSONAL_ORIGIN+'/_mir_site'+deploy.PREFIX+rid+'/api/'+CONFIG_NAME]
            blocked = []
            for url in urls:
                status, body = checked_get(url)
                if status not in (403,404) or b'<?php' in body:
                    raise base.Stop('Private configuration is not denied at every public alias.')
                blocked.append(status)
            result['private_http_statuses'] = blocked
            # Only our exact empty placeholder can be replaced. Permissions remain 0600.
            if remote.read(target,1024) != placeholder:
                raise base.Stop('Credential placeholder changed during provisioning.')
            with remote.s.open(target,'wb') as handle:
                handle.write(payload);handle.flush()
            created[target] = payload
            if remote.read(target,1024) != payload or stat.S_IMODE(remote.info(target).st_mode) != 0o600:
                raise base.Stop('Private credential installation did not verify.')
            status, body = checked_get(root+'api/songbook-platform-search.php?'+urllib.parse.urlencode({'provider':'youtube','q':'영물이다 이오몽','country':'AUTO'}))
            if key.encode() in body:
                raise base.Stop('Runtime response exposed credential material; configuration removed.')
            data = json.loads(body)
            allowed = {'youtube_quota_exceeded','youtube_api_disabled','youtube_key_invalid','youtube_key_restricted','youtube_search_unavailable','search_budget','rate_limit'}
            if status != 200 or data.get('state') != 'ok' or not data.get('songs'):
                result['reason'] = data.get('error') if data.get('error') in allowed else 'keyword_runtime_check_failed'
                raise base.Stop('YouTube keyword verification failed; see the sanitized runtime report.')
            if any(s.get('provider')!='youtube' or s.get('artist')!='' for s in data['songs']):
                raise base.Stop('Unexpected YouTube metadata response.')
            result.update(status='verified',keyword_results=len(data['songs']),api_key_used_in_url=False)
            if before != routing_hashes(remote):
                raise base.Stop('Production routing changed during this operation.')
            result['production_routing_unchanged'] = True
            keep = target
        finally:
            # Roll back newly-created key files on any failed check; never touch prior releases.
            for path, expected in created.items():
                if path == keep: continue
                if remote.info(path) is not None and remote.read(path,4096) == expected:
                    remote.s.remove(path)
            result['diagnostic_removed'] = remote.info(remote_api+probe_name) is None
            result['credential_kept'] = keep is not None
            if keep is None: result['status'] = 'failed'
            report_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))


if __name__ == '__main__':
    try:
        run()
    except Exception as error:
        # No traceback or upstream request representation can expose a secret.
        print('YouTube runtime provisioning stopped:',str(error) if isinstance(error,base.Stop) else type(error).__name__)
        raise SystemExit(1)
