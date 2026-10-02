"""Labsidian MCP server — lets each member's own Claude / Codex read the lab's paper diary and act for them.

Run (stdio):  .venv/Scripts/python mcp/labsidian_mcp.py
Identity:     LABSIDIAN_USER=<your name as on the site>   (mock: trusted as-is; the DB version uses a login token)
Server:       LABSIDIAN_URL=http://localhost:8765          the Labsidian server (scripts/serve.py) — real lab;
              http://localhost:8766 = the demo lab (serve.py --demo), which is where MCP changes get tested

The server owns the data (one SQLite file). This MCP server reads its snapshot and sends it one command per write;
the server applies the command right away with the site's own rules and answers ok or the reason it refused.
Nothing is published for you — reviews are created as *drafts* that the member checks and publishes.
Admin:        a second server entry with LABSIDIAN_USER=<an admin> (e.g. "admin") gets the admin_* tools —
              terms, diary duty, roles/accounts, tags. Passwords never go through MCP (temp passwords stay in the site).

Backend contract — what a hosted DB version has to provide (the tools only use these two):
  DB.data()       the snapshot shape: users, people, papers, reviews, topics, terms, comments, studies, …
  DB.apply(op)    one command {"op": <name>, "actor": <user id>, ...}; the backend applies it as that user and
                  enforces roles itself (here: POST /api/ops → site/store.js applyOp run headless; hosted: an RPC /
                  edge function that takes the actor from the login token instead of trusting "actor").
  ops: draft · comment · reading.add · study.question · study.notesDraft
       admin: tag.merge · tag.rename · tag.create · quota.set · term.save · user.role · user.disable
Every command and its result is kept in the server's ops table (GET /api/ops, or SELECT * FROM ops).
"""
import json
import math
import os
import re
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

mcp = FastMCP("labsidian", instructions=(
    "Labsidian is a transportation & AI lab's shared paper diary. Use the read tools to find papers, reviews, "
    "people and interests. To translate a review, fetch it with get_paper and translate the text yourself. "
    "Write tools never publish reviews: create_draft puts a draft in the member's page for them to check. "
    "Admin tools (tags, quotas, terms) only work if LABSIDIAN_USER is an admin. Answer in the user's language."))


# ------------------------------------------------------------------ data
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
                p["_hay"] = (p["title"] + " " + (p.get("authors") or "") + " " + (p.get("venueNorm") or "") + " " + (p.get("abstract") or "") + " " +
                             " ".join(d["R"][r]["content"] + " " + d["R"][r]["memo"] for r in p["reviews"] if r in d["R"] and not self._blind(d, d["R"][r]))).lower()
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
        op = {"id": "mcp_" + uuid.uuid4().hex[:12], "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **op}
        r = self.call("/api/ops", op)
        if not r.get("ok"):
            raise ToolError(f"Labsidian refused {op['op']}: {r.get('error')}")
        return op


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
    if hits:
        return hits[0]
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
    return c[lang]


def paper_tags(p):
    return [f"d:{x}" for x in p.get("domains", [])] + [f"m:{x}" for x in p.get("methods", [])] + list(p.get("free", []))


def brief(p):
    d = DB.data()
    return {"id": p["id"], "title": p["title"], "venue": p.get("venueNorm") or p.get("venue", ""), "year": p.get("year"),
            "rating": p.get("rating"), "readers": [d["P"].get(r, {}).get("name", r) for r in p.get("readers", [])],
            "tags": [tag_label(t) for t in paper_tags(p)], "open": f"{SITE}/#/paper/{p['id']}"}


def term_for(day=None):
    d, day = DB.data(), day or date.today().isoformat()
    return next((t for t in d["terms"] if t["start"] <= day <= t["end"]), d["terms"][-1])


def is_off(day, offs):
    return any(o["start"] <= day <= o["end"] for o in offs)


def workdays(a, b, offs=None):
    """weekdays from a to b (inclusive) that aren't one of the lab's days off — a diary is owed on each (store.js)"""
    offs = DB.data().get("offDays") or [] if offs is None else offs
    d, end, n = date.fromisoformat(a), date.fromisoformat(b), 0
    while d <= end:
        n += d.weekday() < 5 and not is_off(d.isoformat(), offs)
        d = date.fromordinal(d.toordinal() + 1)
    return n


def quota(u, term):
    q = u.get("quota") or {}
    if q.get("exempt"):
        return {"exempt": True, "target": 0}
    start = max(q.get("start") or term["start"], term["start"])
    if start > term["end"]:
        return {"exempt": True, "target": 0, "notYet": True}
    end = min(q.get("end") or term["end"], term["end"])  # graduated / left the lab
    if end < start:
        return {"exempt": True, "target": 0, "left": True}
    mine = workdays(start, end)
    auto = round(term["target"] * mine / (workdays(term["start"], term["end"]) or 1)) if term.get("target") else mine
    custom = (q.get("targets") or {}).get(term["id"])
    return {"exempt": False, "start": start, "end": end, "workdays": mine, "target": int(custom) if custom not in (None, "") else auto}


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
    """Search the lab's papers. query matches title/authors/venue/abstract/review text (all words must match).
    person_name: only papers this member reviewed. tag: tag id or label (e.g. "d:safety", "강화학습").
    term: e.g. "2026H1". Results are sorted by how many members read it, then rating."""
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
    out.sort(key=lambda p: (-len(p["readers"]), -(p.get("rating") or 0)))
    return [brief(p) for p in out[:max(1, min(limit, 50))]]


@mcp.tool()
def get_paper(paper_ref: str, include_comments: bool = True) -> dict:
    """Full detail of one paper (id or title): metadata, abstract, every member's review (summary + critique memo),
    and comment threads. Use this to compare opinions or to translate a review (translate the returned text yourself)."""
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
                "summary": r["content"], "memo": r["memo"], "tags": [tag_label(t) for t in r.get("tags", [])]}
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
    """A member's profile: interests (field/method counts), reading count, most similar members, recent reviews,
    and this term's diary progress."""
    d = DB.data()
    u = person(name)
    p = d["P"].get(u["id"], {})
    mine = sorted((r for r in d["reviews"] if r["person"] == u["id"]), key=lambda r: r["date"], reverse=True)
    term = term_for()
    n = sum(1 for r in mine if term["start"] <= r["date"] <= term["end"])
    q = quota(u, term)
    return {"name": u["name"], "role": u.get("role"), "reviews": len(mine), "avgRating": p.get("avgRating"),
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
def my_inbox(limit: int = 20) -> list:
    """My notifications (comments/questions on my reviews, mentions, replies, likes)."""
    d = DB.data()
    u = me()
    return [{"type": n["type"], "from": d["P"].get(n.get("actor"), {}).get("name", n.get("actor")), "at": n["at"], "read": n.get("read"),
             "paper": d["PA"].get(n.get("paperId"), {}).get("title"), "excerpt": n.get("excerpt")}
            for n in (d.get("notifications") or {}).get(u["id"], [])[:limit]]


# ------------------------------------------------------------------ write tools (applied by the server as the member)
def _done(op, extra=None):
    return {"applied": op["id"], "note": "Done — open pages pick it up within a few seconds.", **(extra or {})}


@mcp.tool()
def create_draft(title: str, summary: str, memo: str, rating: int, tags: list[str] | None = None, link: str = "",
                 venue: str = "", authors: str = "", year: str = "", abstract: str = "", diary_date: str = "") -> dict:
    """Create a diary DRAFT for me (never published automatically). summary = Problem/Method/Result/Contribution,
    memo = critique (required by lab rules). tags: ids from list_tags (or "f:keyword"). rating 1–5.
    diary_date = which week the entry counts for (YYYY-MM-DD, default today; past/future weeks are fine —
    the actual posting time is recorded separately when the member publishes).
    The member reviews it in the site's write form and publishes it themselves."""
    u = me()
    d = DB.data()
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
        "authors": authors, "year": year, "abstract": abstract, "date": diary_date or date.today().isoformat(), "source": "mcp"}})
    return _done(op, {"open": f"{SITE}/#/write?mcp={op['id']}"})


@mcp.tool()
def add_comment(review_id: str, body: str, kind: str = "comment", reply_to: str = "") -> dict:
    """Comment on a review as me. kind: comment | question | idea. Mention people with @name. reply_to: comment_id."""
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
def add_to_reading_list(paper_ref: str) -> dict:
    """Add a lab paper to my reading list."""
    u, p = me(), paper(paper_ref)
    return _done(DB.apply({"op": "reading.add", "actor": u["id"], "paperId": p["id"], "summary": p["title"][:60]}))



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
        out.append({"id": st["id"], "title": st["title"], "date": st.get("date") or None, "time": st.get("time") or None, "place": st.get("place") or None,
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
        "questions": [{"by": _name(q["author"]), "question": q["body"], "votes": len(q.get("votes", [])), "discussed": q.get("done", False)} for q in qs],
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
def draft_study_notes(study_id: str, conclusion: str, open_questions: str = "", follow_ups: str = "") -> dict:
    """Draft the study's shared notes for me (e.g. after comparing the reviews with get_study). It is NOT saved as the
    notes: I get a "load draft" button on the study page, check it, and save it myself. I must be a member of the study."""
    u = me()
    st = _study(study_id)
    if u["id"] not in st["members"] and u.get("role") != "admin":
        raise ToolError("only study members can draft its notes — join the study on the site first")
    return _done(DB.apply({"op": "study.notesDraft", "actor": u["id"], "studyId": st["id"], "conclusion": conclusion, "open": open_questions,
                               "next": follow_ups, "summary": st["title"][:60]}), {"open": f"{SITE}/#/study/{st['id']}"})

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
    """[admin] Rename a tag (Korean and/or English label) or change its colour (#rrggbb)."""
    if color and not _re_hex(color):
        raise ToolError("color must be a hex colour like #82aaff")
    u, d = require_admin(), DB.data()
    t = d["T"].get(tag_id)
    if not t:
        raise ToolError(f"unknown tag {tag_id}")
    return _done(DB.apply({"op": "tag.rename", "actor": u["id"], "tagId": tag_id, "label": label_ko or t["label"],
                               "labelEn": label_en or t.get("labelEn"), "color": color or None, "summary": tag_id}))


@mcp.tool()
def admin_create_tag(axis: str, label_ko: str, label_en: str, color: str = "#9da7b3") -> dict:
    """[admin] Create a new field (axis="domain") or method (axis="method") tag."""
    if not _re_hex(color):
        raise ToolError("color must be a hex colour like #82aaff")
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
            date.fromisoformat(val)
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
    date.fromisoformat(start), date.fromisoformat(end)
    return _done(DB.apply({"op": "term.save", "actor": u["id"], "term": {"id": term_id, "label": label, "start": start, "end": end,
                                                                         "target": None if target is None else int(target)}, "summary": term_id}))


@mcp.tool()
def admin_list_off_days(year: str = "") -> list:
    """[admin] The lab's days off — weekdays nobody writes a diary (public holidays, shutdowns, conferences). Weekends never count."""
    require_admin()
    return [o for o in sorted(DB.data().get("offDays") or [], key=lambda o: o["start"]) if not year or o["start"][:4] == year or o["end"][:4] == year]


@mcp.tool()
def admin_save_off_day(start: str, label: str, end: str = "", kind: str = "holiday", off_day_id: str = "") -> dict:
    """[admin] Add (or, with off_day_id, change) a day off: start/end YYYY-MM-DD (end = start for one day), a name like
    "추석" or "연구실 셧다운", kind holiday | shutdown | event. Diary targets shrink by the weekdays it covers."""
    u = require_admin()
    end = end or start
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
    to judge whether a name fits. level "c" = big topics, "f" = sub-topics (narrow with parent, e.g. "c3").
    Region ids change when the map is rebuilt; names set with admin_name_cluster follow their papers."""
    require_admin()
    d = DB.data()
    if level not in ("c", "f"):
        raise ToolError('level must be "c" or "f"')
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
    it wrong. Tags members put on their own reviews still add on top. Empty list = back to the automatic tags."""
    u, d = require_admin(), DB.data()
    p = paper(paper_ref)
    bad = [t for t in tags if t not in d["T"] or d["T"][t]["axis"] not in ("domain", "method")]
    if bad:
        raise ToolError(f"not field/method tags: {bad} — use list_tags")
    if tags and not any(t.startswith("d:") for t in tags):
        raise ToolError("give at least one field tag (d:…)")
    return _done(DB.apply({"op": "paper.tags", "actor": u["id"], "paperId": p["id"], "tags": tags,
                           "summary": f"{p['title'][:50]} → {', '.join(tags) or '(auto)'}"}), {"paper": brief(p)["title"]})


if __name__ == "__main__":
    mcp.run()
