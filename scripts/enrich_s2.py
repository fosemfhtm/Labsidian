"""Enrich papers with Semantic Scholar metadata (year, venue, abstract, citations, references).

Usage:
    python scripts/enrich_s2.py            # resumable; results cached in data/s2_cache.json
    S2_API_KEY=... python scripts/enrich_s2.py

Phase 0: an external id per paper, no key needed — DOI / arXiv id from the diary's link, a ScienceDirect PII → DOI,
         or a Crossref title search (accepted only when the titles match) → cached in "ext"
Phase 1: /paper/batch by those ids (500 per call) → paperId + details in a handful of requests
Phase 2: title -> paperId via /paper/search/match for the rest (one call per paper, cached)
Phase 3: /paper/batch for details still missing (500 ids per call)
Without a key S2's shared pool rate-limits hard, so phase 2 goes slowly and everything backs off on 429.
"""
import difflib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / os.environ.get("LABSIDIAN_DATA", "data")  # data/demo = the fake demo lab
CACHE = DATA / "s2_cache.json"
API = "https://api.semanticscholar.org/graph/v1"
KEY = os.environ.get("S2_API_KEY")
DETAIL_FIELDS = "title,year,venue,publicationVenue,abstract,citationCount,externalIds,references.paperId,tldr"


def req(url, body=None, tries=6):  # Semantic Scholar
    headers = {"User-Agent": "labsidian/0.1"}
    if KEY:
        headers["x-api-key"] = KEY
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    wait = 3
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(wait)
                wait = min(wait * 2, 60)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(wait)
            wait = min(wait * 2, 60)
    return "retry"


def norm(t):
    t = t.lower().replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬃ", "ffi")
    return re.sub(r"[^0-9a-z]+", "", t)


def same_title(a, b, cut=0.9):
    a, b = norm(a), norm(b)
    return bool(a and b) and (a == b or difflib.SequenceMatcher(None, a, b).ratio() >= cut)


def crossref(url, tries=6):
    """Crossref's public pool (no key, nothing identifying sent); slow down and back off on 429"""
    wait = 5
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "labsidian/0.1"}), timeout=40) as r:
                return json.load(r)["message"]
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(wait)
        wait = min(wait * 2, 120)
    return "retry"


def ext_id(title, link):
    """'DOI:…' / 'ARXIV:…' for a diary entry, '' if none found, 'retry' if Crossref is rate-limiting"""
    m = re.search(r"arxiv\.org/(?:abs|pdf|html)/(\d{4}\.\d{4,5})", link or "")
    if m:
        return "ARXIV:" + m.group(1)
    m = re.search(r"10\.\d{4,9}/[^\s\"<>?#]+", link or "")
    if m and "arxiv" not in m.group(0).lower():
        return "DOI:" + m.group(0).rstrip(".,;)").removesuffix("/full").removesuffix("/abstract")
    m = re.search(r"pii/(S?[0-9X]{15,17})", link or "", re.I)
    if m:
        r = crossref(f"https://api.crossref.org/works?filter=alternative-id:{m.group(1)}&rows=1&select=DOI,title")
        if r == "retry":
            return r
        if r and r["items"]:
            return "DOI:" + r["items"][0]["DOI"]
    q = urllib.parse.urlencode({"query.bibliographic": title[:250], "rows": 2, "select": "DOI,title"})
    r = crossref(f"https://api.crossref.org/works?{q}")
    if r == "retry":
        return r
    hit = next((x for x in (r or {}).get("items", []) if same_title(title, (x.get("title") or [""])[0])), None)
    return "DOI:" + hit["DOI"] if hit else ""


def main():
    entries = json.loads((DATA / "diary.json").read_text(encoding="utf-8"))
    titles = sorted({e["title"].strip() for e in entries})
    links = {}
    for e in entries:
        links[e["title"].strip()] = links.get(e["title"].strip()) or (e.get("link") or "").strip()
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {"match": {}, "detail": {}}
    cache.setdefault("ext", {})
    save = lambda: CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    english = lambda t: re.search(r"[A-Za-z]{4}", t)

    todo = [t for t in titles if not cache["match"].get(norm(t)) and norm(t) not in cache["ext"] and english(t)]
    print(f"phase 0: {len(todo)} titles to find a DOI / arXiv id for (Crossref)", file=sys.stderr)
    for i, t in enumerate(todo):
        x = ext_id(t, links.get(t))
        if x == "retry":
            print("  Crossref is rate-limiting; rerun later", file=sys.stderr)
            break
        cache["ext"][norm(t)] = x
        if i % 50 == 0:
            save()
            print(f"  {i}/{len(todo)}", file=sys.stderr)
        time.sleep(0.7)
    save()

    want = {cache["ext"][norm(t)]: t for t in titles if not cache["match"].get(norm(t)) and cache["ext"].get(norm(t))}
    print(f"phase 1: {len(want)} papers by id (S2 batch)", file=sys.stderr)
    ids = list(want)
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        r = req(f"{API}/paper/batch?fields=paperId,{DETAIL_FIELDS}", body={"ids": chunk}, tries=12)
        if r in (None, "retry"):
            print("  batch failed (rate limit); rerun later", file=sys.stderr)
            break
        for x, d in zip(chunk, r):
            if d and same_title(want[x], d.get("title") or "", 0.8):  # a diary link can point at another paper
                d["references"] = [y["paperId"] for y in d.get("references") or [] if y.get("paperId")]
                cache["match"][norm(want[x])] = d["paperId"]
                cache["detail"][d["paperId"]] = d
        save()
        time.sleep(3)

    todo = [t for t in titles if norm(t) not in cache["match"] and english(t)]
    print(f"phase 2: {len(todo)} titles to match ({len(titles)} total)", file=sys.stderr)
    for i, t in enumerate(todo):
        r = req(f"{API}/paper/search/match?query={urllib.parse.quote(t[:300])}&fields=title")
        if r == "retry":
            print("  giving up for now (rate limit); rerun later", file=sys.stderr)
            break
        hit = (r or {}).get("data", [None])[0] if r else None
        ok = bool(hit) and (norm(hit["title"])[:40] == norm(t)[:40] or norm(t)[:40] in norm(hit["title"]))
        cache["match"][norm(t)] = hit["paperId"] if ok else None
        if i % 20 == 0:
            save()
            print(f"  {i}/{len(todo)}", file=sys.stderr)
        time.sleep(0.4 if KEY else 1.6)
    save()

    ids = [v for v in cache["match"].values() if v and v not in cache["detail"]]
    print(f"phase 3: {len(ids)} ids to fetch", file=sys.stderr)
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        r = req(f"{API}/paper/batch?fields={DETAIL_FIELDS}", body={"ids": chunk})
        if r in (None, "retry"):
            print("  batch failed; rerun later", file=sys.stderr)
            break
        for pid, d in zip(chunk, r):
            if d:
                d["references"] = [x["paperId"] for x in d.get("references") or [] if x.get("paperId")]
                cache["detail"][pid] = d
        save()
        time.sleep(2)
    matched = sum(1 for v in cache["match"].values() if v)
    print(f"done: matched {matched}/{len(cache['match'])}, details {len(cache['detail'])}", file=sys.stderr)


if __name__ == "__main__":
    main()
