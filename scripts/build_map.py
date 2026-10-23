"""Semantic maps: papers -> embeddings (+ their field / method tags) -> two 2D layouts + neighbours.

Usage (needs the ML venv):
    python scripts/build_map.py          # weekly: fit both maps on every paper, starting from the last map (points shift a little)
    python scripts/build_map.py --fresh  # a new map from scratch, ignoring the last one (every point moves)
    python scripts/build_map.py --add    # nightly: put papers that aren't on the map yet onto it; the rest stay put
Papers = the imported diary (data/diary.json) + papers first written on the site (data/labsidian.db, read-only).
Writes data/map.json, which build_site.py merges into site/data.js. A full run saves the fitted maps in
data/map_model.pkl for --add (which does a full run when that file is missing or doesn't fit the tags any more).
SPECTER2 vectors are cached per paper text (data/emb_specter2.npy + emb_keys.json): only new or changed papers are run.

Pipeline
  1. text = title + S2 abstract/TLDR (if enriched) — the *paper itself*, NOT the reviews.
     Review text made neighbours cluster by reviewer & review language (see eval_embeddings.py),
     so reviewer perspective is shown as person nodes/edges and tags instead of positions.
  2. SPECTER2 embeddings (AllenAI; trained on citation links -> "academically related"), mean-centred
  3. the paper's field / method tags appended as a weighted tag vector (keyword rules as build_site.py picks them; a
     paper written on the site uses the tags its writers chose), so papers people file under the same tag pull together
     while the text still orders them within it
     (weight 0.7: 10 nearest map neighbours share the paper's main tag 83% (field) / 91% (method) of the time, vs 67/59%
     at 0.4, with most text neighbours kept; 1.0+ gains ~1 point more and splits the map into one island per tag — 2026-10-22)
  4. UMAP 2-d, cosine, fixed seed: the field map (x, y); the method map (mx, my) starts from the field map so the
     graph can flip between them with papers staying roughly in their column. A weekly run starts from the last map
     with a low learning rate and is turned onto it; --add places new papers with the saved models' transform(),
     scaled and turned like the full run.
  5. top-k cosine neighbours per paper on the text alone (for "similar papers" and local-graph edges)
There are no map regions: the graph draws each tag's papers as a density area (docs/design/decisions.md 2026-10-22).
"""
import hashlib
import json
import pickle
import re
import sqlite3
import sys

import numpy as np

from build_site import DATA, read_json, write_json, s2_details, s2_key, norm_title, compile_tax, score, pick
from taxonomy import DOMAINS, METHODS  # noqa: E402

MODEL = "allenai/specter2"
SEED = 42
TAG_WEIGHT = 0.7
# UMAP learning rate (default 1.0) when a full run refines the last map: 0.05 moves points ~10–15 (map spread 100) per run
# on the demo lab and still pulls papers --add placed 30% closer to their text neighbours; 1.0 reshuffles ~40 — 2026-10-23
WARM_RATE = 0.05


def load_papers():
    entries = read_json(DATA / "diary.json")
    s2 = s2_details(DATA / "s2_cache.json") if (DATA / "s2_cache.json").exists() else {}
    papers = {}
    for e in entries:
        k = norm_title(e["title"])
        p = papers.setdefault(k, {"key": k, "title": e["title"].strip(), "reviews": []})
        p["reviews"].append(e)
    for k, p in papers.items():
        d = s2.get(s2_key(k)) or {}
        own = next((r["abstract"] for r in p["reviews"] if r.get("abstract")), "")  # demo entries carry one
        p["abstract"] = d.get("abstract") or own or ((d.get("tldr") or {}).get("text")) or ""
    return list(papers.values()) + site_papers(papers)


def site_papers(known):
    """papers first written on the site, keyed like the browser keys them (store.js makePapers)"""
    db = DATA / "labsidian.db"
    if not db.exists():
        return []
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        rows = lambda coll: {i: json.loads(v) for i, v in con.execute("SELECT id, value FROM records WHERE coll=?", (coll,))}
        reviews, fixes = rows("reviews"), rows("paperMeta")
    finally:
        con.close()
    out = {}
    for r in sorted(reviews.values(), key=lambda r: r.get("createdAt") or ""):
        m = r.get("meta") or {}
        key = r.get("paperKey") or norm_title(m.get("title"))
        if not key or key in known or re.fullmatch(r"p\d+", r.get("paper") or ""):  # a paper of the imported diary
            continue
        p = out.setdefault(key, {"key": key, "id": r.get("paper"), "title": (m.get("title") or "").strip(),
                                 "abstract": m.get("abstract") or "", "reviews": [], "tags": set()})
        p["reviews"].append(r)
        p["tags"].update(r.get("tags") or [])
    for p in out.values():
        fix = fixes.get(p["id"]) or {}  # shared corrections made on the site
        p["title"], p["abstract"] = fix.get("title") or p["title"], fix.get("abstract") or p["abstract"]
    return list(out.values())


def embed_specter2(papers):
    import torch
    from transformers import AutoTokenizer
    from adapters import AutoAdapterModel
    tok = AutoTokenizer.from_pretrained("allenai/specter2_base")
    model = AutoAdapterModel.from_pretrained("allenai/specter2_base")
    model.load_adapter("allenai/specter2", source="hf", set_active=True)  # "[PRX]" proximity adapter
    model.eval()
    texts = [p["title"] + tok.sep_token + (p["abstract"] or "") for p in papers]
    out = []
    with torch.no_grad():
        for i in range(0, len(texts), 32):
            batch = tok(texts[i:i + 32], padding=True, truncation=True, max_length=512, return_tensors="pt")
            out.append(model(**batch).last_hidden_state[:, 0, :].numpy())
    return np.concatenate(out)


def embeddings(papers):
    """one SPECTER2 vector per paper; a paper is run again only when its title or abstract changed"""
    emb_p, keys_p = DATA / "emb_specter2.npy", DATA / "emb_keys.json"
    tag = lambda p: p["key"] + "#" + hashlib.sha256(f"{MODEL}\n{p['title']}\n{p['abstract']}".encode("utf-8")).hexdigest()[:16]
    want = [tag(p) for p in papers]
    cache = dict(zip(read_json(keys_p), np.load(emb_p))) if emb_p.exists() and keys_p.exists() else {}
    todo = [p for p, t in zip(papers, want) if t not in cache]
    if todo:
        print(f"embedding {len(todo)} papers", file=sys.stderr)
        cache.update(zip((tag(p) for p in todo), embed_specter2(todo)))
        np.save(emb_p, np.stack([cache[t] for t in want]))
        write_json(keys_p, want)
    return np.stack([cache[t] for t in want])


def tag_matrix(papers, tax, k, axis):
    """one row per paper: its tags, unit length; empty = zeros"""
    rules, keys = compile_tax(tax), list(tax)
    m = np.zeros((len(papers), len(keys)))
    for i, p in enumerate(papers):
        if "tags" in p:  # written on the site: the tags its writers chose
            tags = [t[2:] for t in p["tags"] if t.startswith(axis + ":") and t[2:] in tax]
        else:
            s = score(rules, p["title"], " ".join((r.get("content") or "") + " " + (r.get("memo") or "") for r in p["reviews"]))
            tags = pick(s, k, 3) if s else []
        for t in tags:
            m[i, keys.index(t)] = 1
    n = np.linalg.norm(m, axis=1, keepdims=True)
    return m / np.where(n == 0, 1, n)


def unit(a):
    n = np.linalg.norm(a, axis=1, keepdims=True)
    return a / np.where(n > 0, n, 1)


def inputs(papers, emb, mean):
    """UMAP input for the field and the method map: centred text vector + weighted tag vector"""
    ec = unit(emb - mean)  # SPECTER2 vectors all point roughly the same way; centring spreads them so a small tag weight can matter
    return np.hstack([ec, TAG_WEIGHT * tag_matrix(papers, DOMAINS, 3, "d")]), np.hstack([ec, TAG_WEIGHT * tag_matrix(papers, METHODS, 2, "m")])


def fit(papers, emb, old):
    """→ {key: (x, y, mx, my)} and the state --add needs to place later papers the same way. With a previous map (old),
    UMAP starts from it (papers new since then start among their nearest text neighbours), so a weekly re-run refines
    the map instead of drawing a new one; then each map is turned / mirrored / shifted onto the old one."""
    mean = emb.mean(0)
    xf, xm = inputs(papers, emb, mean)
    state = {"model": MODEL, "tagWeight": TAG_WEIGHT, "dims": [xf.shape[1], xm.shape[1]], "mean": mean}
    if len(papers) < 4:
        uf = np.column_stack((np.arange(len(papers), dtype=float), np.zeros(len(papers))))
        um, state["field"] = uf.copy(), None
    else:
        import umap
        # more papers → look at more neighbours, so the big topic structure survives (18 up to ~900 papers)
        make = lambda: umap.UMAP(n_components=2, n_neighbors=min(len(papers) - 1, max(18, round(0.6 * np.sqrt(len(papers))))),
                                 min_dist=0.12, spread=1.2, metric="cosine", random_state=SEED)
        state["field"], state["method"] = make(), make()
        start = None if "--fresh" in sys.argv else last_layout(papers, emb, old)
        if start is not None:  # refine last map gently (a full-strength run from it still reshuffles ~40% of a spread)
            for m in (state["field"], state["method"]):
                m.set_params(learning_rate=WARM_RATE)
            state["field"].set_params(init=start[:, :2])
        uf = state["field"].fit_transform(xf)
        state["method"].set_params(init=start[:, 2:] if start is not None else uf)
        um = state["method"].fit_transform(xm)
    # same density as the corpus grows; keep flat axes finite for tiny datasets
    state["scale"] = 100 * np.sqrt(max(1, len(papers) / 900))
    state["nf"], state["nm"] = (uf.mean(0), np.where(uf.std(0) > 0, uf.std(0), 1)), (um.mean(0), np.where(um.std(0) > 0, um.std(0), 1))
    uf, um = scaled(uf, state["nf"], state), scaled(um, state["nm"], state)
    shared = [i for i, p in enumerate(papers) if p["key"] in old]
    target = lambda a, b: np.array([[old[papers[i]["key"]][a], old[papers[i]["key"]][b]] for i in shared])
    state["af"] = turn(uf, target("x", "y"), shared)
    uf = moved(uf, state["af"])
    # the method map follows last time's method map, or on a first run the field map: the flip only moves what changed
    state["am"] = turn(um, target("mx", "my"), shared) if len(shared) >= 3 else turn(um, uf, list(range(len(papers))))
    um = moved(um, state["am"])
    return {p["key"]: (*uf[i], *um[i]) for i, p in enumerate(papers)}, state


def last_layout(papers, emb, old):
    """the previous map as UMAP's starting point (x, y, mx, my per paper), or None when it covers under half the papers"""
    have = [i for i, p in enumerate(papers) if p["key"] in old]
    if len(have) < max(4, len(papers) / 2):
        return None
    start = np.zeros((len(papers), 4))
    for i in have:
        o = old[papers[i]["key"]]
        start[i] = o["x"], o["y"], o["mx"], o["my"]
    e = unit(emb)
    for i in sorted(set(range(len(papers))) - set(have)):  # a newer paper: the mean spot of its 6 nearest old papers
        nearest = np.array(have)[np.argsort(-(e[have] @ e[i]))[:6]]
        start[i] = start[nearest].mean(0)
    return start


def turn(u, target, rows):
    """the rotation / mirror (+ shift) that best lays u[rows] onto target; identity when there's too little to go on"""
    if len(rows) < 3:
        return np.zeros(2), np.eye(2), np.zeros(2)
    from scipy.linalg import orthogonal_procrustes
    src, dst = u[rows], target
    return src.mean(0), orthogonal_procrustes(src - src.mean(0), dst - dst.mean(0))[0], dst.mean(0)


def moved(u, t):
    return (u - t[0]) @ t[1] + t[2]


def scaled(u, norm, state):
    return (u - norm[0]) / norm[1] * state["scale"]


def place(papers, emb, state):
    """new papers onto the saved maps: transform, then the full run's scaling and turn"""
    xf, xm = inputs(papers, emb, state["mean"])
    uf = moved(scaled(state["field"].transform(xf), state["nf"], state), state["af"])
    um = moved(scaled(state["method"].transform(xm), state["nm"], state), state["am"])
    return {p["key"]: (*uf[i], *um[i]) for i, p in enumerate(papers)}


def main():
    papers, map_p, model_p = load_papers(), DATA / "map.json", DATA / "map_model.pkl"
    if not papers:
        write_json(map_p, {"model": MODEL, "tagWeight": TAG_WEIGHT, "papers": {}})
        return
    print(f"{len(papers)} papers, {sum(1 for p in papers if p['abstract'])} with abstracts", file=sys.stderr)
    emb = embeddings(papers)

    state = pickle.loads(model_p.read_bytes()) if "--add" in sys.argv and model_p.exists() else None
    old = read_json(map_p)["papers"] if map_p.exists() else {}  # --fresh still turns the new map onto it
    if state and state.get("field") and state["model"] == MODEL and state["tagWeight"] == TAG_WEIGHT \
            and state["dims"] == [emb.shape[1] + len(DOMAINS), emb.shape[1] + len(METHODS)] and "af" in state:
        pos = {k: (v["x"], v["y"], v["mx"], v["my"]) for k, v in old.items()}
        new = [i for i, p in enumerate(papers) if p["key"] not in pos]
        if new:
            pos |= place([papers[i] for i in new], emb[new], state)
        print(f"--add: {len(new)} new papers placed, {len(papers) - len(new)} kept", file=sys.stderr)
    else:
        if "--add" in sys.argv:
            print("--add: no saved maps that fit → full run", file=sys.stderr)
        pos, state = fit(papers, emb, old)
        model_p.write_bytes(pickle.dumps(state))

    # neighbours on the text alone
    e = unit(emb)
    sims = e @ e.T
    np.fill_diagonal(sims, -np.inf)
    k = min(6, len(papers) - 1)
    nb = np.argsort(-sims, axis=1)[:, :k]
    out = {"model": MODEL, "tagWeight": TAG_WEIGHT, "papers": {}}
    for i, p in enumerate(papers):
        x, y, mx, my = pos[p["key"]]
        out["papers"][p["key"]] = {"x": round(float(x), 2), "y": round(float(y), 2), "mx": round(float(mx), 2), "my": round(float(my), 2),
                                   "nb": [[papers[j]["key"], round(float(sims[i, j]), 3)] for j in nb[i]]}
    write_json(map_p, out)
    print(f"map.json: {len(papers)} papers on the field and method maps", file=sys.stderr)


if __name__ == "__main__":
    main()
