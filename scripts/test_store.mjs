// Run with: node scripts/test_store.mjs (in-memory fixtures only; no lab data or server).
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const script = new vm.Script(fs.readFileSync(new URL("../site/store.js", import.meta.url), "utf8"));
const seed = () => ({
  people: [{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }, { id: "carol", name: "Carol" }],
  topics: Array.from({ length: 25 }, (_, i) => ({ id: `d:t${i}`, axis: "domain", label: `T${i}` })),
  papers: [{ id: "p1", title: "First paper", domains: ["t0"], methods: [] }, { id: "p2", title: "Second paper", domains: [], methods: [] }],
  reviews: [{ id: "r1", person: "alice", paper: "p1", date: "2026-06-01", term: "2026H1", rating: 3, tags: [], files: [{ id: "shared", kind: "pdf" }] },
    { id: "r2", person: "bob", paper: "p2", date: "2026-06-01", term: "2026H1", rating: 4, tags: [] }],
  clusters: [], terms: ["2026H1"],
});
function boot(db = {}, user = "admin", lab = seed()) {
  let api;
  const ctx = { LAB: lab, console, crypto: webcrypto, TextEncoder, URL,
    localStorage: { getItem: k => k.startsWith("labsidian.db.") ? JSON.stringify(db) : k.startsWith("labsidian.session") ? user : null, setItem() {} },
    __LABSIDIAN_HEADLESS__: h => { api = h; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  script.runInContext(ctx);
  return { ...api, store: ctx.Store };
}
const a = boot();
const admin = op => a.applyOp({ actor: "admin", ...op });
await assert.rejects(a.applyOp({ actor: "bob", op: "term.save", term: {} }), /forbidden/);
for (const op of ["tag.merge", "tag.rename", "tag.create", "quota.set", "user.role", "user.disable", "cluster.name", "paper.tags", "offday.save", "offday.remove"]) {
  await assert.rejects(a.applyOp({ actor: "bob", op }), /forbidden/);
}
a.db().users.bob.disabled = true;
await assert.rejects(a.applyOp({ actor: "bob", op: "comment", reviewId: "r1", body: "x" }), /actor/);
a.db().users.bob.disabled = false;
await assert.rejects(admin({ op: "offday.save", offDay: { start: "2026-02-30" } }), /date/);
await assert.rejects(admin({ op: "term.save", term: { id: "bad", start: "2026-06-02", end: "2026-06-01" } }), /date/);
await assert.rejects(admin({ op: "quota.set", member: "bob", quota: { targets: { "2026H1": -1 } } }), /quota/);
await assert.rejects(admin({ op: "quota.set", member: "bob", quota: { start: "2026-02-30" } }), /date/);
await admin({ op: "term.save", term: { id: "zero", start: "2026-06-01", end: "2026-06-02", target: 0 } });
assert.equal(a.snapshot().duties.zero.bob.target, 0);
assert.equal(a.store.calendar.workdays("2026-06-01", "2026-06-02"), 2);
assert.equal(a.store.calendar.workdays("2026-06-03", "2026-06-03"), 0);
await assert.rejects(a.store.users.setRole("admin", "member"), /forbidden/);
await assert.rejects(a.store.users.setDisabled("admin", true), /forbidden/);
await assert.rejects(admin({ op: "user.role", member: "admin", role: "member" }), /forbidden/);
await assert.rejects(admin({ op: "user.disable", member: "admin", disabled: true }), /forbidden/);

await assert.rejects(a.applyOp({ actor: "bob", op: "comment", reviewId: "missing", body: "x" }), /review.missing/);
const q = await a.applyOp({ actor: "bob", op: "comment", reviewId: "r1", kind: "question", body: "Hi @Alice @Carol" });
assert.equal(a.db().notifications.alice.length, 1);
assert.equal(a.db().notifications.alice[0].type, "question");
assert.equal(a.db().notifications.carol[0].type, "mention");
await assert.rejects(a.applyOp({ actor: "carol", op: "comment", reviewId: "r2", parent: q.commentId, body: "wrong diary" }), /comment.bad/);
const outsider = boot(a.db(), "carol");
await assert.rejects(outsider.store.comments.resolve(q.commentId), /forbidden/);
await boot(a.db(), "alice").store.comments.resolve(q.commentId);
await assert.rejects(a.store.reactions.toggle("r1", "__proto__"), /react.bad/);
for (const rating of [-1, 5.5, 2.25, "3", null, NaN, Infinity]) {
  await assert.rejects(admin({ op: "draft", title: "A draft", data: { rating } }), /rating.invalid/);
}
await admin({ op: "draft", title: "A draft", data: { rating: 3.5 } });

for (let i = 0; i < 24; i++) await admin({ op: "tag.merge", from: `d:t${i}`, into: `d:t${i + 1}` });
assert.equal(a.snapshot().papers.find(p => p.id === "p1").domains[0], "t24");
await assert.rejects(admin({ op: "tag.merge", from: "d:t24", into: "d:t0" }), /tag.unknown/);
await a.store.tags.undo(23);
assert.equal(a.snapshot().papers.find(p => p.id === "p1").domains[0], "t23");
await assert.rejects(a.store.tags.undo(-1), /tag.unknown/);
await admin({ op: "tag.create", axis: "domain", label: "Temporary", labelEn: "temporary" });
await admin({ op: "tag.merge", from: "d:t23", into: "d:temporary" });
await a.store.tags.undo(23);
assert.equal(a.snapshot().papers.find(p => p.id === "p1").domains[0], "t23");
const cycle = boot({ tagOps: [{ op: "merge", from: "d:t0", into: "d:t1" }, { op: "merge", from: "d:t1", into: "d:t0" }] });
assert.equal(cycle.snapshot().papers.find(p => p.id === "p1").domains[0], "t1");
const gid = (await admin({ op: "guide.create", guide: { title: "Guide" } })).guideId;
assert.ok(a.db().guides[gid]);
a.store.suggestTags({ title: "First paper" });
await admin({ op: "paper.meta", paperId: "p1", title: "Uniquequasar measurement" });
assert.equal(a.store.suggestTags({ title: "Uniquequasar measurement" }).similar[0].id, "p1");
await assert.rejects(admin({ op: "paper.meta", paperId: "p1", title: "Must not persist", year: "bad" }), /paper.meta.invalid/);
assert.equal(a.snapshot().papers.find(p => p.id === "p1").title, "Uniquequasar measurement");
const pairSeed = seed();
pairSeed.reviews.push({ ...pairSeed.reviews[0], id: "r3", person: "bob" });
const pair = boot({}, "admin", pairSeed);
assert.equal(pair.snapshot().people.find(p => p.id === "alice").similar.find(p => p.id === "bob").shared, 1);
assert.equal(pair.store.guides.wroteBy({ paperId: "p1" }, "bob"), true);
assert.equal(pair.store.studies.wrote({ paperId: "p1" }, "carol"), false);

const b = boot({}, "alice");
const prefix = "a".repeat(45);
await b.store.reviews.create({ title: prefix + "one" });
await b.store.reviews.create({ title: prefix + "two" });
await b.store.reviews.create({ title: "constructor" });
const rebuilt = boot(b.db(), "alice").snapshot();
assert.equal(new Set(rebuilt.papers.map(p => p.id)).size, rebuilt.papers.length);
assert.ok(rebuilt.papers.some(p => p.title === "constructor"));
const c = boot({ reading: { alice: [{ id: "item", key: "firstpaper", files: [{ id: "shared", kind: "pdf" }, { id: "unused", kind: "pdf" }] }] } }, "alice");
assert.equal(c.store.reading.has("p1"), true);
assert.equal(c.store.reading.list()[0].written, "r1");
const removed = [];
c.store.files.remove = async id => { removed.push(id); };
await c.store.reading.update("item", { files: [] });
assert.deepEqual(removed, ["unused"]);
await c.store.reviews.remove("r1");
assert.deepEqual(removed, ["unused", "shared"]);
c.store.reading._add("p1");
assert.equal(c.store.reading.list().length, 1);
assert.equal(await c.store.reading.toggle("p1"), false);
assert.equal(c.store.reading.has("p1"), false);
const d = boot({ reading: { alice: [{ id: "item", files: [{ id: "shared", kind: "pdf" }] }] } }, "alice");
d.store.files.remove = async () => assert.fail("shared attachment was deleted");
await d.store.reviews.remove("r1");
console.log("store regression checks passed");
