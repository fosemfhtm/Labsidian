"""Local dev server: serves site/ + the small bridge the MCP server needs while there is no DB yet.

    python scripts/serve.py [port]          (default 8765)
    python scripts/serve.py [port] --demo   the fake demo lab: /data.js → site/data.demo.js, bridge files in data/demo/
                                            (automatic when site/data.js doesn't exist, e.g. a fresh clone)

  GET  /...                 static files from site/ (no-cache, so edits show up on reload)
  PUT  /api/snapshot        the open site pushes its current data → data/live_snapshot.json (MCP reads it)
  GET  /mcp/outbox.json     ops queued by the MCP server (data/mcp_outbox.json) → the site applies them

Only binds to 127.0.0.1. When the Supabase backend lands, this file is no longer needed.
"""
import json
import os
import sys
import tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# a fresh clone has no real lab data (site/data.js is gitignored) → serve the demo lab
DEMO = "--demo" in sys.argv or not (ROOT / "site" / "data.js").exists()
SITE, DATA = ROOT / "site", ROOT / ("data/demo" if DEMO else "data")
SNAPSHOT, OUTBOX = DATA / "live_snapshot.json", DATA / "mcp_outbox.json"
MAX_BODY = 50 * 1024 * 1024


def atomic_write(path: Path, data: bytes):
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console quiet except for the bridge
        if self.path.startswith("/api/"):
            super().log_message(fmt, *args)

    def do_GET(self):
        if DEMO and self.path.split("?")[0] == "/data.js":
            self.path = "/data.demo.js"
        if self.path.split("?")[0] == "/mcp/outbox.json":
            body = OUTBOX.read_bytes() if OUTBOX.exists() else b"[]"
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_PUT(self):
        if self.path != "/api/snapshot":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            self.send_error(413)
            return
        raw = self.rfile.read(n)
        try:
            json.loads(raw)
        except ValueError:
            self.send_error(400, "invalid json")
            return
        DATA.mkdir(exist_ok=True)
        atomic_write(SNAPSHOT, raw)
        self.send_response(204)
        self.end_headers()


def main():
    args = [a for a in sys.argv[1:] if a != "--demo"]
    port = int(args[0]) if args else 8765
    srv = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(SITE)))
    print(f"Labsidian dev server{' [DEMO]' if DEMO else ''} → http://localhost:{port}  (snapshot: {SNAPSHOT.relative_to(ROOT)})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
