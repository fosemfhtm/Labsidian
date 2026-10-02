"""Usage: .venv/Scripts/python scripts/eval_trust.py   (needs site/data.js + data/emb_specter2.npy)
(1) Does SPECTER2 closeness track real academic relatedness in OUR corpus?  (citations between our papers, same venue)
(2) How much does the 2-D map distort it?  (3) What does the current 'interest %' measure vs. shared papers?"""
import json, re, sys
from pathlib import Path
import numpy as np

ROOT = Path(r"C:/dev/기타/Labsidian")
sys.path.insert(0, str(ROOT / "scripts"))
D = json.loads(re.sub(r"^[^=]*=\s*", "", (ROOT / "site/data.js").read_text(encoding="utf-8")).rstrip().rstrip(";"))
E = np.load(ROOT / "data/emb_specter2.npy"); keys = json.loads((ROOT / "data/emb_keys.json").read_text(encoding="utf-8"))
norm = lambda t: re.sub(r"[^0-9a-z가-힣]+", "", (t or "").lower().replace("ﬁ", "fi").replace("ﬂ", "fl"))
kidx = {k: i for i, k in enumerate(keys)}
papers = [p for p in D["papers"] if norm(p["title"]) in kidx and p.get("x") is not None]
pid = {p["id"]: i for i, p in enumerate(papers)}
X = E[[kidx[norm(p["title"])] for p in papers]]; X = X / np.linalg.norm(X, axis=1, keepdims=True)
S = X @ X.T; np.fill_diagonal(S, -np.inf)
XY = np.array([[p["x"], p["y"]] for p in papers]); n = len(papers)
D2 = np.linalg.norm(XY[:, None] - XY[None], axis=2); np.fill_diagonal(D2, np.inf)
rng = np.random.default_rng(0)
print(f"papers with embedding+position: {n}")

def pct_rank_sim(i, j):  # where j sits among i's candidates, 0 = closest
    return float((S[i] > S[i, j]).sum()) / (n - 1)
def pct_rank_2d(i, j):
    return float((D2[i] < D2[i, j]).sum()) / (n - 1)

# (1) citations inside our corpus
pairs = [(pid[p["id"]], pid[r]) for p in papers for r in p.get("refs", []) if r in pid]
pairs = list({tuple(sorted(x)) for x in pairs})
rand = [(a, b) for a, b in rng.integers(0, n, (4000, 2)) if a != b]
cs = np.array([S[a, b] for a, b in pairs]); cr = np.array([S[a, b] for a, b in rand])
rk = np.array([min(pct_rank_sim(a, b), pct_rank_sim(b, a)) for a, b in pairs])
rk2 = np.array([min(pct_rank_2d(a, b), pct_rank_2d(b, a)) for a, b in pairs])
print(f"\n[citations inside corpus] pairs={len(pairs)}")
print(f"  cosine: cited {cs.mean():.3f} vs random {cr.mean():.3f}")
print(f"  rank of the cited paper among {n-1} others (SPECTER2): median top {100*np.median(rk):.1f}%  | within top 1%: {100*(rk<=.01).mean():.0f}%  top 5%: {100*(rk<=.05).mean():.0f}%")
print(f"  same, on the 2-D map: median top {100*np.median(rk2):.1f}%  | within top 5%: {100*(rk2<=.05).mean():.0f}%")

# venue
ven = [p.get("venueNorm") or "" for p in papers]
vp = [(i, j) for i in range(n) for j in range(i + 1, n) if ven[i] and ven[i] == ven[j] and ven[i].lower() not in ("arxiv", "")]
vp = [vp[k] for k in rng.choice(len(vp), min(3000, len(vp)), replace=False)]
print(f"\n[same venue, excl. arXiv] pairs sampled={len(vp)}  cosine {np.mean([S[a,b] for a,b in vp]):.3f} vs random {cr.mean():.3f}")

# (2) 2-D faithfulness: of each paper's 10 nearest in SPECTER2, how many are also among its 10 / 30 nearest on the map
nn = np.argsort(-S, axis=1)[:, :10]; nn2 = np.argsort(D2, axis=1)
o10 = np.mean([len(set(nn[i]) & set(nn2[i, :10])) / 10 for i in range(n)])
o30 = np.mean([len(set(nn[i]) & set(nn2[i, :30])) / 10 for i in range(n)])
print(f"\n[2-D map faithfulness] SPECTER2 top-10 neighbours found in map top-10: {100*o10:.0f}%, in map top-30: {100*o30:.0f}%  (random: {100*10/n:.1f}% / {100*30/n:.1f}%)")

# (3) people: current interest % (cosine of tag counts) vs shared papers vs an embedding-based alternative
people = {p["id"]: p for p in D["people"]}
reads = {u: [pid[p["id"]] for p in papers if u in p["readers"]] for u in people}
def emb_sim(a, b):  # avg over a's papers of the closest paper b read (symmetrised): "how near are the papers they read"
    A, B = reads[a], reads[b]
    if not A or not B: return 0
    m = S[np.ix_(A, B)].copy(); m[np.isinf(m)] = 1.0
    return (m.max(1).mean() + m.max(0).mean()) / 2
rows = []
for a in people:
    for s in people[a]["similar"]:
        b = s["id"]
        if a < b and b in people:
            rows.append((people[a]["name"], people[b]["name"], s["sim"], s["shared"], emb_sim(a, b), len(reads[a]), len(reads[b])))
rows.sort(key=lambda r: -r[3])
print("\n[people] name pair | current % (tag cosine) | shared papers | embedding closeness | #read")
for r in rows[:8] + [None] + sorted(rows, key=lambda r: -r[2])[:6]:
    print("  ---" if r is None else f"  {r[0]}–{r[1]}: {round(r[2]*100)}% | {r[3]} | {r[4]:.3f} | {r[5]}/{r[6]}")
cur = np.array([r[2] for r in rows]); sh = np.array([r[3] for r in rows]); em = np.array([r[4] for r in rows])
rk_ = lambda v: np.argsort(np.argsort(v))
sp = lambda a, b: np.corrcoef(rk_(a), rk_(b))[0, 1]
print(f"\n  rank correlation with shared papers: current % {sp(cur, sh):.2f} | embedding closeness {sp(em, sh):.2f}")
print(f"  current % range: {cur.min()*100:.0f}–{cur.max()*100:.0f}%  (pairs ≥80%: {(cur>=.8).sum()}/{len(cur)})")

# proposed: share of each person's papers that the other also read OR that sit among that paper's 10 nearest neighbours
print("\nnb per paper in data.js:", len(papers[0].get("nb", [])))
def near(a, b, k=10):
    A, B = reads[a], set(reads[b])
    if not A or not B: return 0
    hit = lambda i, other: i in other or any(j in other for j in nn[i, :k])
    return (np.mean([hit(i, B) for i in A]) + np.mean([hit(j, set(A)) for j in B])) / 2
rows2 = [(r[0], r[1], r[2], r[3], near(*[u for u in people if people[u]["name"] in (r[0], r[1])][:2])) for r in rows]
nr = np.array([r[4] for r in rows2])
print(f"proposed 'near' % : rank corr with shared {sp(nr, sh):.2f} | range {nr.min()*100:.0f}–{nr.max()*100:.0f}%")
for r in sorted(rows2, key=lambda r: -r[3])[:6] + [None] + sorted(rows2, key=lambda r: r[3])[:4]:
    print("  ---" if r is None else f"  {r[0]}–{r[1]}: now {round(r[2]*100)}% → proposed {round(r[4]*100)}% | shared {r[3]}")
