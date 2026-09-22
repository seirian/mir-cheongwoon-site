#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import stat
import urllib.error
import urllib.request
from pathlib import Path

import yeop_deploy_ci as base

CANONICAL_WEB = "/web/mir"
LEGACY_WEB = "/web"
CANONICAL_ORIGIN = "https://mir.yeop.net"
LEGACY_ORIGIN = "https://yeop.net"
PREFIX = "/_yeop_releases/"
RID_RE = re.compile(r"r[0-9]{14}_[a-f0-9]{8}")
OWNER_UID = 5048
FIXED_ROUTES = ["mir", "band", "history", "schedule", "gallery", "gallery/view", "account", "admin"]
CANONICAL_ENTRY_MARKER = b"<?php // MIR-CANONICAL-ENTRY-V1 "
LEGACY_ENTRY_MARKER = b"<?php // YEOP-LEGACY-REDIRECT-V1 "

base.WEB = CANONICAL_WEB
base.ORIGIN = CANONICAL_ORIGIN


def ensure_dir(r, path: str) -> None:
    parts = path.strip("/").split("/")
    current = ""
    for part in parts:
        current += "/" + part
        info = r.info(current)
        if info is None:
            r.mkdir(current)
        elif not stat.S_ISDIR(info.st_mode) or info.st_uid != OWNER_UID:
            raise base.Stop("Unexpected directory type/owner: " + current)


def newest_existing_release(r) -> str:
    release_root = CANONICAL_WEB + PREFIX.rstrip("/")
    info = r.info(release_root)
    if info is None or not stat.S_ISDIR(info.st_mode):
        raise base.Stop("Canonical release directory is missing")
    releases = []
    for entry in r.s.listdir_attr(release_root):
        if RID_RE.fullmatch(entry.filename) and stat.S_ISDIR(entry.st_mode):
            releases.append(entry.filename)
    if not releases:
        raise base.Stop("No canonical release exists")
    return sorted(releases)[-1]


def canonical_router(rid: str) -> bytes:
    return (
        f"# MIR-CANONICAL-ROUTER-V1 {rid}\n"
        "DirectoryIndex index.php\n"
        "RewriteEngine On\n"
        "RewriteRule ^api/(?:_.*|config\\.php)(?:/|$) - [F,L]\n"
        "RewriteCond %{REQUEST_FILENAME} !-f\n"
        "RewriteCond %{REQUEST_FILENAME} !-d\n"
        "RewriteRule ^(?:mir|band|history|schedule|gallery(?:/[^/]+)?|account|admin)/?$ index.php [L]\n"
        "# Physical route entrypoints are also installed as a fallback.\n"
    ).encode("utf-8")


def gallery_router() -> bytes:
    return (
        "# MIR-GALLERY-ROUTER-V1\n"
        "DirectoryIndex index.php\n"
        "RewriteEngine On\n"
        "RewriteCond %{REQUEST_FILENAME} !-f\n"
        "RewriteCond %{REQUEST_FILENAME} !-d\n"
        "RewriteRule ^[^/]+/?$ index.php [L]\n"
    ).encode("utf-8")


def canonical_entry(rid: str) -> bytes:
    return f'''<?php // MIR-CANONICAL-ENTRY-V1 {rid}
declare(strict_types=1);
$host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
$host = preg_replace('/:\\d+$/', '', $host) ?: '';
if ($host === 'yeop.net' || $host === 'www.yeop.net') {{
    $uri = (string)($_SERVER['REQUEST_URI'] ?? '/mir');
    $uri = str_replace(["\\r", "\\n"], '', $uri);
    if ($uri === '' || $uri[0] !== '/') $uri = '/mir';
    header('Location: https://mir.yeop.net' . $uri, true, 301);
    exit;
}}
$root = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
$file = $root . '/_yeop_releases/{rid}/index.html';
if (!is_file($file)) {{ http_response_code(503); exit; }}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
readfile($file);
'''.encode("utf-8")


def legacy_redirect_entry() -> bytes:
    return b'''<?php // YEOP-LEGACY-REDIRECT-V1
declare(strict_types=1);
$uri = (string)($_SERVER['REQUEST_URI'] ?? '/');
$uri = str_replace(["\\r", "\\n"], '', $uri);
if ($uri === '' || $uri[0] !== '/') $uri = '/';
header('Location: https://mir.yeop.net' . $uri, true, 301);
exit;
'''


def legacy_router() -> bytes:
    return b'''# YEOP-LEGACY-REDIRECT-V1
DirectoryIndex index.php
RewriteEngine On
RewriteCond %{HTTP_HOST} ^(?:www\\.)?yeop\\.net$ [NC]
RewriteRule ^ https://mir.yeop.net%{REQUEST_URI} [R=301,L,NE]
'''


def legacy_gallery_router() -> bytes:
    return b'''# YEOP-LEGACY-GALLERY-REDIRECT-V1
DirectoryIndex index.php
RewriteEngine On
RewriteRule ^ index.php [L]
'''


def allowed_old(path: str, old: bytes | None, kind: str) -> bool:
    if old is None:
        return True
    if kind == "canonical-router":
        return old.startswith(b"# MIR-SUBDOMAIN-DEPLOY-V1 ") or old.startswith(b"# MIR-CANONICAL-ROUTER-V1 ")
    if kind == "canonical-entry":
        return old.startswith(CANONICAL_ENTRY_MARKER)
    if kind == "canonical-test-index":
        return b"mir.yeop.net" in old and (b"접속" in old or b"test" in old.lower())
    if kind == "gallery-router":
        return old.startswith(b"# MIR-GALLERY-ROUTER-V1")
    if kind == "legacy-router":
        return old.startswith(b"# YEOP-DEPLOY-V1 ") or old.startswith(b"# YEOP-LEGACY-REDIRECT-V1")
    if kind == "legacy-entry":
        return old.startswith(LEGACY_ENTRY_MARKER)
    if kind == "legacy-default-index":
        return (
            b"This is the default index page of your website." in old
            or b"<title>Welcome!</title>" in old
            or b"YEOP-LEGACY-REDIRECT" in old
        )
    if kind == "legacy-gallery-router":
        return old.startswith(b"# YEOP-LEGACY-GALLERY-REDIRECT-V1")
    return False


def mutate_file(r, changes: list, path: str, new: bytes | None, kind: str, mode: int = 0o644) -> None:
    old = r.read(path, 4 * 1024 * 1024)
    if not allowed_old(path, old, kind):
        raise base.Stop("Refusing unmanaged file: " + path)
    if old == new:
        return
    if new is None:
        if old is not None:
            r.s.remove(path)
            changes.append((path, old, None, mode))
        return
    if old is None:
        r.new_file(path, new, mode)
    else:
        r.atomic_replace(path, new, old)
    changes.append((path, old, new, mode))


def rollback(r, changes: list) -> None:
    for path, old, new, mode in reversed(changes):
        try:
            current = r.read(path, 4 * 1024 * 1024)
            if old is None and new is not None:
                if current == new:
                    r.s.remove(path)
            elif old is not None and new is None:
                if current is None:
                    r.new_file(path, old, mode)
            elif old is not None and new is not None and current == new:
                r.atomic_replace(path, old, new)
        except Exception:
            print("WARNING: rollback could not restore", path)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def redirect_status(url: str):
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": "MirDomainCutover/1.0"})
    try:
        opener.open(req, timeout=20)
        return 200, ""
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Location", "")


def canonical_smoke(rid: str):
    results = {}
    checks = [
        ("/", ""),
        ("/mir", "mir"),
        ("/band", "band"),
        ("/history", "history"),
        ("/schedule", "schedule"),
        ("/gallery", "gallery"),
        ("/gallery/view?id=00000000-0000-0000-0000-000000000000", "gallery-view"),
        ("/account", "account"),
        ("/admin", "admin"),
    ]
    for path, label in checks:
        code, body, _ = base.http(CANONICAL_ORIGIN + path)
        ok = code == 200 and rid.encode() in body
        results[label or "/"] = {"status": code, "passed": ok}
        if not ok:
            raise base.Stop("Canonical production route failed: " + path)
    return results


def legacy_smoke():
    results = {}
    for path in ["/", "/mir/", "/band/", "/history/", "/schedule/", "/gallery/", "/gallery/view?id=x", "/account/", "/admin/"]:
        code, location = redirect_status(LEGACY_ORIGIN + path)
        ok = code == 301 and location.startswith(CANONICAL_ORIGIN)
        results[path] = {"status": code, "location": location, "passed": ok}
        if not ok:
            raise base.Stop("Legacy redirect failed: " + path)
    return results


def main():
    rid = os.environ.get("RELEASE_ID", "")
    if not RID_RE.fullmatch(rid):
        raise base.Stop("Invalid RELEASE_ID")

    dist = Path(os.environ.get("DIST_DIR", "dist")).resolve()
    if not (dist / "index.html").is_file():
        raise base.Stop("dist/index.html missing")

    base.SERVER_SOURCE = Path(os.environ.get("SERVER_SOURCE_DIR", "server")).resolve()
    manifest = base.local_manifest(dist)
    api_payload, release_htaccess, server_files = base.server_payload(rid)

    report = {
        "release": rid,
        "source_commit": os.environ.get("GITHUB_SHA", ""),
        "canonical_origin": CANONICAL_ORIGIN,
        "legacy_origin": LEGACY_ORIGIN,
        "phase": "starting",
        "files": manifest,
        "server_files": server_files,
    }
    report_path = Path("deploy_report.json")
    backup_dir = Path("deployment-backup")
    backup_dir.mkdir(exist_ok=True)

    with base.Remote() as r, r.lock():
        legacy_info = r.info(LEGACY_WEB)
        if legacy_info is None or not stat.S_ISDIR(legacy_info.st_mode) or legacy_info.st_uid != OWNER_UID:
            raise base.Stop("Unexpected legacy web root")

        previous_release = newest_existing_release(r)
        report["previous_release"] = previous_release

        for label, path in [
            ("canonical.htaccess", CANONICAL_WEB + "/.htaccess"),
            ("canonical.index.html", CANONICAL_WEB + "/index.html"),
            ("canonical.index.php", CANONICAL_WEB + "/index.php"),
            ("legacy.htaccess", LEGACY_WEB + "/.htaccess"),
            ("legacy.index.html", LEGACY_WEB + "/index.html"),
            ("legacy.index.php", LEGACY_WEB + "/index.php"),
        ]:
            data = r.read(path, 4 * 1024 * 1024)
            if data is not None:
                (backup_dir / label).write_bytes(data)

        new_dir = CANONICAL_WEB + PREFIX + rid
        if r.info(new_dir) is not None:
            raise base.Stop("New canonical release path already exists")
        ensure_dir(r, CANONICAL_WEB + PREFIX.rstrip("/"))
        r.mkdir(new_dir)

        directories = set()
        for rel in list(manifest) + base.API_FILES:
            parent = os.path.dirname(rel).replace("\\", "/")
            while parent:
                directories.add(parent)
                parent = os.path.dirname(parent).replace("\\", "/")
        for directory in sorted(directories, key=lambda x: (x.count("/"), x)):
            ensure_dir(r, new_dir + "/" + directory)

        fanart_snapshot = base.find_fanart_snapshot(r)
        report["fanart_fallback"] = {
            "found": fanart_snapshot is not None,
            "source_release": fanart_snapshot["source_release"] if fanart_snapshot else None,
        }

        r.new_file(new_dir + "/.htaccess", release_htaccess)
        for rel, data in sorted(api_payload.items()):
            r.new_file(new_dir + "/" + rel, data)
        if fanart_snapshot:
            fallback_meta = json.dumps(
                fanart_snapshot["metadata"],
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
            r.new_file(new_dir + "/" + base.FANART_FALLBACK_META, fallback_meta, 0o600)
            r.new_file(new_dir + "/" + base.FANART_FALLBACK_IMAGE, fanart_snapshot["image"], 0o600)
        for rel in sorted(manifest):
            r.new_file(new_dir + "/" + rel, (dist / rel).read_bytes())

        report["phase"] = "uploaded"
        report["preview_checks"] = base.smoke(rid, manifest)

        features = {}
        for name in ["soop-live", "naver-fanart"]:
            code, body, _ = base.http(CANONICAL_ORIGIN + PREFIX + rid + "/api/" + name + ".php")
            try:
                payload = json.loads(body)
            except Exception:
                payload = {}
            features[name] = {
                "status_code": code,
                "status": payload.get("status"),
                "reason": payload.get("reason") or payload.get("error"),
                "fallback": bool(payload.get("fallback")),
            }
        if features["soop-live"]["status_code"] != 200:
            raise base.Stop("SOOP endpoint failed")
        if fanart_snapshot and features["naver-fanart"]["status"] != "ok":
            raise base.Stop("Fanart fallback snapshot was not served")
        report["features"] = features

        if os.environ.get("ACTIVATE", "") != "true":
            report["phase"] = "staged"
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("STAGED ONLY:", rid)
            return

        changes = []
        report["phase"] = "activating"
        try:
            mutate_file(r, changes, CANONICAL_WEB + "/.htaccess", canonical_router(rid), "canonical-router")
            mutate_file(r, changes, CANONICAL_WEB + "/index.html", None, "canonical-test-index")
            mutate_file(r, changes, CANONICAL_WEB + "/index.php", canonical_entry(rid), "canonical-entry")

            for route in FIXED_ROUTES:
                route_dir = CANONICAL_WEB + "/" + route
                ensure_dir(r, route_dir)
                mutate_file(r, changes, route_dir + "/index.php", canonical_entry(rid), "canonical-entry")
            mutate_file(r, changes, CANONICAL_WEB + "/gallery/.htaccess", gallery_router(), "gallery-router")

            mutate_file(r, changes, LEGACY_WEB + "/.htaccess", legacy_router(), "legacy-router")
            mutate_file(r, changes, LEGACY_WEB + "/index.html", None, "legacy-default-index")
            mutate_file(r, changes, LEGACY_WEB + "/index.php", legacy_redirect_entry(), "legacy-entry")

            for route in ["band", "history", "schedule", "gallery", "gallery/view", "account", "admin"]:
                route_dir = LEGACY_WEB + "/" + route
                ensure_dir(r, route_dir)
                mutate_file(r, changes, route_dir + "/index.php", legacy_redirect_entry(), "legacy-entry")
            mutate_file(r, changes, LEGACY_WEB + "/gallery/.htaccess", legacy_gallery_router(), "legacy-gallery-router")

            report["canonical_checks"] = canonical_smoke(rid)
            report["legacy_redirect_checks"] = legacy_smoke()
        except BaseException:
            rollback(r, changes)
            report["phase"] = "rolled_back"
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            raise

        report["phase"] = "active"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("CANONICAL PRODUCTION VERIFIED:", rid)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("STOP:", str(exc) if isinstance(exc, base.Stop) else type(exc).__name__)
        raise
