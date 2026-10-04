// Headless site/store.js for scripts/serve.py: applies MCP ops and builds the MCP snapshot with the exact logic
// the site uses, so there is one implementation of every rule (roles, notifications, tag merges …).
//
//   node scripts/store_worker.mjs <site/data.js | site/data.demo.js>
//
// One JSON request per stdin line, one JSON reply per stdout line:
//   {"cmd": "apply", "db": {...}, "op": {...}}  → {"ok": true, "db": {...}, "result": {ids it made}} | {"ok": false, "error": "forbidden"}
//   {"cmd": "snapshot", "db": {...}}            → {"ok": true, "snapshot": {...}, "db": {...}}
// "db" is the site's whole state (what the browser keeps in window.Store); the server diffs and stores the result.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import vm from "node:vm";

const DATA = process.argv[2];
const STORE = path.join(path.dirname(DATA), "store.js");
const cache = {};
const load = (file, parse) => {  // re-read when the file changes (rebuilt diary, edited store.js)
  const m = fs.statSync(file).mtimeMs;
  if (cache[file]?.m !== m) cache[file] = { m, v: parse(fs.readFileSync(file, "utf8")) };
  return cache[file].v;
};
const lab = () => structuredClone(load(DATA, raw => JSON.parse(raw.slice(raw.indexOf("=") + 1).trim().replace(/;\s*$/, ""))));
const script = () => load(STORE, src => new vm.Script(src, { filename: "store.js" }));

function boot(db) {
  let saved = db ? JSON.stringify(db) : null, api = null;
  const isDb = k => k.startsWith("labsidian.db.");
  const ctx = {
    LAB: lab(), console, setTimeout, clearTimeout, setInterval: () => 0, crypto: globalThis.crypto, TextEncoder, URL, structuredClone,
    fetch: globalThis.fetch,  // paper lookups (DOI / arXiv) for reading-list items added through MCP
    location: { hostname: "headless" },
    localStorage: { getItem: k => (isDb(k) ? saved : null), setItem: (k, v) => { if (isDb(k)) saved = v; }, removeItem: () => {} },
    __LABSIDIAN_HEADLESS__: h => { api = h; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  script().runInContext(ctx);
  return api;
}

const out = obj => process.stdout.write(JSON.stringify(obj) + "\n");
for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  let req;
  try { req = JSON.parse(line); } catch (e) { out({ ok: false, error: "bad request" }); continue; }
  try {
    const api = boot(req.db);
    if (req.cmd === "apply") { const result = await api.applyOp(req.op); out({ ok: true, db: api.db(), result: result || {} }); }
    else if (req.cmd === "snapshot") out({ ok: true, snapshot: api.snapshot(), db: api.db() });
    else out({ ok: false, error: `unknown cmd ${req.cmd}` });
  } catch (e) { out({ ok: false, error: e.message || String(e) }); }
}
