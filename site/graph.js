/* Labsidian graph — one view: semantic map + live network.
 *   position : papers are anchored at their SPECTER2/UMAP position (title+abstract → "what the paper is about")
 *   edges    : person ─ paper (who read it). Nothing else, so the picture stays readable.
 *   colour   : node = first reader, white ring = read by 2+ people; background regions = topic clusters
 *   physics  : d3-force — drag anything, people settle among the papers they read.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { NodeBorderProgram } from "@sigma/node-border";
import { contourDensity } from "d3-contour";
import { forceSimulation, forceManyBody, forceLink, forceX, forceY, forceCollide } from "d3-force";

const D = window.LAB, UI = window.LabUI, { t } = window.I18N;
const { P, T, R, CL, esc, clusterName } = UI;
const $ = s => document.querySelector(s);

const papers = D.papers.filter(p => p.x != null);
const PA = Object.fromEntries(papers.map(p => [p.id, p]));
papers.forEach(p => {
  const first = [...p.reviews].map(r => R[r]).sort((a, b) => a.date.localeCompare(b.date))[0];
  p._first = first?.person;
});
const reviewDates = [...new Set(D.reviews.map(r => r.date))].sort();
const years = papers.map(p => p.year).filter(Boolean);
const YMIN = Math.min(...years, 2000), YMAX = Math.max(...years, 2026);

const venueCount = {};
papers.forEach(p => p.venueNorm && (venueCount[p.venueNorm] = (venueCount[p.venueNorm] || 0) + 1));
const venuesSorted = Object.entries(venueCount).sort((a, b) => b[1] - a[1]);
// top venues get system colours in this order; the rest are "other" (gray) — docs/design/data-viz.md §2
const VENUE_NAMES = ["blue", "red", "green", "orange", "purple", "cyan", "yellow", "teal", "pink", "indigo"];
const venueName = Object.fromEntries(venuesSorted.slice(0, VENUE_NAMES.length).map(([v], i) => [v, VENUE_NAMES[i]]));

const DEFAULT_PHYSICS = { repel: 8, link: 0.5, anchor: 0.18 };
const state = {
  colorBy: "person", people: new Set(), tags: new Set(), methods: new Set(), venues: new Set(), vtypes: new Set(),
  yearMin: YMIN, yearMax: YMAX, yearUnknown: true, minRating: 0, sharedOnly: false, mode: "dim",
  layers: { links: true, regions: true, labels: true, timeline: false },
  physics: { ...DEFAULT_PHYSICS },
  timeIdx: reviewDates.length - 1, selected: null, depth: 1, hovered: null, find: null,
};
let focusSet = null, hoverSet = null, matchCache = new Map();
let graph, renderer, sim, simById = {}, started = false;

// ---------------- colours ----------------
// sigma's WebGL blending makes low-alpha colours look nearly opaque → pre-blend over the background
const CSSV = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hexRgb = h => { h = (h || "").replace("#", ""); if (h.length === 3) h = [...h].map(c => c + c).join(""); const n = parseInt(h || "8e8e93", 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = rgb => "#" + rgb.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
// any colour the data uses — "#rrggbb", "rgb(var(--teal))", a system colour name — as #rrggbb for the current theme
let HEXC = {};
const hex = c => HEXC[c] ??= hexOf(c);
const hexOf = c => {
  c = String(c || "");
  if (c[0] === "#") return toHex(hexRgb(c));
  const name = (c.match(/var\(--([a-z0-9]+)\)/) || [, c])[1];
  const v = CSSV("--" + name).split(/\s+/).map(Number);
  return v.length === 3 && v.every(n => !isNaN(n)) ? toHex(v) : toHex(hexRgb(CSSV("--sys-bg")));
};
let BG, DARK, THEME, MIX = {}, venueColor = {}, yearStops = [];
const YEAR_NAMES = ["blue", "cyan", "green", "yellow", "orange"];   // old → new
// read the theme's colours (again after the theme changes: retheme())
function readTheme() {
  HEXC = {}; MIX = {};
  BG = hexRgb(hex(CSSV("--sys-bg"))); DARK = BG[0] + BG[1] + BG[2] < 384;
  THEME = {
    ring: CSSV("--label"), label: CSSV("--label"), label2: CSSV("--label-2"),   // ring = "read by 2+ people"
    halo: `rgba(${BG.join(",")},0.92)`, box: CSSV("--sys-bg-3"), boxLine: CSSV("--separator"),
    font: CSSV("--font"), dim: hex("gray5"), dimPerson: hex("gray4"), other: hex("gray"), unknown: hex("gray2"),
  };
  venueColor = Object.fromEntries(Object.entries(venueName).map(([v, n]) => [v, hex(n)]));
  yearStops = YEAR_NAMES.map(hex);
}
readTheme();
function fade(hex, a) {
  const key = hex + a;
  if (MIX[key]) return MIX[key];
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return (MIX[key] = "#" + c.map((v, i) => Math.round(BG[i] + (v - BG[i]) * a).toString(16).padStart(2, "0")).join(""));
}
function yearColor(y) {
  if (!y) return THEME.unknown;
  const k = (y - YMIN) / Math.max(1, YMAX - YMIN) * (yearStops.length - 1);
  const i = Math.min(yearStops.length - 2, Math.floor(k)), f = k - i;
  const a = hexRgb(yearStops[i]), b = hexRgb(yearStops[i + 1]);
  return toHex(a.map((v, j) => v + (b[j] - v) * f));
}
function paperColor(p) {
  if (state.colorBy === "year") return yearColor(p.year);
  if (state.colorBy === "venue") return venueColor[p.venueNorm] || THEME.other;
  return P[p._first]?.color ? hex(P[p._first].color) : THEME.other;
}

// ---------------- filters ----------------
function matches(p) {
  if (matchCache.has(p.id)) return matchCache.get(p.id);
  const s = state;
  const ok = (!s.people.size || p.readers.some(r => s.people.has(r))) &&
    (!s.tags.size || p.domains.some(d => s.tags.has(d))) &&
    (!s.methods.size || p.methods.some(m => s.methods.has(m))) &&
    (!s.venues.size || s.venues.has(p.venueNorm)) &&
    (!s.vtypes.size || s.vtypes.has(p.venueType)) &&
    (p.year ? p.year >= s.yearMin && p.year <= s.yearMax : s.yearUnknown) &&
    (!s.minRating || p.rating >= s.minRating) &&
    (!s.sharedOnly || p.readers.length > 1);
  matchCache.set(p.id, ok);
  return ok;
}
const inTime = p => !state.layers.timeline || p.firstDate <= reviewDates[state.timeIdx];
const activeFilterCount = () => {
  const s = state;
  return s.people.size + s.tags.size + s.methods.size + s.venues.size + s.vtypes.size + (s.minRating ? 1 : 0) + (s.sharedOnly ? 1 : 0) +
    (s.yearMin !== YMIN || s.yearMax !== YMAX || !s.yearUnknown ? 1 : 0);
};
function nodeOn(n, a = graph.getNodeAttributes(n)) {
  if (a.kind === "person") return !state.people.size || state.people.has(n.slice(2)) || state.mode === "dim";
  const p = PA[n];
  return inTime(p) && (state.mode === "dim" || matches(p));
}

// ---------------- graph ----------------
// a big lab draws its nodes a little smaller (1 up to ~900 papers, 0.8 at ~2300) so the overview doesn't turn into a carpet;
// people shrink by the same factor — their size grows with their diary count, which grows with every term shown
const PAPER_SCALE = Math.min(1, Math.pow(900 / Math.max(1, papers.length), 0.25));
function buildGraph() {
  graph = new Graph();
  papers.forEach(p => graph.addNode(p.id, {
    kind: "paper", type: "border", x: p.x, y: p.y, ax: p.x, ay: p.y,
    size: PAPER_SCALE * Math.min(9, 3 + (p.reviews.length - 1) * 1.5 + (p.rating >= 4 ? 0.7 : 0)),
    label: p.title.length > 46 ? p.title.slice(0, 44) + "…" : p.title,
    borderSize: p.readers.length > 1 ? 0.28 : 0,
  }));
  D.people.forEach(u => {
    const mine = papers.filter(p => p.readers.includes(u.id));
    if (!mine.length) return; // new members appear once they've written something
    const x = mine.reduce((s, p) => s + p.x, 0) / (mine.length || 1), y = mine.reduce((s, p) => s + p.y, 0) / (mine.length || 1);
    graph.addNode("u:" + u.id, {
      kind: "person", type: "border", x, y, ax: x, ay: y, size: PAPER_SCALE * (10 + Math.sqrt(u.count) * 0.55), label: u.name, color: u.color,
      borderSize: 0.16, forceLabel: true,
    });
  });
  papers.forEach(p => p.readers.forEach(r => graph.hasNode("u:" + r) && graph.addEdge("u:" + r, p.id, { color: P[r].color })));
}

function neighborhood(start, depth) {
  const seen = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next = [];
    frontier.forEach(n => graph.forEachNeighbor(n, o => { if (!seen.has(o)) { seen.add(o); next.push(o); } }));
    frontier = next;
  }
  return seen;
}

// ---------------- physics ----------------
const anchorOf = d => (d.kind === "paper" ? state.physics.anchor : 0.1); // people stay among the papers they read
function buildSim() {
  const ph = state.physics;
  const nodes = [];
  graph.forEachNode((n, a) => nodes.push({ id: n, kind: a.kind, x: a.x, y: a.y, ax: a.ax, ay: a.ay, r: a.size }));
  simById = Object.fromEntries(nodes.map(s => [s.id, s]));
  const links = [];
  graph.forEachEdge((e, a, s, tg) => links.push({ source: s, target: tg }));
  sim = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(d => (d.kind === "paper" ? -ph.repel : -ph.repel * 3)).distanceMax(40).theta(0.9))
    .force("link", forceLink(links).id(d => d.id).distance(28).strength(() => ph.link * 0.05))
    .force("ax", forceX(d => d.ax).strength(anchorOf))
    .force("ay", forceY(d => d.ay).strength(anchorOf))
    .force("collide", forceCollide(d => d.r * 0.85 + 0.8).iterations(1))
    .alphaDecay(0.035)
    .on("tick", () => graph.updateEachNodeAttributes((n, a) => {
      const s = simById[n];
      a.x = s.x; a.y = s.y;
      return a;
    }, { attributes: ["x", "y"] }));
}
function applyPhysics() {
  const ph = state.physics;
  sim.force("charge").strength(d => (d.kind === "paper" ? -ph.repel : -ph.repel * 3));
  sim.force("link").strength(() => ph.link * 0.05);
  sim.force("ax").strength(anchorOf);
  sim.force("ay").strength(anchorOf);
  sim.alpha(0.5).restart();
}

// ---------------- reducers ----------------
function nodeReducer(node, data) {
  const res = { ...data };
  if (!nodeOn(node, data)) { res.hidden = true; return res; }
  const active = focusSet || hoverSet || state.find;
  if (data.kind === "person") {
    res.zIndex = 3; res.borderColor = toHex(BG);
    const filteredOut = state.people.size && !state.people.has(node.slice(2));
    if (filteredOut || (active && !active.has(node))) {
      res.color = THEME.dimPerson; res.zIndex = 1;
      if (filteredOut || active !== hoverSet) res.label = "";
    }
    return res;
  }
  const p = PA[node];
  res.color = paperColor(p);
  res.borderColor = THEME.ring;
  res.zIndex = 1;
  const dimmed = !matches(p) || (active && !active.has(node));
  if (dimmed) { res.color = THEME.dim; res.borderColor = THEME.dim; res.label = ""; res.zIndex = 0; res.size = data.size * 0.85; }
  else if (active && active.size < 16) res.forceLabel = true; // only small neighbourhoods, otherwise labels pile up
  if (node === state.selected || node === state.hovered) { res.highlighted = true; res.zIndex = 4; }
  return res;
}
function edgeReducer(edge, data) {
  const res = { ...data, size: 0.6 };
  const [s, tg] = graph.extremities(edge);
  if (!nodeOn(s) || !nodeOn(tg)) { res.hidden = true; return res; }
  const set = focusSet || hoverSet;
  if (set) {
    const center = state.selected || state.hovered;
    const on = set.has(s) && set.has(tg) && (s === center || tg === center || state.depth > 1);
    if (on) { res.color = fade(data.color, 0.9); res.size = 1.2; res.zIndex = 2; } else res.hidden = true;
    return res;
  }
  if (!state.layers.links) { res.hidden = true; return res; }
  const uid = s.slice(2), p = PA[tg];
  const dimmed = !matches(p) || (state.people.size && !state.people.has(uid));
  res.color = dimmed ? fade(THEME.other, 0.05) : fade(data.color, 0.22);
  return res;
}

// ---------------- label / hover drawing ----------------
function drawLabel(ctx, data) {
  if (!data.label || data.highlighted) return; // hovered/selected nodes get their label from drawHover
  paintLabel(ctx, data);
}
function paintLabel(ctx, data) {
  const person = data.kind === "person", fs = person ? 13 : 10.5;
  ctx.font = `${person ? 700 : 500} ${fs}px ${THEME.font}`;
  ctx.textAlign = "center";
  const y = data.y + data.size + fs + 1;
  ctx.lineWidth = 3.5; ctx.strokeStyle = THEME.halo; ctx.lineJoin = "round";
  ctx.strokeText(data.label, data.x, y);
  ctx.fillStyle = person ? THEME.label : THEME.label2;
  ctx.fillText(data.label, data.x, y);
  ctx.textAlign = "left";
}
function drawHover(ctx, data) {
  ctx.beginPath(); ctx.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
  ctx.strokeStyle = THEME.label; ctx.lineWidth = 1.5; ctx.stroke();
  if (data.kind === "person") return paintLabel(ctx, data);
  const fs = 12;
  ctx.font = `600 ${fs}px ${THEME.font}`;
  const label = data.label || "", w = ctx.measureText(label).width, x = data.x - w / 2, y = data.y + data.size + 8;
  ctx.fillStyle = THEME.box; ctx.strokeStyle = THEME.boxLine; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x - 8, y, w + 16, fs + 12, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = THEME.label; ctx.fillText(label, x, y + fs + 3);
}

// ---------------- regions + cluster labels ----------------
const regionCanvas = $("#regions"), labelLayer = $("#cluster-labels");
let regions = [];
function computeRegions() {
  const coarse = D.clusters.filter(c => c.level === "c");
  const pos = id => graph.getNodeAttributes(id);
  const xs = papers.map(p => pos(p.id).x), ys = papers.map(p => pos(p.id).y);
  const pad = 40, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const W = Math.ceil(Math.max(...xs) - x0 + pad), H = Math.ceil(Math.max(...ys) - y0 + pad);
  regions = coarse.map(c => {
    const pts = papers.filter(p => p.c === c.id).map(p => { const a = pos(p.id); return [a.x - x0, a.y - y0]; });
    if (pts.length < 4) return null;
    const cs = contourDensity().size([W, H]).cellSize(2).bandwidth(10).thresholds(12)(pts);
    const peak = cs[cs.length - 1]?.value || 1;
    const pick = cs.find(k => k.value >= peak * 0.12) || cs[0];
    return { c, rings: (pick?.coordinates || []).map(poly => poly[0].map(([x, y]) => [x + x0, y + y0])) };
  }).filter(Boolean);
}
function clusterCentroids() {
  const acc = {};
  papers.forEach(p => {
    const a = graph.getNodeAttributes(p.id);
    [p.c, p.f].forEach(cid => { const o = (acc[cid] ||= [0, 0, 0]); o[0] += a.x; o[1] += a.y; o[2]++; });
  });
  return Object.fromEntries(Object.entries(acc).map(([k, [x, y, n]]) => [k, { x: x / n, y: y / n }]));
}
function drawOverlay() {
  if (!renderer) return;
  const el = $("#graph"), dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
  if (regionCanvas.width !== w * dpr || regionCanvas.height !== h * dpr) {
    regionCanvas.width = w * dpr; regionCanvas.height = h * dpr;
    regionCanvas.style.width = w + "px"; regionCanvas.style.height = h + "px";
  }
  const ctx = regionCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const dimAll = !!(focusSet || state.find);
  const zr = renderer.getCamera().ratio;
  if (state.layers.regions) {
    ctx.globalAlpha = Math.max(0.35, Math.min(1, zr / 0.55));
    regions.forEach(({ c, rings }) => {
      ctx.beginPath();
      rings.forEach(ring => ring.forEach(([x, y], i) => {
        const v = renderer.graphToViewport({ x, y });
        i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y);
      }));
      ctx.closePath();
      const col = hex(c.color);
      ctx.fillStyle = col + (dimAll ? "08" : DARK ? "12" : "1c"); ctx.fill("evenodd");
      ctx.strokeStyle = col + (dimAll ? "14" : DARK ? "3a" : "66"); ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  const placed = [];
  const fits = (x, y, w2, h2) => {
    if (x < 0 || y < 0 || x + w2 > w || y + h2 > h) return false;
    if (placed.some(r => x < r.x + r.w && x + w2 > r.x && y < r.y + r.h && y + h2 > r.y)) return false;
    placed.push({ x, y, w: w2, h: h2 }); return true;
  };
  graph.forEachNode((n, a) => {
    if (a.kind !== "person" || !nodeOn(n, a)) return;
    const v = renderer.graphToViewport(a);
    placed.push({ x: v.x - 34, y: v.y - 14, w: 68, h: 46 });
  });
  const cents = clusterCentroids(), showCoarse = zr > 0.42, showFine = zr < 0.6;
  [...labelLayer.children].forEach(div => {
    const c = CL[div.dataset.id], pos = cents[c.id];
    if (!state.layers.labels || !pos || !(c.level === "c" ? showCoarse : showFine)) { div.style.display = "none"; return; }
    const v = renderer.graphToViewport(pos);
    div.style.display = "block";
    const bw = div.offsetWidth, bh = div.offsetHeight, x = v.x - bw / 2;
    const y = [0, -1, 1, -2, 2].map(k => v.y - bh / 2 + k * (bh + 6)).find(yy => fits(x, yy, bw, bh));
    if (y == null) { div.style.display = "none"; return; }
    div.style.transform = `translate(${x}px, ${y}px)`;
    div.classList.toggle("faded", dimAll);
  });
}
function buildLabels() {
  const sorted = [...D.clusters].sort((a, b) => (a.level === b.level ? b.size - a.size : a.level === "c" ? -1 : 1));
  labelLayer.innerHTML = sorted.map(c => {
    const col = c.level === "c" ? c.color : CL[c.parent]?.color;
    return c.level === "c"
      ? `<div class="cl coarse" data-id="${c.id}" style="--c:${col}"><b>${esc(clusterName(c))}</b><span>${esc((c.custom?.keywords || c.keywords).slice(0, 3).join(" · "))}</span></div>`
      : `<div class="cl fine" data-id="${c.id}" style="--c:${col}">${esc(clusterName(c))}</div>`;
  }).join("");
  labelLayer.onclick = e => {
    const div = e.target.closest(".cl"); if (!div) return;
    const c = CL[div.dataset.id], pos = clusterCentroids()[c.id];
    zoomTo(pos.x, pos.y, c.level === "c" ? 0.32 : 0.14);
    UI.openDrawer("cluster", c.id, { fromGraph: true });
  };
}

// ---------------- camera ----------------
function freeArea() {
  const el = $("#graph"), W = el.clientWidth, H = el.clientHeight;
  const drawerOpen = $("#drawer").classList.contains("open");
  const top = $("#g-toolbar").offsetHeight + 24;
  const left = innerWidth > 760 ? $("#g-people").offsetWidth + 24 : 0;
  const right = drawerOpen ? W - Math.min(520, W) : W - (innerWidth > 760 ? 60 : 0);
  const tl = $(".timeline"), bottom = H - (tl.offsetParent ? tl.offsetHeight + 24 : 12);
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, W, H, fw: right - left, fh: bottom - top };
}
function centerFramed(fx, fy, ratio, duration = 600) {
  const cam = renderer.getCamera();
  const a = renderer.framedGraphToViewport({ x: 0, y: 0 }), b = renderer.framedGraphToViewport({ x: 1, y: 0 });
  const k = Math.abs(b.x - a.x) * cam.ratio;
  const { cx, cy, W, H } = freeArea();
  const target = { x: fx - (cx - W / 2) * ratio / k, y: fy + (cy - H / 2) * ratio / k, ratio };
  duration ? cam.animate(target, { duration }) : cam.setState(target);
}
function fitNodes(duration = 600) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  graph.forEachNode((n, a) => {
    const v = renderer.graphToViewport(a);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  });
  const { fw, fh } = freeArea(), r = renderer.getCamera().ratio;
  const ratio = r * Math.max((x1 - x0) / Math.max(100, fw - 40), (y1 - y0) / Math.max(100, fh - 40));
  const c = renderer.viewportToFramedGraph({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
  centerFramed(c.x, c.y, ratio, duration);
}
function zoomTo(x, y, ratio) {
  const fg = renderer.viewportToFramedGraph(renderer.graphToViewport({ x, y }));
  centerFramed(fg.x, fg.y, ratio);
}

// ---------------- selection ----------------
function select(id, opts = {}) {
  if (!graph) return;
  if (id && !graph.hasNode(id)) id = null;
  state.selected = id;
  focusSet = id ? neighborhood(id, state.depth) : null;
  $("#focus-bar").hidden = !id;
  if (id) {
    const a = graph.getNodeAttributes(id);
    const name = a.kind === "paper" ? PA[id].title : a.label;
    $("#focus-name").textContent = name.length > 50 ? name.slice(0, 48) + "…" : name;
    if (opts.openDrawer) UI.openDrawer(a.kind === "paper" ? "paper" : "person", a.kind === "paper" ? id : id.slice(2), { fromGraph: true });
    if (opts.zoom) { const dd = renderer.getNodeDisplayData(id); centerFramed(dd.x, dd.y, a.kind === "paper" ? 0.22 : 0.5); }
  }
  renderer.refresh();
}

// ---------------- UI: toolbar popovers, people legend, settings ----------------
const chip = (id, label, color, on) =>
  `<button type="button" class="ui-chip" aria-pressed="${!!on}" data-id="${esc(id)}">${color ? `<span class="dot" style="background:${color}"></span>` : ""}${esc(label)}</button>`;
const toggleSet = (set, id) => (set.has(id) ? set.delete(id) : set.add(id));

function renderPopovers() {
  const s = state;
  const domCount = {}, metCount = {};
  papers.forEach(p => { p.domains.forEach(d => (domCount[d] = (domCount[d] || 0) + 1)); p.methods.forEach(m => (metCount[m] = (metCount[m] || 0) + 1)); });
  $("#pop-field .chips.dom").innerHTML = Object.entries(domCount).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => chip("d:" + k, `${UI.tl(T["d:" + k])} ${n}`, T["d:" + k].color, s.tags.has(k))).join("");
  $("#pop-field .chips.met").innerHTML = Object.entries(metCount).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => chip("m:" + k, `${UI.tl(T["m:" + k])} ${n}`, T["m:" + k].color, s.methods.has(k))).join("");
  $("#pop-venue .chips").innerHTML = ["journal", "conference", "preprint"].map(k => chip(k, t("g.vt." + k), null, s.vtypes.has(k))).join("");
  const q = ($("#venue-q").value || "").toLowerCase();
  $("#pop-venue .checklist").innerHTML = venuesSorted.filter(([v]) => !q || v.toLowerCase().includes(q)).map(([v, n]) =>
    `<label class="ui-check"><input type="checkbox" data-id="${esc(v)}" ${s.venues.has(v) ? "checked" : ""}> <span class="vn">${esc(v)}</span><span class="muted">${n}</span></label>`).join("");
}
function renderPeopleLegend() {
  const s = state, el = $("#g-people");
  if (s.colorBy === "person") {
    el.innerHTML = `<div class="lg-title">${t("g.peopleLegend")}${s.people.size ? `<button class="ui-btn text" id="people-clear">${t("g.all")}</button>` : ""}</div>` +
      [...D.people].filter(u => u.count).sort((a, b) => b.count - a.count).map(u => `<div class="ui-row pl ${s.people.size && !s.people.has(u.id) ? "off" : ""} ${s.people.has(u.id) ? "on" : ""}" data-id="${u.id}">
        <i style="background:${u.color}"></i><span>${esc(u.name)}</span><span class="muted">${u.count}</span></div>`).join("") +
      `<div class="lg-note"><i class="ring"></i>${t("g.sharedRing")}</div>`;
  } else if (s.colorBy === "year") {
    el.innerHTML = `<div class="lg-title">${t("g.color.year")}</div><div class="lg-ramp" style="background:linear-gradient(90deg,${YEAR_NAMES.map(n => `rgb(var(--${n}))`).join(",")})"></div>
      <div class="lg-ramp-l"><span>${YMIN}</span><span>${YMAX}</span></div><div class="lg-note"><i class="unknown"></i>${t("g.unknown")}</div>`;
  } else {
    el.innerHTML = `<div class="lg-title">${t("g.color.venue")}</div>` +
      venuesSorted.slice(0, VENUE_NAMES.length).map(([v]) => `<div class="ui-row pl" data-venue="${esc(v)}"><i style="background:rgb(var(--${venueName[v]}))"></i><span>${esc(v)}</span></div>`).join("") +
      `<div class="lg-note"><i class="other"></i>${t("g.others")}</div>`;
  }
}
function updateToolbar() {
  const s = state;
  const badge = (id, n) => { const b = $(id); b.setAttribute("aria-pressed", n > 0); b.querySelector(".n").textContent = n ? n : ""; };
  badge("#tb-field", s.tags.size + s.methods.size);
  badge("#tb-venue", s.venues.size + s.vtypes.size);
  badge("#tb-year", s.yearMin !== YMIN || s.yearMax !== YMAX || !s.yearUnknown ? 1 : 0);
  badge("#tb-more", (s.minRating ? 1 : 0) + (s.sharedOnly ? 1 : 0));
  $("#tb-reset").hidden = activeFilterCount() === 0;
  const n = papers.filter(p => inTime(p) && matches(p)).length;
  $("#g-count").textContent = n === papers.length ? t("g.total", { n }) : t("g.matched", { n, total: papers.length });
}
function changed() {
  matchCache = new Map();
  if (state.selected) focusSet = neighborhood(state.selected, state.depth);
  updateToolbar();
  renderPeopleLegend();
  renderer.refresh();
}

function initUI() {
  const s = state;
  // popover open/close
  document.querySelectorAll("[data-pop]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    const pop = $("#" + btn.dataset.pop), open = pop.hidden;
    document.querySelectorAll(".pop").forEach(p => (p.hidden = true));
    document.querySelectorAll("[data-pop]").forEach(b => b.classList.remove("open"));
    if (open) {
      pop.hidden = false; btn.classList.add("open");
      const r = btn.getBoundingClientRect(), host = $("#view-graph").getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(r.left - host.left, host.width - pop.offsetWidth - 8)) + "px";
      const below = r.bottom - host.top + 6, above = r.top - host.top - pop.offsetHeight - 6;
      pop.style.top = (below + pop.offsetHeight > host.height - 8 && above > 8 ? above : below) + "px";
      if (pop.classList.contains("pop-settings")) pop.style.left = r.left - host.left - pop.offsetWidth - 8 + "px";
    }
  }));
  document.addEventListener("click", e => {
    if (e.target.closest(".pop")) return;
    document.querySelectorAll(".pop").forEach(p => (p.hidden = true));
    document.querySelectorAll("[data-pop]").forEach(b => b.classList.remove("open"));
  });

  renderPopovers();
  $("#pop-field").addEventListener("click", e => {
    const c = e.target.closest(".ui-chip"); if (!c) return;
    const [ax, k] = c.dataset.id.split(":");
    toggleSet(ax === "d" ? s.tags : s.methods, k); c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true"); changed();
  });
  $("#pop-venue .chips").onclick = e => { const c = e.target.closest(".ui-chip"); if (!c) return; toggleSet(s.vtypes, c.dataset.id); c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true"); changed(); };
  $("#pop-venue .checklist").onchange = e => { if (e.target.dataset.id) { toggleSet(s.venues, e.target.dataset.id); changed(); } };
  $("#venue-q").oninput = renderPopovers;

  const ymin = $("#f-year-min"), ymax = $("#f-year-max");
  [ymin, ymax].forEach(r => { r.min = YMIN; r.max = YMAX; });
  const yl = () => ($("#f-year-v").textContent = `${s.yearMin} – ${s.yearMax}`);
  const resetYear = () => { ymin.value = YMIN; ymax.value = YMAX; yl(); };
  resetYear();
  ymin.oninput = ymax.oninput = () => {
    let a = +ymin.value, b = +ymax.value; if (a > b) [a, b] = [b, a];
    s.yearMin = a; s.yearMax = b; yl(); changed();
  };
  $("#f-year-unknown").onchange = e => { s.yearUnknown = e.target.checked; changed(); };

  const seg = (sel, fn) => $(sel).addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    $(sel).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); fn(b.dataset.v);
  });
  seg("#f-rating", v => { s.minRating = +v; changed(); });
  seg("#f-mode", v => { s.mode = v; changed(); });
  seg("#g-colorby", v => { s.colorBy = v; changed(); });
  seg("#focus-depth", v => { s.depth = +v; if (s.selected) select(s.selected); });
  $("#f-shared").onchange = e => { s.sharedOnly = e.target.checked; changed(); };

  $("#tb-reset").onclick = () => {
    Object.assign(s, { people: new Set(), tags: new Set(), methods: new Set(), venues: new Set(), vtypes: new Set(),
      yearMin: YMIN, yearMax: YMAX, yearUnknown: true, minRating: 0, sharedOnly: false });
    resetYear(); $("#f-year-unknown").checked = true; $("#f-shared").checked = false;
    $("#f-rating").querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", i === 0));
    renderPopovers(); changed();
  };

  // people legend = person filter
  $("#g-people").addEventListener("click", e => {
    if (e.target.closest("#people-clear")) { s.people = new Set(); changed(); return; }
    if (e.target.closest(".lg-title") && innerWidth <= 760) { e.currentTarget.classList.toggle("open"); return; }   // phones: legend starts folded
    const row = e.target.closest(".pl[data-id]");
    if (row) { toggleSet(s.people, row.dataset.id); changed(); return; }
    const vrow = e.target.closest(".pl[data-venue]");
    if (vrow) { toggleSet(s.venues, vrow.dataset.venue); renderPopovers(); changed(); }
  });
  $("#g-people").addEventListener("dblclick", e => {
    const row = e.target.closest(".pl[data-id]");
    if (row) select("u:" + row.dataset.id, { zoom: true, openDrawer: true });
  });

  // settings
  ["links", "regions", "labels", "timeline"].forEach(k => {
    const el = $("#l-" + k);
    el.checked = s.layers[k];
    el.onchange = () => {
      s.layers[k] = el.checked;
      if (k === "timeline") { $(".timeline").hidden = !el.checked; if (!el.checked) { s.timeIdx = reviewDates.length - 1; $("#t-range").value = s.timeIdx; } }
      changed();
    };
  });
  [["repel", 0, 30, 1], ["link", 0, 2, 0.05], ["anchor", 0, 0.5, 0.01]].forEach(([k, min, max, step]) => {
    const el = $("#ph-" + k);
    Object.assign(el, { min, max, step, value: s.physics[k] });
    el.oninput = () => { s.physics[k] = +el.value; applyPhysics(); };
  });
  $("#ph-reset").onclick = () => {
    Object.assign(s.physics, DEFAULT_PHYSICS);
    ["repel", "link", "anchor"].forEach(k => ($("#ph-" + k).value = s.physics[k]));
    applyPhysics();
  };

  // zoom buttons
  $("#z-in").onclick = () => renderer.getCamera().animatedZoom({ duration: 250 });
  $("#z-out").onclick = () => renderer.getCamera().animatedUnzoom({ duration: 250 });
  $("#z-fit").onclick = () => fitNodes();

  $("#focus-clear").onclick = () => { select(null); UI.closeDrawer(); };

  // find
  const find = $("#g-find"), results = $("#g-find-results");
  find.oninput = () => {
    const q = find.value.trim().toLowerCase();
    if (!q) { s.find = null; results.hidden = true; renderer.refresh(); return; }
    const hits = papers.filter(p => (p.title + " " + p.authors).toLowerCase().includes(q));
    const ppl = D.people.filter(u => u.name.toLowerCase().includes(q));
    s.find = new Set([...hits.map(p => p.id), ...ppl.map(u => "u:" + u.id)]);
    results.hidden = false;
    results.innerHTML = [...ppl.map(u => `<div class="ui-row fr" data-id="u:${u.id}"><span class="dot" style="background:${u.color}"></span>${esc(u.name)}</div>`),
      ...hits.slice(0, 8).map(p => `<div class="ui-row fr" data-id="${p.id}"><span class="dot" style="background:${paperColor(p)}"></span>${esc(p.title)}</div>`)].join("")
      || `<div class="ui-row fr muted">—</div>`;
    renderer.refresh();
  };
  find.onkeydown = e => { if (e.key === "Enter") results.querySelector(".fr[data-id]")?.click(); if (e.key === "Escape") { find.value = ""; find.oninput(); } };
  results.onclick = e => {
    const r = e.target.closest(".fr[data-id]"); if (!r) return;
    find.value = ""; s.find = null; results.hidden = true;
    select(r.dataset.id, { zoom: true, openDrawer: true });
  };

  // time-lapse
  const tr = $("#t-range"), tlab = $("#t-label"), play = $("#t-play");
  tr.min = 0; tr.max = reviewDates.length - 1; tr.value = s.timeIdx;
  const setT = i => { s.timeIdx = i; tr.value = i; tlab.textContent = reviewDates[i]; changed(); };
  tlab.textContent = reviewDates[s.timeIdx];
  tr.oninput = () => setT(+tr.value);
  let timer = null;
  play.onclick = () => {
    if (timer) { clearInterval(timer); timer = null; play.textContent = "▶"; return; }
    if (s.timeIdx >= reviewDates.length - 1) setT(0);
    play.textContent = "❚❚";
    timer = setInterval(() => {
      if (s.timeIdx >= reviewDates.length - 1) { clearInterval(timer); timer = null; play.textContent = "▶"; return; }
      setT(s.timeIdx + 1);
    }, 140);
  };
}

// ---------------- drag ----------------
function initDrag() {
  let drag = null, moved = false;
  renderer.on("downNode", ({ node }) => {
    drag = node; moved = false;
    const sn = simById[node]; sn.fx = sn.x; sn.fy = sn.y;
    sim.alphaTarget(0.2).restart();
  });
  const mc = renderer.getMouseCaptor();
  mc.on("mousemovebody", e => {
    if (!drag) return;
    moved = true;
    const pos = renderer.viewportToGraph(e), sn = simById[drag];
    sn.fx = pos.x; sn.fy = pos.y;
    e.preventSigmaDefault(); e.original.preventDefault(); e.original.stopPropagation();
  });
  const up = () => {
    if (!drag) return;
    const sn = simById[drag]; sn.fx = null; sn.fy = null;
    sim.alphaTarget(0);
    drag = null;
  };
  mc.on("mouseup", up);
  document.addEventListener("mouseup", up);
  return () => moved;
}

// ---------------- boot ----------------
function start() {
  if (started) return;
  started = true;
  if (!papers.length) { // e.g. a term with no reviews yet
    $("#graph").innerHTML = `<div class="ui-empty graph-empty">${t("g.emptyTerm")}</div>`;
    window.LabGraph._r = null;
    return;
  }
  buildGraph();
  buildLabels();
  renderer = new Sigma(graph, $("#graph"), {
    nodeProgramClasses: { border: NodeBorderProgram },
    nodeReducer, edgeReducer, zIndex: true,
    defaultDrawNodeLabel: drawLabel, defaultDrawNodeHover: drawHover,
    labelRenderedSizeThreshold: 8, labelDensity: 0.35, labelGridCellSize: 160,
    minCameraRatio: 0.03, maxCameraRatio: 3, stagePadding: 30,
    allowInvalidContainer: true, // the graph keeps simulating while another page is shown
  });
  const xs = papers.map(p => p.x), ys = papers.map(p => p.y), m = 1.25;
  renderer.setCustomBBox({ x: [Math.min(...xs) * m, Math.max(...xs) * m], y: [Math.min(...ys) * m, Math.max(...ys) * m] });
  renderer.on("afterRender", drawOverlay);
  // the theme changed (menu or OS setting): re-read the colours and repaint — no reload
  const retheme = () => { readTheme(); renderer.refresh(); };
  window.addEventListener("lab:theme", retheme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => document.documentElement.dataset.theme === "auto" && retheme());
  renderer.on("enterNode", ({ node }) => {
    state.hovered = node;
    if (!state.selected) hoverSet = neighborhood(node, 1);
    $("#graph").style.cursor = "pointer";
    renderer.refresh();
  });
  renderer.on("leaveNode", () => { state.hovered = null; hoverSet = null; $("#graph").style.cursor = ""; renderer.refresh(); });
  const wasDrag = initDrag();
  renderer.on("clickNode", ({ node }) => { if (!wasDrag()) select(node, { openDrawer: true }); });
  renderer.on("clickStage", () => { if (state.selected) { select(null); UI.closeDrawer(); } });
  initUI();
  buildSim();
  let fitted = false;
  sim.on("end", () => { computeRegions(); renderer.refresh(); if (!fitted) { fitted = true; fitNodes(); } });
  computeRegions();
  updateToolbar();
  renderPeopleLegend();
  fitNodes(0);
  window.LabGraph._r = renderer;
}

// hooks used by the scripted demo recording (video/record.py)
const demo = {
  scatter(radius = 520) {
    Object.values(simById).forEach(s => { const a = Math.random() * 2 * Math.PI, r = radius * Math.sqrt(Math.random()); s.x = Math.cos(a) * r; s.y = Math.sin(a) * r; });
    graph.updateEachNodeAttributes((n, a) => { const s = simById[n]; a.x = s.x; a.y = s.y; return a; }, { attributes: ["x", "y"] });
    sim.alpha(1).restart();
  },
  fit: (ms = 900) => fitNodes(ms),
  zoomCluster(cid, ratio, ms = 1600) {
    const pos = clusterCentroids()[cid]; if (!pos) return;
    const fg = renderer.viewportToFramedGraph(renderer.graphToViewport(pos));
    centerFramed(fg.x, fg.y, ratio, ms);
  },
  nodeXY(id) { // page coordinates of a node, for moving the mouse onto it
    const v = renderer.graphToViewport(graph.getNodeAttributes(id)), r = $("#graph").getBoundingClientRect();
    return { x: v.x + r.left, y: v.y + r.top };
  },
  settled: () => !sim || sim.alpha() < sim.alphaMin() + 0.002,
};

window.LabGraph = {
  demo,
  show() { setTimeout(() => { start(); renderer?.resize(); renderer?.refresh(); }, 0); },
  select(id, opts) { start(); if (renderer) select(id, opts); },
};
if (UI.currentView() === "graph") window.LabGraph.show();
