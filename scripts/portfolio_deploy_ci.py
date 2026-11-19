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
    if observed != ALLOWED:
        stop("File manifest does not match allowlist")
    html = files["index.html"]
    if not any(marker in html for marker in (
        b'data-site="yeop-portfolio-v1"',
        b'data-site="yeop-portfolio-v2"',
    )):
        stop("Portfolio ownership marker is missing")
    if b'data-site="yeop-portfolio-v2"' in html:
        # Career-first layout: do not accidentally promote hobby projects.
        required = (b'id="project-air"', b'id="project-water"',
                    b'id="project-haps"', b'id="project-plan"',
                    b'id="experience"', b'id="side"')
        if not all(marker in html for marker in required):
            stop("Professional-work case study markers are incomplete")
        if html.index(b'id="project-air"') >= html.index(b'id="side"'):
            stop("Hobby section must not precede professional work")
    for entry in ["assets/site.css", "assets/site.js", "assets/favicon.svg"]:
        if b'"/assets/' + entry.split("/")[-1].encode() not in files["index.html"]:
            stop("Expected asset reference missing: " + entry)
    return sha, files


def release_files(sha, files):
    rid = sha[:12]
    patched = dict(files)
    html = patched["index.html"]
    if html.count(b"</head>") != 1 or html.count(b'"/assets/') != 3:
        stop("Unexpected HTML asset references")
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
    for path in ("assets/site.css", "assets/site.js", "assets/favicon.svg"):
        code, response = get(PERSONAL_ORIGIN + "/_portfolio_releases/" + rid + "/" + path, 180_000)
        if code != 200 or response != files[path]:
            stop("Live versioned asset failed: " + path)
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
