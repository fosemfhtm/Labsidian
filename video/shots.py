"""Screenshots of the fake demo lab → video/shots/*.png  (safe to share: no real members' data)

Needs: python scripts/serve.py 8766 --demo, .venv with playwright (+ `playwright install chromium`).
    .venv/Scripts/python video/shots.py [--light] [--en]

Runs in a throwaway headless browser profile; a little social activity (comments, a question, a study) is
seeded by the demo dataset itself (data/demo/social.json). Nothing touches your normal browser data.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "video" / "shots"
SITE = "http://localhost:8766"
W, H = 1440, 900
INIT_PW = "labsidian"        # mock initial password (site/store.js MOCK_INITIAL_PASSWORD)
DEMO_PW = "demo-shots-1"     # throwaway, lives only in this script's browser profile
ME = "한서윤"

SEED_JS = """async ([init, pw, me]) => {
  // the demo dataset seeds its own example studies / comments (data/demo/social.json) on first load
  const u = await Store.auth.signIn(me, init); if (u.mustChange) await Store.auth.changePassword(init, pw);
  const meId = u.id, sts = Store.studies.list();
  const next = sts.find(st => !st.closed) || sts[0];
  const shared = LAB.papers.filter(p => p.readers.includes(meId) && p.readers.length > 1)[0];
  return { paper: shared.id, person: meId, study: next.id, past: (sts.find(st => st.closed && st.notes) || next).id };
}"""


def main():
    theme = "light" if "--light" in sys.argv else "dark"
    lang = "en" if "--en" in sys.argv else "ko"
    suffix = ("" if theme == "dark" else "_light") + ("" if lang == "ko" else "_en")
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1.5, locale="ko-KR")
        page = ctx.new_page()
        page.goto(SITE)
        page.evaluate("([t, l]) => { localStorage.clear(); localStorage.setItem('lab.theme', t); localStorage.setItem('lab.lang', l); }", [theme, lang])
        page.reload(); page.wait_for_function("window.Store && window.LAB")
        shot(page, "01_login" + suffix)
        ids = page.evaluate(SEED_JS, [INIT_PW, DEMO_PW, ME])

        def go(hash, name, wait=1.2, js=None):
            page.evaluate("h => { location.hash = h; }", hash)
            page.wait_for_timeout(int(wait * 1000))
            if js:
                page.evaluate(js); page.wait_for_timeout(1500)
            shot(page, name + suffix)

        page.reload(); page.wait_for_function("window.Store && window.LAB"); page.wait_for_timeout(800)
        go("#/home", "02_home")
        go("#/graph", "03_graph", wait=4)
        go("#/graph", "04_graph_paper_selected", wait=1,
           js=f"LabGraph.select('{ids['paper']}', {{openDrawer: true}})")
        go("#/graph", "05_graph_person_selected", wait=1,
           js=f"LabGraph.select('u:{ids['person']}', {{openDrawer: true}})")
        go("#/people", "06_people")
        go(f"#/person/{ids['person']}", "07_person")
        go("#/papers", "08_papers")
        go(f"#/paper/{ids['paper']}", "09_paper")
        go("#/study", "10_studies")
        go(f"#/study/{ids['study']}", "11_study_detail")
        go(f"#/study/{ids['past']}", "11b_study_notes")
        go("#/me", "12_me")
        go("#/write", "13_write")
        ctx.close(); browser.close()
    print(f"→ {OUT}")


def shot(page, name):
    page.screenshot(path=str(OUT / f"{name}.png"))
    print(" ", name)


if __name__ == "__main__":
    main()
