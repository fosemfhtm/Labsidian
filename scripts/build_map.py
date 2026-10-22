"""Semantic maps: papers -> embeddings (+ their field / method tags) -> two 2D layouts + neighbours.

Usage (needs the ML venv):
    .venv/Scripts/python scripts/build_map.py [--reuse]   # reuse only when model, titles and abstracts match
Writes data/map.json, which build_site.py merges into site/data.js.

Pipeline
  1. text = title + S2 abstract/TLDR (if enriched) — the *paper itself*, NOT the reviews.
     Review text made neighbours cluster by reviewer & review language (see eval_embeddings.py),
     so reviewer perspective is shown as person nodes/edges and tags instead of positions.
  2. SPECTER2 embeddings (AllenAI; trained on citation links -> "academically related"), mean-centred
  3. the paper's field / method tags (keyword rules, same as build_site.py) appended as a weighted tag vector, so
     papers people file under the same tag pull together while the text still orders them within it
     (weight 0.4 kept ~ the same text neighbours; 1.0 split the map into one island per tag — 2026-10-22 test)
  4. UMAP 2-d, cosine, fixed seed: the field map (x, y); the method map (mx, my) starts from the field map so the
     graph can flip between them with papers staying roughly in their column
  5. top-k cosine neighbours per paper on the text alone (for "similar papers" and local-graph edges)
There are no map regions: the graph draws each tag's papers as a density area (docs/design/decisions.md 2026-10-22).
"""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
from build_site import norm_title, compile_tax, score, pick  # noqa: E402
from taxonomy import DOMAINS, METHODS  # noqa: E402

DATA = ROOT / os.environ.get("LABSIDIAN_DATA", "data")  # data/demo = the fake demo lab
MODEL = "allenai/specter2"
SEED = 42
TAG_WEIGHT = 0.4


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


def tag_matrix(papers, tax, k):
    """one row per paper: its tags under the keyword rules (as build_site.py picks them), unit length; empty = zeros"""
    rules, keys = compile_tax(tax), list(tax)
    m = np.zeros((len(papers), len(keys)))
    for i, p in enumerate(papers):
        s = score(rules, p["title"], " ".join((r.get("content") or "") + " " + (r.get("memo") or "") for r in p["reviews"]))
        for t in (pick(s, k, 3) if s else []):
            m[i, keys.index(t)] = 1
    n = np.linalg.norm(m, axis=1, keepdims=True)
    return m / np.where(n == 0, 1, n)


def main():
    papers = load_papers()
    fingerprint = hashlib.sha256(json.dumps([MODEL, [(p["title"], p["abstract"]) for p in papers]],
                                            ensure_ascii=False).encode("utf-8")).hexdigest()
    if not papers:
        (DATA / "map.json").write_text(json.dumps({"model": MODEL, "inputs": fingerprint, "tagWeight": TAG_WEIGHT, "papers": {}}),
                                      encoding="utf-8")
        return
    print(f"{len(papers)} papers, {sum(1 for p in papers if p['abstract'])} with abstracts", file=sys.stderr)

    emb_p, keys_p = DATA / "emb_specter2.npy", DATA / "emb_keys.json"
    keys = [p["key"] for p in papers]
    map_p = DATA / "map.json"
    old_map = json.loads(map_p.read_text(encoding="utf-8")) if "--reuse" in sys.argv and map_p.exists() else {}
    if ("--reuse" in sys.argv and emb_p.exists() and keys_p.exists()
            and json.loads(keys_p.read_text(encoding="utf-8")) == keys and old_map.get("inputs") == fingerprint):
        emb = np.load(emb_p)
    else:
        emb = embed_specter2(papers)
        np.save(emb_p, emb)
        keys_p.write_text(json.dumps(keys), encoding="utf-8")
    lengths = np.linalg.norm(emb, axis=1, keepdims=True)
    emb = emb / np.where(lengths > 0, lengths, 1)
    # SPECTER2 vectors all point roughly the same way; centring spreads them so a small tag weight can matter
    ec = emb - emb.mean(0)
    lengths = np.linalg.norm(ec, axis=1, keepdims=True)
    ec /= np.where(lengths > 0, lengths, 1)
    fields, methods = tag_matrix(papers, DOMAINS, 3), tag_matrix(papers, METHODS, 2)

    # more papers → look at more neighbours, so the big topic structure survives (18 up to ~900 papers)
    if len(papers) < 4:
        uf = np.column_stack((np.arange(len(papers), dtype=float), np.zeros(len(papers))))
        um = uf.copy()
    else:
        import umap
        from scipy.linalg import orthogonal_procrustes

        fit = lambda tags, init="spectral": umap.UMAP(n_components=2, n_neighbors=min(len(papers) - 1, max(18, round(0.6 * np.sqrt(len(papers))))), min_dist=0.12,
                                                      spread=1.2, metric="cosine", init=init, random_state=SEED).fit_transform(np.hstack([ec, TAG_WEIGHT * tags]))
        uf = fit(fields)
        um = fit(methods, init=uf)
    # Same density as the corpus grows; keep flat axes finite for tiny datasets.
    def norm(u):
        spread = u.std(0)
        return (u - u.mean(0)) / np.where(spread > 0, spread, 1) * 100 * np.sqrt(max(1, len(papers) / 900))
    uf, um = norm(uf), norm(um)
    if len(papers) >= 4:
        rot, _ = orthogonal_procrustes(um, uf)  # turn / mirror the method map onto the field map: the flip only moves what changed
        um = um @ rot

    # neighbors
    sims = emb @ emb.T
    np.fill_diagonal(sims, -np.inf)
    k = min(6, len(papers) - 1)
    nb = np.argsort(-sims, axis=1)[:, :k]

    out = {"model": MODEL, "inputs": fingerprint, "tagWeight": TAG_WEIGHT, "papers": {}}
    for i, p in enumerate(papers):
        out["papers"][p["key"]] = {
            "x": round(float(uf[i, 0]), 2), "y": round(float(uf[i, 1]), 2),
            "mx": round(float(um[i, 0]), 2), "my": round(float(um[i, 1]), 2),
            "nb": [[papers[j]["key"], round(float(sims[i, j]), 3)] for j in nb[i]],
        }
    (DATA / "map.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"map.json: {len(papers)} papers on the field and method maps", file=sys.stderr)


if __name__ == "__main__":
    main()
