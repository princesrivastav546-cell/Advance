import os
import re
import io
import json
import uuid
import base64
import zipfile
from pathlib import Path
from datetime import datetime

import requests
from flask import Flask, request, jsonify, send_from_directory, abort

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
PROJECTS_DIR = DATA_DIR / "projects"
EXPORTS_DIR = DATA_DIR / "exports"
DATA_DIR.mkdir(exist_ok=True)
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
EXPORTS_DIR.mkdir(exist_ok=True)

# ---- GitHub config (Render env vars) ----
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "").strip()

app = Flask(__name__, static_folder="static")

def nowz():
    return datetime.utcnow().isoformat() + "Z"

def safe_name(name: str) -> str:
    name = (name or "").strip()
    name = "".join(ch for ch in name if ch.isalnum() or ch in ("-", "_", " ", "."))
    name = name.replace(" ", "-")
    return name[:60] if name else "project"

def project_path(pid: str) -> Path:
    p = PROJECTS_DIR / pid
    if not p.exists():
        abort(404, description="Project not found")
    return p

def read_meta(p: Path) -> dict:
    meta_file = p / "meta.json"
    return json.loads(meta_file.read_text(encoding="utf-8")) if meta_file.exists() else {}

def write_meta(p: Path, meta: dict):
    (p / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

def ensure_github_ready():
    if not GITHUB_TOKEN:
        abort(400, description="GITHUB_TOKEN is not set in Render env vars.")
    if not GITHUB_OWNER:
        abort(400, description="GITHUB_OWNER is not set in Render env vars.")

@app.get("/")
def health():
    return "OK ✅ Mini App server running."

@app.get("/app")
def app_page():
    return send_from_directory("static", "app.html")

@app.get("/static/<path:path>")
def static_files(path):
    return send_from_directory("static", path)

# ---------------- Projects ----------------

@app.get("/api/projects")
def list_projects():
    items = []
    for p in PROJECTS_DIR.iterdir():
        if p.is_dir():
            meta = read_meta(p)
            items.append({
                "id": p.name,
                "name": meta.get("name", p.name),
                "created_at": meta.get("created_at"),
                "updated_at": meta.get("updated_at"),
            })
    items.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
    return jsonify(items)

@app.post("/api/projects")
def create_project():
    body = request.get_json(force=True, silent=True) or {}
    name = safe_name(body.get("name", "project"))
    pid = uuid.uuid4().hex[:12]
    p = PROJECTS_DIR / pid
    p.mkdir(parents=True, exist_ok=True)

    # Default scaffold
    (p / "main.py").write_text("# main.py\n\nprint('Hello from Mini App')\n", encoding="utf-8")
    (p / "requirements.txt").write_text("flask\n", encoding="utf-8")
    (p / "ENV_VARS.json").write_text(json.dumps({"EXAMPLE_KEY": "value"}, indent=2), encoding="utf-8")
    (p / "README.md").write_text(
        f"# {name}\n\nGenerated from Telegram Mini App.\n\n## Run\n```bash\npip install -r requirements.txt\npython main.py\n```\n",
        encoding="utf-8"
    )
    meta = {"name": name, "created_at": nowz(), "updated_at": nowz()}
    write_meta(p, meta)
    return jsonify({"id": pid, "name": name})

@app.delete("/api/projects/<pid>")
def delete_project(pid):
    p = project_path(pid)
    for child in sorted(p.rglob("*"), reverse=True):
        if child.is_file():
            child.unlink()
        else:
            child.rmdir()
    p.rmdir()
    return jsonify({"ok": True})

# ---------------- Files ----------------

@app.get("/api/projects/<pid>/files")
def list_files(pid):
    p = project_path(pid)
    files = []
    for f in p.rglob("*"):
        if f.is_file():
            rel = str(f.relative_to(p)).replace("\\", "/")
            if rel == "meta.json":
                continue
            files.append(rel)
    files.sort()
    meta = read_meta(p)
    return jsonify({"project": {"id": pid, "name": meta.get("name", pid)}, "files": files})

@app.get("/api/projects/<pid>/file")
def get_file(pid):
    path = request.args.get("path", "")
    p = project_path(pid)
    f = (p / path).resolve()
    if not str(f).startswith(str(p.resolve())):
        abort(400, description="Invalid path")
    if not f.exists() or not f.is_file():
        abort(404, description="File not found")
    return jsonify({"path": path, "content": f.read_text(encoding="utf-8", errors="replace")})

@app.post("/api/projects/<pid>/file")
def save_file(pid):
    body = request.get_json(force=True, silent=True) or {}
    path = (body.get("path") or "").strip()
    content = body.get("content", "")

    if not path:
        abort(400, description="path is required")

    # basic safe allowlist
    allowed = (".py", ".txt", ".md", ".json", ".yaml", ".yml", ".env", ".toml", ".ini", ".cfg")
    if not path.endswith(allowed) and "/" not in path:
        abort(400, description="Unsupported file type")

    p = project_path(pid)
    f = (p / path).resolve()
    if not str(f).startswith(str(p.resolve())):
        abort(400, description="Invalid path")

    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(content, encoding="utf-8")

    meta = read_meta(p)
    meta["updated_at"] = nowz()
    write_meta(p, meta)
    return jsonify({"ok": True})

@app.post("/api/projects/<pid>/upload")
def upload_file(pid):
    p = project_path(pid)
    if "file" not in request.files:
        abort(400, description="file missing")
    file = request.files["file"]
    relpath = (request.form.get("path") or file.filename or "").strip()
    if not relpath:
        abort(400, description="path missing")

    dest = (p / relpath).resolve()
    if not str(dest).startswith(str(p.resolve())):
        abort(400, description="Invalid path")
    dest.parent.mkdir(parents=True, exist_ok=True)
    file.save(dest)

    meta = read_meta(p)
    meta["updated_at"] = nowz()
    write_meta(p, meta)
    return jsonify({"ok": True, "path": relpath})

# ---------------- Export ZIP ----------------

@app.get("/api/projects/<pid>/export.zip")
def export_zip(pid):
    p = project_path(pid)
    zip_name = f"{pid}.zip"
    zip_path = EXPORTS_DIR / zip_name

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in p.rglob("*"):
            if f.is_file():
                rel = str(f.relative_to(p)).replace("\\", "/")
                if rel == "meta.json":
                    continue
                z.write(f, arcname=rel)
    return send_from_directory(EXPORTS_DIR, zip_name, as_attachment=True)

# ---------------- Import from GitHub Public Repo ----------------

def parse_github_repo(url: str):
    url = (url or "").strip()
    m = re.search(r"github\.com/([^/]+)/([^/]+)", url)
    if not m:
        return None, None
    owner = m.group(1)
    repo = m.group(2).replace(".git", "")
    return owner, repo

@app.post("/api/projects/<pid>/import_github")
def import_github(pid):
    body = request.get_json(force=True, silent=True) or {}
    repo_url = body.get("repo_url", "")
    owner, repo = parse_github_repo(repo_url)
    if not owner or not repo:
        abort(400, description="Invalid GitHub repo URL")

    p = project_path(pid)

    zip_url = f"https://api.github.com/repos/{owner}/{repo}/zipball"
    r = requests.get(zip_url, timeout=60)
    if r.status_code >= 400:
        abort(r.status_code, description=f"GitHub download failed: {r.text}")

    z = zipfile.ZipFile(io.BytesIO(r.content))
    top = None
    for name in z.namelist():
        if name.endswith("/"):
            continue
        parts = name.split("/", 1)
        if len(parts) > 1:
            top = parts[0] + "/"
            break

    for name in z.namelist():
        if name.endswith("/"):
            continue
        rel = name[len(top):] if top and name.startswith(top) else name
        if not rel or rel.startswith(".git"):
            continue

        dest = (p / rel).resolve()
        if not str(dest).startswith(str(p.resolve())):
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(z.read(name))

    meta = read_meta(p)
    meta["updated_at"] = nowz()
    write_meta(p, meta)

    return jsonify({"ok": True, "repo": f"{owner}/{repo}", "imported_from": repo_url})

# ---------------- Publish to GitHub (new public repo) ----------------

def gh_headers():
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

def gh_create_repo(repo_name: str, description: str, private: bool):
    url = "https://api.github.com/user/repos"
    payload = {"name": repo_name, "description": description or "", "private": bool(private), "auto_init": False}
    r = requests.post(url, headers=gh_headers(), json=payload, timeout=30)
    if r.status_code >= 400:
        abort(r.status_code, description=f"GitHub repo create failed: {r.text}")
    return r.json()

def gh_put_file(repo: str, path: str, content_bytes: bytes, message: str):
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{repo}/contents/{path}"
    payload = {
        "message": message,
        "content": base64.b64encode(content_bytes).decode("utf-8"),
        "committer": {"name": "Telegram Mini App", "email": "miniapp@users.noreply.github.com"},
    }
    r = requests.put(url, headers=gh_headers(), json=payload, timeout=30)
    if r.status_code >= 400:
        abort(r.status_code, description=f"GitHub upload failed for {path}: {r.text}")
    return r.json()

@app.post("/api/projects/<pid>/publish_github")
def publish_github(pid):
    ensure_github_ready()
    body = request.get_json(force=True, silent=True) or {}

    repo_name = safe_name(body.get("repo_name", "")).lower()
    if not repo_name:
        abort(400, description="repo_name required")

    description = body.get("description", "")
    private = bool(body.get("private", False))

    p = project_path(pid)
    repo_info = gh_create_repo(repo_name, description, private)

    for f in p.rglob("*"):
        if not f.is_file():
            continue
        rel = str(f.relative_to(p)).replace("\\", "/")
        if rel == "meta.json":
            continue

        data = f.read_bytes()
        if len(data) > 900_000:
            abort(400, description=f"File too large: {rel}")

        gh_put_file(repo_name, rel, data, message=f"Add {rel} (from Mini App)")

    return jsonify({
        "ok": True,
        "repo": f"{GITHUB_OWNER}/{repo_name}",
        "html_url": repo_info.get("html_url"),
        "clone_url": repo_info.get("clone_url"),
        "visibility": "private" if private else "public",
    })
