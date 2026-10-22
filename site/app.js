/* Labsidian — pages, detail drawer, routing. The graph lives in graph.js (ES module). */
(() => {
  const D = window.LAB;
  const { t, lang } = window.I18N;
  I18N.extend({
    ko: {
      "pm.edit": "편집…", "pm.title": "논문 정보 편집", "pm.help": "모든 독자가 보는 논문 정보예요. 확인한 사실만 저장해 주세요. 칸을 비우면 원래 정보로 돌아가요.",
      "pm.paperTitle": "논문 제목", "pm.authors": "저자", "pm.venue": "저널·학회", "pm.year": "연도", "pm.link": "링크",
      "pm.preprintVenue": "먼저 공개된 곳", "pm.preprintYear": "공개 연도", "pm.preprintDefault": "arXiv",
      "pm.save": "저장", "pm.cancel": "취소", "pm.saved": "논문 정보를 저장했어요", "pm.failed": "저장하지 못했어요. 입력을 확인하고 다시 시도해 주세요.",
    },
    en: {
      "pm.edit": "Edit…", "pm.title": "Edit paper info", "pm.help": "Every reader sees this shared paper information. Save only confirmed facts. Clear a field to restore its original value.",
      "pm.paperTitle": "Paper title", "pm.authors": "Authors", "pm.venue": "Venue", "pm.year": "Year", "pm.link": "Link",
      "pm.preprintVenue": "Preprint Venue", "pm.preprintYear": "Preprint Year", "pm.preprintDefault": "arXiv",
      "pm.save": "Save", "pm.cancel": "Cancel", "pm.saved": "Paper information saved", "pm.failed": "Could not save. Check the fields and try again.",
    },
  });
  // lookups by id; filled by index() and refilled in place whenever the store rebuilds window.LAB
  const P = {}, T = {}, PA = {}, R = {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Escape before parsing; only these generated tags can enter a prose block.
  function md(text) {
    const inline = text => text.replace(/`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g,
      (match, code, label, href, bare, bold, italic) => {
        if (code) return `<code>${code}</code>`;
        if (href || bare) {
          const url = href || bare.replace(/[.,;!?]+$/, "");
          return `<a class="link" href="${url}" target="_blank" rel="noopener">${label || url}</a>${bare ? bare.slice(url.length) : ""}`;
        }
        return bold ? `<strong>${inline(bold)}</strong>` : `<em>${inline(italic)}</em>`;
      });
    const lines = esc(text).replace(/\r\n?/g, "\n").split("\n");
    const item = line => /^([ \t]*)([-+*]|\d+\.)\s+(.+)$/.exec(line);
    const indent = match => match[1].replace(/\t/g, "  ").length;
    let i = 0;
    function list(base, depth = 0) {
      const ordered = /^\d/.test(item(lines[i])[2]), tag = ordered ? "ol" : "ul";
      let html = `<${tag}>`;
      while (i < lines.length) {
        const m = item(lines[i]);
        if (!m || indent(m) < base || /^\d/.test(m[2]) !== ordered && indent(m) === base) break;
        html += `<li>${inline(m[3])}`; i++;
        if (depth === 0 && i < lines.length && item(lines[i]) && indent(item(lines[i])) >= base + 2) html += list(indent(item(lines[i])), 1);
        html += "</li>";
      }
      return html + `</${tag}>`;
    }
    let html = "";
    while (i < lines.length) {
      if (!lines[i].trim()) { i++; continue; }
      const heading = /^(#{1,3})\s+(.+)$/.exec(lines[i]);
      if (heading) { html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; i++; }
      else if (item(lines[i])) html += list(indent(item(lines[i])));
      else {
        const paragraph = [];
        do { paragraph.push(inline(lines[i++])); } while (i < lines.length && lines[i].trim() && !item(lines[i]) && !/^#{1,3}\s/.test(lines[i]));
        html += `<p>${paragraph.join("<br>")}</p>`;
      }
    }
    return html;
  }
  const initial = name => /^[A-Za-z]/.test(name) ? name[0].toUpperCase() : name.slice(-2);
  const tl = x => (lang === "en" ? x.labelEn : x.label) || x.label;
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
      p._hay = (p.title + " " + p.authors + " " + p.venue + " " + p.venueNorm + " " + Store.paperCitation(p) + " " +
        p.reviews.filter(r => !window.Store?.studies.hidden(R[r])).map(r => R[r].content + " " + R[r].memo).join(" ")).toLowerCase();
      p._last = p.reviews.map(r => R[r].date).sort().pop();
    });
  }
  index();
  // changes polled from the server (another tab, a teammate, MCP) rebuild window.LAB with new objects
  window.addEventListener("lab:data", index);

  // ---------- render helpers ----------
  const INK = {};   // avatar initials colour per data colour; the theme decides, so forget it when the theme changes
  window.addEventListener("lab:theme", () => { for (const k in INK) delete INK[k]; });
  const avatar = (id, big) => {
    const p = P[id];
    if (!p) return `<span class="avatar unknown">?</span>`;
    // initials: dark on light colours (yellow, lime…), white otherwise — the colour is a data colour name, read from the theme
    const name = /var\(--([a-z0-9]+)\)/.exec(p.color || "")?.[1] || "gray";
    const ink = INK[name] ||= (() => {
      const [r, g, b] = getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim().split(/\s+/).map(Number);
      const L = [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }), lum = .2126 * L[0] + .7152 * L[1] + .0722 * L[2];
      return (lum + .05) / .0607 > 1.05 / (lum + .05) ? "var(--ink-on-light)" : "var(--on-color)";   // whichever of black/white contrasts more
    })();
    return `<span class="avatar${big ? " big" : ""}" title="${esc(p.name)}" style="background:${safeColor(p.color)};color:${ink};text-shadow:none">${esc(initial(p.name))}</span>`;
  };
  // a data colour that's safe inside style="": #hex or rgb(var(--name)); anything else → gray
  const safeColor = c => (/^#[0-9a-f]{3,8}$/i.test(c || "") || /^rgb\(var\(--[a-z0-9]+\)\)$/.test(c || "") ? c : "rgb(var(--gray2))");
  // a member's display name; disabled members are left out of P (store.js buildDataset), so they never show an id
  const personName = id => P[id]?.name || (id === "admin" ? "admin" : t("unknownPerson"));
  const avStack = (ids, max = 5, cls = id => "") => {
    ids = ids.filter(id => P[id]);
    const shown = ids.slice(0, max), rest = ids.slice(max);
    return `<span class="st-avs">${shown.map(u => `<span class="${cls(u)}">${avatar(u)}</span>`).join("")}${rest.length
      ? `<span class="av-more" title="${esc(rest.map(personName).join(", "))}">+${rest.length}</span>` : ""}</span>`;
  };
  const ratingText = n => String(Number(Number(n || 0).toFixed(1)));
  const ratingLabel = n => n ? t("rating.value", { n: ratingText(n) }) : t("rating.unrated");
  const starUnits = n => [1, 2, 3, 4, 5].map(i => `<span class="ui-rating-star ${n >= i ? "full" : n >= i - .5 ? "half" : ""}" data-v="${i}" aria-hidden="true">★</span>`).join("");
  const stars = n => `<span class="ui-rating" role="img" aria-label="${esc(ratingLabel(n))}">${starUnits(Math.round(n * 2) / 2)}<span class="ui-rating-number" aria-hidden="true">${ratingText(n)}</span></span>`;
  const ratingInput = (id, n = 0) => `<div class="ui-rating-input" id="${id}" role="slider" tabindex="0" aria-label="${t("rating.label")}" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${n}" aria-valuetext="${esc(ratingLabel(n))}">${starUnits(n)}<span class="ui-rating-number" aria-hidden="true">${ratingText(n)}</span></div>`;
  const paintRatingStars = (el, n) => {
    el.querySelectorAll("[data-v]").forEach(s => s.className = `ui-rating-star ${n >= +s.dataset.v ? "full" : n >= +s.dataset.v - .5 ? "half" : ""}`);
    el.querySelector(".ui-rating-number").textContent = ratingText(n);
  };
  const paintRatingInput = (el, n) => {
    el.setAttribute("aria-valuenow", n); el.setAttribute("aria-valuetext", ratingLabel(n));
    paintRatingStars(el, n);
  };
  // pointer: hovering previews the value under the cursor, pressing (and dragging) sets it — left half of a star = .5
  const wireRatingInput = (el, change) => {
    const now = () => +el.getAttribute("aria-valuenow");
    const set = n => { if (n !== now()) { paintRatingInput(el, n); change(n); } else paintRatingStars(el, n); };
    const valueAt = x => {
      const s = [...el.querySelectorAll("[data-v]")], a = s[0].getBoundingClientRect(), b = s.at(-1).getBoundingClientRect();
      const w = (b.right - a.left) / s.length, k = Math.min(s.length - 1, Math.max(0, Math.floor((x - a.left) / w)));
      return k + ((x - a.left) / w - k < .5 ? .5 : 1);
    };
    let dragging = false;
    el.onpointerdown = e => {
      if (!e.target.closest("[data-v]")) return;
      dragging = true; el.setPointerCapture(e.pointerId); set(valueAt(e.clientX)); el.focus();
    };
    el.onpointermove = e => dragging ? set(valueAt(e.clientX)) : e.pointerType === "mouse" && paintRatingStars(el, valueAt(e.clientX));
    el.onpointerup = el.onpointercancel = () => { dragging = false; };
    el.onpointerleave = () => { if (!dragging) paintRatingStars(el, now()); };
    el.onkeydown = e => {
      const n = now();
      const next = { ArrowLeft: n - .5, ArrowDown: n - .5, ArrowRight: n + .5, ArrowUp: n + .5, Home: 0, End: 5 }[e.key];
      if (next == null) return;
      e.preventDefault(); set(Math.max(0, Math.min(5, next)));
    };
  };
  const tag = tid => {
    const x = T[tid];
    return x ? `<span class="ui-tag ${esc(x.axis)}" data-open="topic:${esc(tid)}"><span class="dot" style="background:${safeColor(x.color)}"></span>${esc(tl(x))}</span>` : "";
  };
  const bars = (items, max) => `<div class="bars">${items.map(([label, n, color, open]) => `
    <div class="bar-row ${open ? "click" : ""}" ${open ? `data-open="${esc(open)}"` : ""}>
      <span class="lbl">${esc(label)}</span>
      <span class="track"><span class="fill" style="width:${(100 * n / max).toFixed(1)}%;background:${safeColor(color)}"></span></span>
      <span class="n">${n}</span>
    </div>`).join("")}</div>`;
  const linkHtml = l => /^https?:\/\//.test(l)
    ? `<a href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>` : esc(l);

  // diary date (which week it counts for) vs. when it was actually posted
  const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const shortDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", { month: "short", day: "numeric", weekday: "short" }) : "";
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
    const preview = document.createElement("img"); preview.src = img.src; preview.alt = "";
    box.appendChild(preview); box.onclick = () => box.remove();
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
      <div class="kv">${esc(Store.paperCitation(PA[r.paper]))}</div>
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
    const html = kind === "person" ? personDetail(id) : kind === "topic" ? topicDetail(id) : paperDetail(id);
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
    return `
      <div class="pd-head"><div class="pc-head">${avatar(id, true)}
        <div><h2>${esc(p.name)}</h2><div class="pc-meta">${D.terms.map(esc).join(", ")} Paper Diary</div></div></div></div>
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

  function paperDetail(id) {
    const p = PA[id];
    if (!p) return "";
    const related = (p.nb || []).map(([pid, s]) => [PA[pid], s]).filter(([x]) => x);
    const refs = (p.refs || []).map(r => PA[r]).filter(Boolean);
    return `
      <h2>${esc(p.title)}</h2>
      <div class="kv">${esc(p.authors)}</div>
      <div class="kv near">${esc(Store.paperCitation(p))}</div>
      ${p.link ? `<div class="kv near">${linkHtml(p.link)}</div>` : ""}
      <div class="tags-row">${topicIds(p).map(tag).join("")}</div>
      <div class="btn-row">
        ${p.x != null ? `<button class="ui-btn" data-graph="${p.id}">◎ ${t("d.showInGraph")}</button>` : ""}
        ${window.Store ? `${readingBtn(p)}
        ${writeBtn(p)}` : ""}
      </div>
      <div class="stat-row">
        <div class="stat"><b>${p.rating ? ratingText(p.rating) : "-"}</b><span>${t("d.avg")}</span></div>
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
        <div class="pr-meta"><span>${esc(Store.paperCitation(p))}</span><span>${esc(p._last)}</span>${topicIds(p).map(tag).join("")}</div>
      </div>`).join("") || `<div class="ui-empty">${t("papers.empty")}</div>`;
    if (list.length > paperLimit) {
      $("#paper-list").insertAdjacentHTML("beforeend", `<button class="ui-btn plain load-more" id="more">${t("papers.more", { n: list.length - paperLimit })}</button>`);
      $("#more").onclick = e => { e.stopPropagation(); paperLimit += 60; renderPapers(); };
    }
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
        <span class="m">${common ? t("d.studyCommon") : t("d.studyPicked", { names: picks.map(pk => esc(personName(pk.uid))).join(", ") })}${st.date ? " · " + esc(st.date) : ""}</span></a>
        ${others.length ? `<div class="m st-with-h">${t("d.studyWith")}</div>${others.map(pickLink).join("")}` : ""}`;
    }).join("")}</div>`;
  }
  function editPaperInfo(p) {
    const fields = [["title", "pm.paperTitle", 300], ["authors", "pm.authors", 500], ["venue", "pm.venue", 200], ["year", "pm.year", 4],
      ["preprintVenue", "pm.preprintVenue", 200], ["preprintYear", "pm.preprintYear", 4], ["link", "pm.link", 500]];
    const modal = LabModal(`<form><h2 id="paper-meta-title">${t("pm.title")}</h2>
      <p class="sub">${t("pm.help")}</p>
      ${fields.map(([f, label, max]) => `<label for="pm-${f}">${t(label)}<input class="ui-input" id="pm-${f}" name="${f}" maxlength="${max}" ${["year", "preprintYear"].includes(f) ? 'inputmode="numeric" pattern="[0-9]{4}"' : ""} ${f === "preprintVenue" ? `placeholder="${t("pm.preprintDefault")}"` : ""}
        value="${esc((f === "venue" ? p.venueNorm || p.venue : p[f]) || "")}"></label>`).join("")}
      <p class="err" role="alert"></p><div class="modal-foot">
        <button type="button" class="ui-btn" data-close>${t("pm.cancel")}</button>
        <button type="submit" class="ui-btn prominent">${t("pm.save")}</button></div></form>`);
    modal.querySelector('[role="dialog"]').setAttribute("aria-labelledby", "paper-meta-title");
    const form = modal.querySelector("form");
    form.querySelector("input").focus();
    modal.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); modal.remove(); }
      if (e.key === "Tab") {
        const controls = [...form.querySelectorAll("input, button:not(:disabled)")], first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    form.onsubmit = async e => {
      e.preventDefault();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true; button.classList.add("is-loading");
      try {
        await Store.papers.update(p.id, Object.fromEntries(fields.map(([f]) => [f, form.elements[f].value])));
        LabReload("#/paper/" + p.id, t("pm.saved"));
      } catch (error) {
        console.warn("paper metadata save failed", error);
        form.querySelector(".err").textContent = t("pm.failed");
        form.querySelector("input").focus();
        button.disabled = false; button.classList.remove("is-loading");
      }
    };
  }
  function paperPage(id) {
    const v = pageView("paper"), p = PA[id];
    if (!p) { v.innerHTML = `<div class="ui-empty">404</div>`; return; }
    const related = (p.nb || []).map(([pid, s]) => [PA[pid], s]).filter(([x]) => x);
    const refs = (p.refs || []).map(r => PA[r]).filter(Boolean);
    v.innerHTML = `${back}
      <div class="dp-head">
        <h1>${esc(p.title)}</h1>
        <div class="kv">${esc(p.authors)}</div>
        <div class="kv">${esc(Store.paperCitation(p))}${p.citations != null ? ` · ${t("d.cites")} ${p.citations}` : ""}</div>
        ${p.link ? `<div class="kv">${linkHtml(p.link)}</div>` : ""}
        <div class="tags-row">${topicIds(p).map(tag).join("")}${(p.free || []).map(tag).join("")}</div>
        <div class="btn-row">
          ${(() => { const f = p.reviews.filter(x => !window.Store?.studies.hidden(R[x])).flatMap(x => R[x].files || []).find(f => f.kind === "pdf"); return f ? `<a class="ui-btn" data-fid="${esc(f.id)}" target="_blank" rel="noopener">${t("d.pdf")}</a>` : ""; })()}
          ${p.x != null ? `<button class="ui-btn" data-graph="${p.id}">◎ ${t("d.showInGraph")}</button>` : ""}
          ${window.Store ? `${readingBtn(p)}
          ${writeBtn(p)}` : ""}
          ${(() => { const me = window.Store?.auth.current(); return me && (me.role === "admin" || p.readers.includes(me.id)) ? `<button class="ui-btn" id="paper-meta-edit">${t("pm.edit")}</button>` : ""; })()}
        </div>
      </div>
      <div class="dp-grid">
        <div class="dp-main">
          ${p.abstract ? `<div class="ui-card"><h3>${t("d.abstract")}</h3><p class="abstract-full">${esc(p.abstract)}</p></div>` : ""}
          <h3 class="dp-sec">${t("d.reviews", { n: p.reviews.length })} · ${stars(p.rating)}</h3>
          <div class="dp-reviews">${p.reviews.map(r => reviewHtml(R[r], { full: true })).join("")}</div>
        </div>
        <aside class="dp-side">
          ${studiesCard(p.id)}
          <div class="ui-card"><h3>${t("d.readers")}</h3>${p.readers.map(r => `<div class="ui-row sim-row" data-open="person:${r}">${avatar(r)}<span>${esc(personName(r))}</span><span></span><span class="m">${R[p.reviews.find(x => R[x].person === r)]?.date || ""}</span></div>`).join("")}</div>
          ${related.length ? `<div class="ui-card"><h3>${t("d.related")}</h3><div class="mini-list">${related.map(([x, s]) => miniPaper(x, Math.round(s * 100) + "%")).join("")}</div></div>` : ""}
          ${refs.length ? `<div class="ui-card"><h3>${t("d.citesIn")}</h3><div class="mini-list">${refs.map(x => miniPaper(x)).join("")}</div></div>` : ""}
        </aside>
      </div>`;
    $("#paper-meta-edit")?.addEventListener("click", () => editPaperInfo(p));
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
    const side = k => `<div class="pf-side"><h4>${t("pf.axis." + k)}</h4>
        <div class="vz-rose-wrap">${V.rose(pr.by[k])}${V.roseLegend(pr.by[k])}</div>
        ${V.noDomainNote(pr, k)}${pr.lift[k] ? `<p class="pf-insight">${esc(pr.lift[k])}</p>` : ""}</div>`;
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
        ${pr.enough ? `<div class="pf-sides">${V.KINDS.map(side).join("")}</div>` : `<p class="ui-empty compact">${t("pf.few", { n: V.MIN_REVIEWS - pr.count })}</p>`}</section>
      <section class="ui-card pf-drift" id="pf-drift"></section>
      <div class="pf-grid">
        <section class="ui-card pf-diaries"><h3>${t("pf.diaries")} <span class="muted">${pr.count}</span></h3><div id="pf-dl"></div></section>
        <aside class="pf-aside">
          ${p.similar.length ? `<section class="ui-card"><h3>${t("pf.similar")}</h3><p class="hint">${t("pf.similarHint")}</p>${V.similar(id, p.similar)}</section>` : ""}
        </aside>
      </div>`;
    window.LabDiaries.mount($("#pf-dl"), { person: id, driftRoot: $("#pf-drift") });
  }

  // ---------- routing ----------
  let peopleRendered = false;
  let inAppNavs = 0;
  window.addEventListener("hashchange", () => inAppNavs++);
  window.LabBack = (fallback = "#/home") => (inAppNavs > 0 ? history.back() : (location.hash = fallback));
  const currentView = () => (location.hash.replace(/^#\//, "").split(/[?/]/)[0] || "home");
  let shownView = null, shownHash = location.hash;
  function route(event) {
    const pages = window.LabPages || {};
    if (event?.type === "hashchange" && pages[shownView]?.leave?.() === false) {
      history.replaceState(null, "", shownHash || "#/home"); return;
    }
    shownHash = location.hash;
    const [path, qs] = location.hash.replace(/^#\//, "").split("?");
    const [view, rawArg] = path.split("/");
    let arg;
    try { arg = decodeURIComponent(rawArg || ""); } catch { arg = ""; }
    if (view === "shared" && pages.study) { location.replace("#/study?tab=shared"); return; }
    const v = ["graph", "people", "papers", "shared", "paper", "person", ...Object.keys(pages)].includes(view) ? view : pages.home ? "home" : "graph";
    if (v === "paper" || v === "person") { closeDrawer(); (v === "paper" ? paperPage : personPage)(arg); }
    else if (v !== shownView) closeDrawer();  // a link out of the drawer (compare, topic page, a guide…) leaves it behind
    if (shownView === "graph" && v !== "graph") window.LabGraph?.hide?.();
    shownView = v;
    document.querySelectorAll(".view").forEach(s => s.classList.toggle("on", s.id === "view-" + v));
    const navOf = { topics: "papers", topic: "papers", guides: "papers", guide: "papers", compare: "people", group: "study" };
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.view === (navOf[v] || v)));
    if (v === "papers" && qs) {
      const params = new URLSearchParams(qs);
      if (params.has("topic")) $("#f-topic").value = params.get("topic");
      if (params.has("person")) $("#f-person").value = params.get("person");
      if (params.has("q")) $("#p-search").value = params.get("q");
      closeDrawer();
    }
    if (v === "graph") window.LabGraph?.show();
    if (v === "people" && !peopleRendered) { renderPeople(); peopleRendered = true; }
    if (v === "papers") renderPapers();
    if (pages[v]) pages[v].render(new URLSearchParams(qs || ""), arg);
    window.scrollTo(0, 0);
  }
  const rerender = () => { peopleRendered = false; route(); };

  window.I18N.apply();
  document.querySelectorAll("#lang button").forEach(b => {
    b.setAttribute("aria-pressed", b.dataset.v === lang);
    b.onclick = () => b.dataset.v !== lang && window.I18N.setLang(b.dataset.v);
  });
  initPaperFilters();
  window.addEventListener("hashchange", route);
  window.addEventListener("lab:data", () => { peopleRendered = false; });

  // tabs shared by the papers list, the fields & methods page and the guides (docs/PEOPLE_TOPICS_GUIDES.md §6)
  const papersTabs = on => `<div class="ui-seg page-tabs papers-tabs">${[["papers", "#/papers", "pt.list"], ["topics", "#/topics", "pt.topics"], ["guides", "#/guides", "pt.guides"]]
    .map(([k, href, key]) => `<a href="${href}" aria-current="${on === k ? "page" : "false"}">${t(key)}</a>`).join("")}</div>`;

  // A page's leave() for the router (LabPages[name].leave): stays while busy(), asks once before dropping dirty() input,
  // and has the browser warn on tab close in both cases. discard() runs before navigating on "discard".
  function leaveGuard({ dirty, busy = () => false, discard = () => {} }) {
    let asking = false;
    window.addEventListener("beforeunload", e => { if (busy() || dirty()) { e.preventDefault(); e.returnValue = ""; } });
    return () => {
      if (busy()) return false;
      if (!dirty()) return;
      if (!asking) {
        const next = location.hash; asking = true;
        LabConfirm(t("w.leave"), { message: t("w.leaveMsg"), ok: t("w.leaveOk"), destructive: true })
          .then(ok => { asking = false; if (ok) { discard(); location.hash = next; } });
      }
      return false;
    };
  }
  // form.onsubmit that runs run() one at a time with the submit button disabled; a thrown error is shown in errEl.
  // Returns busy() for leaveGuard.
  function submitOnce(form, run, errEl) {
    let busy = false;
    form.onsubmit = async e => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      const button = form.querySelector('button:not([type="button"])'); if (button) button.disabled = true;
      try { await run(); } catch (error) { if (errEl) errEl.textContent = error.message; } finally { busy = false; if (button) button.disabled = false; }
    };
    return () => busy;
  }
  window.LabUI = { openDrawer, closeDrawer, esc, safeColor, stars, ratingText, ratingInput, paintRatingInput, wireRatingInput, avatar, avStack, personName, tl, topicIds, currentView, reviewHtml, miniPaper, tag, bars, kb, localDay, hydrateFiles,
    buzz, papersTabs, paperTopicCount, topicDetail, shortDate, leaveGuard, submitOnce, md,
    rerender, P, T, PA, R, refreshDrawer: () => drawer.classList.contains("open") && lastDrawer && openDrawer(...lastDrawer, { fromGraph: true }) };
  // page modules (write/me/admin/…) load after this file, so route once everything is in place
  document.addEventListener("DOMContentLoaded", () => { window.I18N.apply(); route(); });
})();
