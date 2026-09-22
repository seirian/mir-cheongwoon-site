#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import posixpath
import re
import stat
import urllib.error
import urllib.request
from pathlib import Path

import yeop_deploy_ci as base

SHARED_WEB = "/web"
SITE_WEB = "/web/_mir_site"
CANONICAL_ORIGIN = "https://mir.yeop.net"
LEGACY_ORIGIN = "https://yeop.net"
PREVIEW_ORIGIN = "https://yeop.net"
PREFIX = "/_yeop_releases/"
RID_RE = re.compile(r"r[0-9]{14}_[a-f0-9]{8}")
OWNER_UID = 5048
SITE_ROOT_MARKER = b"# MIR-SITE-ROOT-V2 "
SHARED_ROOT_MARKER = b"# MIR-DOMAIN-CUTOVER-V2 "


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


def site_root_htaccess(rid: str) -> bytes:
    return (
        f"# MIR-SITE-ROOT-V2 {rid}\n"
        "DirectoryIndex index.html\n"
        "RewriteEngine On\n"
        f"RewriteRule ^$ _yeop_releases/{rid}/index.html [L]\n"
        f"RewriteRule ^(?:mir|band|history|schedule|gallery(?:/[^/]+)?|account|admin)/?$ "
        f"_yeop_releases/{rid}/index.html [L,QSA]\n"
        "# No broad fallback: nonexistent API/assets remain 404.\n"
    ).encode("utf-8")


def shared_root_htaccess(rid: str) -> bytes:
    return (
        f"# MIR-DOMAIN-CUTOVER-V2 {rid}\n"
        "RewriteEngine On\n"
        "\n"
        "# Legacy apex/www become permanent aliases of the canonical subdomain.\n"
        "RewriteCond %{HTTP_HOST} ^(?:www\\.)?yeop\\.net(?::[0-9]+)?$ [NC]\n"
        "RewriteRule ^ https://mir.yeop.net%{REQUEST_URI} [R=301,L,NE]\n"
        "\n"
        "# mir.yeop.net is served from an internal collision-free directory.\n"
        "RewriteCond %{HTTP_HOST} ^mir\\.yeop\\.net(?::[0-9]+)?$ [NC]\n"
        "RewriteCond %{REQUEST_URI} !^/_mir_site(?:/|$)\n"
        "RewriteRule ^(.*)$ _mir_site/$1 [L]\n"
        "\n"
        "# Unknown hosts are not rewritten by this cutover file.\n"
    ).encode("utf-8")


def allowed_shared_root(old: bytes | None) -> bool:
    if old is None:
        return True
    return (
        old.startswith(b"# YEOP-DEPLOY-V1 ")
        or old.startswith(b"# YEOP-LEGACY-REDIRECT-V1")
        or old.startswith(SHARED_ROOT_MARKER)
    )


def allowed_site_root(old: bytes | None) -> bool:
    if old is None:
        return True
    return old.startswith(SITE_ROOT_MARKER)


def replace_managed(r, path: str, new: bytes, validator, changes: list) -> None:
    old = r.read(path, 4 * 1024 * 1024)
    if not validator(old):
        raise base.Stop("Refusing unmanaged file: " + path)
    if old == new:
        return
    if old is None:
        r.new_file(path, new)
    else:
        r.atomic_replace(path, new, old)
    changes.append((path, old, new))


def rollback(r, changes: list) -> None:
    for path, old, new in reversed(changes):
        try:
            current = r.read(path, 4 * 1024 * 1024)
            if old is None:
                if current == new:
                    r.s.remove(path)
            elif current == new:
                r.atomic_replace(path, old, new)
        except Exception:
            print("WARNING: rollback could not restore", path)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def redirect_status(url: str):
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": "MirDomainCutoverV2/1.0"})
    try:
        with opener.open(req, timeout=20) as res:
            return res.status, res.headers.get("Location", "")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Location", "")


def preview_smoke(rid: str):
    base_url = PREVIEW_ORIGIN + "/_mir_site" + PREFIX + rid + "/"
    results = {}
    for route in ["index.html", "api/health.php"]:
        code, body, _ = base.http(base_url + route)
        if route == "index.html":
            ok = code == 200 and rid.encode() in body
        else:
            try:
                payload = json.loads(body)
            except Exception:
                payload = {}
            ok = code == 200 and payload.get("status") == "ready" and payload.get("release") == rid
        results[route] = {"status": code, "passed": ok}
        if not ok:
            raise base.Stop("Staged preview failed: " + route)
    return results


def canonical_smoke(rid: str):
    results = {}
    for path in ["/", "/mir", "/band", "/history", "/schedule", "/gallery", "/account", "/admin"]:
        code, body, _ = base.http(CANONICAL_ORIGIN + path)
        ok = code == 200 and rid.encode() in body
        results[path] = {"status": code, "passed": ok}
        if not ok:
            raise base.Stop("Canonical route failed: " + path)

    # release-scoped API health must also work through the canonical host rewrite.
    code, body, _ = base.http(CANONICAL_ORIGIN + PREFIX + rid + "/api/health.php")
    try:
        payload = json.loads(body)
    except Exception:
        payload = {}
    ok = code == 200 and payload.get("status") == "ready" and payload.get("release") == rid
    results["health"] = {"status": code, "passed": ok}
    if not ok:
        raise base.Stop("Canonical health failed")
    return results


def legacy_smoke():
    results = {}
    for path in ["/", "/mir", "/band", "/history", "/schedule", "/gallery", "/account", "/admin"]:
        code, location = redirect_status(LEGACY_ORIGIN + path)
        expected = CANONICAL_ORIGIN + path
        ok = code == 301 and location == expected
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
    base.WEB = SITE_WEB
    base.ORIGIN = CANONICAL_ORIGIN

    manifest = base.local_manifest(dist)
    api_payload, release_htaccess, server_files = base.server_payload(rid)

    report = {
        "release": rid,
        "source_commit": os.environ.get("GITHUB_SHA", ""),
        "canonical_origin": CANONICAL_ORIGIN,
        "legacy_origin": LEGACY_ORIGIN,
        "shared_document_root": SHARED_WEB,
        "internal_site_root": SITE_WEB,
        "phase": "starting",
        "files": manifest,
        "server_files": server_files,
    }
    report_path = Path("deploy_report.json")
    backup_dir = Path("deployment-backup")
    backup_dir.mkdir(exist_ok=True)

    with base.Remote() as r, r.lock():
        shared_info = r.info(SHARED_WEB)
        if shared_info is None or not stat.S_ISDIR(shared_info.st_mode) or shared_info.st_uid != OWNER_UID:
            raise base.Stop("Unexpected shared web root")

        ensure_dir(r, SITE_WEB)
        ensure_dir(r, SITE_WEB + PREFIX.rstrip("/"))

        for label, path in [
            ("shared.htaccess", SHARED_WEB + "/.htaccess"),
            ("site.htaccess", SITE_WEB + "/.htaccess"),
        ]:
            data = r.read(path, 4 * 1024 * 1024)
            if data is not None:
                (backup_dir / label).write_bytes(data)

        new_dir = SITE_WEB + PREFIX + rid
        if r.info(new_dir) is not None:
            raise base.Stop("New release path already exists")
        r.mkdir(new_dir)

        directories = set()
        for rel in list(manifest) + base.API_FILES:
            parent = posixpath.dirname(rel)
            while parent:
                directories.add(parent)
                parent = posixpath.dirname(parent)
        for directory in sorted(directories, key=lambda x: (x.count("/"), x)):
            ensure_dir(r, new_dir + "/" + directory)

        r.new_file(new_dir + "/.htaccess", release_htaccess)
        for rel, data in sorted(api_payload.items()):
            r.new_file(new_dir + "/" + rel, data)
        for rel in sorted(manifest):
            r.new_file(new_dir + "/" + rel, (dist / rel).read_bytes())

        report["phase"] = "uploaded"
        report["preview_checks"] = preview_smoke(rid)

        if os.environ.get("ACTIVATE", "") != "true":
            report["phase"] = "staged"
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("STAGED ONLY:", rid)
            return

        changes = []
        report["phase"] = "activating"
        try:
            replace_managed(
                r,
                SITE_WEB + "/.htaccess",
                site_root_htaccess(rid),
                allowed_site_root,
                changes,
            )
            replace_managed(
                r,
                SHARED_WEB + "/.htaccess",
                shared_root_htaccess(rid),
                allowed_shared_root,
                changes,
            )

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
