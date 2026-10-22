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
const formHelpers = globals => vm.runInNewContext(load("app.js").split("  function leaveGuard(")[1]
  .split("  window.LabUI =")[0].replace(/^/, "function leaveGuard(") + "\n({ leaveGuard, submitOnce })", { t: window.I18N.t, ...globals });
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
    simById = Object.fromEntries(nodes.map(n => [n.id, n]));
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
assert.equal(vm.runInContext("simById.p2.ax", context), 20);
assert.equal(vm.runInContext("simById.p2.ay", context), 30);
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
let savedDraft = null, confirmLeave, resolveLookup, published = 0;
const writeLocation = { hash: "#/write" }, writeUI = { esc: String, R: { r: { id: "r", person: "u", paper: "p", date: "2026-10-01", content: "original", rating: 4 } },
  PA: { p: { title: "Paper", reviews: ["r"] } }, ratingInput: () => "", paintRatingInput() {}, wireRatingInput() {}, T: {} };
const writeStore = { auth: { current: () => ({ id: "u" }) }, terms: { current: () => ({ start: "2026-01-01", end: "2026-12-31" }), list: () => [] },
  today: () => "2026-10-01", findPaper: () => null, suggestTags: () => ({ tags: [], similar: [] }),
  drafts: { get: () => savedDraft, save: data => { savedDraft = structuredClone(data); return "2026-10-01T12:00:00Z"; } },
  lookup: () => new Promise(resolve => { resolveLookup = resolve; }) };
const writeWindow = { I18N: window.I18N, LabUI: writeUI, Store: writeStore,
  addEventListener(type, callback) { (writeEvents[type] ||= []).push(callback); } };
Object.assign(writeUI, formHelpers({ window: writeWindow, location: writeLocation,
  LabConfirm: () => new Promise(resolve => { confirmLeave = resolve; }) }));
vm.runInNewContext(load("write.js"), { window: writeWindow, I18N: window.I18N, location: writeLocation,
  document: { createElement: () => writeView, querySelector: writeNode },
  LabConfirm: () => new Promise(resolve => { confirmLeave = resolve; }), setTimeout: () => 1, clearTimeout() {},
  LabReload() {
    let blocked = false;
    writeEvents.beforeunload.forEach(callback => callback({ preventDefault() { blocked = true; } }));
    assert.equal(blocked, false, "successful publishing must not warn before reloading");
    published++;
  } });
const writePage = writeWindow.LabPages.write, change = () => writeNode("#w-form").handlers.input({ target: { id: "w-content" } });
writePage.render(new URLSearchParams());
writeNode("#w-title").value = "Draft"; writeNode("#w-content").value = "Keep this"; change();
writePage.leave();
writePage.render(new URLSearchParams());
assert.equal(writeNode("#w-content").value, "Keep this", "navigation restores the new diary draft");
change();
let unloadBlocked = false;
writeEvents.beforeunload.forEach(callback => callback({ preventDefault() { unloadBlocked = true; } }));
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
Object.assign(groupWindow.LabUI, formHelpers({ window: groupWindow }));
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
Object.assign(formWindow.LabUI, formHelpers({ window: formWindow, location: groupLocation,
  LabConfirm: () => new Promise(resolve => { groupConfirm = resolve; }) }));
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
// Uploads and publishing block navigation; publishing remains single-flight and releases the reload guard.
let resolveUpload, resolvePublish, reviewSaves = 0;
writeUI.R.r.tags = ["d:field"]; writeUI.safeColor = () => ""; writeUI.kb = () => "";
writeStore.files = { kindOf: () => "pdf", limits: { pdf: 1000 },
  put: () => new Promise(resolve => { resolveUpload = resolve; }) };
writeStore.reviews = { update: () => { reviewSaves++; return new Promise(resolve => { resolvePublish = resolve; }); } };
writePage.render(new URLSearchParams("review=r"));
writeNode("#w-file").files = [{ type: "application/pdf", name: "Paper.pdf", size: 10 }];
writeNode("#w-file").onchange();
assert.equal(writePage.leave(), false, "uploading blocks navigation");
await writeNode("#w-form").onsubmit({ preventDefault() {} });
assert.equal(reviewSaves, 0, "publishing must wait for uploads");
resolveUpload({ id: "f", kind: "pdf", name: "Paper.pdf", size: 10 }); await new Promise(resolve => setTimeout(resolve));
const publish = () => writeNode("#w-form").onsubmit({ preventDefault() {} });
const publishing = publish(); await publish();
assert.equal(reviewSaves, 1, "rapid submit publishes once");
assert.equal(writePage.leave(), false, "publishing blocks navigation");
resolvePublish(); await publishing;
assert.equal(published, 1);
// Browser study creation reports group conflicts without leaving the form or double-submitting.
let studyCreates = 0, rejectStudy;
const newStudy = load("study.js").split("  function newPage(params) {")[1].split("  // ---------------------------------------------------------------- detail")[0];
const studyFormContext = vm.createContext({ view: groupView, $: groupNode, back: "", t: key => key, esc: String,
  UI: { P: {}, PA: {}, submitOnce: formWindow.LabUI.submitOnce }, S: { auth: { current: () => ({ id: "u", name: "User" }) }, groups: { get: () => null },
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
// AI connection snippets carry the current origin/token; switching also changes what Copy copies.
const meSource = load("me.js"), aiNodes = new Map();
const aiNode = selector => {
  if (!aiNodes.has(selector)) aiNodes.set(selector, { innerHTML: "", textContent: "", value: "", disabled: false });
  return aiNodes.get(selector);
};
const clients = ["claude", "codex", "omp"].map(client => ({
  dataset: { client }, setAttribute(key, value) { this[key] = value; },
}));
const copies = ["token", "snippet", "cmd"].map(copy => ({ dataset: { copy } }));
const aiModal = { querySelectorAll: selector => selector === "[data-client]" ? clients : copies };
let copied;
aiNode("#ai-form").label = { value: "Laptop", focus() {} };
const aiContext = vm.createContext({ $: aiNode, t: key => key, esc: String,
  location: { origin: "https://lab.example" }, LabModal: () => aiModal,
  S: { tokens: { create: async () => ({ token: "secret-token" }) } },
  LabCopy: text => { copied = text; }, aiTokens() {}, setTimeout() {}, console });
vm.runInContext("function newToken() {" + meSource.split("  function newToken() {")[1]
  .split("  // calendar cells:")[0] + "\nnewToken();", aiContext);
await aiNode("#ai-form").onsubmit({ preventDefault() {} });
assert.equal(aiNode("#ai-snippet").textContent,
  'claude mcp add --transport http labsidian https://lab.example/mcp --header "Authorization: Bearer secret-token"');
assert.equal(clients[0]["aria-pressed"], "true");
clients[1].onclick(); copies[1].onclick();
assert.equal(copied, '[mcp_servers.labsidian]\nurl = "https://lab.example/mcp"\nhttp_headers = { Authorization = "Bearer secret-token" }');
clients[2].onclick(); copies[1].onclick();
assert.deepEqual(JSON.parse(copied), { mcpServers: { labsidian: { type: "http",
  url: "https://lab.example/mcp", headers: { Authorization: "Bearer secret-token" } } } });
assert.equal(clients[0]["aria-pressed"], "false");
copies[0].onclick(); assert.equal(copied, "secret-token");
copies[2].onclick(); assert.ok(copied.startsWith("claude mcp add labsidian -e LABSIDIAN_URL=https://lab.example"));
assert.ok(aiNode(".modal").innerHTML.includes("<details><summary>me.aiDev</summary>"));
// Writing rules use the shared single-flight helper, report failures, and survive token list refreshes.
let styleReady = false, styleCalls = 0, resolveStyle, failStyle = false;
const styleNodes = new Map();
const styleNode = selector => {
  if (selector === "#me-style-form" && !styleReady) return null;
  if (!styleNodes.has(selector)) styleNodes.set(selector, { value: "", textContent: "",
    querySelector: () => styleNode("submit") });
  return styleNodes.get(selector);
};
const styleBox = styleNode("#me-ai");
Object.defineProperty(styleBox, "innerHTML", { set(html) { styleReady = true; this.markup = html; } });
styleBox.querySelectorAll = () => [];
const styleContext = vm.createContext({ $: styleNode, view: {}, t: key => key, esc: String,
  UI: { submitOnce: formWindow.LabUI.submitOnce }, newToken() {}, LabToast() {}, console: { warn() {} },
  S: { auth: { current: () => ({ style: "Existing rules" }), setStyle: text => {
    assert.equal(text, "New rules"); styleCalls++;
    return failStyle ? Promise.reject(new Error("private server detail")) : new Promise(resolve => { resolveStyle = resolve; });
  } }, tokens: { list: async () => [] } } });
vm.runInContext("async function aiTokens() {" + meSource.split("  async function aiTokens() {")[1]
  .split("  // shown once:")[0], styleContext);
await vm.runInContext("aiTokens()", styleContext);
assert.ok(styleBox.markup.includes("Existing rules"));
const styleForm = styleNode("#me-style-form");
styleNode("#me-style").value = "New rules";
const saveStyle = () => styleForm.onsubmit({ preventDefault() {} });
const styleSaving = saveStyle(); await saveStyle();
assert.equal(styleCalls, 1); assert.equal(styleNode("submit").disabled, true);
resolveStyle(); await styleSaving; assert.equal(styleNode("submit").disabled, false);
failStyle = true; await saveStyle();
assert.equal(styleNode("#me-style-err").textContent, "me.aiStyleFail");
styleNode("#me-style").value = "Unsaved rules";
await vm.runInContext("aiTokens()", styleContext);
assert.equal(styleNode("#me-style").value, "Unsaved rules");
console.log("Frontend cache and lifecycle regressions passed.");
