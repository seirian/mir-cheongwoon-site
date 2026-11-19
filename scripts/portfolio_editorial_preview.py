#!/usr/bin/env python3
"""Publish a single isolated editorial review of yeop.net; never touch production.

The credential-owning MIR repository executes this trusted script. It reads
ONLY the authorized preview HTML from the portfolio repository's develop
branch and its existing public Notion avatar. No preview-supplied code runs
on the CI runner. There is no routing or DNS mutation.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request

from yeop_deploy_ci import Remote, Stop

SOURCE_ROOT = Path("portfolio-source")
REVIEW_REL = "preview/editorial/index.html"
AVATAR_REL = "site/assets/avatar-yeop.webp"
PREVIEW_NAME = "editorial-20261119-v2"
ROOT = "/web"
PARENT = ROOT + "/_portfolio_previews"
RELEASE = PARENT + "/" + PREVIEW_NAME
ORIGIN = "https://yeop.net"
REVIEW_URL = ORIGIN + "/_portfolio_previews/" + PREVIEW_NAME + "/index.html"
MIR_ORIGIN = "https://mir.yeop.net"
EXPECTED_REPOSITORY = "https://github.com/seirian/seirian.github.io"
REPORT = Path("portfolio_preview_report.json")


def checked_git(*args):
    return subprocess.check_output(
        ["git", "-C", str(SOURCE_ROOT), *args],
        text=True,
        stderr=subprocess.DEVNULL
    ).strip()


def get(url: str, limit: int = 250_000):
    req = urllib.request.Request(url, headers={
        "User-Agent": "YEOP-Editorial-Review-Check/1.0",
        "Cache-Control": "no-cache",
    })
    try:
        response = urllib.request.urlopen(req, timeout=24)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        if response.geturl().split("/")[2].lower() != url.split("/")[2].lower():
            raise Stop("Review check unexpectedly changed hosts")
        body = response.read(limit + 1)
        if len(body) > limit:
            raise Stop("Review HTTP response exceeded limit")
        return response.status, body, response.headers.get_content_type()


def load_release():
    remote = checked_git("remote", "get-url", "origin").removesuffix(".git")
    if remote != EXPECTED_REPOSITORY:
        raise Stop("Preview source repository is not the authorized YEOP portfolio")
    if checked_git("status", "--porcelain"):
        raise Stop("Preview checkout contains local modifications")
    sha = checked_git("rev-parse", "HEAD")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise Stop("Unexpected preview source SHA")
    preview = SOURCE_ROOT / REVIEW_REL
    avatar = SOURCE_ROOT / AVATAR_REL
    for p in (preview, avatar):
        if not p.is_file() or p.is_symlink():
            raise Stop("Review source asset missing or symlinked")
    html = preview.read_bytes()
    face = avatar.read_bytes()
    if not (12_000 < len(html) < 140_000):
        raise Stop("Review HTML size outside allowlist")
    if b'class="project-entry"' not in html or html.count(b'class="project-entry"') != 12:
        raise Stop("Review must include all 12 original professional projects")
    if b'<meta name="robots" content="noindex,nofollow,noarchive">' not in html:
        raise Stop("Review must opt out of indexing")
    if b'./avatar-yeop.jpg' not in html:
        raise Stop("Review must use the original portrait locally")
    if not face.startswith(b"RIFF") or not (1000 < len(face) < 100_000):
        raise Stop("Notion avatar is missing or not WebP")
    if b'13\xeb\x85\x84 8\xea\xb0\x9c\xec\x9b\x94' not in html or "중소기업중앙회".encode() not in html:
        raise Stop("Required Notion career evidence is missing")
    if b'src="/_portfolio_releases/' in html or b'__PORTFOLIO_RELEASE__' in html:
        raise Stop("Preview must not pretend to be production")
    from io import BytesIO
    from PIL import Image
    with Image.open(BytesIO(face)) as original:
        stream = BytesIO()
        original.convert("RGB").save(stream, "JPEG", quality=88, optimize=True)
        jpeg = stream.getvalue()
    if not jpeg.startswith(bytes.fromhex("ffd8ff")) or not (5000 < len(jpeg) < 80000):
        raise Stop("Generated review JPEG failed validation")
    return sha, {"index.html": html, "avatar-yeop.jpg": jpeg}


def assert_untouched(before, after, label):
    if before != after:
        raise Stop("Unrelated live site changed while deploying review: " + label)


def main():
    sha, files = load_release()
    report = {
        "state": "preflight",
        "preview_url": REVIEW_URL,
        "source_branch": "develop",
        "source_sha": sha,
        "release_dir": RELEASE,
        "files": {k: hashlib.sha256(v).hexdigest() for k, v in files.items()},
        "production_changes": 0,
        "mir_changes": 0,
    }
    try:
        live_code, live_html, _ = get(ORIGIN + "/", 260_000)
        mir_code, mir_html, _ = get(MIR_ORIGIN + "/", 750_000)
        if live_code != 200 or b'name="portfolio-release"' not in live_html:
            raise Stop("Live portfolio baseline is unavailable")
        if mir_code != 200 or b'name="yeop-release"' not in mir_html:
            raise Stop("MIR fan archive baseline is unavailable")

        with Remote() as r, r.lock():
            router = r.read(ROOT + "/.htaccess", 900_000)
            if not router or not router.startswith(b"# MIR-SUBDOMAIN-BRIDGE-V1"):
                raise Stop("Original MIR host bridge not recognized")
            for folder in (PARENT, RELEASE):
                r.mkdir(folder, existing=True)
            report["state"] = "upload"
            for relative, data in files.items():
                target = RELEASE + "/" + relative
                existing = r.read(target, 250_000)
                if existing is None:
                    r.new_file(target, data)
                elif existing != data:
                    raise Stop("Refusing to overwrite a different review file: " + relative)
                if r.read(target, 250_000) != data:
                    raise Stop("Review upload mismatch: " + relative)
            report["state"] = "verify"
            for relative, expected in files.items():
                url = ORIGIN + "/_portfolio_previews/" + PREVIEW_NAME + "/" + relative
                status, body, mime = get(url, 250_000)
                expected_type = "text/html" if relative.endswith(".html") else "image/jpeg"
                if status != 200 or body != expected or mime != expected_type:
                    raise Stop("Review HTTP check failed for " + relative + ": " + str((status, mime)))
                report["files"][relative] = {
                    "sha256": hashlib.sha256(body).hexdigest(),
                    "status": status,
                    "mime": mime,
                }
            if r.read(ROOT + "/.htaccess", 900_000) != router:
                raise Stop("Shared .htaccess was modified while deploying review")
            new_code, new_html, _ = get(ORIGIN + "/", 260_000)
            new_mir_code, new_mir_html, _ = get(MIR_ORIGIN + "/", 750_000)
            if new_code != live_code or new_mir_code != mir_code:
                raise Stop("Production host status changed after review upload")
            live_marker = re.search(rb'portfolio-release" content="([^"]+)"', live_html)
            new_live_marker = re.search(rb'portfolio-release" content="([^"]+)"', new_html)
            mir_marker = re.search(rb'yeop-release" content="([^"]+)"', mir_html)
            new_mir_marker = re.search(rb'yeop-release" content="([^"]+)"', new_mir_html)
            if not live_marker or not new_live_marker or live_marker.group(1) != new_live_marker.group(1):
                raise Stop("Production portfolio release changed")
            if not mir_marker or not new_mir_marker or mir_marker.group(1) != new_mir_marker.group(1):
                raise Stop("MIR release changed")
            report["verified_main_release"] = live_marker.group(1).decode()
            report["verified_mir_release"] = mir_marker.group(1).decode()
            report["state"] = "published"
    except BaseException as exc:
        report["error"] = type(exc).__name__
        raise
    finally:
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Editorial portfolio preview status:", report["state"])
        print("Preview URL:", REVIEW_URL)


if __name__ == "__main__":
    main()
