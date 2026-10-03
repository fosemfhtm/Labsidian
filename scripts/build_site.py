"""data/diary.json -> site/data.js (+ optional Obsidian vault)

Usage:
    python scripts/build_site.py            # site only
    python scripts/build_site.py --vault    # also write vault/ for Obsidian
"""
import argparse
import json
import math
import os
import re
import shutil
from collections import Counter, defaultdict
from pathlib import Path

from taxonomy import DOMAINS, METHODS, EN

ROOT = Path(__file__).resolve().parent.parent
# LABSIDIAN_DATA=data/demo builds the fake demo lab instead → site/data.demo.js (own browser storage)
DATA = ROOT / os.environ.get("LABSIDIAN_DATA", "data")
DATASET = "" if DATA.resolve() == (ROOT / "data").resolve() else DATA.name

PERSON_COLORS = ["#f78c6c", "#82aaff", "#c3e88d", "#c792ea", "#ffcb6b",
                 "#89ddff", "#ff5370", "#f07178", "#b2ccd6", "#addb67",
                 "#7fdbca", "#e2b93d"]
# Data colours are system colour *names* (docs/design/data-viz.md §2): the site turns them into rgb(var(--name)),
# so they follow light / dark / increased contrast. 12 colours, repeated when there are more tags.
TOPIC_COLORS = ["red", "orange", "purple", "blue", "green", "yellow", "pink", "cyan", "teal", "brown", "indigo", "mint"]
METHOD_COLORS = ["purple", "orange", "mint", "blue", "red", "teal", "yellow", "indigo", "green", "pink", "brown", "cyan"]
CLUSTER_COLORS = ["blue", "red", "green", "yellow", "purple", "cyan", "orange", "teal", "indigo", "pink", "mint", "brown"]

# Venue aliases: regex on the lower-cased raw string -> canonical short name
VENUE_RULES = [
    (r"transportation research part ([a-f])\b|transp\.? res\.? part ([a-f])\b|\btr[- ]?([a-f])\b", lambda m: f"Transportation Research Part {(m.group(1) or m.group(2) or m.group(3)).upper()}"),
    (r"intelligent transportation systems", "IEEE T-ITS"),
    (r"intelligent vehicles", "IEEE T-IV"),
    (r"accident analysis", "Accident Analysis & Prevention"),
    (r"transportation research record", "Transportation Research Record"),
    (r"\barxiv\b", "arXiv"),
    (r"applied energy", "Applied Energy"),
    (r"neurips|neural information processing", "NeurIPS"),
    (r"\bcvpr\b|computer vision and pattern", "CVPR"),
    (r"\biccv\b", "ICCV"), (r"\beccv\b", "ECCV"), (r"\biclr\b", "ICLR"), (r"\bicml\b", "ICML"),
    (r"\baaai\b", "AAAI"), (r"\bkdd\b|knowledge discovery", "KDD"),
    (r"\bitsc\b|intelligent transportation systems conference", "IEEE ITSC"),
    (r"nature communications?", "Nature Communications"), (r"\becva\b", "ECCV"),
    (r"journal of safety research", "Journal of Safety Research"),
    (r"safety science", "Safety Science"),
    (r"transportation science", "Transportation Science"),
    (r"communications in transportation research", "Communications in Transportation Research"),
]
CONF_HINTS = re.compile(r"conference|proceedings|symposium|workshop|neurips|cvpr|iccv|eccv|iclr|icml|aaai|kdd|itsc", re.I)


def norm_venue(raw, pub_venue=None):
    s = re.sub(r"\s+", " ", (raw or "").replace("&amp;", "&")).strip(" ,.")
    low = s.lower()
    name = None
    for pat, rep in VENUE_RULES:
        m = re.search(pat, low)
        if m:
            name = rep(m) if callable(rep) else rep
            break
    if not name:
        name = re.sub(r"[,(]?\s*(19|20)\d{2}\)?$", "", s).strip(" ,.") or ((pub_venue or {}).get("name") or "")
    kind = (pub_venue or {}).get("type")
    if name == "arXiv":
        kind = "preprint"
    elif not kind:
        kind = "conference" if CONF_HINTS.search(s) else ("journal" if name else "")
    return name, kind


def year_from(s):
    m = re.search(r"\b(19[5-9]\d|20[0-3]\d)\b", s or "")
    return int(m.group(1)) if m else None


def norm_title(t):
    t = t.lower().replace("ﬁ", "fi").replace("ﬂ", "fl")
    return re.sub(r"[^0-9a-z가-힣]+", "", t)


def compile_tax(tax):
    return {k: (label, [re.compile(p, re.I) for p in pats]) for k, (label, pats) in tax.items()}


def score(tax, title, body):
    out = {}
    for k, (_, pats) in tax.items():
        s = sum(3 for p in pats if p.search(title)) + min(4, sum(1 for p in pats if p.search(body)))
        if s:
            out[k] = s
    return out


def pick(scores, k, min_score):
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    keep = [t for t, s in ranked if s >= min_score][:k]
    return keep or [t for t, _ in ranked[:1]]


def cosine(a, b):
    keys = set(a) | set(b)
    dot = sum(a.get(k, 0) * b.get(k, 0) for k in keys)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def slug(s, n=60):
    s = re.sub(r'[\\/:*?"<>|#^\[\]]', "", s).strip()
    return s[:n].rstrip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", action="store_true")
    a = ap.parse_args()

    roster = json.loads((DATA / "roster.json").read_text(encoding="utf-8"))
    entries = json.loads((DATA / "diary.json").read_text(encoding="utf-8"))
    name2id = {p["name"]: p["id"] for p in roster}
    dom, met = compile_tax(DOMAINS), compile_tax(METHODS)

    # ---- papers (merge reviews of the same title) ----
    papers, by_key = [], {}
    reviews = []
    for i, e in enumerate(entries):
        key = norm_title(e["title"])
        if key not in by_key:
            by_key[key] = len(papers)
            papers.append({"id": f"p{len(papers)}", "title": e["title"].strip(), "venue": "", "link": "",
                           "authors": "", "reviews": [], "_abstract": "", "_year": None})
        p = papers[by_key[key]]
        for f_src, f_dst in (("venue", "venue"), ("link", "link"), ("authors", "authors")):
            if not p[f_dst] and e[f_src].strip():
                p[f_dst] = e[f_src].strip()
        p["_abstract"] = p["_abstract"] or e.get("abstract") or ""  # demo entries carry their own abstract/year
        p["_year"] = p["_year"] or e.get("year")
        rid = f"r{i}"
        reviews.append({"id": rid, "paper": p["id"], "person": name2id.get(e["author"], "unknown"),
                        "date": e["date"], "rating": e["rating"], "content": e["content"], "memo": e["memo"],
                        "term": e.get("term", "")})
        p["reviews"].append(rid)

    rev_by_id = {r["id"]: r for r in reviews}
    for p in papers:
        body = " ".join(rev_by_id[r]["content"] + " " + rev_by_id[r]["memo"] for r in p["reviews"])
        ds, ms = score(dom, p["title"], body), score(met, p["title"], body)
        p["domains"] = pick(ds, 3, 3) if ds else []  # a general AI paper: methods only
        p["methods"] = pick(ms, 2, 3) if ms else []
        p["readers"] = sorted({rev_by_id[r]["person"] for r in p["reviews"]})
        rs = [rev_by_id[r]["rating"] for r in p["reviews"] if rev_by_id[r]["rating"]]
        p["rating"] = round(sum(rs) / len(rs), 2) if rs else 0
        p["firstDate"] = min(rev_by_id[r]["date"] for r in p["reviews"])

    # ---- enrichment (Semantic Scholar) + semantic map ----
    s2 = {}
    if (DATA / "s2_cache.json").exists():
        c = json.loads((DATA / "s2_cache.json").read_text(encoding="utf-8"))
        s2 = {k: c["detail"].get(v) for k, v in c["match"].items() if v}
    mp = json.loads((DATA / "map.json").read_text(encoding="utf-8")) if (DATA / "map.json").exists() else None
    key2id = {k: papers[i]["id"] for k, i in by_key.items()}
    s2id2pid = {}
    for k, i in by_key.items():
        p = papers[i]
        d = s2.get(re.sub(r"[^0-9a-z]+", "", k)) or {}
        if d:
            s2id2pid[d["paperId"]] = p["id"]
        own_year, own_abstract = p.pop("_year"), p.pop("_abstract")
        p["year"] = d.get("year") or own_year or year_from(p["venue"])
        p["venueNorm"], p["venueType"] = norm_venue(p["venue"] or d.get("venue") or "", d.get("publicationVenue"))
        p["abstract"] = d.get("abstract") or own_abstract
        p["citations"] = d.get("citationCount")
        p["s2"] = d.get("paperId")
        p["_refs"] = d.get("references") or []
        m = (mp or {}).get("papers", {}).get(k)
        if m:
            p["x"], p["y"], p["c"], p["f"] = m["x"], m["y"], m["c"], m["f"]
            p["a"] = m.get("a")  # area (≤ 8 per lab): the person page's radar axes
            p["nb"] = [[key2id[nk], s] for nk, s in m["nb"] if nk in key2id]
    for p in papers:  # citation edges inside our own corpus
        p["refs"] = sorted({s2id2pid[r] for r in p.pop("_refs") if r in s2id2pid and s2id2pid[r] != p["id"]})

    # ---- topics ----
    topics = []
    for i, (k, (label, _)) in enumerate(DOMAINS.items()):
        topics.append({"id": f"d:{k}", "axis": "domain", "label": label, "labelEn": EN.get(k, label),
                       "color": TOPIC_COLORS[i % len(TOPIC_COLORS)]})
    for i, (k, (label, _)) in enumerate(METHODS.items()):
        topics.append({"id": f"m:{k}", "axis": "method", "label": label, "labelEn": EN.get(k, label),
                       "color": METHOD_COLORS[i % len(METHOD_COLORS)]})

    # ---- people ----
    people = []
    vecs = {}
    for i, r in enumerate(roster):
        mine = [x for x in reviews if x["person"] == r["id"]]
        vec = Counter()
        for x in mine:
            p = papers[int(x["paper"][1:])]
            for d in p["domains"]:
                vec[f"d:{d}"] += 1
            for m in p["methods"]:
                vec[f"m:{m}"] += 1
        vecs[r["id"]] = vec
        rs = [x["rating"] for x in mine if x["rating"]]
        people.append({"id": r["id"], "name": r["name"], "color": PERSON_COLORS[i % len(PERSON_COLORS)],
                       "count": len(mine), "avgRating": round(sum(rs) / len(rs), 2) if rs else 0,
                       "topics": dict(vec.most_common()),
                       "dates": sorted(Counter(x["date"] for x in mine).items())})
    for p in people:
        sims = []
        for q in people:
            if q["id"] == p["id"]:
                continue
            shared = sum(1 for pp in papers if p["id"] in pp["readers"] and q["id"] in pp["readers"])
            sims.append({"id": q["id"], "sim": round(cosine(vecs[p["id"]], vecs[q["id"]]), 3), "shared": shared})
        p["similar"] = sorted(sims, key=lambda s: -s["sim"])

    clusters = []
    for i, cl in enumerate((mp or {}).get("clusters", [])):
        cl = dict(cl)
        cl["color"] = CLUSTER_COLORS[int(cl["id"][1:]) % len(CLUSTER_COLORS)] if cl["level"] == "c" else None
        clusters.append(cl)
    # coarse clusters dominated by the same tag -> disambiguate with the keyword that sets them apart (build_map)
    dup = Counter(c["ko"] for c in clusters if c["level"] == "c")
    for c in clusters:
        word = c.get("distinct") or (c["keywords"] or [None])[0]
        if c["level"] == "c" and dup[c["ko"]] > 1 and word:
            c["ko"] += f" · {word}"
            c["en"] += f" · {word}"
    # keyword rules travel to the browser so the write form can suggest tags without a server
    taxonomy = {**{f"d:{k}": pats for k, (_, pats) in DOMAINS.items()}, **{f"m:{k}": pats for k, (_, pats) in METHODS.items()}}
    data = {"dataset": DATASET, "relativeDates": bool(DATASET), "people": people, "topics": topics, "papers": papers, "reviews": reviews, "clusters": clusters,
            "terms": sorted({r["term"] for r in reviews}), "taxonomy": taxonomy}
    if (DATA / "social.json").exists():  # demo only: example studies/comments the browser store seeds once
        data["social"] = resolve_social(json.loads((DATA / "social.json").read_text(encoding="utf-8")), papers, reviews)
    out = ROOT / "site" / (f"data.{DATASET}.js" if DATASET else "data.js")
    out.write_text("window.LAB = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"site/{out.name}: {len(people)} people, {len(papers)} papers, {len(reviews)} reviews, "
          f"{sum(1 for p in papers if len(p['readers']) > 1)} shared papers")
    untagged = sum(1 for p in papers if not p["domains"])
    print(f"untagged (no domain): {untagged}")

    if a.vault:
        write_vault(data)


def resolve_social(s, papers, reviews):
    """social.json refers to papers by exact title and reviews by (member id, title) → turn those into site ids."""
    pid = {norm_title(p["title"]): p["id"] for p in papers}
    rid = {(r["person"], r["paper"]): r["id"] for r in reviews}

    def paper(title):
        if norm_title(title) not in pid:
            raise SystemExit(f"social.json: unknown paper {title!r}")
        return pid[norm_title(title)]

    def review(ref):
        key = (ref["author"], paper(ref["paper"]))
        if key not in rid:
            raise SystemExit(f"social.json: {ref['author']} has no review of {ref['paper']!r}")
        return rid[key]

    studies = []
    for st in s.get("studies", []):
        st = {k: v for k, v in st.items() if k != "paper"} | {"paperId": paper(st["paper"])}
        st["picks"] = [{"uid": pk["uid"], "paperId": paper(pk["paper"]), "why": pk.get("why", "")} for pk in st.get("picks", [])]
        studies.append(st)
    return {
        "studies": studies,
        "comments": [{k: v for k, v in c.items() if k != "review"} | {"reviewId": review(c["review"])} for c in s.get("comments", [])],
        "reactions": [{"reviewId": review(r["review"]), "like": r.get("like", []), "want": r.get("want", [])} for r in s.get("reactions", [])],
        "reading": {u: [paper(t) for t in ts] for u, ts in s.get("reading", {}).items()},
        "guides": [{k: v for k, v in g.items() if k != "items"} | {"items": [{k: v for k, v in it.items() if k != "paper"} | ({"paperId": paper(it["paper"])} if "paper" in it else {})
                                                                          for it in g["items"]]} for g in s.get("guides", [])],
    }


def write_vault(data):
    """Obsidian-compatible vault: People / Papers / Topics notes linked with [[wikilinks]]."""
    v = ROOT / "vault"
    if v.exists():
        shutil.rmtree(v)
    for d in ("People", "Papers", "Topics"):
        (v / d).mkdir(parents=True)
    pid2name = {p["id"]: p["name"] for p in data["people"]}
    tlabel = {t["id"]: t["label"] for t in data["topics"]}
    rev = {r["id"]: r for r in data["reviews"]}
    pnote = {}
    for p in data["papers"]:
        base = slug(p["title"])
        name, n = base, 2
        while name.lower() in {x.lower() for x in pnote.values()}:
            name, n = f"{base} ({n})", n + 1
        pnote[p["id"]] = name

    for p in data["papers"]:
        tags = [f"[[{tlabel['d:' + d]}]]" for d in p["domains"]] + [f"[[{tlabel['m:' + m]}]]" for m in p["methods"]]
        lines = ["---", f"title: \"{p['title'].replace(chr(34), '')}\"", f"venue: \"{p['venue']}\"",
                 f"link: \"{p['link']}\"", f"rating: {p['rating']}", "---", "",
                 f"# {p['title']}", "", f"- 저자: {p['authors']}", f"- 저널: {p['venue']}",
                 f"- 분류: {' '.join(tags)}", ""]
        for rid in p["reviews"]:
            r = rev[rid]
            lines += [f"## [[{pid2name.get(r['person'], '미상')}]] · {r['date']} · {'★' * r['rating']}", "",
                      r["content"], "", f"> **Memo** {r['memo']}" if r["memo"] else "", ""]
        (v / "Papers" / f"{pnote[p['id']]}.md").write_text("\n".join(lines), encoding="utf-8")

    for t in data["topics"]:
        (v / "Topics" / f"{t['label']}.md").write_text(f"# {t['label']}\n\n#{t['axis']}\n", encoding="utf-8")

    for person in data["people"]:
        top = ", ".join(f"[[{tlabel[k]}]] ({c})" for k, c in list(person["topics"].items())[:8])
        read = [p for p in data["papers"] if person["id"] in p["readers"]]
        lines = [f"# {person['name']}", "", f"읽은 논문 {person['count']}편 · 평균 ★{person['avgRating']}", "",
                 f"관심사: {top}", "", "## 읽은 논문", ""]
        lines += [f"- [[{pnote[p['id']]}]]" for p in read]
        (v / "People" / f"{person['name']}.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"vault/: {len(data['papers'])} paper notes")


if __name__ == "__main__":
    main()
