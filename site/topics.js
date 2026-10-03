/* #/topics — the lab's fields (transport problems) and methods (techniques), moved here from the people page.
 * #/topic/<tid> — one tag as a full page: who reads it, what goes with it, most-read papers, its core-paper guides.
 */
(() => {
  const { t } = window.I18N, UI = window.LabUI;
  const { esc } = UI;

  I18N.extend({
    ko: { "tp.title": "분야·방법론", "tp.sub": "분야 = 어떤 교통 문제인지 · 방법론 = 그 문제를 푸는 기술", "tp.fields": "분야", "tp.methods": "방법론",
      "tp.papers": "{n}편", "tp.readers": "{n}명", "tp.guides": "이 주제의 핵심 논문 가이드", "tp.newGuide": "이 주제로 가이드 만들기", "tp.noGuide": "아직 가이드가 없어요" },
    en: { "tp.title": "Fields & methods", "tp.sub": "Field = which transport problem · method = the technique used to solve it", "tp.fields": "Fields", "tp.methods": "Methods",
      "tp.papers": "{n} papers", "tp.readers": "{n} people", "tp.guides": "Core-paper guides on this topic", "tp.newGuide": "Start a guide on this topic", "tp.noGuide": "No guide yet" },
  });

  const mk = id => { const v = document.createElement("section"); v.id = "view-" + id; v.className = "view page"; document.querySelector("main").appendChild(v); return v; };
  const listView = mk("topics"), pageView = mk("topic");

  function rows(axis) {
    const D = window.LAB, list = D.topics.filter(x => x.axis === axis).map(x => {
      const key = x.id.slice(2), ps = D.papers.filter(p => (axis === "domain" ? p.domains : p.methods).includes(key));
      return { x, n: ps.length, people: new Set(ps.flatMap(p => p.readers)).size, guides: window.Store ? Store.guides.forTag(x.id).length : 0 };
    }).filter(r => r.n).sort((a, b) => b.n - a.n);
    const mx = list[0]?.n || 1;
    return list.map(r => `<a class="tp-row" href="#/topic/${encodeURIComponent(r.x.id)}">
      <span class="nm"><span class="dot" style="background:${r.x.color}"></span>${esc(UI.tl(r.x))}</span>
      <span class="track"><span class="fill" style="width:${(r.n / mx * 100).toFixed(1)}%;background:${r.x.color}"></span></span>
      <span class="m">${t("tp.papers", { n: r.n })} · ${t("tp.readers", { n: r.people })}${r.guides ? ` · 📚 ${r.guides}` : ""}</span></a>`).join("");
  }

  function renderList() {
    listView.innerHTML = `${UI.papersTabs("topics")}
      <div class="page-head"><h1>${t("tp.title")}</h1><p class="sub">${t("tp.sub")}</p></div>
      <div class="tp-grid"><div class="card"><h3>${t("tp.fields")}</h3>${rows("domain")}</div><div class="card"><h3>${t("tp.methods")}</h3>${rows("method")}</div></div>`;
  }

  function renderPage(_, tid) {
    tid = decodeURIComponent(tid || "");
    const x = UI.T[tid];
    if (!x) { pageView.innerHTML = `${UI.papersTabs("topics")}<div class="empty">404</div>`; return; }
    const guides = window.Store ? Store.guides.forTag(tid) : [];
    pageView.innerHTML = `${UI.papersTabs("topics")}
      <div class="tp-page"><div class="card">${UI.topicDetail(tid)}</div>
      <div class="card"><div class="row-between"><h3>${t("tp.guides")}</h3>
        <a class="ui-btn small prominent" href="#/guides?new=1&tag=${encodeURIComponent(tid)}">＋ ${t("tp.newGuide")}</a></div>
        ${guides.length ? `<div class="gd-cards">${guides.map(g => window.LabGuides.card(g)).join("")}</div>` : `<p class="muted">${t("tp.noGuide")}</p>`}</div></div>`;
    // the drawer's own "topic page" link points here — drop it on the page itself
    pageView.querySelector(`a[href="#/topic/${encodeURIComponent(tid)}"]`)?.remove();
  }

  (window.LabPages ||= {}).topics = { render: renderList };
  window.LabPages.topic = { render: renderPage };
})();
