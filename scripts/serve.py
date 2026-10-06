"""Labsidian server: serves site/ and keeps the lab's data in one SQLite file — the source of truth for the site and MCP.

    python scripts/serve.py [port]          (default 8765)   real lab   → data/labsidian.db
    python scripts/serve.py [port] --demo   the fake demo lab → data/demo/labsidian.db, /data.js → site/data.demo.js
                                            (automatic when site/data.js doesn't exist, e.g. a fresh clone)
    python scripts/serve.py [port] --host 0.0.0.0   listen on the network too (default 127.0.0.1 only)
    python scripts/serve.py --reset-password <name> [--demo]   a temporary password for a member (also: the first admin)
    python scripts/serve.py --token <name> [--demo]            a personal MCP token (LABSIDIAN_TOKEN) for a member
Needs Node.js (MCP ops run the site's own store.js headless: scripts/store_worker.mjs).

Sign-in happens here, not in the browser: /api/login checks the password and sets a session cookie; until then
the server shows login.html and keeps the lab's data (/data.js, /api/*) to itself. Password hashes never leave
the server. The MCP server signs in with a personal token (Authorization: Bearer …) and acts as that member; an
MCP server on this machine may instead show data/.local_secret (X-Lab-Local) and name its member itself.

  POST /api/login              {name, password} | {id} (demo lab) → {user} + session cookie
  POST /api/logout · GET /api/login-info {demo} · GET /api/whoami {user}
  POST /api/password           {old, new} — your own password
  GET|POST /api/tokens · DELETE /api/tokens/<id>   your MCP tokens: [{id, label, created, used}] · {label} → {token} (shown once)
  GET  /api/state              {version, db, seedOnly, me} — the site's whole state (window.Store's db), no secrets
  POST /api/state              {upserts: [[coll, id, value]], deletes: [[coll, id]]} → {version, prev}
                               (accounts: members only change their own; passwords, roles and deletes are refused)
  POST /api/state/import       {db} — admin, once, while the server only has seed data: a browser's old localStorage
  GET  /api/changes?since=N    {version, ops} — what changed since N (the open site polls this)
  GET  /api/version            {version}
  GET  /api/snapshot           {version, snapshot} — the built dataset + social data, for the MCP server
  POST /api/ops                one MCP command, applied right away as its actor → {ok, id, version, result} | {ok: false, error}
  GET  /api/ops?limit=N        recent commands with their result — admin (also: SELECT * FROM ops in the .db file)
  GET|PUT|DELETE /api/files/<id>   attachments (PDF · images)

Tables: records(coll, id, value) — one row per user / review / comment / member's notifications …, coll "_meta" for the
rest (terms, tag ops, log …) · ops(id, at, actor, op, status, error, version) · files(id, type, data) · meta(key, value)
· sessions(hash, user, kind, created, used, label) — browser sessions ("web") and MCP tokens ("mcp"), stored hashed.
A backup is taken once a day on start (data[/demo]/_backup/, last 14 kept).
"""
import calendar
import hashlib
import hmac
import json
import secrets
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import date
from functools import partial
from http.cookies import SimpleCookie
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
LOCAL_SECRET = ROOT / "data" / ".local_secret"  # gitignored; shared by the real and the demo server
MAX_BODY, MAX_FILE = 50 * 1024 * 1024, 25 * 1024 * 1024
# must match COLLS in site/store.js: each entry of these is its own record, every other top-level key is one "_meta" record
COLLS = ("users", "reviews", "reviewEdits", "comments", "reactions", "reading", "notifications", "drafts", "mcpDrafts", "studies", "studyQs",
         "paperTags", "clusterNames", "offDays", "guides")
CONTENT = tuple(c for c in COLLS if c != "users")
# real and demo servers on one host share its cookies (ports don't count) → one name each
COOKIE = "labsidian_demo" if DEMO else "labsidian"
SESSION_DAYS = 30
INITIAL_PASSWORD = "labsidian"  # site/store.js MOCK_INITIAL_PASSWORD — the demo lab only; real accounts get a temporary one
PBKDF2_ROUNDS = 200_000
LOCAL = "*local*"  # who(): the MCP server on this machine, which names its own actor


def records_of(db):
    out = {}
    for k, v in (db or {}).items():
        if k in COLLS:
            out.update({(k, i): x for i, x in (v or {}).items()})
        else:
            out[("_meta", k)] = v
    return out


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- passwords
def hash_pw(pw):
    salt = secrets.token_hex(16)
    return f"pbkdf2${PBKDF2_ROUNDS}${salt}${hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt.encode(), PBKDF2_ROUNDS).hex()}"


def check_pw(u, pw):
    """→ True / False, and whether the stored hash should be upgraded"""
    stored, pw = u.get("pw"), pw or ""
    if stored and stored.startswith("pbkdf2$"):
        _, rounds, salt, h = stored.split("$")
        return hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode(), int(rounds)).hex(), h), False
    if stored:  # set in the browser by an older site/store.js: sha256("<id>:<password>")
        ok = hmac.compare_digest(sha(f"{u['id']}:{pw}"), stored)
        return ok, ok
    if u.get("tempPw"):
        return hmac.compare_digest(pw, u["tempPw"]), False
    return DEMO and pw == INITIAL_PASSWORD, False


def public_user(u):
    return {"id": u["id"], "name": u["name"], "role": u.get("role"), "mustChange": bool(u.get("mustChange"))}


def without_secrets(db):
    """what a browser gets: no hashes, no temporary passwords — pw is only true (has a password) or null"""
    db["users"] = {i: {**{k: v for k, v in u.items() if k not in ("pw", "tempPw")}, "pw": True if u.get("pw") else None}
                   for i, u in (db.get("users") or {}).items()}
    return db


class Store:
    def __init__(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path, self.lock = path, threading.RLock()
        self.con = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.con.execute("PRAGMA journal_mode=WAL")
        self.con.execute("PRAGMA busy_timeout=5000")
        self.con.executescript("""
            CREATE TABLE IF NOT EXISTS records (coll TEXT, id TEXT, value TEXT NOT NULL, version INTEGER, PRIMARY KEY (coll, id));
            CREATE TABLE IF NOT EXISTS ops (id TEXT PRIMARY KEY, at TEXT, actor TEXT, op TEXT, body TEXT, status TEXT, error TEXT, version INTEGER);
            CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, type TEXT, data BLOB);
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user TEXT, kind TEXT, created TEXT, used TEXT, label TEXT);""")
        if "label" not in [c[1] for c in self.con.execute("PRAGMA table_info(sessions)")]:
            self.con.execute("ALTER TABLE sessions ADD COLUMN label TEXT")
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

    def users(self):
        return {i: json.loads(v) for i, v in self.con.execute("SELECT id, value FROM records WHERE coll='users'")}

    def user(self, id_):
        row = self.con.execute("SELECT value FROM records WHERE coll='users' AND id=?", (id_,)).fetchone()
        return json.loads(row[0]) if row else None

    def find_user(self, name):
        q = (name or "").strip().lower()
        return next((u for u in self.users().values() if q and (u["id"] == name.strip() or u["name"].lower() == q)), None)

    def seed_only(self):
        """nothing but what the site seeds by itself (accounts without passwords, terms) — safe to replace on import"""
        q = "SELECT 1 FROM records WHERE coll IN (%s) LIMIT 1" % ",".join("?" * len(CONTENT))
        if self.con.execute(q, CONTENT).fetchone():
            return False
        return not any(u.get("pw") for u in self.users().values())

    def write(self, upserts, deletes):
        """one transaction, one new version → (prev, version)"""
        with self.lock:
            prev = self.version()
            v = prev + 1
            self.con.execute("BEGIN IMMEDIATE")
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
        self.con.execute("INSERT OR REPLACE INTO ops VALUES (?,?,?,?,?,?,?,?)", (op["id"], op.get("at") or now_iso(),
                         op.get("actor"), op.get("op"), json.dumps(op, ensure_ascii=False), status, error, version))

    # sessions: a browser sign-in ("web", expires SESSION_DAYS after its last use) or a personal MCP token ("mcp")
    def new_session(self, user, kind, label=""):
        token = secrets.token_urlsafe(32)
        # an MCP token's "used" stays empty until an AI first signs in with it
        self.con.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?)", (sha(token), user, kind, now_iso(), now_iso() if kind == "web" else None, label))
        return token

    def tokens(self, user):
        """a member's MCP tokens — the id is the start of the hash; the token itself isn't kept"""
        rows = self.con.execute("SELECT hash, label, created, used FROM sessions WHERE user=? AND kind='mcp' ORDER BY created DESC", (user,))
        return [{"id": h[:16], "label": label or "", "created": c, "used": u} for h, label, c, u in rows]

    def session_user(self, token, kind):
        if not token:
            return None
        row = self.con.execute("SELECT user, used FROM sessions WHERE hash=? AND kind=?", (sha(token), kind)).fetchone()
        if not row:
            return None
        if kind == "web" and time.time() - calendar.timegm(time.strptime(row[1], "%Y-%m-%dT%H:%M:%SZ")) > SESSION_DAYS * 86400:
            self.con.execute("DELETE FROM sessions WHERE hash=?", (sha(token),))
            return None
        if (row[1] or "")[:13] != now_iso()[:13]:  # touch at most once an hour
            self.con.execute("UPDATE sessions SET used=? WHERE hash=?", (now_iso(), sha(token)))
        u = self.user(row[0])
        return row[0] if u and not u.get("disabled") else None

    def end_sessions(self, user, kind="web", keep=None):
        self.con.execute("DELETE FROM sessions WHERE user=? AND kind=? AND hash IS NOT ?", (user, kind, sha(keep) if keep else None))

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
SECRET = None  # contents of LOCAL_SECRET
FAILS = {}  # ip → recent failed sign-in times


def seed():
    """accounts for everyone in the diary (+ admin), terms, the demo's examples — what store.js adds by itself. The
    browser can't create other members' accounts any more, so the server runs the same code when the diary changes."""
    mtime = str(SEED_JS.stat().st_mtime)
    row = STORE.con.execute("SELECT value FROM meta WHERE key='seed'").fetchone()
    if row and row[0] == mtime and STORE.users():
        return
    r = WORKER.call({"cmd": "snapshot", "db": STORE.db()})
    if not r.get("ok"):
        print(f"  couldn't seed accounts: {r.get('error')}", flush=True)
        return
    STORE.replace(r["db"])
    STORE.con.execute("INSERT OR REPLACE INTO meta VALUES ('seed', ?)", (mtime,))


def apply_op(op):
    """apply one command as its actor; the db only changes if it succeeds"""
    if STORE.con.execute("SELECT 1 FROM ops WHERE id=? AND status='ok'", (op["id"],)).fetchone():
        return {"ok": True, "id": op["id"], "version": STORE.version(), "duplicate": True}
    with STORE.lock:
        r = WORKER.call({"cmd": "apply", "db": STORE.db(), "op": op})
        if r.get("ok"):
            _, v = STORE.replace(r["db"])
            STORE.log_op(op, "ok", None, v)
            return {"ok": True, "id": op["id"], "version": v, "result": r.get("result") or {}}
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


def guard(me, upserts, deletes):
    """what a browser may write: accounts only through the rules below, everything else as sent (members are trusted
    with content; the site's own rules run in their browser)"""
    admin = (STORE.user(me) or {}).get("role") == "admin"
    stored, ups, reset = STORE.users(), [], []
    for coll, id_, value in upserts:
        if coll == "users":
            old = stored.get(id_)
            if not isinstance(value, dict) or (id_ != me and not admin) or (not old and not admin):
                continue
            value = dict(value)
            if admin and isinstance(value.get("tempPw"), str):  # "reset password" / a new account: a temporary password
                value["pw"] = None
                if old:
                    reset.append(id_)
            else:
                value["pw"], value["tempPw"] = (old or {}).get("pw"), (old or {}).get("tempPw")
            if not admin:  # a member's own account: colour and the like, not their role
                for k in ("role", "disabled", "mustChange", "quota"):
                    value[k] = old.get(k)
            if id_ == me:
                value["role"], value["disabled"] = old.get("role"), old.get("disabled")  # nobody locks themselves out
            value = {k: v for k, v in value.items() if v is not None or k == "pw"}
        ups.append((coll, id_, value))
    for u in reset:
        STORE.end_sessions(u)
    return ups, [(c, i) for c, i in deletes if c != "users"]


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console quiet except for writes
        if self.command != "GET" and self.path.startswith("/api/"):
            super().log_message(fmt, *args)

    def send_json(self, obj, status=200, cookie=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cookie is not None:
            secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
            age = SESSION_DAYS * 86400 if cookie else 0
            self.send_header("Set-Cookie", f"{COOKIE}={cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}{secure}")
        self.end_headers()
        self.wfile.write(body)

    def body(self, limit=MAX_BODY):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > limit:
            raise ValueError("body size")
        return self.rfile.read(n)

    def file_id(self):
        return unquote(urlparse(self.path).path[len("/api/files/"):])

    def cookie(self):
        c = SimpleCookie()
        try:
            c.load(self.headers.get("Cookie") or "")
        except Exception:
            return None
        return c[COOKIE].value if COOKIE in c else None

    def who(self):
        """the signed-in member's id, LOCAL for the MCP server on this machine, or None"""
        auth = self.headers.get("Authorization") or ""
        if auth.startswith("Bearer "):
            return STORE.session_user(auth[7:].strip(), "mcp")
        local = self.headers.get("X-Lab-Local")
        if local:
            return LOCAL if SECRET and hmac.compare_digest(local, SECRET) else None
        return STORE.session_user(self.cookie(), "web")

    def is_admin(self, who):
        return who == LOCAL or (STORE.user(who) or {}).get("role") == "admin"

    def do_GET(self):
        with STORE.lock:
            return self._get()

    def do_POST(self):
        with STORE.lock:
            return self._post()

    def _get(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/api/login-info":
            return self.send_json({"demo": DEMO})
        who = self.who() if u.path.startswith("/api/") or u.path in ("/", "/index.html", "/data.js") else None
        if u.path in ("/", "/index.html") and not who and not DEMO:  # the demo lab's site has its own sign-in screen
            self.path = "/login.html"
        elif u.path == "/data.js":
            if DEMO:
                self.path = "/data.demo.js"  # the fake lab is public (it's on GitHub too); the login page shows its members
            elif not who:
                return self.send_error(401)
        elif u.path.startswith("/api/") and not who:
            return self.send_json({"error": "signin"}, 401)
        elif u.path == "/api/whoami":
            return self.send_json({"user": public_user(STORE.user(who))} if who != LOCAL else {"user": None, "local": True})
        elif u.path == "/api/state":
            seed()
            return self.send_json({"version": STORE.version(), "db": without_secrets(STORE.db()), "seedOnly": STORE.seed_only(),
                                   "me": who if who != LOCAL else None})
        elif u.path == "/api/version":
            return self.send_json({"version": STORE.version()})
        elif u.path == "/api/tokens":
            return self.send_json(STORE.tokens(who)) if who != LOCAL else self.send_json({"error": "forbidden"}, 403)
        elif u.path == "/api/changes":
            return self.send_json(STORE.changes(int((q.get("since") or ["0"])[0])))
        elif u.path == "/api/snapshot":
            seed()
            v, key = STORE.version(), (STORE.version(), SEED_JS.stat().st_mtime)
            if STORE.snap[0] != key:
                r = WORKER.call({"cmd": "snapshot", "db": STORE.db()})
                if not r.get("ok"):
                    return self.send_json({"error": r.get("error")}, 500)
                STORE.snap = (key, r["snapshot"])
            return self.send_json({"version": v, "snapshot": STORE.snap[1]})
        elif u.path == "/api/ops":
            if not self.is_admin(who):
                return self.send_json({"error": "forbidden"}, 403)
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
        if not isinstance(req, dict):
            return self.send_error(400, "invalid body")
        if u.path == "/api/login":
            return self.login(req)
        if u.path == "/api/logout":
            STORE.con.execute("DELETE FROM sessions WHERE hash=?", (sha(self.cookie() or ""),))
            return self.send_json({"ok": True}, cookie="")
        who = self.who()
        if not who:
            return self.send_json({"error": "signin"}, 401)
        if u.path == "/api/password":
            me = STORE.user(who) if who != LOCAL else None
            if not me:
                return self.send_json({"error": "signin"}, 401)
            if not check_pw(me, req.get("old"))[0]:
                return self.send_json({"error": "pw.wrong"}, 403)
            if len(req.get("new") or "") < 6:
                return self.send_json({"error": "pw.short"}, 400)
            me = {**me, "pw": hash_pw(req["new"]), "mustChange": False}
            me.pop("tempPw", None)
            STORE.write([("users", me["id"], me)], [])
            STORE.end_sessions(me["id"], keep=self.cookie())  # signed in elsewhere with the old password → signed out
            return self.send_json({"ok": True, "user": public_user(me)})
        if u.path == "/api/tokens":
            if who == LOCAL:
                return self.send_json({"error": "forbidden"}, 403)
            label = str(req.get("label") or "").strip()[:60]
            token = STORE.new_session(who, "mcp", label)
            return self.send_json({"token": token, **next(x for x in STORE.tokens(who) if x["id"] == sha(token)[:16])})
        if u.path == "/api/state":
            if who == LOCAL:
                return self.send_json({"error": "forbidden"}, 403)
            ups, dels = guard(who, [tuple(x) for x in req.get("upserts") or []], [tuple(x) for x in req.get("deletes") or []])
            prev, v = STORE.write(ups, dels)
            return self.send_json({"version": v, "prev": prev})
        if u.path == "/api/state/import":
            if who == LOCAL or not self.is_admin(who):
                return self.send_json({"error": "forbidden"}, 403)
            if not STORE.seed_only():
                return self.send_json({"error": "the server already has data"}, 409)
            STORE.backup()
            _, v = STORE.replace(req["db"])
            print(f"imported this browser's earlier data (version {v})", flush=True)
            migrate_outbox()
            if LEGACY.exists():
                LEGACY.rename(LEGACY.with_name("live_snapshot.migrated.json"))
            return self.send_json({"version": STORE.version(), "db": without_secrets(STORE.db())})
        if u.path == "/api/ops":
            if not req.get("id") or not req.get("op"):
                return self.send_json({"ok": False, "error": "op needs id and op"}, 400)
            if who != LOCAL:
                req["actor"] = who  # a token or a browser acts as its own member, whatever the op says
            # until a browser has opened the site, its old data may still be waiting in that browser to move over
            if not STORE.version() or (LEGACY.exists() and STORE.seed_only()):
                return self.send_json({"ok": False, "error": "open the site in your browser once first — it moves its data to the server"}, 409)
            return self.send_json(apply_op(req))
        self.send_error(404)

    def login(self, req):
        ip, t = self.client_address[0], time.time()
        if ip == "127.0.0.1" and self.headers.get("X-Forwarded-For"):  # behind a reverse proxy (Caddy) on this machine
            ip = self.headers["X-Forwarded-For"].split(",")[-1].strip()
        FAILS[ip] = [x for x in FAILS.get(ip, []) if t - x < 600]
        if len(FAILS[ip]) >= 10:
            return self.send_json({"error": "login.tooMany"}, 429)
        seed()
        if DEMO and req.get("id") and not req.get("password"):  # the demo lab: any member, one click
            u = STORE.user(req["id"])
            ok, upgrade = bool(u), False
            if u and u.get("mustChange") and not u.get("pw"):
                u["mustChange"] = False
                STORE.write([("users", u["id"], u)], [])
        else:
            u = STORE.find_user(req.get("name") or "")
            ok, upgrade = check_pw(u, req.get("password")) if u else (False, False)
        if not ok or u.get("disabled"):
            FAILS[ip].append(t)
            return self.send_json({"error": "login.fail"}, 403)
        if upgrade:
            STORE.write([("users", u["id"], {**u, "pw": hash_pw(req["password"])})], [])
        return self.send_json({"user": public_user(u)}, cookie=STORE.new_session(u["id"], "web"))

    def do_PUT(self):
        if not self.path.startswith("/api/files/"):
            return self.send_error(404)
        if not self.who():
            return self.send_json({"error": "signin"}, 401)
        try:
            data = self.body(MAX_FILE)
        except ValueError:
            return self.send_error(413)
        with STORE.lock:
            STORE.con.execute("INSERT OR REPLACE INTO files VALUES (?,?,?)", (self.file_id(), self.headers.get("Content-Type"), data))
        self.send_json({"ok": True})

    def do_DELETE(self):
        who = self.who()
        if self.path.startswith("/api/tokens/"):
            tid = self.path[len("/api/tokens/"):]
            if not who or who == LOCAL:
                return self.send_json({"error": "signin"}, 401)
            if len(tid) != 16 or any(c not in "0123456789abcdef" for c in tid):
                return self.send_error(404)
            with STORE.lock:
                n = STORE.con.execute("DELETE FROM sessions WHERE user=? AND kind='mcp' AND substr(hash, 1, 16)=?", (who, tid)).rowcount
            return self.send_json({"ok": True}) if n else self.send_error(404)
        if not self.path.startswith("/api/files/"):
            return self.send_error(404)
        if not who:
            return self.send_json({"error": "signin"}, 401)
        with STORE.lock:
            STORE.con.execute("DELETE FROM files WHERE id=?", (self.file_id(),))
        self.send_json({"ok": True})


def cli(args):
    """--reset-password <name> · --token <name>: run on the server machine (also while the server is running)"""
    flag = "--reset-password" if "--reset-password" in args else "--token"
    name = args[args.index(flag) + 1] if args.index(flag) + 1 < len(args) else ""
    seed()
    u = STORE.find_user(name)
    if not u:
        sys.exit(f"no member named {name!r} — members: {', '.join(sorted(x['name'] for x in STORE.users().values()))}")
    if flag == "--token":
        print(f"MCP token for {u['name']} (shown once — set it as LABSIDIAN_TOKEN):\n{STORE.new_session(u['id'], 'mcp')}")
        return
    temp = f"{secrets.token_hex(2)}-{secrets.token_hex(2)}"
    u = {**u, "pw": None, "tempPw": temp, "mustChange": True}
    STORE.write([("users", u["id"], u)], [])
    STORE.end_sessions(u["id"])
    print(f"temporary password for {u['name']}: {temp}  (they choose their own when they sign in)")


def main():
    global STORE, SECRET
    args = [a for a in sys.argv[1:] if a != "--demo"]
    host = "127.0.0.1"
    if "--host" in args:
        i = args.index("--host")
        host = args[i + 1]
        del args[i:i + 2]
    STORE = Store(DB_PATH)
    if "--reset-password" in args or "--token" in args:
        return cli(args)
    port = int(args[0]) if args else 8765
    LOCAL_SECRET.parent.mkdir(parents=True, exist_ok=True)
    if not LOCAL_SECRET.exists():
        LOCAL_SECRET.write_text(secrets.token_urlsafe(32), encoding="utf-8")
    SECRET = LOCAL_SECRET.read_text(encoding="utf-8").strip()
    STORE.backup()
    seed()
    srv = ThreadingHTTPServer((host, port), partial(Handler, directory=str(SITE)))
    print(f"Labsidian{' [DEMO]' if DEMO else ''} → http://{'localhost' if host == '127.0.0.1' else host}:{port}  (data: {DB_PATH.relative_to(ROOT)}, version {STORE.version()})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
