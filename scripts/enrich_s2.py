"""Enrich papers with Semantic Scholar metadata (year, venue, abstract, citations, references).

Usage:
    python scripts/enrich_s2.py            # resumable; results cached in data/s2_cache.json
    S2_API_KEY=... python scripts/enrich_s2.py

Phase 1: title -> paperId via /paper/search/match (one call per paper, cached)
Phase 2: /paper/batch for details (500 ids per call)
Without a key the shared pool rate-limits hard, so we go slowly and back off on 429.
"""
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


def req(url, body=None, tries=6):
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


def main():
    entries = json.loads((DATA / "diary.json").read_text(encoding="utf-8"))
    titles = sorted({e["title"].strip() for e in entries})
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {"match": {}, "detail": {}}
    save = lambda: CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    todo = [t for t in titles if norm(t) not in cache["match"] and re.search(r"[A-Za-z]{4}", t)]
    print(f"phase 1: {len(todo)} titles to match ({len(titles)} total)", file=sys.stderr)
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
    print(f"phase 2: {len(ids)} ids to fetch", file=sys.stderr)
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
