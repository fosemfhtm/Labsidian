"""Labsidian MCP server — lets each member's own Claude / Codex read the lab's paper diary and act for them.

Run (stdio):  .venv/Scripts/python mcp/labsidian_mcp.py
Identity:     LABSIDIAN_USER=<your name as on the site>   (mock: trusted as-is; the DB version uses a login token)
Site URL:     LABSIDIAN_URL=http://localhost:8765          (used for "open this" links)

Data source (until the DB exists)
  read : data/live_snapshot.json — pushed by the open site via scripts/serve.py (everything, incl. comments)
         falls back to site/data.js (the imported diary only) if no snapshot yet
  write: ops are appended to data/mcp_outbox.json; the open site applies them within a few seconds
         (drafts land in the member's "my page", comments/merges show up live). Nothing is published for you —
         reviews are created as *drafts* that the member checks and publishes.
With Supabase this file swaps LocalBackend for a DB backend; the tool surface stays the same.
"""
import json
import math
import os
import re
import tempfile
import time
import uuid
from collections import Counter
from datetime import date
from pathlib import Path

try:  # mcp >= 2 renamed FastMCP → MCPServer
    from mcp.server.mcpserver import MCPServer as FastMCP
    from mcp.server.mcpserver.exceptions import ToolError
except ImportError:
    from mcp.server.fastmcp import FastMCP
    from mcp.server.fastmcp.exceptions import ToolError

ROOT = Path(__file__).resolve().parent.parent
# data/demo = the fake demo lab (serve.py --demo); also the default on a fresh clone, which has no real lab data
DATA = ROOT / os.environ.get("LABSIDIAN_DATA", "data" if (ROOT / "data" / "diary.json").exists() else "data/demo")
IMPORT = ROOT / "site" / ("data.js" if DATA.resolve() == (ROOT / "data").resolve() else f"data.{DATA.name}.js")
SNAPSHOT, OUTBOX = DATA / "live_snapshot.json", DATA / "mcp_outbox.json"
SITE = os.environ.get("LABSIDIAN_URL", "http://localhost:8765").rstrip("/")
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


class LocalBackend:
    def __init__(self):
        self._mtime, self.d = None, None

    def data(self):
        src = SNAPSHOT if SNAPSHOT.exists() else IMPORT
        m = (src, src.stat().st_mtime)
        if m != self._mtime:
            self._mtime = m
            if src == SNAPSHOT:
                self.d = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
                self.d["live"] = True
            else:
                raw = IMPORT.read_text(encoding="utf-8")
                d = json.loads(raw[raw.index("=") + 1:].strip().rstrip(";"))
                d["users"] = [{"id": p["id"], "name": p["name"], "role": "member", "quota": {}} for p in d["people"]]
                d.update(comments=[], reactions={}, reading={}, notifications={}, tagOps=[], mcpApplied=[], live=False,
                         terms=[{"id": "2026H1", "label": "2026 상반기", "start": "2026-01-01", "end": "2026-06-30", "target": 110},
                                {"id": "2026H2", "label": "2026 하반기", "start": "2026-07-01", "end": "2026-12-31", "target": 110}])
                self.d = d
            d = self.d
            d["P"] = {p["id"]: p for p in d["people"]}
            d["PA"] = {p["id"]: p for p in d["papers"]}
            d["R"] = {r["id"]: r for r in d["reviews"]}
            d["T"] = {t["id"]: t for t in d["topics"]}
            d["U"] = {u["id"]: u for u in d["users"]}
            for p in d["papers"]:
                p["_key"] = norm_title(p["title"])
                p["_hay"] = (p["title"] + " " + p.get("authors", "") + " " + p.get("venueNorm", "") + " " + p.get("abstract", "") + " " +
                             " ".join(d["R"][r]["content"] + " " + d["R"][r]["memo"] for r in p["reviews"] if r in d["R"] and not self._blind(d, d["R"][r]))).lower()
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

    def enqueue(self, op):
        op = {"id": "mcp_" + uuid.uuid4().hex[:12], "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **op}
        done = set(self.data().get("mcpApplied") or [])
        ops = json.loads(OUTBOX.read_text(encoding="utf-8")) if OUTBOX.exists() else []
        ops = [o for o in ops if o.get("id") not in done] + [op]   # prune what the site already applied
        OUTBOX.parent.mkdir(exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=OUTBOX.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(ops, f, ensure_ascii=False, indent=1)
        os.replace(tmp, OUTBOX)
        return op


DB = LocalBackend()


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


def quota(u, term):
    q = u.get("quota") or {}
    if q.get("exempt"):
        return {"exempt": True, "target": 0}
    start = max(q.get("start") or term["start"], term["start"])
    if start > term["end"]:
        return {"exempt": True, "target": 0, "notYet": True}
    span = lambda a, b: (date.fromisoformat(b) - date.fromisoformat(a)).days + 1
    auto = round(term.get("target", 0) * span(start, term["end"]) / span(term["start"], term["end"]))
    custom = (q.get("targets") or {}).get(term["id"])
    return {"exempt": False, "start": start, "target": int(custom) if custom not in (None, "") else auto}


# ------------------------------------------------------------------ read tools
@mcp.tool()
def whoami() -> dict:
    """Who this MCP server acts as, and whether the data is live (from the open site) or the imported diary only."""
    d = DB.data()
    u = person(ME) if ME else None
    return {"user": u and {"id": u["id"], "name": u["name"], "role": u.get("role")}, "liveData": d.get("live", False),
            "papers": len(d["papers"]), "reviews": len(d["reviews"]), "site": SITE}


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
            "cluster": (next((c for c in d.get("clusters", []) if c["id"] == p.get("c")), {}) or {}).get("ko"),
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


# ------------------------------------------------------------------ write tools (queued → applied by the open site)
def _queued(op, extra=None):
    return {"queued": op["id"], "note": "The open Labsidian site applies this within a few seconds." +
            ("" if DB.data().get("live") else " (No live snapshot yet — open the site via scripts/serve.py.)"), **(extra or {})}


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
    op = DB.enqueue({"op": "draft", "actor": u["id"], "summary": title[:60], "data": {
        "title": title, "content": summary, "memo": memo, "rating": int(rating), "tags": tags or [], "link": link, "venue": venue,
        "authors": authors, "year": year, "abstract": abstract, "date": diary_date or date.today().isoformat(), "source": "mcp"}})
    return _queued(op, {"open": f"{SITE}/#/write?mcp={op['id']}"})


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
    op = DB.enqueue({"op": "comment", "actor": u["id"], "reviewId": review_id, "kind": kind, "body": body, "parent": reply_to or None, "summary": body[:60]})
    return _queued(op, {"open": f"{SITE}/#/paper/{d['R'][review_id]['paper']}"})


@mcp.tool()
def add_to_reading_list(paper_ref: str) -> dict:
    """Add a lab paper to my reading list."""
    u, p = me(), paper(paper_ref)
    return _queued(DB.enqueue({"op": "reading.add", "actor": u["id"], "paperId": p["id"], "summary": p["title"][:60]}))



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
    return _queued(DB.enqueue({"op": "study.question", "actor": u["id"], "studyId": st["id"], "body": question.strip()[:1000], "summary": question[:60]}),
                   {"open": f"{SITE}/#/study/{st['id']}"})


@mcp.tool()
def draft_study_notes(study_id: str, conclusion: str, open_questions: str = "", follow_ups: str = "") -> dict:
    """Draft the study's shared notes for me (e.g. after comparing the reviews with get_study). It is NOT saved as the
    notes: I get a "load draft" button on the study page, check it, and save it myself. I must be a member of the study."""
    u = me()
    st = _study(study_id)
    if u["id"] not in st["members"] and u.get("role") != "admin":
        raise ToolError("only study members can draft its notes — join the study on the site first")
    return _queued(DB.enqueue({"op": "study.notesDraft", "actor": u["id"], "studyId": st["id"], "conclusion": conclusion, "open": open_questions,
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
    return _queued(DB.enqueue({"op": "tag.merge", "actor": u["id"], "from": from_tag, "into": into_tag, "summary": f"{from_tag} → {into_tag}"}))


@mcp.tool()
def admin_rename_tag(tag_id: str, label_ko: str = "", label_en: str = "", color: str = "") -> dict:
    """[admin] Rename a tag (Korean and/or English label) or change its colour (#rrggbb)."""
    if color and not _re_hex(color):
        raise ToolError("color must be a hex colour like #82aaff")
    u, d = require_admin(), DB.data()
    t = d["T"].get(tag_id)
    if not t:
        raise ToolError(f"unknown tag {tag_id}")
    return _queued(DB.enqueue({"op": "tag.rename", "actor": u["id"], "tagId": tag_id, "label": label_ko or t["label"],
                               "labelEn": label_en or t.get("labelEn"), "color": color or None, "summary": tag_id}))


@mcp.tool()
def admin_create_tag(axis: str, label_ko: str, label_en: str, color: str = "#9da7b3") -> dict:
    """[admin] Create a new field (axis="domain") or method (axis="method") tag."""
    if not _re_hex(color):
        raise ToolError("color must be a hex colour like #82aaff")
    u = require_admin()
    if axis not in ("domain", "method"):
        raise ToolError("axis must be domain or method")
    return _queued(DB.enqueue({"op": "tag.create", "actor": u["id"], "axis": axis, "label": label_ko, "labelEn": label_en, "color": color, "summary": label_ko}))


@mcp.tool()
def admin_set_member_quota(name: str, exempt: bool | None = None, start_date: str = "", target: int | None = None, term: str = "") -> dict:
    """[admin] Set a member's diary duty: exempt (e.g. postdocs), start_date (e.g. a new student starting in
    September, YYYY-MM-DD; target is prorated from it), or a fixed target for one term (term id, default current)."""
    u, m = require_admin(), person(name)
    q = {}
    if exempt is not None:
        q["exempt"] = bool(exempt)
    if start_date:
        date.fromisoformat(start_date)
        q["start"] = start_date
    if target is not None:
        q["targets"] = {(term or term_for()["id"]): int(target)}
    if not q:
        raise ToolError("nothing to change")
    return _queued(DB.enqueue({"op": "quota.set", "actor": u["id"], "member": m["id"], "quota": q, "summary": f"{m['name']} {q}"}))


@mcp.tool()
def admin_save_term(term_id: str, label: str, start: str, end: str, target: int) -> dict:
    """[admin] Create or update a term (e.g. 2027H1, "2027 상반기", 2027-01-01, 2027-06-30, 110 diaries)."""
    u = require_admin()
    date.fromisoformat(start), date.fromisoformat(end)
    return _queued(DB.enqueue({"op": "term.save", "actor": u["id"], "term": {"id": term_id, "label": label, "start": start, "end": end, "target": int(target)}, "summary": term_id}))


if __name__ == "__main__":
    mcp.run()
