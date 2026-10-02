"""Plan the fake demo diary: who reads which paper on which day.

    python scripts/demo_plan.py

Reads data/demo/personas.json + the real data (S2 cache, diary — paper metadata only) and writes
data/demo/_work/<id>.json per persona: dated slots, each either a reused real paper or NEW (a subagent
finds a fresh real paper for it), plus a few real reviews as style references. _work/ is private.
Reused papers are picked by title keywords (taxonomy domains), not by the real map's clusters, so the
demo lab's interest landscape doesn't mirror the real members'.
"""
import json
import random
import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from build_site import norm_title, compile_tax
from taxonomy import DOMAINS

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "data" / "demo"
WORK = DEMO / "_work"
END = date(2026, 6, 24)
NEW_SHARE = 0.75      # fraction of each persona's slots filled with freshly found papers
N_SHARED = 14         # reused papers read by 2+ personas
SEED = 7


def weekdays(start, end):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def main():
    rng = random.Random(SEED)
    personas = json.loads((DEMO / "personas.json").read_text(encoding="utf-8"))
    entries = json.loads((ROOT / "data" / "diary.json").read_text(encoding="utf-8"))
    c = json.loads((ROOT / "data" / "s2_cache.json").read_text(encoding="utf-8"))
    s2 = {k: c["detail"].get(v) for k, v in c["match"].items() if v}

    # real paper pool: public metadata only (title, authors, venue, link, abstract, year)
    pool = {}
    for e in entries:
        k = norm_title(e["title"])
        d = s2.get(re.sub(r"[^0-9a-z]+", "", k)) or {}  # same lookup as build_map
        abstract = d.get("abstract") or ""
        p = pool.setdefault(k, {"title": e["title"].strip(), "authors": "", "venue": "", "link": "",
                                "year": d.get("year"), "abstract": abstract})
        for f in ("authors", "venue"):
            p[f] = p[f] or e[f]
        if not p["link"] and e["link"].startswith("http"):
            p["link"] = e["link"]
    dom = compile_tax(DOMAINS)
    by_domain = defaultdict(list)
    for k, p in sorted(pool.items()):
        for d, (_, pats) in dom.items():
            if any(r.search(p["title"]) for r in pats):
                by_domain[d].append(k)
    print(f"pool: {len(pool)} real papers ({sum(bool(p['abstract']) for p in pool.values())} with abstracts)")

    # reused papers per persona (disjoint first)
    taken, picks = set(), {}
    for per in personas:
        n_reuse = per["count"] - round(per["count"] * NEW_SHARE)
        cand = [k for d in per["domains"] for k in by_domain[d]]
        rng.shuffle(cand)
        picks[per["id"]] = [k for k in dict.fromkeys(cand) if k not in taken][:n_reuse]
        taken.update(picks[per["id"]])

    # shared reads: hand some of A's papers to B when they share a domain, replacing one of B's picks
    pairs = [(a, b) for a in personas for b in personas if a is not b and set(a["domains"]) & set(b["domains"])]
    for a, b in rng.sample(pairs, min(N_SHARED, len(pairs))):
        common = set(a["domains"]) & set(b["domains"])
        options = [k for k in picks[a["id"]] if any(k in by_domain[d] for d in common) and k not in picks[b["id"]]]
        if options and picks[b["id"]]:
            picks[b["id"]][rng.randrange(len(picks[b["id"]]))] = rng.choice(options)

    real_by_lang = {"ko": [], "en": []}
    for e in entries:
        if len(e["content"]) > 300 and e["memo"]:
            real_by_lang["ko" if re.search("[가-힣]", e["content"]) else "en"].append(e)

    WORK.mkdir(parents=True, exist_ok=True)
    readers = defaultdict(list)
    for per in personas:
        days = list(weekdays(date.fromisoformat(per["start"]), END))
        dates = sorted(rng.sample(days, per["count"]))
        papers = [dict(pool[k]) for k in picks[per["id"]]]
        papers += [None] * (per["count"] - len(papers))
        rng.shuffle(papers)
        for k in picks[per["id"]]:
            readers[k].append(per["id"])
        lang = "en" if per["lang"] == "en" else "ko"
        mine = {norm_title(p["title"]) for p in papers if p}
        examples = [e for e in rng.sample(real_by_lang[lang], 12) if norm_title(e["title"]) not in mine][:4]
        out = {"persona": per,
               "slots": [{"date": d.isoformat(), "paper": p} for d, p in zip(dates, papers)],
               "style_examples": [{k: e[k] for k in ("title", "rating", "content", "memo")} for e in examples]}
        (WORK / f"{per['id']}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{per['id']}: {per['count']} slots, {sum(p is None for p in papers)} NEW")
    print(f"shared papers: {sum(len(v) > 1 for v in readers.values())}")


if __name__ == "__main__":
    main()
