"""Merge the subagent-written parts into the demo dataset and check it doesn't leak the real diary.

    python scripts/demo_build.py

data/demo/parts/<id>.json  →  data/demo/diary.json + roster.json + s2_cache.json (real cache, reused papers only)
Then:  LABSIDIAN_DATA=data/demo  enrich_s2.py → build_map.py → build_site.py   (→ site/data.demo.js)

Leak check (fails with exit 1): real member names anywhere, or any 8-word run copied from a real review.
"""
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_site import norm_title, compile_tax, score, pick, cosine  # noqa: E402
from taxonomy import DOMAINS, METHODS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "data" / "demo"
FIELDS = ("date", "dateNote", "author", "title", "link", "venue", "authors", "year", "abstract",
          "rating", "content", "memo", "term")
NGRAM = 8
MIRROR = 0.7  # a demo member whose topic profile is this close to a real member's is too recognizable


def profiles(entries):
    """author -> topic Counter, tagged the same way build_site.py tags papers (title + review text)."""
    dom, met = compile_tax(DOMAINS), compile_tax(METHODS)
    out = {}
    for e in entries:
        body = (e["content"] or "") + " " + (e["memo"] or "")
        v = out.setdefault(e["author"], Counter())
        for t in pick(score(dom, e["title"], body), 3, 3) if score(dom, e["title"], body) else []:
            v[f"d:{t}"] += 1
        for t in pick(score(met, e["title"], body), 2, 3) if score(met, e["title"], body) else []:
            v[f"m:{t}"] += 1
    return out


def grams(text, n=NGRAM):
    w = re.findall(r"\w+", (text or "").lower())
    return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}


def main():
    personas = json.loads((DEMO / "personas.json").read_text(encoding="utf-8"))
    real = json.loads((ROOT / "data" / "diary.json").read_text(encoding="utf-8"))
    real_roster = json.loads((ROOT / "data" / "roster.json").read_text(encoding="utf-8"))
    problems = []
    rng = random.Random(0)

    entries = []
    for per in personas:
        part = DEMO / "parts" / f"{per['id']}.json"
        plan = json.loads((DEMO / "_work" / f"{per['id']}.json").read_text(encoding="utf-8"))
        if not part.exists():
            problems.append(f"{per['id']}: missing part")
            continue
        got = json.loads(part.read_text(encoding="utf-8"))
        if sorted(e["date"] for e in got) != sorted(s["date"] for s in plan["slots"]):
            problems.append(f"{per['id']}: dates differ from plan ({len(got)} entries / {len(plan['slots'])} slots)")
        for e in got:
            miss = [f for f in FIELDS if f not in e]
            if miss:
                problems.append(f"{per['id']} {e.get('date')}: missing {miss}")
            if e.get("author") != per["name"]:
                problems.append(f"{per['id']} {e.get('date')}: author {e.get('author')!r}")
            if not isinstance(e.get("rating"), int) or not 0 <= e["rating"] <= 5:
                problems.append(f"{per['id']} {e.get('date')}: rating {e.get('rating')!r}")
            entries.append({f: e.get(f) for f in FIELDS} | {"dateNote": None, "term": "2026H1",
                                                              "memo": e.get("memo") or "", "link": e.get("link") or "",
                                                              "venue": e.get("venue") or "", "authors": e.get("authors") or ""})
    # A 2026 paper can't be read before it came out; for reused ones the lab's real first read is the proxy.
    # Reshuffle each member's own dates so those constraints hold, keeping everyone else near their slot.
    first_read = {}
    for r in real:
        k = norm_title(r["title"])
        first_read[k] = min(first_read.get(k, r["date"]), r["date"])
    not_before = lambda e: first_read.get(norm_title(e["title"]), "") if (e["year"] or 0) >= 2026 else ""
    for per in personas:
        mine = [e for e in entries if e["author"] == per["name"]]
        free = sorted(e["date"] for e in mine)
        bound = sorted((e for e in mine if not_before(e)), key=not_before, reverse=True)
        for e in bound:  # most constrained first: a random free date after its bound, else the latest left
            ok = [d for d in free if d >= not_before(e)]
            e["date"] = rng.choice(ok) if ok else free[-1]
            free.remove(e["date"])
        for e, d in zip(sorted((e for e in mine if not not_before(e)), key=lambda e: e["date"]), free):
            e["date"] = d
        late = [e["title"][:40] for e in mine if e["date"] < not_before(e)]
        if late:
            print(f"  ~ {per['id']}: {len(late)} papers read before the lab's real first read (too few late dates)")
    entries.sort(key=lambda e: (e["date"], e["author"]))

    # ---- leak check ----
    names = [p["name"] for p in real_roster]
    real_grams = set()
    for r in real:
        real_grams |= grams(r["content"]) | grams(r["memo"])
    real_titles = {norm_title(r["title"]) for r in real}
    leaks = []
    for e in entries:
        text = " ".join(str(e[f] or "") for f in ("content", "memo", "author"))
        for n in names:
            if n in text:
                leaks.append(f"{e['author']} {e['date']}: real name {n}")
        # runs quoted from the paper's own abstract are fine (real reviewers quote it too)
        hit = (grams(e["content"]) | grams(e["memo"])) & real_grams - grams(e["abstract"])
        if hit:
            leaks.append(f"{e['author']} {e['date']}: copied run “{next(iter(hit))}” (+{len(hit) - 1})")

    keys = Counter(norm_title(e["title"]) for e in entries)
    reused = sum(1 for k in keys if k in real_titles)
    print(f"{len(entries)} entries, {len(keys)} papers ({reused} reused, {len(keys) - reused} new), "
          f"{sum(v > 1 for v in keys.values())} read by 2+")
    print("ratings", dict(sorted(Counter(e["rating"] for e in entries).items())),
          "| korean", sum(bool(re.search("[가-힣]", e["content"])) for e in entries),
          "| empty memo", sum(not e["memo"] for e in entries))
    social_p = DEMO / "social.json"  # example studies / comments: same name + copy check on every text field
    if social_p.exists():
        def texts(x):
            if isinstance(x, str):
                yield x
            elif isinstance(x, dict):
                for v in x.values():
                    yield from texts(v)
            elif isinstance(x, list):
                for v in x:
                    yield from texts(v)
        for t in texts(json.loads(social_p.read_text(encoding="utf-8"))):
            leaks += [f"social.json: real name {n}" for n in names if n in t]
            if grams(t) & real_grams:
                leaks.append(f"social.json: copied run “{next(iter(grams(t) & real_grams))}”")
    # the demo film's sources (recording script, terminal scene, overlays) must not carry a real name or review either
    for src in [*(ROOT / "video").glob("*.py"), *(ROOT / "video").glob("*.html"), *(ROOT / "video" / "remotion" / "src").glob("*")]:
        txt = src.read_text(encoding="utf-8", errors="ignore")
        leaks += [f"video/{src.name}: real name {n}" for n in names if n in txt]
        if grams(txt) & real_grams:
            leaks.append(f"video/{src.name}: copied run “{next(iter(grams(txt) & real_grams))}”")
    real_prof, demo_prof = profiles(real), profiles(entries)
    print("closest real member (topic cosine):")
    for name, v in demo_prof.items():
        sim = max(cosine(v, r) for r in real_prof.values())
        print(f"  {name:<14} {sim:.2f}{'  ← too close' if sim >= MIRROR else ''}")
        if sim >= MIRROR:
            leaks.append(f"{name}: topic profile mirrors a real member ({sim:.2f})")
    for p in problems:
        print("  ! " + p)
    for l in leaks:
        print("  LEAK " + l)

    DEMO.joinpath("diary.json").write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8")
    DEMO.joinpath("roster.json").write_text(json.dumps([{"id": p["id"], "name": p["name"]} for p in personas],
                                                       ensure_ascii=False), encoding="utf-8")
    # S2 metadata for the reused (public) papers; new ones get matched by enrich_s2.py
    c = json.loads((ROOT / "data" / "s2_cache.json").read_text(encoding="utf-8"))
    mk = {re.sub(r"[^0-9a-z]+", "", k) for k in keys}
    cache_p = DEMO / "s2_cache.json"  # keep what enrich_s2.py already fetched for the demo
    demo_c = json.loads(cache_p.read_text(encoding="utf-8")) if cache_p.exists() else {"match": {}, "detail": {}}
    match = {k: v for k, v in c["match"].items() if k in mk}
    demo_c["match"].update(match)
    demo_c["detail"].update({v: c["detail"][v] for v in match.values() if v and v in c["detail"]})
    cache_p.write_text(json.dumps(demo_c, ensure_ascii=False), encoding="utf-8")
    print(f"wrote data/demo/diary.json, roster.json, s2_cache.json ({len(demo_c['detail'])} S2 records)")
    sys.exit(1 if leaks or problems else 0)


if __name__ == "__main__":
    main()
