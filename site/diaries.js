/* One person's diaries (design/components §12-1) and how their interests moved (data-viz §4 "관심 변화").
 * The person page mounts both, read-only, over every term; my page mounts the list alone for the term it shows, with
 * edit and delete. A row opens the diary in place. */
(() => {
  const { t, lang } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;

  I18N.extend({
    ko: {
      "dl.search": "제목·내용 검색", "dl.allTerms": "모든 학기", "dl.allDomains": "모든 분야", "dl.allMethods": "모든 방법론", "dl.commented": "💬 댓글 있는 것만",
      "dl.sortNew": "최신순", "dl.sortRating": "별점순", "dl.shown": "{all}편 중 {n}편", "dl.clear": "필터 지우기", "dl.month": "{y}년 {m}월",
      "dl.noMatch": "조건에 맞는 다이어리가 없어요", "dl.empty": "아직 다이어리가 없어요", "dl.emptyTerm": "이 학기엔 아직 다이어리가 없어요",
      "dl.scope": "{term} 다이어리", "dl.scopeAll": "모든 학기 다이어리", "dl.edit": "편집", "dl.remove": "삭제",
      "dl.drift": "관심 변화", "dl.axis.domain": "분야", "dl.axis.method": "방법론", "dl.none.domain": "분야 없음", "dl.none.method": "방법론 없음", "dl.other": "기타",
      "dl.driftTerms": "학기마다 읽은 것 · 막대를 누르면 아래 다이어리가 그 학기·그 태그로 걸러져요",
      "dl.driftMonths": "{term}의 달마다 · 막대를 누르면 그 달·그 태그로 걸러져요", "dl.backAll": "모든 학기 보기",
      "dl.driftEmpty": "다이어리를 쓰면 기간마다 관심 분야가 쌓여요", "dl.driftTip": "{m} · {tag} {n}편",
    },
    en: {
      "dl.search": "Search title & text", "dl.allTerms": "All terms", "dl.allDomains": "All fields", "dl.allMethods": "All methods", "dl.commented": "💬 With comments",
      "dl.sortNew": "Newest", "dl.sortRating": "Rating", "dl.shown": "{n} of {all}", "dl.clear": "Clear filters", "dl.month": "{m}/{y}",
      "dl.noMatch": "No diaries match", "dl.empty": "No diaries yet", "dl.emptyTerm": "No diaries this term yet",
      "dl.scope": "{term} diaries", "dl.scopeAll": "Diaries of every term", "dl.edit": "Edit", "dl.remove": "Delete",
      "dl.drift": "How interests moved", "dl.axis.domain": "Fields", "dl.axis.method": "Methods", "dl.none.domain": "No field", "dl.none.method": "No method", "dl.other": "Other",
      "dl.driftTerms": "What they read each term · click a bar to filter the diaries below by that term and tag",
      "dl.driftMonths": "Month by month in {term} · click a bar to filter by that month and tag", "dl.backAll": "Show every term",
      "dl.driftEmpty": "Write diaries and the fields pile up over time", "dl.driftTip": "{m} · {tag} {n}",
    },
  });

  const $ = (s, r) => r.querySelector(s);
  const pref = (k, d) => { try { return localStorage.getItem("labsidian.dl." + k) || d; } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem("labsidian.dl." + k, v); } catch (e) {} };
  const tagsOf = (p, ax) => (ax === "domain" ? p?.domains : p?.methods) || [];
  const tagName = (ax, k) => { const x = UI.T[(ax === "domain" ? "d:" : "m:") + k]; return k === "_none" ? t("dl.none." + ax) : x ? UI.tl(x) : k; };
  const matchTag = (p, ax, k) => !k || (k === "_none" ? !tagsOf(p, ax).length : tagsOf(p, ax).includes(k));
  const nextMonth = m => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };

  // opts: { person, owner, term (a fixed term: my page), driftRoot (the person page's chart card) }
  function mount(root, opts) {
    const termList = () => S.terms.list().slice().sort((a, b) => a.start.localeCompare(b.start));
    const termOf = r => termList().find(x => r.date >= x.start && r.date <= x.end);
    const all = Object.values(UI.R).filter(r => r.person === opts.person).sort((a, b) => b.date.localeCompare(a.date));
    const f = { q: "", term: opts.term?.id || "", month: "", domain: "", method: "", commented: false, sort: "new", open: {} };
    let axis = pref("axis", "domain");
    const termById = id => S.terms.list().find(x => x.id === id);
    const inTerm = r => { const x = f.term && termById(f.term); return !x || (r.date >= x.start && r.date <= x.end); };
    const scoped = () => all.filter(inTerm);
    const filtering = () => !!(f.q || f.month || f.domain || f.method || f.commented || (!opts.term && f.term));

    function filtered() {
      const q = f.q.trim().toLowerCase();
      const list = scoped().filter(r => {
        const p = UI.PA[r.paper];
        if (f.month && !r.date.startsWith(f.month)) return false;
        if (q && !`${p?.title || ""} ${r.content} ${r.memo}`.toLowerCase().includes(q)) return false;
        return matchTag(p, "domain", f.domain) && matchTag(p, "method", f.method) && (!f.commented || S.comments.count(r.id));
      });
      return opts.owner && f.sort === "rating" ? list.sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date)) : list;
    }

    // ---- toolbar
    root.innerHTML = `<div class="dl-tools">
        <input type="search" data-f="q" placeholder="${t("dl.search")}" aria-label="${t("dl.search")}">
        ${opts.term ? "" : `<select data-f="term" aria-label="${t("dl.allTerms")}"></select>`}
        <select data-f="domain" aria-label="${t("dl.allDomains")}"></select><select data-f="method" aria-label="${t("dl.allMethods")}"></select>
        <button type="button" class="ui-chip" aria-pressed="false" data-f="commented">${t("dl.commented")}</button>
        ${opts.owner ? `<select data-f="sort" aria-label="${t("dl.sortNew")}"><option value="new">${t("dl.sortNew")}</option><option value="rating">${t("dl.sortRating")}</option></select>` : ""}
      </div>
      <div class="dl-active"></div><div class="dl-list"></div>`;
    function tools() {
      const opt = ax => {
        const c = {};
        scoped().forEach(r => { const ks = tagsOf(UI.PA[r.paper], ax); (ks.length ? ks : ["_none"]).forEach(k => (c[k] = (c[k] || 0) + 1)); });
        return `<option value="">${t(ax === "domain" ? "dl.allDomains" : "dl.allMethods")}</option>` + Object.entries(c).sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `<option value="${esc(k)}" ${f[ax] === k ? "selected" : ""}>${esc(tagName(ax, k))} (${n})</option>`).join("");
      };
      $("[data-f=domain]", root).innerHTML = opt("domain");
      $("[data-f=method]", root).innerHTML = opt("method");
      const ts = $("[data-f=term]", root);
      if (ts) ts.innerHTML = `<option value="">${t("dl.allTerms")}</option>` + termList().reverse().map(x => {
        const n = all.filter(r => r.date >= x.start && r.date <= x.end).length;
        return n ? `<option value="${esc(x.id)}" ${f.term === x.id ? "selected" : ""}>${esc(x.label)} (${n})</option>` : "";
      }).join("");
      $("[data-f=commented]", root).setAttribute("aria-pressed", String(f.commented));
    }
    let qt = null;
    $("[data-f=q]", root).oninput = e => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; update(); }, 200); };
    root.querySelectorAll("select[data-f]").forEach(s => (s.onchange = () => {
      f[s.dataset.f] = s.value;
      if (s.dataset.f === "term") { f.month = ""; tools(); }
      update();
    }));
    $("[data-f=commented]", root).onclick = () => { f.commented = !f.commented; update(); };

    // ---- the filters in force, then the months
    function list() {
      const rows = filtered(), base = scoped(), any = filtering();
      const chips = [
        !opts.term && f.term && [termById(f.term)?.label || f.term, "term"],
        f.month && [t("dl.month", { y: f.month.slice(0, 4), m: +f.month.slice(5) }), "month"],
        f.domain && [tagName("domain", f.domain), "domain"], f.method && [tagName("method", f.method), "method"],
      ].filter(Boolean);
      const scope = opts.term ? t("dl.scope", { term: esc(opts.term.label) }) : t("dl.scopeAll");
      $(".dl-active", root).innerHTML = `<span class="muted">${any ? t("dl.shown", { n: rows.length, all: opts.term ? base.length : all.length }) : `${scope} · ${base.length}`}</span>`
        + chips.map(([label, k]) => `<button type="button" class="ui-chip" aria-pressed="true" data-clear="${k}">${esc(label)} ✕</button>`).join("")
        + (any ? `<button type="button" class="ui-btn text" data-clear="all">${t("dl.clear")}</button>` : "");
      const box = $(".dl-list", root);
      if (!rows.length) { box.innerHTML = `<div class="ui-empty compact">${t(any ? "dl.noMatch" : opts.term ? "dl.emptyTerm" : "dl.empty")}</div>`; return; }
      const groups = [];
      rows.forEach(r => { const m = opts.owner && f.sort === "rating" ? "" : r.date.slice(0, 7), g = groups.at(-1); g && g.m === m ? g.rs.push(r) : groups.push({ m, rs: [r] }); });
      const openAll = any || rows.length <= 12;
      box.innerHTML = groups.map((g, i) => {
        const items = g.rs.map(row).join("");
        if (!g.m) return `<div class="dl-month">${items}</div>`;
        const open = f.open[g.m] ?? (openAll || i === 0);
        return `<details class="dl-month" data-m="${g.m}" ${open ? "open" : ""}><summary>${t("dl.month", { y: g.m.slice(0, 4), m: +g.m.slice(5) })} <span class="muted">${g.rs.length}</span></summary>${items}</details>`;
      }).join("");
      box.querySelectorAll("details.dl-month").forEach(d => (d.ontoggle = () => (f.open[d.dataset.m] = d.open)));
    }
    const row = r => {
      const p = UI.PA[r.paper], c = S.comments.count(r.id);
      return `<div class="dl-item" data-id="${r.id}"><div class="ui-row dl-row" role="button" tabindex="0" aria-expanded="false">
          <span class="dl-t"><span class="tt">${esc(p?.title || "")}</span>
            <span class="dl-tags">${[...(p?.domains || []).slice(0, 2).map(d => UI.tag("d:" + d)), ...(p?.methods || []).slice(0, 1).map(m => UI.tag("m:" + m))].join("")}</span></span>
          ${c ? `<span class="m">💬 ${c}</span>` : ""}${opts.owner ? `<span class="m dl-stars">${UI.stars(r.rating)}</span>` : ""}<span class="m dl-date">${r.date.slice(5)}</span>
          ${opts.owner ? `<a class="ui-btn small icon plain" href="#/write?review=${r.id}" title="${t("dl.edit")}" aria-label="${t("dl.edit")}">✎</a>
            <button type="button" class="ui-btn small icon plain destructive" data-del="${r.id}" title="${t("dl.remove")}" aria-label="${t("dl.remove")}">🗑</button>` : ""}
        </div><div class="dl-body" hidden></div></div>`;
    };
    function toggle(item) {
      const body = $(".dl-body", item), btn = $(".dl-row", item), open = body.hidden;
      if (open && !body.firstChild) { body.innerHTML = UI.reviewHtml(UI.R[item.dataset.id], { full: true }); UI.hydrateFiles(body); }
      body.hidden = !open; btn.setAttribute("aria-expanded", String(open));
    }
    root.addEventListener("click", async e => {
      const clr = e.target.closest("[data-clear]");
      if (clr) {
        const k = clr.dataset.clear;
        if (k === "all") { Object.assign(f, { q: "", month: "", domain: "", method: "", commented: false }); if (!opts.term) f.term = ""; $("[data-f=q]", root).value = ""; }
        else { f[k] = ""; if (k === "term") f.month = ""; }
        tools(); update(); return;
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        if (!(await LabConfirm(t("w.confirmDelete"), { ok: t("w.delete"), destructive: true }))) return;
        await S.reviews.remove(del.dataset.del);
        LabReload(location.hash, t("w.deleted")); return;
      }
      const r = e.target.closest(".dl-row");
      if (r && !e.target.closest("a, button, [data-open]")) toggle(r.closest(".dl-item"));
    });
    root.addEventListener("keydown", e => {
      const r = e.target.closest?.(".dl-row");
      if (r && e.target === r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(r.closest(".dl-item")); }
    });

    // ---- interest drift: a row per term, or per month of the term picked in the list
    function drift() {
      const box = opts.driftRoot; if (!box) return;
      const term = f.term && termById(f.term);
      const rows = {}, total = {};
      const rowOf = term ? r => r.date.slice(0, 7) : r => termOf(r)?.id;
      (term ? scoped() : all).forEach(r => {
        const m = rowOf(r), ks = tagsOf(UI.PA[r.paper], axis).slice(0, 2); if (!m) return;
        (ks.length ? ks : ["_none"]).forEach(k => { ((rows[m] ||= {})[k] = (rows[m][k] || 0) + 1); total[k] = (total[k] || 0) + 1; });
      });
      if (term) for (let m = term.start.slice(0, 7), end = (S.today() < term.end ? S.today() : term.end).slice(0, 7); m <= end; m = nextMonth(m)) rows[m] ||= {};
      const keys = term ? Object.keys(rows).sort() : termList().map(x => x.id).filter(id => rows[id]);
      const label = m => (term ? t("dl.month", { y: m.slice(0, 4), m: +m.slice(5) }).replace(/^\d+년 /, "") : termById(m)?.label || m);
      const top = Object.entries(total).filter(([k]) => k !== "_none").sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
      if (total._none) top.push("_none");
      const color = k => (k === "_none" ? "rgb(var(--gray))" : UI.T[(axis === "domain" ? "d:" : "m:") + k]?.color || "rgb(var(--gray2))");
      const sel = f[axis], picked = term ? f.month : f.term;
      const seg = (m, k, n) => {
        const on = (!picked || picked === m) && (!sel || sel === k), active = picked || sel;
        return `<i data-m="${m}" data-k="${esc(k)}" data-n="${n}" class="${active && on ? "on" : active ? "dim" : ""}" style="flex:${n};background:${color(k)}"></i>`;
      };
      box.innerHTML = `<div class="row-between dl-drift-h"><h3>${t("dl.drift")}</h3>
          <div class="ui-seg small" role="group" aria-label="${t("dl.drift")}">${["domain", "method"].map(a => `<button type="button" data-axis="${a}" aria-pressed="${axis === a}">${t("dl.axis." + a)}</button>`).join("")}</div></div>
        <p class="hint">${term ? `${t("dl.driftMonths", { term: esc(term.label) })} · <button type="button" class="ui-btn text" data-back>${t("dl.backAll")}</button>` : t("dl.driftTerms")}</p>
        ${!keys.length ? `<p class="ui-empty compact">${t("dl.driftEmpty")}</p>` : `<div class="drift">${keys.map(m => {
          const row = rows[m], sum = Object.values(row).reduce((a, b) => a + b, 0);
          const other = Object.entries(row).filter(([k]) => !top.includes(k)).reduce((a, [, v]) => a + v, 0);
          return `<div class="drift-row"><button type="button" class="ui-btn text drift-m" aria-pressed="${picked === m}" data-row="${m}">${esc(label(m))}</button><div class="drift-bar">
            ${top.map(k => (row[k] ? seg(m, k, row[k]) : "")).join("")}${other ? `<i data-m="${m}" data-k="_other" data-n="${other}" style="flex:${other};background:var(--fill)"></i>` : ""}</div>
            <span class="muted">${sum}</span></div>`;
        }).join("")}</div>
        <div class="chips drift-legend">${top.map(k => `<button type="button" class="ui-tag" aria-pressed="${sel === k}" data-k="${esc(k)}"><span class="dot" style="background:${color(k)}"></span>${esc(tagName(axis, k))}</button>`).join("")}</div>`}
        <div class="drift-tip ui-tooltip" hidden></div>`;
      const tip = $(".drift-tip", box);
      box.querySelectorAll(".drift-bar i").forEach(el => {
        el.onmouseenter = () => {
          const k = el.dataset.k;
          tip.textContent = t("dl.driftTip", { m: label(el.dataset.m), tag: k === "_other" ? t("dl.other") : tagName(axis, k), n: el.dataset.n });
          tip.hidden = false;
          const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
          tip.style.left = Math.max(0, Math.min(b.width - tip.offsetWidth, a.left - b.left + a.width / 2 - tip.offsetWidth / 2)) + "px";
          tip.style.top = (a.top - b.top - tip.offsetHeight - 6) + "px";
        };
        el.onmouseleave = () => (tip.hidden = true);
        el.onclick = () => {  // the same segment again clears it
          const k = el.dataset.k === "_other" ? "" : el.dataset.k, m = el.dataset.m, same = picked === m && f[axis] === k;
          if (term) f.month = same ? "" : m; else f.term = same ? "" : m;
          f[axis] = same ? "" : k; picked_();
        };
      });
      box.querySelectorAll("[data-row]").forEach(b => (b.onclick = () => {
        if (term) f.month = f.month === b.dataset.row ? "" : b.dataset.row; else { f.term = b.dataset.row; f.month = ""; }
        picked_();
      }));
      box.querySelectorAll(".drift-legend [data-k]").forEach(c => (c.onclick = () => { f[axis] = f[axis] === c.dataset.k ? "" : c.dataset.k; picked_(); }));
      box.querySelectorAll("[data-axis]").forEach(b => (b.onclick = () => { axis = b.dataset.axis; setPref("axis", axis); drift(); }));
      $("[data-back]", box)?.addEventListener("click", () => { f.term = ""; f.month = ""; picked_(); });
    }
    // a pick in the chart: refilter, and bring the list into view if it's off screen
    function picked_() {
      f.open = {}; tools(); update();
      const top = root.getBoundingClientRect().top;
      if (top > innerHeight - 120 || top < 0) root.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
    function update() { list(); drift(); }
    tools(); update();
    return { refresh: update };
  }

  window.LabDiaries = { mount };
})();
