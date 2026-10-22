/* Headless regressions for chart caching and graph route cleanup. Run: node scripts/test_views.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const listeners = new Map();
const paper = { id: "p1", title: "Paper", x: 0, y: 0, mx: 20, my: 30, reviews: [], readers: [], domains: ["field"], methods: ["one"] };
const lab = { papers: [paper], reviews: [], people: [], topics: [
  { id: "d:field", axis: "domain", label: "Old" }, { id: "m:one", axis: "method", label: "One" },
] };
const elements = new Map();
const element = selector => {
  if (!elements.has(selector)) elements.set(selector, { textContent: "", innerHTML: "", value: "", children: [], style: {},
    querySelector: element, querySelectorAll: () => [], classList: { toggle() {} }, setAttribute() {} });
  return elements.get(selector);
};
let pendingShow;
let clearedTimer;
let pendingFrame, cancelledFrame, restarts = 0;
const window = {
  LAB: lab,
  I18N: { t: key => key, extend() {} },
  LabUI: { P: {}, T: {}, R: {}, esc: String, tl: tag => tag.label, currentView: () => "home" },
  Store: { paperYear: () => null },
  addEventListener(type, callback) { (listeners.get(type) || listeners.set(type, []).get(type)).push(callback); },
};
const context = vm.createContext({
  window, I18N: window.I18N,
  document: { documentElement: {}, querySelector: element, addEventListener() {} },
  localStorage: { getItem() { throw new Error("Storage blocked"); }, setItem() { throw new Error("Storage blocked"); } },
  matchMedia: () => ({ matches: false }), performance: { now: () => 0 },
  requestAnimationFrame: callback => { pendingFrame = callback; return 99; },
  cancelAnimationFrame: id => { cancelledFrame = id; },
  getComputedStyle: () => ({ getPropertyValue: () => "0 0 0" }),
  setTimeout: callback => { pendingShow = callback; },
  clearInterval: timer => { clearedTimer = timer; },
});
const load = name => readFileSync(new URL(`../site/${name}`, import.meta.url), "utf8");
vm.runInContext(load("viz.js"), context);
const viz = window.LabViz;
assert.equal(viz.axesOf("domain")[0].name, "Old");
viz.axesOf("method");
lab.topics[0].label = "New"; lab.topics[1].label = "Two";
for (const callback of listeners.get("lab:data")) callback();
assert.equal(viz.axesOf("domain")[0].name, "New", "LAB is mutated in place when polling");
assert.equal(viz.axesOf("method")[0].name, "Two", "method axes must reflect polled tag edits");

// Imports are unused here: exercise the route hooks without loading the renderer or physics dependencies.
vm.runInContext(load("graph.js").replace(/^import .*;\r?\n/gm, ""), context);
window.LabGraph.show();
window.LabGraph.hide();
pendingShow();
assert.equal(vm.runInContext("started", context), false, "leaving before deferred show must not boot a hidden graph");
vm.runInContext("timeTimer = 42", context);
window.LabGraph.hide();
assert.equal(clearedTimer, 42);
assert.equal(element("#t-play").textContent, "▶");
// Polled datasets replace paper objects and can add/remove graph nodes without replacing UI listeners.
class ViewGraph {
  nodes = new Map();
  clear() { this.nodes.clear(); }
  addNode(id, attributes) { this.nodes.set(id, attributes); }
  hasNode(id) { return this.nodes.has(id); }
  getNodeAttributes(id) { return this.nodes.get(id); }
  forEachNode(fn) { this.nodes.forEach((a, id) => fn(id, a)); }
  updateEachNodeAttributes(fn) { this.nodes.forEach((a, id) => this.nodes.set(id, fn(id, a))); }
}
context.Graph = ViewGraph;
context.restart = () => { restarts++; };
vm.runInContext(`
  graph = new Graph(); buildGraph();
  graph.getNodeAttributes("p1").x = 7;
  renderer = { refresh() {}, setCustomBBox() {}, getCamera: () => ({ ratio: 1 }), graphToViewport: p => p };
  buildSim = () => {
    const nodes = [];
    graph.forEachNode((id, a) => nodes.push({ id, ...a }));
    sim = { stop() {}, nodes: () => nodes, force: () => ({ x() {}, y() {} }), alpha() { return this; }, restart };
  };
`, context);
lab.papers = [{ ...paper, title: "Updated" }, { ...paper, id: "p2" }];
Object.assign(window.LabUI.T, Object.fromEntries(lab.topics.map(t => [t.id, t])));
const dataListeners = listeners.get("lab:data").length;
for (const callback of listeners.get("lab:data")) callback();
assert.equal(vm.runInContext('PA.p1.title', context), "Updated");
assert.equal(vm.runInContext('graph.hasNode("p2")', context), true);
assert.equal(vm.runInContext('graph.getNodeAttributes("p1").x', context), 7, "polling preserves the user's layout");
vm.runInContext('state.selected = "p1"', context);
lab.papers = [lab.papers[1]];
for (const callback of listeners.get("lab:data")) callback();
assert.equal(vm.runInContext('graph.hasNode("p1")', context), false);
assert.equal(vm.runInContext("state.selected", context), null);
assert.equal(listeners.get("lab:data").length, dataListeners);
// Leaving during the flip cancels its frame and must not restart hidden physics.
vm.runInContext('visible = true; flipAxis("method")', context);
assert.equal(typeof pendingFrame, "function");
window.LabGraph.hide();
assert.equal(cancelledFrame, 99);
assert.equal(vm.runInContext("flipping", context), false);
assert.equal(vm.runInContext('graph.getNodeAttributes("p2").x', context), 20);
assert.equal(restarts, 0);
// Read all label sizes before placing any label: no forced layout per tag during camera animation.
const layout = [];
element("#tag-labels").children = [0, 1].map(i => ({
  style: { set transform(value) { layout.push(`place${i}`); } }, classList: { toggle() {} },
  get offsetWidth() { layout.push(`width${i}`); return 20; },
  get offsetHeight() { layout.push(`height${i}`); return 10; },
}));
Object.assign(element("#graph"), { clientWidth: 300, clientHeight: 200 });
element("#regions").getContext = () => ({ setTransform() {}, clearRect() {} });
vm.runInContext('visible = true; state.layers.regions = false; areas = [{ x: 60, y: 60 }, { x: 160, y: 60 }]; drawOverlay()', context);
assert.ok(layout.indexOf("height1") < layout.indexOf("place0"), "all reads precede the first placement write");
window.LabGraph.hide();
// Enter on Cancel must be handled by the focused button, never converted to confirmation.
const keyListeners = new Set();
let alert;
const authDocument = {
  body: { appendChild(node) { alert = node; }, classList: { add() {} } },
  documentElement: { dataset: {} },
  querySelector: () => null,
  createElement: () => ({ dataset: {}, setAttribute() {}, querySelector: () => ({ focus() {} }), remove() {} }),
  addEventListener(type, callback) { if (type === "keydown") keyListeners.add(callback); },
  removeEventListener(type, callback) { if (type === "keydown") keyListeners.delete(callback); },
};
window.Store.auth = { current: () => null };
vm.runInNewContext(load("auth.js"), { window, document: authDocument, I18N: window.I18N, LabGate() {} });
const confirmed = window.LabConfirm("Delete?");
for (const callback of keyListeners) callback({ key: "Enter" });
alert.onclick({ target: { closest: () => ({ dataset: { v: "0" } }) } });
assert.equal(await confirmed, false);
// Route arguments decode once, including literal percent signs; malformed links still render safely.
const router = load("app.js").split("// ---------- routing ----------")[1].split("  window.I18N.apply();")[0];
let routed;
const location = { hash: "#/topic/m%3A100%25" }, pages = { topic: { render: (_, arg) => { routed = arg; } } };
const routeContext = vm.createContext({ window: { LabPages: pages, addEventListener() {}, scrollTo() {} }, location,
  history: {}, URLSearchParams, document: { querySelectorAll: () => [] }, closeDrawer() {} });
vm.runInContext(router + "\nroute();", routeContext);
assert.equal(routed, "m:100%");
location.hash = "#/topic/%"; vm.runInContext("route();", routeContext); assert.equal(routed, "");
// A blocked leave restores the previous hash and does not render the destination.
pages.topic.leave = () => false;
vm.runInContext("history.replaceState = (_, __, hash) => { location.hash = hash; };", routeContext);
location.hash = "#/home";
vm.runInContext('route({ type: "hashchange" });', routeContext);
assert.equal(location.hash, "#/topic/%");
assert.equal(routed, "");
delete pages.topic.leave;
// Encoded paper IDs must not fill recent results with duplicates.
let stored = '["paper%id"]';
vm.runInNewContext(load("spotlight.js"), { window, I18N: window.I18N, location: { hash: "#/paper/paper%25id" },
  document: { getElementById: () => null, addEventListener() {} },
  localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } } });
window.LabUI.PA = { "paper%id": {} };
for (const callback of listeners.get("hashchange")) callback();
assert.deepEqual(JSON.parse(stored), ["paper%id"]);
// Exercise the real write-page handlers: cancel keeps edits, ordinary drafts survive navigation.
const writeNodes = new Map(), writeEvents = {};
const writeNode = selector => {
  if (!writeNodes.has(selector)) writeNodes.set(selector, { value: "", textContent: "", handlers: {},
    querySelector: writeNode, querySelectorAll: () => [], appendChild() {},
    addEventListener(type, callback) { this.handlers[type] = callback; } });
  return writeNodes.get(selector);
};
const writeView = writeNode("view");
Object.defineProperty(writeView, "innerHTML", { set() { writeNodes.clear(); } });
let savedDraft = null, confirmLeave, resolveLookup;
const writeLocation = { hash: "#/write" }, writeUI = { esc: String, R: { r: { id: "r", person: "u", paper: "p", date: "2026-10-01", content: "original", rating: 4 } },
  PA: { p: { title: "Paper", reviews: ["r"] } }, ratingInput: () => "", paintRatingInput() {}, wireRatingInput() {}, T: {} };
const writeStore = { auth: { current: () => ({ id: "u" }) }, terms: { current: () => ({ start: "2026-01-01", end: "2026-12-31" }), list: () => [] },
  today: () => "2026-10-01", findPaper: () => null, suggestTags: () => ({ tags: [], similar: [] }),
  drafts: { get: () => savedDraft, save: data => { savedDraft = structuredClone(data); return "2026-10-01T12:00:00Z"; } },
  lookup: () => new Promise(resolve => { resolveLookup = resolve; }) };
const writeWindow = { I18N: window.I18N, LabUI: writeUI, Store: writeStore,
  addEventListener(type, callback) { writeEvents[type] = callback; } };
vm.runInNewContext(load("write.js"), { window: writeWindow, I18N: window.I18N, location: writeLocation,
  document: { createElement: () => writeView, querySelector: writeNode },
  LabConfirm: () => new Promise(resolve => { confirmLeave = resolve; }), setTimeout: () => 1, clearTimeout() {} });
const writePage = writeWindow.LabPages.write, change = () => writeNode("#w-form").handlers.input({ target: { id: "w-content" } });
writePage.render(new URLSearchParams());
writeNode("#w-title").value = "Draft"; writeNode("#w-content").value = "Keep this"; change();
writePage.leave();
writePage.render(new URLSearchParams());
assert.equal(writeNode("#w-content").value, "Keep this", "navigation restores the new diary draft");
change();
let unloadBlocked = false;
writeEvents.beforeunload({ preventDefault() { unloadBlocked = true; } });
assert.equal(unloadBlocked, false, "a saved draft does not need a discard warning");
writePage.render(new URLSearchParams("review=r"));
writeNode("#w-content").value = "Edited text"; change(); writeLocation.hash = "#/me";
assert.equal(writePage.leave(), false);
writeLocation.hash = "#/write?review=r"; confirmLeave(false); await Promise.resolve();
assert.equal(writeNode("#w-content").value, "Edited text");
assert.equal(writeLocation.hash, "#/write?review=r", "Cancel stays on the editor");
writeLocation.hash = "#/me"; assert.equal(writePage.leave(), false);
writeLocation.hash = "#/write?review=r"; confirmLeave(true); await Promise.resolve();
assert.equal(writeLocation.hash, "#/me", "Discard retries the requested navigation");
assert.notEqual(writePage.leave(), false);
writePage.render(new URLSearchParams());
writeNode("#w-lookup").value = "Other paper";
const lookupDone = writeNode("#w-fetch").handlers.click();
writePage.leave(); resolveLookup({ title: "Late lookup" }); await lookupDone;
assert.equal(writeNode("#w-title").value, "Draft", "lookup completion cannot rewrite a diary after navigation");
// Regular-study cards retain safe routes when IDs contain percent signs or quotes.
const groupWindow = { I18N: window.I18N, LabUI: { esc: String, avStack: () => "" }, addEventListener() {},
  Store: { groups: { sessions: () => [], upcoming: () => null, nextDate: () => null } } };
vm.runInNewContext(load("groups.js"), { window: groupWindow, I18N: window.I18N,
  document: { createElement: () => ({}), querySelector: () => ({ appendChild() {} }) } });
assert.ok(groupWindow.LabGroups.tile({ id: 'g%"/', title: "Study", members: [] }).includes('href="#/group/g%25%22%2F"'));
// Group edits survive cancelled navigation; saves are single-flight and failures keep the input.
const groupNodes = new Map(), groupEvents = {};
const groupNode = selector => {
  if (!groupNodes.has(selector)) groupNodes.set(selector, { value: "", disabled: false, textContent: "",
    querySelector: groupNode, querySelectorAll: () => [], appendChild() {} });
  return groupNodes.get(selector);
};
const groupView = groupNode("view"), groupForm = groupNode("#grp-form");
for (const field of ["title", "desc", "place", "weekday", "time", "every"]) groupForm[field] = { value: field === "title" ? "Study" : "" };
let groupConfirm, resolveGroup, rejectGroup, groupCreates = 0;
const groupLocation = { hash: "#/group/new" };
const formWindow = { I18N: window.I18N, LabUI: { esc: String, P: {} },
  Store: { auth: { current: () => ({ id: "u" }) }, groups: { create: () => {
    groupCreates++; return new Promise((resolve, reject) => { resolveGroup = resolve; rejectGroup = reject; });
  } } }, addEventListener(type, callback) { groupEvents[type] = callback; } };
vm.runInNewContext(load("groups.js"), { window: formWindow, I18N: window.I18N, location: groupLocation,
  LabConfirm: () => new Promise(resolve => { groupConfirm = resolve; }),
  document: { createElement: () => groupView, querySelector: groupNode } });
const groupPage = formWindow.LabPages.group;
groupPage.render(new URLSearchParams(), "new");
groupForm.oninput();
let groupUnloadBlocked = false;
groupEvents.beforeunload({ preventDefault() { groupUnloadBlocked = true; } });
assert.equal(groupUnloadBlocked, true);
groupLocation.hash = "#/study"; assert.equal(groupPage.leave(), false);
groupLocation.hash = "#/group/new"; groupConfirm(false); await Promise.resolve();
assert.equal(groupLocation.hash, "#/group/new");
assert.equal(groupForm.title.value, "Study");
const submitGroup = () => groupForm.onsubmit({ preventDefault() {} });
const failedGroup = submitGroup(); await submitGroup();
assert.equal(groupCreates, 1, "rapid submit must create only one group");
assert.equal(groupPage.leave(), false, "navigation cannot race a pending save");
rejectGroup(new Error("forbidden")); await failedGroup;
assert.equal(groupNode("#grp-err").textContent, "forbidden");
assert.equal(groupForm.title.value, "Study");
const savedGroup = submitGroup(); resolveGroup('g%"/'); await savedGroup;
assert.equal(groupLocation.hash, "#/group/g%25%22%2F");
assert.notEqual(groupPage.leave(), false, "successful saves must not ask to discard");
// Async tag creation must not tag another diary opened while the request was pending.
let resolveTag, tagCreates = 0;
writeStore.tags = { create: () => { tagCreates++; return new Promise(resolve => { resolveTag = resolve; }); } };
writePage.render(new URLSearchParams());
writeNode("#w-tag-q").value = "New field";
const tagClick = { target: { closest: () => ({ dataset: { new: "domain" } }) } };
const createTag = writeNode("#w-tag-pop").onclick(tagClick);
await writeNode("#w-tag-pop").onclick(tagClick);
assert.equal(tagCreates, 1);
writePage.render(new URLSearchParams());
resolveTag("d:new"); await createTag;
assert.equal(writeNode("#w-tags").innerHTML, "", "late tag completion must not modify a different form");
// Browser study creation reports group conflicts without leaving the form or double-submitting.
let studyCreates = 0, rejectStudy;
const newStudy = load("study.js").split("  function newPage(params) {")[1].split("  // ---------------------------------------------------------------- detail")[0];
const studyFormContext = vm.createContext({ view: groupView, $: groupNode, back: "", t: key => key, esc: String,
  UI: { P: {}, PA: {} }, S: { auth: { current: () => ({ id: "u", name: "User" }) }, groups: { get: () => null },
    findPaper: () => null, studies: { create: () => { studyCreates++; return new Promise((_, reject) => { rejectStudy = reject; }); } } },
  paperSearch: () => ({ id: null }), location: {}, LabToast() {}, URLSearchParams });
vm.runInContext("function newPage(params) {" + newStudy + "\nnewPage(new URLSearchParams());", studyFormContext);
groupNode("#st-title").value = "Paper";
const studyForm = groupNode("#st-form");
const submitStudy = () => studyForm.onsubmit({ preventDefault() {}, currentTarget: studyForm });
const pendingStudy = submitStudy(); await submitStudy();
assert.equal(studyCreates, 1);
rejectStudy(new Error("group.upcoming")); await pendingStudy;
assert.equal(groupNode("#st-err").textContent, "group.upcoming");
assert.equal(groupNode("#st-title").value, "Paper");
// Notification payload IDs stay inside attributes and route as literal IDs.
const notifLocation = {}, notifId = 'g%"/?x=1&next=bad';
const notifContext = vm.createContext({ window: {}, location: notifLocation,
  esc: value => String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  t: key => key, UI: { avatar: () => "", PA: {} }, LabNotifText: () => "", ago: () => "",
  S: { notifications: { list: () => [{ id: "n", type: "groupJoin", groupId: notifId }] } } });
const notifSource = load("auth.js");
vm.runInContext("function notifMenu() {" + notifSource.split("  function notifMenu() {")[1].split("  function wireNotif")[0], notifContext);
assert.ok(vm.runInContext("notifMenu()", notifContext).includes('data-group="g%&quot;/?x=1&amp;next=bad"'));
vm.runInContext("function openNotif(d) {" + notifSource.split("  function openNotif(d) {")[1].split("  window.LabOpenNotif")[0], notifContext);
notifContext.payload = { group: notifId, type: "groupSession" };
vm.runInContext("openNotif(payload)", notifContext);
assert.equal(notifLocation.hash, "#/study/new?group=" + encodeURIComponent(notifId));
console.log("Frontend cache and lifecycle regressions passed.");
