#!/usr/bin/env python3
from __future__ import annotations
import base64, contextlib, errno, hashlib, json, os, posixpath, re, socket, stat, sys, urllib.error, urllib.request
from html.parser import HTMLParser
from pathlib import Path

HOST, USER, PORT = "seirian.inour.net", "seirian", 1922
FINGERPRINT = "SHA256:aAMSU6UVE9lIpzE/XifPGYrEGcHO7HQDTMURgfrinRc"
WEB = "/web"
SUBDOMAIN_WEB = "/web/mir"
ORIGIN = "https://yeop.net"
PREFIX = "/_yeop_releases/"
OWNER_UID = 5048
RID_RE = re.compile(r"r[0-9]{14}_[a-f0-9]{8}")
SERVER_SOURCE = Path(os.environ.get("SERVER_SOURCE_DIR", "server")).resolve()
API_FILES = [
    "api/_cache/.htaccess",
    "api/_cache.php",
    "api/_core.php",
    "api/_entry.php",
    "api/config.php",
    "api/health.php",
    "api/naver-fanart-image.php",
    "api/naver-fanart.php",
    "api/soop-live.php",
]
ROOT_PRESERVE = ["index.html", "index.php", "standard_index.html", "robots.txt", "favicon.ico"]
CACHE_PREFIX = b"<?php http_response_code(404); exit; __halt_compiler();\n"
FANART_FALLBACK_META = "api/_cache/fanart-fallback.json"
FANART_FALLBACK_IMAGE = "api/_cache/fanart-fallback.bin"
FANART_BOARD = "https://cafe.naver.com/f-e/cafes/31003156/menus/10?viewType=I"
FANART_ARTICLE_RE = re.compile(r"https://cafe\.naver\.com/f-e/cafes/31003156/articles/[0-9]+")
FANART_IMAGE_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"}

class Stop(RuntimeError):
    pass

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def http(url: str, limit: int = 20 * 1024 * 1024):
    req = urllib.request.Request(url, headers={"User-Agent": "YeopGitHubDeploy/1.0", "Accept": "*/*"})
    try:
        res = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as exc:
        res = exc
    with res:
        body = res.read(limit + 1)
        if len(body) > limit:
            raise Stop("HTTP response exceeded limit")
        return res.status, body, res.headers.get("Content-Type", "")

class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"])
        if tag == "link" and values.get("rel") == "stylesheet" and values.get("href"):
            self.assets.append(values["href"])

class Remote:
    def __enter__(self):
        import paramiko
        self.t = None
        self.s = None
        sock = socket.create_connection((HOST, PORT), timeout=15)
        self.t = paramiko.Transport(sock)
        self.t.get_security_options().key_types = ("ssh-ed25519",)
        self.t.start_client(timeout=15)
        key = self.t.get_remote_server_key()
        got = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
        if key.get_name() != "ssh-ed25519" or got != FINGERPRINT:
            raise Stop("HOST KEY MISMATCH; password was not sent")
        password = os.environ.get("YEOP_SFTP_PASSWORD", "")
        if not password:
            raise Stop("YEOP_SFTP_PASSWORD secret is missing")
        try:
            self.t.auth_password(USER, password, fallback=True)
        finally:
            password = None
        if not self.t.is_authenticated():
            raise Stop("SFTP authentication incomplete")
        self.s = paramiko.SFTPClient.from_transport(self.t)
        self.s.get_channel().settimeout(30)
        info = self.s.lstat(WEB)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != OWNER_UID:
            raise Stop("Unexpected /web type or owner")
        return self
    def __exit__(self, *args):
        if self.s is not None:
            self.s.close()
        if self.t is not None:
            self.t.close()
    def info(self, path):
        try:
            return self.s.lstat(path)
        except OSError as exc:
            if exc.errno == errno.ENOENT:
                return None
            raise
    def read(self, path, limit=100 * 1024 * 1024):
        info = self.info(path)
        if info is None:
            return None
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise Stop("Unexpected remote file type/size: " + path)
        with self.s.open(path, "rb") as fh:
            data = fh.read(limit + 1)
        if len(data) > limit:
            raise Stop("Remote file exceeded limit: " + path)
        return data
    def mkdir(self, path, existing=False):
        info = self.info(path)
        if info is not None:
            if not existing or not stat.S_ISDIR(info.st_mode) or info.st_uid != OWNER_UID:
                raise Stop("Refusing existing path: " + path)
            return
        self.s.mkdir(path, 0o755)
        self.s.chmod(path, 0o755)
    def new_file(self, path, data, mode=0o644):
        if self.info(path) is not None:
            raise Stop("Refusing overwrite: " + path)
        with self.s.open(path, "wx") as fh:
            fh.write(data)
            fh.flush()
        self.s.chmod(path, mode)
        if self.read(path) != data:
            raise Stop("Upload read-back mismatch: " + path)
    def atomic_replace(self, path, data, expected):
        current = self.read(path, 1024 * 1024)
        if current != expected:
            raise Stop("Remote root file changed during deploy")
        tmp = path + ".gha-" + os.urandom(8).hex()
        self.new_file(tmp, data)
        try:
            self.s.posix_rename(tmp, path)
        except BaseException:
            try:
                if self.read(tmp, 1024 * 1024) == data:
                    self.s.remove(tmp)
            except Exception:
                pass
            raise
        if self.read(path, 1024 * 1024) != data:
            raise Stop("Atomic replace verification failed")
    @contextlib.contextmanager
    def lock(self):
        path = WEB + "/.yeop-migration-lock"
        if self.info(path) is not None:
            raise Stop("Migration lock exists")
        self.s.mkdir(path, 0o700)
        try:
            yield
        finally:
            try:
                self.s.rmdir(path)
            except OSError:
                print("WARNING: migration lock remains")

def root_release(root_bytes: bytes) -> str:
    first = root_bytes.splitlines()[0].decode("utf-8", "strict")
    m = re.fullmatch(r"# YEOP-DEPLOY-V1 (r[0-9]{14}_[a-f0-9]{8})", first)
    if not m:
        raise Stop("Existing root .htaccess is not a recognized YEOP-DEPLOY-V1 file")
    return m.group(1)

def local_manifest(dist: Path):
    out = {}
    for fp in sorted(dist.rglob("*")):
        if fp.is_file():
            rel = fp.relative_to(dist).as_posix()
            out[rel] = {"sha256": sha(fp.read_bytes()), "size": fp.stat().st_size}
    return out

def server_payload(rid: str):
    release_path = SERVER_SOURCE / "release.htaccess"
    if not release_path.is_file() or release_path.is_symlink():
        raise Stop("server/release.htaccess is missing or invalid")
    release_htaccess = release_path.read_bytes()
    payload = {}
    server_files = {".htaccess": {"sha256": sha(release_htaccess), "size": len(release_htaccess)}}
    for rel in API_FILES:
        path = SERVER_SOURCE / rel
        if not path.is_file() or path.is_symlink():
            raise Stop("Server source file is missing or invalid: " + rel)
        data = path.read_bytes()
        if rel == "api/config.php":
            if data.count(b"RELEASE_ID") != 1 or data.count(b"RELEASE_BASE") != 1:
                raise Stop("Server config template placeholders are invalid")
            data = data.replace(b"RELEASE_ID", rid.encode())
            data = data.replace(b"RELEASE_BASE", (PREFIX + rid + "/").encode())
        elif b"RELEASE_ID" in data or b"RELEASE_BASE" in data:
            raise Stop("Unexpected release placeholder in server source: " + rel)
        payload[rel] = data
        server_files[rel] = {"sha256": sha(data), "size": len(data)}
    return payload, release_htaccess, server_files

def parse_cache_value(raw: bytes | None):
    if not raw or not raw.startswith(CACHE_PREFIX):
        return None
    try:
        state = json.loads(raw[len(CACHE_PREFIX):])
    except Exception:
        return None
    value = state.get("value") if isinstance(state, dict) else None
    return value if isinstance(value, dict) else None

def allowed_fanart_source(url: str) -> bool:
    try:
        parsed = urllib.parse.urlsplit(url)
    except Exception:
        return False
    host = (parsed.hostname or "").lower()
    allowed = host == "pstatic.net" or host.endswith(".pstatic.net") or host == "naver.net" or host.endswith(".naver.net") or host == "naver.com" or host.endswith(".naver.com")
    return parsed.scheme == "https" and allowed and not parsed.username and not parsed.password and parsed.port in (None, 443)

def find_fanart_snapshot(r):
    base = WEB + PREFIX.rstrip("/")
    try:
        entries = r.s.listdir_attr(base)
    except OSError:
        return None
    releases = []
    for entry in entries:
        if RID_RE.fullmatch(entry.filename) and stat.S_ISDIR(entry.st_mode) and entry.st_uid == OWNER_UID:
            releases.append(entry.filename)
    for release in sorted(releases, reverse=True)[:60]:
        release_dir = base + "/" + release
        fanart = parse_cache_value(r.read(release_dir + "/api/_cache/fanart.state.php", 4 * 1024 * 1024))
        if not fanart:
            continue
        public = fanart.get("public")
        source = fanart.get("source")
        if not isinstance(public, dict) or public.get("status") != "ok" or not isinstance(source, str) or not allowed_fanart_source(source):
            continue
        article_url = public.get("articleUrl")
        if not isinstance(article_url, str) or not FANART_ARTICLE_RE.fullmatch(article_url):
            continue
        image = parse_cache_value(r.read(release_dir + "/api/_cache/image.state.php", 12 * 1024 * 1024))
        if not image or image.get("id") != hashlib.sha256(source.encode()).hexdigest():
            continue
        mime = image.get("mime")
        encoded = image.get("data")
        if mime not in FANART_IMAGE_MIMES or not isinstance(encoded, str):
            continue
        try:
            image_bytes = base64.b64decode(encoded, validate=True)
        except Exception:
            continue
        if not image_bytes or len(image_bytes) > 6 * 1024 * 1024:
            continue
        fallback_id = sha(image_bytes)
        metadata = {
            "id": fallback_id,
            "mime": mime,
            "boardUrl": FANART_BOARD,
            "articleId": int(public.get("articleId") or 0),
            "title": str(public.get("title") or "오늘의 팬아트")[:500],
            "author": str(public.get("author") or "작성자")[:200],
            "articleUrl": article_url,
            "sourceDate": str(public.get("sourceDate") or "")[:10],
        }
        return {"source_release": release, "metadata": metadata, "image": image_bytes}
    return None

def smoke(rid: str, local_files: dict):
    base = ORIGIN + PREFIX + rid + "/"
    results = {}
    for route in ["", "mir", "schedule", "gallery", "account", "admin"]:
        url = base + route
        code, body, _ = http(url)
        ok = code == 200 and rid.encode() in body
        results[route or "/"] = {"status": code, "passed": ok}
        if not ok:
            raise Stop("Preview route failed: " + route)
    code, body, _ = http(base + "api/health.php")
    try:
        health = json.loads(body)
    except Exception as exc:
        raise Stop("PHP health did not return JSON") from exc
    if code != 200 or health.get("status") != "ready" or health.get("release") != rid or not health.get("cache_read_write"):
        raise Stop("PHP/cache health failed")
    results["health"] = health
    for path in ["api/config.php", "api/_core.php", "api/_cache/health.state.php", FANART_FALLBACK_META, FANART_FALLBACK_IMAGE]:
        code, _, _ = http(base + path)
        if code not in (403, 404):
            raise Stop("Internal file is web-accessible: " + path)
    code, _, _ = http(base + "assets/no-such-migration-asset.js")
    if code != 404:
        raise Stop("Missing asset did not return 404")
    code, html, _ = http(base + "index.html")
    parser = AssetParser()
    parser.feed(html.decode("utf-8"))
    if not parser.assets:
        raise Stop("No bundled assets found")
    for path in parser.assets:
        if not path.startswith(PREFIX + rid + "/"):
            raise Stop("Unexpected asset path")
        rel = path[len(PREFIX + rid + "/"):]
        if rel not in local_files:
            raise Stop("Asset missing from local manifest: " + rel)
        code, body, ctype = http(ORIGIN + path)
        if code != 200 or sha(body) != local_files[rel]["sha256"]:
            raise Stop("Asset digest mismatch: " + rel)
        if rel.endswith(".js") and "javascript" not in ctype:
            raise Stop("Incorrect JS MIME")
        if rel.endswith(".css") and not ctype.startswith("text/css"):
            raise Stop("Incorrect CSS MIME")
    return results

def production_smoke(rid: str):
    results = {}
    for route in ["", "mir", "schedule", "gallery", "account", "admin"]:
        url = ORIGIN + "/" + route
        code, body, _ = http(url)
        ok = code == 200 and rid.encode() in body
        results[route or "/"] = {"status": code, "passed": ok}
        if not ok:
            raise Stop("Production route failed: " + route)
    return results

def main():
    rid = os.environ.get("RELEASE_ID", "")
    if not RID_RE.fullmatch(rid):
        raise Stop("Invalid RELEASE_ID")
    dist = Path(os.environ.get("DIST_DIR", "dist")).resolve()
    if not (dist / "index.html").is_file():
        raise Stop("dist/index.html missing")
    manifest = local_manifest(dist)
    api_payload, release_htaccess, server_files = server_payload(rid)
    report = {
        "release": rid,
        "source_commit": os.environ.get("GITHUB_SHA", ""),
        "phase": "starting",
        "files": manifest,
        "server_files": server_files,
    }
    report_path = Path("deploy_report.json")
    backup_dir = Path("deployment-backup")
    backup_dir.mkdir(exist_ok=True)

    with Remote() as r, r.lock():
        subdomain_path = SUBDOMAIN_WEB
        subdomain_info = r.info(subdomain_path)
        subdomain_snapshot = {
            "path": subdomain_path,
            "exists": subdomain_info is not None,
            "is_dir": bool(subdomain_info and stat.S_ISDIR(subdomain_info.st_mode)),
            "owner_uid": subdomain_info.st_uid if subdomain_info is not None else None,
            "entries": [],
        }
        if subdomain_info is not None and stat.S_ISDIR(subdomain_info.st_mode):
            try:
                for entry in sorted(r.s.listdir_attr(subdomain_path), key=lambda item: item.filename):
                    subdomain_snapshot["entries"].append({
                        "name": entry.filename,
                        "is_dir": stat.S_ISDIR(entry.st_mode),
                        "size": entry.st_size,
                        "owner_uid": entry.st_uid,
                    })
            except OSError:
                subdomain_snapshot["entries_error"] = "list_failed"
            sub_backup = backup_dir / "subdomain-before"
            sub_backup.mkdir(exist_ok=True)
            for name in [".htaccess", "index.html", "index.php", "standard_index.html"]:
                try:
                    data = r.read(subdomain_path + "/" + name, 1024 * 1024)
                except Exception:
                    data = None
                if data is not None:
                    (sub_backup / name.replace("/", "_")).write_bytes(data)
        report["subdomain_before"] = subdomain_snapshot

        root = r.read(WEB + "/.htaccess", 1024 * 1024)
        if root is None:
            raise Stop("Root .htaccess is missing")
        oldrid = root_release(root)
        if oldrid == rid:
            raise Stop("Release is already active")
        new_dir = WEB + PREFIX + rid
        if r.info(new_dir) is not None:
            raise Stop("New release path already exists")

        fanart_snapshot = find_fanart_snapshot(r)
        report["fanart_fallback"] = {
            "found": fanart_snapshot is not None,
            "source_release": fanart_snapshot["source_release"] if fanart_snapshot else None,
        }

        preserved = {}
        for name in ROOT_PRESERVE:
            data = r.read(WEB + "/" + name)
            preserved[name] = None if data is None else sha(data)

        (backup_dir / "root.htaccess").write_bytes(root)
        (backup_dir / "metadata.json").write_text(json.dumps({
            "previous_release": oldrid,
            "new_release": rid,
            "root_sha256": sha(root),
            "preserved_root_hashes": preserved,
        }, indent=2) + "\n", encoding="utf-8")

        r.mkdir(WEB + PREFIX.rstrip("/"), existing=True)
        r.mkdir(new_dir)
        directories = set()
        for rel in list(manifest) + API_FILES:
            parent = posixpath.dirname(rel)
            while parent:
                directories.add(parent)
                parent = posixpath.dirname(parent)
        for directory in sorted(directories, key=lambda x: (x.count("/"), x)):
            r.mkdir(new_dir + "/" + directory)

        r.new_file(new_dir + "/.htaccess", release_htaccess)
        for rel, data in sorted(api_payload.items()):
            r.new_file(new_dir + "/" + rel, data)
        if fanart_snapshot:
            fallback_meta = json.dumps(fanart_snapshot["metadata"], ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            r.new_file(new_dir + "/" + FANART_FALLBACK_META, fallback_meta, 0o600)
            r.new_file(new_dir + "/" + FANART_FALLBACK_IMAGE, fanart_snapshot["image"], 0o600)
        for rel in sorted(manifest):
            r.new_file(new_dir + "/" + rel, (dist / rel).read_bytes())

        report["phase"] = "uploaded"
        report["previous_release"] = oldrid
        report["preview_checks"] = smoke(rid, manifest)

        for name, before in preserved.items():
            data = r.read(WEB + "/" + name)
            after = None if data is None else sha(data)
            if after != before:
                raise Stop("Preserved root file changed before activation: " + name)

        features = {}
        for name in ["soop-live", "naver-fanart"]:
            code, body, _ = http(ORIGIN + PREFIX + rid + "/api/" + name + ".php")
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
            raise Stop("SOOP endpoint failed")
        if fanart_snapshot and features["naver-fanart"]["status"] != "ok":
            raise Stop("Fanart fallback snapshot was not served")
        report["features"] = features
        report["phase"] = "staged"

        if os.environ.get("ACTIVATE", "") != "true":
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("STAGED ONLY:", rid)
            return

        old_routes = b"(?:mir|band|history|schedule|gallery(?:/[^/]+)?|admin)"
        new_routes = b"(?:mir|band|history|schedule|gallery(?:/[^/]+)?|account|admin)"
        root_template = root
        if new_routes not in root_template:
            if root_template.count(old_routes) != 1:
                raise Stop("Root route pattern is not recognized")
            root_template = root_template.replace(old_routes, new_routes)
        new_root = root_template.replace(oldrid.encode(), rid.encode())
        if new_root == root or new_root.count(rid.encode()) < 2:
            raise Stop("Root rewrite generation failed")

        report["phase"] = "activating"
        try:
            r.atomic_replace(WEB + "/.htaccess", new_root, root)
            report["production_checks"] = production_smoke(rid)
            for name, before in preserved.items():
                data = r.read(WEB + "/" + name)
                after = None if data is None else sha(data)
                if after != before:
                    raise Stop("Preserved root file changed after activation: " + name)
        except BaseException:
            try:
                current = r.read(WEB + "/.htaccess", 1024 * 1024)
                if current == new_root:
                    r.atomic_replace(WEB + "/.htaccess", root, new_root)
                    report["phase"] = "rolled_back"
            finally:
                report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            raise

        report["phase"] = "active"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("PRODUCTION VERIFIED:", rid)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("STOP:", str(exc) if isinstance(exc, Stop) else type(exc).__name__)
        raise
