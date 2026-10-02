"""Smoke test: start the MCP server over stdio like Claude/Codex would, list tools, call a few read tools.

    .venv/Scripts/python mcp/smoke_test.py [user name]
"""
import asyncio
import json
import os
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = Path(__file__).with_name("labsidian_mcp.py")


async def main():
    env = {**os.environ, "LABSIDIAN_USER": sys.argv[1] if len(sys.argv) > 1 else "한서윤", "PYTHONIOENCODING": "utf-8"}
    params = StdioServerParameters(command=sys.executable, args=[str(SERVER)], env=env)
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = (await s.list_tools()).tools
            print(f"{len(tools)} tools:", ", ".join(t.name for t in tools))

            async def call(tool, **args):
                res = await s.call_tool(tool, args)
                text = res.content[0].text if res.content else ""
                print(f"\n# {tool}({args}) {'ERROR' if getattr(res, 'is_error', getattr(res, 'isError', False)) else ''}\n{text[:600]}")
                return text

            await call("whoami")
            await call("search_papers", query="lane change", tag="강화학습", limit=3)
            await call("get_person", name="박지호")
            await call("lab_progress", term="2026H1")
            await call("create_draft", title="", summary="x", memo="", rating=9)  # should fail validation


asyncio.run(main())
