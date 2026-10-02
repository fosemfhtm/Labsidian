/* Small SVG/HTML charts for the person page, the comparison and the people matrix (docs/PEOPLE_TOPICS_GUIDES.md).
 * Everything is drawn from real records: map areas (level "a" clusters), tags, readers, studies. No ratings.
 */
(() => {
  const { t } = window.I18N, UI = window.LabUI;
  const { esc } = UI;

  I18N.extend({
    ko: {
      "pf.terrain": "연구 지형", "pf.terrainHint": "연구실 지도의 어느 지역을 읽나 · 점선 = 연구실 평균", "pf.methods": "방법론", "pf.fields": "세부 분야",
      "pf.similar": "관심사가 비슷한 사람", "pf.similarHint": "가까울수록 비슷 · 클수록 같이 읽은 논문이 많음", "pf.recent": "최근 리뷰",
      "pf.reviews": "리뷰한 논문", "pf.shared": "함께 읽은 논문", "pf.studies": "참여한 스터디", "pf.other": "기타",
      "pf.more": "{x} 지역을 연구실 평균의 {k}배 읽어요", "pf.few": "리뷰가 {n}편 더 쌓이면 연구 지형이 보여요",
      "pf.compare": "비교하기", "pf.self": "다른 사람에게는 이렇게 보여요", "pf.toMe": "내 페이지로", "pf.role": "{area} 지역 · {method}",
      "pf.ask": "누구에게 물어볼까", "pf.askHint": "칸이 진할수록 그 지역 논문을 많이 읽었어요 · 줄을 누르면 그 사람 페이지",
      "cmp.title": "비교", "cmp.both": "둘 다 읽은 논문", "cmp.none": "아직 같이 읽은 논문이 없어요", "cmp.pick": "비교할 사람",
    },
    en: {
      "pf.terrain": "Research terrain", "pf.terrainHint": "Which areas of the lab map they read · dashed = lab average", "pf.methods": "Methods", "pf.fields": "Fields",
      "pf.similar": "Similar interests", "pf.similarHint": "Closer = more alike · bigger = more papers read together", "pf.recent": "Recent reviews",
      "pf.reviews": "Papers reviewed", "pf.shared": "Read together", "pf.studies": "Studies", "pf.other": "Other",
      "pf.more": "Reads {x} {k}× the lab average", "pf.few": "{n} more reviews and the research terrain appears",
      "pf.compare": "Compare", "pf.self": "This is how others see you", "pf.toMe": "My page", "pf.role": "{area} · {method}",
      "pf.ask": "Who to ask", "pf.askHint": "Darker = read more in that area · click a row to open the person",
      "cmp.title": "Compare", "cmp.both": "Read by both", "cmp.none": "No paper read by both yet", "cmp.pick": "Compare with",
    },
  });

  const D = () => window.LAB;
  const MIN_REVIEWS = 15;
  const short = (s, n = 10) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  // ---- map areas (≤ 8): the lab's fixed axes, largest first; named after their biggest region unless an admin named them
  function areas() {
    const papers = D().papers, size = {};
    papers.forEach(p => p.a && (size[p.a] = (size[p.a] || 0) + 1));
    const list = (D().clusters || []).filter(c => c.level === "a").map(a => {
      const kids = D().clusters.filter(c => c.level === "c" && c.parent === a.id).sort((x, y) => y.size - x.size);
      const name = a.custom ? UI.clusterName(a) : kids[0] ? UI.clusterName(kids[0]) : UI.clusterName(a);
      return { id: a.id, name, full: kids.map(k => UI.clusterName(k)).join(" / ") || name, color: kids[0]?.color || "#8e8e93", n: size[a.id] || 0 };
    }).filter(a => a.n).sort((x, y) => y.n - x.n);
    // automatic names are "topic · keyword": the topic alone where it's unique, else keep the keyword to tell them apart
    const base = a => a.name.split(" · ")[0], seen = {};
    list.forEach(a => (seen[base(a)] = (seen[base(a)] || 0) + 1));
    list.forEach(a => { if (seen[base(a)] === 1) a.name = base(a); });
    return list;
  }
  // an axis label: the topic, and under it the keyword when two areas share a topic
  const label2 = name => name.split(" · ");

  // ---- one person's profile, from what they read
  function profile(id) {
    const p = UI.P[id], papers = D().papers.filter(x => x.readers.includes(id)), A = areas();
    const total = D().papers.length || 1, mineN = papers.length || 1;
    const byArea = A.map(a => ({ ...a, mine: papers.filter(x => x.a === a.id).length }))
      .map(a => ({ ...a, share: a.mine / mineN, lab: a.n / total }));
    const tops = (prefix) => Object.entries(p?.topics || {}).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ id: k, label: UI.T[k] ? UI.tl(UI.T[k]) : k.slice(2), value: v, color: UI.T[k]?.color || "#8e8e93" }));
    const fields = tops("d:"), methods = tops("m:");
    const topArea = [...byArea].sort((x, y) => y.mine - x.mine)[0];
    const lift = [...byArea].filter(a => a.share >= 0.1 && a.lab > 0).map(a => ({ ...a, k: a.share / a.lab })).sort((x, y) => y.k - x.k)[0];
    const studies = window.Store ? Store.studies.list().filter(st => st.members.includes(id)).length : 0;
    return {
      count: p?.count || 0, enough: (p?.count || 0) >= MIN_REVIEWS, areas: byArea, fields, methods, studies,
      shared: papers.filter(x => x.readers.length > 1).length,
      role: topArea && methods[0] && (p?.count || 0) >= MIN_REVIEWS ? t("pf.role", { area: topArea.name, method: methods[0].label }) : "",
      lift: lift && lift.k >= 1.5 ? t("pf.more", { x: lift.name, k: lift.k.toFixed(1) }) : "",
    };
  }

  // ---- radar: series = [{ values: [share per axis], color, dashed }]; shares are square-rooted so one big axis doesn't make a spike
  function radar(axes, series, { w = 360, h = 250 } = {}) {
    const n = axes.length; if (n < 3) return "";
    const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 46;
    const vals = series.map(s => s.values.map(v => Math.sqrt(v)));
    const mx = Math.max(0.0001, ...vals.flat());
    const at = (i, r) => [cx + Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n) * r, cy + Math.sin(-Math.PI / 2 + i * 2 * Math.PI / n) * r];
    const ring = k => axes.map((_, i) => at(i, R * k).map(v => v.toFixed(1)).join(",")).join(" ");
    let svg = `<svg class="viz-radar" viewBox="0 0 ${w} ${h}" width="100%" role="img"><title>${esc(axes.map(a => a.name).join(", "))}</title>`;
    [1 / 3, 2 / 3, 1].forEach(k => (svg += `<polygon points="${ring(k)}" class="vz-grid"/>`));
    axes.forEach((a, i) => {
      const [x, y] = at(i, R), [lx, ly] = at(i, R + 14);
      const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
      svg += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="vz-grid"/>`;
      const [l1, l2] = label2(a.name), up = l2 && ly < cy ? -12 : 0;
      svg += `<text x="${lx.toFixed(1)}" y="${(ly + 4 + up).toFixed(1)}" text-anchor="${anchor}" class="vz-label"><title>${esc(a.full || a.name)}</title>${esc(short(l1, 12))}${l2 ? `<tspan x="${lx.toFixed(1)}" dy="13" class="vz-sub">${esc(short(l2, 14))}</tspan>` : ""}</text>`;
    });
    series.forEach((s, j) => {
      const pts = vals[j].map((v, i) => at(i, R * v / mx));
      svg += `<polygon points="${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}" class="${s.dashed ? "vz-avg" : "vz-area"}" style="--c:${s.color}"/>`;
      if (!s.dashed) pts.forEach((p, i) => (svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" class="vz-dot" style="--c:${s.color}"><title>${esc(axes[i].name)} ${Math.round(s.values[i] * 100)}%</title></circle>`));
    });
    return svg + "</svg>";
  }

  // ---- one-line stacked band (GitHub's language bar): top n + other
  function band(items, n = 5) {
    const tot = items.reduce((a, x) => a + x.value, 0); if (!tot) return `<div class="muted">—</div>`;
    const top = items.slice(0, n), rest = tot - top.reduce((a, x) => a + x.value, 0);
    const parts = [...top, ...(rest > 0 ? [{ label: t("pf.other"), value: rest, color: "var(--fill)" }] : [])];
    return `<div class="vz-band">${parts.map(x => `<i style="flex:${x.value};background:${x.color}" title="${esc(x.label)} ${Math.round(x.value / tot * 100)}%"></i>`).join("")}</div>
      <div class="vz-legend">${parts.map(x => `<span><i style="background:${x.color}"></i>${esc(x.label)} <b>${Math.round(x.value / tot * 100)}%</b></span>`).join("")}</div>`;
  }

  // ---- interest palette: field colours in proportion, a thin band under the name
  const palette = fields => fields.length ? `<div class="vz-palette">${fields.slice(0, 8).map(f => `<i style="flex:${f.value};background:${f.color}" title="${esc(f.label)}"></i>`).join("")}</div>` : "";

  // ---- weekly writing sparkline
  function spark(weeks, color) {
    if (!weeks.length) return "";
    const mx = Math.max(1, ...weeks), w = 100, h = 18, step = w / Math.max(1, weeks.length - 1);
    const pts = weeks.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / mx) * (h - 4)).toFixed(1)}`);
    return `<svg class="vz-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,${h} ${pts.join(" ")} ${w},${h}" style="fill:${color}"/></svg>`;
  }

  // ---- orbit: people around someone, nearer = more alike, bigger = more read together (clickable)
  function orbit(id, list) {
    const me = UI.P[id]; if (!me || !list.length) return "";
    const w = 360, h = 190, cx = 118, cy = h / 2;
    let svg = `<svg class="vz-orbit" viewBox="0 0 ${w} ${h}" width="100%" role="img"><title>${esc(list.map(s => UI.P[s.id]?.name).join(", "))}</title>`;
    [36, 60, 84].forEach(r => (svg += `<ellipse cx="${cx}" cy="${cy}" rx="${r * 1.25}" ry="${r}" class="vz-grid"/>`));
    const angles = [-0.5, 0.45, 1.5, 2.6, 3.7];
    list.slice(0, 5).forEach((s, i) => {
      const q = UI.P[s.id]; if (!q) return;
      const d = 32 + (1 - s.sim) * 96, x = cx + Math.cos(angles[i]) * d * 1.25, y = cy + Math.sin(angles[i]) * d * 0.95, r = 6 + Math.sqrt(s.shared || 0) * 2.4;
      svg += `<g class="vz-node" data-open="person:${s.id}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" style="fill:${q.color}"/>
        <text x="${(x + r + 5).toFixed(1)}" y="${(y + 1).toFixed(1)}" class="vz-name">${esc(q.name)}</text>
        <text x="${(x + r + 5).toFixed(1)}" y="${(y + 14).toFixed(1)}" class="vz-label">${Math.round(s.sim * 100)}% · ${t("d.together", { n: s.shared })}</text></g>`;
    });
    svg += `<circle cx="${cx}" cy="${cy}" r="18" style="fill:${me.color}"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" class="vz-me">${esc(me.name.slice(-2))}</text>`;
    return svg + "</svg>";
  }

  // ---- who-to-ask matrix: people × areas, shade = share of what they read
  function matrix() {
    const A = areas(), people = D().people.filter(p => p.count);
    const rows = people.map(p => { const pr = profile(p.id); return { p, v: A.map(a => pr.areas.find(x => x.id === a.id)?.share || 0) }; });
    rows.sort((x, y) => x.v.indexOf(Math.max(...x.v)) - y.v.indexOf(Math.max(...y.v)) || Math.max(...y.v) - Math.max(...x.v));
    return `<div class="vz-matrix" style="grid-template-columns:minmax(80px,auto) repeat(${A.length},minmax(0,1fr))">
      <div></div>${A.map(a => `<div class="vz-col" title="${esc(a.full)}">${label2(a.name).map(x => esc(short(x, 14))).join("<br>")}</div>`).join("")}
      ${rows.map(({ p, v }) => `<div class="vz-row" data-open="person:${p.id}">${UI.avatar(p.id)}<span>${esc(p.name)}</span></div>`
        + v.map((x, i) => `<div class="vz-cell" data-open="person:${p.id}" title="${esc(p.name)} · ${esc(A[i].name)} ${Math.round(x * 100)}%" style="--a:${Math.min(1, x * 1.8).toFixed(2)}"></div>`).join("")).join("")}
    </div>`;
  }

  window.LabViz = { areas, profile, radar, band, palette, spark, orbit, matrix, MIN_REVIEWS };
})();
