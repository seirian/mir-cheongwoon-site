#!/usr/bin/env bash
set -euo pipefail
# Extracted without semantic changes from the existing deployment workflow.
if [ -n "${SUPABASE_URL_SECRET:-}" ] || [ -n "${SUPABASE_ANON_KEY_SECRET:-}" ]; then
  if [ -z "${SUPABASE_URL_SECRET:-}" ] || [ -z "${SUPABASE_ANON_KEY_SECRET:-}" ]; then
    echo "::error::Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY secrets must be configured together."
    exit 1
  fi
  python - <<'PY'
import json
import os
import urllib.parse
import urllib.request

expected_ref = "nohboljeugjmtwnvtayu"
url = os.environ["SUPABASE_URL_SECRET"].strip().rstrip("/")
key = os.environ["SUPABASE_ANON_KEY_SECRET"].strip()
host = urllib.parse.urlsplit(url).hostname or ""
if host != expected_ref + ".supabase.co":
    raise SystemExit("Configured Supabase URL does not match the production project")
request = urllib.request.Request(
    url + "/rest/v1/schedule_events?select=id&limit=0",
    headers={"User-Agent": "YeopGitHubDeploy/1.0", "apikey": key, "Accept": "application/json"},
)
with urllib.request.urlopen(request, timeout=30) as response:
    body = response.read(1024 * 1024)
    if response.status != 200 or not isinstance(json.loads(body), list):
        raise SystemExit("Configured public Supabase settings failed read-only verification")
with open(".env.local", "w", encoding="utf-8") as handle:
    handle.write("VITE_SUPABASE_URL=" + url + "\n")
    handle.write("VITE_SUPABASE_ANON_KEY=" + key + "\n")
print("GitHub Supabase secrets verified without printing key material")
PY
  exit 0
fi

python - <<'PY'
import base64
import json
import re
import urllib.parse
import urllib.request

def get(url, headers=None):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "YeopGitHubDeploy/1.0", **(headers or {})},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.status, response.read(20 * 1024 * 1024)

def jwt_matches(key, project_ref):
    if not key.startswith("eyJ"):
        return True
    try:
        payload = key.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return False
    return data.get("role") == "anon" and (not data.get("ref") or data.get("ref") == project_ref)

chosen = None
sources = [
    ("current-production", "https://mir.yeop.net/"),
    ("verified-bootstrap", "https://mir.yeop.net/_yeop_releases/r20260921045522_14bc82ae/index.html"),
]
for label, index_url in sources:
    try:
        _, html = get(index_url)
        text = html.decode("utf-8")
        match = re.search(r'<script[^>]+src="([^"]+assets/[^"]+\.js)"', text)
        if not match:
            continue
        bundle_url = urllib.parse.urljoin(index_url, match.group(1))
        _, bundle = get(bundle_url)
        source = bundle.decode("utf-8", "ignore")
    except Exception:
        continue

    urls = list(dict.fromkeys(re.findall(r"https://[a-z0-9]{10,40}\.supabase\.co", source)))
    raw_keys = re.findall(
        r"sb_publishable_[A-Za-z0-9_-]{15,250}|"
        r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
        source,
    )
    for url in urls:
        project_ref = urllib.parse.urlsplit(url).hostname.split(".")[0]
        for key in raw_keys:
            if not jwt_matches(key, project_ref):
                continue
            try:
                status, body = get(
                    url + "/rest/v1/schedule_events?select=id&limit=0",
                    {"apikey": key, "Accept": "application/json"},
                )
                if status == 200 and isinstance(json.loads(body), list):
                    chosen = (url, key)
                    break
            except Exception:
                continue
        if chosen:
            break
    if chosen:
        print("Existing public Supabase config recovered from " + label + " without printing key material")
        break

if not chosen:
    raise SystemExit("Could not recover and verify existing public Supabase config")

url, key = chosen
with open(".env.local", "w", encoding="utf-8") as handle:
    handle.write("VITE_SUPABASE_URL=" + url + "\n")
    handle.write("VITE_SUPABASE_ANON_KEY=" + key + "\n")
print("Existing public Supabase config recovered and verified without printing key material")
PY
