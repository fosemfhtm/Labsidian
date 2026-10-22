/* Labsidian graph: field and method maps with tag-density areas.
 * Papers flip between tag-weighted semantic anchors; people settle among their papers.
 * Edges show readers (only around a hovered/selected node unless the layer is on), rings show shared papers, and colours follow the selected key.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { NodeBorderProgram } from "@sigma/node-border";
import { contourDensity } from "d3-contour";
import { forceSimulation, forceManyBody, forceLink, forceX, forceY, forceCollide } from "d3-force";

const D = window.LAB, UI = window.LabUI, { t } = window.I18N;
const { P, T, R, esc } = UI;
const $ = s => document.querySelector(s);

let papers, PA, reviewDates, YMIN, YMAX, venuesSorted, PAPER_SCALE;
function readData() {
  papers = D.papers.filter(p => p.x != null);
  PA = Object.fromEntries(papers.map(p => [p.id, p]));
  papers.forEach(p => {
    const first = p.reviews.map(r => R[r]).sort((a, b) => a.date.localeCompare(b.date))[0];
    p._first = first?.person;
  });
  reviewDates = [...new Set(D.reviews.map(r => r.date))].sort();
  const years = papers.map(p => window.Store.paperYear(p)).filter(Boolean);
  YMIN = Math.min(...years, 2000); YMAX = Math.max(...years, 2026);
  const venueCount = {};
  papers.forEach(p => p.venueNorm && (venueCount[p.venueNorm] = (venueCount[p.venueNorm] || 0) + 1));
  venuesSorted = Object.entries(venueCount).sort((a, b) => b[1] - a[1]);
  PAPER_SCALE = Math.min(1, Math.pow(900 / Math.max(1, papers.length), 0.25));
}
readData();

const DEFAULT_PHYSICS = { repel: 8, link: 0.5, anchor: 0.18 };
const state = {
  axis: "domain",
  colorBy: "person", people: new Set(), tags: new Set(), methods: new Set(), venues: new Set(), vtypes: new Set(),
  yearMin: YMIN, yearMax: YMAX, yearUnknown: true, minRating: 0, sharedOnly: false, mode: "dim",
  layers: { links: false, regions: true, labels: true, timeline: false },   // all reader edges at once are a hairball on real data
  physics: { ...DEFAULT_PHYSICS },
  timeIdx: reviewDates.length - 1, selected: null, depth: 1, hovered: null, find: null, area: null,
};
try { state.axis = localStorage.getItem("lab.mapAxis") === "method" ? "method" : "domain"; } catch (e) {}
let focusSet = null, hoverSet = null, areaSet = null, matchCache = new Map();   // areaSet: the clicked tag area's papers + their readers
let graph, renderer, sim, simById = {}, started = false, visible = false, timeTimer = null;

let flipping = false, axisFrame = 0, finishFlip = null;
const anchorX = p => state.axis === "method" ? (p.mx ?? p.x) : p.x;
const anchorY = p => state.axis === "method" ? (p.my ?? p.y) : p.y;
const axisTags = p => state.axis === "method" ? p.methods : p.domains;
const tagId = key => (state.axis === "method" ? "m:" : "d:") + key;
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
let BG, DARK, THEME, MIX = {};
// read the theme's colours (again after the theme changes: retheme())
function readTheme() {
  HEXC = {}; MIX = {};
  BG = hexRgb(hex(CSSV("--sys-bg"))); DARK = BG[0] + BG[1] + BG[2] < 384;
  THEME = {
    ring: CSSV("--label"), label: CSSV("--label"), label2: CSSV("--label-2"),   // ring = "read by 2+ people"
    halo: `rgba(${BG.join(",")},0.92)`, box: CSSV("--sys-bg-3"), boxLine: CSSV("--separator"),
    font: CSSV("--font"), dim: hex("gray5"), dimPerson: hex("gray4"), other: hex("gray"),
  };
}
readTheme();
function fade(hex, a) {
  const key = hex + a;
  if (MIX[key]) return MIX[key];
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return (MIX[key] = "#" + c.map((v, i) => Math.round(BG[i] + (v - BG[i]) * a).toString(16).padStart(2, "0")).join(""));
}
function paperColor(p) {   // colour key: first reader (default), or the paper's first field / method
  if (state.colorBy === "domain") return hex(T["d:" + p.domains[0]]?.color || "gray2");
  if (state.colorBy === "method") return hex(T["m:" + p.methods[0]]?.color || "gray2");
  return P[p._first]?.color ? hex(P[p._first].color) : THEME.other;
}

// ---------------- filters ----------------
function matches(p) {
  if (matchCache.has(p.id)) return matchCache.get(p.id);
  const s = state, year = window.Store.paperYear(p);
  const ok = (!s.people.size || p.readers.some(r => s.people.has(r))) &&
    (!s.tags.size || p.domains.some(d => s.tags.has(d))) &&
    (!s.methods.size || p.methods.some(m => s.methods.has(m))) &&
    (!s.venues.size || s.venues.has(p.venueNorm)) &&
    (!s.vtypes.size || s.vtypes.has(p.venueType)) &&
    (year ? year >= s.yearMin && year <= s.yearMax : s.yearUnknown) &&
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
function paperCentroid(mine) {
  return { x: mine.reduce((sum, p) => sum + anchorX(p), 0) / mine.length,
    y: mine.reduce((sum, p) => sum + anchorY(p), 0) / mine.length };
}
// each person's spot on the current map: the centre of their papers, nudged apart just enough that people don't sit on
// top of each other (centres crowd mid-map); gap ~0.4 of build_map's spread (100 · √(n/900) per std)
function peopleAnchors() {
  const pts = D.people.map(u => ({ id: "u:" + u.id, mine: papers.filter(p => p.readers.includes(u.id)) }))
    .filter(u => u.mine.length).map(u => ({ id: u.id, ...paperCentroid(u.mine) }));
  const gap = 40 * Math.sqrt(Math.max(1, papers.length / 900));
  for (let it = 0; it < 100; it++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= gap) continue;
      if (!d) { dx = 1; dy = 0; d = 1; }
      const k = (gap - d) / d / 2;
      a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; moved = true;
    }
    if (!moved) break;
  }
  return new Map(pts.map(p => [p.id, p]));
}
function buildGraph() {
  if (graph) graph.clear(); else graph = new Graph();
  papers.forEach(p => graph.addNode(p.id, {
    kind: "paper", type: "border", x: anchorX(p), y: anchorY(p), ax: anchorX(p), ay: anchorY(p),
    size: PAPER_SCALE * 0.9 * Math.min(9, 3 + (p.reviews.length - 1) * 1.5 + (p.rating >= 4 ? 0.7 : 0)),   // a little smaller, so the tag areas lead
    label: p.title.length > 46 ? p.title.slice(0, 44) + "…" : p.title,
    borderSize: p.readers.length > 1 ? 0.28 : 0,
  }));
  const spots = peopleAnchors();   // new members appear once they've written something
  D.people.forEach(u => {
    const spot = spots.get("u:" + u.id);
    if (!spot) return;
    const { x, y } = spot;
    graph.addNode("u:" + u.id, {
      kind: "person", type: "border", x, y, ax: x, ay: y, size: PAPER_SCALE * (10 + Math.sqrt(u.count) * 0.55), label: u.name, color: u.color,
      borderSize: 0.16, forceLabel: matchMedia("(min-width: 761px)").matches,   // phones: let sigma drop labels that would overlap
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
function syncPositions() {
  graph.updateEachNodeAttributes((id, a) => {
    const { x, y } = simById[id]; a.x = x; a.y = y; return a;
  }, { attributes: ["x", "y"] });
}
function buildSim() {
  const ph = state.physics;
  const nodes = graph.mapNodes((id, a) => ({ id, kind: a.kind, x: a.x, y: a.y, ax: a.ax, ay: a.ay, r: a.size }));
  simById = Object.fromEntries(nodes.map(s => [s.id, s]));
  const links = graph.mapEdges((e, a, source, target) => ({ source, target }));
  sim = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(d => (d.kind === "paper" ? -ph.repel : -ph.repel * 3)).distanceMax(40).theta(0.9))
    .force("link", forceLink(links).id(d => d.id).distance(28).strength(() => ph.link * 0.05))
    .force("ax", forceX(d => d.ax).strength(anchorOf))
    .force("ay", forceY(d => d.ay).strength(anchorOf))
    .force("collide", forceCollide(d => d.r * 0.85 + 0.8).iterations(1))
    .alphaDecay(0.035)
    .on("tick", syncPositions);
  sim.on("end", () => { computeTagAreas(); renderer.refresh(); });
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
  const active = focusSet || hoverSet || areaSet || state.find;
  if (data.kind === "person") {
    res.zIndex = 3; res.borderColor = toHex(BG); res.color = hex(data.color);   // people carry rgb(var(--name)): resolve for this theme
    const filteredOut = state.people.size && !state.people.has(node.slice(2));
    if (filteredOut || (active && !active.has(node))) {
      res.color = THEME.dimPerson; res.zIndex = 1;
      if (filteredOut || active !== hoverSet) res.label = "";
    }
    return res;
  }
  const p = PA[node];
  res.color = active ? paperColor(p) : fade(paperColor(p), 0.75);   // at rest papers recede behind the areas; a focus brings them back
  res.borderColor = THEME.ring;
  res.zIndex = 1;
  const dimmed = !matches(p) || (active && !active.has(node));
  if (dimmed) { res.color = THEME.dim; res.borderColor = THEME.dim; res.label = ""; res.zIndex = 0; res.size = data.size * 0.85; }
  else if (active && active.size < 16) res.forceLabel = true; // only small neighbourhoods, otherwise labels pile up
  if (node === state.selected || node === state.hovered) { res.highlighted = true; res.zIndex = 4; }
  return res;
}
function edgeReducer(edge, data) {
  const res = { ...data, size: 0.8 };
  const [s, tg] = graph.extremities(edge);
  if (!nodeOn(s) || !nodeOn(tg)) { res.hidden = true; return res; }
  const set = focusSet || hoverSet;
  if (set) {
    const center = state.selected || state.hovered;
    const on = set.has(s) && set.has(tg) && (s === center || tg === center || state.depth > 1);
    if (on) { res.color = fade(hex(data.color), 0.9); res.size = 1.2; res.zIndex = 2; } else res.hidden = true;
    return res;
  }
  if (!state.layers.links) { res.hidden = true; return res; }
  const uid = s.slice(2), p = PA[tg];
  const dimmed = !matches(p) || (state.people.size && !state.people.has(uid));
  res.color = dimmed ? fade(THEME.other, 0.05) : fade(hex(data.color), 0.34);
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

// ---------------- tag density areas + labels ----------------
const regionCanvas = $("#regions"), labelLayer = $("#tag-labels");
let areas = [];
const inside = (point, ring) => {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
};
function computeTagAreas() {
  if (flipping) return;
  const groups = {};
  papers.forEach(p => {
    const a = graph.getNodeAttributes(p.id);
    axisTags(p).forEach(key => { if (T[tagId(key)]) (groups[tagId(key)] ||= []).push([a.x, a.y]); });
  });
  areas = [];
  // smoothing grows with the map (build_map spreads ~100 · √(n/900) units per std), so a big lab isn't cut into crumbs
  const BW = 12 * Math.sqrt(Math.max(1, papers.length / 900)), PAD = BW * 3;
  Object.entries(groups).forEach(([id, points]) => {
    if (points.length < 12) return;
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x0 = Math.min(...xs) - PAD, y0 = Math.min(...ys) - PAD;
    const pts = points.map(([x, y]) => [x - x0, y - y0]);
    const density = contourDensity().size([Math.ceil(Math.max(...xs) - x0 + PAD), Math.ceil(Math.max(...ys) - y0 + PAD)])
      .cellSize(Math.max(2, Math.round(BW / 4))).bandwidth(BW);
    const contours = density.contours(pts);
    // Estimate each point's density from contour membership, using the same grid as the final outline.
    const levels = Array.from({ length: 32 }, (_, i) => contours(contours.max * (i + 1) / 33));
    const weights = pts.map(p => {
      let lo = 0, hi = levels.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (levels[mid].coordinates.some(poly => inside(p, poly[0]) && !poly.slice(1).some(hole => inside(p, hole)))) lo = mid + 1;
        else hi = mid;
      }
      return contours.max * Math.max(0.5, lo) / 33;
    });
    const blobsAt = th => contours(th).coordinates.map(poly => {
      const ring = poly[0], members = pts.map((p, i) => inside(p, ring) && !poly.slice(1).some(hole => inside(p, hole)) ? i : -1).filter(i => i >= 0);
      let area = 0;
      for (let i = 1; i < ring.length; i++) area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
      if (members.length < Math.max(2, pts.length * 0.05) || Math.abs(area) / 2 < 24) return null;
      const total = members.reduce((s, i) => s + weights[i], 0);
      return { rings: poly.map(r => r.map(([x, y]) => [x + x0, y + y0])), count: members.length, size: Math.abs(area) / 2,
        x: x0 + members.reduce((s, i) => s + pts[i][0] * weights[i], 0) / total,
        y: y0 + members.reduce((s, i) => s + pts[i][1] * weights[i], 0) / total };
    }).filter(Boolean).sort((a, b) => b.count - a.count);
    // one connected area per tag, holding ~90% of its papers: where the tag sits in two places, lower the outline
    // until the two patches join (at most ~6×), then keep the main one
    let threshold = [...weights].sort((a, b) => a - b)[Math.floor(pts.length * 0.1)], blobs = blobsAt(threshold);
    for (let i = 0; i < 5 && blobs[1] && blobs[1].count >= blobs[0].count * 0.35; i++) blobs = blobsAt(threshold *= 0.7);
    if (blobs.length) areas.push({ id, blobs: blobs.slice(0, 1), ...blobs[0] });
  });
  areas = areas.sort((a, b) => b.count - a.count);
  if (state.area) setArea(areas.some(a => a.id === state.area) ? state.area : null);   // data changed: same area, fresh papers
  buildLabels();
}
// the tag area under a viewport point; where areas overlap, the smallest (most specific) one
function areaAt(point) {
  const g = renderer.viewportToGraph(point);
  return areas.filter(a => inside([g.x, g.y], a.rings[0])).sort((a, b) => a.size - b.size)[0]?.id || null;
}
// a clicked area lights up with its papers (and their readers); the rest of the map turns gray
function setArea(id) {
  state.area = id;
  areaSet = id ? new Set(papers.filter(p => axisTags(p).some(k => tagId(k) === id)).flatMap(p => [p.id, ...p.readers.map(r => "u:" + r)])) : null;
  renderer?.refresh();
}
function drawOverlay() {
  if (!renderer || !visible) return;
  const el = $("#graph"), dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
  if (regionCanvas.width !== w * dpr || regionCanvas.height !== h * dpr) {
    regionCanvas.width = w * dpr; regionCanvas.height = h * dpr;
    regionCanvas.style.width = w + "px"; regionCanvas.style.height = h + "px";
  }
  const ctx = regionCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (flipping) return;
  const dimAll = !!(focusSet || state.find), picked = !dimAll && state.area;
  const zr = renderer.getCamera().ratio;
  if (state.layers.regions) {
    ctx.globalAlpha = Math.max(0.7, Math.min(1, zr / 0.55));   // zoomed in, the region you're in stays visible
    areas.forEach(({ id, blobs }) => blobs.forEach(({ rings }) => {
      ctx.beginPath();
      rings.forEach(ring => {
        ring.forEach(([x, y], i) => {
          const v = renderer.graphToViewport({ x, y });
          i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y);
        });
        ctx.closePath();
      });
      const col = hex(T[id].color), on = picked === id;
      ctx.fillStyle = col + (dimAll || (picked && !on) ? "0a" : on ? "66" : "40"); ctx.fill("evenodd");
      if (!dimAll && (!picked || on)) { ctx.strokeStyle = col + (on ? "d9" : "80"); ctx.lineWidth = on ? 2 : 1; ctx.stroke(); }   // the edge makes each area readable where they meet
    }));
    ctx.globalAlpha = 1;
  }
  placeLabels(w, h, dimAll, picked);
}
function placeLabels(w, h, dimAll, picked) {
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
  const labels = [...labelLayer.children];
  labels.forEach(div => { div.style.display = state.layers.labels ? "block" : "none"; });
  if (!state.layers.labels) return;
  // Batch layout reads before placement writes; alternating them forces layout once per tag, every frame.
  const sizes = labels.map(div => [div.offsetWidth, div.offsetHeight]);
  labels.forEach((div, i) => {
    const pos = areas[i], [bw, bh] = sizes[i];
    const v = renderer.graphToViewport(pos), x = v.x - bw / 2;
    const y = [0, -1, 1, -2, 2].map(k => v.y - bh / 2 + k * (bh + 6)).find(yy => fits(x, yy, bw, bh));
    if (y == null) { div.style.display = "none"; return; }
    div.style.transform = `translate(${x}px, ${y}px)`;
    div.classList.toggle("faded", dimAll || (!!picked && div.dataset.id !== picked));
  });
}
function buildLabels() {
  labelLayer.innerHTML = areas.map(a =>
    `<button type="button" class="ui-btn plain tag-area-label" data-id="${esc(a.id)}" style="--c:${hex(T[a.id].color)}">${esc(UI.tl(T[a.id]))}</button>`).join("");
}
labelLayer.onclick = e => {
  const button = e.target.closest("[data-id]"); if (!button || flipping) return;
  const area = areas.find(a => a.id === button.dataset.id);
  setArea(area.id);
  UI.openDrawer("topic", area.id, { fromGraph: true });
};

function flipAxis(axis) {
  if (axis === state.axis || flipping) return;
  sim.stop();
  const nodes = sim.nodes(), starts = new Map();
  let cy = 0;
  graph.forEachNode((id, { x, y }) => { starts.set(id, { x, y }); cy += y; });
  cy /= nodes.length;
  state.axis = axis;
  setArea(null);   // the clicked area belongs to the old axis
  try { localStorage.setItem("lab.mapAxis", axis); } catch (e) {}
  const spots = peopleAnchors();
  nodes.forEach(n => {
    const target = n.kind === "paper" ? { x: anchorX(PA[n.id]), y: anchorY(PA[n.id]) } : spots.get(n.id);
    n.ax = target.x; n.ay = target.y;
    n.fx = n.fy = null; n.vx = n.vy = 0;
  });
  flipping = true;
  labelLayer.hidden = true;
  $("#g-axis").querySelectorAll("button").forEach(b => { b.disabled = true; b.setAttribute("aria-pressed", b.dataset.v === axis); });
  renderPeopleLegend();
  let eased = 0, squash = 1;
  const writePosition = (id, a) => {
    const start = starts.get(id), target = simById[id];
    a.x = start.x + (target.ax - start.x) * eased;
    a.y = cy + ((eased < 0.5 ? start.y : target.ay) - cy) * squash;
    return a;
  };
  const positionHints = { attributes: ["x", "y"] };
  const paint = progress => {
    eased = progress * progress * (3 - 2 * progress);
    squash = Math.abs(Math.cos(Math.PI * eased));
    graph.updateEachNodeAttributes(writePosition, positionHints);
  };
  const finish = finishFlip = () => {
    cancelAnimationFrame(axisFrame); axisFrame = 0; finishFlip = null;
    paint(1);
    nodes.forEach(n => { n.x = n.ax; n.y = n.ay; });
    sim.force("ax").x(n => n.ax);
    sim.force("ay").y(n => n.ay);
    flipping = false; labelLayer.hidden = false;
    $("#g-axis").querySelectorAll("button").forEach(b => { b.disabled = false; });
    computeTagAreas(); renderer.refresh();
    if (visible) sim.alpha(0.12).restart();
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { finish(); sim.stop(); return; }
  const start = performance.now();
  const frame = now => {
    const progress = Math.min(1, (now - start) / 900);
    if (progress === 1) { finish(); return; }
    paint(progress); axisFrame = requestAnimationFrame(frame);
  };
  axisFrame = requestAnimationFrame(frame);
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
  } else {
    const pre = s.colorBy === "method" ? "m:" : "d:", counts = {};
    papers.forEach(p => (pre === "m:" ? p.methods : p.domains).forEach(key => { if (T[pre + key]) counts[pre + key] = (counts[pre + key] || 0) + 1; }));
    el.innerHTML = `<div class="lg-title">${t(pre === "m:" ? "g.methods" : "g.tags")}</div>` +
      Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, count]) =>
        `<div class="ui-row pl" data-tag="${esc(id)}"><i style="--c:${hex(T[id].color)}"></i><span>${esc(UI.tl(T[id]))}</span><span class="muted">${count}</span></div>`).join("") +
      `<div class="lg-note"><i class="unknown"></i>${t("g.unknown")}</div>`;
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

function updateYears() {
  for (const [id, value] of [["#f-year-min", state.yearMin], ["#f-year-max", state.yearMax]]) {
    Object.assign($(id), { min: YMIN, max: YMAX, value });
  }
  $("#f-year-v").textContent = `${state.yearMin} – ${state.yearMax}`;
}
function updateTimeline() {
  Object.assign($("#t-range"), { min: 0, max: reviewDates.length - 1, value: state.timeIdx });
  $("#t-label").textContent = reviewDates[state.timeIdx] || "";
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
  updateYears();
  ymin.oninput = ymax.oninput = () => {
    let a = +ymin.value, b = +ymax.value; if (a > b) [a, b] = [b, a];
    s.yearMin = a; s.yearMax = b; updateYears(); changed();
  };
  $("#f-year-unknown").onchange = e => { s.yearUnknown = e.target.checked; changed(); };

  const seg = (sel, fn) => $(sel).addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    $(sel).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); fn(b.dataset.v);
  });
  seg("#f-rating", v => { s.minRating = +v; changed(); });
  seg("#f-mode", v => { s.mode = v; changed(); });
  seg("#g-colorby", v => { s.colorBy = v; changed(); });
  seg("#g-axis", flipAxis);
  $("#g-axis").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === s.axis));
  seg("#focus-depth", v => { s.depth = +v; if (s.selected) select(s.selected); });
  $("#f-shared").onchange = e => { s.sharedOnly = e.target.checked; changed(); };

  $("#tb-reset").onclick = () => {
    Object.assign(s, { people: new Set(), tags: new Set(), methods: new Set(), venues: new Set(), vtypes: new Set(),
      yearMin: YMIN, yearMax: YMAX, yearUnknown: true, minRating: 0, sharedOnly: false });
    updateYears(); $("#f-year-unknown").checked = true; $("#f-shared").checked = false;
    $("#f-rating").querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", i === 0));
    renderPopovers(); changed();
  };

  // people legend = person filter
  $("#g-people").addEventListener("click", e => {
    if (e.target.closest("#people-clear")) { s.people = new Set(); changed(); return; }
    if (e.target.closest(".lg-title") && innerWidth <= 760) { e.currentTarget.classList.toggle("open"); return; }   // phones: legend starts folded
    const tag = e.target.closest("[data-tag]");
    if (tag) { const [axis, key] = tag.dataset.tag.split(":"); toggleSet(axis === "d" ? s.tags : s.methods, key); renderPopovers(); changed(); return; }
    const row = e.target.closest(".pl[data-id]");
    if (row) { toggleSet(s.people, row.dataset.id); changed(); return; }
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
      if (k === "timeline") {
        $(".timeline").hidden = !el.checked;
        if (!el.checked) { stopTimeline(); s.timeIdx = reviewDates.length - 1; updateTimeline(); }
      }
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
      || `<div class="ui-row fr muted">-</div>`;
    renderer.refresh();
  };
  find.onkeydown = e => { if (e.key === "Enter") results.querySelector(".fr[data-id]")?.click(); if (e.key === "Escape") { find.value = ""; find.oninput(); } };
  results.onclick = e => {
    const r = e.target.closest(".fr[data-id]"); if (!r) return;
    find.value = ""; s.find = null; results.hidden = true;
    select(r.dataset.id, { zoom: true, openDrawer: true });
  };

  // time-lapse
  const tr = $("#t-range"), play = $("#t-play");
  const setT = i => { s.timeIdx = i; updateTimeline(); changed(); };
  updateTimeline();
  tr.oninput = () => setT(+tr.value);
  play.onclick = () => {
    if (timeTimer) { stopTimeline(); return; }
    if (s.timeIdx >= reviewDates.length - 1) setT(0);
    play.textContent = "❚❚";
    timeTimer = setInterval(() => {
      if (s.timeIdx >= reviewDates.length - 1) { stopTimeline(); return; }
      setT(s.timeIdx + 1);
    }, 140);
  };
}
function stopTimeline() {
  clearInterval(timeTimer); timeTimer = null;
  $("#t-play").textContent = "▶";
}

// ---------------- drag ----------------
function initDrag() {
  let drag = null, moved = false;
  renderer.on("downNode", ({ node }) => {
    if (flipping) return;
    drag = node; moved = false;
    const sn = simById[node]; sn.fx = sn.x; sn.fy = sn.y;
    sim.alphaTarget(0.2).restart();
  });
  const mc = renderer.getMouseCaptor();
  mc.on("mousemovebody", e => {
    if (!drag || !simById[drag]) return;
    moved = true;
    const pos = renderer.viewportToGraph(e), sn = simById[drag];
    sn.fx = pos.x; sn.fy = pos.y;
    e.preventSigmaDefault(); e.original.preventDefault(); e.original.stopPropagation();
  });
  const up = () => {
    if (!drag) return;
    const sn = simById[drag]; if (sn) sn.fx = sn.fy = null;
    sim.alphaTarget(0);
    drag = null;
  };
  mc.on("mouseup", up);
  document.addEventListener("mouseup", up);
  return () => moved;
}

// ---------------- wheel zoom ----------------
// sigma zooms a fixed 1.7× per wheel event, drops events closer than 50 ms and restarts its animation from the
// half-zoomed state, so a spun wheel or a trackpad jumps unpredictably. Here the zoom follows the scroll amount and
// eases in over a few frames, always about the point under the cursor.
function initWheelZoom() {
  const cam = renderer.getCamera();
  let pending = 0, at = null, raf = 0;
  const step = () => {
    const d = Math.abs(pending) < 0.002 ? pending : pending * 0.35;
    pending -= d;
    const ratio = cam.getBoundedRatio(cam.getState().ratio * Math.exp(d));
    if (ratio === cam.getState().ratio) pending = 0;   // at the zoom limit
    else cam.setState(renderer.getViewportZoomedState(at, ratio));
    raf = pending ? requestAnimationFrame(step) : 0;
  };
  renderer.getMouseCaptor().on("wheel", e => {
    // sigma 3.0.3's preventSigmaDefault() flags a copy of the wheel event, not the one handleWheel checks → set it here
    e.sigmaDefaultPrevented = true;
    const o = e.original, px = o.deltaMode === 1 ? 16 : o.deltaMode === 2 ? 400 : 1;
    // one mouse-wheel notch (~100 px) ≈ 1.28×; a trackpad pinch (ctrl + small deltas) gets more per pixel
    pending += Math.max(-150, Math.min(150, o.deltaY * px)) * (o.ctrlKey ? 0.01 : 0.0025);
    at = { x: e.x, y: e.y };
    if (!raf) raf = requestAnimationFrame(step);
  });
}

// ---------------- boot ----------------
function refreshData() {
  finishFlip?.();
  sim?.stop(); stopTimeline();
  const min = YMIN, max = YMAX;
  readData(); readTheme();
  if (state.yearMin === min) state.yearMin = YMIN;
  if (state.yearMax === max) state.yearMax = YMAX;
  state.timeIdx = reviewDates.length - 1;
  matchCache.clear(); state.hovered = null; hoverSet = null;
  if (!renderer) {
    started = false;
    if (visible) start();
    return;
  }
  const positions = new Map();
  graph.forEachNode((id, a) => positions.set(id, { x: a.x, y: a.y }));
  buildGraph();
  graph.updateEachNodeAttributes((id, a) => Object.assign(a, positions.get(id)), { attributes: ["x", "y"] });
  buildSim(); sim.stop();
  if (papers.length) setBounds();
  updateYears(); updateTimeline();
  renderPopovers(); computeTagAreas(); select(state.selected); changed();
}
window.addEventListener("lab:data", refreshData);
function setBounds() {
  const xs = papers.flatMap(p => [p.x, p.mx ?? p.x]), ys = papers.flatMap(p => [p.y, p.my ?? p.y]), m = 1.25;
  renderer.setCustomBBox({ x: [Math.min(...xs) * m, Math.max(...xs) * m], y: [Math.min(...ys) * m, Math.max(...ys) * m] });
}
function start() {
  if (started) return;
  started = true;
  if (!papers.length) { // e.g. a term with no reviews yet
    $("#graph").innerHTML = `<div class="ui-empty graph-empty">${t("g.emptyTerm")}</div>`;
    window.LabGraph._r = null;
    return;
  }
  $("#graph").innerHTML = "";
  buildGraph();
  renderer = new Sigma(graph, $("#graph"), {
    nodeProgramClasses: { border: NodeBorderProgram },
    nodeReducer, edgeReducer, zIndex: true,
    defaultDrawNodeLabel: drawLabel, defaultDrawNodeHover: drawHover,
    labelRenderedSizeThreshold: 8, labelDensity: 0.35, labelGridCellSize: 160,
    minCameraRatio: 0.03, maxCameraRatio: 3, stagePadding: 30,
    allowInvalidContainer: true, // routes can hide the container before Sigma's next frame
  });
  setBounds();
  renderer.on("afterRender", drawOverlay);
  // the theme changed (menu or OS setting): re-read the colours and repaint — no reload
  const retheme = () => { readTheme(); buildLabels(); renderer.refresh(); };
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
  initWheelZoom();
  renderer.on("clickNode", ({ node }) => { if (!wasDrag()) select(node, { openDrawer: true }); });
  renderer.on("clickStage", ({ event }) => {
    if (state.selected) { select(null); UI.closeDrawer(); return; }
    const id = state.layers.regions && !flipping ? areaAt(event) : null;
    setArea(id && id !== state.area ? id : null);   // clicking the lit area again (or empty space) clears it
  });
  initUI();
  buildSim();
  // settle the layout off-screen in one go, then draw once — animating ~200 ticks pinned a phone's CPU for seconds
  sim.stop();
  const ticks = Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()));
  for (let i = 0; i < ticks; i++) sim.tick();
  syncPositions();
  computeTagAreas();
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
  flipAxis,
  zoomTag(id, ratio, ms = 1600) {
    const pos = areas.find(a => a.id === id); if (!pos) return;
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
  show() { visible = true; setTimeout(() => { if (!visible) return; start(); renderer?.resize(); renderer?.refresh(); }, 0); },
  hide() { visible = false; stopTimeline(); finishFlip?.(); sim?.stop(); },
  select(id, opts) { start(); if (renderer) select(id, opts); },
};
if (UI.currentView() === "graph") window.LabGraph.show();
