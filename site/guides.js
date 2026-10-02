/* #/guides — core-paper guides the lab curates together; #/guide/<id> — one guide.
 * A guide: title, description, tags (fields/methods), sections (e.g. basics / core / recent) and papers — lab papers or
 * ones from outside. Anyone adds papers and 👍s them; the owner (or an admin) edits the guide, its sections and order.
 * Progress is automatic: a paper is ✓ once you've written a diary on it. Studies: open one from an item, the next
 * unread item is suggested, a study's papers can be added to a guide, and an item shows the studies that covered it.
 */
(() => {
  const { t } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  I18N.extend({
    ko: {
      "gd.title": "핵심 논문 가이드", "gd.sub": "주제별 핵심 논문을 연구실이 함께 모아요 — 누가 읽었는지, 내가 어디까지 읽었는지 같이 보여요",
      "gd.new": "새 가이드", "gd.name": "가이드 이름", "gd.name.ph": "예: 교통 예측 입문", "gd.desc": "설명", "gd.desc.ph": "누구를 위한 목록인지, 어떤 순서로 읽으면 좋은지",
      "gd.tags": "주제 태그", "gd.sections": "구간", "gd.sections.ph": "쉼표로 구분 — 예: 기초, 핵심, 최신", "gd.create": "만들기", "gd.save": "저장", "gd.cancel": "취소",
      "gd.empty": "아직 가이드가 없어요 — 첫 가이드를 만들어 보세요", "gd.papers": "논문 {n}편", "gd.mine": "내 진행 {d}/{n}",
      "gd.by": "{name} 만듦", "gd.edit": "가이드 고치기", "gd.delete": "가이드 삭제", "gd.deleteQ": "이 가이드를 삭제할까요?",
      "gd.add": "논문 추가", "gd.add.ph": "논문 링크 · DOI · arXiv 주소 · 제목", "gd.note.ph": "왜 핵심인지 한 줄 (선택)", "gd.addBtn": "추가",
      "gd.finding": "찾는 중…", "gd.notFound": "정보를 못 찾았어요 — 제목을 입력해 주세요", "gd.added": "추가했어요",
      "gd.readBy": "연구실 {n}명 읽음", "gd.nobody": "아직 아무도 안 읽음", "gd.addedBy": "{name} 추가",
      "gd.toReading": "읽을 목록에", "gd.allToReading": "남은 논문 전부 읽을 목록에", "gd.allAdded": "{n}편을 읽을 목록에 담았어요",
      "gd.openStudy": "스터디 열기", "gd.nextStudy": "다음 스터디 제안", "gd.nextNone": "남은 논문이 없어요", "gd.studied": "스터디에서 다룸",
      "gd.remove": "빼기", "gd.removeQ": "가이드에서 뺄까요?", "gd.noItems": "아직 논문이 없어요", "gd.sectionMove": "구간 옮기기",
    },
    en: {
      "gd.title": "Core-paper guides", "gd.sub": "Key papers per topic, curated by the lab — with who read them and how far you are",
      "gd.new": "New guide", "gd.name": "Guide name", "gd.name.ph": "e.g. Traffic forecasting 101", "gd.desc": "Description", "gd.desc.ph": "Who it's for, and in what order to read",
      "gd.tags": "Topic tags", "gd.sections": "Sections", "gd.sections.ph": "Comma-separated — e.g. Basics, Core, Recent", "gd.create": "Create", "gd.save": "Save", "gd.cancel": "Cancel",
      "gd.empty": "No guides yet — start the first one", "gd.papers": "{n} papers", "gd.mine": "You {d}/{n}",
      "gd.by": "by {name}", "gd.edit": "Edit guide", "gd.delete": "Delete guide", "gd.deleteQ": "Delete this guide?",
      "gd.add": "Add a paper", "gd.add.ph": "Paper link · DOI · arXiv URL · title", "gd.note.ph": "Why it matters, in one line (optional)", "gd.addBtn": "Add",
      "gd.finding": "Looking it up…", "gd.notFound": "Couldn't find it — please type the title", "gd.added": "Added",
      "gd.readBy": "{n} in the lab read it", "gd.nobody": "Nobody in the lab has read it yet", "gd.addedBy": "added by {name}",
      "gd.toReading": "To my reading list", "gd.allToReading": "All remaining to my reading list", "gd.allAdded": "Added {n} to your reading list",
      "gd.openStudy": "Open a study", "gd.nextStudy": "Suggest the next study", "gd.nextNone": "Nothing left to read", "gd.studied": "Covered in a study",
      "gd.remove": "Remove", "gd.removeQ": "Remove it from the guide?", "gd.noItems": "No papers yet", "gd.sectionMove": "Move to section",
    },
  });

  const mk = id => { const v = document.createElement("section"); v.id = "view-" + id; v.className = "view page"; document.querySelector("main").appendChild(v); return v; };
  const listView = mk("guides"), pageView = mk("guide");
  const isUrl = s => /^https?:\/\//i.test(s) || /^10\.\d{4,9}\//.test(s);
  const name = id => UI.P[id]?.name || (id === "admin" ? "admin" : id);
  const progressBar = (d, n) => `<div class="gd-prog"><i style="width:${n ? (d / n * 100).toFixed(0) : 0}%"></i></div>`;
  const tagChips = tags => (tags || []).filter(x => UI.T[x]).map(x => UI.tag(x)).join("");

  function card(g) {
    const me = S.auth.current(), pr = me ? S.guides.progress(g, me.id) : { done: 0, total: g.items.length };
    return `<a class="card gd-card" href="#/guide/${g.id}">
      <div class="gd-card-t">${esc(g.title)}</div>
      ${g.desc ? `<div class="gd-card-d">${esc(g.desc.slice(0, 120))}</div>` : ""}
      <div class="tags-row small">${tagChips(g.tags)}</div>
      <div class="gd-card-f"><span>${UI.avatar(g.owner)} ${t("gd.papers", { n: g.items.length })}</span><span class="muted">${t("gd.mine", { d: pr.done, n: pr.total })}</span></div>
      ${progressBar(pr.done, pr.total)}</a>`;
  }

  // ---------------- list + create
  function tagPicker(selected) {
    const D = window.LAB, opt = axis => D.topics.filter(x => x.axis === axis).map(x => `<option value="${x.id}">${esc(UI.tl(x))}</option>`).join("");
    return `<div class="gd-tagpick"><div class="chips" id="gd-tags">${selected.map(id => `<span class="chip on" data-id="${id}">${esc(UI.T[id] ? UI.tl(UI.T[id]) : id)} ✕</span>`).join("")}</div>
      <select id="gd-tag-add"><option value="">＋ ${t("gd.tags")}</option><optgroup label="${t("tp.fields")}">${opt("domain")}</optgroup><optgroup label="${t("tp.methods")}">${opt("method")}</optgroup></select></div>`;
  }
  function wireTagPicker(root, tags) {
    const paint = () => { $("#gd-tags", root).innerHTML = tags.map(id => `<span class="chip on" data-id="${id}">${esc(UI.T[id] ? UI.tl(UI.T[id]) : id)} ✕</span>`).join(""); };
    $("#gd-tag-add", root).onchange = e => { const v = e.target.value; if (v && !tags.includes(v)) tags.push(v); e.target.value = ""; paint(); };
    $("#gd-tags", root).onclick = e => { const c = e.target.closest("[data-id]"); if (c) { tags.splice(tags.indexOf(c.dataset.id), 1); paint(); } };
  }
  function form(g, preTag) {
    return `<form class="card write-form gd-form" id="gd-form">
      <label class="fld"><span>${t("gd.name")}</span><input name="title" required maxlength="120" placeholder="${t("gd.name.ph")}" value="${esc(g?.title || "")}"></label>
      <label class="fld"><span>${t("gd.desc")}</span><textarea name="desc" rows="2" placeholder="${t("gd.desc.ph")}">${esc(g?.desc || "")}</textarea></label>
      <div class="fld"><span>${t("gd.tags")}</span>${tagPicker(g?.tags || (preTag ? [preTag] : []))}</div>
      <label class="fld"><span>${t("gd.sections")}</span><input name="sections" placeholder="${t("gd.sections.ph")}" value="${esc((g?.sections || []).map(x => x.title).join(", ") || (I18N.lang === "en" ? "Basics, Core, Recent" : "기초, 핵심, 최신"))}"></label>
      <div class="form-foot"><a class="btn" href="${g ? "#/guide/" + g.id : "#/guides"}">${t("gd.cancel")}</a><button class="btn primary">${g ? t("gd.save") : t("gd.create")}</button></div></form>`;
  }

  function renderList(params) {
    const me = S.auth.current(), creating = params.get("new") === "1" && me;
    const guides = S.guides.list();
    listView.innerHTML = `${UI.papersTabs("guides")}
      <div class="page-head row-head"><div><h1>${t("gd.title")}</h1><p class="sub">${t("gd.sub")}</p></div>
        ${me && !creating ? `<a class="btn primary" href="#/guides?new=1">＋ ${t("gd.new")}</a>` : ""}</div>
      ${creating ? form(null, params.get("tag")) : ""}
      ${guides.length ? `<div class="gd-cards">${guides.map(card).join("")}</div>` : `<div class="empty">${t("gd.empty")}</div>`}`;
    if (creating) {
      const f = $("#gd-form", listView), tags = params.get("tag") ? [params.get("tag")] : [];
      wireTagPicker(f, tags);
      f.onsubmit = async e => {
        e.preventDefault();
        const id = await S.guides.create({ title: f.title.value, desc: f.desc.value, tags, sections: f.sections.value.split(",").map(s => s.trim()).filter(Boolean) });
        location.hash = "#/guide/" + id;
      };
    }
  }

  // ---------------- one guide
  function itemRow(g, it, canManage, me) {
    const p = S.guides.paperOf(it), title = S.guides.titleOf(it), done = me && S.guides.wroteBy(it, me.id);
    const meta = p ? [p.authors?.split(",").slice(0, 3).join(","), p.venueNorm || p.venue, p.year].filter(Boolean).join(" · ") : [it.meta?.authors, it.meta?.venue, it.meta?.year].filter(Boolean).join(" · ");
    const link = p?.link || it.meta?.link || "", studies = S.guides.studiesFor(it), voted = me && (it.votes || []).includes(me.id);
    const inReading = me && (p ? S.reading.has(p.id) : S.reading.list().some(x => S.normTitle(x.title) === it.key));
    const sameSec = g.items.filter(x => x.section === it.section).length;
    const studyQ = p ? `paper=${p.id}` : `title=${encodeURIComponent(title)}&link=${encodeURIComponent(link)}`;
    return `<div class="gd-item ${done ? "done" : ""}" data-item="${it.id}">
      <span class="gd-check" title="${done ? "✓" : ""}">${done ? "✓" : ""}</span>
      <div class="gd-main">
        <div class="gd-t">${p ? `<a data-open="paper:${p.id}">${esc(title)}</a>` : link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title)}</div>
        ${meta ? `<div class="muted gd-meta">${esc(meta)}</div>` : ""}
        ${it.note ? `<div class="gd-note">${esc(it.note)}</div>` : ""}
        <div class="gd-badges">${p?.readers.length ? `<span>${UI.avStack(p.readers, 5)} ${t("gd.readBy", { n: p.readers.length })}</span>` : `<span class="muted">${t("gd.nobody")}</span>`}
          ${studies.map(st => `<a class="reg study" href="#/study/${st.id}${st.closed && st.notes ? "?tab=notes" : ""}">${t("gd.studied")} · ${esc(st.date || "")}</a>`).join("")}
          <span class="muted">${t("gd.addedBy", { name: esc(name(it.by)) })}</span></div>
      </div>
      <div class="gd-actions">
        ${me ? `<button class="chip ${voted ? "on" : ""}" data-act="vote">👍 ${(it.votes || []).length || ""}</button>` : ""}
        ${me && !done ? `<button class="btn small ghost" data-act="read" title="${t("gd.toReading")}" ${inReading ? "disabled" : ""}>📚</button>` : ""}
        ${me && !done && !studies.some(st => !st.closed) ? `<a class="btn small ghost" href="#/study/new?${studyQ}" title="${t("gd.openStudy")}">👥</a>` : ""}
        ${me && (canManage || it.by === me.id) ? `<span class="gd-own">${canManage && sameSec > 1 ? `<button class="btn small ghost" data-act="up" title="↑">↑</button><button class="btn small ghost" data-act="down" title="↓">↓</button>` : ""}
          ${canManage && g.sections.length > 1 ? `<select data-act="section" title="${t("gd.sectionMove")}" aria-label="${t("gd.sectionMove")}">${g.sections.map(x => `<option value="${x.id}" ${x.id === it.section ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select>` : ""}
          <button class="btn small ghost" data-act="del" title="${t("gd.remove")}" aria-label="${t("gd.remove")}">🗑</button></span>` : ""}
      </div></div>`;
  }

  function renderPage(params, id) {
    const g = S.guides.get(id), me = S.auth.current();
    if (!g) { pageView.innerHTML = `${UI.papersTabs("guides")}<div class="empty">404</div>`; return; }
    const canManage = S.guides.canManage(g), editing = params.get("edit") === "1" && canManage;
    const pr = me ? S.guides.progress(g, me.id) : { done: 0, total: g.items.length };
    pageView.innerHTML = `${UI.papersTabs("guides")}
      ${editing ? form(g) : `<div class="page-head row-head"><div><h1>${esc(g.title)}</h1>
          <p class="sub gd-by">${UI.avatar(g.owner)} ${t("gd.by", { name: esc(name(g.owner)) })} · ${t("gd.papers", { n: g.items.length })}</p></div>
          <div class="btn-row">${canManage ? `<a class="btn" href="#/guide/${g.id}?edit=1">${t("gd.edit")}</a><button class="btn danger" id="gd-del">${t("gd.delete")}</button>` : ""}</div></div>
        ${g.desc ? `<p class="gd-desc">${esc(g.desc)}</p>` : ""}<div class="tags-row">${tagChips(g.tags)}</div>`}
      ${me ? `<div class="card gd-me"><div class="row-between"><b>${t("gd.mine", { d: pr.done, n: pr.total })}</b>
          <div class="btn-row"><button class="btn small" id="gd-all-read">📚 ${t("gd.allToReading")}</button><button class="btn small primary" id="gd-next">👥 ${t("gd.nextStudy")}</button></div></div>
        ${progressBar(pr.done, pr.total)}</div>` : ""}
      ${g.sections.map(sec => {
        const items = g.items.filter(it => it.section === sec.id);
        return `<div class="card gd-sec"><h3>${esc(sec.title)} <span class="muted">${items.length}</span></h3>
          ${items.map(it => itemRow(g, it, canManage, me)).join("") || `<p class="muted">${t("gd.noItems")}</p>`}</div>`;
      }).join("")}
      ${me ? `<form class="card write-form gd-add" id="gd-add" autocomplete="off"><h3>${t("gd.add")}</h3>
        <div class="gd-add-row"><input name="q" placeholder="${t("gd.add.ph")}" required>
          <select name="section">${g.sections.map(x => `<option value="${x.id}">${esc(x.title)}</option>`).join("")}</select></div>
        <div class="gd-add-row"><input name="note" placeholder="${t("gd.note.ph")}" maxlength="300"><button class="btn primary">${t("gd.addBtn")}</button></div>
        <div class="muted" id="gd-add-msg"></div></form>` : ""}`;
    wire(g, editing);
  }

  function wire(g, editing) {
    const rerender = () => renderPage(new URLSearchParams(location.hash.split("?")[1] || ""), g.id);
    if (editing) {
      const f = $("#gd-form", pageView), tags = [...(g.tags || [])];
      wireTagPicker(f, tags);
      f.onsubmit = async e => {
        e.preventDefault();
        const titles = f.sections.value.split(",").map(s => s.trim()).filter(Boolean);
        const sections = titles.map(title => g.sections.find(x => x.title === title) || { title });
        await S.guides.update(g.id, { title: f.title.value, desc: f.desc.value, tags, sections });
        location.hash = "#/guide/" + g.id;
      };
      return;
    }
    $("#gd-del", pageView)?.addEventListener("click", async () => { if (await LabConfirm(t("gd.deleteQ"), { ok: t("gd.delete"), destructive: true })) { await S.guides.remove(g.id); location.hash = "#/guides"; } });
    $("#gd-all-read", pageView)?.addEventListener("click", async () => {
      const me = S.auth.current(); let n = 0;
      for (const it of g.items) {
        if (S.guides.wroteBy(it, me.id)) continue;
        const p = S.guides.paperOf(it), before = S.reading.list().length;
        await S.reading.add(p ? { paperId: p.id, source: "guide" } : { ...it.meta, source: "guide" });
        if (S.reading.list().length > before) n++;
      }
      rerender(); LabToast(t("gd.allAdded", { n }));
    });
    $("#gd-next", pageView)?.addEventListener("click", () => {  // the next item nobody covered yet: unread in the lab first, most 👍
      const open = g.items.filter(it => !S.guides.studiesFor(it).length);
      const next = [...open].sort((a, b) => (S.guides.paperOf(a)?.readers.length || 0) - (S.guides.paperOf(b)?.readers.length || 0) || (b.votes || []).length - (a.votes || []).length)[0];
      if (!next) { LabToast(t("gd.nextNone")); return; }
      const p = S.guides.paperOf(next);
      location.hash = "#/study/new?" + (p ? `paper=${p.id}` : `title=${encodeURIComponent(S.guides.titleOf(next))}&link=${encodeURIComponent(next.meta?.link || "")}`);
    });
    pageView.querySelectorAll(".gd-item").forEach(row => {
      const itemId = row.dataset.item;
      row.querySelectorAll("[data-act]").forEach(b => {
        const act = b.dataset.act;
        if (act === "section") b.onchange = async () => { await S.guides.updateItem(g.id, itemId, { section: b.value }); rerender(); };
        else b.onclick = async () => {
          const it = g.items.find(x => x.id === itemId); if (!it) return;
          if (act === "vote") await S.guides.vote(g.id, itemId);
          if (act === "up" || act === "down") await S.guides.moveItem(g.id, itemId, act === "up" ? -1 : 1);
          if (act === "del" && !(await LabConfirm(t("gd.removeQ"), { ok: t("gd.remove"), destructive: true }))) return;
          if (act === "del") await S.guides.removeItem(g.id, itemId);
          if (act === "read") { const p = S.guides.paperOf(it); await S.reading.add(p ? { paperId: p.id, source: "guide" } : { ...it.meta, source: "guide" }); LabToast(t("s.added")); }
          rerender();
        };
      });
    });
    const f = $("#gd-add", pageView);
    if (f) f.onsubmit = async e => {
      e.preventDefault();
      const q = f.q.value.trim(), out = $("#gd-add-msg", pageView); if (!q) return;
      out.textContent = t("gd.finding");
      let meta = await S.lookup(q).catch(() => null);
      const nt = S.normTitle;
      if (meta && !isUrl(q) && !(nt(meta.title).includes(nt(q)) || nt(q).includes(nt(meta.title)))) meta = null;
      if (!meta && isUrl(q)) { out.textContent = t("gd.notFound"); return; }
      await S.guides.addItem(g.id, { ...(meta || { title: q }), link: meta?.link || (isUrl(q) ? q : ""), section: f.section.value, note: f.note.value });
      rerender(); $("#gd-add-msg", pageView).textContent = t("gd.added");
    };
  }

  window.LabGuides = { card };
  (window.LabPages ||= {}).guides = { render: renderList };
  window.LabPages.guide = { render: renderPage };
})();
