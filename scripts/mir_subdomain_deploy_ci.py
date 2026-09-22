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

SUBDOMAIN_WEB = "/web/mir"
OLD_INTERNAL_WEB = "/web/_mir_site"
PERSONAL_WEB = "/web"
CANONICAL_ORIGIN = "https://mir.yeop.net"
PERSONAL_ORIGIN = "https://yeop.net"
PREFIX = "/_yeop_releases/"
RID_RE = re.compile(r"r[0-9]{14}_[a-f0-9]{8}")
OWNER_UID = 5048

ROOT_MARKER = b"# MIR-SUBDOMAIN-ROOT-V4 "
OLD_ROOT_MARKERS = (
    b"# MIR-SUBDOMAIN-DEPLOY-V1 ",
    b"# MIR-CANONICAL-ROUTER-V1 ",
    b"# MIR-SITE-ROOT-V2 ",
)
PERSONAL_MIR_MARKERS = (
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


def valid_root(old: bytes | None) -> bool:
    if old is None:
        return True
    return old.startswith(ROOT_MARKER) or any(old.startswith(marker) for marker in OLD_ROOT_MARKERS)


def root_htaccess(rid: str) -> bytes:
    return (
        f"# MIR-SUBDOMAIN-ROOT-V4 {rid}\n"
        "DirectoryIndex index.html\n"
        "RewriteEngine On\n"
        "RewriteRule ^api/(?:_.*|config\\.php)(?:/|$) - [F,L]\n"
        f"RewriteRule ^$ _yeop_releases/{rid}/index.html [L]\n"
        f"RewriteRule ^(?:mir|band|history|schedule|gallery(?:/[^/]+)?|account|admin)/?$ "
        f"_yeop_releases/{rid}/index.html [L,QSA]\n"
        "# Release-scoped assets and API paths are served directly from disk.\n"
    ).encode("utf-8")


def recognized_test_index(data: bytes | None) -> bool:
    if data is None:
        return True
    lowered = data.lower()
    return (
        b"mir.yeop.net" in lowered
        and (
            "접속".encode("utf-8") in data
            or b"test" in lowered
            or b"default index" in lowered
        )
    )


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


def find_fallback(r):
    # First use data already living under the subdomain document root. The old
    # internal root is read only as a one-way migration source after the domain move.
    roots = [
        (SUBDOMAIN_WEB, "subdomain-root"),
        (OLD_INTERNAL_WEB, "old-internal-root"),
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


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def redirect_status(url: str):
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": "MirSubdomainDeploy/1.0"})
    try:
        with opener.open(req, timeout=20) as res:
            return res.status, res.headers.get("Location", "")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Location", "")


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


def remove_if_exactly_managed(r, path: str, markers: tuple[bytes, ...], changes: list) -> bool:
    old = r.read(path, 4 * 1024 * 1024)
    if old is None:
        return False
    if not any(old.startswith(marker) for marker in markers):
        return False
    r.s.remove(path)
    changes.append(("remove", path, old, None))
    return True


def remove_test_index(r, changes: list) -> None:
    path = SUBDOMAIN_WEB + "/index.html"
    old = r.read(path, 4 * 1024 * 1024)
    if old is None:
        return
    if not recognized_test_index(old):
        raise base.Stop("Refusing unmanaged subdomain index.html")
    r.s.remove(path)
    changes.append(("remove", path, old, None))


def rollback(r, changes: list) -> None:
    for operation, path, old, new in reversed(changes):
        try:
            current = r.read(path, 4 * 1024 * 1024)
            if operation == "replace":
                if old is None and current == new:
                    r.s.remove(path)
                elif old is not None and current == new:
                    r.atomic_replace(path, old, new)
            elif operation == "remove" and old is not None and current is None:
                r.new_file(path, old)
        except Exception:
            print("WARNING: rollback could not restore", path)


def main():
    rid = os.environ.get("RELEASE_ID", "")
    if not RID_RE.fullmatch(rid):
        raise base.Stop("Invalid RELEASE_ID")

    dist = Path(os.environ.get("DIST_DIR", "dist")).resolve()
    if not (dist / "index.html").is_file():
        raise base.Stop("dist/index.html missing")

    base.SERVER_SOURCE = Path(os.environ.get("SERVER_SOURCE_DIR", "server")).resolve()
    # The MIR deploy is anchored inside the subdomain's own document root. Future
    # yeop.net projects are outside the deployment lock, release path and router.
    base.WEB = SUBDOMAIN_WEB
    base.ORIGIN = CANONICAL_ORIGIN

    manifest = base.local_manifest(dist)
    api_payload, release_htaccess, server_files = base.server_payload(rid)

    report = {
        "release": rid,
        "source_commit": os.environ.get("GITHUB_SHA", ""),
        "canonical_origin": CANONICAL_ORIGIN,
        "personal_origin": PERSONAL_ORIGIN,
        "subdomain_document_root": SUBDOMAIN_WEB,
        "phase": "starting",
        "files": manifest,
        "server_files": server_files,
    }
    report_path = Path("deploy_report.json")
    backup_dir = Path("deployment-backup")
    backup_dir.mkdir(exist_ok=True)

    with base.Remote() as r, r.lock():
        sub_info = r.info(SUBDOMAIN_WEB)
        if sub_info is None or not stat.S_ISDIR(sub_info.st_mode) or sub_info.st_uid != OWNER_UID:
            raise base.Stop("Unexpected MIR subdomain document root")

        ensure_dir(r, SUBDOMAIN_WEB + PREFIX.rstrip("/"))

        for label, path in [
            ("mir.htaccess", SUBDOMAIN_WEB + "/.htaccess"),
            ("mir.index.html", SUBDOMAIN_WEB + "/index.html"),
            ("personal.htaccess", PERSONAL_WEB + "/.htaccess"),
        ]:
            data = r.read(path, 4 * 1024 * 1024)
            if data is not None:
                (backup_dir / label).write_bytes(data)

        new_dir = SUBDOMAIN_WEB + PREFIX + rid
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

        fallback = find_fallback(r)
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

        # SFTP-side staged verification before any routing change.
        if r.read(new_dir + "/index.html", 4 * 1024 * 1024) != (dist / "index.html").read_bytes():
            raise base.Stop("Staged index verification failed")
        if r.read(new_dir + "/api/health.php", 1024 * 1024) != api_payload["api/health.php"]:
            raise base.Stop("Staged health endpoint verification failed")
        report["phase"] = "uploaded"

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
                SUBDOMAIN_WEB + "/.htaccess",
                root_htaccess(rid),
                valid_root,
                changes,
            )
            remove_test_index(r, changes)

            # One-time cleanup of the MIR redirect/router previously installed at
            # yeop.net's personal root. Future MIR deployments do not write there.
            removed_personal_router = remove_if_exactly_managed(
                r,
                PERSONAL_WEB + "/.htaccess",
                PERSONAL_MIR_MARKERS,
                changes,
            )
            report["removed_old_personal_mir_router"] = removed_personal_router

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
        print("MIR SUBDOMAIN VERIFIED:", rid)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("STOP:", str(exc) if isinstance(exc, base.Stop) else type(exc).__name__)
        raise
