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
        # Older fallback metadata may not carry mime. Recover it from magic bytes
        # when possible; PHP performs its own authoritative finfo check at serve time.
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

    meta_raw = json.dumps(meta, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return {
        "meta_raw": meta_raw,
        "image": image,
        "source_root": label,
        "source_release": release,
        "source_kind": source_kind,
        "article_id": meta.get("articleId"),
        "source_date": meta.get("sourceDate"),
    }


def find_persisted_fanart_fallback(r):
    roots = [
        (SITE_WEB, "canonical-site"),
        ("/web/mir", "legacy-subdomain-mirror"),
        (SHARED_WEB, "legacy-root"),
    ]

    for root, label in roots:
        release_root = root + PREFIX.rstrip("/")
        info = r.info(release_root)
        if info is None or not stat.S_ISDIR(info.st_mode):
            continue

        releases = []
        try:
            for entry in r.s.listdir_attr(release_root):
                if RID_RE.fullmatch(entry.filename) and stat.S_ISDIR(entry.st_mode):
                    releases.append(entry.filename)
        except OSError:
            continue

        for release in sorted(releases, reverse=True)[:100]:
            cache_path = release_root + "/" + release + "/api/_cache/"

            # Preferred path: an already materialized, verified fallback.
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

            # Recovery path for older releases: reconstruct the fallback from the
            # successful fanart/image cache states used by the previous deployer.
            fanart_state = base.parse_cache_value(
                r.read(cache_path + "fanart.state.php", 4 * 1024 * 1024)
            )
            image_state = base.parse_cache_value(
                r.read(cache_path + "image.state.php", 12 * 1024 * 1024)
            )
            if not fanart_state or not image_state:
                continue

            public = fanart_state.get("public")
            source = fanart_state.get("source")
            if not isinstance(public, dict) or public.get("status") != "ok":
                continue
            if not isinstance(source, str) or not base.allowed_fanart_source(source):
                continue
            article_url = public.get("articleUrl")
            if not isinstance(article_url, str) or not base.FANART_ARTICLE_RE.fullmatch(article_url):
                continue
            if image_state.get("id") != hashlib.sha256(source.encode()).hexdigest():
                continue
            mime = image_state.get("mime")
            encoded = image_state.get("data")
            if mime not in base.FANART_IMAGE_MIMES or not isinstance(encoded, str):
                continue
            try:
                image = base64.b64decode(encoded, validate=True)
            except Exception:
                continue
            if not image or len(image) > 6 * 1024 * 1024:
                continue

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
    # The hosting account exposes both domains through the shared /web root.
    # Keep the inherited SFTP ownership/lock checks anchored there; the canonical
    # site payload itself is stored below SITE_WEB.
    base.WEB = SHARED_WEB
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

        fallback_snapshot = find_persisted_fanart_fallback(r)
        report["fanart_fallback"] = {
            "found": fallback_snapshot is not None,
            "source_root": fallback_snapshot["source_root"] if fallback_snapshot else None,
            "source_release": fallback_snapshot["source_release"] if fallback_snapshot else None,
            "source_kind": fallback_snapshot["source_kind"] if fallback_snapshot else None,
            "article_id": fallback_snapshot["article_id"] if fallback_snapshot else None,
            "source_date": fallback_snapshot["source_date"] if fallback_snapshot else None,
        }

        r.new_file(new_dir + "/.htaccess", release_htaccess)
        for rel, data in sorted(api_payload.items()):
            r.new_file(new_dir + "/" + rel, data)
        if fallback_snapshot:
            r.new_file(
                new_dir + "/" + base.FANART_FALLBACK_META,
                fallback_snapshot["meta_raw"],
                0o600,
            )
            r.new_file(
                new_dir + "/" + base.FANART_FALLBACK_IMAGE,
                fallback_snapshot["image"],
                0o600,
            )
        for rel in sorted(manifest):
            r.new_file(new_dir + "/" + rel, (dist / rel).read_bytes())

        report["phase"] = "uploaded"
        report["preview_checks"] = preview_smoke(rid)

        fanart_url = CANONICAL_ORIGIN + PREFIX + rid + "/api/naver-fanart.php"
        code, body, _ = base.http(fanart_url)
        try:
            fanart_payload = json.loads(body)
        except Exception:
            fanart_payload = {}
        fanart_ok = (
            code == 200
            and fanart_payload.get("status") == "ok"
            and isinstance(fanart_payload.get("imageUrl"), str)
            and bool(fanart_payload.get("imageUrl"))
        )
        report["fanart_preview"] = {
            "status": code,
            "fanart_status": fanart_payload.get("status"),
            "fallback": bool(fanart_payload.get("fallback")),
            "reason": fanart_payload.get("reason"),
            "passed": fanart_ok,
        }
        if not fanart_ok:
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            raise base.Stop("Fanart preview is unavailable")

        image_url = fanart_payload["imageUrl"]
        if image_url.startswith("/"):
            image_url = CANONICAL_ORIGIN + image_url
        image_code, image_body, image_type = base.http(image_url, limit=7 * 1024 * 1024)
        image_ok = image_code == 200 and image_type.startswith("image/") and len(image_body) > 0
        report["fanart_image_preview"] = {
            "status": image_code,
            "content_type": image_type,
            "bytes": len(image_body),
            "passed": image_ok,
        }
        if not image_ok:
            raise base.Stop("Fanart fallback image is unavailable")

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
