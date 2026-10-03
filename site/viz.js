/* Small SVG/HTML charts for the people page, the person page and the comparison (docs/PEOPLE_TOPICS_GUIDES.md).
 * Everything is drawn from real records: map areas (level "a" clusters), tags, readers, studies. No ratings.
 * Two fixed sets of axes, switchable everywhere: the map's areas (≤ 8, ordered by where they sit on the map) and
 * methods (the lab's 7 most used + other). The shape is a rose (polar-area) chart: a petal's area = the share, so a
 * reader who sticks to one area is one big petal, never a line.
 */
(() => {
  const { t } = window.I18N, UI = window.LabUI;
  const { esc } = UI;

  I18N.extend({
    ko: {
      "pf.terrain": "연구 지형", "pf.terrainHint.area": "연구실 지도의 어느 지역을 읽나 · 꽃잎 = 비중, 점선 = 연구실 평균",
      "pf.terrainHint.method": "어떤 방법론 논문을 읽나 · 꽃잎 = 비중, 점선 = 연구실 평균",
      "pf.axis.area": "지도 지역", "pf.axis.method": "방법론", "pf.methods": "방법론", "pf.fields": "세부 분야",
      "pp.lab": "연구실 전체", "pp.labSub": "논문 {p}편 · {n}명", "pp.papersN": "{n}편", "pp.pick": "{v}% · {n}편",
      "pp.hint": "항목을 누르면 아래 사람들이 그 비중이 큰 순서로 정렬돼요 · 한 번 더 누르면 원래대로",
      "pf.similar": "관심사가 비슷한 사람", "pf.similarHint": "읽은 분야가 비슷한 순 · 누르면 나란히 비교해요", "pf.recent": "최근 리뷰",
      "pf.reviews": "리뷰한 논문", "pf.shared": "함께 읽은 논문", "pf.studies": "참여한 스터디", "pf.other": "기타", "pf.lab": "연구실 {v}%",
      "pf.more.area": "{x} 지역을 연구실 평균의 {k}배 읽어요", "pf.more.method": "{x} 논문을 연구실 평균의 {k}배 읽어요",
      "pf.few": "리뷰가 {n}편 더 쌓이면 연구 지형이 보여요",
      "pf.compare": "비교하기", "pf.self": "다른 사람에게는 이렇게 보여요", "pf.toMe": "내 페이지로", "pf.role": "{area} 지역 · {method}",
      "cmp.title": "비교", "cmp.both": "둘 다 읽은 논문", "cmp.none": "아직 같이 읽은 논문이 없어요", "cmp.pick": "비교할 사람",
    },
    en: {
      "pf.terrain": "Research terrain", "pf.terrainHint.area": "Which areas of the lab map they read · petal = share, dashed = lab average",
      "pf.terrainHint.method": "Which methods the papers they read use · petal = share, dashed = lab average",
      "pf.axis.area": "Map areas", "pf.axis.method": "Methods", "pf.methods": "Methods", "pf.fields": "Fields",
      "pp.lab": "The whole lab", "pp.labSub": "{p} papers · {n} people", "pp.papersN": "{n} papers", "pp.pick": "{v}% · {n} papers",
      "pp.hint": "Pick one and the people below line up by how much of their reading it is · pick it again to undo",
      "pf.similar": "Similar interests", "pf.similarHint": "Most alike in what they read first · open one to compare side by side", "pf.recent": "Recent reviews",
      "pf.reviews": "Papers reviewed", "pf.shared": "Read together", "pf.studies": "Studies", "pf.other": "Other", "pf.lab": "lab {v}%",
      "pf.more.area": "Reads {x} {k}× the lab average", "pf.more.method": "Reads {x} papers {k}× the lab average",
      "pf.few": "{n} more reviews and the research terrain appears",
      "pf.compare": "Compare", "pf.self": "This is how others see you", "pf.toMe": "My page", "pf.role": "{area} · {method}",
      "cmp.title": "Compare", "cmp.both": "Read by both", "cmp.none": "No paper read by both yet", "cmp.pick": "Compare with",
    },
  });

  const D = () => window.LAB;
  const MIN_REVIEWS = 15;
  const OTHER = "rgb(var(--gray))";
  let axisKind = "area";
  try { axisKind = localStorage.getItem("lab.vzAxis") === "method" ? "method" : "area"; } catch (e) {}

  // ---- map areas (≤ 8): clockwise from the top in the order they sit around the map's centre, so neighbouring
  // petals are neighbouring areas; named after their biggest region unless an admin named them
  let areaCache = null;
  function areas() {
    if (areaCache?.d === D()) return areaCache.list;
    const papers = D().papers.filter(p => p.a), size = {}, sx = {}, sy = {};
    papers.forEach(p => { size[p.a] = (size[p.a] || 0) + 1; sx[p.a] = (sx[p.a] || 0) + p.x; sy[p.a] = (sy[p.a] || 0) + p.y; });
    const mx = papers.reduce((s, p) => s + p.x, 0) / (papers.length || 1), my = papers.reduce((s, p) => s + p.y, 0) / (papers.length || 1);
    const list = (D().clusters || []).filter(c => c.level === "a" && size[c.id]).map(a => {
      const kids = D().clusters.filter(c => c.level === "c" && c.parent === a.id).sort((x, y) => y.size - x.size);
      const name = a.custom ? UI.clusterName(a) : kids[0] ? UI.clusterName(kids[0]) : UI.clusterName(a);
      const angle = Math.atan2(sx[a.id] / size[a.id] - mx, -(sy[a.id] / size[a.id] - my));   // 0 = up, clockwise
      return { id: a.id, name, full: kids.map(k => UI.clusterName(k)).join(" / ") || name, color: kids[0]?.color || OTHER, n: size[a.id], angle };
    }).sort((x, y) => x.angle - y.angle);
    // automatic names are "topic · keyword": the topic alone where it's unique, else keep the keyword to tell them apart
    const base = a => a.name.split(" · ")[0], seen = {};
    list.forEach(a => (seen[base(a)] = (seen[base(a)] || 0) + 1));
    list.forEach(a => { if (seen[base(a)] === 1) a.name = base(a); });
    areaCache = { d: D(), list };
    return list;
  }
  // ---- methods: the lab's 7 most used, then "other"
  function methodAxes() {
    const n = {};
    D().papers.forEach(p => p.methods.forEach(m => (n[m] = (n[m] || 0) + 1)));
    const top = Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([m, c]) => {
      const x = UI.T["m:" + m]; return { id: "m:" + m, name: x ? UI.tl(x) : m, full: x ? UI.tl(x) : m, color: x?.color || OTHER, n: c };
    });
    return [...top, { id: "other", name: t("pf.other"), full: t("pf.other"), color: OTHER, n: 0, other: true }];
  }
  const axesOf = kind => (kind === "method" ? methodAxes() : areas());
  // shares of a set of papers over the axes (methods: a paper with two methods counts half to each)
  function sharesOf(kind, papers, axes) {
    const v = axes.map(() => 0);
    papers.forEach(p => {
      if (kind === "area") { const i = axes.findIndex(a => a.id === p.a); if (i >= 0) v[i]++; return; }
      if (!p.methods.length) return;
      p.methods.forEach(m => { const i = axes.findIndex(a => a.id === "m:" + m); v[i >= 0 ? i : axes.length - 1] += 1 / p.methods.length; });
    });
    const tot = v.reduce((a, b) => a + b, 0) || 1;
    return v.map(x => x / tot);
  }
  // ---- one person's profile, from what they read
  function profile(id) {
    const p = UI.P[id], papers = D().papers.filter(x => x.readers.includes(id));
    const tops = prefix => Object.entries(p?.topics || {}).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ id: k, label: UI.T[k] ? UI.tl(UI.T[k]) : k.slice(2), value: v, color: UI.T[k]?.color || OTHER }));
    const fields = tops("d:"), methods = tops("m:");
    const by = Object.fromEntries(["area", "method"].map(kind => {
      const axes = axesOf(kind), mine = sharesOf(kind, papers, axes), lab = sharesOf(kind, D().papers, axes);
      return [kind, axes.map((a, i) => ({ ...a, share: mine[i], lab: lab[i] }))];
    }));
    const lift = kind => [...by[kind]].filter(a => !a.other && a.share >= 0.1 && a.lab > 0).map(a => ({ ...a, k: a.share / a.lab })).sort((x, y) => y.k - x.k)[0];
    const topArea = [...by.area].sort((x, y) => y.share - x.share)[0];
    const studies = window.Store ? Store.studies.list().filter(st => st.members.includes(id)).length : 0;
    const enough = (p?.count || 0) >= MIN_REVIEWS;
    return {
      count: p?.count || 0, enough, areas: by.area, by, fields, methods, studies,
      shared: papers.filter(x => x.readers.length > 1).length,
      role: topArea?.share && methods[0] && enough ? t("pf.role", { area: topArea.name, method: methods[0].label }) : "",
      lift: Object.fromEntries(["area", "method"].map(kind => { const l = lift(kind); return [kind, l && l.k >= 1.5 ? t("pf.more." + kind, { x: l.name, k: l.k.toFixed(1) }) : ""]; })),
    };
  }

  // ---- rose: one petal per axis, petal area ∝ share; the lab average is a dashed arc on each petal
  function rose(axes, { size = 220, max } = {}) {
    const n = axes.length; if (n < 3) return "";
    const c = size / 2, R = c - 4, step = 2 * Math.PI / n, gap = Math.min(0.06, step * 0.08);
    const top = max || Math.max(0.0001, ...axes.flatMap(a => [a.share, a.lab ?? 0]));
    const rad = v => R * Math.sqrt(Math.max(0, v) / top);
    const pt = (ang, r) => `${(c + Math.sin(ang) * r).toFixed(1)},${(c - Math.cos(ang) * r).toFixed(1)}`;
    const wedge = (i, r) => { const a0 = i * step - step / 2 + gap, a1 = i * step + step / 2 - gap;
      return `M${c},${c} L${pt(a0, r)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${pt(a1, r)} Z`; };
    const arc = (i, r) => { const a0 = i * step - step / 2 + gap, a1 = i * step + step / 2 - gap;
      return `M${pt(a0, r)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${pt(a1, r)}`; };
    let svg = `<svg class="vz-rose" viewBox="0 0 ${size} ${size}" role="img"><title>${esc(axes.map(a => `${a.name} ${Math.round(a.share * 100)}%`).join(", "))}</title>`;
    axes.forEach((a, i) => (svg += `<path d="${wedge(i, R)}" class="vz-slot"/>`));
    axes.forEach((a, i) => a.share > 0 && (svg += `<path d="${wedge(i, Math.max(rad(a.share), 3))}" class="vz-petal" data-ax="${a.id}" style="fill:${a.color}"><title>${esc(a.full || a.name)} ${Math.round(a.share * 100)}%</title></path>`));
    axes.forEach((a, i) => a.lab > 0 && (svg += `<path d="${arc(i, rad(a.lab))}" class="vz-avg"/>`));
    return svg + "</svg>";
  }
  // legend beside the rose: every axis with its share (and the lab's), in petal order
  const roseLegend = (axes, lab = true) => `<ul class="vz-rlegend">${axes.map(a => `<li class="${a.share ? "" : "zero"}" data-ax="${a.id}" title="${esc(a.full || a.name)}">
      <i style="background:${a.color}"></i><span class="nm">${esc(a.name)}</span><b>${Math.round(a.share * 100)}%</b>${lab ? `<span class="lab">${t("pf.lab", { v: Math.round(a.lab * 100) })}</span>` : ""}</li>`).join("")}</ul>`;

  // segmented control switching every chart inside the nearest [data-vz-axis] between areas and methods
  const axisSwitch = () => `<div class="ui-seg vz-switch" role="group" aria-label="${t("pf.terrain")}">${["area", "method"].map(k =>
    `<button type="button" data-vz-kind="${k}" aria-pressed="${axisKind === k}">${t("pf.axis." + k)}</button>`).join("")}</div>`;
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-vz-kind]"); if (!b) return;
    axisKind = b.dataset.vzKind;
    try { localStorage.setItem("lab.vzAxis", axisKind); } catch (err) {}
    document.querySelectorAll("[data-vz-axis]").forEach(el => (el.dataset.vzAxis = axisKind));
    document.querySelectorAll("[data-vz-kind]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.vzKind === axisKind)));
  });
  // both versions rendered once; CSS shows the one picked ([data-vz-axis] on the wrapper)
  const both = fn => `<div class="vz-kind" data-k="area">${fn("area")}</div><div class="vz-kind" data-k="method">${fn("method")}</div>`;

  // one person's terrain block: switch, rose + legend, the "k× the lab" line
  function terrain(id) {
    const pr = profile(id);
    if (!pr.enough) return `<p class="muted">${t("pf.few", { n: MIN_REVIEWS - pr.count })}</p>`;
    return `<div class="vz-terrain" data-vz-axis="${axisKind}">${axisSwitch()}
      ${both(k => `<p class="hint">${t("pf.terrainHint." + k)}</p><div class="vz-rose-wrap">${rose(pr.by[k])}${roseLegend(pr.by[k])}</div>
        ${pr.lift[k] ? `<p class="pf-insight">${esc(pr.lift[k])}</p>` : ""}`)}</div>`;
  }

  // ---- weekly writing sparkline
  function spark(weeks, color) {
    if (!weeks.length) return "";
    const mx = Math.max(1, ...weeks), w = 100, h = 18, step = w / Math.max(1, weeks.length - 1);
    const pts = weeks.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / mx) * (h - 4)).toFixed(1)}`);
    return `<svg class="vz-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,${h} ${pts.join(" ")} ${w},${h}" style="fill:${color}"/></svg>`;
  }

  // ---- people page: the whole lab on top — map areas on the left, methods on the right (rose + every axis with its
  // share and papers: the legend and a picker in one) — and a card per member below with the same two roses over the
  // lab's average. Picking an axis dims the other petals on that side and orders the cards by that share.
  let pick = null;   // { kind, id }
  const axisCount = (kind, axis, papers) => papers.filter(p => kind === "area" ? p.a === axis.id
    : axis.other ? p.methods.some(m => !methodAxes().some(a => a.id === "m:" + m)) : p.methods.includes(axis.id.slice(2))).length;
  const labSide = k => {
    const axes = axesOf(k), sh = sharesOf(k, D().papers, axes), xs = axes.map((a, i) => ({ ...a, share: sh[i], lab: 0 }));
    return `<div class="pp-lab-side" data-k="${k}"><h4>${t("pf.axis." + k)}</h4><div class="pp-lab-body">${rose(xs, { size: 180 })}
      <ul class="pp-axes">${xs.map(a => `<li><button type="button" data-pick-axis="${k}|${a.id}" data-ax="${a.id}" aria-pressed="false" title="${esc(a.full || a.name)}">
        <i style="background:${a.color}"></i><span class="nm">${esc(a.name)}</span><b>${Math.round(a.share * 100)}%</b><span class="n">${t("pp.papersN", { n: axisCount(k, a, D().papers) })}</span></button></li>`).join("")}</ul></div></div>`;
  };
  const labCard = () => `<div class="card pp-lab">
      <div><h3>${t("pp.lab")}</h3><p class="hint">${t("pp.labSub", { p: D().papers.length, n: D().people.filter(x => x.count).length })}</p></div>
      <div class="pp-lab-sides">${labSide("area")}${labSide("method")}</div>
      <p class="hint pp-hint">${t("pp.hint")}</p></div>`;
  const peopleCards = people => people.map((p, i) => { const pr = profile(p.id);
    return `<div class="card person-card" data-open="person:${p.id}" data-person="${p.id}" data-order="${i}">
      <div class="pc-head">${UI.avatar(p.id)}<span class="pc-name">${esc(p.name)}</span></div>
      <div class="pc-roses">${["area", "method"].map(k => `<div class="pc-rose" data-k="${k}" title="${t("pf.axis." + k)}">${rose(pr.by[k], { size: 104 })}</div>`).join("")}</div>
      <div class="pc-pick"></div></div>`; }).join("");
  function applyPick() {
    document.querySelectorAll("[data-pick-axis]").forEach(b => b.setAttribute("aria-pressed", String(!!pick && b.dataset.pickAxis === `${pick.kind}|${pick.id}`)));
    const dimIn = sel => document.querySelectorAll(sel).forEach(el => el.classList.toggle("dim", !!pick && el.closest("[data-k]")?.dataset.k === pick.kind && el.dataset.ax !== pick.id));
    dimIn(".pp-lab .vz-petal");
    dimIn(".pp-grid .vz-petal");
    document.querySelectorAll(".pp-grid").forEach(grid => {
      const cards = [...grid.querySelectorAll("[data-person]")], axis = pick && axesOf(pick.kind).find(a => a.id === pick.id);
      cards.forEach(c => {
        const cap = c.querySelector(".pc-pick");
        if (!axis) { cap.textContent = ""; c._v = -c.dataset.order; return; }
        const share = profile(c.dataset.person).by[pick.kind].find(x => x.id === pick.id)?.share || 0;
        const n = axisCount(pick.kind, axis, D().papers.filter(p => p.readers.includes(c.dataset.person)));
        cap.textContent = `${axis.name} · ${t("pp.pick", { v: Math.round(share * 100), n })}`;
        c._v = share + n * 1e-6;
      });
      cards.sort((x, y) => y._v - x._v).forEach(c => grid.appendChild(c));
    });
  }
  document.addEventListener("click", e => {
    // a petal of the lab's roses picks like its row in the list
    const petal = e.target.closest(".pp-lab .vz-petal");
    const b = petal ? petal.closest(".pp-lab-side").querySelector(`[data-pick-axis$="|${petal.dataset.ax}"]`) : e.target.closest("[data-pick-axis]"); if (!b) return;
    const [kind, id] = b.dataset.pickAxis.split("|");
    pick = pick && pick.kind === kind && pick.id === id ? null : { kind, id };
    applyPick();
  });

  // ---- similar interests: one row of people; each opens the two side by side
  const similar = (id, list) => `<div class="pf-similar">${list.slice(0, 5).filter(s => UI.P[s.id]).map(s =>
    `<a class="sim-chip" href="#/compare?a=${id}&b=${s.id}">${UI.avatar(s.id)}<span>${esc(UI.P[s.id].name)}</span><em>${Math.round(s.sim * 100)}%</em></a>`).join("")}</div>`;

  // ---- a petal and its row light up together (hover; a tap on touch screens): the person page's legend, the lab
  // card's list, and on the comparison the same axis in both roses and its bar row
  const HOVER = ".vz-rose-wrap, .pp-lab-side, .cmp-terrain .vz-kind";
  const canHover = matchMedia("(hover: hover)");
  function hover(root, ax) {
    root.classList.toggle("hovering", !!ax);
    root.querySelectorAll("[data-ax]").forEach(el => el.classList.toggle("hl", !!ax && el.dataset.ax === ax));
  }
  document.addEventListener("mouseover", e => {
    if (!canHover.matches) return;   // touch: the tap below does it (an emulated mouseover would fire first)
    const el = e.target.closest?.("[data-ax]"), root = el?.closest(HOVER); if (root) hover(root, el.dataset.ax);
  });
  document.addEventListener("mouseout", e => {
    if (!canHover.matches) return;
    const el = e.target.closest?.("[data-ax]"), root = el?.closest(HOVER); if (!root) return;
    const to = e.relatedTarget?.closest?.("[data-ax]");
    if (!to || to.closest(HOVER) !== root) hover(root, null);
  });
  document.addEventListener("click", e => {   // touch: tap a petal to light it up, tap again to clear
    const el = e.target.closest(".vz-petal"), root = el?.closest(HOVER); if (!root || root.matches(".pp-lab-side")) return;
    if (!canHover.matches) hover(root, el.classList.contains("hl") ? null : el.dataset.ax);
  });

  window.LabViz = { areas, methodAxes, axesOf, profile, rose, roseLegend, terrain, axisSwitch, both, spark, labCard, peopleCards, similar, get kind() { return axisKind; }, MIN_REVIEWS };
})();
