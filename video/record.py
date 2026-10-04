"""Record the Labsidian demo film (fake demo lab, video/STORYBOARD.md) → video/raw/frames + video/remotion/public/{raw.mp4, timeline.json}

    python scripts/serve.py 8766 --demo          # demo site must be up
    .venv/Scripts/python video/record.py         # (THEME=light for the light version) records the screen (2880×1800) and a timeline: kept segments, captions,
                                                 # chapters, camera targets, cursor path, clicks, overlays
    cd video/remotion && npm run render          # Remotion: macOS window, camera, cursor, captions → out/labsidian_demo.mp4

The story follows one paper (Bike Flow Prediction with Multi-Graph Convolutional Networks) through 한서윤's research loop:
find → read → write → share → read together → look back. Everything is the fake demo dataset; no real member appears.

Capture: Chrome's screencast at device scale 2 (Playwright's own video is VP8 at 1 Mbps — too soft to zoom into).
The page shows no cursor; Remotion draws one from the logged mouse path. Captions and camera live in timeline.json,
so wording and framing can change without recording again. Runs in a throwaway browser profile.
"""
import base64
import json
import math
import os
import random
import shutil
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
VID = ROOT / "video"
RAW, PUB = VID / "raw", VID / "remotion" / "public"
FRAMES = RAW / "frames"
SITE = "http://localhost:8766"
W, H = 1440, 900                 # CSS viewport; captured at 2× (2880×1800)
FPS = 30
THEME = os.environ.get("THEME", "dark")   # dark | light — the site's theme; Remotion's frame follows it (timeline.json)
ME = "hsy"                       # 한서윤 — the protagonist
FRIEND = "yhn"                   # 윤하늘 — read the paper first, asks a question
SHARED = "p54"                   # LLGformer — read by 최민재, 한서윤, Priya Raman
PAPER = "p29"                    # Bike Flow Prediction with Multi-Graph Convolutional Networks
NEAR = "p12"                     # her metro-ridership paper whose similar list has p29
GUIDE = "g_demo_forecast"        # 「교통 예측 입문」 reading group
DCRNN = "https://arxiv.org/abs/1707.01926"
random.seed(7)

T0 = None
TL = dict(keep=[], caps=[], chips=[], chapters=[], cam=[], mouse=[], clicks=[], overlays=[])
_cap = None


def now(): return time.time() - T0


# ------------------------------------------------------------------ timeline marks
_k = None
SPEED = 1.25     # ordinary footage plays a touch faster than life; typing segments use keep(2..3) and show a ⏩ badge


@contextmanager
def keep(speed=SPEED):
    """Everything outside a keep() is cut."""
    global _k
    _k = dict(t0=now(), speed=speed)
    yield
    _close()


def _close():
    global _k
    if _k: _k["t1"] = now(); TL["keep"].append(_k); _k = None


@contextmanager
def offcam():
    """Cut a wait (loading, lookups) out of the current keep()."""
    global _k
    sp = _k["speed"] if _k else None
    _close()
    yield
    if sp: _k = dict(t0=now(), speed=sp)


def cap(text=None):
    """Start a caption (closes the previous one). cap() just closes."""
    global _cap
    if _cap: _cap["t1"] = now(); TL["caps"].append(_cap); _cap = None
    if text: _cap = dict(t0=now(), text=text)


def chip(text, dur=2.5): TL["chips"].append(dict(t0=now(), t1=now() + dur, text=text))
def chapter(n): TL["chapters"].append(dict(t=now(), n=n))
def overlay(kind, t0, t1): TL["overlays"].append(dict(kind=kind, t0=t0, t1=t1))


class Film:
    def __init__(self, page):
        self.p = page
        self.mx, self.my = W * 0.62, H * 0.55

    # ---- small helpers
    def ev(self, js, arg=None): return self.p.evaluate(js, arg)
    def wait(self, s): self.p.wait_for_timeout(int(s * 1000))
    def loc(self, sel, text=None):
        l = self.p.locator(sel)
        return (l.filter(has_text=text) if text else l).first

    def box(self, target, text=None):
        if isinstance(target, dict): return target
        l = target if not isinstance(target, str) else self.loc(target, text)
        l.wait_for(state="visible", timeout=15000)
        b = l.bounding_box()
        return dict(x=b["x"], y=b["y"], w=b["width"], h=b["height"])

    # ---- camera: Remotion eases the view onto this box (CSS px of the page); zoom 1 = the whole window
    def cam(self, target=None, text=None, pad=24, zoom=None):
        if target is None:
            TL["cam"].append(dict(t=now(), reset=True)); return
        b = self.box(target, text)
        TL["cam"].append(dict(t=now(), x=b["x"] - pad, y=b["y"] - pad, w=b["w"] + 2 * pad, h=b["h"] + 2 * pad, zoom=zoom))

    # ---- a human-ish mouse: curved path, ease in/out, settle before clicking
    def move(self, x, y, dur=None):
        x0, y0 = self.mx, self.my
        d = math.hypot(x - x0, y - y0)
        if d < 1: return
        dur = dur or min(0.8, 0.22 + d / 2400)
        nx, ny = -(y - y0) / d, (x - x0) / d                  # bend the path a little to one side
        bend = random.uniform(-0.12, 0.12) * d
        cx, cy = (x0 + x) / 2 + nx * bend, (y0 + y) / 2 + ny * bend
        start = time.time(); n = max(8, int(dur * 60))
        for i in range(1, n + 1):
            s = i / n; e = s * s * (3 - 2 * s)
            px = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cx + e * e * x
            py = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cy + e * e * y
            self.p.mouse.move(px, py)
            TL["mouse"].append([round(now(), 3), round(px, 1), round(py, 1)])
            lag = start + dur * s - time.time()
            if lag > 0: time.sleep(lag)
        self.mx, self.my = x, y

    def at(self, target, text=None, dx=0.5, dy=0.5):
        if isinstance(target, str) or not isinstance(target, dict):
            l = target if not isinstance(target, str) else self.loc(target, text)
            l.wait_for(state="visible", timeout=15000)
            l.scroll_into_view_if_needed()
            self.wait(0.15)
        b = self.box(target, text)
        return b["x"] + b["w"] * dx, b["y"] + b["h"] * dy

    def hover(self, target, text=None, settle=0.25):
        x, y = self.at(target, text)
        self.move(x, y); self.wait(settle)

    def click(self, target, text=None, settle=0.2, after=0.35):
        x, y = self.at(target, text)
        self.move(x, y); self.wait(settle)
        TL["clicks"].append([round(now(), 3), round(x, 1), round(y, 1)])
        self.p.mouse.down(); self.wait(0.07); self.p.mouse.up()
        self.wait(after)

    def type(self, text, lo=0.045, hi=0.12):
        for ch in text:
            self.p.keyboard.type(ch)
            time.sleep(random.uniform(lo, hi) * (1.8 if ch == " " else 1))

    def paste(self, text):
        self.p.keyboard.insert_text(text)

    def wheel_to(self, target, text=None, where=0.42):
        """Scroll with the wheel (under the mouse) until the element sits around `where` of the viewport height."""
        l = self.loc(target, text) if isinstance(target, str) else target
        l.wait_for(state="attached", timeout=15000)
        for _ in range(40):
            b = l.bounding_box()
            if not b: break
            dy = b["y"] + b["height"] / 2 - H * where
            if abs(dy) < 40: break
            self.p.mouse.wheel(0, max(-160, min(160, dy)))
            self.wait(0.05)
        self.wait(0.35)

    def nav(self, view):
        self.click(f'#nav a[data-view="{view}"]', after=0.9)

    def blank(self):   # a click on an empty spot of the top bar closes popovers and menus
        self.click({"x": 760, "y": 18, "w": 40, "h": 10}, after=0.4)

    def graph_ready(self, timeout=30):
        self.p.wait_for_function("window.LabGraph && LabGraph._r && LabGraph.demo.settled()", timeout=timeout * 1000)

    def node(self, nid):
        xy = self.ev("id => LabGraph.demo.nodeXY(id)", nid)
        return dict(x=xy["x"] - 6, y=xy["y"] - 6, w=12, h=12)


# ------------------------------------------------------------------ setup (not recorded)
def setup(browser):
    ctx = browser.new_context(viewport={"width": W, "height": H}, locale="ko-KR")
    p = ctx.new_page()
    p.goto(SITE); p.wait_for_function("window.Store && window.LAB")
    # the demo server keeps its data (data/demo/labsidian.db): reset it so every take starts from the seeded lab, dated today
    p.evaluate("async () => { await Store.auth.demoSignIn('admin'); await Store.admin.reset(); }")
    p.evaluate("""([me, theme]) => { localStorage.clear(); localStorage.setItem('lab.theme', theme); localStorage.setItem('lab.lang', 'ko');
                         localStorage.setItem('labsidian.session.demo', me); }""", [ME, THEME])
    p.reload(); p.wait_for_function("window.Store && window.LAB && window.LabMe")
    state = ctx.storage_state()
    ctx.close()
    return state


def as_member(browser, uid, js, arg=None):
    """Do something as another member, off camera (their own context; the filmed page picks it up by polling)."""
    ctx = browser.new_context(viewport={"width": W, "height": H}, locale="ko-KR")
    ctx.add_init_script(f"localStorage.setItem('labsidian.session.demo', '{uid}'); localStorage.setItem('lab.lang', 'ko');")
    p = ctx.new_page(); p.goto(SITE + "/#/home"); p.wait_for_function("window.Store && window.LAB && window.LabMe")
    out = p.evaluate(js, arg)
    p.wait_for_timeout(400); ctx.close()
    return out


def mcp_draft():
    """What her own AI does: create a diary draft through the MCP server (the terminal on screen is drawn by Remotion)."""
    code = r'''
import asyncio, os, sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
async def main():
    env = {**os.environ, "LABSIDIAN_USER": sys.argv[1], "LABSIDIAN_URL": "http://localhost:8766", "PYTHONIOENCODING": "utf-8"}
    async with stdio_client(StdioServerParameters(command=sys.executable, args=[sys.argv[2]], env=env)) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            res = await s.call_tool("create_draft", {
                "title": "Diffusion Convolutional Recurrent Neural Network: Data-Driven Traffic Forecasting",
                "authors": "Yaguang Li, Rose Yu, Cyrus Shahabi, Yan Liu", "venue": "ICLR", "year": "2018",
                "link": "https://arxiv.org/abs/1707.01926", "rating": 4, "tags": ["d:forecast", "m:gnn"],
                "summary": "Problem: 도로망 센서의 교통 속도를 최대 1시간 앞까지 예측\nMethod: 도로 그래프 위의 확산(diffusion) 합성곱을 GRU 안에 넣고, encoder-decoder와 scheduled sampling으로 여러 시점을 한 번에 예측\nResult: METR-LA·PEMS-BAY에서 기존 방법보다 오차 12~15% 감소, 예측 구간이 길수록 차이가 커짐",
                "memo": "그래프가 방향을 가진다는 점(상류·하류)을 모델에 직접 넣은 게 핵심. 지하철은 노선 방향이 분명해서 역 단위 승객 흐름에도 잘 맞을 듯. 다만 그래프가 고정이라 환승 패턴 변화는 못 담음."})
            print(res.content[0].text if res.content else "")
asyncio.run(main())
'''
    out = subprocess.run([sys.executable, "-c", code, ME, str(ROOT / "mcp" / "labsidian_mcp.py")], capture_output=True, text=True,
                         encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"}, timeout=120, cwd=str(ROOT))
    print("  mcp:", out.stdout.strip()[:100], out.stderr.strip()[-300:] if out.returncode else "")


def pdf_file():
    """A stand-in PDF for the paper (only its name shows on screen)."""
    f = RAW / "Bike Flow Prediction with Multi-Graph Convolutional Networks.pdf"
    body = b"BT /F1 18 Tf 72 720 Td (Bike Flow Prediction with Multi-Graph Convolutional Networks) Tj ET"
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>stream\n" % len(body) + body + b"\nendstream", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    x = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offs)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x)
    f.write_bytes(out)
    return f


# ------------------------------------------------------------------ the film
def film(f, browser):
    p = f.p
    # ================= intro: the logo, then the lab's map gathers itself behind it
    f.graph_ready()
    f.ev("LabGraph.demo.fit(0)")
    f.wait(0.6)
    with keep():
        chapter(0)
        t = now()
        f.ev("LabGraph.demo.scatter(700)")
        f.wait(3.4)
        overlay("intro", t, now())
        cap("연구실 멤버들은 논문을 읽을 때마다 짧은 다이어리를 써요")
        f.wait(3.4)
        cap("Labsidian은 그 다이어리를 연구실의 지도로 만들어요")
        f.wait(3.6)
        cap()

    # ================= ⓪ 지도 — the graph itself
    with keep():
        chapter(1)
        # the map fills the frame: the film's camera moves in past the toolbar and legend
        mapbox = f.ev("""() => { const r = LabGraph._r, g = r.getGraph(), c = document.querySelector('#graph').getBoundingClientRect();
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            g.forEachNode((n, a) => { const v = r.graphToViewport(a); x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); });
            return { x: x0 + c.left, y: y0 + c.top, w: x1 - x0, h: y1 - y0 }; }""")
        on_map = lambda: f.cam(mapbox, pad=0, zoom=1.3)
        on_map()
        cap("비슷한 논문끼리 모여 영역이 돼요")
        lab = f.box("#cluster-labels .cl.coarse", "대중교통·철도")
        f.move(lab["x"] + lab["w"] / 2, lab["y"] + lab["h"] + 40, 0.9)
        f.wait(1.6)
        cap("다가가면 세부 주제와 논문 제목까지")
        cid = lambda name: f.ev("n => LAB.clusters.find(c => c.level === 'c' && (c.ko || '').includes(n)).id", name)
        f.ev("([id]) => LabGraph.demo.zoomCluster(id, 0.36, 2600)", [cid("대중교통")]); f.wait(3.4)
        f.ev("([id]) => LabGraph.demo.zoomCluster(id, 0.36, 3000)", [cid("교통 예측")]); f.wait(3.4)
        f.ev("LabGraph.demo.fit(2200)"); f.wait(2.6)
        cap("사람은 자기가 읽은 논문들 한가운데에 놓여요")
        f.hover(f.node("u:" + ME), settle=2.4)
        cap("가까이 있을수록 관심사가 비슷해요")
        f.hover(f.node("u:kdy"), settle=1.8)
        f.hover(f.node("u:pjh"), settle=1.8)
        cap("여럿이 읽은 논문엔 테두리 — 올리면 읽은 사람이 이어져요")
        ids = [SHARED, "u:cmj", "u:" + ME, "u:prr"]
        xs = [f.ev("id => LabGraph.demo.nodeXY(id)", i) for i in ids]
        x0, y0 = min(q["x"] for q in xs), min(q["y"] for q in xs)
        f.cam({"x": x0, "y": y0, "w": max(q["x"] for q in xs) - x0, "h": max(q["y"] for q in xs) - y0}, pad=110)
        f.hover(f.node(SHARED), settle=2.8)
        on_map()
        cap("누르면 그 사람의 지도 — 연구 지형과 비슷한 사람까지")
        f.click(f.node("u:" + ME), after=2.0)
        f.cam("#drawer", pad=0)
        b = f.box("#drawer")
        f.move(b["x"] + b["w"] * 0.5, b["y"] + b["h"] * 0.55, 0.6)
        for _ in range(4):
            f.p.mouse.wheel(0, 160); f.wait(0.12)
        f.wait(2.2)
        f.cam()
        cap("논문을 누르면 읽은 사람들이, 한 단계 더 가면 그들이 읽은 논문이")
        f.click(f.node(SHARED), after=1.8)
        if f.p.locator("#focus-depth").count():
            f.click('#focus-depth button[data-v="2"]', after=2.4)
            f.click("#focus-clear", after=0.6)
        f.click("#drawer-close", after=0.5)
        f.cam({"x": 0, "y": 360, "w": 900, "h": 540})
        cap("두 사람을 고르면 겹치는 관심사가 보여요")
        f.click(f'#g-people .pl[data-id="{ME}"]', after=0.4)
        f.click('#g-people .pl[data-id="kdy"]', after=2.4)
        f.click("#people-clear", after=0.6)
        f.cam()
        cap()

    # ================= ① 찾기
    with keep():
        chapter(2)
        cap("분야·학회·연도로 거를 수도 있어요")
        f.click("#tb-field", after=0.5)
        f.cam("#g-toolbar", pad=30)
        f.click('#pop-field .ui-chip[data-id="d:forecast"]', after=0.6)
        f.blank()
        f.cam()
        f.wait(1.4)
        f.click("#tb-reset", after=0.6)
        cap("비슷한 논문은 가까이 — 확대하면 세부 주제가 보여요")
        f.click("#cluster-labels .cl.coarse", "대중교통·철도", after=2.4)
        if f.p.locator("#drawer.open").count():
            f.wait(0.6); f.click("#drawer-close", after=0.5)
        cap("내가 읽은 논문 바로 옆, 아직 안 읽은 논문")
        f.click(f.node(NEAR), after=1.3)
        f.hover("#drawer h2", settle=0.6)
        row = f'#drawer .ui-row.mini[data-open="paper:{PAPER}"]'
        f.wheel_to(row)
        f.cam(row, pad=60)
        f.hover(row, settle=1.4)
        cap("누가 읽었는지, 주변에 뭐가 있는지 한눈에")
        f.click(row, after=1.0)
        f.cam()
        f.click("#drawer [data-graph]", after=1.6)
        if not f.p.locator("#drawer.open").count():
            f.click(f.node(PAPER), after=1.0)
        if f.p.locator("#focus-depth").count():
            f.click('#focus-depth button[data-v="2"]', after=2.0)
        cap("읽고 싶은 논문은 읽을 목록에")
        f.cam(f'#drawer button[data-reading="{PAPER}"]', pad=80)
        f.click(f'#drawer button[data-reading="{PAPER}"]', after=2.6)
        f.cam()
        cap()

    # ================= ② 읽기
    with keep():
        chapter(3)
        f.click("#drawer-close", after=0.4)
        f.click("#user-btn", after=0.5)
        f.click('.menu-user a[href="#/reading"]', after=1.0)
        item = f.p.locator(".rl-item").filter(has_text="Bike Flow").first
        f.cam(item, pad=20)
        f.wait(0.8)
        f.click(item.locator('[data-act="reading"]'), after=1.0)
        cap("읽기 전에, 먼저 읽은 동료의 다이어리부터")
        item = f.p.locator(".rl-item").filter(has_text="Bike Flow").first
        f.cam(item, pad=20)
        att = item.locator('label:has(input[data-act="attach"]), [data-act="attach"]').first
        x, y = f.at(att); f.move(x, y); f.wait(0.3)
        with f.p.expect_file_chooser() as fc:
            TL["clicks"].append([round(now(), 3), round(x, 1), round(y, 1)])
            att.click()
        fc.value.set_files(str(pdf_file()))
        f.wait(1.0)
        f.click(item.locator(".rl-title [data-open]"), after=1.4)
        memo = "#drawer .review .rv-memo"
        f.wheel_to(memo, where=0.5)
        f.cam(f.p.locator("#drawer .review").first, pad=16)
        b = f.box(f.p.locator("#drawer .review .rv-body").first)
        f.move(b["x"] - 14, b["y"] + 8, 0.6)
        f.move(b["x"] - 14, b["y"] + b["h"] - 8, 1.5)
        f.cam(memo, pad=40)
        f.hover(memo, settle=2.0)
        f.cam()
        f.click("#drawer-close", after=0.5)
        cap("링크 하나면 정보는 알아서 채워져요")
        f.click("#rl-input", after=0.3)
        f.paste(DCRNN); f.wait(0.5)
        f.cam("#rl-form", pad=30)
        f.click("#rl-form button.ui-btn.prominent", after=0.2)
        with offcam(): f.p.locator(".rl-item").filter(has_text="Diffusion").first.wait_for(timeout=30000)
        f.wait(0.6)
        f.cam(f.p.locator(".rl-item").filter(has_text="Diffusion").first, pad=20)
        f.wait(1.6)
        cap("읽는 중부터 다 읽음까지 한 목록에")
        item = f.p.locator(".rl-item").filter(has_text="Bike Flow").first
        f.cam(item, pad=20)
        f.click(item.locator('[data-act="read"]'), after=2.6)
        f.cam()
        cap()

    # ================= ③ 쓰기
    with keep():
        chapter(4)
        item = f.p.locator(".rl-item").filter(has_text="Bike Flow").first
        f.click(item.locator('a[href^="#/write?reading="]'), after=1.2)
        cap("논문 정보와 PDF는 이미 채워져 있어요")
        f.cam("#w-form", pad=10)
        f.hover("#w-title", settle=0.5)
        f.hover("#w-authors", settle=0.6)
        f.cam("#w-dup", pad=50)
        f.hover("#w-dup", settle=1.8)
        f.cam()
        cap("요약은 Problem·Method·Result, 메모엔 내 생각")
        f.click('#w-stars button[data-v="4"]', after=0.4)
        f.click("#w-content", after=0.2)
        f.cam("#w-content", pad=60)
        f.type("Problem: 공유자전거 대여소별 대여·반납량을 다음 시간대까지 예측")
    with keep(3):
        f.type("\nMethod: 거리·이용 상관·OD 흐름 그래프를 따로 만들고 multi-graph convolution으로 합친 뒤 encoder-decoder로 예측\nResult: NYC·Chicago 데이터에서 기존 모델보다 오차 17~25% 감소", 0.02, 0.05)
        f.click("#w-memo", after=0.2)
        f.cam("#w-memo", pad=60)
        f.type("그래프를 여러 개 겹치는 방식은 지하철 역 단위 승객 흐름에도 바로 쓸 수 있을 듯. MGC-RNN과 거의 같은 발상이라 같은 데이터로 비교해보고 싶음.", 0.02, 0.05)
    with keep():
        cap("태그는 추천에서 골라요")
        f.cam("#w-suggest", pad=60)
        for _ in range(2):
            if f.p.locator("#w-suggest [data-add]").count(): f.click("#w-suggest [data-add]", after=0.5)
        f.wait(0.6)
        f.cam()
        f.click("#w-form .form-foot button.ui-btn.prominent", after=0.2)
        with offcam(): f.p.wait_for_function("location.hash.startsWith('#/me')", timeout=15000); f.wait(0.6)
        f.wait(0.6)
        f.nav("graph")
        with offcam(): f.graph_ready(); f.wait(0.3)
        cap("게시하는 순간 지도에 — 이제 둘이 함께 읽은 논문이에요")
        f.click("#g-find", after=0.2)
        f.type("Bike Flow")
        f.wait(0.6); f.p.keyboard.press("Enter")
        f.wait(2.8)
        cap()
    # her own AI — a terminal window (drawn by Remotion) while the real MCP call runs
    f.click("#drawer-close", after=0.3)
    with keep():
        cap("다음 논문은 내 AI에게 초안을 맡겨요")
        t = now()
        f.wait(1.0)
        mcp_draft()
        f.wait(max(0.0, 6.5 - (now() - t)))
        overlay("terminal", t, now())
        with offcam(): f.p.wait_for_function("Store.drafts.mcp().length > 0", timeout=30000)
        f.wait(1.2)
        f.click("#bell", after=0.8)
        f.click('.menu-notif .notif[data-draft]:not([data-draft=""])', after=1.4)
        cap("읽고 고쳐서 게시하는 건 나")
        f.cam("#w-form .ui-notice.info:not([hidden])", pad=60)
        f.wait(3.2)
        f.cam()
        cap()

    # ================= ④ 나누기 — 윤하늘 asks about her diary (off camera)
    cid = as_member(browser, FRIEND, """async ([me, pid]) => {
        const rv = LAB.reviews.find(r => r.person === me && r.paper === pid) || Object.values(LabUI.R || {}).find(r => r.person === me && r.paper === pid);
        const c = await Store.comments.add({ reviewId: rv.id, parent: null, kind: "question",
          body: "@한서윤 서윤님은 4점 주셨네요! 지하철역 단위로 바꿔도 multi-graph 효과가 비슷할까요?" });
        return c.id; }""", [ME, PAPER])
    print("  question:", cid)
    try: f.p.wait_for_function("document.querySelector('#bell .ui-badge')", timeout=20000)
    except Exception: print("  (no bell badge yet)")
    with keep():
        chapter(5)
        chip("다음 날")
        f.nav("home")
        cap("홈에선 연구실 소식이 한 흐름으로 — 다이어리, 질문, 답글, 새 스터디")
        f.wait(0.6)
        f.cam("#h-feed .feed-item.act", pad=24)
        f.hover("#h-feed .feed-item.act", settle=1.6)
        f.cam()
        f.move(W * 0.4, H * 0.6, 0.5)
        for _ in range(8):
            f.p.mouse.wheel(0, 140); f.wait(0.16)
        f.wait(0.8)
        cap("오른쪽엔 이번 주 작성 현황과 다가오는 스터디")
        f.cam(".home-side", pad=10)
        f.hover(".compose-row", settle=1.0)
        f.hover(".side-st", settle=1.2)
        f.cam()
        cap("질문만, 내 관심 분야만 골라 볼 수도 있어요")
        f.move(W * 0.4, H * 0.5, 0.4)
        for _ in range(8):
            f.p.mouse.wheel(0, -200); f.wait(0.08)
        f.click('.feed-tabs a[data-tab="q"]', after=1.6)
        f.click('.feed-tabs a[data-tab="mine"]', after=1.6)
        f.click('.feed-tabs a[data-tab="all"]', after=0.8)
        cap("내 다이어리에 질문이 오면 알림으로")
        f.click("#bell", after=0.8)
        f.click(f'.menu-notif .notif[data-comment="{cid}"]', after=1.8)
        cm = f'#drawer .cm[data-cid="{cid}"]'
        f.cam(cm, pad=40)
        f.wait(1.4)
        cap("답은 그 자리에서 — @로 부르면 알림이 가요")
        f.click(cm + ' [data-cact="reply"]', after=0.4)
        f.click(cm + " .cm-kids .cm-form textarea", after=0.2)
        f.cam(cm, pad=40)
        f.type("@윤"); f.wait(0.6)
        f.click(cm + " .cm-kids .mention-pop [data-name]", after=0.2)
    with keep(2):
        f.type("네, 역 단위로도 그대로 만들 수 있어요. 다만 환승 연결 때문에 노선 그래프를 하나 더 넣어야 할 것 같아요.", 0.025, 0.06)
    with keep():
        f.click(cm + " .cm-kids .cm-form button.ui-btn.prominent", after=1.4)
        f.cam()
        f.click("#drawer-close", after=0.3)
        f.nav("study")
        f.click('.page-tabs a[href="#/study?tab=shared"]', after=0.6)
        cap("같은 논문, 서로 다른 시각을 나란히")
        item = f.p.locator("#shared-list .shared-item").filter(has_text="Bike Flow").first
        f.move(W * 0.5, H * 0.6, 0.4)
        f.wheel_to(item, where=0.45)
        f.cam(item, pad=10)
        f.wait(3.0)
        f.cam()
        cap()

    # ================= ⑤ 함께 읽기
    with keep():
        chapter(6)
        f.nav("papers")
        f.click(".papers-tabs a[href='#/guides']", after=0.9)
        f.click(".gd-card", "교통 예측 입문", after=1.2)
        cap("연구실이 함께 모으는 핵심 논문과 정기 모임")
        f.cam(".gd-group", pad=20)
        f.hover(".gd-rounds li.next", settle=2.8)
        cap("다이어리를 쓰면 진행도가 저절로 올라가요")
        it = f.p.locator(".gd-item").filter(has_text="Bike Flow").first
        f.move(W * 0.5, H * 0.6, 0.4)
        f.wheel_to(it, where=0.55)
        f.cam(it, pad=30)
        f.wait(1.0)
        f.click(it.locator('[data-act="vote"]'), after=1.0)
        f.cam()
        f.wheel_to(".gd-rounds li.next", where=0.4)
        f.click(".gd-rounds li.next a", after=1.4)
        cap("모임 전엔 블라인드 — 각자 먼저 읽고 와요")
        f.cam(".st-todo", pad=24)
        f.wait(1.6)
        f.click('.st-tabs a[href$="tab=diary"]', after=0.8)
        f.cam(".ui-notice.warn:not([hidden])", pad=50)
        f.wait(1.8)
        cap("궁금한 점은 미리 올리고 투표해요")
        f.click('.st-tabs a[href$="tab=prep"]', after=0.8)
        f.click("#st-q", after=0.2)
        f.cam("#st-q-form", pad=60)
    with keep(2.5):
        f.type("시뮬레이션으로 학습한 모델이 실제 사고 데이터에서도 비슷하게 나올까요?", 0.03, 0.07)
    with keep():
        f.click("#st-q-form button", after=1.0)
        f.cam(".st-qs", pad=24)
        other = f.p.locator(".st-qs .st-q").filter(has_not_text="시뮬레이션으로 학습한").locator('button.vote[data-act="vote"]').first
        if other.count(): f.click(other, after=1.0)
        f.wait(0.8)
        f.cam()
        chip("모임이 끝나고")
        cap("끝난 모임은 정리 노트로 남겨요")
        f.click('.st-tabs a[href$="tab=notes"]', after=0.8)
        f.click('[data-act="nedit"]', after=0.6)
        f.click("#st-n-conclusion", after=0.2)
        f.cam("#st-n-conclusion", pad=80)
    with keep(3):
        f.type("시뮬레이션 데이터로 부족한 사고 데이터를 메울 수 있지만, 실제 적용엔 보정이 필요해요.", 0.02, 0.05)
        f.click("#st-n-next", after=0.2)
        f.cam("#st-n-next", pad=80)
        f.type("https://arxiv.org/abs/2510.09350 열차 지연 전파", 0.02, 0.05)
    with keep():
        if f.p.locator('[data-act="fromboard"]').count(): f.click('[data-act="fromboard"]', after=0.6)
        f.click('[data-act="notes"]', after=1.2)
        f.cam()
        f.wheel_to("details.st-manage:visible", where=0.3)
        f.click("details.st-manage:visible summary", after=0.5)
        f.click('details.st-manage[open] [data-act="close"]', after=0.6)
        f.click('.ui-alert [data-v="1"]', after=1.4)
        cap("다음에 읽을 논문은 가이드에 쌓여요")
        if f.p.locator(".st-series a").count(): f.click(".st-series a", after=1.2)
        else:
            f.nav("papers"); f.click(".papers-tabs a[href='#/guides']", after=0.9); f.click(".gd-card", "교통 예측 입문", after=1.2)
        harvested = f.p.locator(".gd-item").filter(has_text="2510.09350").first
        if not harvested.count(): harvested = f.p.locator(".gd-item").filter(has_text="Cascading").first
        if harvested.count():
            f.move(W * 0.5, H * 0.6, 0.4)
            f.wheel_to(harvested, where=0.5)
            f.cam(harvested, pad=30)
            f.wait(2.8)
            f.cam()
        cap("다음 모임은 날짜·발표 차례·후보 논문까지 채워져 있어요")
        new = f'a[href="#/study/new?guide={GUIDE}"]'
        f.wheel_to(new, where=0.3)
        f.click(new, after=1.2)
        f.cam("#st-form", pad=10)
        f.wait(1.2)
        f.cam(".st-suggest", pad=30)
        f.click(".st-suggest [data-sug]", "Bike Flow", after=1.0)
        f.cam("#st-form", pad=10)
        f.hover("#st-presenter", settle=1.4)
        f.cam()
        cap("내가 찾은 논문이 연구실이 함께 읽는 논문으로")
        f.click("#st-form .form-foot button.ui-btn.prominent", after=2.4)
        cap()

    # ================= ⑥ 돌아보기
    with keep():
        chapter(7)
        f.nav("me")
        cap("이번 학기 작성률과 달력 — 공휴일은 알아서 빠져요")
        f.cam(".progress-card", pad=10)
        f.wait(1.4)
        f.cam("#me-cal", pad=20)
        hol = f.p.locator("#me-cal i.off-holiday[data-day]").last
        if hol.count(): f.hover(hol, settle=1.6)
        f.cam()
        f.move(W * 0.5, H * 0.6, 0.4)
        f.wheel_to("#me-export", where=0.3)
        f.hover("#me-export", settle=1.0)
        f.nav("people")
        cap("연구실 전체가 어디를 읽는지, 누가 무엇에 밝은지")
        f.cam("#lab-bars", pad=10)
        f.click("#lab-bars [data-pick-axis]", "대중교통·철도", after=1.2)
        f.cam()
        f.move(W * 0.5, H * 0.6, 0.4)
        f.wheel_to("#people-grid", where=0.25)
        f.wait(1.6)
        cap("관심사가 비슷한 사람은 나란히 비교해서")
        f.p.keyboard.press("Control+k"); f.wait(0.5)
        f.type("강도윤"); f.wait(0.7)
        f.click(".spot-row", "강도윤", after=1.6)
        f.click("a.ui-btn", "비교", after=1.6)
        f.wait(2.4)
        f.nav("graph")
        with offcam(): f.graph_ready()
        cap("매주 한 편씩, 한 학기가 쌓이면")
        f.ev("LabGraph.demo.fit(600)"); f.wait(0.7)
        f.click("#tb-settings", after=0.5)
        f.click("label:has(#l-timeline)", after=0.4)
        f.blank()
        f.click("#t-play", after=0.2)
    with keep(5):
        f.move(W * 0.62, H * 0.5, 0.6)
        f.p.wait_for_function("(() => { const r = document.querySelector('#t-range'); return r && +r.value >= +r.max; })()", timeout=90000)
        f.wait(0.6)
    with keep():
        f.wait(1.0)
        cap()
        t = now(); f.wait(3.6); overlay("ending", t, now())
        chapter(8)


# ------------------------------------------------------------------ capture + main
def main():
    global T0
    FRAMES.mkdir(parents=True, exist_ok=True)
    for x in FRAMES.glob("*.jpg"): x.unlink()
    PUB.mkdir(parents=True, exist_ok=True)
    frames = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--force-device-scale-factor=2", "--use-angle=d3d11", "--ignore-gpu-blocklist",
                                                           "--enable-gpu-rasterization", "--hide-scrollbars"])
        state = setup(browser)
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, storage_state=state, locale="ko-KR")
        page = ctx.new_page()
        page.goto(SITE + "/#/graph"); page.wait_for_function("window.Store && window.LabMe")
        cdp = ctx.new_cdp_session(page)

        def on_frame(ev):
            i = len(frames)
            (FRAMES / f"{i:06d}.jpg").write_bytes(base64.b64decode(ev["data"]))
            frames.append(ev["metadata"]["timestamp"])
            cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
        cdp.on("Page.screencastFrame", on_frame)
        T0 = time.time()
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 90, "maxWidth": 2 * W, "maxHeight": 2 * H, "everyNthFrame": 1})
        f = Film(page)
        try:
            film(f, browser)
        except Exception:
            page.screenshot(path=str(RAW / "fail.png")); raise
        finally:
            cdp.send("Page.stopScreencast")
            page.wait_for_timeout(300)
            ctx.close(); browser.close()
    cap()
    # frames arrive when the page changes: hold each one until the next → constant 30 fps
    ts = [t - T0 for t in frames]
    lst = RAW / "frames.ffconcat"
    end = max(ts[-1] + 0.5, now())
    lines = ["ffconcat version 1.0"]
    first = ts[0]
    for i, t in enumerate(ts):
        nxt = ts[i + 1] if i + 1 < len(ts) else end
        lines += [f"file 'frames/{i:06d}.jpg'", f"duration {max(0.001, nxt - t):.4f}"]
    lines.append(f"file 'frames/{len(ts) - 1:06d}.jpg'")
    lst.write_text("\n".join(lines), encoding="utf-8")
    TL.update(theme=THEME, fps=FPS, width=2 * W, height=2 * H, css=dict(w=W, h=H), video="raw.mp4", offset=first)
    (PUB / "timeline.json").write_text(json.dumps(TL, ensure_ascii=False), encoding="utf-8")
    kept = sum((k["t1"] - k["t0"]) / k["speed"] for k in TL["keep"])
    print(f"{len(frames)} frames, raw {end:.0f}s, kept {kept:.0f}s → {PUB / 'timeline.json'}")
    # raw.mp4 starts at the first frame (offset); h264 with a keyframe every second so Remotion seeks fast
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-vf", f"fps={FPS}",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "14", "-g", str(FPS), "-pix_fmt", "yuv420p", str(PUB / "raw.mp4")],
                   check=True, cwd=str(RAW))
    print("→", PUB / "raw.mp4")


if __name__ == "__main__":
    main()
