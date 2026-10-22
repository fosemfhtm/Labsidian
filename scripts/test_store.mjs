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
function boot(db = {}, user = "admin", lab = seed(), { date, viewTerms = [] } = {}) {
  let api;
  const ctx = { LAB: lab, console, crypto: webcrypto, TextEncoder, URL,
    ...(date ? { Date: class extends Date { constructor(...args) { super(...(args.length ? args : [date])); } static now() { return new Date(date).getTime(); } } } : {}),
    localStorage: { getItem: k => k.startsWith("labsidian.db.") ? JSON.stringify(db) : k.startsWith("labsidian.session") ? user : k.startsWith("labsidian.viewTerms") ? JSON.stringify(viewTerms) : null, setItem() {} },
    __LABSIDIAN_HEADLESS__: h => { api = h; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  script.runInContext(ctx);
  return { ...api, store: ctx.Store, lab: ctx.LAB };
}
const a = boot();
const admin = op => a.applyOp({ actor: "admin", ...op });
await assert.rejects(a.applyOp({ actor: "bob", op: "term.save", term: {} }), /forbidden/);
for (const op of ["tag.merge", "tag.rename", "quota.set", "user.role", "user.disable", "paper.tags", "offday.save", "offday.remove"]) {
  await assert.rejects(a.applyOp({ actor: "bob", op }), /forbidden/);
}
await assert.rejects(admin({ op: "cluster.name" }), /unknown op/);
const member = boot({}, "bob");
const memberTag = await member.applyOp({ actor: "bob", op: "tag.create", axis: "domain", label: "Member field" });
assert.ok(member.snapshot().topics.some(t => t.id === memberTag.tagId));
await assert.rejects(member.applyOp({ actor: "bob", op: "tag.create", axis: "free", label: "Invalid" }), /tag.axis/);
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
await assert.rejects(admin({ op: "user.role", member: "bob", role: "owner" }), /forbidden/);

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
const grouped = boot({}, "alice");
const groupId = await grouped.store.groups.create({ title: "Regular study", members: ["bob"], cadence: { weekday: 4, time: "14:00", every: 1 }, place: "Lab" });
const groupSnapshot = grouped.snapshot().groups.find(g => g.id === groupId);
assert.equal(groupSnapshot.nextPresenter, "alice");
const session = await grouped.applyOp({ actor: "bob", op: "study.create", groupId, paperId: "p1" });
const study = grouped.snapshot().studies.find(st => st.id === session.studyId);
assert.equal(study.groupId, groupId);
assert.equal(study.paperId, "p1");
assert.equal(study.date, groupSnapshot.nextDate);
assert.equal(study.time, "14:00");
assert.equal(study.place, "Lab");
assert.equal(study.presenter, "alice");
await assert.rejects(grouped.applyOp({ actor: "bob", op: "study.create", groupId, paperId: "p2" }), /group.upcoming/);
await assert.rejects(grouped.store.studies.create({ title: "Duplicate", groupId }), /group.upcoming/);
await assert.rejects(grouped.store.studies.create({ title: "Missing group", groupId: "missing" }), /group.missing/);
const groupOutsider = boot(grouped.db(), "carol");
await assert.rejects(groupOutsider.store.studies.create({ title: "Uninvited", groupId }), /forbidden/);
await assert.rejects(groupOutsider.store.groups.update(groupId, { title: "Hijack" }), /forbidden/);
await assert.rejects(groupOutsider.store.groups.remove(groupId), /forbidden/);
await grouped.store.studies.close(session.studyId);
const nextSession = await grouped.store.studies.create({ title: "Next round", groupId });
await assert.rejects(grouped.store.studies.close(session.studyId, false), /group.upcoming/);
assert.equal(grouped.store.studies.get(session.studyId).closed, true);
assert.equal(grouped.store.studies.get(nextSession.id).closed, false);
for (const weekday of ["bad", 1.5, -1, 7]) {
  await assert.rejects(grouped.store.groups.update(groupId, { title: "Must not persist", cadence: { weekday } }), /group.cadence/);
  assert.equal(grouped.store.groups.get(groupId).title, "Regular study");
}
await grouped.store.groups.remove(groupId);
assert.equal(grouped.snapshot().studies.find(st => st.id === session.studyId).groupId, null);
const migratedGroup = boot({
  guides: { g_old: { id: "g_old", title: "Old group", owner: "alice", items: [], group: { on: true, members: ["bob"] } } },
  studies: { old: { id: "old", guideId: "g_old" } },
});
assert.equal(migratedGroup.snapshot().groups[0].id, "grp_old");
assert.equal(migratedGroup.snapshot().studies[0].groupId, "grp_old");
assert.equal(migratedGroup.store.guides.get("g_old").group, undefined);
assert.equal(migratedGroup.store.groups.get("grp_old").members.join(","), "alice,bob");
assert.equal(boot(migratedGroup.db()).store.groups.list().length, 1);

for (const user of ["alice", "bob", "carol", "admin", null]) {
  const access = boot({
    groups: { grp_access: { id: "grp_access", owner: "alice", title: "Group", members: ["alice"] } },
    guides: { g_access: { id: "g_access", owner: "alice", title: "Guide", items: [], sections: [] } },
    studies: { s_access: { id: "s_access", host: "alice", presenter: "bob", title: "Study", members: ["alice", "bob"] } },
  }, user);
  for (const [collection, id, allowed] of [["groups", "grp_access", ["alice", "admin"]], ["guides", "g_access", ["alice", "admin"]], ["studies", "s_access", ["alice", "bob", "admin"]]]) {
    const api = access.store[collection];
    assert.equal(api.canManage(api.get(id)), allowed.includes(user));
    if (allowed.includes(user)) await api.update(id, { title: "Updated" });
    else {
      const error = user ? /forbidden/ : /auth/;
      await assert.rejects(api.update(id, { title: "Hijacked" }), error);
      await assert.rejects(api.remove(id), error);
      if (collection === "groups") await assert.rejects(api.update("missing", {}), error);
      if (collection === "guides") await assert.rejects(api.update("missing", {}), user ? /guide.missing/ : /auth/);
    }
  }
}

const attachments = boot({
  reading: { alice: [{ id: "reading", files: [{ id: "shared", kind: "pdf" }] }] },
  studies: { st: { id: "st", host: "alice", presenter: "bob", members: ["alice", "bob"], files: [{ id: "shared", kind: "pdf" }, { id: "study-only", kind: "pdf" }], picks: {} } },
}, "alice");
const deletedFiles = [];
attachments.store.files.remove = async id => { deletedFiles.push(id); throw new Error("already gone"); };
await attachments.store.studies.update("st", { files: [{ id: "shared", kind: "pdf" }] });
assert.deepEqual(deletedFiles, ["study-only"]);
await attachments.store.studies.setPick("st", { title: "Pick", files: [{ id: "shared", kind: "pdf" }, { id: "pick-only", kind: "pdf" }] });
await attachments.store.studies.setPick("st", { title: "Pick", files: [{ id: "shared", kind: "pdf" }] });
assert.deepEqual(deletedFiles, ["study-only", "pick-only"]);
await attachments.store.studies.removePick("st", "alice");
await attachments.store.studies.remove("st");
assert.deepEqual(deletedFiles, ["study-only", "pick-only"]);

const rhythm = boot({
  groups: { grp_rhythm: { id: "grp_rhythm", title: "Rhythm", owner: "alice", members: ["alice"], cadence: { weekday: 4, every: 2 } } },
  studies: { last: { id: "last", groupId: "grp_rhythm", date: "2026-01-12", createdAt: "", closed: true } },
}, "alice", seed(), { date: "2026-01-27T00:30:00" });
assert.equal(rhythm.store.groups.nextDate(rhythm.store.groups.get("grp_rhythm")), "2026-01-29");
const monthEnd = boot({
  groups: { grp_month: { id: "grp_month", title: "Month", owner: "alice", members: ["alice"], cadence: { weekday: 6, every: 2 } } },
  studies: { last: { id: "last", groupId: "grp_month", date: "2026-01-31", createdAt: "", closed: true } },
}, "alice", seed(), { date: "2026-02-01T00:30:00" });
assert.equal(monthEnd.store.groups.nextDate(monthEnd.store.groups.get("grp_month")), "2026-02-14");

const collision = boot({}, "bob");
const firstTag = await collision.store.tags.create({ axis: "method", label: "A/B" });
const secondTag = await collision.store.tags.create({ axis: "method", label: "A B" });
assert.notEqual(firstTag, secondTag);
assert.equal(collision.snapshot().topics.find(t => t.id === secondTag).label, "A B");
assert.equal(await collision.store.tags.create({ axis: "method", label: "a/b" }), firstTag);
const symbolTag = await collision.store.tags.create({ axis: "method", label: "+++" });
await collision.store.reviews.create({ title: "Tagged collision paper", tags: [secondTag, symbolTag] });
const taggedPaper = boot(collision.db()).snapshot().papers.find(p => p.title === "Tagged collision paper");
assert.equal(taggedPaper.methods.includes(secondTag.slice(2)), true);
assert.equal(taggedPaper.methods.includes(symbolTag.slice(2)), true);
const tagAdmin = boot(collision.db());
await tagAdmin.store.tags.merge(firstTag, secondTag);
const mergedTags = boot(tagAdmin.db(), "bob");
const revived = await mergedTags.store.tags.create({ axis: "method", label: "A/B" });
assert.notEqual(revived, firstTag);
assert.ok(mergedTags.snapshot().topics.some(t => t.id === revived));

let filteredMap = boot({}, "alice");
await filteredMap.store.reviews.create({ title: "Brand new map paper", date: "2026-06-01" });
filteredMap = boot(filteredMap.db(), "alice", seed(), { viewTerms: ["2026H1"] });
const fullMapPaper = filteredMap.lab.allPapers.find(p => p.title === "Brand new map paper");
const viewMapPaper = filteredMap.lab.papers.find(p => p.id === fullMapPaper.id);
assert.deepEqual([viewMapPaper.x, viewMapPaper.y, viewMapPaper.mx, viewMapPaper.my], [fullMapPaper.x, fullMapPaper.y, fullMapPaper.mx, fullMapPaper.my]);
console.log("store regression checks passed");
