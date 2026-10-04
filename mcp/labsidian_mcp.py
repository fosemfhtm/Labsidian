"""Labsidian MCP server — lets each member's own Claude / Codex read the lab's paper diary and act for them.

Run (stdio):  .venv/Scripts/python mcp/labsidian_mcp.py
Identity:     LABSIDIAN_USER=<your name as on the site>   (mock: trusted as-is; the DB version uses a login token)
Server:       LABSIDIAN_URL=http://localhost:8765          the Labsidian server (scripts/serve.py) — real lab;
              http://localhost:8766 = the demo lab (serve.py --demo), which is where MCP changes get tested

The server owns the data (one SQLite file). This MCP server reads its snapshot and sends it one command per write;
the server applies the command right away with the site's own rules and answers ok or the reason it refused.
Nothing is published for you — diaries are created as *drafts* that the member checks and publishes.
Admin:        a second server entry with LABSIDIAN_USER=<an admin> (e.g. "admin") gets the admin_* tools —
              terms, diary duty, roles/accounts, tags. Passwords never go through MCP (temp passwords stay in the site).

Backend contract — what a hosted DB version has to provide (the tools only use these two):
  DB.data()       the snapshot shape: users, people, papers, reviews, topics, terms, comments, studies, …
  DB.apply(op)    one command {"op": <name>, "actor": <user id>, ...}; the backend applies it as that user and
                  enforces roles itself (here: POST /api/ops → site/store.js applyOp run headless; hosted: an RPC /
                  edge function that takes the actor from the login token instead of trusting "actor").
  ops: draft · draft.delete · comment · react · inbox.read · reading.add · reading.update
       study.create · study.join · study.question · study.questionVote · study.notesDraft
       guide.create · guide.update · guide.addItem · guide.vote
       admin: tag.merge · tag.rename · tag.create · quota.set · term.save · user.role · user.disable · offday.save ·
              offday.remove · cluster.name · paper.tags
  DB.apply answers what it made ({"itemId": …}, {"commentId": …}, {"studyId": …}) so a tool can hand the id back.
  Files (PDFs): GET / PUT /api/files/<id>.
Words: the site calls a member's write-up of a paper a "diary" (Korean 다이어리, never 리뷰); ids keep the old name
review_id.
Every command and its result is kept in the server's ops table (GET /api/ops, or SELECT * FROM ops).
"""
import json
import math
import os
import re
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from datetime import date

try:  # mcp >= 2 renamed FastMCP → MCPServer
    from mcp.server.mcpserver import MCPServer as FastMCP
    from mcp.server.mcpserver.exceptions import ToolError
except ImportError:
    from mcp.server.fastmcp import FastMCP
    from mcp.server.fastmcp.exceptions import ToolError

SITE = os.environ.get("LABSIDIAN_URL", "http://localhost:8765").rstrip("/")
# the server listens on 127.0.0.1 only; "localhost" would try IPv6 first and wait ~2 s per request on Windows
API = re.sub(r"//localhost(?=[:/]|$)", "//127.0.0.1", SITE)
ME = os.environ.get("LABSIDIAN_USER", "").strip()
LAB = os.environ.get("LABSIDIAN_LAB", "").strip()   # the lab's name, e.g. "KAIST 교통·AI 연구실" (optional)
FILES = os.environ.get("LABSIDIAN_DOWNLOADS") or os.path.join(tempfile.gettempdir(), "labsidian")   # where download_pdf saves
PDF_LIMIT = 20 * 1024 * 1024   # same as the site (site/store.js FILE_LIMIT)

mcp = FastMCP("labsidian", instructions=(
    f"Labsidian is {LAB + chr(39) + 's' if LAB else 'a research lab' + chr(39) + 's'} shared paper diary: members write a short diary for "
    "every paper they read (a summary + a critical memo), and the site lays the lab's papers out as a map. "
    "In Korean, call these 다이어리 (never 리뷰). Use the read tools to find papers, diaries, people and interests; "
    "to translate a diary, fetch it with get_paper and translate it yourself. Write tools act as the member, and "
    "never publish a diary — create_draft leaves a draft on their page for them to check and publish. When a paper "
    "name matches several papers, a tool lists them: pick one and call again with its id. "
    "Admin tools only work if LABSIDIAN_USER is an admin. Answer in the user's language."))


# ------------------------------------------------------------------ data
# tag colours are system colour names (docs/design/data-viz.md §2); a hex is still accepted for older callers
TAG_COLORS = ["red", "orange", "yellow", "green", "mint", "teal", "cyan", "blue", "indigo", "purple", "pink", "brown", "gray2"]


def _tag_color_ok(c):
    return c in TAG_COLORS or _re_hex(c)


def _re_hex(c):
    return bool(re.fullmatch(r"#[0-9a-fA-F]{3,8}", c or ""))


def norm_title(t):
    t = (t or "").lower().replace("ﬁ", "fi").replace("ﬂ", "fl")
    return re.sub(r"[^0-9a-z가-힣]+", "", t)


class ServerBackend:
    """the local Labsidian server (scripts/serve.py); a hosted DB later changes the URL and adds a login token"""
    _http = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # never route localhost through a system proxy

    def __init__(self):
        self.version, self.d = None, None

    def call(self, path, body=None):
        req = urllib.request.Request(API + path, data=None if body is None else json.dumps(body).encode("utf-8"),
                                     headers={"Content-Type": "application/json"}, method="GET" if body is None else "POST")
        try:
            with self._http.open(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read())
            except ValueError:
                raise ToolError(f"Labsidian server error {e.code} at {SITE}{path}")
        except (urllib.error.URLError, OSError):
            raise ToolError(f"The Labsidian server isn't running at {SITE} — start it with: python scripts/serve.py")

    def data(self):
        v = self.call("/api/version")["version"]
        if v != self.version or self.d is None:
            r = self.call("/api/snapshot")
            if "snapshot" not in r:
                raise ToolError(f"Labsidian server: {r.get('error')}")
            self.version, d = r["version"], r["snapshot"]
            d["P"] = {p["id"]: p for p in d["people"]}
            d["PA"] = {p["id"]: p for p in d["papers"]}
            d["R"] = {r["id"]: r for r in d["reviews"]}
            d["T"] = {t["id"]: t for t in d["topics"]}
            d["U"] = {u["id"]: u for u in d["users"]}
            for p in d["papers"]:
                p["_key"] = norm_title(p["title"])
                # fields for search_papers: a hit in the title counts most, then authors/venue and abstract, then diaries
                p["_f"] = {"title": p["title"].lower(), "meta": ((p.get("authors") or "") + " " + (p.get("venueNorm") or p.get("venue") or "")).lower(),
                           "abstract": (p.get("abstract") or "").lower(),
                           "diaries": " ".join(d["R"][r]["content"] + " " + d["R"][r]["memo"] for r in p["reviews"] if r in d["R"] and not self._blind(d, d["R"][r])).lower()}
                p["_hay"] = " ".join(p["_f"].values())
            self.d = d
        return self.d

    @staticmethod
    def _blind(d, r):
        """write-first rule for the configured member (see _hidden_for), evaluated while indexing"""
        if not ME or not r.get("studyId"):
            return False
        me_ = next((u for u in d["users"] if u["id"].lower() == ME.lower() or u["name"].lower() == ME.lower()), None)
        st = next((x for x in d.get("studies") or [] if x["id"] == r["studyId"]), None)
        if not me_ or not st or st.get("closed") or not st.get("blind") or st.get("paperId") != r["paper"] or r["person"] == me_["id"] or r["person"] not in st.get("members", []):
            return False
        return not any(x["paper"] == r["paper"] and x["person"] == me_["id"] for x in d["reviews"])

    def apply(self, op):
        """one command → the op with what the server made ("result": ids)"""
        op = {"id": "mcp_" + uuid.uuid4().hex[:12], "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **op}
        r = self.call("/api/ops", op)
        if not r.get("ok"):
            raise ToolError(f"Labsidian refused {op['op']}: {r.get('error')}")
        self.version = None   # the next read sees the change
        return {**op, "result": r.get("result") or {}}

    def put_file(self, data, mime):
        fid = "f_mcp" + uuid.uuid4().hex[:10]
        req = urllib.request.Request(f"{API}/api/files/{fid}", data=data, headers={"Content-Type": mime}, method="PUT")
        try:
            with self._http.open(req, timeout=120) as r:
                r.read()
        except (urllib.error.URLError, OSError) as e:
            raise ToolError(f"couldn't upload the file to {SITE}: {e}")
        return fid

    def get_file(self, fid):
        try:
            with self._http.open(urllib.request.Request(f"{API}/api/files/{urllib.request.quote(fid)}"), timeout=120) as r:
                return r.read(), r.headers.get("Content-Type") or ""
        except urllib.error.HTTPError as e:
            raise ToolError(f"no file {fid!r} on the server" if e.code == 404 else f"Labsidian server error {e.code}")
        except (urllib.error.URLError, OSError):
            raise ToolError(f"The Labsidian server isn't running at {SITE} — start it with: python scripts/serve.py")


DB = ServerBackend()


def person(name_or_id):
    d = DB.data()
    q = (name_or_id or "").strip().lower()
    for u in d["users"]:
        if u["id"].lower() == q or u["name"].lower() == q:
            return u
    hits = [u for u in d["users"] if q and q in u["name"].lower()]
    if len(hits) == 1:
        return hits[0]
    raise ToolError(f"no member named {name_or_id!r}" + (f" (did you mean: {', '.join(u['name'] for u in hits)}?)" if hits else ""))


def me():
    if not ME:
        raise ToolError("LABSIDIAN_USER is not set — add it to this MCP server's env (your name as on the site).")
    return person(ME)


def require_admin():
    u = me()
    if u.get("role") != "admin":
        raise ToolError(f"{u['name']} is not an admin")
    return u


def paper(ref):
    d = DB.data()
    if ref in d["PA"]:
        return d["PA"][ref]
    k = norm_title(ref)
    for p in d["papers"]:
        if p["_key"] == k:
            return p
    hits = [p for p in d["papers"] if k and k in p["_key"]]
    if len(hits) == 1:
        return hits[0]
    if hits:   # never guess: a write on the wrong paper is worse than one more call
        raise ToolError(f"{len(hits)} papers match {ref!r} — call again with one id: " +
                        "; ".join(f"{p['id']} = {p['title'][:90]}" for p in hits[:8]) + (" …" if len(hits) > 8 else ""))
    raise ToolError(f"no paper matching {ref!r} — try search_papers first")


def tag_label(tid):
    t = DB.data()["T"].get(tid)
    return f"{t['label']} / {t.get('labelEn', '')}" if t else tid


def cluster_name(c, lang="ko"):
    """what the site shows for a map region: an admin's name, else fine = top keywords, coarse = topic (+ keyword)"""
    if not c:
        return None
    if c.get("custom"):
        return c["custom"][lang]
    if c["level"] == "f" and c.get("keywords"):
        return " · ".join(c["keywords"][:2])
    if c["level"] == "a":  # an unnamed area goes by its biggest topic
        kids = sorted((x for x in DB.data().get("clusters") or [] if x["level"] == "c" and x.get("parent") == c["id"]), key=lambda x: -x.get("size", 0))
        if kids:
            return cluster_name(kids[0], lang)
    return c[lang]


def paper_tags(p):
    return [f"d:{x}" for x in p.get("domains", [])] + [f"m:{x}" for x in p.get("methods", [])] + list(p.get("free", []))


def file_list(fs):
    """attachments as the tools show them (download a PDF with download_pdf)"""
    return [{"file_id": f["id"], "name": f.get("name"), "kind": f.get("kind"), "size": f.get("size")} for f in fs or [] if f.get("id")]


def brief(p):
    d = DB.data()
    return {"id": p["id"], "title": p["title"], "venue": p.get("venueNorm") or p.get("venue", ""), "year": p.get("year"),
            "rating": p.get("rating"), "readers": [d["P"].get(r, {}).get("name", r) for r in p.get("readers", [])],
            "tags": [tag_label(t) for t in paper_tags(p)], "open": f"{SITE}/#/paper/{p['id']}"}


def term_for(day=None):
    d, day = DB.data(), day or date.today().isoformat()
    return next((t for t in d["terms"] if t["start"] <= day <= t["end"]), d["terms"][-1])


def quota(u, term):
    """a member's diary duty in a term, as the site computes it (working days, holidays, start/end dates, fixed targets)"""
    duty = ((DB.data().get("duties") or {}).get(term["id"]) or {}).get(u["id"])
    if duty:
        return {k: v for k, v in duty.items() if k in ("exempt", "notYet", "left", "start", "end", "workdays", "target", "custom")}
    return _quota_fallback(u, term)


def _quota_fallback(u, term):  # only for a server too old to send "duties"
    q = u.get("quota") or {}
    if q.get("exempt"):
        return {"exempt": True, "target": 0}
    start = max(q.get("start") or term["start"], term["start"])
    if start > term["end"]:
        return {"exempt": True, "target": 0, "notYet": True}
    end = min(q.get("end") or term["end"], term["end"])  # graduated / left the lab
    if end < start:
        return {"exempt": True, "target": 0, "left": True}
    span = lambda a, b: (date.fromisoformat(b) - date.fromisoformat(a)).days + 1
    auto = round((term.get("target") or 0) * span(start, end) / span(term["start"], term["end"]))
    custom = (q.get("targets") or {}).get(term["id"])
    return {"exempt": False, "start": start, "end": end, "target": int(custom) if custom not in (None, "") else auto}


# ------------------------------------------------------------------ read tools
@mcp.tool()
def whoami() -> dict:
    """Who this MCP server acts as, which Labsidian server it talks to and how much is in it."""
    d = DB.data()
    u = person(ME) if ME else None
    return {"user": u and {"id": u["id"], "name": u["name"], "role": u.get("role")}, "server": SITE, "dataVersion": DB.version,
            "papers": len(d["papers"]), "reviews": len(d["reviews"])}


@mcp.tool()
def search_papers(query: str = "", person_name: str = "", tag: str = "", min_rating: float = 0, term: str = "", limit: int = 15) -> list:
    """Search the lab's papers. query matches title/authors/venue/abstract/diary text (every word must match
    somewhere); results are ranked by where the words hit — title first, then authors/venue and abstract, then
    diaries — and then by how many members read the paper. Without a query: most-read first.
    person_name: only papers this member wrote a diary on. tag: tag id or label (e.g. "d:safety", "강화학습").
    term: e.g. "2026H1"."""
    d = DB.data()
    words = query.lower().split()
    who = person(person_name)["id"] if person_name else None
    tid = None
    if tag:
        tid = tag if tag in d["T"] else next((t["id"] for t in d["topics"] if tag.lower() in (t["label"] + " " + t.get("labelEn", "")).lower()), None)
        if not tid:
            raise ToolError(f"unknown tag {tag!r} — see list_tags")
    out = []
    for p in d["papers"]:
        if words and not all(w in p["_hay"] for w in words):
            continue
        if who and who not in p["readers"]:
            continue
        if tid and tid not in paper_tags(p):
            continue
        if min_rating and (p.get("rating") or 0) < min_rating:
            continue
        if term and not any(d["R"][r]["term"] == term for r in p["reviews"] if r in d["R"]):
            continue
        out.append(p)
    weight = {"title": 6, "meta": 3, "abstract": 2, "diaries": 1}
    score = lambda p: sum(max((w for f, w in weight.items() if word in p["_f"][f]), default=0) for word in words)
    out.sort(key=lambda p: (-score(p), -len(p["readers"]), -(p.get("rating") or 0)))
    return [brief(p) for p in out[:max(1, min(limit, 50))]]


@mcp.tool()
def get_paper(paper_ref: str, include_comments: bool = True) -> dict:
    """Full detail of one paper (id or title): metadata, abstract, every member's diary (summary + critique memo,
    review_id, attached PDFs) and comment threads. Use this to compare opinions, to answer a question on a diary, or to
    translate a diary (translate the returned text yourself)."""
    d = DB.data()
    p = paper(paper_ref)
    reviews = []
    for rid in p["reviews"]:
        r = d["R"].get(rid)
        if not r:
            continue
        if _hidden_for(r, me()["id"] if ME else ""):
            reviews.append({"review_id": rid, "by": d["P"].get(r["person"], {}).get("name", r["person"]),
                            "hidden": "written for a 'write first, then read' study — post your own entry on this paper to see it"})
            continue
        item = {"review_id": rid, "by": d["P"].get(r["person"], {}).get("name", r["person"]), "date": r["date"], "rating": r["rating"],
                "summary": r["content"], "memo": r["memo"], "tags": [tag_label(t) for t in r.get("tags", [])], "files": file_list(r.get("files"))}
        if include_comments:
            item["comments"] = [{"comment_id": c["id"], "by": d["P"].get(c["author"], {}).get("name", c["author"]), "kind": c["kind"],
                                 "body": c["body"], "resolved": c.get("resolved"), "reply_to": c.get("parent")}
                                for c in d.get("comments", []) if c["reviewId"] == rid]
        reviews.append(item)
    return {**brief(p), "authors": p.get("authors"), "link": p.get("link"), "abstract": p.get("abstract"),
            "cluster": cluster_name(next((c for c in d.get("clusters", []) if c["id"] == p.get("c")), None)),
            "similar": [brief(d["PA"][q]) for q, _ in p.get("nb", [])[:5] if q in d["PA"]], "reviews": reviews}


@mcp.tool()
def get_person(name: str) -> dict:
    """A member's profile: interests (field/method counts), how many diaries, most similar members, recent diaries,
    and this term's diary progress."""
    d = DB.data()
    u = person(name)
    p = d["P"].get(u["id"], {})
    mine = sorted((r for r in d["reviews"] if r["person"] == u["id"]), key=lambda r: r["date"], reverse=True)
    term = term_for()
    n = sum(1 for r in mine if term["start"] <= r["date"] <= term["end"])
    q = quota(u, term)
    return {"name": u["name"], "role": u.get("role"), "diaries": len(mine), "avgRating": p.get("avgRating"),
            "interests": [{"tag": tag_label(k), "papers": v} for k, v in list((p.get("topics") or {}).items())[:10]],
            "similarPeople": [{"name": d["P"][s["id"]]["name"], "similarity": s["sim"], "readTogether": s["shared"]}
                              for s in (p.get("similar") or [])[:5] if s["id"] in d["P"]],
            "thisTerm": {"term": term["id"], "written": n, **q},
            "recent": [{"date": r["date"], "rating": r["rating"], **brief(d["PA"][r["paper"]])} for r in mine[:10] if r["paper"] in d["PA"]],
            "open": f"{SITE}/#/person/{u['id']}"}


@mcp.tool()
def recommend_papers(name: str = "", limit: int = 10) -> list:
    """Papers others read in the member's top fields that they haven't read yet, closest to what they read first
    (SPECTER2 neighbours), then most recent (default: me). Same list as the person page."""
    d = DB.data()
    u = person(name) if name else me()
    p = d["P"].get(u["id"], {})
    top = [k[2:] for k in (p.get("topics") or {}) if k.startswith("d:")][:3]
    near = {}
    for x in d["papers"]:
        if u["id"] in x["readers"]:
            for nid, s in x.get("nb") or []:
                near[nid] = near.get(nid, 0) + s
    last = lambda x: max((d["R"][r]["date"] for r in x.get("reviews", []) if r in d["R"]), default="")
    cand = [x for x in d["papers"] if u["id"] not in x["readers"] and set(x.get("domains", [])) & set(top)]
    cand.sort(key=lambda x: last(x), reverse=True)
    cand.sort(key=lambda x: near.get(x["id"], 0), reverse=True)
    return [brief(x) for x in cand[:limit]]


@mcp.tool()
def similar_papers(paper_ref: str = "", text: str = "", limit: int = 8) -> list:
    """Papers similar to a lab paper (by its SPECTER2 neighbours) or to free text (keyword overlap)."""
    d = DB.data()
    if paper_ref:
        p = paper(paper_ref)
        return [brief(d["PA"][q]) | {"similarity": s} for q, s in p.get("nb", [])[:limit] if q in d["PA"]]
    words = [w for w in re.findall(r"[a-z][a-z\-]{2,}|[가-힣]{2,}", text.lower())]
    df = Counter(w for p in d["papers"] for w in set(re.findall(r"[a-z][a-z\-]{2,}|[가-힣]{2,}", p["_hay"])))
    N = len(d["papers"])
    scored = []
    for p in d["papers"]:
        s = sum(math.log(1 + N / (1 + df[w])) for w in set(words) if w in p["_hay"])
        if s:
            scored.append((s, p))
    scored.sort(key=lambda x: -x[0])
    return [brief(p) for _, p in scored[:limit]]


@mcp.tool()
def lab_progress(term: str = "") -> dict:
    """Diary progress of every member for a term (default: current) — written / target, exemptions."""
    d = DB.data()
    t = next((x for x in d["terms"] if x["id"] == term), None) if term else term_for()
    if not t:
        raise ToolError(f"unknown term {term!r}; terms: {[x['id'] for x in d['terms']]}")
    rows = []
    for u in d["users"]:
        if u["id"] == "admin" or u.get("disabled"):
            continue
        n = sum(1 for r in d["reviews"] if r["person"] == u["id"] and t["start"] <= r["date"] <= t["end"])
        q = quota(u, t)
        rows.append({"name": u["name"], "written": n, **q, "rate": None if q["exempt"] or not q["target"] else round(100 * n / q["target"])})
    rows.sort(key=lambda r: (r["rate"] is None, -(r["rate"] or 0)))
    return {"term": t, "members": rows}


@mcp.tool()
def list_tags() -> list:
    """All tags with axis (domain=field, method, free=keyword), Korean/English labels and how many papers use them."""
    d = DB.data()
    use = Counter(t for p in d["papers"] for t in paper_tags(p))
    return sorted(({"id": t["id"], "axis": t["axis"], "ko": t["label"], "en": t.get("labelEn"), "papers": use[t["id"]]} for t in d["topics"]),
                  key=lambda x: (x["axis"], -x["papers"]))


@mcp.tool()
def my_inbox(limit: int = 20, unread_only: bool = False, mark_read: bool = False) -> list:
    """My notifications: questions/comments/ideas on my diaries, replies, @mentions, 👍, study invites and reminders,
    my AI's drafts. Each has the ids to act on it — answer a question with add_comment(review_id, …, reply_to=comment_id),
    open a study with get_study(study_id). mark_read marks the returned ones as read on the site."""
    d = DB.data()
    u = me()
    ns = [n for n in (d.get("notifications") or {}).get(u["id"], []) if not unread_only or not n.get("read")][:max(1, min(limit, 100))]
    if mark_read and ns:
        DB.apply({"op": "inbox.read", "actor": u["id"], "ids": [n["id"] for n in ns], "summary": f"{len(ns)} read"})
    link = lambda n: (f"{SITE}/#/paper/{n['paperId']}" if n.get("paperId") else f"{SITE}/#/study/{n['studyId']}" if n.get("studyId")
                      else f"{SITE}/#/guide/{n['guideId']}" if n.get("guideId") else f"{SITE}/#/write?mcp={n['draftId']}" if n.get("draftId") else None)
    keys = (("review_id", "reviewId"), ("comment_id", "commentId"), ("study_id", "studyId"), ("guide_id", "guideId"), ("draft_id", "draftId"))
    return [{"id": n["id"], "type": n["type"], "from": _name(n.get("actor")), "at": n["at"], "read": bool(n.get("read")),
             "paper": d["PA"].get(n.get("paperId"), {}).get("title"), "excerpt": n.get("excerpt"),
             **{k: n[v] for k, v in keys if n.get(v)}, "open": link(n)} for n in ns]


# ------------------------------------------------------------------ write tools (applied by the server as the member)
def _done(op, extra=None):
    return {"applied": op["id"], **{_snake(k): v for k, v in (op.get("result") or {}).items()},
            "note": "Done — open pages pick it up within a few seconds.", **(extra or {})}


def _snake(k):
    return re.sub(r"(?<!^)([A-Z])", r"_\1", k).lower()   # itemId → item_id


def _attach_pdf(path):
    """upload a local PDF for a draft → the attachment the site expects"""
    path = os.path.expanduser(path.strip().strip('"'))
    if not os.path.isfile(path):
        raise ToolError(f"no file at {path!r}")
    data = open(path, "rb").read()
    if not data.startswith(b"%PDF"):
        raise ToolError(f"{os.path.basename(path)} isn't a PDF")
    if len(data) > PDF_LIMIT:
        raise ToolError(f"{os.path.basename(path)} is over 20 MB (the site's limit)")
    return {"id": DB.put_file(data, "application/pdf"), "name": os.path.basename(path), "type": "application/pdf", "size": len(data), "kind": "pdf"}


@mcp.tool()
def create_draft(title: str, summary: str, memo: str, rating: int, tags: list[str] | None = None, link: str = "",
                 venue: str = "", authors: str = "", year: str = "", abstract: str = "", diary_date: str = "",
                 pdf_path: str = "", reading_item_id: str = "") -> dict:
    """Create a diary DRAFT for me (never published automatically). summary = Problem/Method/Result/Contribution,
    memo = critique (required by lab rules). tags: ids from list_tags (or "f:keyword"). rating 1–5.
    diary_date = which week the entry counts for (YYYY-MM-DD, default today; past/future weeks are fine —
    the actual posting time is recorded separately when the member publishes).
    The PDF comes along with the draft: pdf_path = a local PDF file, and/or reading_item_id = a reading-list item
    whose PDFs to attach (its title, link and authors fill in what you leave empty). The member checks the draft
    in the site's write form and publishes it themselves."""
    u = me()
    d = DB.data()
    files = []
    if reading_item_id:
        x = next((x for x in (d.get("reading") or {}).get(u["id"], []) if x["id"] == reading_item_id), None)
        if not x:
            raise ToolError("unknown reading_item_id — see my_reading_list")
        files += [f for f in x.get("files") or [] if f.get("kind") == "pdf"]
        title, link, authors, venue, year = title or x["title"], link or x.get("link") or "", authors or x.get("authors") or "", venue or x.get("venue") or "", year or str(x.get("year") or "")
    if pdf_path:
        files.append(_attach_pdf(pdf_path))
    if not (1 <= int(rating) <= 5):
        raise ToolError("rating must be 1..5")
    if not memo.strip():
        raise ToolError("memo (critique) is required — lab rule since May 2024")
    bad = [t for t in (tags or []) if t not in d["T"] and not t.startswith("f:")]
    if bad:
        raise ToolError(f"unknown tags {bad} — use list_tags")
    if diary_date:
        try:
            date.fromisoformat(diary_date)
        except ValueError:
            raise ToolError("diary_date must be YYYY-MM-DD")
    tags = [t if not t.startswith("f:") else "f:" + re.sub(r"[^0-9a-z가-힣_-]+", "-", t[2:].lower()).strip("-")[:40] for t in (tags or [])]
    op = DB.apply({"op": "draft", "actor": u["id"], "summary": title[:60], "data": {
        "title": title, "content": summary, "memo": memo, "rating": int(rating), "tags": tags or [], "link": link, "venue": venue,
        "authors": authors, "year": year, "abstract": abstract, "date": diary_date or date.today().isoformat(), "source": "mcp", "files": files}})
    return _done(op, {"pdfs": [f["name"] for f in files], "open": f"{SITE}/#/write?mcp={op['id']}"})


@mcp.tool()
def my_drafts() -> list:
    """Diary drafts my AI made that I haven't published yet (newest first)."""
    u = me()
    return [{"draft_id": x["id"], "title": x.get("title"), "made": x.get("at"), "rating": x.get("rating"), "pdfs": [f.get("name") for f in x.get("files") or []],
             "open": f"{SITE}/#/write?mcp={x['id']}"} for x in (DB.data().get("mcpDrafts") or {}).get(u["id"], [])]


@mcp.tool()
def delete_draft(draft_id: str) -> dict:
    """Throw away one of my AI drafts (draft_id from my_drafts) — e.g. a duplicate or one I won't publish."""
    u = me()
    return _done(DB.apply({"op": "draft.delete", "actor": u["id"], "draftId": draft_id, "summary": draft_id}))


@mcp.tool()
def add_comment(review_id: str, body: str, kind: str = "comment", reply_to: str = "") -> dict:
    """Comment on a diary as me (review_id from get_paper or my_inbox). kind: comment | question | idea. Mention people
    with @name. reply_to: the comment_id of a top-level comment, to answer it (e.g. a question in my_inbox)."""
    u = me()
    d = DB.data()
    if review_id not in d["R"]:
        raise ToolError("unknown review_id — get it from get_paper")
    if kind not in ("comment", "question", "idea"):
        raise ToolError("kind must be comment, question or idea")
    if reply_to:
        parent = next((c for c in d.get("comments", []) if c["id"] == reply_to), None)
        if not parent or parent["reviewId"] != review_id or parent.get("parent"):
            raise ToolError("reply_to must be a top-level comment_id on the same review (see get_paper)")
    op = DB.apply({"op": "comment", "actor": u["id"], "reviewId": review_id, "kind": kind, "body": body, "parent": reply_to or None, "summary": body[:60]})
    return _done(op, {"open": f"{SITE}/#/paper/{d['R'][review_id]['paper']}"})


@mcp.tool()
def react_to_diary(review_id: str, kind: str = "like", on: bool = True) -> dict:
    """React to someone's diary as me: kind "like" = 👍 (they get a notification), "want" = "I want to read this too"
    (the paper goes on my reading list). on=False takes it back."""
    u = me()
    if review_id not in DB.data()["R"]:
        raise ToolError("unknown review_id — get it from get_paper")
    if kind not in ("like", "want"):
        raise ToolError("kind must be like or want")
    return _done(DB.apply({"op": "react", "actor": u["id"], "reviewId": review_id, "kind": kind, "on": bool(on), "summary": f"{kind} {review_id}"}))


@mcp.tool()
def my_reading_list(status: str = "") -> list:
    """My reading list: papers to read (todo), being read (reading), read but not written up (read), and ones I already
    wrote a diary on (written). Each item has an id for update_reading_item / create_draft(reading_item_id=…), the
    paper's details, my note and its PDFs (download_pdf to read one)."""
    u = me()
    items = (DB.data().get("reading") or {}).get(u["id"]) or []
    state = lambda x: "written" if x.get("written") else x.get("status", "todo")
    if status and status not in ("todo", "reading", "read", "written"):
        raise ToolError("status: todo | reading | read | written")
    return [{"id": x["id"], "status": state(x), "title": x["title"], "authors": x.get("authors"), "venue": x.get("venue"), "year": x.get("year"),
             "link": x.get("link"), "note": x.get("note"), "addedAt": x.get("addedAt"), "readAt": x.get("readAt"), "pdfs": file_list(x.get("files")),
             "labPaper": x.get("paperId"), "readInLabBy": [_name(r) for r in x.get("readers") or []]}
            for x in items if not status or state(x) == status]


@mcp.tool()
def add_to_reading_list(paper_ref: str = "", link: str = "", title: str = "", note: str = "") -> dict:
    """Add a paper to my reading list: a lab paper (paper_ref = id or title from search_papers), or any paper by link /
    DOI / arXiv id (looked up for title, authors, abstract) or just its title. An optional note says why I want to read it."""
    u = me()
    if paper_ref:
        p = paper(paper_ref)
        return _done(DB.apply({"op": "reading.add", "actor": u["id"], "paperId": p["id"], "note": note, "summary": p["title"][:60]}), {"open": f"{SITE}/#/reading"})
    if not (link or title):
        raise ToolError("give paper_ref, link or title")
    try:
        op = DB.apply({"op": "reading.add", "actor": u["id"], "input": (link or title).strip(), "title": title.strip(), "link": link.strip(),
                       "note": note, "summary": (title or link)[:60]})
    except ToolError as e:
        if "lookup.failed" in str(e):
            raise ToolError("couldn't find the paper behind that link — call again with its title as well")
        raise
    return _done(op, {"open": f"{SITE}/#/reading"})


@mcp.tool()
def update_reading_item(item_id: str, status: str = "", note: str | None = None) -> dict:
    """Move a reading-list item (id from my_reading_list) to todo / reading / read, or replace its note.
    To write it up, use create_draft(reading_item_id=…) — its title, link and PDF come along."""
    u = me()
    if status and status not in ("todo", "reading", "read"):
        raise ToolError("status: todo | reading | read")
    patch = {**({"status": status} if status else {}), **({"note": note} if note is not None else {})}
    if not patch:
        raise ToolError("nothing to change")
    return _done(DB.apply({"op": "reading.update", "actor": u["id"], "itemId": item_id, "patch": patch, "summary": f"{item_id} {patch}"}))



@mcp.tool()
def download_pdf(file_id: str) -> dict:
    """Save an attached PDF (file_id from my_reading_list, get_paper or get_study) to a local file and return its
    path, so you can read the paper — e.g. before drafting a diary with create_draft(reading_item_id=…)."""
    data, mime = DB.get_file(file_id)
    if "pdf" not in mime and not data.startswith(b"%PDF"):
        raise ToolError(f"{file_id} is not a PDF ({mime or 'unknown type'})")
    d = DB.data()
    every = [f for x in (d.get("reading") or {}).values() for i in x for f in i.get("files") or []] + \
            [f for r in d["reviews"] for f in r.get("files") or []] + [f for st in d.get("studies") or [] for f in st.get("files") or []]
    name = next((f.get("name") for f in every if f.get("id") == file_id), None) or file_id + ".pdf"
    os.makedirs(FILES, exist_ok=True)
    path = os.path.join(FILES, re.sub(r'[\\/:*?"<>|]+', "_", name if name.lower().endswith(".pdf") else name + ".pdf"))
    with open(path, "wb") as f:
        f.write(data)
    return {"path": path, "bytes": len(data)}


# ------------------------------------------------------------------ paper study
def _study(study_id):
    d = DB.data()
    st = next((x for x in d.get("studies") or [] if x["id"] == study_id), None)
    if not st:
        raise ToolError("unknown study_id — use list_studies")
    return st


def _hidden_for(r, viewer_id):
    """Study 'write first, then read': a member's entry on the common paper of an open blind study stays hidden
    from anyone who hasn't written their own entry on that paper (same rule as the site)."""
    d = DB.data()
    if not r or r["person"] == viewer_id or not r.get("studyId"):
        return False
    st = next((x for x in d.get("studies") or [] if x["id"] == r["studyId"]), None)
    if not st or st.get("closed") or not st.get("blind", False) or st.get("paperId") != r["paper"] or r["person"] not in st.get("members", []):
        return False
    return not any(x["paper"] == r["paper"] and x["person"] == viewer_id for x in d["reviews"])


def _name(uid):
    return DB.data()["P"].get(uid, {}).get("name") or DB.data()["U"].get(uid, {}).get("name") or uid


@mcp.tool()
def list_studies(include_past: bool = False) -> list:
    """Paper studies in the lab (open ones first; include_past adds finished ones)."""
    d = DB.data()
    out = []
    for st in sorted(d.get("studies") or [], key=lambda x: (bool(x.get("closed")), x.get("date") or "9999", x.get("createdAt", ""))):
        if st.get("closed") and not include_past:
            continue
        qs = [q for q in d.get("studyQuestions") or [] if q["studyId"] == st["id"]]
        g = next((x for x in d.get("guides") or [] if x["id"] == st.get("guideId")), None)
        rnd = sorted((x for x in d.get("studies") or [] if x.get("guideId") == st.get("guideId")), key=lambda x: (x.get("date") or "9999", x.get("createdAt", ""))).index(st) + 1 if g else None
        out.append({"id": st["id"], "title": st["title"], "date": st.get("date") or None, "time": st.get("time") or None, "place": st.get("place") or None,
                    **({"reading_group": g["title"], "round": rnd, "guide_id": g["id"]} if g else {}),
                    "presenter": _name(st["presenter"]), "members": [_name(u) for u in st["members"]], "questions": len(qs),
                    "closed": bool(st.get("closed")), "open": f"{SITE}/#/study/{st['id']}"})
    return out


@mcp.tool()
def get_study(study_id: str) -> dict:
    """One study: paper, members, every member's review of the paper (summary + memo), the question board
    (with votes) and the shared notes. Useful for comparing reviews or preparing the discussion."""
    d = DB.data()
    st = _study(study_id)
    p = d["PA"].get(st.get("paperId") or "")
    viewer = me()["id"] if ME else ""
    revs = [d["R"][r] for r in (p or {}).get("reviews", []) if r in d["R"]]
    hidden = [r for r in revs if _hidden_for(r, viewer)]
    revs = [r for r in revs if r not in hidden]
    picks = sorted((st.get("picks") or {}).values(), key=lambda x: (x.get("order", 1e9), x.get("at", "")))
    qs = sorted([q for q in d.get("studyQuestions") or [] if q["studyId"] == st["id"]], key=lambda q: (q.get("done", False), -len(q.get("votes", []))))
    return {
        "id": st["id"], "title": st["title"], "date": st.get("date") or None, "time": st.get("time") or None, "place": st.get("place") or None,
        "about": st.get("desc", ""), "presenter": _name(st["presenter"]), "members": [_name(u) for u in st["members"]], "closed": bool(st.get("closed")),
        "paper": ({**brief(p), "abstract": p.get("abstract", "")} if p else {"title": st["title"], "link": st.get("link", ""), "inLab": False}),
        "reviews": [{"review_id": r["id"], "by": _name(r["person"]), "rating": r.get("rating"), "diary_date": r["date"],
                     "summary": r.get("content", ""), "memo": r.get("memo", ""), "for_this_study": r.get("studyId") == st["id"]} for r in revs],
        "not_reviewed_yet": [_name(u) for u in st["members"] if u not in {r["person"] for r in revs} | {r["person"] for r in hidden}],
        "hidden_until_you_write": [_name(r["person"]) for r in hidden],
        "write_first": bool(st.get("blind")), "everyone_brings_a_paper": bool(st.get("bring")),
        "brought_papers": [{"order": i + 1, "by": _name(pk["uid"]), "title": pk["title"], "why": pk.get("why", ""),
                            "paper": brief(d["PA"][pk["paperId"]]) if pk.get("paperId") in d["PA"] else {"title": pk["title"], "link": pk.get("link", "")}}
                           for i, pk in enumerate(picks)],
        "questions": [{"question_id": q["id"], "by": _name(q["author"]), "question": q["body"], "votes": len(q.get("votes", [])),
                       "i_voted": viewer in (q.get("votes") or []), "discussed": q.get("done", False)} for q in qs],
        "pdfs": file_list(st.get("files")), "i_am_member": viewer in st["members"],
        "notes": st.get("notes"), "open": f"{SITE}/#/study/{st['id']}",
    }


@mcp.tool()
def add_study_question(study_id: str, question: str) -> dict:
    """Post a question to a study's question board as me (others vote on it before the meeting)."""
    u = me()
    st = _study(study_id)
    if st.get("closed"):
        raise ToolError("this study is finished")
    if not question.strip():
        raise ToolError("empty question")
    return _done(DB.apply({"op": "study.question", "actor": u["id"], "studyId": st["id"], "body": question.strip()[:1000], "summary": question[:60]}),
                   {"open": f"{SITE}/#/study/{st['id']}"})


@mcp.tool()
def vote_study_question(study_id: str, question_id: str, on: bool = True) -> dict:
    """👍 a question on a study's question board as me (question_id from get_study) — the most-voted are discussed
    first. on=False takes the vote back."""
    u, st = me(), _study(study_id)
    if not any(q["id"] == question_id and q["studyId"] == st["id"] for q in DB.data().get("studyQuestions") or []):
        raise ToolError("unknown question_id for this study — see get_study")
    return _done(DB.apply({"op": "study.questionVote", "actor": u["id"], "questionId": question_id, "on": bool(on), "summary": question_id}))


@mcp.tool()
def join_study(study_id: str) -> dict:
    """Join a study as me (its paper goes on my reading list; the host is told)."""
    u, st = me(), _study(study_id)
    if st.get("closed"):
        raise ToolError("this study is finished")
    return _done(DB.apply({"op": "study.join", "actor": u["id"], "studyId": st["id"], "summary": st["title"][:60]}), {"open": f"{SITE}/#/study/{st['id']}"})


@mcp.tool()
def open_study(paper_ref: str = "", title: str = "", link: str = "", guide_id: str = "", guide_item_id: str = "",
               on_date: str = "", at_time: str = "", place: str = "", presenter: str = "", invite: list[str] | None = None,
               about: str = "", write_first: bool = True, everyone_brings_a_paper: bool = False) -> dict:
    """Open a paper study as me (I host it; invited members get a notification). The paper: a lab paper (paper_ref),
    or any paper by title / link. on_date YYYY-MM-DD, at_time HH:MM. write_first = members must post their own diary
    before they see others' (the usual). For a reading group's next session give guide_id (see list_guides /
    get_guide): date, time, place, members, whose turn it is to present and the paper (the most-👍 one not covered
    yet, or guide_item_id) are filled in like the site's "next session" form — anything you pass overrides them.
    Explain what you'll open to the user before calling."""
    u = me()
    if on_date:
        try:
            date.fromisoformat(on_date)
        except ValueError:
            raise ToolError("on_date must be YYYY-MM-DD")
    if at_time and not re.fullmatch(r"\d{1,2}:\d{2}", at_time):
        raise ToolError("at_time must be HH:MM")
    g = _guide(guide_id) if guide_id else None
    if guide_item_id and not (g and any(it["id"] == guide_item_id for it in g["items"])):
        raise ToolError("guide_item_id needs its guide_id — see get_guide")
    p = paper(paper_ref) if paper_ref else None
    if not (p or title or g):
        raise ToolError("give paper_ref, title or guide_id")
    op = DB.apply({"op": "study.create", "actor": u["id"], "paperId": p["id"] if p else None, "title": title.strip(), "link": link.strip(),
                   "guideId": g["id"] if g else None, "itemId": guide_item_id or None, "date": on_date, "time": at_time, "place": place,
                   "presenter": person(presenter)["id"] if presenter else None, "invite": [person(x)["id"] for x in invite or []],
                   "desc": about, "blind": bool(write_first), "bring": bool(everyone_brings_a_paper), "summary": (p["title"] if p else title or g["title"])[:60]})
    sid = op["result"].get("studyId")
    st = _study(sid) if sid else None
    return _done(op, {"title": st and st["title"], "date": st and (st.get("date") or None), "time": st and (st.get("time") or None),
                      "place": st and (st.get("place") or None), "presenter": st and _name(st["presenter"]),
                      "members": st and [_name(x) for x in st["members"]], "open": sid and f"{SITE}/#/study/{sid}"})


@mcp.tool()
def draft_study_notes(study_id: str, conclusion: str, open_questions: str = "", follow_ups: str = "") -> dict:
    """Draft the study's shared notes for me (e.g. after comparing the reviews with get_study). It is NOT saved as the
    notes: I get a "load draft" button on the study page, check it, and save it myself. I must be a member of the study."""
    u = me()
    st = _study(study_id)
    if u["id"] not in st["members"] and u.get("role") != "admin":
        raise ToolError("only study members can draft its notes — join the study on the site first")
    return _done(DB.apply({"op": "study.notesDraft", "actor": u["id"], "studyId": st["id"], "conclusion": conclusion, "open": open_questions,
                               "next": follow_ups, "summary": st["title"][:60]}), {"open": f"{SITE}/#/study/{st['id']}"})

# ------------------------------------------------------------------ core-paper guides
def _guide(guide_id):
    g = next((x for x in DB.data().get("guides") or [] if x["id"] == guide_id), None)
    if not g:
        raise ToolError("unknown guide_id — use list_guides")
    return g


def _tag_id(x):
    """a tag id ("d:…", "m:…") or a label in either language"""
    d = DB.data()
    if x in d["T"]:
        return x
    k = x.strip().lower()
    t = next((t for t in d["topics"] if t["axis"] in ("domain", "method") and k in (t["label"].lower(), (t.get("labelEn") or "").lower())), None)
    if not t:
        raise ToolError(f"no field/method tag {x!r} — see list_tags")
    return t["id"]


@mcp.tool()
def list_guides(tag: str = "") -> list:
    """Core-paper guides: lists of key papers per topic that the lab curates together (optionally only those with a
    field/method tag). Shows how far I am (papers I wrote a diary on) in each."""
    d, uid = DB.data(), (me()["id"] if ME else "")
    tid = _tag_id(tag) if tag else ""
    mine = {r["paper"] for r in d["reviews"] if r["person"] == uid}
    return [{"id": g["id"], "title": g["title"], "about": g.get("desc", ""), "by": _name(g["owner"]), "tags": [tag_label(x) for x in g.get("tags") or []],
             "papers": len(g["items"]), "i_wrote": sum(1 for it in g["items"] if it.get("paperId") in mine), "open": f"{SITE}/#/guide/{g['id']}"}
            for g in d.get("guides") or [] if not tid or tid in (g.get("tags") or [])]


@mcp.tool()
def get_guide(guide_id: str) -> dict:
    """One guide by section: every paper with who added it and why, 👍 count, who in the lab read it, whether I wrote
    a diary on it, and the studies that covered it. Good for planning what to read or study next. When the guide runs
    as a reading group: its members, schedule and every session (round, paper, presenter, notes) — get_study for one."""
    d, g = DB.data(), _guide(guide_id)
    uid = me()["id"] if ME else ""
    mine = {r["paper"] for r in d["reviews"] if r["person"] == uid}
    st = {x["id"]: x for x in d.get("studies") or []}
    sec = lambda sid: [{"item_id": it["id"], "title": it["title"], "paper": brief(d["PA"][it["paperId"]]) if it.get("paperId") in d["PA"] else {**(it.get("meta") or {}), "inLab": False},
                        "note": it.get("note", ""), "added_by": _name(it["by"]), "votes": len(it.get("votes") or []),
                        "read_by": [_name(u) for u in it.get("readers") or []], "i_wrote": it.get("paperId") in mine,
                        "studies": [{"id": s, "title": st[s]["title"], "date": st[s].get("date") or None} for s in it.get("studies") or [] if s in st]}
                       for it in g["items"] if it["section"] == sid]
    gr = g.get("group") or {}
    sessions = sorted((x for x in st.values() if x.get("guideId") == g["id"]), key=lambda x: (x.get("date") or "9999", x.get("createdAt", "")))
    days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    group = {"members": [_name(u) for u in gr.get("members") or []], "place": gr.get("place") or None,
             "schedule": (f"every {'other ' if (gr.get('cadence') or {}).get('every') == 2 else ''}{days[gr['cadence']['weekday']]} {gr['cadence'].get('time', '')}".strip()
                          if gr.get("cadence") else None),
             "sessions": [{"round": i + 1, "study_id": x["id"], "title": x["title"], "date": x.get("date") or None, "presenter": _name(x["presenter"]),
                           "finished": bool(x.get("closed")), "has_notes": bool(x.get("notes"))} for i, x in enumerate(sessions)]} if gr.get("on") else None
    return {"id": g["id"], "title": g["title"], "about": g.get("desc", ""), "by": _name(g["owner"]), "tags": [tag_label(x) for x in g.get("tags") or []],
            "reading_group": group, "sections": [{"section": x["title"], "papers": sec(x["id"])} for x in g["sections"]], "open": f"{SITE}/#/guide/{g['id']}"}


@mcp.tool()
def create_guide(title: str, description: str = "", tags: list[str] | None = None, sections: list[str] | None = None) -> dict:
    """Start a core-paper guide as me (I become its owner). tags: field/method tag ids or labels (list_tags);
    sections default to 기초 / 핵심 / 최신. Then add papers with add_guide_item."""
    u = me()
    if not title.strip():
        raise ToolError("empty title")
    gid = "g_" + uuid.uuid4().hex[:10]
    guide = {"title": title.strip(), "desc": description, "tags": [_tag_id(x) for x in tags or []], **({"sections": sections} if sections else {})}
    return _done(DB.apply({"op": "guide.create", "actor": u["id"], "guideId": gid, "guide": guide, "summary": title[:60]}),
                 {"guide_id": gid, "open": f"{SITE}/#/guide/{gid}"})


@mcp.tool()
def add_guide_item(guide_id: str, paper_ref: str = "", link: str = "", title: str = "", section: str = "", note: str = "") -> dict:
    """Add a paper to a guide as me: a lab paper (paper_ref = id or title from search_papers), or any paper by link /
    DOI / arXiv id or title. section = a section's name (default: the first); note = one line on why it is core.
    The guide's owner gets a notification. The same paper twice is ignored."""
    u, g = me(), _guide(guide_id)
    sec = next((x["id"] for x in g["sections"] if section and section.strip().lower() in (x["title"].lower(), x["id"])), None)
    if section and not sec:
        raise ToolError(f"no section {section!r} — sections: {', '.join(x['title'] for x in g['sections'])}")
    base = {"op": "guide.addItem", "actor": u["id"], "guideId": g["id"], "section": sec, "note": note[:300]}
    if paper_ref:
        p = paper(paper_ref)
        return _done(DB.apply({**base, "paperId": p["id"], "summary": p["title"][:60]}), {"open": f"{SITE}/#/guide/{g['id']}"})
    if not (link or title):
        raise ToolError("give paper_ref, link or title")
    return _done(DB.apply({**base, "input": (link or title).strip(), "title": title.strip(), "link": link.strip(), "summary": (title or link)[:60]}),
                 {"open": f"{SITE}/#/guide/{g['id']}"})


@mcp.tool()
def vote_guide_item(guide_id: str, item_id: str) -> dict:
    """👍 a paper in a guide as me (item_id from get_guide) — "this one really is core". Voting twice keeps one vote."""
    u, g = me(), _guide(guide_id)
    if not any(it["id"] == item_id for it in g["items"]):
        raise ToolError("unknown item_id — see get_guide")
    return _done(DB.apply({"op": "guide.vote", "actor": u["id"], "guideId": g["id"], "itemId": item_id, "summary": item_id}))


# ------------------------------------------------------------------ admin tools
@mcp.tool()
def admin_merge_tags(from_tag: str, into_tag: str) -> dict:
    """[admin] Merge one tag into another of the same axis (e.g. a duplicate). Undoable from the site's admin page.
    Check list_tags first; explain the merges to the user before calling."""
    u, d = require_admin(), DB.data()
    for t in (from_tag, into_tag):
        if t not in d["T"]:
            raise ToolError(f"unknown tag {t}")
    if from_tag[0] != into_tag[0] or from_tag == into_tag:
        raise ToolError("can only merge two different tags of the same axis")
    return _done(DB.apply({"op": "tag.merge", "actor": u["id"], "from": from_tag, "into": into_tag, "summary": f"{from_tag} → {into_tag}"}))


@mcp.tool()
def admin_rename_tag(tag_id: str, label_ko: str = "", label_en: str = "", color: str = "") -> dict:
    """[admin] Rename a tag (Korean and/or English label) or change its colour — a system colour name
    (red orange yellow green mint teal cyan blue indigo purple pink brown gray2), which follows the site's theme."""
    if color and not _tag_color_ok(color):
        raise ToolError("color must be a system colour name: " + " ".join(TAG_COLORS))
    u, d = require_admin(), DB.data()
    t = d["T"].get(tag_id)
    if not t:
        raise ToolError(f"unknown tag {tag_id}")
    return _done(DB.apply({"op": "tag.rename", "actor": u["id"], "tagId": tag_id, "label": label_ko or t["label"],
                               "labelEn": label_en or t.get("labelEn"), "color": color or None, "summary": tag_id}))


@mcp.tool()
def admin_create_tag(axis: str, label_ko: str, label_en: str, color: str = "gray2") -> dict:
    """[admin] Create a new field (axis="domain") or method (axis="method") tag. color: a system colour name
    (red orange yellow green mint teal cyan blue indigo purple pink brown gray2)."""
    if not _tag_color_ok(color):
        raise ToolError("color must be a system colour name: " + " ".join(TAG_COLORS))
    u = require_admin()
    if axis not in ("domain", "method"):
        raise ToolError("axis must be domain or method")
    return _done(DB.apply({"op": "tag.create", "actor": u["id"], "axis": axis, "label": label_ko, "labelEn": label_en, "color": color, "summary": label_ko}))


@mcp.tool()
def admin_set_member_quota(name: str, exempt: bool | None = None, start_date: str = "", end_date: str = "",
                           target: int | None = None, term: str = "") -> dict:
    """[admin] Set a member's diary duty: exempt (e.g. postdocs), start_date (e.g. a new student starting in
    September), end_date (graduated / left the lab — no duty after it), YYYY-MM-DD, targets are prorated to that
    period; or a fixed target for one term (term id, default current). Pass "none" as a date to clear it."""
    u, m = require_admin(), person(name)
    q = {}
    if exempt is not None:
        q["exempt"] = bool(exempt)
    for key, val in (("start", start_date), ("end", end_date)):
        if val.lower() == "none":
            q[key] = None
        elif val:
            try:
                date.fromisoformat(val)
            except ValueError:
                raise ToolError(f"{key}_date must be YYYY-MM-DD (or none)")
            q[key] = val
    if target is not None:
        q["targets"] = {(term or term_for()["id"]): int(target)}
    if not q:
        raise ToolError("nothing to change")
    return _done(DB.apply({"op": "quota.set", "actor": u["id"], "member": m["id"], "quota": q, "summary": f"{m['name']} {q}"}))


@mcp.tool()
def admin_list_members(term: str = "") -> list:
    """[admin] Every account with role, active/disabled, raw diary-duty settings and the duty for a term (default current)."""
    require_admin()
    d = DB.data()
    t = next((x for x in d["terms"] if x["id"] == term), None) if term else term_for()
    if not t:
        raise ToolError(f"unknown term {term!r}; terms: {[x['id'] for x in d['terms']]}")
    return [{"id": u["id"], "name": u["name"], "role": u.get("role"), "disabled": bool(u.get("disabled")),
             "dutySettings": u.get("quota") or {}, "term": t["id"], "duty": quota(u, t) if u["id"] in d["P"] else None,
             "written": sum(1 for r in d["reviews"] if r["person"] == u["id"] and t["start"] <= r["date"] <= t["end"])}
            for u in d["users"]]


@mcp.tool()
def admin_update_member(name: str, role: str = "", disabled: bool | None = None) -> dict:
    """[admin] Change a member's role ("member" / "admin") or disable / re-enable their account (disabled
    accounts can't sign in and drop out of progress). Not for yourself. Creating accounts and passwords stay in the site."""
    u, m = require_admin(), person(name)
    if m["id"] == u["id"]:
        raise ToolError("can't change your own role or account from here")
    if role and role not in ("member", "admin"):
        raise ToolError("role must be member or admin")
    if not role and disabled is None:
        raise ToolError("nothing to change")
    ops = []
    if role:
        ops.append(DB.apply({"op": "user.role", "actor": u["id"], "member": m["id"], "role": role, "summary": f"{m['name']} → {role}"}))
    if disabled is not None:
        ops.append(DB.apply({"op": "user.disable", "actor": u["id"], "member": m["id"], "disabled": bool(disabled),
                               "summary": f"{m['name']} {'disabled' if disabled else 'enabled'}"}))
    return _done(ops[-1], {"ops": [o["id"] for o in ops]})


@mcp.tool()
def admin_save_term(term_id: str, label: str, start: str, end: str, target: int | None = None) -> dict:
    """[admin] Create or update a term (e.g. 2027H1, "2027 상반기", 2027-01-01, 2027-06-30). Leave target out (null)
    for the usual rule — one diary per working day (weekdays minus the lab's days off); a number fixes the target."""
    u = require_admin()
    try:
        date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        raise ToolError("start and end must be YYYY-MM-DD")
    return _done(DB.apply({"op": "term.save", "actor": u["id"], "term": {"id": term_id, "label": label, "start": start, "end": end,
                                                                         "target": None if target is None else int(target)}, "summary": term_id}))


@mcp.tool()
def admin_list_off_days(year: str = "") -> dict:
    """[admin] Days without a diary duty besides weekends: public holidays (computed automatically, substitute days
    included) and the lab's own days off (shutdowns, conferences — kept by an admin)."""
    require_admin()
    d = DB.data()
    inyear = lambda s: not year or s[:4] == year
    return {"publicHolidays": [h for h in d.get("holidays") or [] if inyear(h["date"])],
            "labDaysOff": [o for o in sorted(d.get("offDays") or [], key=lambda o: o["start"]) if inyear(o["start"]) or inyear(o["end"])]}


@mcp.tool()
def admin_save_off_day(start: str, label: str, end: str = "", kind: str = "holiday", off_day_id: str = "") -> dict:
    """[admin] Add (or, with off_day_id, change) one of the lab's days off: start/end YYYY-MM-DD (end = start for one
    day), a name like "연구실 셧다운" or "교통학회", kind shutdown | event | holiday. Regular public holidays are automatic —
    use kind holiday only for ones the rules can't know (an election, a one-off 임시공휴일). Diary targets shrink by the
    weekdays it covers."""
    u = require_admin()
    end = end or start
    try:
        date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        raise ToolError("start and end must be YYYY-MM-DD")
    if date.fromisoformat(end) < date.fromisoformat(start):
        raise ToolError("end is before start")
    if kind not in ("holiday", "shutdown", "event"):
        raise ToolError("kind must be holiday, shutdown or event")
    return _done(DB.apply({"op": "offday.save", "actor": u["id"], "offDay": {"id": off_day_id or None, "start": start, "end": end, "label": label, "kind": kind},
                           "summary": f"{start}~{end} {label}"}))


@mcp.tool()
def admin_remove_off_day(off_day_id: str) -> dict:
    """[admin] Remove a day off (id from admin_list_off_days) — its weekdays count as writing days again."""
    u = require_admin()
    if not any(o["id"] == off_day_id for o in DB.data().get("offDays") or []):
        raise ToolError(f"no day off {off_day_id!r} — use admin_list_off_days")
    return _done(DB.apply({"op": "offday.remove", "actor": u["id"], "offDayId": off_day_id, "summary": off_day_id}))


# ------------------------------------------------------------------ curation (an admin's AI tidies what rules can't)
@mcp.tool()
def admin_list_clusters(level: str = "c", parent: str = "", samples: int = 8) -> list:
    """[admin] Regions of the paper map with their current name, the automatic name, keywords and sample paper titles —
    to judge whether a name fits. level "a" = the ≤ 8 areas (the axes of the people page; unnamed = named after their
    biggest topic), "c" = big topics (parent = an area), "f" = sub-topics (narrow with parent, e.g. "c3").
    Region ids change when the map is rebuilt; names set with admin_name_cluster follow their papers."""
    require_admin()
    d = DB.data()
    if level not in ("a", "c", "f"):
        raise ToolError('level must be "a", "c" or "f"')
    out = []
    for c in d.get("clusters") or []:
        if c["level"] != level or (parent and c.get("parent") != parent):
            continue
        mine = sorted((x for x in d["papers"] if x.get(level) == c["id"]), key=lambda x: (-len(x["reviews"]), -(x.get("rating") or 0)))
        out.append({"id": c["id"], "parent": c.get("parent"), "papers": len(mine), "name": {"ko": cluster_name(c), "en": cluster_name(c, "en")},
                    "namedByAdmin": bool(c.get("custom")), "automaticName": {"ko": c["ko"], "en": c["en"]},
                    "keywords": (c.get("custom") or {}).get("keywords") or c.get("keywords"), "automaticKeywords": c.get("keywords"),
                    "sampleTitles": [x["title"] for x in mine[:max(1, min(samples, 30))]]})
    return out


@mcp.tool()
def admin_name_cluster(cluster_id: str, label_ko: str, label_en: str = "", keywords: list[str] | None = None) -> dict:
    """[admin] Name a map region (id from admin_list_clusters), e.g. "전기차 충전 인프라" / "EV charging infrastructure".
    keywords: up to 5 short words shown in small print under a big region's name (first 3 on the map); leave out to
    keep the ones set before. Both labels empty = back to the automatic name and keywords. The name stays with the
    region's papers across map rebuilds."""
    u, d = require_admin(), DB.data()
    c = next((x for x in d.get("clusters") or [] if x["id"] == cluster_id), None)
    if not c:
        raise ToolError(f"no region {cluster_id!r} — use admin_list_clusters")
    if keywords is not None and (len(keywords) > 5 or any(len(k) > 40 for k in keywords)):
        raise ToolError("keywords: at most 5, each up to 40 characters")
    return _done(DB.apply({"op": "cluster.name", "actor": u["id"], "clusterId": cluster_id, "ko": label_ko.strip(), "en": label_en.strip(),
                           **({"keywords": keywords} if keywords is not None else {}),
                           "summary": f"{cluster_id} → {label_ko or label_en or '(auto)'}"}))


@mcp.tool()
def admin_set_paper_tags(paper_ref: str, tags: list[str]) -> dict:
    """[admin] Replace a paper's field/method tags (ids from list_tags, "d:…" and "m:…") when the keyword rules got
    it wrong. Fields are transport problems only — a general AI paper gets method tags and no field. Tags members put
    on their own reviews still add on top. Empty list = back to the automatic tags."""
    u, d = require_admin(), DB.data()
    p = paper(paper_ref)
    bad = [t for t in tags if t not in d["T"] or d["T"][t]["axis"] not in ("domain", "method")]
    if bad:
        raise ToolError(f"not field/method tags: {bad} — use list_tags")
    return _done(DB.apply({"op": "paper.tags", "actor": u["id"], "paperId": p["id"], "tags": tags,
                           "summary": f"{p['title'][:50]} → {', '.join(tags) or '(auto)'}"}), {"paper": brief(p)["title"]})


# ------------------------------------------------------------------ prompts (Claude Code shows them as /mcp__labsidian__… commands)
@mcp.prompt()
def diary_from_pdf(paper: str = "") -> str:
    """Draft this week's diary from a paper — a PDF path, a link, or (default) what I'm reading on my reading list."""
    return ("Help me write my Labsidian paper diary. " + (f"The paper: {paper}. " if paper else
            "Look at my_reading_list and take the paper I'm reading (else the one I finished most recently); ask me if unsure. ") +
            "Get the PDF (download_pdf for a reading-list PDF, or read the file / link I gave), read it, and check get_paper / "
            "search_papers for diaries lab members already wrote on it or close papers. Then show me a draft in my usual style: "
            "summary = Problem / Method / Result (/ Contribution), memo = a short critical take (data, assumptions, would it work "
            "for our problems), a 1–5 rating and tags from list_tags. After I say OK, call create_draft with the PDF attached "
            "(reading_item_id or pdf_path) and give me the link to check and publish it.")


@mcp.prompt()
def catch_up() -> str:
    """What happened in the lab since I last looked: questions to me, replies, studies, new diaries in my fields."""
    return ("Catch me up on Labsidian. Read my_inbox (unread first) and group it: questions waiting for my answer (quote them, "
            "with the paper), replies and mentions, study invites and reminders, my AI drafts waiting. Then list_studies for "
            "what's coming up and recommend_papers for 3 new papers in my fields. Offer to draft answers to the questions "
            "(add_comment with reply_to) — post nothing until I approve each one. Finally mark what you showed me as read "
            "(my_inbox mark_read).")


@mcp.prompt()
def prepare_study(study: str = "") -> str:
    """Get ready for a paper study: compare members' diaries, suggest questions for the board."""
    return ("Help me prepare for a Labsidian paper study" + (f" ({study})" if study else " — the next one I'm in, from list_studies") + ". "
            "Call get_study. If its diaries are hidden until I write mine, say so and offer to draft my diary first "
            "(diary_from_pdf). Otherwise compare the members' diaries: where they agree, where they disagree, what nobody "
            "covered. Show the question board and suggest 2–3 new questions plus which existing ones to 👍. Post questions "
            "(add_study_question) or votes (vote_study_question) only after I approve.")


@mcp.prompt()
def next_reading_group_session(guide: str = "") -> str:
    """Set up a reading group's next session: candidates, date, presenter."""
    return ("Help me set up the next session of a Labsidian reading group" + (f" ({guide})" if guide else " — find mine with list_guides") + ". "
            "Call get_guide: show the past sessions, whose turn it is, and the 3 best candidates (most 👍, not covered yet, "
            "who in the lab already read them). When I've picked, call open_study with guide_id (and guide_item_id) — "
            "the date, place, members and presenter are filled in — and give me the link.")


if __name__ == "__main__":
    mcp.run()
