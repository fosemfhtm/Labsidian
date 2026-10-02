"""Semantic map: papers -> embeddings -> 2D layout + 2-level clusters + labels + neighbors.

Usage (needs the ML venv):
    .venv/Scripts/python scripts/build_map.py [--reuse]   # --reuse: skip re-embedding if papers unchanged
Writes data/map.json, which build_site.py merges into site/data.js.

Pipeline
  1. text = title + S2 abstract/TLDR (if enriched) — the *paper itself*, NOT the reviews.
     Review text made neighbours cluster by reviewer & review language (see eval_embeddings.py),
     so reviewer perspective is shown as person nodes/edges and tags instead of positions.
  2. SPECTER2 embeddings (AllenAI; trained on citation links -> "academically related")
  3. UMAP 2-d, cosine, fixed seed
  4. fine clusters (Ward, ~sqrt(n)) -> coarse clusters by merging fine centroids -> always nested. Clustered on the
     2-d layout itself, so each region is one patch of the map (10-d clusters interleaved on screen: two regions with
     the same topic drawn on top of each other) — at the same semantic coherence in the embedding space.
  5. labels: c-TF-IDF keywords (English) + dominant lab tag (ko/en); fine clusters are named against their siblings
     and coarse clusters sharing a tag get a keyword that tells them apart ("distinct")
  6. top-k cosine neighbors per paper (for "similar papers" and local-graph edges)
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))
from build_site import norm_title, compile_tax, score, pick  # noqa: E402
from taxonomy import DOMAINS, METHODS, EN  # noqa: E402

DATA = ROOT / os.environ.get("LABSIDIAN_DATA", "data")  # data/demo = the fake demo lab
MODEL = "allenai/specter2"
SEED = 42
STOP = set("""a an the of for and or in on to with by from via using based approach approaches model models method methods
framework study analysis new novel towards toward under its their this that is are be as at into we our learning data
paper results result proposed propose show shows than more over can also which these those between through two one
toward multi large real time vehicle vehicles traffic system systems problem problems network networks driving""".split())


def load_papers():
    entries = json.loads((DATA / "diary.json").read_text(encoding="utf-8"))
    s2 = {}
    cache_p = DATA / "s2_cache.json"
    if cache_p.exists():
        c = json.loads(cache_p.read_text(encoding="utf-8"))
        s2 = {k: c["detail"].get(v) for k, v in c["match"].items() if v}
    papers = {}
    for e in entries:
        k = norm_title(e["title"])
        p = papers.setdefault(k, {"key": k, "title": e["title"].strip(), "reviews": []})
        p["reviews"].append(e)
    for k, p in papers.items():
        d = s2.get(re.sub(r"[^0-9a-z]+", "", k)) or {}
        own = next((r["abstract"] for r in p["reviews"] if r.get("abstract")), "")  # demo entries carry one
        p["abstract"] = d.get("abstract") or own or ((d.get("tldr") or {}).get("text")) or ""
    return list(papers.values())


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


def ctfidf(docs_by_cluster, topn=3):
    """class-based TF-IDF over English 1-2 grams."""
    tok = lambda s: [w for w in re.findall(r"[a-z][a-z\-]{2,}", s.lower()) if w not in STOP]
    tf = {}
    for c, docs in docs_by_cluster.items():
        cnt = Counter()
        for d in docs:
            ws = tok(d)
            cnt.update(set(ws))
            cnt.update(set(f"{a} {b}" for a, b in zip(ws, ws[1:])))
        tf[c] = cnt
    df = Counter()
    for cnt in tf.values():
        df.update(set(cnt))
    n = len(tf)
    avg = np.mean([sum(c.values()) for c in tf.values()]) or 1
    out = {}
    for c, cnt in tf.items():
        size = len(docs_by_cluster[c])
        scores = {w: (v / size) * np.log(1 + avg / (df[w] * 1.0)) * (1.25 if " " in w else 1)
                  for w, v in cnt.items() if v >= max(2, size * 0.08) and df[w] < n * 0.6}
        best = []
        for w, _ in sorted(scores.items(), key=lambda x: -x[1]):
            # skip unigrams already covered by a chosen bigram (and vice versa)
            if any(set(w.split()) & set(b.split()) for b in best):
                continue
            best.append(w)
            if len(best) == topn:
                break
        out[c] = best
    return out


def main():
    from sklearn.cluster import AgglomerativeClustering
    import umap

    papers = load_papers()
    print(f"{len(papers)} papers, {sum(1 for p in papers if p['abstract'])} with abstracts", file=sys.stderr)

    emb_p, keys_p = DATA / "emb_specter2.npy", DATA / "emb_keys.json"
    keys = [p["key"] for p in papers]
    if "--reuse" in sys.argv and emb_p.exists() and keys_p.exists() and json.loads(keys_p.read_text()) == keys:
        emb = np.load(emb_p)
    else:
        emb = embed_specter2(papers)
        np.save(emb_p, emb)
        keys_p.write_text(json.dumps(keys))
    emb = emb / np.linalg.norm(emb, axis=1, keepdims=True)

    # more papers → look at more neighbours, so the big topic structure survives (18 up to ~900 papers)
    u2 = umap.UMAP(n_components=2, n_neighbors=max(18, round(0.6 * np.sqrt(len(papers)))), min_dist=0.12, spread=1.2,
                   metric="cosine", random_state=SEED).fit_transform(emb)
    # ~±250 canvas for up to ~900 papers, then the area grows with the count: same spacing between papers, so the
    # graph's collision force (node radii are in these units) doesn't shove a crowded map out of shape
    u2 = (u2 - u2.mean(0)) / u2.std(0) * 100 * np.sqrt(max(1, len(papers) / 900))

    n_fine = max(8, int(round(np.sqrt(len(papers)) * 1.3)))
    fine = AgglomerativeClustering(n_clusters=n_fine, linkage="ward").fit_predict(u2)
    cent = np.stack([u2[fine == c].mean(0) for c in range(n_fine)])
    n_coarse = max(4, min(14, int(round(n_fine / 3.2))))  # more regions than ~14 stop being readable
    coarse_of_fine = AgglomerativeClustering(n_clusters=n_coarse, linkage="ward").fit_predict(cent)
    coarse = coarse_of_fine[fine]

    # labels
    dom, met = compile_tax(DOMAINS), compile_tax(METHODS)
    ptags = []
    for p in papers:
        body = " ".join(r["content"] + " " + r["memo"] for r in p["reviews"])
        ds = score(dom, p["title"], body)
        ptags.append(pick(ds, 2, 3) if ds else ["core"])
    en_text = [p["title"] + " " + p["abstract"] for p in papers]

    def cluster_info(assign, level):
        docs = defaultdict(list)
        for i, c in enumerate(assign):
            docs[int(c)].append(en_text[i])
        kw = ctfidf(docs)
        out = []
        for c in sorted(docs):
            idx = np.where(assign == c)[0]
            tagc = Counter(t for i in idx for t in ptags[i][:1])
            top_tag, top_n = tagc.most_common(1)[0]
            xy = np.median(u2[idx], axis=0)
            out.append({"id": f"{level}{c}", "level": level, "size": int(len(idx)),
                        "x": round(float(xy[0]), 2), "y": round(float(xy[1]), 2),
                        "keywords": kw[c], "tag": top_tag, "tagShare": round(top_n / len(idx), 2),
                        "ko": DOMAINS[top_tag][0], "en": EN[top_tag]})
        return out

    def keywords_within(assign, group_of):
        """c-TF-IDF among the clusters of one group only → the words that tell siblings apart"""
        out = {}
        for g in set(group_of.values()):
            members = [c for c in group_of if group_of[c] == g]
            if len(members) > 1:
                out.update(ctfidf({c: [en_text[i] for i in np.where(assign == c)[0]] for c in members}))
        return out

    clusters = cluster_info(coarse, "c") + cluster_info(fine, "f")
    tag_of = {int(cl["id"][1:]): cl["tag"] for cl in clusters if cl["level"] == "c"}
    distinct = keywords_within(coarse, tag_of)
    siblings = keywords_within(fine, {f: int(coarse_of_fine[f]) for f in range(n_fine)})
    for cl in clusters:
        i = int(cl["id"][1:])
        if cl["level"] == "c" and distinct.get(i):
            cl["distinct"] = distinct[i][0]
        if cl["level"] == "f":
            cl["parent"] = f"c{int(coarse_of_fine[i])}"
            own = siblings.get(i) or []
            cl["keywords"] = (own + [w for w in cl["keywords"] if w not in own])[:3]

    # neighbors
    sims = emb @ emb.T
    np.fill_diagonal(sims, -1)
    k = 6
    nb = np.argsort(-sims, axis=1)[:, :k]

    out = {"model": MODEL, "papers": {}, "clusters": clusters}
    for i, p in enumerate(papers):
        out["papers"][p["key"]] = {
            "x": round(float(u2[i, 0]), 2), "y": round(float(u2[i, 1]), 2),
            "c": f"c{int(coarse[i])}", "f": f"f{int(fine[i])}",
            "nb": [[papers[j]["key"], round(float(sims[i, j]), 3)] for j in nb[i]],
        }
    (DATA / "map.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"map.json: {n_coarse} coarse / {n_fine} fine clusters", file=sys.stderr)
    for cl in clusters:
        if cl["level"] == "c":
            print(f"  {cl['id']:>4} {cl['size']:>4}  {cl['ko']:<14} {', '.join(cl['keywords'])}", file=sys.stderr)


if __name__ == "__main__":
    main()
