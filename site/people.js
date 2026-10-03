/* #/compare?a=<id>&b=<id> — two members side by side, like a football-manager player comparison:
 * the same map areas as axes for both, their methods, and the papers they both read. Information only.
 */
(() => {
  const { t } = window.I18N, UI = window.LabUI, V = window.LabViz;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  const view = document.createElement("section");
  view.id = "view-compare"; view.className = "view page";
  document.querySelector("main").appendChild(view);

  function head(id, side) {
    const p = UI.P[id], pr = V.profile(id);
    return `<div class="card cmp-head ${side}" style="--c:${p.color}">
      <div class="pc-head">${UI.avatar(id, true)}<div><h2 data-open="person:${id}">${esc(p.name)}</h2>
        <div class="pc-meta">${pr.role ? esc(pr.role) : t("pc.metaN", { n: pr.count })}</div></div></div>
      <div class="pf-stats"><div><b>${pr.count}</b><span>${t("pf.reviews")}</span></div><div><b>${pr.shared}</b><span>${t("pf.shared")}</span></div>
        <div><b>${pr.studies}</b><span>${t("pf.studies")}</span></div></div></div>`;
  }

  function render(params) {
    const people = Object.values(UI.P).filter(p => p.count).sort((a, b) => a.name.localeCompare(b.name));
    let a = params.get("a"), b = params.get("b");
    const me = window.Store?.auth.current();
    if (!UI.P[a]) a = me && UI.P[me.id] ? me.id : people[0]?.id;
    if (!UI.P[b] || b === a) b = UI.P[a]?.similar[0]?.id || people.find(p => p.id !== a)?.id;
    if (!a || !b) { view.innerHTML = `<div class="empty">—</div>`; return; }
    const pa = UI.P[a], pb = UI.P[b], A = V.profile(a), B = V.profile(b);
    const both = Object.values(UI.PA).filter(p => p.readers.includes(a) && p.readers.includes(b)).sort((x, y) => y._last.localeCompare(x._last));
    const pick = (k, cur) => `<select data-pick="${k}" aria-label="${t("cmp.pick")}">${people.map(p => `<option value="${p.id}" ${p.id === cur ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`;
    view.innerHTML = `<button class="ui-btn text back" onclick="window.LabBack()">← ${t("d.back")}</button>
      <div class="page-head row-head"><div><h1>${t("cmp.title")}</h1></div><div class="btn-row">${pick("a", a)}<span class="muted">vs</span>${pick("b", b)}</div></div>
      <div class="cmp-grid">${head(a, "left")}${head(b, "right")}</div>
      <div class="card cmp-terrain" data-vz-axis="${V.kind}"><div class="row-between"><h3>${t("pf.terrain")}</h3>${V.axisSwitch()}</div>
        ${V.both(k => {
          const xa = A.by[k], xb = B.by[k], max = Math.max(...xa.map(x => x.share), ...xb.map(x => x.share));
          return `<div class="cmp-roses">${[[pa, xa], [pb, xb]].map(([q, xs]) => `<figure><figcaption><span class="dot" style="background:${q.color}"></span>${esc(q.name)}</figcaption>${V.rose(xs.map(x => ({ ...x, lab: 0 })), { size: 180, max })}</figure>`).join("")}</div>
          <div class="cmp-rows">${xa.map((x, i) => {
            const va = Math.round(x.share * 100), vb = Math.round(xb[i].share * 100);
            return `<div class="cmp-row" data-ax="${x.id}"><b class="${va > vb ? "win" : ""}">${va}%</b><span class="bar l"><i style="width:${va}%;background:${pa.color}"></i></span>
              <span class="nm" title="${esc(x.full)}"><span class="dot" style="background:${x.color}"></span><span class="tx">${esc(x.name)}</span></span><span class="bar"><i style="width:${vb}%;background:${pb.color}"></i></span><b class="${vb > va ? "win" : ""}">${vb}%</b></div>`;
          }).join("")}</div>`;
        })}</div>
      <div class="card"><h3>${t("cmp.both")} · ${both.length}</h3>
        <div class="mini-list">${both.slice(0, 30).map(p => UI.miniPaper(p)).join("") || `<div class="empty">${t("cmp.none")}</div>`}</div></div>`;
    view.querySelectorAll("[data-pick]").forEach(s => s.onchange = () => {
      const q = new URLSearchParams({ a, b }); q.set(s.dataset.pick, s.value); location.hash = "#/compare?" + q;
    });
  }

  (window.LabPages ||= {}).compare = { render };
})();
