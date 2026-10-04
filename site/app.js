/* Labsidian — pages, detail drawer, routing. The graph lives in graph.js (ES module). */
(() => {
  const D = window.LAB;
  const { t, lang } = window.I18N;
  // lookups by id; filled by index() and refilled in place whenever the store rebuilds window.LAB
  const P = {}, T = {}, PA = {}, R = {};
  const CL = Object.fromEntries((D.clusters || []).map(c => [c.id, c]));
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initial = name => /^[A-Za-z]/.test(name) ? name[0].toUpperCase() : name.slice(-2);
  const tl = x => (lang === "en" ? x.labelEn : x.label) || x.label;
  const clusterName = c => !c ? "" : c.custom ? (lang === "en" ? c.custom.en : c.custom.ko)  // named by an admin
    : c.level === "f" && c.keywords?.length ? c.keywords.slice(0, 2).join(" · ") : (lang === "en" ? c.en : c.ko);
  const topicIds = p => [...p.domains.map(d => "d:" + d), ...p.methods.map(m => "m:" + m)];

  const paperTopicCount = {};
  function index() {
    for (const [map, list] of [[P, D.people], [T, D.topics], [PA, D.allPapers || D.papers], [R, D.allReviews || D.reviews]]) {
      Object.keys(map).forEach(k => delete map[k]);
      list.forEach(x => (map[x.id] = x));
    }
    Object.keys(paperTopicCount).forEach(k => delete paperTopicCount[k]);
    D.papers.forEach(p => topicIds(p).forEach(x => (paperTopicCount[x] = (paperTopicCount[x] || 0) + 1)));
    new Set([...D.papers, ...(D.allPapers || [])]).forEach(p => {
      p._hay = (p.title + " " + p.authors + " " + p.venue + " " + p.venueNorm + " " +
        p.reviews.filter(r => !window.Store?.studies.hidden(R[r])).map(r => R[r].content + " " + R[r].memo).join(" ")).toLowerCase();
      p._last = p.reviews.map(r => R[r].date).sort().pop();
    });
  }
  index();
  // changes polled from the server (another tab, a teammate, MCP) rebuild window.LAB with new objects
  window.addEventListener("lab:data", index);

  // ---------- render helpers ----------
  const avatar = (id, big) => {
    const p = P[id];
    if (!p) return `<span class="avatar unknown">?</span>`;
    // initials: dark on light colours (yellow, mint…), white otherwise — keeps them readable in both themes
    const h = /^#/.test(p.color || "") ? p.color.slice(1) : "8e8e93", [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
    const L = [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }), lum = .2126 * L[0] + .7152 * L[1] + .0722 * L[2];
    const ink = (lum + .05) / .0607 > 1.05 / (lum + .05) ? "var(--ink-on-light)" : "var(--on-color)";   // whichever of black/white contrasts more
    return `<span class="avatar${big ? " big" : ""}" title="${esc(p.name)}" style="background:${esc(p.color)};color:${ink};text-shadow:none">${esc(initial(p.name))}</span>`;
  };
  // a data colour that's safe inside style="": #hex or rgb(var(--name)); anything else → gray
  const safeColor = c => (/^#[0-9a-f]{3,8}$/i.test(c || "") || /^rgb\(var\(--[a-z0-9]+\)\)$/.test(c || "") ? c : "rgb(var(--gray2))");
  const avStack = (ids, max = 5, cls = id => "") => {
    const shown = ids.slice(0, max), rest = ids.slice(max);
    return `<span class="st-avs">${shown.map(u => `<span class="${cls(u)}">${avatar(u)}</span>`).join("")}${rest.length
      ? `<span class="av-more" title="${esc(rest.map(u => P[u]?.name || u).join(", "))}">+${rest.length}</span>` : ""}</span>`;
  };
  const stars = n => {
    const full = Math.round(n);
    return `<span class="stars">${"★".repeat(full)}<span class="off">${"★".repeat(Math.max(0, 5 - full))}</span></span>`;
  };
  const tag = tid => {
    const x = T[tid];
    return x ? `<span class="ui-tag ${esc(x.axis)}" data-open="topic:${esc(tid)}"><span class="dot" style="background:${safeColor(x.color)}"></span>${esc(tl(x))}</span>` : "";
  };
  const bars = (items, max) => `<div class="bars">${items.map(([label, n, color, open]) => `
    <div class="bar-row ${open ? "click" : ""}" ${open ? `data-open="${open}"` : ""}>
      <span class="lbl">${esc(label)}</span>
      <span class="track"><span class="fill" style="width:${(100 * n / max).toFixed(1)}%;background:${color}"></span></span>
      <span class="n">${n}</span>
    </div>`).join("")}</div>`;
  const linkHtml = l => /^https?:\/\//.test(l)
    ? `<a href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>` : esc(l);

  // diary date (which week it counts for) vs. when it was actually posted
  const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const regBadge = r => {
    if (!r.createdAt || !r.date) return "";
    const n = Math.round((Date.parse(localDay(r.createdAt)) - Date.parse(r.date)) / 864e5);
    if (!n) return "";
    const at = new Date(r.createdAt).toLocaleString(lang === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return `<span class="ui-pill ${n > 0 ? "warn" : "info"}" title="${esc(t("rv.regAt", { at }))}">${t(n > 0 ? "rv.late" : "rv.early", { n: Math.abs(n) })}</span>`;
  };
  // attachments: <img>/<a> carry data-fid; hydrateFiles() swaps in the stored blob URL
  const kb = n => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const filesHtml = files => {
    if (!files?.length) return "";
    const imgs = files.filter(f => f.kind === "image"), pdfs = files.filter(f => f.kind === "pdf");
    return `<div class="rv-files">
      ${pdfs.map(f => `<a class="rv-pdf" data-fid="${esc(f.id)}" target="_blank" rel="noopener">📄 ${esc(f.name)} <span class="m">${kb(f.size)}</span></a>`).join("")}
      ${imgs.length ? `<div class="rv-imgs">${imgs.map(f => `<img data-fid="${esc(f.id)}" alt="${esc(f.name)}" title="${esc(f.name)}" loading="lazy">`).join("")}</div>` : ""}
    </div>`;
  };
  async function hydrateFiles(root = document) {
    for (const el of root.querySelectorAll("[data-fid]:not([data-ready])")) {
      el.dataset.ready = "1";
      const url = window.Store ? await Store.files.url(el.dataset.fid) : null;
      if (!url) { el.classList.add("missing"); continue; }
      if (el.tagName === "IMG") el.src = url; else el.href = url;
    }
  }
  // emoji used as control icons → Lucide (ISC). Only inside controls/labels, never in review or comment text.
  const ICONS = { "✎": "pen-line", "📅": "calendar", "🔔": "bell", "📄": "file-text", "📎": "paperclip", "📚": "book-open", "👍": "thumbs-up",
    "💬": "message-circle", "🌐": "languages", "🔗": "link", "◎": "locate-fixed", "🙈": "eye-off", "🤖": "bot", "❓": "circle-help", "💡": "lightbulb",
    "🖼": "image", "👀": "eye", "⬇": "download", "📥": "download", "🗑": "trash-2", "⚙": "settings", "🔍": "search", "⋯": "ellipsis", "＋": "plus", "▾": "chevron-down", "⏰": "alarm-clock", "📝": "notebook-pen" };
  const ICON_RE = new RegExp("(" + Object.keys(ICONS).join("|") + ")\\uFE0F?\\s?", "g");
  const ICON_SCOPE = "button, .ui-btn, .ui-seg a, .ui-pill, .ui-notice, .menu a, .menu > button, .term-btn, .ui-chip, .side-st b, .act-body, h3, h4, label, .rf, .cm-kind button, summary";
  function iconize(root) {
    root.querySelectorAll?.(ICON_SCOPE).forEach(el => {
      if (el.closest(".rv-body, .rv-memo, .cm-body, .act-body .q, textarea, [contenteditable]")) return;
      [...el.childNodes].forEach(n => {
        if (n.nodeType !== 3 || !ICON_RE.test(n.nodeValue)) return;
        ICON_RE.lastIndex = 0;
        const span = document.createElement("span");
        span.innerHTML = esc(n.nodeValue).replace(ICON_RE, (_, g) => `<i data-lucide="${ICONS[g]}" class="ic"></i>`);
        n.replaceWith(...span.childNodes);
      });
    });
    if (root.querySelector?.("i[data-lucide]")) window.lucide?.createIcons();
  }
  let iconTimer = null;
  new MutationObserver(muts => {
    if (!muts.some(m => m.addedNodes.length)) return;
    hydrateFiles();
    if (!iconTimer) iconTimer = requestAnimationFrame(() => { iconTimer = null; iconize(document.body); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", e => {
    const img = e.target.closest(".rv-imgs img[src]"); if (!img) return;
    const box = document.createElement("div"); box.className = "lightbox";
    box.innerHTML = `<img src="${img.src}" alt="">`; box.onclick = () => box.remove();
    document.body.appendChild(box);
  });

  // my own diary on a paper → its pages offer "edit my diary" instead of writing a second one
  const myReviewOn = p => { const me = window.Store?.auth.current(); return me ? p.reviews.map(id => R[id]).find(r => r && r.person === me.id) || null : null; };
  const writeBtn = p => { const mine = myReviewOn(p);
    return mine ? `<a class="ui-btn prominent" href="#/write?review=${mine.id}">✎ ${t("s.myDiary")}</a>` : `<a class="ui-btn prominent" href="#/write?paper=${p.id}">✎ ${t("s.writeThis")}</a>`; };
  const readingBtn = p => (myReviewOn(p) ? "" : `<button class="ui-btn" data-reading="${p.id}">${Store.reading.has(p.id) ? "✓ " + t("s.inReading") : "📚 " + t("s.addReading")}</button>`);
  const reviewHtml = (r, opts = {}) => {
    const p = P[r.person] || { name: t("unknownPerson"), color: "rgb(var(--gray))" };
    const mine = window.Store?.auth.current()?.id === r.person;
    // study "write first, then read": hidden until I post my own entry on this paper
    if (window.Store?.studies.hidden(r)) return `<div class="review blind" id="rv-${r.id}" data-review="${r.id}">
      ${opts.title ? `<a class="rv-paper" href="#/paper/${r.paper}">${esc(PA[r.paper]?.title || "")}</a>` : ""}
      <div class="rv-head">${avatar(r.person)}<b data-open="person:${r.person}">${esc(p.name)}</b><span class="date">${esc(r.date)}</span></div>
      <p class="blind-msg">🙈 ${t("st.blindMsg")} <a class="ui-btn text" href="#/write?study=${r.studyId}">${t("st.writeMine")}</a></p></div>`;
    const long = !opts.full && r.content.length > 380;
    return `<div class="review ${opts.full ? "full" : ""} ${mine ? "mine" : ""}" id="rv-${r.id}" data-review="${r.id}">
      ${opts.title ? `<a class="rv-paper" href="#/paper/${r.paper}">${esc(PA[r.paper]?.title || "")}</a>` : ""}
      <div class="rv-head">${avatar(r.person)}<b data-open="person:${r.person}">${esc(p.name)}</b>${stars(r.rating)}
        <span class="date" title="${t("rv.diaryDate")}">${esc(r.date)}</span>${regBadge(r)}
        ${mine ? `<span class="ui-pill accent">${t("rv.mine")}</span>` : ""}
        ${r.studyId && window.Store?.studies.get(r.studyId) ? `<a class="ui-pill ok" href="#/study/${r.studyId}">${t("st.reviewBadge")}</a>` : ""}</div>
      ${r.content ? `<div class="rv-body ${long ? "" : "open"}">${esc(r.content)}</div>
        ${long ? `<button class="rv-toggle">${t("rv.expand")}</button>` : ""}` : ""}
      ${r.memo ? `<div class="rv-memo" data-label="${t("rv.memo")}">${esc(r.memo)}</div>` : ""}
      ${filesHtml(r.files)}
      ${(r.tags || []).length ? `<div class="tags-row small">${r.tags.map(tag).join("")}</div>` : ""}
      ${window.LabSocial ? window.LabSocial.footer(r) : ""}
    </div>`;
  };
  const miniPaper = (p, right) => `<div class="ui-row mini" data-open="paper:${p.id}"><span class="t">${esc(p.title)}</span>
      <span class="m">${avStack(p.readers, 4)}</span>
      <span class="m">${right ?? stars(p.rating)}</span></div>`;

  // ---------- drawer ----------
  const drawer = $("#drawer"), drawerBody = $("#drawer-body");
  let lastDrawer = null;
  function openDrawer(kind, id, opts = {}) {
    lastDrawer = [kind, id];
    const html = kind === "person" ? personDetail(id) : kind === "topic" ? topicDetail(id)
      : kind === "cluster" ? clusterDetail(id) : paperDetail(id);
    if (!html) return;
    drawerBody.innerHTML = html;
    const ex = $("#drawer-expand");
    ex.hidden = !(kind === "paper" || kind === "person");
    if (!ex.hidden) ex.href = `#/${kind}/${id}`;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    drawer.scrollTop = 0;
    if (!opts.fromGraph && window.LabGraph && (kind === "paper" || kind === "person") && currentView() === "graph") {
      window.LabGraph.select(kind === "paper" ? id : "u:" + id);
    }
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
  $("#drawer-close").onclick = () => { closeDrawer(); window.LabGraph?.select(null); };
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeDrawer(); window.LabGraph?.select(null); }
  });
  document.addEventListener("click", e => {
    const tgl = e.target.closest(".rv-toggle");
    if (tgl) {
      const body = tgl.previousElementSibling;
      body.classList.toggle("open");
      tgl.textContent = body.classList.contains("open") ? t("rv.collapse") : t("rv.expand");
      return;
    }
    const g = e.target.closest("[data-graph]");
    if (g) {
      location.hash = "#/graph";
      setTimeout(() => window.LabGraph?.select(g.dataset.graph, { zoom: true, openDrawer: true }), 60);
      return;
    }
    const el = e.target.closest("[data-open]");
    if (!el) return;
    const [kind, ...rest] = el.dataset.open.split(":");
    openDrawer(kind, rest.join(":"));
  });

  function personDetail(id) {
    const p = P[id];
    if (!p) return "";
    const V = window.LabViz, pr = V.profile(id), me = window.Store?.auth.current();
    const mine = D.reviews.filter(r => r.person === id).sort((a, b) => b.date.localeCompare(a.date));
    const other = me && me.id !== id && P[me.id] ? me.id : p.similar[0]?.id;
    const fieldsTop = pr.fields.slice(0, 6), fieldsRest = pr.fields.slice(6).reduce((a, f) => a + f.value, 0);
    return `
      <div class="pd-head"><div class="pc-head">${avatar(id, true)}
        <div><h2>${esc(p.name)}</h2><div class="pc-meta">${D.terms.join(", ")} Paper Diary</div></div></div></div>
      ${pr.role ? `<div class="pf-role">${esc(pr.role)}</div>` : ""}
      ${me?.id === id ? `<p class="pf-self">${t("pf.self")} · <a href="#/me">${t("pf.toMe")} →</a></p>` : ""}
      <div class="pf-stats">
        <div><b>${pr.count}</b><span>${t("pf.reviews")}</span>${V.spark(weekBuckets(p.dates), p.color)}</div>
        <div><b>${pr.shared}</b><span>${t("pf.shared")}</span></div>
        <div><b>${pr.studies}</b><span>${t("pf.studies")}</span></div>
      </div>
      <div class="btn-row"><button class="ui-btn" data-graph="u:${id}">◎ ${t("d.showInGraph")}</button>
        ${other ? `<a class="ui-btn" href="#/compare?a=${id}&b=${other}">⇄ ${t("pf.compare")}</a>` : ""}</div>
      <h4>${t("pf.terrain")}</h4>
      ${V.terrain(id)}
      ${pr.fields.length ? `<h4>${t("pf.fields")}</h4>
      ${bars([...fieldsTop.map(f => [f.label, f.value, T[f.id]?.color || "rgb(var(--gray2))", `topic:${f.id}`]), ...(fieldsRest ? [[t("pf.other"), fieldsRest, "rgb(var(--gray))"]] : [])], fieldsTop[0].value)}` : ""}
      ${p.similar.length ? `<h4>${t("pf.similar")}</h4><p class="hint">${t("pf.similarHint")}</p>${V.similar(id, p.similar)}` : ""}
      <div class="pf-recent"><h4>${t("pf.recent")}</h4>
      <div class="mini-list">${mine.slice(0, 15).map(r => miniPaper(PA[r.paper], r.date)).join("")}</div>
      <p class="kv"><a href="#/person/${id}">${mine.length > 15 ? t("d.all", { n: mine.length }) : t("pf.toProfile")}</a></p></div>
    `;
  }

  // how much a paper is read and talked about in the lab — readers, 👍/👀, comments (ratings aren't a signal here)
  const buzz = p => p.readers.length * 3 + p.reviews.reduce((s, rid) => {
    if (!window.Store) return s;
    const x = Store.reactions.get(rid); return s + 2 * (x.like.length + x.want.length) + Store.comments.count(rid);
  }, 0);
  function topicDetail(tid) {
    const x = T[tid];
    if (!x) return "";
    const key = tid.slice(2);
    const list = D.papers.filter(p => (x.axis === "domain" ? p.domains : p.methods).includes(key));
    const who = {};
    list.forEach(p => p.reviews.forEach(r => (who[R[r].person] = (who[R[r].person] || 0) + 1)));
    const whoArr = Object.entries(who).sort((a, b) => b[1] - a[1]).filter(([id]) => P[id]);
    const co = {};
    list.forEach(p => topicIds(p).forEach(y => { if (y !== tid && !y.startsWith(tid[0])) co[y] = (co[y] || 0) + 1; }));
    const coArr = Object.entries(co).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const top = [...list].sort((a, b) => buzz(b) - buzz(a) || b._last.localeCompare(a._last)).slice(0, 8);  // not by rating: most are the 3-star default
    const recent = [...list].sort((a, b) => b._last.localeCompare(a._last)).slice(0, 10);
    return `
      <div class="kv">${x.axis === "domain" ? t("d.domain") : t("d.method")}</div>
      <h2><span class="dot-lg" style="background:${x.color}"></span>${esc(tl(x))}</h2>
      <div class="stat-row">
        <div class="stat"><b>${list.length}</b><span>${t("d.papers")}</span></div>
        <div class="stat"><b>${whoArr.length}</b><span>${t("d.readers")}</span></div>
        <div class="stat"><b>${list.filter(p => p.readers.length > 1).length}</b><span>${t("d.shared")}</span></div>
      </div>
      <h4>${t("d.who")}</h4>
      ${bars(whoArr.map(([id, n]) => [P[id].name, n, P[id].color, "person:" + id]), whoArr[0]?.[1] || 1)}
      <h4>${x.axis === "domain" ? t("d.coMethods") : t("d.coDomains")}</h4>
      ${bars(coArr.map(([k, n]) => [tl(T[k]), n, T[k].color, "topic:" + k]), coArr[0]?.[1] || 1)}
      <h4>${t("d.top")}</h4>
      <div class="mini-list">${top.map(p => miniPaper(p)).join("")}</div>
      <h4>${t("d.recentRead")}</h4>
      <div class="mini-list">${recent.map(p => miniPaper(p, p._last)).join("")}</div>
      ${window.Store?.guides.forTag(tid).length ? `<h4>${t("gd.title")}</h4><div class="mini-list">${Store.guides.forTag(tid).map(g => `<a class="ui-row mini" href="#/guide/${g.id}"><span class="t">${esc(g.title)}</span><span class="m">${g.items.length}</span></a>`).join("")}</div>` : ""}
      <p class="kv"><a href="#/topic/${encodeURIComponent(tid)}">${t("tp.page")} →</a> · <a href="#/papers?topic=${encodeURIComponent(tid)}">${t("d.topicAll")}</a></p>
    `;
  }

  function clusterDetail(cid) {
    const c = CL[cid];
    if (!c) return "";
    const list = D.papers.filter(p => p[c.level] === cid);
    const who = {};
    list.forEach(p => p.reviews.forEach(r => (who[R[r].person] = (who[R[r].person] || 0) + 1)));
    const whoArr = Object.entries(who).sort((a, b) => b[1] - a[1]).filter(([id]) => P[id]);
    const tags = {};
    list.forEach(p => topicIds(p).forEach(x => (tags[x] = (tags[x] || 0) + 1)));
    const tagArr = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const top = [...list].sort((a, b) => b.rating - a.rating || b.readers.length - a.readers.length);
    const parent = c.parent ? CL[c.parent] : null;
    return `
      <div class="kv">${t("d.cluster")}${parent ? ` · ${esc(clusterName(parent))}` : ""}</div>
      <h2><span class="dot-lg" style="background:${(parent || c).color}"></span>${esc(clusterName(c))}</h2>
      <div class="kv">${esc((c.custom?.keywords || c.keywords).join(", "))}</div>
      <div class="stat-row">
        <div class="stat"><b>${list.length}</b><span>${t("d.papers")}</span></div>
        <div class="stat"><b>${whoArr.length}</b><span>${t("d.readers")}</span></div>
        <div class="stat"><b>${list.filter(p => p.readers.length > 1).length}</b><span>${t("d.shared")}</span></div>
      </div>
      <h4>${t("d.who")}</h4>
      ${bars(whoArr.map(([id, n]) => [P[id].name, n, P[id].color, "person:" + id]), whoArr[0]?.[1] || 1)}
      <h4>${t("d.domains")}</h4>
      ${bars(tagArr.map(([k, n]) => [tl(T[k]), n, T[k].color, "topic:" + k]), tagArr[0]?.[1] || 1)}
      <h4>${t("d.clusterPapers")}</h4>
      <div class="mini-list">${top.slice(0, 30).map(p => miniPaper(p)).join("")}</div>
    `;
  }

  function paperDetail(id) {
    const p = PA[id];
    if (!p) return "";
    const related = (p.nb || []).map(([pid, s]) => [PA[pid], s]).filter(([x]) => x);
    const refs = (p.refs || []).map(r => PA[r]).filter(Boolean);
    const c = CL[p.f], cc = CL[p.c];
    return `
      <h2>${esc(p.title)}</h2>
      <div class="kv">${esc(p.authors)}</div>
      <div class="kv near">${esc(p.venueNorm || p.venue)}${p.year ? ` · ${p.year}` : ""}</div>
      ${p.link ? `<div class="kv near">${linkHtml(p.link)}</div>` : ""}
      <div class="tags-row">${topicIds(p).map(tag).join("")}</div>
      ${cc ? `<div class="tags-row"><span class="ui-tag" data-open="cluster:${cc.id}"><span class="dot" style="background:${cc.color}"></span>${esc(clusterName(cc))}</span>
        ${c ? `<span class="ui-tag" data-open="cluster:${c.id}">${esc(clusterName(c))}</span>` : ""}</div>` : ""}
      <div class="btn-row">
        ${p.x != null ? `<button class="ui-btn" data-graph="${p.id}">◎ ${t("d.showInGraph")}</button>` : ""}
        ${window.Store ? `${readingBtn(p)}
        ${writeBtn(p)}` : ""}
      </div>
      <div class="stat-row">
        <div class="stat"><b>${p.rating ? p.rating.toFixed(1) : "-"}</b><span>${t("d.avg")}</span></div>
        <div class="stat"><b>${p.readers.length}</b><span>${t("d.readers")}</span></div>
        <div class="stat"><b>${p.citations ?? "-"}</b><span>${t("d.cites")}</span></div>
        <div class="stat"><b>${esc(p.firstDate.slice(5).replace("-", "/"))}</b><span>${t("d.firstRead")}</span></div>
      </div>
      ${p.abstract ? `<h4>${t("d.abstract")}</h4><div class="rv-body abstract">${esc(p.abstract)}</div><button class="rv-toggle">${t("rv.expand")}</button>` : ""}
      <h4>${t("d.reviews", { n: p.reviews.length })}</h4>
      <div style="display:grid;gap:10px">${p.reviews.map(r => reviewHtml(R[r])).join("")}</div>
      ${related.length ? `<h4>${t("d.related")}</h4><div class="mini-list">${related.map(([x, s]) => miniPaper(x, Math.round(s * 100) + "%")).join("")}</div>` : ""}
      ${refs.length ? `<h4>${t("d.citesIn")}</h4><div class="mini-list">${refs.map(x => miniPaper(x)).join("")}</div>` : ""}
    `;
  }

  // ---------- people page ----------
  function weekBuckets(dates) {
    const all = D.reviews.map(r => r.date).sort();
    if (!all.length) return [];
    const start = new Date(all[0]), end = new Date(all[all.length - 1]);
    const nWeeks = Math.max(1, Math.ceil((end - start) / 6048e5) + 1);
    const b = new Array(nWeeks).fill(0);
    dates.forEach(([d, n]) => { b[Math.floor((new Date(d) - start) / 6048e5)] += n; });
    return b;
  }
  function renderPeople() {
    $("#people-sub").textContent = t("people.sub", { n: D.people.length, r: D.reviews.length, p: D.papers.length });
    // the whole lab on top (areas | methods, legend, picker), everyone's two roses below
    const V = window.LabViz;
    $("#lab-bars").innerHTML = V.labCard();
    $("#people-grid").innerHTML = V.peopleCards([...D.people].filter(p => p.count).sort((a, b) => b.count - a.count));
  }

  // ---------- papers page ----------
  let paperLimit = 60;
  function initPaperFilters() {
    $("#f-topic").innerHTML = `<option value="">${t("f.allTopics")}</option>
      <optgroup label="${t("f.domains")}">${D.topics.filter(x => x.axis === "domain").map(x => `<option value="${x.id}">${esc(tl(x))}</option>`).join("")}</optgroup>
      <optgroup label="${t("f.methods")}">${D.topics.filter(x => x.axis === "method").map(x => `<option value="${x.id}">${esc(tl(x))}</option>`).join("")}</optgroup>`;
    $("#f-person").innerHTML = `<option value="">${t("f.allPeople")}</option>` + D.people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    $("#f-minrating").innerHTML = `<option value="0">${t("f.allRatings")}</option><option value="4">${t("f.r4")}</option><option value="3">${t("f.r3")}</option>`;
    $("#f-sort").innerHTML = `<option value="date">${t("f.recent")}</option><option value="rating">${t("f.rating")}</option><option value="readers">${t("f.readers")}</option>`;
    ["#f-topic", "#f-person", "#f-minrating", "#f-sort"].forEach(s => $(s).onchange = () => { paperLimit = 60; renderPapers(); });
    $("#p-search").addEventListener("input", () => { paperLimit = 60; renderPapers(); });
  }
  function renderPapers() {
    const q = $("#p-search").value.trim().toLowerCase();
    const topic = $("#f-topic").value, person = $("#f-person").value, minR = +$("#f-minrating").value, sort = $("#f-sort").value;
    const list = D.papers.filter(p =>
      (!topic || topicIds(p).includes(topic)) &&
      (!person || p.readers.includes(person)) &&
      (!minR || p.rating >= minR) &&
      (!q || q.split(/\s+/).every(w => p._hay.includes(w))));
    list.sort(sort === "rating" ? (a, b) => b.rating - a.rating || b._last.localeCompare(a._last)
      : sort === "readers" ? (a, b) => b.readers.length - a.readers.length || b._last.localeCompare(a._last)
      : (a, b) => b._last.localeCompare(a._last));
    $("#papers-sub").textContent = t("papers.count", { n: list.length }) + (q ? t("papers.query", { q }) : "");
    $("#paper-list").innerHTML = list.slice(0, paperLimit).map(p => `
      <div class="paper-row" data-open="paper:${p.id}">
        <div class="pr-title">${esc(p.title)}</div>
        <div class="pr-right"><div class="readers">${p.readers.map(id => avatar(id)).join("")}</div>${stars(p.rating)}</div>
        <div class="pr-meta"><span>${esc(p.venueNorm || p.venue)}${p.year ? ` · ${p.year}` : ""}</span><span>${esc(p._last)}</span>${topicIds(p).map(tag).join("")}</div>
      </div>`).join("") || `<div class="ui-empty">${t("papers.empty")}</div>`;
    if (list.length > paperLimit) {
      $("#paper-list").insertAdjacentHTML("beforeend", `<button class="ui-btn plain load-more" id="more">${t("papers.more", { n: list.length - paperLimit })}</button>`);
      $("#more").onclick = e => { e.stopPropagation(); paperLimit += 60; renderPapers(); };
    }
  }

  function renderShared() {
    const list = D.papers.filter(p => p.readers.length > 1)
      .sort((a, b) => b.readers.length - a.readers.length || b._last.localeCompare(a._last));
    $("#shared-list").innerHTML = list.map(p => `
      <div class="ui-card shared-item">
        <h3 data-open="paper:${p.id}">${esc(p.title)}</h3>
        <div class="pr-meta"><span>${esc(p.venueNorm || p.venue)}</span>${stars(p.rating)}${topicIds(p).map(tag).join("")}</div>
        <div class="rev-cols">${p.reviews.map(r => reviewHtml(R[r])).join("")}</div>
      </div>`).join("");
  }


  // ---------- full-screen detail pages ----------
  const pageView = id => {
    let v = document.getElementById("view-" + id);
    if (!v) { v = document.createElement("section"); v.id = "view-" + id; v.className = "view page wide"; $("main").appendChild(v); }
    return v;
  };
  // "back" stays inside the app: go back only if we navigated here from another in-app page
  const back = `<button class="ui-btn text back" onclick="window.LabBack()">← ${t("d.back")}</button>`;
  // studies this paper took part in: as the common paper (with the papers people brought) or as someone's pick
  function studiesCard(pid) {
    const L = window.Store?.studies.forPaper(pid) || [];
    if (!L.length) return "";
    const pickLink = pk => { const pp = Store.studies.pickPaper(pk); return `<div class="ui-row st-with">${avatar(pk.uid)}${pp ? `<a href="#/paper/${pp.id}">${esc(pk.title)}</a>` : esc(pk.title)}</div>`; };
    return `<div class="ui-card"><h3>${t("d.studies")}</h3>${L.map(({ st, common, picks }) => {
      const others = common ? Store.studies.picks(st) : [];
      return `<a class="ui-row two side-st" href="#/study/${st.id}"><b>📚 ${esc(st.title)}</b>
        <span class="m">${common ? t("d.studyCommon") : t("d.studyPicked", { names: picks.map(pk => esc(P[pk.uid]?.name || pk.uid)).join(", ") })}${st.date ? " · " + esc(st.date) : ""}</span></a>
        ${others.length ? `<div class="m st-with-h">${t("d.studyWith")}</div>${others.map(pickLink).join("")}` : ""}`;
    }).join("")}</div>`;
  }
  function paperPage(id) {
    const v = pageView("paper"), p = PA[id];
    if (!p) { v.innerHTML = `<div class="ui-empty">404</div>`; return; }
    const related = (p.nb || []).map(([pid, s]) => [PA[pid], s]).filter(([x]) => x);
    const refs = (p.refs || []).map(r => PA[r]).filter(Boolean);
    const cc = CL[p.c], c = CL[p.f];
    v.innerHTML = `${back}
      <div class="dp-head">
        ${cc ? `<div class="tags-row"><span class="ui-tag" data-open="cluster:${cc.id}"><span class="dot" style="background:${cc.color}"></span>${esc(clusterName(cc))}</span>
          ${c ? `<span class="ui-tag" data-open="cluster:${c.id}">${esc(clusterName(c))}</span>` : ""}</div>` : ""}
        <h1>${esc(p.title)}</h1>
        <div class="kv">${esc(p.authors)}</div>
        <div class="kv">${esc(p.venueNorm || p.venue)}${p.year ? ` · ${p.year}` : ""}${p.citations != null ? ` · ${t("d.cites")} ${p.citations}` : ""}</div>
        ${p.link ? `<div class="kv">${linkHtml(p.link)}</div>` : ""}
        <div class="tags-row">${topicIds(p).map(tag).join("")}${(p.free || []).map(tag).join("")}</div>
        <div class="btn-row">
          ${(() => { const f = p.reviews.filter(x => !window.Store?.studies.hidden(R[x])).flatMap(x => R[x].files || []).find(f => f.kind === "pdf"); return f ? `<a class="ui-btn" data-fid="${esc(f.id)}" target="_blank" rel="noopener">${t("d.pdf")}</a>` : ""; })()}
          ${p.x != null ? `<button class="ui-btn" data-graph="${p.id}">◎ ${t("d.showInGraph")}</button>` : ""}
          ${window.Store ? `${readingBtn(p)}
          ${writeBtn(p)}` : ""}
        </div>
      </div>
      <div class="dp-grid">
        <div class="dp-main">
          ${p.abstract ? `<div class="ui-card"><h3>${t("d.abstract")}</h3><p class="abstract-full">${esc(p.abstract)}</p></div>` : ""}
          <h3 class="dp-sec">${t("d.reviews", { n: p.reviews.length })} · ${stars(p.rating)} ${p.rating ? p.rating.toFixed(1) : ""}</h3>
          <div class="dp-reviews">${p.reviews.map(r => reviewHtml(R[r], { full: true })).join("")}</div>
        </div>
        <aside class="dp-side">
          ${studiesCard(p.id)}
          <div class="ui-card"><h3>${t("d.readers")}</h3>${p.readers.map(r => `<div class="ui-row sim-row" data-open="person:${r}">${avatar(r)}<span>${esc(P[r]?.name || r)}</span><span></span><span class="m">${R[p.reviews.find(x => R[x].person === r)]?.date || ""}</span></div>`).join("")}</div>
          ${related.length ? `<div class="ui-card"><h3>${t("d.related")}</h3><div class="mini-list">${related.map(([x, s]) => miniPaper(x, Math.round(s * 100) + "%")).join("")}</div></div>` : ""}
          ${refs.length ? `<div class="ui-card"><h3>${t("d.citesIn")}</h3><div class="mini-list">${refs.map(x => miniPaper(x)).join("")}</div></div>` : ""}
        </aside>
      </div>`;
    // open every comment thread on the full page
    p.reviews.forEach(r => window.LabSocial?.openThread(r, null, v));
  }
  // the person page is their profile (design/patterns §2-B "사람 페이지"): the same for everyone, every term — who
  // they are in the lab's reading (terrain on both axes, how it moved) and their diaries to browse. The drawer is the
  // short version; my own to-dos and editing live on my page.
  function personPage(id) {
    const v = pageView("person"), p = P[id];
    if (!p) { v.innerHTML = `<div class="ui-empty">404</div>`; return; }
    const V = window.LabViz, pr = V.profile(id), me = window.Store?.auth.current();
    const other = me && me.id !== id && P[me.id] ? me.id : p.similar[0]?.id;
    const fieldsTop = pr.fields.slice(0, 8), fieldsRest = pr.fields.slice(8).reduce((a, f) => a + f.value, 0);
    const side = k => `<div class="pf-side"><h4>${t("pf.axis." + k)}</h4>
        <div class="vz-rose-wrap">${V.rose(pr.by[k])}${V.roseLegend(pr.by[k])}</div>
        ${pr.lift[k] ? `<p class="pf-insight">${esc(pr.lift[k])}</p>` : ""}</div>`;
    v.innerHTML = `${back}
      <div class="pf-top">
        <div class="pc-head">${avatar(id, true)}<div><h1>${esc(p.name)}</h1>
          ${pr.role ? `<p class="pf-role">${esc(pr.role)}</p>` : `<p class="pc-meta">${t("pc.metaN", { n: pr.count })}</p>`}
          ${me?.id === id ? `<p class="pf-self">${t("pf.self")} · <a href="#/me">${t("pf.toMe")} →</a></p>` : ""}</div></div>
        <div class="pf-stats">
          <div><b>${pr.count}</b><span>${t("pf.reviews")}</span>${V.spark(weekBuckets(p.dates), p.color)}</div>
          <div><b>${pr.shared}</b><span>${t("pf.shared")}</span></div>
          <div><b>${pr.studies}</b><span>${t("pf.studies")}</span></div>
        </div>
      </div>
      <div class="btn-row pf-acts"><button class="ui-btn" data-graph="u:${id}">◎ ${t("d.showInGraph")}</button>
        ${other ? `<a class="ui-btn" href="#/compare?a=${id}&b=${other}">⇄ ${t("pf.compare")}</a>` : ""}</div>
      <section class="ui-card pf-terrain"><div class="pf-card-h"><h3>${t("pf.terrain")}</h3><p class="hint">${t("pf.terrainHint")}</p></div>
        ${pr.enough ? `<div class="pf-sides">${side("area")}${side("method")}</div>` : `<p class="ui-empty compact">${t("pf.few", { n: V.MIN_REVIEWS - pr.count })}</p>`}</section>
      <section class="ui-card pf-drift" id="pf-drift"></section>
      <div class="pf-grid">
        <section class="ui-card pf-diaries"><h3>${t("pf.diaries")} <span class="muted">${pr.count}</span></h3><div id="pf-dl"></div></section>
        <aside class="pf-aside">
          ${pr.fields.length ? `<section class="ui-card"><h3>${t("pf.fields")}</h3>
            ${bars([...fieldsTop.map(f => [f.label, f.value, T[f.id]?.color || "rgb(var(--gray2))", `topic:${f.id}`]), ...(fieldsRest ? [[t("pf.other"), fieldsRest, "rgb(var(--gray))"]] : [])], fieldsTop[0].value)}</section>` : ""}
          ${p.similar.length ? `<section class="ui-card"><h3>${t("pf.similar")}</h3><p class="hint">${t("pf.similarHint")}</p>${V.similar(id, p.similar)}</section>` : ""}
        </aside>
      </div>`;
    window.LabDiaries.mount($("#pf-dl"), { person: id, driftRoot: $("#pf-drift") });
  }

  // ---------- routing ----------
  const rendered = {};
  let inAppNavs = 0;
  window.addEventListener("hashchange", () => inAppNavs++);
  window.LabBack = (fallback = "#/home") => (inAppNavs > 0 ? history.back() : (location.hash = fallback));
  const currentView = () => (location.hash.replace(/^#\//, "").split(/[?/]/)[0] || "home");
  let shownView = null;
  function route() {
    const [path, qs] = location.hash.replace(/^#\//, "").split("?");
    const [view, arg] = path.split("/");
    if (view === "shared" && (window.LabPages || {}).study) { location.replace("#/study?tab=shared"); return; }
    const pages = window.LabPages || {};
    const v = ["graph", "people", "papers", "shared", "paper", "person", ...Object.keys(pages)].includes(view) ? view : pages.home ? "home" : "graph";
    if (v === "paper" || v === "person") { closeDrawer(); (v === "paper" ? paperPage : personPage)(decodeURIComponent(arg || "")); }
    else if (v !== shownView) closeDrawer();  // a link out of the drawer (compare, topic page, a guide…) leaves it behind
    if (shownView === "graph" && v !== "graph") window.LabGraph?.hide?.();
    shownView = v;
    document.querySelectorAll(".view").forEach(s => s.classList.toggle("on", s.id === "view-" + v));
    const navOf = { topics: "papers", topic: "papers", guides: "papers", guide: "papers", compare: "people" };
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.view === (navOf[v] || v)));
    if (v === "papers" && qs) {
      const params = new URLSearchParams(qs);
      if (params.has("topic")) $("#f-topic").value = params.get("topic");
      if (params.has("person")) $("#f-person").value = params.get("person");
      if (params.has("q")) $("#p-search").value = params.get("q");
      closeDrawer();
    }
    if (v === "graph") window.LabGraph?.show();
    if (v === "people" && !rendered.people) { renderPeople(); rendered.people = true; }
    if (v === "papers") renderPapers();
    if (pages[v]) pages[v].render(new URLSearchParams(qs || ""), arg);
    window.scrollTo(0, 0);
  }
  const rerender = () => { rendered.people = rendered.shared = false; route(); };

  window.I18N.apply();
  document.querySelectorAll("#lang button").forEach(b => {
    b.setAttribute("aria-pressed", b.dataset.v === lang);
    b.onclick = () => b.dataset.v !== lang && window.I18N.setLang(b.dataset.v);
  });
  initPaperFilters();
  window.addEventListener("hashchange", route);

  // tabs shared by the papers list, the fields & methods page and the guides (docs/PEOPLE_TOPICS_GUIDES.md §6)
  const papersTabs = on => `<div class="ui-seg page-tabs papers-tabs">${[["papers", "#/papers", "pt.list"], ["topics", "#/topics", "pt.topics"], ["guides", "#/guides", "pt.guides"]]
    .map(([k, href, key]) => `<a href="${href}" aria-current="${on === k ? "page" : "false"}">${t(key)}</a>`).join("")}</div>`;
  window.LabUI = { openDrawer, closeDrawer, esc, stars, avatar, avStack, tl, clusterName, topicIds, currentView, reviewHtml, miniPaper, tag, bars, kb, localDay, hydrateFiles,
    buzz, papersTabs, paperTopicCount, topicDetail,
    rerender, P, T, PA, R, CL, refreshDrawer: () => drawer.classList.contains("open") && lastDrawer && openDrawer(...lastDrawer, { fromGraph: true }) };
  // page modules (write/me/admin/…) load after this file, so route once everything is in place
  document.addEventListener("DOMContentLoaded", () => { window.I18N.apply(); route(); });
})();
