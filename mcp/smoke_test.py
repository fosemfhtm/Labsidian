"""Smoke test: start the MCP server over stdio like Claude/Codex would and call its tools.

    .venv/Scripts/python mcp/smoke_test.py [user name]            read tools + rejected writes (demo lab: python scripts/serve.py 8766 --demo)
    .venv/Scripts/python mcp/smoke_test.py 한서윤 --writes        + every write tool, chained on the ids they return (demo lab only)
    LABSIDIAN_URL=http://localhost:8765 .venv/Scripts/python mcp/smoke_test.py <your name>   (real lab: read-only calls + rejected writes)

Exits non-zero when a call that should work fails, or one that should fail works.
"""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = Path(__file__).with_name("labsidian_mcp.py")
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
WRITES = "--writes" in sys.argv
URL = os.environ.get("LABSIDIAN_URL", "http://localhost:8766")
failed = []


def tiny_pdf(path):
    body = b"BT /F1 12 Tf 72 720 Td (smoke test) Tj ET"
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>", b"<< /Length %d >>stream\n" % len(body) + body + b"\nendstream"]
    out = b"%PDF-1.4\n" + b"".join(b"%d 0 obj\n" % (i + 1) + o + b"\nendobj\n" for i, o in enumerate(objs)) + b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
    Path(path).write_bytes(out)
    return path


async def main():
    if WRITES and ":8766" not in URL:
        sys.exit("--writes only runs against the demo lab (LABSIDIAN_URL=http://localhost:8766)")
    # tests talk to the demo lab's server unless LABSIDIAN_URL says otherwise, so they never write into real data
    env = {**os.environ, "LABSIDIAN_URL": URL, "LABSIDIAN_USER": ARGS[0] if ARGS else "한서윤", "PYTHONIOENCODING": "utf-8"}
    params = StdioServerParameters(command=sys.executable, args=[str(SERVER)], env=env)
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = (await s.list_tools()).tools
            prompts = (await s.list_prompts()).prompts
            print(f"{len(tools)} tools:", ", ".join(t.name for t in tools))
            print(f"{len(prompts)} prompts:", ", ".join(p.name for p in prompts))

            async def call(tool, expect_ok=True, **args):
                res = await s.call_tool(tool, args)
                sc = getattr(res, "structured_content", None) or getattr(res, "structuredContent", None)
                if sc:   # a list comes back as {"result": [...]}
                    text = json.dumps(sc["result"] if isinstance(sc, dict) and set(sc) == {"result"} else sc, ensure_ascii=False)
                elif len(res.content or []) > 1:   # …or as one text item per element
                    text = "[" + ",".join(getattr(c, "text", "") for c in res.content) + "]"
                else:
                    text = res.content[0].text if res.content else ""
                err = bool(getattr(res, "is_error", getattr(res, "isError", False)))
                mark = "ok" if err != expect_ok else "UNEXPECTED"
                if err == expect_ok:
                    failed.append(tool)
                print(f"\n# {tool}({json.dumps(args, ensure_ascii=False)[:160]}) → {'error' if err else 'ok'} [{mark}]\n{text[:400]}")
                try:
                    return json.loads(text)
                except ValueError:
                    return text

            # ---- reads
            await call("whoami")
            hits = await call("search_papers", query="graph forecasting", limit=3)
            await call("get_person", name="박지호")
            await call("lab_progress")
            await call("my_inbox", limit=3)
            await call("my_drafts")
            await call("list_guides")
            # ---- refused
            await call("create_draft", expect_ok=False, title="x", summary="x", memo="", rating=9)
            await call("get_paper", expect_ok=False, paper_ref="graph")          # ambiguous → lists candidates
            await call("open_study", expect_ok=False)
            if not WRITES:
                return

            # ---- writes, each step using the id the previous one returned
            pid = hits[0]["id"] if isinstance(hits, list) and hits else None
            paper = await call("get_paper", paper_ref=pid)
            rid = next((x["review_id"] for x in paper.get("reviews", []) if "summary" in x), None) if isinstance(paper, dict) else None
            c = await call("add_comment", review_id=rid, body="(smoke test) 질문이에요?", kind="question")
            await call("add_comment", review_id=rid, body="(smoke test) 답글", reply_to=c.get("comment_id") if isinstance(c, dict) else "")
            await call("react_to_diary", review_id=rid, kind="like")
            await call("react_to_diary", review_id=rid, kind="like", on=False)
            item = await call("add_to_reading_list", title="Attention Is All You Need (smoke test)", note="smoke")
            iid = item.get("item_id") if isinstance(item, dict) else None
            await call("update_reading_item", item_id=iid, status="reading")
            pdf = tiny_pdf(os.path.join(tempfile.gettempdir(), "labsidian_smoke.pdf"))
            d = await call("create_draft", title="Smoke test draft", summary="Problem: x", memo="memo", rating=3, pdf_path=pdf)
            drafts = await call("my_drafts")
            if isinstance(drafts, list) and drafts and drafts[0].get("pdfs") != ["labsidian_smoke.pdf"]:
                failed.append("draft pdf")
            await call("delete_draft", draft_id=d.get("draft_id") if isinstance(d, dict) else "")
            g = await call("create_guide", title="Smoke test guide")
            gi = await call("add_guide_item", guide_id=g.get("guide_id"), paper_ref=pid)
            await call("vote_guide_item", guide_id=g.get("guide_id"), item_id=gi.get("item_id") if isinstance(gi, dict) else "")
            st = await call("open_study", paper_ref=pid, on_date="2030-01-15", at_time="15:00", place="smoke room", invite=["박지호"])
            sid = st.get("study_id") if isinstance(st, dict) else ""
            q = await call("add_study_question", study_id=sid, question="(smoke test) 왜요?")
            await call("vote_study_question", study_id=sid, question_id=q.get("question_id") if isinstance(q, dict) else "")
            study = await call("get_study", study_id=sid)
            if isinstance(study, dict) and not any(x.get("i_voted") for x in study.get("questions", [])):
                failed.append("question vote")
            await call("my_inbox", limit=2, mark_read=True)
            # a reading group's next session, filled in like the site's form (fails if one is already coming up)
            groups = [x for x in await call("list_guides") if isinstance(x, dict)]
            for x in groups:
                gd = await call("get_guide", guide_id=x["id"])
                if isinstance(gd, dict) and gd.get("reading_group"):
                    upcoming = any(not y["finished"] for y in gd["reading_group"]["sessions"])
                    await call("open_study", expect_ok=not upcoming, guide_id=x["id"])
                    break


asyncio.run(main())
print("\nFAILED: " + ", ".join(failed) if failed else "\nall as expected")
sys.exit(1 if failed else 0)
