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
assert.equal(member.store.auth.current().style, "");
await member.store.auth.setStyle("  private member guidance  ");
assert.equal(member.store.auth.current().style, "private member guidance");
assert.equal(member.db().users.bob.style, "private member guidance");
assert.equal(member.db().users.alice.style, undefined);
await assert.rejects(member.store.auth.setStyle("x".repeat(20001)), /style/);
await assert.rejects(member.store.auth.setStyle(null), /style/);
assert.equal(member.store.auth.current().style, "private member guidance");
await member.store.auth.setStyle("x".repeat(20000));
assert.equal(member.store.auth.current().style.length, 20000);
assert.ok(!JSON.stringify(member.snapshot()).includes('"style"'));
assert.equal(member.store.users.get("bob").style, undefined);
assert.ok((await member.store.users.list()).every(u => !("style" in u)));
await member.store.auth.setStyle("  ");
assert.equal(member.store.auth.current().style, "");
await assert.rejects(boot({}, null).store.auth.setStyle("anonymous"), /auth/);
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
assert.equal(study.presenters.join(","), "alice");
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
await grouped.store.groups.update(groupId, { title: "Regular study", desc: "x".repeat(5001), emoji: "👩‍🔬", links: [{ label: "Materials", url: "https://example.com" }] });
assert.equal(grouped.store.groups.get(groupId).desc.length, 5000);
assert.equal(grouped.snapshot().groups.find(g => g.id === groupId).emoji, "👩‍🔬");
assert.equal(grouped.snapshot().groups.find(g => g.id === groupId).links[0].url, "https://example.com");
for (const links of [[{ label: "Bad", url: "javascript:alert(1)" }], [{ label: "Bad", url: "https://" }], [{ label: "x".repeat(41), url: "https://example.com" }], Array(7).fill({ label: "Link", url: "https://example.com" })]) {
  await assert.rejects(grouped.store.groups.update(groupId, { title: "Must not persist", links }), /group.links/);
  assert.equal(grouped.store.groups.get(groupId).title, "Regular study");
}
for (const emoji of ["AB", "👨‍👩‍👧‍👦"]) await assert.rejects(grouped.store.groups.update(groupId, { emoji }), /group.emoji/);
await grouped.store.groups.update(groupId, { title: "Regular study" });
assert.equal(grouped.store.groups.get(groupId).links[0].label, "Materials", "omitted new fields preserve saved content");
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
  studies: { st: { id: "st", host: "alice", presenter: "bob", members: ["alice", "bob"], files: [{ id: "shared", kind: "pdf" }, { id: "study-only", kind: "pdf" }], picks: {}, bring: true } },
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
const legacy = boot({ studies: { old: { id: "old", host: "alice", presenter: "bob", members: ["alice", "bob"], title: "Legacy" } } }, "bob");
assert.equal(legacy.store.studies.get("old").presenters.join(","), "bob");
assert.equal("presenter" in legacy.store.studies.get("old"), false);
assert.equal(legacy.store.studies.canManage(legacy.store.studies.get("old")), true);
await legacy.store.studies.leave("old");
assert.ok(legacy.store.studies.get("old").members.includes("bob"));
const multi = boot({}, "alice");
const { id: multiId } = await multi.store.studies.create({ title: "Multi", presenters: ["bob", "carol"] });
for (const user of ["alice", "bob", "carol", "admin"]) {
  const as = boot(multi.db(), user);
  assert.equal(as.store.studies.canManage(as.store.studies.get(multiId)), true);
}
const rotationId = await multi.store.groups.create({ title: "Rotation", members: ["bob", "carol"] });
multi.store.studies.get(multiId).groupId = rotationId;
assert.equal(multi.store.groups.nextPresenter(multi.store.groups.get(rotationId)), "alice");
// a disabled member is skipped in the rotation and, as a stale presenter, can be replaced (on a copy of the data)
const disabledDb = JSON.parse(JSON.stringify(multi.db()));
disabledDb.users.alice.disabled = true; disabledDb.studies[multiId].presenters = ["alice"];
const replacer = boot(disabledDb, "admin");
assert.equal(replacer.store.groups.nextPresenter(replacer.store.groups.get(rotationId)), "bob");
await replacer.store.studies.update(multiId, { presenters: ["bob"], place: "Room 1" });
assert.equal(replacer.store.studies.get(multiId).presenters.join(","), "bob");
await assert.rejects(multi.store.studies.create({ title: "Invalid presenters", presenters: "bob" }), /study.presenters/);
await assert.rejects(multi.store.studies.update(multiId, { presenters: [] }), /study.presenters/);
// "presenters only": only a presenter brings a related paper; switching to everyone opens it to all members
const host = boot({}, "alice");
const { id: bringId } = await host.store.studies.create({ title: "Bring", presenters: ["bob"], invite: ["carol"], bring: "presenters" });
const presenter = boot(host.db(), "bob");
await presenter.store.studies.setPick(bringId, { title: "Bob's pick" });
await assert.rejects(boot(presenter.db(), "carol").store.studies.setPick(bringId, { title: "Carol's pick" }), /forbidden/);
const opener = boot(presenter.db(), "alice");
await opener.store.studies.update(bringId, { bring: true });
const listener = boot(opener.db(), "carol");
await listener.store.studies.setPick(bringId, { title: "Carol's pick" });
assert.equal(listener.store.studies.picks(listener.store.studies.get(bringId)).map(pk => pk.uid).join(","), "bob,carol");
// the MCP ops: fields left empty keep what's there, PDFs pile up, and taking it back removes the paper and its files
const viaMcp = boot(listener.db(), "bob"), gone = [];
viaMcp.store.files.remove = async id => { gone.push(id); };
await viaMcp.applyOp({ actor: "bob", op: "study.pick", studyId: bringId, why: "same problem", files: [{ id: "slides", kind: "pdf" }] });
await viaMcp.applyOp({ actor: "bob", op: "study.pick", studyId: bringId, files: [{ id: "paper", kind: "pdf" }] });
const bobPick = viaMcp.store.studies.get(bringId).picks.bob;
assert.equal(`${bobPick.title}|${bobPick.why}|${bobPick.files.map(f => f.id)}`, "Bob's pick|same problem|slides,paper");
await viaMcp.applyOp({ actor: "bob", op: "study.pickRemove", studyId: bringId });
assert.equal(viaMcp.store.studies.get(bringId).picks.bob, undefined);
assert.equal(gone.join(","), "slides,paper");
const closer = boot(listener.db(), "alice");
await closer.store.studies.update(bringId, { bring: false });
await assert.rejects(boot(closer.db(), "bob").store.studies.setPick(bringId, { title: "Again" }), /forbidden/);
const mats = boot(multi.db(), "bob"), materialFiles = [];
mats.store.files.remove = async id => { materialFiles.push(id); };
const mat = await mats.store.studies.addMaterial(multiId, { kind: "file", title: "Slides", file: { id: "slides", kind: "pdf" } });
await assert.rejects(boot(mats.db(), "carol").store.studies.removeMaterial(multiId, mat.id), /forbidden/);
await assert.rejects(mats.store.studies.addMaterial(multiId, { kind: "link", title: "Bad", url: "javascript:alert(1)" }), /materialUrl/);
await assert.rejects(mats.store.studies.addMaterial(multiId, { kind: "link", title: "x".repeat(81), url: "https://example.org" }), /materialTitle/);
await mats.store.studies.removeMaterial(multiId, mat.id);
assert.deepEqual(materialFiles, ["slides"]);
await mats.store.studies.addMaterial(multiId, { kind: "file", title: "Image", file: { id: "image", kind: "image" } });
await mats.store.studies.remove(multiId);
assert.deepEqual(materialFiles, ["slides", "image"]);
const outsiders = boot({}, "alice");
const { id: outsiderId } = await outsiders.store.studies.create({ title: "Private membership" });
await assert.rejects(boot(outsiders.db(), "bob").store.studies.addMaterial(outsiderId, { kind: "link", title: "Link", url: "https://example.org" }), /forbidden/);
const hostMaterials = boot({}, "alice");
const { id: hm } = await hostMaterials.store.studies.create({ title: "Host removal", invite: ["bob"] });
const memberMaterials = boot(hostMaterials.db(), "bob");
const memberLink = await memberMaterials.store.studies.addMaterial(hm, { kind: "link", title: "Link", url: "https://example.org" });
await boot(memberMaterials.db(), "alice").store.studies.removeMaterial(hm, memberLink.id);

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

// A disabled member disappears everywhere with their diaries and comments; re-enabling brings everything back.
const hiding = boot({}, "bob");
await hiding.store.comments.add({ reviewId: "r1", body: "bob on alice's diary" });
const hidingAdmin = boot(hiding.db(), "admin");
const hidingGuide = await hidingAdmin.store.guides.create({ title: "Guide" });
await hidingAdmin.store.guides.addItem(hidingGuide, { paperId: "p2" });
await hidingAdmin.store.users.setDisabled("bob", true);
const hidden = hidingAdmin.snapshot();
assert.equal(hidden.guides[0].items[0].title, "Second paper", "a guide keeps the title of a paper only a disabled member read");
assert.ok(!hidden.people.some(p => p.id === "bob"));
assert.ok(!hidden.reviews.some(r => r.person === "bob"));
assert.ok(!hidden.papers.some(p => p.id === "p2"), "a paper only the disabled member read is hidden too");
assert.ok(!hidden.comments.some(c => c.author === "bob"));
assert.equal(await hidingAdmin.store.comments.count("r1"), 0);
assert.ok(hidden.users.some(u => u.id === "bob" && u.disabled), "admins still see the account to re-enable it");
await hidingAdmin.store.users.setDisabled("bob", false);
const shownAgain = hidingAdmin.snapshot();
assert.ok(shownAgain.reviews.some(r => r.person === "bob") && shownAgain.comments.some(c => c.author === "bob"));

// One colour per person, from the 30: an old hex falls back to a free one, a taken colour can't be picked,
// and a stored pick that clashes with someone's colour never takes it from them.
const colours = () => ({ ...seed(), people: [{ id: "alice", name: "Alice", color: "cobalt" }, { id: "bob", name: "Bob", color: "red" }, { id: "carol", name: "Carol", color: "#000000" }] });
const painter = boot({}, "bob", colours());
const colourOf = (s, id) => s.snapshot().people.find(p => p.id === id).color;
assert.match(colourOf(painter, "carol"), /^rgb\(var\(--[a-z]+\)\)$/);
await assert.rejects(painter.store.users.setMyColor("cobalt"), /color.taken/);
await assert.rejects(painter.store.users.setMyColor("#ff0000"), /color/);
await painter.store.users.setMyColor("lime");
const repainted = boot(painter.db(), "alice", colours());
assert.equal(colourOf(repainted, "bob"), "rgb(var(--lime))");
repainted.db().users.carol.color = "cobalt";   // e.g. picked before the one-colour rule: alice still has cobalt
const clash = boot(repainted.db(), "alice", colours());
assert.equal(colourOf(clash, "alice"), "rgb(var(--cobalt))");
assert.equal(new Set(clash.snapshot().people.map(p => p.color)).size, 3);
// bob leaves red for lime; alice (earlier in the list) then picks red and gets it
const trio = () => ({ ...seed(), people: [{ id: "alice", name: "Alice", color: "cobalt" }, { id: "bob", name: "Bob", color: "red" }, { id: "carol", name: "Carol", color: "teal" }] });
const leaver = boot({}, "bob", trio());
await leaver.store.users.setMyColor("lime");
const taker = boot(leaver.db(), "alice", trio());
await taker.store.users.setMyColor("red");
assert.equal(colourOf(boot(taker.db(), "alice", trio()), "alice"), "rgb(var(--red))");
console.log("store regression checks passed");
