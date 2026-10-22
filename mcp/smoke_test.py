"""Smoke test: call the same tools over stdio or Streamable HTTP.

    .venv/Scripts/python mcp/smoke_test.py [user name]            read tools + rejected writes (demo lab: python scripts/serve.py 8766 --demo)
    .venv/Scripts/python mcp/smoke_test.py 한서윤 --writes        + every write tool, chained on the ids they return (demo lab only)
    LABSIDIAN_URL=http://localhost:8765 .venv/Scripts/python mcp/smoke_test.py <your name>   (real lab: read-only calls + rejected writes)
    LABSIDIAN_TOKEN=<token> python mcp/smoke_test.py --http https://lab.example/mcp
    LABSIDIAN_TOKEN_2=<another member's token> enables concurrent two-user identity checks in HTTP mode.

Exits non-zero when a call that should work fails, or one that should fail works.
"""
import asyncio
import argparse
import json
import os
import sys
import tempfile
import urllib.request
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from urllib.parse import urlparse
from unittest.mock import patch

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client
import labsidian_mcp

SERVER = Path(__file__).with_name("labsidian_mcp.py")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("user", nargs="?", default="한서윤")
parser.add_argument("--writes", action="store_true")
parser.add_argument("--http", metavar="URL")
options = parser.parse_args()
WRITES = options.writes
URL = os.environ.get("LABSIDIAN_URL", options.http.removesuffix("/mcp") if options.http else "http://localhost:8766").rstrip("/")
failed = []


def tiny_pdf(path):
    body = b"BT /F1 12 Tf 72 720 Td (smoke test) Tj ET"
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>", b"<< /Length %d >>stream\n" % len(body) + body + b"\nendstream"]
    out = b"%PDF-1.4\n" + b"".join(b"%d 0 obj\n" % (i + 1) + o + b"\nendobj\n" for i, o in enumerate(objs)) + b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
    Path(path).write_bytes(out)
    return path


@asynccontextmanager
async def connection(params=None, token=None):
    if options.http:
        credential = os.environ["LABSIDIAN_TOKEN"] if token is None else token
        headers = {"Authorization": f"Bearer {credential}"} if credential else {}
        async with streamablehttp_client(options.http, headers=headers) as (r, w, _):
            yield r, w
    else:
        async with stdio_client(params) as streams:
            yield streams


async def check_http_identities():
    token = os.environ.get("LABSIDIAN_TOKEN", "")
    if not token:
        sys.exit("--http requires LABSIDIAN_TOKEN")
    for credential in ("", "invalid-smoke-token"):
        async with connection(token=credential) as (r, w), ClientSession(r, w) as session:
            await session.initialize()
            result = await session.call_tool("whoami", {})
            if not result.isError or "AI 연결" not in str(result.content):
                raise AssertionError("HTTP accepted missing/invalid token or omitted sign-in guidance")
    second = os.environ.get("LABSIDIAN_TOKEN_2", "")
    if not second:
        print("SKIP two-user HTTP check: set LABSIDIAN_TOKEN_2 to another member's token")
        return

    async def check(credential):
        req = urllib.request.Request(URL + "/api/whoami",
                                     headers={"Authorization": f"Bearer {credential}"})
        def expected_user():
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.load(response)["user"]["id"]
        expected = await asyncio.to_thread(expected_user)
        async with connection(token=credential) as (r, w), ClientSession(r, w) as session:
            await session.initialize()
            for _ in range(3):
                result = await session.call_tool("whoami", {})
                if result.isError:
                    raise AssertionError("HTTP whoami rejected a valid member")
                actual = json.loads(result.content[0].text)["user"]["id"]
                if actual != expected:
                    raise AssertionError("HTTP identity leaked between members")
                await asyncio.sleep(0)
        return expected

    users = await asyncio.gather(check(token), check(second))
    if users[0] == users[1]:
        raise AssertionError("two-user check needs tokens belonging to different members")
    print("ok: concurrent HTTP callers retain their own identities")


async def main(tmpdir):
    target = urlparse(URL)
    if WRITES and (target.scheme != "http" or target.hostname not in ("localhost", "127.0.0.1", "::1") or target.port != 8766 or target.path not in ("", "/") or target.query or target.fragment):
        sys.exit("--writes only runs against the demo lab (LABSIDIAN_URL=http://localhost:8766)")
    if options.http:
        await check_http_identities()
    # A quiet lab still needs fresh computed next dates after midnight, without repeated same-day snapshots.
    backend = labsidian_mcp.ServerBackend()
    with patch.object(backend, "call") as request, patch.object(labsidian_mcp, "date") as clock, patch.object(labsidian_mcp, "identity", return_value={"id": ""}):
        request.side_effect = lambda path: {"version": 1, "snapshot": {k: [] for k in ("people", "papers", "reviews", "topics", "users")}}
        clock.today.side_effect = [date(2030, 1, 1), date(2030, 1, 1), date(2030, 1, 2)]
        first = backend.data()
        if backend.data() is not first or backend.data() is first:
            failed.append("snapshot refreshes only on a new day")
        if sum(args.args == ("/api/snapshot",) for args in request.call_args_list) != 2:
            failed.append("snapshot same-day cache")
    # Shared snapshot, private search index: an author's blind-study text must not leak to another viewer.
    snapshot = {"people": [], "topics": [], "users": [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}],
                "papers": [{"id": "p", "title": "Paper", "reviews": ["r"]}],
                "reviews": [{"id": "r", "paper": "p", "person": "a", "studyId": "s", "content": "secretword", "memo": ""}],
                "studies": [{"id": "s", "blind": True, "paperId": "p", "members": ["a", "b"]}]}
    backend = labsidian_mcp.ServerBackend()
    with patch.object(backend, "call", side_effect=lambda path: {"version": 1, "snapshot": snapshot}), \
            patch.object(labsidian_mcp, "identity") as viewer:
        viewer.return_value = {"id": "a"}
        author = backend.data()
        viewer.return_value = {"id": "b"}
        other = backend.data()
        assert "secretword" in author["PA"]["p"]["_hay"]
        assert "secretword" not in other["PA"]["p"]["_hay"]
        viewer.return_value = {"id": "a"}
        assert backend.data() is author
        assert "_f" not in snapshot["papers"][0]
    with patch.object(labsidian_mcp, "HTTP_MODE", True), \
            patch.object(labsidian_mcp, "mcp") as server, \
            patch.dict(os.environ, {"LABSIDIAN_TOKEN": "local-admin", "LABSIDIAN_USER": "admin"}):
        server.get_context.return_value.request_context.request.headers = {}
        try:
            labsidian_mcp.auth_headers()
        except labsidian_mcp.ToolError as error:
            assert "AI 연결" in str(error)
        else:
            raise AssertionError("HTTP inherited local admin credentials")
        server.get_context.return_value.request_context.request.headers = {"authorization": "Bearer member"}
        assert labsidian_mcp.auth_headers() == {"Authorization": "Bearer member"}
        try:
            labsidian_mcp._attach_pdf("local.pdf")
        except labsidian_mcp.ToolError as error:
            assert "use pdf_upload_link" in str(error)
        else:
            raise AssertionError("HTTP accepted server-local pdf_path")
    with patch.object(labsidian_mcp.DB, "file_info", return_value=100):
        assert labsidian_mcp._uploaded_pdf("f1", r"C:\papers\example.pdf") == {
            "id": "f1", "name": "example.pdf", "type": "application/pdf", "size": 100, "kind": "pdf"}
    with patch.object(labsidian_mcp.DB, "call", return_value={"user": {"style": "member rules"}}), \
            patch.object(labsidian_mcp, "STYLE", "local rules"):
        assert labsidian_mcp.writing_style()["style"] == "member rules"
    with patch.object(labsidian_mcp.DB, "call", return_value={"user": {"style": ""}}), \
            patch.object(labsidian_mcp, "STYLE", "local rules"), patch.object(labsidian_mcp, "HTTP_MODE", True):
        assert labsidian_mcp.writing_style()["style"] == ""
    with patch.object(labsidian_mcp.DB, "call", return_value={"user": None}), \
            patch.object(labsidian_mcp, "STYLE", "local rules"), patch.object(labsidian_mcp, "HTTP_MODE", False):
        assert labsidian_mcp.writing_style()["style"] == "local rules"
    term = {"id": "2030H1", "start": "2030-01-01", "end": "2030-06-30"}
    paper = {"id": "p0", "title": "Example paper", "_key": "examplepaper"}
    with patch.object(labsidian_mcp.DB, "data", return_value={"terms": [term], "PA": {"p0": paper}, "papers": [paper]}):
        assert labsidian_mcp.term_for("2030H1") == term
        assert labsidian_mcp._paper_input("Example paper", "", "") == {"paperId": "p0", "summary": "Example paper"}
        assert labsidian_mcp._paper_input("", " https://example.org ", " Example ") == {
            "input": "https://example.org", "title": "Example", "link": "https://example.org", "summary": " Example "}
        for color in ("", "blue", "#123", "#1234", "#123456", "#12345678"):
            labsidian_mcp._validate_tag_color(color)
        labsidian_mcp._validate_dates("invalid date", "2030-01-01", "2030-06-30")
        for action in (lambda: labsidian_mcp.term_for("missing"), lambda: labsidian_mcp._paper_input("", "", ""),
                       lambda: labsidian_mcp._validate_dates("invalid date", "2030-01-01", "2030-02-30"),
                       lambda: labsidian_mcp._validate_tag_color("#12345")):
            try:
                action()
            except labsidian_mcp.ToolError:
                pass
            else:
                raise AssertionError("invalid MCP input accepted")
    # tests talk to the demo lab's server unless LABSIDIAN_URL says otherwise, so they never write into real data
    env = {**os.environ, "LABSIDIAN_URL": URL, "LABSIDIAN_USER": options.user,
           "LABSIDIAN_DOWNLOADS": os.path.join(tmpdir, "downloads"), "PYTHONIOENCODING": "utf-8"}
    params = StdioServerParameters(command=sys.executable, args=[str(SERVER)], env=env)
    async with connection(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = (await s.list_tools()).tools
            prompts = (await s.list_prompts()).prompts
            print(f"{len(tools)} tools:", ", ".join(t.name for t in tools))
            print(f"{len(prompts)} prompts:", ", ".join(p.name for p in prompts))

            async def call(tool, expect_ok=True, **args):
                res = await s.call_tool(tool, args)
                sc = getattr(res, "structured_content", None) or getattr(res, "structuredContent", None)
                if sc is not None:   # a list comes back as {"result": [...]}, including [] and a single item
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
            identity = await call("whoami")
            public = identity.get("server", URL).rstrip("/")
            if WRITES and options.http and public != URL:
                sys.exit("--writes requires the HTTP MCP server's public URL to equal the demo LABSIDIAN_URL")
            await call("writing_style")
            hits = await call("search_papers", query="graph forecasting", limit=1)
            empty = await call("search_papers", query="no-such-paper-" + os.urandom(12).hex())
            if not isinstance(hits, list) or len(hits) != 1 or empty != []:
                failed.append("empty and single-item list results")
            profile = await call("get_person", name="박지호")
            for recent in profile.get("recent", []):
                detail = await call("get_paper", paper_ref=recent["id"])
                diary = next(r for r in detail["reviews"] if r.get("by") == "박지호")
                if "rating" in diary and recent["rating"] != diary["rating"]:
                    failed.append("profile preserves member rating")
            await call("lab_progress")
            inbox = await call("my_inbox", limit=100)
            for notification in inbox if isinstance(inbox, list) else []:
                if notification.get("type") in ("groupSession", "groupJoin"):
                    group_id = notification.get("group_id")
                    if not group_id or notification.get("open") != f"{public}/#/group/{group_id}":
                        failed.append("regular-study notification target")
            await call("my_drafts")
            await call("list_guides")
            await call("list_regular_studies")
            # ---- refused
            await call("create_draft", expect_ok=False, title="x", summary="x", memo="", rating=9)
            await call("get_paper", expect_ok=False, paper_ref="graph")          # ambiguous → lists candidates
            await call("open_study", expect_ok=False)
            await call("open_study", expect_ok=False, title="Invalid time", at_time="99:99")
            await call("download_pdf", expect_ok=False, file_id="../snapshot")
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
            pdf = tiny_pdf(os.path.join(tmpdir, "labsidian_smoke.pdf"))
            attachment = {"pdf_path": pdf}
            if options.http:
                upload = await call("pdf_upload_link")
                req = urllib.request.Request(upload["url"], data=Path(pdf).read_bytes(),
                                             headers={"Content-Type": "application/pdf"}, method="PUT")
                with urllib.request.urlopen(req, timeout=30) as response:
                    assert json.load(response)["ok"]
                attachment = {"pdf_file_id": upload["file_id"], "pdf_name": Path(pdf).name}
            oversized = os.path.join(tmpdir, "oversized.pdf")
            with open(oversized, "wb") as f:
                f.write(b"%PDF-1.4\n")
                f.truncate(20 * 1024 * 1024 + 1)
            await call("create_draft", expect_ok=False, title="Oversized attachment", summary="x", memo="memo", pdf_path=oversized, tags=["m:dl"])
            refused = await call("create_draft", expect_ok=False, title="Invalid memo", summary="x", memo="",
                                 pdf_path=os.path.join(tmpdir, "missing.pdf"))
            if "memo" not in str(refused):
                failed.append("draft validates before uploading")
            inbox_before = await call("my_inbox", limit=100)
            reading_before = await call("my_reading_list")
            # Explicit target, matching title without an id, and genuinely new paper.
            explicit = await call("create_draft", title="", summary="Problem: explicit", memo="memo", rating=3,
                                  reading_item_id=iid, **attachment, tags=["m:dl"])
            matched = await call("create_draft", title=title, summary="Problem: replaced", memo="updated memo", rating=4,
                                 tags=["m:dl", "f:smoke"])
            await call("create_draft", expect_ok=False, title=title, summary="x", memo="memo", tags=["f:smoke"])  # no field/method tag
            fresh = await call("create_draft", title=f"Smoke new draft {token}", summary="Problem: new", memo="new memo", tags=["m:dl"])
            fresh_id = fresh.get("item_id") if isinstance(fresh, dict) else None
            for label, result, target in (("explicit", explicit, iid), ("matched", matched, iid), ("new", fresh, fresh_id)):
                if not isinstance(result, dict) or not target or result.get("item_id") != target or result.get("open") != f"{public}/#/write?reading={target}":
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
            attached = saved_item.get("pdfs") or []
            if attached:
                first = await call("download_pdf", file_id=attached[0]["file_id"])
                second = await call("download_pdf", file_id=attached[0]["file_id"])
                if options.http:
                    for download in (first, second):
                        with urllib.request.urlopen(download["url"], timeout=30) as response:
                            assert response.read() == Path(pdf).read_bytes()
                        assert download["name"] == Path(pdf).name and download["bytes"] == Path(pdf).stat().st_size
                else:
                    paths = [x.get("path") for x in (first, second) if isinstance(x, dict)]
                    if len(paths) != 2 or paths[0] == paths[1] or any(Path(p).read_bytes() != Path(pdf).read_bytes() for p in paths):
                        failed.append("PDF downloads preserve duplicate filenames")
            else:
                failed.append("draft attachment available to download")
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
                       reading_item_id=f"missing-{token}", tags=["m:dl"])
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


with tempfile.TemporaryDirectory(prefix="labsidian_smoke_") as tmpdir:
    asyncio.run(main(tmpdir))
print("\nFAILED: " + ", ".join(failed) if failed else "\nall as expected")
sys.exit(1 if failed else 0)
