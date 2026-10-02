"""Local server: serves site/ and keeps the lab's data in one SQLite file — the source of truth for the site and MCP.

    python scripts/serve.py [port]          (default 8765)   real lab   → data/labsidian.db
    python scripts/serve.py [port] --demo   the fake demo lab → data/demo/labsidian.db, /data.js → site/data.demo.js
                                            (automatic when site/data.js doesn't exist, e.g. a fresh clone)
Needs Node.js (MCP ops run the site's own store.js headless: scripts/store_worker.mjs). Binds to 127.0.0.1 only.

  GET  /...                    static files from site/ (no-cache, so edits show up on reload)
  GET  /api/state              {version, db, seedOnly} — the site's whole state (window.Store's db)
  POST /api/state              {upserts: [[coll, id, value]], deletes: [[coll, id]]} → {version, prev}
  POST /api/state/import       {db} — once, while the server only has seed data: moves a browser's old localStorage over
  GET  /api/changes?since=N    {version, ops} — what changed since N (the open site polls this)
  GET  /api/version            {version}
  GET  /api/snapshot           {version, snapshot} — the built dataset + social data, for the MCP server
  POST /api/ops                one MCP command, applied right away as its actor → {ok, id, version} | {ok: false, error}
  GET  /api/ops?limit=N        recent commands with their result (also: SELECT * FROM ops in the .db file)
  GET|PUT|DELETE /api/files/<id>   attachments (PDF · images)

Tables: records(coll, id, value) — one row per user / review / comment / member's notifications …, coll "_meta" for the
rest (terms, tag ops, log …) · ops(id, at, actor, op, status, error, version) · files(id, type, data) · meta(key, value).
A backup is taken once a day on start (data[/demo]/_backup/, last 14 kept).
"""
import json
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import date
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
# a fresh clone has no real lab data (site/data.js is gitignored) → serve the demo lab
DEMO = "--demo" in sys.argv or not (ROOT / "site" / "data.js").exists()
SITE, DATA = ROOT / "site", ROOT / ("data/demo" if DEMO else "data")
SEED_JS = SITE / ("data.demo.js" if DEMO else "data.js")
DB_PATH = DATA / "labsidian.db"
LEGACY = DATA / "live_snapshot.json"  # left by the old localStorage bridge → that browser still has data to move over
MAX_BODY, MAX_FILE = 50 * 1024 * 1024, 25 * 1024 * 1024
# must match COLLS in site/store.js: each entry of these is its own record, every other top-level key is one "_meta" record
COLLS = ("users", "reviews", "reviewEdits", "comments", "reactions", "reading", "notifications", "drafts", "mcpDrafts", "studies", "studyQs")
CONTENT = tuple(c for c in COLLS if c != "users")


def records_of(db):
    out = {}
    for k, v in (db or {}).items():
        if k in COLLS:
            out.update({(k, i): x for i, x in (v or {}).items()})
        else:
            out[("_meta", k)] = v
    return out


class Store:
    def __init__(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path, self.lock = path, threading.RLock()
        self.con = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.con.execute("PRAGMA journal_mode=WAL")
        self.con.executescript("""
            CREATE TABLE IF NOT EXISTS records (coll TEXT, id TEXT, value TEXT NOT NULL, version INTEGER, PRIMARY KEY (coll, id));
            CREATE TABLE IF NOT EXISTS ops (id TEXT PRIMARY KEY, at TEXT, actor TEXT, op TEXT, body TEXT, status TEXT, error TEXT, version INTEGER);
            CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, type TEXT, data BLOB);
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);""")
        self.snap = (None, None)

    def version(self):
        row = self.con.execute("SELECT value FROM meta WHERE key='version'").fetchone()
        return int(row[0]) if row else 0

    def db(self):
        d = {}
        for coll, id_, value in self.con.execute("SELECT coll, id, value FROM records"):
            if coll == "_meta":
                d[id_] = json.loads(value)
            else:
                d.setdefault(coll, {})[id_] = json.loads(value)
        return d

    def seed_only(self):
        """nothing but what the site seeds by itself (accounts without passwords, terms) — safe to replace on import"""
        q = "SELECT 1 FROM records WHERE coll IN (%s) LIMIT 1" % ",".join("?" * len(CONTENT))
        if self.con.execute(q, CONTENT).fetchone():
            return False
        return not any(json.loads(v).get("pw") for (v,) in self.con.execute("SELECT value FROM records WHERE coll='users'"))

    def write(self, upserts, deletes):
        """one transaction, one new version → (prev, version)"""
        with self.lock:
            prev = self.version()
            v = prev + 1
            self.con.execute("BEGIN")
            try:
                for coll, id_, value in upserts:
                    self.con.execute("INSERT OR REPLACE INTO records VALUES (?,?,?,?)", (coll, id_, json.dumps(value, ensure_ascii=False), v))
                for coll, id_ in deletes:
                    self.con.execute("DELETE FROM records WHERE coll=? AND id=?", (coll, id_))
                self.con.execute("INSERT OR REPLACE INTO meta VALUES ('version', ?)", (str(v),))
                self.con.execute("COMMIT")
            except Exception:
                self.con.execute("ROLLBACK")
                raise
            return prev, v

    def replace(self, new_db):
        """store a whole db (from the worker / an import) as the minimal set of record changes"""
        with self.lock:
            old, new = records_of(self.db()), records_of(new_db)
            ups = [(c, i, v) for (c, i), v in new.items() if (c, i) not in old or old[(c, i)] != v]
            dels = [k for k in old if k not in new]
            return self.write(ups, dels) if ups or dels else (self.version(), self.version())

    def changes(self, since):
        rows = self.con.execute("SELECT id, op, actor, status FROM ops WHERE version > ? ORDER BY version", (since,)).fetchall()
        return {"version": self.version(), "ops": [{"id": i, "op": o, "actor": a, "status": s} for i, o, a, s in rows]}

    def log_op(self, op, status, error, version):
        self.con.execute("INSERT OR REPLACE INTO ops VALUES (?,?,?,?,?,?,?,?)", (op["id"], op.get("at") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                         op.get("actor"), op.get("op"), json.dumps(op, ensure_ascii=False), status, error, version))

    def backup(self, keep=14):
        if not self.path.exists() or not self.version():
            return
        dst = self.path.parent / "_backup" / f"labsidian-{date.today().isoformat()}.db"
        if dst.exists():
            return
        dst.parent.mkdir(exist_ok=True)
        with sqlite3.connect(dst) as b:
            self.con.backup(b)
        for old in sorted(dst.parent.glob("labsidian-*.db"))[:-keep]:
            old.unlink()


class Worker:
    """the site's store.js under Node (scripts/store_worker.mjs), one request at a time"""
    def __init__(self):
        self.p, self.lock = None, threading.Lock()

    def call(self, req):
        with self.lock:
            for attempt in (1, 2):
                if not self.p or self.p.poll() is not None:
                    node = shutil.which("node")
                    if not node:
                        return {"ok": False, "error": "Node.js is needed to apply MCP requests (https://nodejs.org)"}
                    self.p = subprocess.Popen([node, str(ROOT / "scripts" / "store_worker.mjs"), str(SEED_JS)], stdin=subprocess.PIPE,
                                              stdout=subprocess.PIPE, text=True, encoding="utf-8")
                try:
                    self.p.stdin.write(json.dumps(req, ensure_ascii=False) + "\n")
                    self.p.stdin.flush()
                    line = self.p.stdout.readline()
                    if line:
                        return json.loads(line)
                except (OSError, ValueError):
                    pass
                self.p = None
            return {"ok": False, "error": "store worker crashed"}


STORE, WORKER = None, Worker()


def apply_op(op):
    """apply one command as its actor; the db only changes if it succeeds"""
    if STORE.con.execute("SELECT 1 FROM ops WHERE id=? AND status='ok'", (op["id"],)).fetchone():
        return {"ok": True, "id": op["id"], "version": STORE.version(), "duplicate": True}
    with STORE.lock:
        r = WORKER.call({"cmd": "apply", "db": STORE.db(), "op": op})
        if r.get("ok"):
            _, v = STORE.replace(r["db"])
            STORE.log_op(op, "ok", None, v)
            return {"ok": True, "id": op["id"], "version": v}
        STORE.log_op(op, "error", r.get("error"), STORE.version())
        return {"ok": False, "id": op["id"], "error": r.get("error")}


def migrate_outbox():
    """ops the MCP server queued in data/mcp_outbox.json before the server kept the data — apply the ones not yet applied"""
    path = DATA / "mcp_outbox.json"
    if not path.exists():
        return
    done = set(STORE.db().get("mcpApplied") or [])
    for op in json.loads(path.read_text(encoding="utf-8")):
        if op.get("id") and op["id"] not in done:
            r = apply_op(op)
            print(f"  outbox {op['id']} {op.get('op')}: {'ok' if r['ok'] else r['error']}", flush=True)
    path.rename(path.with_name("mcp_outbox.migrated.json"))


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console quiet except for writes
        if self.command != "GET" and self.path.startswith("/api/"):
            super().log_message(fmt, *args)

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self, limit=MAX_BODY):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > limit:
            raise ValueError("body size")
        return self.rfile.read(n)

    def file_id(self):
        return unquote(urlparse(self.path).path[len("/api/files/"):])

    def do_GET(self):
        with STORE.lock:
            return self._get()

    def do_POST(self):
        with STORE.lock:
            return self._post()

    def _get(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/data.js" and DEMO:
            self.path = "/data.demo.js"
        elif u.path == "/api/state":
            return self.send_json({"version": STORE.version(), "db": STORE.db(), "seedOnly": STORE.seed_only()})
        elif u.path == "/api/version":
            return self.send_json({"version": STORE.version()})
        elif u.path == "/api/changes":
            return self.send_json(STORE.changes(int((q.get("since") or ["0"])[0])))
        elif u.path == "/api/snapshot":
            v, key = STORE.version(), (STORE.version(), SEED_JS.stat().st_mtime)
            if STORE.snap[0] != key:
                r = WORKER.call({"cmd": "snapshot", "db": STORE.db()})
                if not r.get("ok"):
                    return self.send_json({"error": r.get("error")}, 500)
                STORE.snap = (key, r["snapshot"])
            return self.send_json({"version": v, "snapshot": STORE.snap[1]})
        elif u.path == "/api/ops":
            rows = STORE.con.execute("SELECT body, status, error, version FROM ops ORDER BY rowid DESC LIMIT ?", (int((q.get("limit") or ["50"])[0]),))
            return self.send_json([{**json.loads(b), "status": s, "error": e, "version": v} for b, s, e, v in rows])
        elif u.path.startswith("/api/files/"):
            row = STORE.con.execute("SELECT type, data FROM files WHERE id=?", (self.file_id(),)).fetchone()
            if not row:
                return self.send_error(404)
            self.send_response(200)
            self.send_header("Content-Type", row[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(row[1])))
            self.end_headers()
            self.wfile.write(row[1])
            return
        elif u.path.startswith("/api/"):
            return self.send_error(404)
        super().do_GET()

    def _post(self):
        u = urlparse(self.path)
        try:
            req = json.loads(self.body())
        except ValueError:
            return self.send_error(400, "invalid body")
        if u.path == "/api/state":
            prev, v = STORE.write([tuple(x) for x in req.get("upserts") or []], [tuple(x) for x in req.get("deletes") or []])
            return self.send_json({"version": v, "prev": prev})
        if u.path == "/api/state/import":
            if not STORE.seed_only():
                return self.send_json({"error": "the server already has data"}, 409)
            STORE.backup()
            _, v = STORE.replace(req["db"])
            print(f"imported this browser's earlier data (version {v})", flush=True)
            migrate_outbox()
            if LEGACY.exists():
                LEGACY.rename(LEGACY.with_name("live_snapshot.migrated.json"))
            return self.send_json({"version": STORE.version(), "db": STORE.db()})
        if u.path == "/api/ops":
            if not isinstance(req, dict) or not req.get("id") or not req.get("op"):
                return self.send_json({"ok": False, "error": "op needs id and op"}, 400)
            # until a browser has opened the site, its old data may still be waiting in that browser to move over
            if not STORE.version() or (LEGACY.exists() and STORE.seed_only()):
                return self.send_json({"ok": False, "error": "open the site in your browser once first — it moves its data to the server"}, 409)
            return self.send_json(apply_op(req))
        self.send_error(404)

    def do_PUT(self):
        if not self.path.startswith("/api/files/"):
            return self.send_error(404)
        try:
            data = self.body(MAX_FILE)
        except ValueError:
            return self.send_error(413)
        with STORE.lock:
            STORE.con.execute("INSERT OR REPLACE INTO files VALUES (?,?,?)", (self.file_id(), self.headers.get("Content-Type"), data))
        self.send_json({"ok": True})

    def do_DELETE(self):
        if not self.path.startswith("/api/files/"):
            return self.send_error(404)
        with STORE.lock:
            STORE.con.execute("DELETE FROM files WHERE id=?", (self.file_id(),))
        self.send_json({"ok": True})


def main():
    global STORE
    args = [a for a in sys.argv[1:] if a != "--demo"]
    port = int(args[0]) if args else 8765
    STORE = Store(DB_PATH)
    STORE.backup()
    srv = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(SITE)))
    print(f"Labsidian{' [DEMO]' if DEMO else ''} → http://localhost:{port}  (data: {DB_PATH.relative_to(ROOT)}, version {STORE.version()})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
