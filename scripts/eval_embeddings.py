"""How much do map positions reflect the *paper* vs. *who reviewed it / in which language*?

For each embedding we look at every paper's 10 nearest neighbours and measure
  same_lang   - neighbour's review is written in the same language (ko/en)      -> bias, lower is better
  same_reader - neighbour was reviewed by the same person                       -> bias, lower is better
  same_tag    - neighbour shares the primary field tag (keyword rules)          -> topical, higher is better
  same_venue  - neighbour published in the same venue                           -> topical, higher is better
Each is reported as observed rate / random baseline ("lift"). Lift 1.0 = no effect.

Usage: .venv/Scripts/python scripts/eval_embeddings.py
"""
import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))
from build_map import load_papers  # noqa: E402
from build_site import compile_tax, score, pick, norm_venue  # noqa: E402
from taxonomy import DOMAINS  # noqa: E402


def lang_of(p):
    txt = " ".join(r["content"] + r["memo"] for r in p["reviews"])
    ko = len(re.findall(r"[가-힣]", txt))
    return "ko" if ko > 0.15 * max(1, len(re.findall(r"[A-Za-z가-힣]", txt))) else "en"


def evaluate(name, emb, papers, k=10):
    emb = emb / np.linalg.norm(emb, axis=1, keepdims=True)
    sims = emb @ emb.T
    np.fill_diagonal(sims, -9)
    nb = np.argsort(-sims, axis=1)[:, :k]
    feats = {
        "same_lang": [p["_lang"] for p in papers],
        "same_reader": [p["_reader"] for p in papers],
        "same_tag": [p["_tag"] for p in papers],
        "same_venue": [p["_venue"] or None for p in papers],
    }
    row = {}
    for f, vals in feats.items():
        vals = np.array(vals, dtype=object)
        valid = np.array([v is not None for v in vals])
        obs = np.mean([np.mean(vals[nb[i]] == vals[i]) for i in range(len(papers)) if valid[i]])
        _, counts = np.unique(vals[valid].astype(str), return_counts=True)
        base = np.sum((counts / counts.sum()) ** 2)
        row[f] = obs / base
    print(f"{name:<34}" + "".join(f"{row[f]:>12.2f}" for f in feats))
    return row


def main():
    from sentence_transformers import SentenceTransformer
    papers = load_papers()
    dom = compile_tax(DOMAINS)
    for p in papers:
        p["_lang"] = lang_of(p)
        p["_reader"] = p["reviews"][0]["author"]
        ds = score(dom, p["title"], p["abstract"])  # title/abstract only -> independent of review text
        p["_tag"] = pick(ds, 1, 1)[0] if ds else None
        p["_venue"] = norm_venue(p["reviews"][0]["venue"])[0]
    n_ko = sum(p["_lang"] == "ko" for p in papers)
    print(f"{len(papers)} papers · reviews in Korean {n_ko} / English {len(papers) - n_ko} · "
          f"{sum(1 for p in papers if p['abstract'])} with abstract\n")
    print(f"{'embedding (lift vs random)':<34}{'same_lang':>12}{'same_reader':>12}{'same_tag':>12}{'same_venue':>12}")
    print(f"{'':<34}{'(bias ↓)':>12}{'(bias ↓)':>12}{'(topic ↑)':>12}{'(topic ↑)':>12}")

    cur = np.load(ROOT / "data" / "emb_e5.npy")
    evaluate("A. e5 · title+review (current)", cur, papers)

    e5 = SentenceTransformer("intfloat/multilingual-e5-base", device="cpu")
    t = e5.encode([f"passage: {p['title']}. {p['abstract']}" for p in papers], batch_size=32, normalize_embeddings=True)
    evaluate("B. e5 · title+abstract only", t, papers)

    from transformers import AutoTokenizer
    from adapters import AutoAdapterModel
    import torch
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
    spec = np.concatenate(out)
    np.save(ROOT / "data" / "emb_specter2.npy", spec)
    evaluate("C. SPECTER2 · title+abstract", spec, papers)


if __name__ == "__main__":
    main()
