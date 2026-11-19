#!/usr/bin/env python3
"""Deploy only seirian/seirian.github.io@main into an isolated yeop.net release.

This script runs in the existing MIR repository because only that repository
holds the Inour SFTP secret. It never edits MIR's files, routes or releases.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

import yeop_deploy_ci as shared

SOURCE_REPOSITORY = "https://github.com/seirian/seirian.github.io"
SOURCE_ROOT = Path("portfolio-source")
WEB = "/web"
RELEASE_ROOT = WEB + "/_portfolio_releases"
ROUTER = WEB + "/.htaccess"
PERSONAL_ORIGIN = "https://yeop.net"
MIR_ORIGIN = "https://mir.yeop.net"
BEGIN = b"# PORTFOLIO-ROOT-V1 BEGIN\n"
END = b"# PORTFOLIO-ROOT-V1 END\n"
MIR_BRIDGE_MARKER = b"# MIR-SUBDOMAIN-BRIDGE-V1"
ALLOWED = {
    "index.html",
    "assets/site.css",
    "assets/site.js",
    "assets/favicon.svg",
    "assets/avatar-yeop.webp",
    "assets/og-portfolio.jpg",
    "robots.txt",
    "sitemap.xml",
}


def stop(message):
    raise shared.Stop("Portfolio deployment stopped: " + message)


def git(*args):
    return subprocess.check_output(["git", "-C", str(SOURCE_ROOT), *args], text=True).strip()


def read_source():
    sha = git("rev-parse", "--verify", "HEAD")
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        stop("Unexpected source SHA")
    remote = git("remote", "get-url", "origin").removesuffix(".git").rstrip("/")
    if remote != SOURCE_REPOSITORY:
        stop("Checkout source is not the authorized portfolio repository")
    # The calling workflow pins the checkout ref to main. Reject shallow or
    # modified work trees, and never execute code from that checkout.
    if git("status", "--porcelain"):
        stop("Portfolio checkout has uncommitted changes")
    site = SOURCE_ROOT / "site"
    if not site.is_dir() or site.is_symlink():
        stop("Missing site directory")
    observed = set()
    files = {}
    for entry in sorted(site.rglob("*")):
        if entry.is_symlink():
            stop("Symlink in portfolio tree")
        if entry.is_dir():
            continue
        rel = entry.relative_to(site).as_posix()
        observed.add(rel)
        if rel not in ALLOWED or not entry.is_file() or entry.stat().st_size > 180_000:
            stop("Unexpected portfolio source file: " + rel)
        files[rel] = entry.read_bytes()
    allowed_without_social = ALLOWED - {"assets/og-portfolio.jpg"}
    legacy_allowed = allowed_without_social - {"assets/avatar-yeop.webp"}
    if observed not in (ALLOWED, allowed_without_social, legacy_allowed):
        stop("File manifest does not match allowlist")
    html = files["index.html"]
    if not any(marker in html for marker in (
        b'data-site="yeop-portfolio-v1"',
        b'data-site="yeop-portfolio-v2"',
        b'data-site="yeop-portfolio-v3"',
        b'data-site="yeop-portfolio-v4"',
    )):
        stop("Portfolio ownership marker is missing")
    if b'data-site="yeop-portfolio-v3"' in html or b'data-site="yeop-portfolio-v4"' in html:
        # All Notion-documented professional projects must be present
        # and published before the separate personal hobby section.
        project_ids = (
            "sme", "kb-fcc", "fitpet", "eqst", "groupware", "learningpro",
            "judicial", "kifin", "health-edu", "startup-school",
            "avalon", "samsung-learning",
        )
        required = (b'id="work"', b'id="career"', b'id="skills"',
                    b'id="about"', b'id="side"') + tuple(
            ('id="project-' + key + '"').encode() for key in project_ids
        )
        if not all(marker in html for marker in required):
            stop("Notion-sourced professional project markers are incomplete")
        if html.count(b'class="project-card ') != 12:
            stop("Exactly twelve Notion project cards are required")
        for section in (b'id="work"', b'id="career"', b'id="skills"'):
            if html.index(section) >= html.index(b'id="side"'):
                stop("Hobby section must come after professional content")
        for sensitive in (b"1984. 09. 25", "남부순환로".encode()):
            if sensitive in html:
                stop("Sensitive personal information in public portfolio")
    elif b'data-site="yeop-portfolio-v2"' in html:
        required = (b'id="project-air"', b'id="project-water"',
                    b'id="project-haps"', b'id="project-plan"',
                    b'id="experience"', b'id="side"')
        if not all(marker in html for marker in required):
            stop("Professional-work case study markers are incomplete")
        if html.index(b'id="project-air"') >= html.index(b'id="side"'):
            stop("Hobby section must not precede professional work")
    if b'data-site="yeop-portfolio-v4"' in html:
        if "assets/avatar-yeop.webp" not in files:
            stop("v4 requires the source Notion photo asset")
        must_contain = (
            "13년 8개월".encode(),
            b"(2012.03 ~ 2026.02)",
            "개발 경력 기간".encode(),
            "함께 고민하겠습니다.".encode(),
            b"https://isegye-idol.kr/",
        )
        if not all(key in html for key in must_contain):
            stop("Portfolio v4 content requirements are missing")
        if html.count(b'class="project-scene"') != 12:
            stop("Exactly twelve project illustrations are required")
        if not files["assets/avatar-yeop.webp"].startswith(b"RIFF"):
            stop("Actual Notion portrait is not a WEBP image")
        if b'property="og:image"' in html:
            if observed != ALLOWED:
                stop("Portfolio sharing metadata requires a durable JPEG asset")
            if html.count(b'property="og:image"') != 1:
                stop("There must be exactly one OG primary image")
            expected_social = (b"https://yeop.net/_portfolio_releases/"
                               b"__PORTFOLIO_RELEASE__/assets/og-portfolio.jpg")
            if html.count(expected_social) != 3:
                stop("OG and Twitter image URLs must reference the same versioned JPEG")
            if b'<meta property="og:image:type" content="image/jpeg">' not in html:
                stop("OG image MIME metadata is missing")
            if b'<meta property="og:image:width" content="1200">' not in html or b'<meta property="og:image:height" content="630">' not in html:
                stop("OG image dimensions are missing")
            jpeg = files["assets/og-portfolio.jpg"]
            if not jpeg.startswith(bytes.fromhex("ffd8ff")) or not (20000 < len(jpeg) < 175000):
                stop("Open Graph preview is not a valid sized JPEG asset")
        elif "assets/og-portfolio.jpg" in files:
            stop("Social image present without absolute sharing metadata")
    expected_assets = ["assets/site.css", "assets/site.js", "assets/favicon.svg"]
    if b'data-site="yeop-portfolio-v4"' in html:
        expected_assets.append("assets/avatar-yeop.webp")
    for entry in expected_assets:
        if b'"/assets/' + entry.split("/")[-1].encode() not in html:
            stop("Expected asset reference missing: " + entry)
    return sha, files


def release_files(sha, files):
    rid = sha[:12]
    patched = dict(files)
    html = patched["index.html"]
    expected_refs = 4 if b'data-site="yeop-portfolio-v4"' in html else 3
    if html.count(b"</head>") != 1 or html.count(b'"/assets/') != expected_refs:
        stop("Unexpected HTML asset references")
    social_marker = b"__PORTFOLIO_RELEASE__"
    if b'property="og:image"' in html:
        if html.count(social_marker) != 3 or "assets/og-portfolio.jpg" not in files:
            stop("Social-sharing release marker is missing or inconsistent")
        html = html.replace(social_marker, rid.encode())
    elif social_marker in html:
        stop("Unrecognized release marker in portfolio HTML")
    html = html.replace(b'"/assets/', b'"/_portfolio_releases/' + rid.encode() + b'/assets/')
    html = html.replace(b"</head>", b'<meta name="portfolio-release" content="' + sha.encode() + b'">\n</head>')
    patched["index.html"] = html
    return rid, patched


def make_block(sha, rid):
    return (
        "# PORTFOLIO-ROOT-V1 BEGIN\n"
        "# Portfolio source: seirian/seirian.github.io refs/heads/main " + sha + "\n"
        "# These host-scoped rules must remain after the MIR bridge.\n"
        "RewriteCond %{HTTP_HOST} ^(?:www\\.)?yeop\\.net(?::[0-9]+)?$ [NC]\n"
        "RewriteRule ^(?:index\\.html)?$ _portfolio_releases/" + rid + "/index.html [L]\n"
        "RewriteCond %{HTTP_HOST} ^(?:www\\.)?yeop\\.net(?::[0-9]+)?$ [NC]\n"
        "RewriteRule ^(robots\\.txt|sitemap\\.xml)$ _portfolio_releases/" + rid + "/$1 [L]\n"
        "# PORTFOLIO-ROOT-V1 END\n"
    ).encode("utf-8")


def bridge_valid(blob):
    return (
        blob.startswith(MIR_BRIDGE_MARKER)
        and b"RewriteCond %{HTTP_HOST} ^mir\\.yeop\\.net" in blob
        and b"RewriteRule ^(.*)$ _mir_site/$1 [L]" in blob
        and len(blob) < 900_000
    )


def apply_portfolio_block(old, replacement):
    if not bridge_valid(old):
        stop("Shared host MIR bridge is absent or different; root left unchanged")
    begin_count, end_count = old.count(BEGIN), old.count(END)
    if begin_count != end_count or begin_count > 1:
        stop("Conflicting portfolio routing markers")
    if begin_count == 0:
        suffix = b"" if old.endswith(b"\n") else b"\n"
        return old + suffix + b"\n" + replacement
    before, after_begin = old.split(BEGIN, 1)
    _current, after_end = after_begin.split(END, 1)
    return before + replacement + after_end


def get(url, max_bytes=300_000):
    request = urllib.request.Request(url, headers={"User-Agent": "YeopPortfolioDeploy/1.0"})
    try:
        response = urllib.request.urlopen(request, timeout=25)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        final = urllib.parse.urlsplit(response.geturl())
        expected = urllib.parse.urlsplit(url)
        if final.hostname != expected.hostname or final.scheme != "https":
            stop("Unexpected HTTP host or scheme change: " + url)
        payload = response.read(max_bytes + 1)
        if len(payload) > max_bytes:
            stop("Unexpectedly large HTTP response: " + url)
        return response.status, payload


def mir_smoke():
    results = {}
    for route in ["/", "/songbook"]:
        code, html = get(MIR_ORIGIN + route, 750_000)
        ok = code == 200 and b"yeop-release" in html and b"<html" in html
        results[route] = {"http": code, "marker_present": b"yeop-release" in html, "passed": ok}
        if not ok:
            stop("MIR preservation smoke check failed: " + route)
    return results


def release_smoke(rid, files):
    results = {}
    for rel, expected in sorted(files.items()):
        code, payload = get(PERSONAL_ORIGIN + "/_portfolio_releases/" + rid + "/" + rel, 200_000)
        ok = code == 200 and hashlib.sha256(payload).digest() == hashlib.sha256(expected).digest()
        results[rel] = {"http": code, "passed": ok}
        if not ok:
            stop("Staged portfolio asset mismatch: " + rel)
    return results


def production_smoke(sha, rid, files):
    results = {}
    for path, expected in [
        ("/", files["index.html"]),
        ("/index.html", files["index.html"]),
        ("/robots.txt", files["robots.txt"]),
        ("/sitemap.xml", files["sitemap.xml"]),
    ]:
        code, response = get(PERSONAL_ORIGIN + path, 250_000)
        ok = code == 200 and response == expected
        results[path] = {"http": code, "passed": ok}
        if not ok:
            stop("Personal-host route failed: " + path)
    assets = ("assets/site.css", "assets/site.js", "assets/favicon.svg")
    if "assets/avatar-yeop.webp" in files:
        assets += ("assets/avatar-yeop.webp",)
    if "assets/og-portfolio.jpg" in files:
        assets += ("assets/og-portfolio.jpg",)
    for path in assets:
        code, response = get(PERSONAL_ORIGIN + "/_portfolio_releases/" + rid + "/" + path, 180_000)
        if code != 200 or response != files[path]:
            stop("Live versioned asset failed: " + path)
    if "assets/og-portfolio.jpg" in files:
        expected_og = (PERSONAL_ORIGIN + "/_portfolio_releases/" + rid
                       + "/assets/og-portfolio.jpg")
        if files["index.html"].count(
            ('content="' + expected_og + '"').encode("utf-8")
        ) != 3:
            stop("Public OG/Twitter metadata must use a unique versioned JPEG")
        request = urllib.request.Request(
            expected_og, headers={"User-Agent": "YeopPortfolioDeploy/1.0"}
        )
        with urllib.request.urlopen(request, timeout=25) as response:
            if response.status != 200 or response.headers.get_content_type() != "image/jpeg":
                stop("OG JPEG is not served with HTTP 200 image/jpeg")
        results["social_image"] = {"url": expected_og, "mime": "image/jpeg", "passed": True}
    if sha.encode() not in results_body_marker(files["index.html"]):
        stop("Release marker not found")
    return results


def results_body_marker(html):
    return html


def mkdir_owned(remote, path):
    remote.mkdir(path, existing=True)


def upload_release(remote, rid, files):
    mkdir_owned(remote, RELEASE_ROOT)
    release_dir = RELEASE_ROOT + "/" + rid
    if remote.info(release_dir) is None:
        remote.mkdir(release_dir)
    else:
        mkdir_owned(remote, release_dir)
    assets_dir = release_dir + "/assets"
    if remote.info(assets_dir) is None:
        remote.mkdir(assets_dir)
    else:
        mkdir_owned(remote, assets_dir)
    for rel, content in sorted(files.items()):
        target = release_dir + "/" + rel
        current = remote.read(target, 200_000)
        if current is None:
            remote.new_file(target, content)
        elif current != content:
            stop("Immutable release file differs: " + rel)
    return release_dir


def main():
    sha, source = read_source()
    rid, staged = release_files(sha, source)
    report = {"main_sha": sha, "release": rid, "source": "seirian/seirian.github.io@main", "phase": "preflight"}
    outfile = Path("portfolio_deploy_report.json")
    try:
        # Read-only smoke checks first. Never modify a broken MIR installation.
        report["mir_before"] = mir_smoke()
        with shared.Remote() as remote, remote.lock():
            current = remote.read(ROUTER, 900_000)
            if current is None or not bridge_valid(current):
                stop("Shared root router is missing its MIR bridge")
            desired = apply_portfolio_block(current, make_block(sha, rid))
            if current == desired:
                report["phase"] = "unchanged"
                report["personal"] = production_smoke(sha, rid, staged)
                report["mir_after"] = mir_smoke()
                return
            report["release_dir"] = upload_release(remote, rid, staged)
            report["phase"] = "staged"
            report["staging_checks"] = release_smoke(rid, staged)
            # MIR must still be healthy before changing any shared root routing.
            report["mir_pre_activation"] = mir_smoke()
            report["phase"] = "activating"
            remote.atomic_replace(ROUTER, desired, current)
            try:
                report["personal"] = production_smoke(sha, rid, staged)
                report["mir_after"] = mir_smoke()
                if remote.read(ROUTER, 900_000) != desired:
                    stop("Shared routing changed unexpectedly after activation")
            except BaseException:
                if remote.read(ROUTER, 900_000) == desired:
                    remote.atomic_replace(ROUTER, current, desired)
                report["phase"] = "rolled_back"
                raise
            report["phase"] = "active"
    except BaseException as exc:
        report["error_type"] = type(exc).__name__
        raise
    finally:
        outfile.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Portfolio deployment state:", report["phase"], "main:", sha[:12])


if __name__ == "__main__":
    main()
