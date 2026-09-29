#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import os
import posixpath
import re
import stat
import urllib.error
import urllib.request
from pathlib import Path

import yeop_deploy_ci as base

for _daily_api in ("api/_fanart_daily.php", "api/naver-fanart-daily.php", "api/naver-fanart-backup.php"):
    if _daily_api not in base.API_FILES:
        base.API_FILES.append(_daily_api)

PERSONAL_WEB = "/web"
SITE_WEB = "/web/_mir_site"
CANONICAL_ORIGIN = "https://mir.yeop.net"
PERSONAL_ORIGIN = "https://yeop.net"
PREFIX = "/_yeop_releases/"
RID_RE = re.compile(r"r[0-9]{14}_[a-f0-9]{8}")
OWNER_UID = 5048

SITE_ROOT_MARKER = b"# MIR-SITE-ROOT-V2 "
BRIDGE_MARKER = b"# MIR-SUBDOMAIN-BRIDGE-V1"
OLD_PERSONAL_MARKERS = (
    b"# MIR-DOMAIN-CUTOVER-V2 ",
    b"# MIR-DOMAIN-ROUTER-V3 ",
)


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


def _validated_fallback(meta: dict, image: bytes, label: str, release: str, source_kind: str):
    if not isinstance(meta, dict) or not image or len(image) > 6 * 1024 * 1024:
        return None
    fallback_id = meta.get("id")
    article_url = meta.get("articleUrl")
    if not isinstance(fallback_id, str) or not re.fullmatch(r"[a-f0-9]{64}", fallback_id):
        return None
    if hashlib.sha256(image).hexdigest() != fallback_id:
        return None
    if not isinstance(article_url, str) or not base.FANART_ARTICLE_RE.fullmatch(article_url):
        return None

    mime = meta.get("mime")
    if mime not in base.FANART_IMAGE_MIMES:
        if image.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif image.startswith(b"\x89PNG\r\n\x1a\n"):
            mime = "image/png"
        elif image.startswith((b"GIF87a", b"GIF89a")):
            mime = "image/gif"
        elif image.startswith(b"RIFF") and image[8:12] == b"WEBP":
            mime = "image/webp"
        else:
            return None
        meta = dict(meta)
        meta["mime"] = mime

    return {
        "meta_raw": json.dumps(meta, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        "image": image,
        "source_root": label,
        "source_release": release,
        "source_kind": source_kind,
        "article_id": meta.get("articleId"),
        "source_date": meta.get("sourceDate"),
    }


def _current_fanart_snapshot(r, cache_path, label, release):
    fanart_state = base.parse_cache_value(
        r.read(cache_path + "fanart.state.php", 4 * 1024 * 1024)
    )
    image_state = base.parse_cache_value(
        r.read(cache_path + "image.state.php", 12 * 1024 * 1024)
    )
    if not fanart_state or not image_state:
        return None

    public = fanart_state.get("public")
    source = fanart_state.get("source")
    if not isinstance(public, dict) or public.get("status") != "ok":
        return None
    if not isinstance(source, str) or not base.allowed_fanart_source(source):
        return None
    article_url = public.get("articleUrl")
    if not isinstance(article_url, str) or not base.FANART_ARTICLE_RE.fullmatch(article_url):
        return None
    if image_state.get("id") != hashlib.sha256(source.encode()).hexdigest():
        return None

    mime = image_state.get("mime")
    encoded = image_state.get("data")
    if mime not in base.FANART_IMAGE_MIMES or not isinstance(encoded, str):
        return None
    try:
        image = base64.b64decode(encoded, validate=True)
    except Exception:
        return None
    if not image or len(image) > 6 * 1024 * 1024:
        return None

    meta = {
        "id": hashlib.sha256(image).hexdigest(),
        "mime": mime,
        "boardUrl": base.FANART_BOARD,
        "articleId": int(public.get("articleId") or 0),
        "title": str(public.get("title") or "오늘의 팬아트")[:500],
        "author": str(public.get("author") or "작성자")[:200],
        "articleUrl": article_url,
        "sourceDate": str(public.get("sourceDate") or "")[:10],
    }
    snapshot = _validated_fallback(meta, image, label, release, "cache-state")
    if snapshot:
        return snapshot
    return None


def find_persisted_fanart_fallback(r):
    roots = [
        (SITE_WEB, "canonical-site"),
        ("/web/mir", "legacy-subdomain-mirror"),
        (PERSONAL_WEB, "legacy-root"),
    ]

    for root, label in roots:
        release_root = root + PREFIX.rstrip("/")
        info = r.info(release_root)
        if info is None or not stat.S_ISDIR(info.st_mode):
            continue

        try:
            releases = sorted(
                [
                    entry.filename
                    for entry in r.s.listdir_attr(release_root)
                    if RID_RE.fullmatch(entry.filename) and stat.S_ISDIR(entry.st_mode)
                ],
                reverse=True,
            )
        except OSError:
            continue

        for release in releases[:100]:
            cache_path = release_root + "/" + release + "/api/_cache/"

            current = _current_fanart_snapshot(r, cache_path, label, release)
            if current:
                return current

            meta_raw = r.read(cache_path + "fanart-fallback.json", 64 * 1024)
            image = r.read(cache_path + "fanart-fallback.bin", 6 * 1024 * 1024 + 1)
            if meta_raw and image:
                try:
                    meta = json.loads(meta_raw)
                except Exception:
                    meta = None
                snapshot = _validated_fallback(meta, image, label, release, "fallback-files")
                if snapshot:
                    return snapshot

    return None


def ensure_daily_fanart_store(r):
    # Shared across releases; never copy or replace the saved daily records during deploy.
    path = SITE_WEB + "/_fanart_daily"
    ensure_dir(r, path)
    guard = b"Require all denied\nOptions -Indexes\n"
    existing = r.read(path + "/.htaccess", 4096)
    if existing is None:
        r.new_file(path + "/.htaccess", guard)
    elif existing != guard:
        raise base.Stop("Unexpected daily fanart storage protection")


def site_root_htaccess(rid: str) -> bytes:
    return (
        f"# MIR-SITE-ROOT-V2 {rid}\n"
        "DirectoryIndex index.html\n"
        "RewriteEngine On\n"
        "RewriteRule ^_fanart_daily(?:/|$) - [F,L]\n"
        f"RewriteRule ^api/(naver-fanart-(?:daily|backup|image)\\.php)$ _yeop_releases/{rid}/api/$1 [L,QSA]\n"
        f"RewriteRule ^$ _yeop_releases/{rid}/index.html [L]\n"
        # The frontend build emits a static HTML head for each public route.
        f"RewriteRule ^(mir|band|history|schedule|gallery|account|admin)/?$ "
        f"_yeop_releases/{rid}/$1/index.html [L,QSA]\n"
        f"RewriteRule ^history/([a-z0-9-]+)/?$ "
        f"_yeop_releases/{rid}/history/$1/index.html [L,QSA]\n"
        f"RewriteRule ^gallery/[^/]+/?$ _yeop_releases/{rid}/gallery/index.html [L,QSA]\n"
        f"RewriteRule ^review/?$ _yeop_releases/{rid}/index.html [L,QSA]\n"
        "# Release-scoped assets and APIs are served directly from disk.\n"
    ).encode("utf-8")


def bridge_htaccess() -> bytes:
    return (
        "# MIR-SUBDOMAIN-BRIDGE-V1\n"
        "RewriteEngine On\n"
        "\n"
        "# Stable host bridge for the MIR fanpage only.\n"
        "RewriteCond %{HTTP_HOST} ^mir\\.yeop\\.net(?::[0-9]+)?$ [NC]\n"
        "RewriteCond %{REQUEST_URI} !^/_mir_site(?:/|$)\n"
        "RewriteRule ^(.*)$ _mir_site/$1 [L]\n"
        "\n"
        "# yeop.net and every other host intentionally fall through untouched.\n"
        "# Personal-site rewrite rules may be appended below this block.\n"
    ).encode("utf-8")


def allowed_site_root(old: bytes | None) -> bool:
    return old is None or old.startswith(SITE_ROOT_MARKER)


def install_or_verify_bridge(r, changes: list) -> str:
    path = PERSONAL_WEB + "/.htaccess"
    old = r.read(path, 4 * 1024 * 1024)
    new = bridge_htaccess()

    if old is None:
        r.new_file(path, new)
        changes.append(("replace", path, None, new))
        return "created"

    if old.startswith(BRIDGE_MARKER):
        # Once installed, this file may contain personal-site rules below the
        # bridge. MIR deploys must never overwrite or normalize those rules.
        required = [
            b"RewriteCond %{HTTP_HOST} ^mir\\.yeop\\.net",
            b"RewriteRule ^(.*)$ _mir_site/$1 [L]",
        ]
        if not all(piece in old for piece in required):
            raise base.Stop("MIR host bridge marker exists but required rules are missing")
        return "preserved"

    if any(old.startswith(marker) for marker in OLD_PERSONAL_MARKERS):
        r.atomic_replace(path, new, old)
        changes.append(("replace", path, old, new))
        return "converted_from_old_mir_router"

    raise base.Stop(
        "Personal yeop.net .htaccess is unmanaged. Preserve personal rules and add the MIR bridge manually."
    )


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
    changes.append(("replace", path, old, new))


def rollback(r, changes: list) -> None:
    for operation, path, old, new in reversed(changes):
        try:
            current = r.read(path, 4 * 1024 * 1024)
            if operation == "replace":
                if old is None and current == new:
                    r.s.remove(path)
                elif old is not None and current == new:
                    r.atomic_replace(path, old, new)
        except Exception:
            print("WARNING: rollback could not restore", path)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def redirect_status(url: str):
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": "MirStableBridgeDeploy/1.0"})
    try:
        with opener.open(req, timeout=20) as res:
            return res.status, res.headers.get("Location", "")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Location", "")


def preview_smoke(rid: str):
    base_url = CANONICAL_ORIGIN + PREFIX + rid + "/"
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


def fanart_smoke(rid: str):
    url = CANONICAL_ORIGIN + PREFIX + rid + "/api/naver-fanart.php"
    code, body, _ = base.http(url)
    try:
        payload = json.loads(body)
    except Exception:
        payload = {}

    ok = (
        code == 200
        and payload.get("status") == "ok"
        and isinstance(payload.get("imageUrl"), str)
        and bool(payload.get("imageUrl"))
    )
    result = {
        "status": code,
        "fanart_status": payload.get("status"),
        "source_date": payload.get("sourceDate"),
        "fresh_source": payload.get("status") == "ok" and not payload.get("fallback") and not payload.get("stale"),
        "fallback": bool(payload.get("fallback")),
        "reason": payload.get("reason"),
        "passed": ok,
    }
    if not ok:
        raise base.Stop("Fanart API is unavailable")

    image_url = payload["imageUrl"]
    if image_url.startswith("/"):
        image_url = CANONICAL_ORIGIN + image_url
    image_code, image_body, image_type = base.http(image_url, limit=7 * 1024 * 1024)
    image_ok = image_code == 200 and image_type.startswith("image/") and len(image_body) > 0
    result["image"] = {
        "status": image_code,
        "content_type": image_type,
        "bytes": len(image_body),
        "passed": image_ok,
    }
    if not image_ok:
        raise base.Stop("Fanart image is unavailable")
    return result


def personal_host_smoke():
    code, location = redirect_status(PERSONAL_ORIGIN + "/")
    redirects_to_mir = (
        code in (301, 302, 303, 307, 308)
        and isinstance(location, str)
        and location.startswith(CANONICAL_ORIGIN)
    )
    result = {
        "status": code,
        "location": location,
        "redirects_to_mir": redirects_to_mir,
        "passed": not redirects_to_mir,
    }
    if redirects_to_mir:
        raise base.Stop("yeop.net must remain independent from mir.yeop.net")
    return result


def main():
    rid = os.environ.get("RELEASE_ID", "")
    if not RID_RE.fullmatch(rid):
        raise base.Stop("Invalid RELEASE_ID")

    dist = Path(os.environ.get("DIST_DIR", "dist")).resolve()
    if not (dist / "index.html").is_file():
        raise base.Stop("dist/index.html missing")

    base.SERVER_SOURCE = Path(os.environ.get("SERVER_SOURCE_DIR", "server")).resolve()
    # MIR releases and the deployment lock live under the isolated internal site
    # directory. The personal yeop.net root is touched only once to convert the
    # old redirect into a stable, release-independent host bridge.
    base.WEB = SITE_WEB
    base.ORIGIN = CANONICAL_ORIGIN

    manifest = base.local_manifest(dist)
    api_payload, release_htaccess, server_files = base.server_payload(rid)

    report = {
        "release": rid,
        "source_commit": os.environ.get("GITHUB_SHA", ""),
        "canonical_origin": CANONICAL_ORIGIN,
        "personal_origin": PERSONAL_ORIGIN,
        "site_root": SITE_WEB,
        "phase": "starting",
        "files": manifest,
        "server_files": server_files,
    }
    report_path = Path("deploy_report.json")
    backup_dir = Path("deployment-backup")
    backup_dir.mkdir(exist_ok=True)

    with base.Remote() as r, r.lock():
        site_info = r.info(SITE_WEB)
        if site_info is None or not stat.S_ISDIR(site_info.st_mode) or site_info.st_uid != OWNER_UID:
            raise base.Stop("Unexpected MIR internal site root")

        ensure_dir(r, SITE_WEB + PREFIX.rstrip("/"))
        ensure_daily_fanart_store(r)

        for label, path in [
            ("personal.htaccess", PERSONAL_WEB + "/.htaccess"),
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

        fallback = find_persisted_fanart_fallback(r)
        report["fanart_fallback"] = {
            "found": fallback is not None,
            "source_root": fallback["source_root"] if fallback else None,
            "source_release": fallback["source_release"] if fallback else None,
            "source_kind": fallback["source_kind"] if fallback else None,
            "article_id": fallback["article_id"] if fallback else None,
            "source_date": fallback["source_date"] if fallback else None,
        }

        r.new_file(new_dir + "/.htaccess", release_htaccess)
        for rel, data in sorted(api_payload.items()):
            r.new_file(new_dir + "/" + rel, data)
        if fallback:
            r.new_file(new_dir + "/" + base.FANART_FALLBACK_META, fallback["meta_raw"], 0o600)
            r.new_file(new_dir + "/" + base.FANART_FALLBACK_IMAGE, fallback["image"], 0o600)
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
            report["bridge_action"] = install_or_verify_bridge(r, changes)

            report["canonical_checks"] = canonical_smoke(rid)
            report["fanart_check"] = fanart_smoke(rid)
            report["personal_host_check"] = personal_host_smoke()
        except BaseException:
            rollback(r, changes)
            report["phase"] = "rolled_back"
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            raise

        report["phase"] = "active"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("MIR STABLE HOST BRIDGE VERIFIED:", rid)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("STOP:", str(exc) if isinstance(exc, base.Stop) else type(exc).__name__)
        raise
