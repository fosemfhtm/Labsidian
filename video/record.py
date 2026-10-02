"""Record the Labsidian demo film (fake demo lab) → video/raw/*.webm + video/remotion/public/{raw.mp4, timeline.json}

    python scripts/serve.py 8766 --demo          # demo site must be up
    .venv/Scripts/python video/record.py         # records a clean screen capture + a timeline of scenes/spotlights
    cd video/remotion && npm run render          # Remotion adds act cards, captions, chips, spotlights → out/labsidian_demo.mp4

Story: one member's week — 한서윤 signs in on Monday, catches up, picks papers on the map, writes a diary, prepares a
study, asks her own AI (MCP). Everything is the fake demo dataset (data/demo); no real member appears.
The recording is a clean screen capture (only a cursor is injected, video/cursor.js); every caption lives in
timeline.json, so wording can be changed and re-rendered without recording again.
Runs in a throwaway browser profile; your own browser data is untouched.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
VID = ROOT / "video"
RAW, PUB = VID / "raw", VID / "remotion" / "public"
SITE = "http://localhost:8766"
W, H = 1920, 1080
INIT_PW = "labsidian"            # mock initial password (site/store.js MOCK_INITIAL_PASSWORD)
ME, ME_ID = "한서윤", "hsy"      # the protagonist
ASKER = "pjh"                    # 박지호 asks her a question before the film starts (seeded, not recorded)
SESSION_KEY = "labsidian.session.demo"
# a real paper that is not in the demo set — looked up live from its arXiv id during the writing scene
NEW_PAPER_URL = "https://arxiv.org/abs/1709.04875"   # STGCN (Yu, Yin & Zhu, IJCAI 2018)
NEW_PAPER_KEY = "Spatio-Temporal Graph Convolutional Networks"

T0 = None
scenes = []       # timeline.json
cur = None        # the scene being recorded


# ------------------------------------------------------------------ timeline
class scene:
    """A kept segment of the raw video + its caption. Everything outside a scene is cut."""
    def __init__(self, id, chip="", ko="", en="", act=None, order=None, overlay=None, hero=0):
        self.d = dict(id=id, chip=chip, ko=ko, en=en, act=act, overlay=overlay, hero=hero, spots=[],
                      order=order if order is not None else len(scenes) + 1)
    def __enter__(self):
        global cur
        self.d["t0"] = now(); cur = self.d; return self
    def __exit__(self, *a):
        global cur
        self.d["t1"] = now(); cur = None
        for s in self.d["spots"]:
            s.setdefault("t1", self.d["t1"])
        scenes.append(self.d)
        print(f"  [{self.d['id']}] {self.d['t1'] - self.d['t0']:.1f}s")


def now(): return time.monotonic() - T0


# ------------------------------------------------------------------ setup (not recorded)
def setup(browser):
    ctx = browser.new_context(viewport={"width": W, "height": H}, locale="ko-KR")
    p = ctx.new_page()
    p.goto(SITE)
    p.evaluate("() => { localStorage.clear(); localStorage.setItem('lab.theme', 'dark'); localStorage.setItem('lab.lang', 'ko'); }")
    p.reload(); p.wait_for_function("window.Store && window.LAB")
    ids = p.evaluate("""async ([asker, me]) => {
      // seeded social activity (data/demo/social.json) is applied on first load; add one fresh question for 한서윤
      await Store.auth.demoSignIn(asker);
      const mine = LAB.reviews.filter(r => r.person === me);
      const rv = mine.find(r => /MGC-RNN/.test(LAB.papers.find(p => p.id === r.paper).title)) || mine[0];
      const c = await Store.comments.add({ reviewId: rv.id, parent: null, kind: "question",
        body: "@한서윤 multi-graph에서 그래프 종류별 기여도도 따로 보셨어요? 거리 그래프 하나만 써도 비슷하게 나올지 궁금해요." });
      await Store.auth.signOut();
      const sts = Store.studies.list();
      const open = sts.find(st => !st.closed && st.blind && st.members.includes(me)) || sts.find(st => !st.closed);
      const past = sts.find(st => st.closed && st.notes && st.members.includes(me)) || sts.find(st => st.closed);
      // a paper I share with others whose map neighbours include one I haven't read (→ "add to reading list")
      const unread = p => (p.nb || []).map(([id]) => LAB.papers.find(x => x.id === id)).find(x => x && !x.readers.includes(me));
      const cands = LAB.papers.filter(p => p.readers.includes(me) && p.readers.length > 1).sort((a, b) => b.readers.length - a.readers.length);
      const shared = cands.find(unread) || cands[0];
      const related = unread(shared);
      const dupTitle = LAB.papers.find(p => p.readers.length === 1 && !p.readers.includes(me) && /Large Language Models for Travel/.test(p.title))?.title
        || LAB.papers.find(p => p.readers.length === 1 && !p.readers.includes(me)).title;
      const c3 = LAB.clusters.find(c => c.level === "c" && /transit|대중교통/i.test((c.ko || "") + (c.en || ""))) || LAB.clusters[0];
      const f = LAB.clusters.filter(c => c.parent === c3.id).sort((a, b) => b.size - a.size)[0];
      return { review: rv.id, comment: c.id, study: open.id, past: past.id, shared: shared.id, related: related?.id,
               dupTitle, c3: c3.id, f: f?.id, people: LAB.people.map(p => p.id) };
    }""", [ASKER, ME_ID])
    state = ctx.storage_state()
    ctx.close()
    state["_ids"] = ids
    return state


# ------------------------------------------------------------------ helpers
class Film:
    def __init__(self, page):
        self.p = page
        self.mx, self.my = W / 2, H / 2

    def ev(self, js, arg=None): return self.p.evaluate(js, arg)
    def wait(self, s): self.p.wait_for_timeout(int(s * 1000))

    def spot(self, sel, label="", pad=8, hold=None):
        """Spotlight the element's current box (in the Remotion layer) from now until `hold` seconds or the scene end."""
        b = self.p.locator(sel).first.bounding_box()
        if not b or cur is None: return
        s = dict(t0=now(), x=b["x"] - pad, y=b["y"] - pad, w=b["width"] + 2 * pad, h=b["height"] + 2 * pad, label=label)
        if hold: s["t1"] = now() + hold
        cur["spots"].append(s)
    def spot_union(self, sel, label="", pad=8, hold=None):
        """Spotlight the box around every element matching `sel` (e.g. a list of rows)."""
        b = self.ev("""s => { const r = [...document.querySelectorAll(s)].map(e => e.getBoundingClientRect()).filter(r => r.width);
            if (!r.length) return null; const x = Math.min(...r.map(q => q.left)), y = Math.min(...r.map(q => q.top));
            return { x, y, width: Math.max(...r.map(q => q.right)) - x, height: Math.max(...r.map(q => q.bottom)) - y }; }""", sel)
        if not b or cur is None: return
        s = dict(t0=now(), x=b["x"] - pad, y=b["y"] - pad, w=b["width"] + 2 * pad, h=b["height"] + 2 * pad, label=label)
        if hold: s["t1"] = now() + hold
        cur["spots"].append(s)
    def unspot(self):
        if cur and cur["spots"] and "t1" not in cur["spots"][-1]: cur["spots"][-1]["t1"] = now()

    def move(self, x, y, dur=0.7):
        self.p.mouse.move(x, y, steps=max(6, int(dur * 30)))
        self.mx, self.my = x, y

    def center(self, sel):
        el = self.p.locator(sel).first
        el.scroll_into_view_if_needed()
        b = el.bounding_box()
        return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

    def click(self, sel, dur=0.6, pause=0.25):
        x, y = self.center(sel)
        self.move(x, y, dur); self.wait(pause)
        self.p.mouse.click(x, y)

    def type(self, text, delay=55): self.p.keyboard.type(text, delay=delay)

    def close_pops(self):  # a click outside popovers/menus, without risking a click on a graph node
        self.ev("document.querySelector('header.top').click()")

    def go(self, hash_, settle=0.8):
        self.ev("h => { location.hash = h; }", hash_); self.wait(settle)
        self.p.mouse.move(self.mx, self.my)

    def reload(self, hash_=None):
        if hash_:
            self.ev("h => { location.hash = h; }", hash_)
        self.p.reload(); self.p.wait_for_function("window.LabUI && window.__cur")
        self.wait(0.6); self.p.mouse.move(self.mx, self.my)

    def graph_ready(self, timeout=25):
        self.p.wait_for_function("window.LabGraph && LabGraph._r", timeout=timeout * 1000)
        self.p.wait_for_function("LabGraph.demo.settled()", timeout=timeout * 1000)

    def node(self, nid): return self.ev("id => LabGraph.demo.nodeXY(id)", nid)

    def scroll(self, dy, steps=6, x=None, y=None):
        if x is not None: self.move(x, y, 0.4)
        for _ in range(steps):
            self.p.mouse.wheel(0, dy / steps); self.wait(0.06)

    def as_user(self, uid, hash_):
        self.ev("([k, id]) => localStorage.setItem(k, id)", [SESSION_KEY, uid])
        self.reload(hash_)


def mcp_draft(user):
    """Ask the MCP server (as the member's own AI would) to create a diary draft."""
    code = r'''
import asyncio, os, sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
async def main():
    env = {**os.environ, "LABSIDIAN_USER": sys.argv[1], "LABSIDIAN_DATA": "data/demo", "LABSIDIAN_URL": "http://localhost:8766", "PYTHONIOENCODING": "utf-8"}
    async with stdio_client(StdioServerParameters(command=sys.executable, args=[sys.argv[2]], env=env)) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            res = await s.call_tool("create_draft", {
                "title": "UniST: A Prompt-Empowered Universal Model for Urban Spatio-Temporal Prediction", "authors": "Yuan Yuan, Jingtao Ding, Jie Feng, Depeng Jin, Yong Li",
                "venue": "KDD", "year": "2024", "link": "https://arxiv.org/abs/2402.11838", "rating": 4, "tags": ["d:forecast", "d:transit", "m:transformer"],
                "summary": "Problem: 도시·데이터마다 따로 학습하던 시공간 예측 모델을 하나로 쓸 수 있는가\nMethod: 여러 도시의 격자 시공간 데이터를 같은 토큰 형식으로 묶어 Transformer를 사전학습하고, 공간·시간 패턴을 담은 prompt를 붙여 새 도시·새 데이터에 맞춤\nResult: 20여 개 데이터셋에서 개별 학습 모델과 비슷하거나 더 좋고, 데이터가 적은 few-shot 상황에서 차이가 커짐",
                "memo": "격자 단위 데이터가 전제라 노선·역 단위 대중교통 수요에는 바로 못 씀. 역 네트워크를 격자로 바꾸거나 그래프 토큰을 넣는 변형이 필요함. 서울 교통카드 데이터로 few-shot 실험을 해볼 만함."})
            print(res.content[0].text if res.content else "")
asyncio.run(main())
'''
    out = subprocess.run([sys.executable, "-c", code, user, str(ROOT / "mcp" / "labsidian_mcp.py")], capture_output=True, text=True,
                         encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"}, timeout=120, cwd=str(ROOT))
    print("  mcp:", out.stdout.strip()[:120], out.stderr.strip()[-300:] if out.returncode else "")


# ------------------------------------------------------------------ the film
def film(page, ids):
    f = Film(page)
    page.goto(SITE)
    page.wait_for_function("window.Store && window.__cur")
    f.wait(0.5)

    # ================= Monday: what happened last week?
    with scene("login", "로그인", "아이디는 이름 하나 — 계정은 관리자가 만들어줘요", "Your name is your ID — accounts are issued by the admin",
               act=("월요일", "지난주에 무슨 일이 있었지?")):
        f.wait(2.2)
        f.click(".gate-pw summary"); f.wait(0.8)
        f.click('#login-form input[name="name"]'); f.type(ME, 90); f.wait(0.3)
        f.click('#login-form input[name="pw"]'); f.type(INIT_PW, 70); f.wait(0.4)
        page.keyboard.press("Enter")
        page.wait_for_function("window.LabMe && document.querySelector('#h-feed')"); f.wait(1.4)
    with scene("feed", "홈 피드", "새 다이어리만이 아니라 질문·답글·새로 열린 스터디까지, 한 피드에", "New diaries plus questions, replies and new studies — one feed"):
        f.move(700, 520, 0.6)
        f.spot(".feed-tabs", "전체 · 내 관심 분야 · 질문 · 함께 읽은 논문", hold=2.0); f.wait(2.2)
        f.scroll(520, 10, 700, 560); f.wait(1.0)
        # the first activity rows (someone asked / replied / opened a study) — show that the feed isn't only diaries
        f.ev("() => document.querySelector('#h-feed .feed-item.act')?.scrollIntoView({ block: 'center', behavior: 'smooth' })"); f.wait(1.2)
        f.spot("#h-feed .feed-item.act", "질문 · 답글 · 스터디 개설", hold=2.4); f.wait(2.6)
        f.scroll(360, 8, 700, 560); f.wait(1.2)
    with scene("bell", "알림", "내 리뷰에 온 질문, @멘션, 스터디 초대는 알림으로", "Questions on your reviews, mentions and study invites arrive as notifications"):
        f.scroll(-2000, 6, 700, 500); f.wait(0.4)
        f.click("#bell"); f.wait(0.8)
        f.spot(".menu-notif", hold=2.4); f.wait(2.8)
    with scene("reply", "댓글·답글", "답글은 그 자리에서 — @로 부르면 그 사람에게 알림이 가요", "Reply right there — @mention someone and they get notified"):
        f.click(f'.menu-notif .notif[data-comment="{ids["comment"]}"]'); f.wait(1.8)
        cm = f'#drawer .cm[data-cid="{ids["comment"]}"]'
        f.click(cm + ' [data-cact="reply"]'); f.wait(0.5)
        f.click(cm + " .cm-kids .cm-form textarea")
        f.type("@박지", 90); f.wait(0.6)
        f.click(cm + " .cm-kids .mention-pop [data-name]"); f.wait(0.2)
        f.type("님 네, ablation에 distance·correlation·adjacency 셋 다 있어요. 거리 그래프만 쓰면 MAE가 6% 정도 나빠졌어요.", 38); f.wait(0.4)
        f.click(cm + " .cm-kids .cm-form button.btn.primary"); f.wait(2.0)
    f.ev("LabUI.closeDrawer()")

    # ================= Tuesday: what should I read this week?
    f.go("#/graph", 0.5); f.graph_ready(); f.ev("LabGraph.demo.fit(0)"); f.wait(0.4)
    with scene("map", "지식 그래프", "연구실이 읽은 논문 전부가 한 장의 지도 — 비슷한 논문은 가까이 있어요", "Every paper the lab has read, on one map — similar papers sit close together",
               act=("화요일", "이번 주엔 뭘 읽지?"), hero=5):
        f.wait(2.4)
        f.move(960, 540, 0.8)
        f.ev("id => LabGraph.demo.zoomCluster(id, 0.32, 1800)", ids["c3"]); f.wait(2.4)
        if ids.get("f"):
            f.ev("id => LabGraph.demo.zoomCluster(id, 0.13, 1600)", ids["f"]); f.wait(2.6)
        f.ev("LabGraph.demo.fit(1400)"); f.wait(2.0)
    with scene("people", "사람 노드", "사람은 자기가 읽은 논문들 한가운데 — 누가 어느 분야에 있는지 보여요", "Each member sits among the papers they read — you see who works where", hero=4):
        xy = f.node("u:" + ME_ID); f.move(xy["x"], xy["y"], 0.9); f.wait(1.8)
        xy = f.node("u:pjh"); f.move(xy["x"], xy["y"], 0.8); f.wait(0.5)
        page.mouse.down(); f.move(xy["x"] + 150, xy["y"] - 90, 0.9); f.wait(0.3); page.mouse.up(); f.wait(1.2)
    with scene("overlap", "겹치는 관심사", "관심사가 겹치는 사람은 지도에서 바로 보여요", "Overlapping interests show up right on the map", hero=4):
        f.move(1500, 900, 0.5)
        f.click('#g-people .pl[data-id="yhn"]'); f.wait(0.5)
        f.click('#g-people .pl[data-id="prr"]'); f.wait(2.2)
        f.click("#people-clear"); f.wait(0.6)
    with scene("filters", "필터", "분야·방법론·학회·연도·별점으로 거르기", "Filter by field, method, venue, year, rating"):
        f.click("#tb-field"); f.wait(0.6)
        f.click('#pop-field .chip[data-id="d:forecast"]'); f.wait(0.5)
        f.close_pops(); f.wait(1.2)
        f.click("#tb-more"); f.wait(0.6)
        f.click('#f-rating button[data-v="4"]'); f.wait(0.5)
        f.close_pops(); f.wait(1.6)
        f.click("#tb-reset"); f.wait(0.6)
    with scene("local", "로컬 그래프", "한 편을 고르면 그 주변 — 읽은 사람, 비슷한 논문, 인용 관계", "Pick one paper and see its neighbourhood — readers, similar papers, citations"):
        xy = f.node(ids["shared"]); f.move(xy["x"], xy["y"], 0.9); f.wait(0.3)
        f.ev("id => LabGraph.select(id, { openDrawer: true, zoom: true })", ids["shared"]); f.wait(2.0)
        f.spot("#focus-bar", "깊이 1 · 2", hold=1.6)
        f.click('#focus-depth button[data-v="2"]'); f.wait(2.2)
    with scene("react", "반응 · 읽을 목록", "좋았던 리뷰엔 👍, 읽고 싶은 논문은 읽을 목록에", "👍 a review you liked; save a paper to your reading list"):
        f.scroll(700, 10, 1600, 600); f.wait(0.8)
        other = f.ev("([pid, me]) => LAB.papers.find(p => p.id === pid).reviews.map(r => LAB.reviews.find(x => x.id === r)).find(r => r.person !== me).id", [ids["shared"], ME_ID])
        f.click(f'#drawer .rv-foot[data-rid="{other}"] [data-act="like"]'); f.wait(1.0)
        if ids.get("related"):
            f.ev("id => document.querySelector(`#drawer .mini[data-open=\"paper:${id}\"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })", ids["related"]); f.wait(1.0)
            f.click(f'#drawer .mini[data-open="paper:{ids["related"]}"]'); f.wait(1.2)
            f.click("#drawer [data-reading]"); f.wait(1.8)
    f.ev("LabUI.closeDrawer(); LabGraph.select(null)")
    with scene("people_page", "사람", "연구실 전체가 어디를 읽는지, 그리고 사람마다 어디에 관심이 있는지", "What the whole lab reads, and what each member cares about"):
        f.go("#/people", 1.0)
        f.move(900, 400, 0.6)
        f.spot("#lab-bars", "연구실 전체 — 분야 · 방법론", hold=2.4); f.wait(2.6)
        f.ev("() => window.scrollTo({ top: document.querySelector('#people-grid').getBoundingClientRect().top + scrollY - 110, behavior: 'smooth' })"); f.wait(1.4)
        f.spot("#people-grid .person-card", "관심 분야 · 주별 작성 · 가장 비슷한 사람", hold=2.2); f.wait(2.6)
    with scene("person", "사람 상세", "사람별 관심 분야·방법론, 관심사가 비슷한 사람, 그 사람이 좋아할 만한 논문", "Per member: fields, methods, who thinks alike, and papers they'd like"):
        f.click('#people-grid .person-card[data-open="person:cmj"]'); f.wait(1.2)
        f.move(1600, 500, 0.5)
        f.spot_union("#drawer .stat-row, #drawer .bars", "읽은 논문 · 평균 별점 · 관심 분야", hold=1.8); f.wait(2.2)
        f.ev("() => { const h = [...document.querySelectorAll('#drawer h4')].find(h => h.textContent.includes('비슷')); const d = document.querySelector('#drawer'); d.scrollTo({ top: h.offsetTop - 120, behavior: 'smooth' }); }"); f.wait(1.2)
        f.spot_union("#drawer .sim-row", "관심사가 비슷한 사람 · 함께 읽은 논문", hold=2.2); f.wait(2.4)
    with scene("recs", "추천", "내 관심 분야에서 다른 사람이 읽은 것 중 가까운 논문부터", "Papers others read in your fields, closest to yours first"):
        f.ev("() => [...document.querySelectorAll('#drawer h4')].find(h => h.textContent.includes('추천'))?.scrollIntoView({ block: 'start', behavior: 'smooth' })")
        f.wait(1.2); f.wait(2.0)
    f.ev("LabUI.closeDrawer()")
    with scene("search", "논문 검색", "연구실 리뷰 전체를 검색 — 제목뿐 아니라 리뷰 본문까지", "Search everything the lab wrote — titles and the reviews themselves"):
        f.go("#/papers", 0.8)
        f.click("#p-search"); f.type("passenger flow", 70); f.wait(1.2)
        f.click("#paper-list .paper-row"); f.wait(1.4)
        f.scroll(600, 8, 1600, 600); f.wait(1.2)
    f.ev("LabUI.closeDrawer()")

    # ================= Thursday: read it, now write it
    with scene("dup", "다이어리 쓰기", "이미 읽은 사람이 있으면 알려줘요 — 그 리뷰부터 읽고 시작", "If someone already read it, you'll know — start from their review",
               act=("목요일", "읽었으니 쓰자")):
        f.go("#/write", 0.8); f.wait(1.6)
        f.click("#w-title"); f.type(ids["dupTitle"], 22); f.wait(1.0)   # exact title → "already read by …"
        f.spot("#w-dup", hold=2.4); f.wait(2.6)
        page.keyboard.press("Control+A"); page.keyboard.press("Delete"); f.wait(0.5)
    with scene("lookup", "서지 정보 자동", "링크 하나면 제목·저자·학회·초록은 자동", "Paste a link — title, authors, venue and abstract fill themselves"):
        f.click("#w-lookup"); f.type(NEW_PAPER_URL, 28); page.keyboard.press("Enter")
        page.wait_for_function("document.querySelector('#w-title').value.length > 5", timeout=25000); f.wait(0.8)
        f.spot("#w-form .row3", hold=2.2); f.wait(2.4)
    with scene("tags", "태그 · 별점 · 메모", "태그는 추천에서 고르고, 메모는 솔직하게", "Pick tags from the suggestions; be honest in the memo"):
        f.spot("#w-suggest", hold=1.6); f.wait(0.4)
        f.click("#w-suggest [data-add]"); f.wait(0.4)
        f.click("#w-suggest [data-add]"); f.wait(0.6)
        f.click('#w-stars button[data-v="4"]'); f.wait(0.4)
        f.click("#w-content"); f.type("Problem: 도로망 위 교통 속도·흐름을 수십 분 앞까지 예측\nMethod: 그래프 합성곱(공간) + 1D 게이트 합성곱(시간)을 번갈아 쌓은 완전 합성곱 구조, RNN 없음\nResult: PeMSD7·BJER4에서 LSTM·GRU 계열보다 정확하고 학습이 훨씬 빠름", 11)
        f.click("#w-memo"); f.type("그래프를 거리 기반으로 고정해서 쓰기 때문에 노선 환승처럼 거리와 무관한 연결은 못 담음. 대중교통에 쓰려면 인접행렬 설계가 핵심일 듯.", 13); f.wait(0.5)
        f.click("#w-form button.btn.primary"); f.wait(0.3)
    page.wait_for_function("location.hash.startsWith('#/me')", timeout=15000)
    f.reload("#/graph"); f.graph_ready()
    with scene("dot", "지도에 바로", "쓰는 순간 지도에 올라가요", "The moment you publish, it's on the map"):
        pid = f.ev("key => (LAB.papers.find(p => p.fresh && p.title.includes(key)) || LAB.papers.find(p => p.fresh)).id", NEW_PAPER_KEY)
        f.wait(0.6)
        f.ev("id => LabGraph.select(id, { zoom: true })", pid); f.wait(2.8)
    f.ev("LabGraph.select(null); LabUI.closeDrawer()")
    with scene("me", "내 페이지", "이번 학기 작성률과 캘린더, 기존 양식 docx로 내보내기", "This term's progress and calendar — export to the lab's .docx format"):
        f.go("#/me", 1.0)
        f.move(900, 400, 0.6); f.spot(".progress-card", hold=1.8); f.wait(2.0)
        x, y = f.center("#me-export"); f.move(x, y, 0.7); f.spot("#me-export", hold=1.4); f.wait(1.6)
        f.scroll(520, 8, 900, 600); f.wait(1.2)

    # ================= Friday: talk it through
    with scene("shared", "함께 읽은 논문", "같은 논문을 각자 어떻게 읽었는지 나란히", "The same paper, everyone's take, side by side",
               act=("금요일", "같이 이야기하기")):
        f.go("#/study?tab=shared", 0.8); f.wait(1.8)
        f.move(960, 600, 0.6)
        f.scroll(420, 8, 960, 600); f.wait(1.0)
        f.spot("#shared-list .shared-item .rev-cols", hold=2.0); f.wait(2.2)
    with scene("study", "논문 스터디", "스터디 전까지 질문은 블라인드 — 먼저 생각하고 모여요", "Before the meeting, write first and read later — think before you gather"):
        f.go("#/study?tab=open", 0.8); f.wait(1.0)   # the list remembers the last tab (shared) without ?tab
        f.click(f'.st-card[href="#/study/{ids["study"]}"]'); f.wait(1.6)
        f.spot(".st-todo", "모임 준비 체크리스트", hold=1.8); f.wait(2.0)
        f.click('.st-tabs a[href$="tab=diary"]'); f.wait(1.0)
        f.spot(".blind-on", hold=2.0); f.wait(2.2)
    with scene("question", "질문 보드", "궁금한 점을 미리 올리고 👍로 투표 — 많이 받은 순서로 이야기해요", "Post questions ahead, vote with 👍 — the most-voted go first"):
        f.click('.st-tabs a[href$="tab=prep"]'); f.wait(1.0)
        f.click("#st-q"); f.type("취소된 요청을 다음 round로 미루는 규칙이 수요가 몰리는 시간대에도 유지되는지 궁금해요", 38); f.wait(0.3)
        f.click("#st-q-form button"); f.wait(1.2)
        f.spot(".st-qs .st-q", hold=1.6); f.wait(1.8)
    with scene("notes", "정리 노트", "끝난 스터디는 정리 노트로 남아요 — 결론, 남은 질문, 다음에 읽을 논문", "Finished studies keep their notes — conclusions, open questions, what to read next"):
        f.go(f"#/study/{ids['past']}?tab=notes", 1.2)
        f.move(900, 600, 0.6)
        f.spot(".st-notes-view", hold=2.4); f.wait(2.6)
        f.scroll(360, 6, 900, 600); f.wait(1.0)

    # ================= and: with your own AI
    page.goto((VID / "terminal.html").as_uri())
    page.wait_for_function("window.play && window.__cur")
    with scene("mcp", "내 AI 연결 (MCP)", "내 Claude·Codex를 연결하면, 연구실 리뷰를 근거로 답해요", "Connect your own Claude or Codex — it answers from the lab's reviews",
               act=("그리고", "내 AI와 함께")):
        f.wait(1.8)
        page.evaluate("play()")
        f.wait(3.5)
    page.goto(SITE + "/#/home")
    page.wait_for_function("window.LabUI && window.__cur")
    mcp_draft(ME)
    page.wait_for_function("Store.drafts.mcp().length > 0", timeout=30000); f.wait(0.6)
    with scene("draft", "AI 초안", "AI는 초안까지만 — 읽고 고치고, 게시는 내가", "The AI only drafts — you read, edit and publish"):
        f.click("#bell"); f.wait(1.2)
        f.click('.menu-notif .notif[data-draft]:not([data-draft=""])'); f.wait(1.4)
        f.spot(".restored.mcp", hold=2.0); f.wait(2.2)
        f.scroll(520, 8, 760, 600); f.wait(1.6)
    f.ev("() => Store.drafts.clear()")

    # ================= ending
    f.reload("#/graph"); f.graph_ready(); f.ev("LabGraph.demo.fit(0)")
    with scene("timelapse", "타임랩스", "매주 쓰는 다이어리가 한 학기 뒤엔 이렇게", "A weekly diary, one term later"):
        f.click("#tb-settings"); f.wait(0.5)
        f.click("label:has(#l-timeline)"); f.wait(0.3)
        f.close_pops(); f.wait(0.4)
        f.ev("""() => new Promise(done => {
            const r = document.querySelector('#t-range'); let i = 0; const n = +r.max;
            r.value = 0; r.dispatchEvent(new Event('input'));
            const iv = setInterval(() => { i = Math.min(n, i + 2); r.value = i; r.dispatchEvent(new Event('input')); if (i >= n) { clearInterval(iv); done(); } }, 60);
        })""")
        f.wait(1.0)
    f.ev("() => localStorage.setItem('lab.lang', 'en')"); f.reload("#/home")
    with scene("en", "English", "English UI too", "한국어 / English"):
        f.move(700, 520, 0.6); f.wait(1.6)
    f.ev("() => { localStorage.setItem('lab.lang', 'ko'); localStorage.setItem('lab.theme', 'light'); }"); f.reload("#/graph"); f.graph_ready()
    with scene("light", "라이트 테마", "라이트 테마도", "Light theme too"):
        f.wait(1.8)
    f.ev("() => localStorage.setItem('lab.theme', 'dark')"); f.reload("#/graph"); f.graph_ready(); f.ev("LabGraph.demo.fit(0)"); f.wait(0.5)
    with scene("final", "", "", "", overlay="ending", order=999):
        f.wait(5.0)
    # the opening is recorded last (needs a signed-in graph) and placed first by `order`
    f.ev("LabGraph.demo.scatter(640)"); f.wait(0.2)
    with scene("opening", "", "", "", overlay="opening", order=0, hero=0):
        f.wait(2.4)
        f.ev("LabGraph.demo.fit(1500)")
        f.wait(3.2)


# ------------------------------------------------------------------ main
def main():
    global T0
    RAW.mkdir(parents=True, exist_ok=True); PUB.mkdir(parents=True, exist_ok=True)
    for x in RAW.glob("*.webm"):
        x.unlink()
    # drafts queued by a previous run's MCP scene would otherwise show up on Monday morning
    (ROOT / "data" / "demo" / "mcp_outbox.json").write_text("[]", encoding="utf-8")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"])
        state = setup(browser)
        ids = state.pop("_ids"); print("  ids:", json.dumps(ids, ensure_ascii=False))
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, storage_state=state,
                                  record_video_dir=str(RAW), record_video_size={"width": W, "height": H}, locale="ko-KR")
        ctx.add_init_script(path=str(VID / "cursor.js"))
        page = ctx.new_page()
        T0 = time.monotonic()
        try:
            film(page, ids)
        finally:
            video = page.video.path()
            ctx.close(); browser.close()
    scenes.sort(key=lambda s: s["order"])
    (PUB / "timeline.json").write_text(json.dumps({"fps": 30, "width": W, "height": H, "video": "raw.mp4", "scenes": scenes}, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(s["t1"] - s["t0"] for s in scenes)
    print(f"{len(scenes)} scenes, {total:.1f}s kept → {PUB / 'timeline.json'}")
    # Remotion seeks a lot: an h264 mp4 with frequent keyframes is far faster than the vp8 webm
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-r", "30", "-g", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "16",
                    "-pix_fmt", "yuv420p", "-an", str(PUB / "raw.mp4")], check=True)
    print("→", PUB / "raw.mp4")


if __name__ == "__main__":
    main()
