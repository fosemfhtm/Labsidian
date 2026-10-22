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
            schemas = {t.name: getattr(t, "input_schema", None) or getattr(t, "inputSchema", {}) for t in tools}
            draft_fields = schemas.get("create_draft", {}).get("properties", {})
            delete_fields = schemas.get("delete_draft", {}).get("properties", {})
            if "diary_date" in draft_fields or "reading_item_id" not in draft_fields:
                failed.append("draft tool schema")
            if "reading_item_id" not in delete_fields or "draft_id" in delete_fields:
                failed.append("delete draft tool schema")

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
            await call("list_regular_studies")
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
            token = os.urandom(6).hex()
            title = f"Smoke reading {token}"
            item = await call("add_to_reading_list", title=title, note="smoke")
            iid = item.get("item_id") if isinstance(item, dict) else None
            await call("update_reading_item", item_id=iid, status="reading")
            pdf = tiny_pdf(os.path.join(tempfile.gettempdir(), "labsidian_smoke.pdf"))
            inbox_before = await call("my_inbox", limit=100)
            reading_before = await call("my_reading_list")
            # Explicit target, matching title without an id, and genuinely new paper.
            explicit = await call("create_draft", title="", summary="Problem: explicit", memo="memo", rating=3,
                                  reading_item_id=iid, pdf_path=pdf, tags=["m:dl"])
            matched = await call("create_draft", title=title, summary="Problem: replaced", memo="updated memo", rating=4,
                                 tags=["m:dl", "f:smoke"])
            await call("create_draft", expect_ok=False, title=title, summary="x", memo="memo", tags=["f:smoke"])  # no field/method tag
            fresh = await call("create_draft", title=f"Smoke new draft {token}", summary="Problem: new", memo="new memo", tags=["m:dl"])
            fresh_id = fresh.get("item_id") if isinstance(fresh, dict) else None
            for label, result, target in (("explicit", explicit, iid), ("matched", matched, iid), ("new", fresh, fresh_id)):
                if not isinstance(result, dict) or not target or result.get("item_id") != target or result.get("open") != f"{URL.rstrip('/')}/#/write?reading={target}":
                    failed.append(f"draft {label} target/link")
            if fresh_id == iid:
                failed.append("draft new target")
            drafts = await call("my_drafts")
            saved = next((x for x in drafts if x.get("item_id") == iid), {}) if isinstance(drafts, list) else {}
            if saved.get("summary") != "Problem: replaced" or saved.get("memo") != "updated memo" or saved.get("rating") != 4 or saved.get("tags") != ["m:dl", "f:smoke"] or saved.get("pdfs") != ["labsidian_smoke.pdf"]:
                failed.append("draft replacement and PDF")
            fresh_draft = next((x for x in drafts if x.get("item_id") == fresh_id), {}) if isinstance(drafts, list) else {}
            if fresh_draft.get("rating") != 0 or fresh_draft.get("tags") != ["m:dl"]:
                failed.append("draft allows empty rating")
            same = await call("create_tag", axis="method", label_ko="강화학습", label_en="Reinforcement learning")
            if not isinstance(same, dict) or same.get("tag_id") != "m:rl":
                failed.append("create_tag reuses an existing tag")
            reading = await call("my_reading_list")
            saved_item = next((x for x in reading if x.get("id") == iid), {}) if isinstance(reading, list) else {}
            new_item = next((x for x in reading if x.get("id") == fresh_id), {}) if isinstance(reading, list) else {}
            if not saved_item.get("hasDraft") or saved_item.get("note") != "smoke" or saved_item.get("status") != "reading":
                failed.append("draft preserves existing reading state")
            if not new_item.get("hasDraft") or new_item.get("status") != "read":
                failed.append("draft new reading state")
            if not isinstance(reading, list) or not isinstance(reading_before, list) or len(reading) != len(reading_before) + 1:
                failed.append("draft matching avoids duplicate")
            await call("delete_draft", reading_item_id=iid)
            await call("delete_draft", reading_item_id=fresh_id)
            remaining = await call("my_drafts")
            if not isinstance(remaining, list) or any(x.get("item_id") in (iid, fresh_id) for x in remaining):
                failed.append("draft deletion")
            after_delete = await call("my_reading_list")
            kept = next((x for x in after_delete if x.get("id") == iid), {}) if isinstance(after_delete, list) else {}
            if not kept or kept.get("hasDraft") or any(kept.get(k) != saved_item.get(k) for k in ("note", "status", "title", "readAt", "pdfs")):
                failed.append("draft deletion preserves reading item")
            if await call("my_inbox", limit=100) != inbox_before:
                failed.append("draft operations do not notify")
            await call("create_draft", expect_ok=False, title="", summary="x", memo="memo", rating=3,
                       reading_item_id=f"missing-{token}")
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
            # a regular study's next session, filled in like the site's form (fails if one is already coming up)
            for x in [x for x in await call("list_regular_studies") if isinstance(x, dict)][:1]:
                upcoming = any(not y["finished"] for y in x["sessions"])
                await call("open_study", expect_ok=not upcoming, group_id=x["id"], paper_ref=pid)


asyncio.run(main())
print("\nFAILED: " + ", ".join(failed) if failed else "\nall as expected")
sys.exit(1 if failed else 0)
