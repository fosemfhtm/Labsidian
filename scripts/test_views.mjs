/* Headless regressions for chart caching and graph route cleanup. Run: node scripts/test_views.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const listeners = new Map();
const paper = { id: "p1", x: 0, y: 0, reviews: [], domains: ["field"], methods: ["one"] };
const lab = { papers: [paper], reviews: [], people: [], topics: [
  { id: "d:field", axis: "domain", label: "Old" }, { id: "m:one", axis: "method", label: "One" },
] };
const elements = new Map();
const element = selector => {
  if (!elements.has(selector)) elements.set(selector, { textContent: "", innerHTML: "" });
  return elements.get(selector);
};
let pendingShow;
let clearedTimer;
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
  localStorage: { getItem: () => null }, matchMedia: () => ({ matches: false }),
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
const groupWindow = { I18N: window.I18N, LabUI: { esc: String, avStack: () => "" },
  Store: { groups: { sessions: () => [], upcoming: () => null, nextDate: () => null } } };
vm.runInNewContext(load("groups.js"), { window: groupWindow, I18N: window.I18N,
  document: { createElement: () => ({}), querySelector: () => ({ appendChild() {} }) } });
assert.ok(groupWindow.LabGroups.tile({ id: 'g%"/', title: "Study", members: [] }).includes('href="#/group/g%25%22%2F"'));
console.log("Frontend cache and lifecycle regressions passed.");
