/* Global search (Spotlight-style). Opened from the top-bar magnifier, "/" or Ctrl/⌘ K.
 * Finds papers (title · authors · venue · review text), people, studies and fields in one list;
 * ↑↓ to move, Enter to open, Esc to close. The papers page keeps its own list filter (#p-search).
 */
(() => {
  const { t } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;

  I18N.extend({
    ko: {
      "sp.btn": "검색 ( / )", "sp.ph": "논문·사람·스터디·분야 검색", "sp.papers": "논문", "sp.people": "사람", "sp.studies": "스터디", "sp.topics": "분야·방법론",
      "sp.all": "논문 목록에서 “{q}” 전체 결과 보기", "sp.empty": "“{q}”에 맞는 결과가 없어요", "sp.hint": "↑↓ 이동 · Enter 열기 · Esc 닫기",
      "sp.recent": "최근 본 논문", "sp.reviews": "다이어리 {n}편", "sp.papersOf": "논문 {n}편", "sp.inReview": "다이어리 내용에서 찾음",
    },
    en: {
      "sp.btn": "Search ( / )", "sp.ph": "Search papers, people, studies, fields", "sp.papers": "Papers", "sp.people": "People", "sp.studies": "Studies", "sp.topics": "Fields & methods",
      "sp.all": "See all results for “{q}” in Papers", "sp.empty": "No results for “{q}”", "sp.hint": "↑↓ move · Enter open · Esc close",
      "sp.recent": "Recently viewed", "sp.reviews": "{n} reviews", "sp.papersOf": "{n} papers", "sp.inReview": "found in a review",
    },
  });

  const ICON = { paper: "file-text", person: "user-round", study: "book-open", topic: "tag", all: "list" };
  const RECENT = "lab.recentPapers";
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT) || "[]").filter(id => UI.PA[id]); } catch (e) { return []; } };
  window.addEventListener("hashchange", () => {
    const m = location.hash.match(/^#\/paper\/([^?]+)/); if (!m) return;
    try { localStorage.setItem(RECENT, JSON.stringify([decodeURIComponent(m[1]), ...recent().filter(x => x !== m[1])].slice(0, 6))); } catch (e) {}
  });

  function search(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [{ group: t("sp.recent"), items: recent().map(id => paperItem(UI.PA[id])) }].filter(g => g.items.length);
    const has = s => words.every(w => (s || "").toLowerCase().includes(w));
    const papers = Object.values(UI.PA).filter(p => p.reviews?.length && words.every(w => p._hay.includes(w)))
      .map(p => ({ p, score: (has(p.title) ? 2 : 0) + (has(p.authors) ? 1 : 0) }))
      .sort((a, b) => b.score - a.score || (b.p._last || "").localeCompare(a.p._last || ""));
    const people = Object.values(UI.P).filter(p => has(p.name));
    const studies = S.studies.list().filter(st => has(st.title + " " + (st.desc || "") + " " + (st.place || "")));
    const topics = Object.values(UI.T).filter(x => has(x.label + " " + x.labelEn));
    const groups = [
      { group: t("sp.papers"), items: papers.slice(0, 6).map(({ p, score }) => paperItem(p, !score)) },
      { group: t("sp.people"), items: people.slice(0, 4).map(p => ({ kind: "person", go: `#/person/${p.id}`, title: p.name, sub: t("sp.papersOf", { n: p.count || 0 }), lead: UI.avatar(p.id) })) },
      { group: t("sp.studies"), items: studies.slice(0, 3).map(st => ({ kind: "study", go: `#/study/${st.id}`, title: st.title, sub: [st.date, st.time, st.place].filter(Boolean).join(" · ") })) },
      { group: t("sp.topics"), items: topics.slice(0, 4).map(x => ({ kind: "topic", open: "topic:" + x.id, title: UI.tl(x), sub: x.axis === "domain" ? t("g.tags") : t("g.methods"), dot: x.color })) },
    ].filter(g => g.items.length);
    if (papers.length) groups.push({ group: "", items: [{ kind: "all", go: `#/papers?q=${encodeURIComponent(q)}`, title: t("sp.all", { q }), sub: t("papers.count", { n: papers.length }) }] });
    return groups;
  }
  const paperItem = (p, inReview) => ({ kind: "paper", go: `#/paper/${p.id}`, title: p.title,
    sub: [p.venueNorm || p.venue, p.year, t("sp.reviews", { n: p.reviews.length }), inReview ? t("sp.inReview") : ""].filter(Boolean).join(" · ") });

  let box = null, results = [], active = 0;
  function open(initial = "") {
    if (box) { box.querySelector("input").focus(); return; }
    box = document.createElement("div");
    box.className = "spot-scrim";
    box.innerHTML = `<div class="spot" role="dialog" aria-modal="true" aria-label="${esc(t("sp.ph"))}">
      <div class="spot-in"><i data-lucide="search" class="ic"></i><input type="search" placeholder="${esc(t("sp.ph"))}" autocomplete="off" spellcheck="false" value="${esc(initial)}">
        <kbd>Esc</kbd></div>
      <div class="spot-list" role="listbox"></div>
      <div class="spot-foot">${esc(t("sp.hint"))}</div></div>`;
    document.body.appendChild(box);
    const input = box.querySelector("input");
    input.addEventListener("input", () => paint(input.value.trim()));
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); move(e.key === "ArrowDown" ? 1 : -1); }
      if (e.key === "Enter") { e.preventDefault(); choose(active); }
      if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    box.addEventListener("mousedown", e => { if (e.target === box) close(); });
    paint(initial);
    window.lucide?.createIcons();
    input.focus();
  }
  function close() { box?.remove(); box = null; document.getElementById("search-btn")?.focus(); }
  function paint(q) {
    const groups = search(q);
    results = groups.flatMap(g => g.items);
    active = 0;
    let i = 0;
    box.querySelector(".spot-list").innerHTML = groups.map(g => `${g.group ? `<div class="spot-h">${esc(g.group)}</div>` : `<div class="spot-sep"></div>`}
      ${g.items.map(it => `<div class="ui-row spot-row ${i === 0 ? "on" : ""}" role="option" data-i="${i++}">
        <span class="lead">${it.lead || (it.dot ? `<span class="dot" style="background:${esc(it.dot)}"></span>` : `<i data-lucide="${ICON[it.kind]}" class="ic"></i>`)}</span>
        <span class="txt"><b>${esc(it.title)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ""}</span>
        <i data-lucide="corner-down-left" class="ic ret"></i></div>`).join("")}`).join("")
      || (q ? `<div class="spot-empty">${esc(t("sp.empty", { q }))}</div>` : "");
    box.querySelectorAll(".spot-row").forEach(r => {
      r.onmousemove = () => { if (active !== +r.dataset.i) { active = +r.dataset.i; mark(); } };
      r.onclick = () => choose(+r.dataset.i);
    });
    window.lucide?.createIcons();
  }
  function mark() {
    box.querySelectorAll(".spot-row").forEach(r => r.classList.toggle("on", +r.dataset.i === active));
    box.querySelector(`.spot-row[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }
  function move(d) { if (!results.length) return; active = (active + d + results.length) % results.length; mark(); }
  function choose(i) {
    const it = results[i]; if (!it) return;
    close();
    if (it.open) { const [k, ...rest] = it.open.split(":"); UI.openDrawer(k, rest.join(":")); }
    else location.hash = it.go;
  }

  // top-bar button + shortcuts
  document.getElementById("search-btn")?.addEventListener("click", () => open());
  document.addEventListener("keydown", e => {
    const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); box ? close() : open(); }
    else if (e.key === "/" && !typing && !box) { e.preventDefault(); open(); }
  });
  window.LabSpotlight = { open, close };
})();
