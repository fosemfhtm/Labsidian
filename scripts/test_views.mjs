/* Headless regressions for chart caching and graph route cleanup. Run: node scripts/test_views.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const listeners = new Map();
let methodReads = 0;
const paper = { id: "p1", x: 0, y: 0, a: "a1", c: "c1", f: "f1", reviews: [],
  get methods() { methodReads++; return ["one"]; } };
const lab = { papers: [paper], reviews: [], people: [], clusters: [{ id: "a1", level: "a", ko: "Old" }] };
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
  LabUI: { P: {}, T: {}, R: {}, CL: {}, esc: String, clusterName: c => c.ko, currentView: () => "home" },
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
assert.equal(viz.areas()[0].name, "Old");
const methods = viz.methodAxes();
const reads = methodReads;
assert.equal(viz.methodAxes(), methods);
assert.equal(methodReads, reads, "method axes must not rescan every paper for every legend count");
lab.clusters[0].ko = "New";
for (const callback of listeners.get("lab:data")) callback();
assert.equal(viz.areas()[0].name, "New", "LAB is mutated in place when polling");
assert.notEqual(viz.methodAxes(), methods);

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
vm.runInContext("graph = { getNodeAttributes() { return { x: 10, y: 20 }; } }", context);
const centroids = vm.runInContext("clusterCentroids()", context);
assert.equal(centroids.c1.x, 10);
assert.equal(vm.runInContext("clusterCentroids()", context), centroids, "camera-only frames reuse cluster centroids");
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
console.log("Frontend cache and lifecycle regressions passed.");
