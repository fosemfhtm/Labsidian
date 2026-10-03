/* #/reading — my reading list. Papers to read, being read, read but not written up yet, and written.
 * Add one by link / DOI / arXiv id / title, or drop its PDF; open it, keep a note, and turn it into a diary entry
 * (#/write?reading=<id> fills in the paper and the PDF). Lab papers saved with 📚 land here too.
 */
(() => {
  const { t } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  I18N.extend({
    ko: {
      "rl.title": "읽을 목록", "rl.sub": "읽을 논문을 모아두고, 읽고, 다이어리로 정리하기까지",
      "rl.ph": "논문 링크 · DOI · arXiv 주소 · 제목", "rl.add": "추가", "rl.pdf": "PDF 올리기", "rl.dropHint": "PDF를 이 화면에 끌어다 놓아도 돼요 — 파일 이름이 제목이 되고, 나중에 고칠 수 있어요.",
      "rl.finding": "찾는 중…", "rl.added": "추가했어요", "rl.already": "이미 목록에 있어요", "rl.notFound": "정보를 못 찾았어요 — 제목을 입력해 주세요",
      "rl.s.reading": "읽는 중", "rl.s.todo": "읽을 예정", "rl.s.read": "다 읽음 · 정리 전", "rl.s.written": "다이어리 씀",
      "rl.empty.reading": "읽기 시작한 논문이 여기 와요", "rl.empty.todo": "링크나 PDF로 논문을 추가해 보세요", "rl.empty.read": "다 읽고 아직 정리 안 한 논문이 여기 와요",
      "rl.nudgeRead": "다 읽고 정리 안 한 논문 {n}편", "rl.nudgeStale": "2주 넘게 안 읽은 논문 {n}편",
      "rl.start": "읽기 시작", "rl.done": "다 읽음", "rl.write": "다이어리 쓰기", "rl.myDiary": "내 다이어리", "rl.attach": "PDF 첨부",
      "rl.back": "읽을 예정으로 되돌리기", "rl.remove": "읽을 목록에서 제거", "rl.removeQ": "읽을 목록에서 제거할까요?", "rl.removeMsg": "올린 PDF도 함께 지워지고 되돌릴 수 없어요.", "rl.removeOk": "제거", "rl.note": "메모",
      "rl.notePh": "왜 읽으려는지, 읽으면서 든 생각…", "rl.save": "저장", "rl.editTitle": "제목 편집",
      "rl.labRead": "연구실 {n}명 읽음", "rl.addedAgo": "{d}일 전 추가", "rl.startedAgo": "{d}일째 읽는 중", "rl.readAgo": "{d}일 전에 다 읽음",
      "rl.addedToday": "오늘 추가", "rl.startedToday": "오늘부터 읽는 중", "rl.readToday": "오늘 다 읽음", "rl.openPdf": "PDF 열기", "rl.openLink": "논문 링크",
    },
    en: {
      "rl.title": "Reading list", "rl.sub": "Collect papers, read them, and write them up",
      "rl.ph": "Paper link · DOI · arXiv URL · title", "rl.add": "Add", "rl.pdf": "Upload PDF", "rl.dropHint": "You can also drop PDFs on this page — the file name becomes the title; edit it any time.",
      "rl.finding": "Looking it up…", "rl.added": "Added", "rl.already": "Already on your list", "rl.notFound": "Couldn't find it — please type the title",
      "rl.s.reading": "Reading", "rl.s.todo": "To read", "rl.s.read": "Read · not written up", "rl.s.written": "Diary written",
      "rl.empty.reading": "Papers you start reading show up here", "rl.empty.todo": "Add a paper by link or PDF", "rl.empty.read": "Papers you finished but haven't written up show up here",
      "rl.nudgeRead": "{n} read but not written up", "rl.nudgeStale": "{n} waiting for over two weeks",
      "rl.start": "Start reading", "rl.done": "Finished", "rl.write": "Write diary", "rl.myDiary": "My diary", "rl.attach": "Attach PDF",
      "rl.back": "Back to 'to read'", "rl.remove": "Remove from Reading List", "rl.removeQ": "Remove from your reading list?", "rl.removeMsg": "The uploaded PDF is deleted too, and this can't be undone.", "rl.removeOk": "Remove", "rl.note": "Note",
      "rl.notePh": "Why you want to read it, thoughts while reading…", "rl.save": "Save", "rl.editTitle": "Edit Title",
      "rl.labRead": "{n} in the lab read it", "rl.addedAgo": "added {d}d ago", "rl.startedAgo": "reading for {d}d", "rl.readAgo": "finished {d}d ago",
      "rl.addedToday": "added today", "rl.startedToday": "started today", "rl.readToday": "finished today", "rl.openPdf": "Open PDF", "rl.openLink": "Paper link",
    },
  });

  const view = document.createElement("section");
  view.id = "view-reading"; view.className = "view page";
  document.querySelector("main").appendChild(view);

  const ago = iso => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 864e5)) : 0);
  const stateOf = x => (x.written ? "written" : x.status);
  const isUrl = s => /^https?:\/\//i.test(s) || /^10\.\d{4,9}\//.test(s);

  function render() {
    const me = S.auth.current();
    if (!me) return;
    const list = S.reading.list(), g = { reading: [], todo: [], read: [], written: [] };
    list.forEach(x => g[stateOf(x)].push(x));
    const stale = g.todo.filter(x => ago(x.addedAt) >= 14).length;
    view.innerHTML = `
      <div class="page-head"><h1>${t("rl.title")}</h1><p class="sub">${t("rl.sub")}</p></div>
      <div class="ui-card rl-add">
        <form id="rl-form" class="rl-add-row" autocomplete="off"><input id="rl-input" placeholder="${t("rl.ph")}">
          <button class="ui-btn prominent">${t("rl.add")}</button>
          <label class="ui-btn">📄 ${t("rl.pdf")}<input type="file" id="rl-file" accept="application/pdf" multiple hidden></label></form>
        <div class="muted" id="rl-status"></div><p class="hint">${t("rl.dropHint")}</p>
      </div>
      ${g.read.length || stale ? `<div class="rl-nudge">⏰ ${[g.read.length && t("rl.nudgeRead", { n: g.read.length }), stale && t("rl.nudgeStale", { n: stale })].filter(Boolean).join(" · ")}</div>` : ""}
      ${["reading", "todo", "read"].map(s => `<div class="ui-card rl-sec"><h3>${t("rl.s." + s)} <span class="muted">${g[s].length}</span></h3>
        ${g[s].length ? `<div class="rl-list">${g[s].map(item).join("")}</div>` : `<div class="ui-empty">${t("rl.empty." + s)}</div>`}</div>`).join("")}
      ${g.written.length ? `<details class="ui-card rl-sec"><summary><h3>${t("rl.s.written")} <span class="muted">${g.written.length}</span></h3></summary>
        <div class="rl-list">${g.written.map(item).join("")}</div></details>` : ""}`;
    wire();
  }

  function item(x) {
    const st = stateOf(x), pdf = x.files.find(f => f.kind === "pdf");
    const au = x.authors ? x.authors.split(",").map(s => s.trim()).filter(Boolean) : [];
    const meta = [au.slice(0, 3).join(", ") + (au.length > 3 ? " et al." : ""), x.venue, x.year].filter(Boolean).join(" · ");
    const [k, at] = st === "read" ? ["read", x.readAt] : st === "reading" ? ["started", x.startedAt] : ["added", x.addedAt];
    const when = ago(at) ? t(`rl.${k}Ago`, { d: ago(at) }) : t(`rl.${k}Today`);
    return `<div class="ui-row two ruled rl-item rl-st- ${st}" data-id="${esc(x.id)}">
      <div class="rl-main">
        <div class="rl-title">${x.paperId ? `<a data-open="paper:${esc(x.paperId)}">${esc(x.title)}</a>` : `<span>${esc(x.title)}</span>
          <button class="ui-btn text" data-act="title" title="${t("rl.editTitle")}">✎</button>`}</div>
        ${meta ? `<div class="muted rl-meta">${esc(meta)}</div>` : ""}
        <div class="rl-badges">${x.readers.length ? `<span class="rl-lab">${UI.avStack(x.readers, 4)} ${t("rl.labRead", { n: x.readers.length })}</span>` : ""}
          <span class="muted">${when}</span></div>
        ${x.note ? `<div class="rl-note">${esc(x.note)}</div>` : ""}
        <div class="rl-note-edit" hidden><textarea rows="3" placeholder="${t("rl.notePh")}">${esc(x.note)}</textarea>
          <button class="ui-btn small" data-act="note-save">${t("rl.save")}</button></div>
      </div>
      <div class="rl-actions">
        ${pdf ? `<a class="ui-btn small" data-fid="${esc(pdf.id)}" target="_blank" rel="noopener" title="${t("rl.openPdf")}">📄 PDF</a>`
          : st !== "written" ? `<label class="ui-btn small plain" title="${t("rl.attach")}">📎<input type="file" accept="application/pdf" data-act="attach" hidden></label>` : ""}
        ${x.link ? `<a class="ui-btn small plain" href="${esc(x.link)}" target="_blank" rel="noopener" title="${t("rl.openLink")}: ${esc(x.link)}">🔗</a>` : ""}
        ${st === "todo" ? `<button class="ui-btn small" data-act="reading">${t("rl.start")}</button>` : ""}
        ${st === "reading" ? `<button class="ui-btn small" data-act="read">${t("rl.done")}</button>` : ""}
        ${st === "written" ? `<a class="ui-btn small" href="#/write?review=${esc(x.written)}">✎ ${t("rl.myDiary")}</a>`
          : `<a class="ui-btn small ${st === "read" ? "primary" : ""}" href="#/write?reading=${encodeURIComponent(x.id)}">✎ ${t("rl.write")}</a>`}
        <button class="ui-btn small plain" data-act="note" title="${t("rl.note")}">💬</button>
        ${st === "reading" || st === "read" ? `<button class="ui-btn small plain" data-act="todo" title="${t("rl.back")}">↺</button>` : ""}
        <button class="ui-btn small plain" data-act="del" title="${t("rl.remove")}">🗑</button>
      </div></div>`;
  }

  const status = (msg, keep) => { const el = $("#rl-status", view); if (!el) return; el.textContent = msg; if (!keep) setTimeout(() => el.textContent === msg && (el.textContent = ""), 3500); };

  async function addPdfs(fileList) {
    for (const f of [...fileList].filter(f => f.type === "application/pdf")) {
      try {
        status(t("rl.finding"), true);
        const att = await S.files.put(f, f.name);
        const title = f.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
        await S.reading.add({ title, files: [att] });
        status(t("rl.added"));
      } catch (e) { status("⚠️ " + e.message); }
    }
    render();
  }

  function wire() {
    $("#rl-form", view).onsubmit = async e => {
      e.preventDefault();
      const input = $("#rl-input", view), v = input.value.trim(); if (!v) return;
      status(t("rl.finding"), true);
      const before = S.reading.list().length;
      let meta = await S.lookup(v).catch(() => null);
      // a typed title: only take the lookup's paper if it is that title (search can return a different paper)
      const nt = S.normTitle;
      if (meta && !isUrl(v) && !(nt(meta.title).includes(nt(v)) || nt(v).includes(nt(meta.title)))) meta = null;
      if (!meta && isUrl(v)) { status(t("rl.notFound"), true); input.select(); return; }
      await S.reading.add(meta ? { ...meta, link: meta.link || (isUrl(v) ? v : "") } : { title: v });
      input.value = "";
      status(S.reading.list().length > before ? t("rl.added") : t("rl.already"));
      render();
    };
    $("#rl-file", view).onchange = e => addPdfs(e.target.files);
    view.querySelectorAll(".rl-item").forEach(el => {
      const id = el.dataset.id;
      el.querySelectorAll("[data-act]").forEach(b => {
        const act = b.dataset.act;
        if (act === "attach") b.onchange = async () => {
          const f = b.files[0]; if (!f) return;
          const att = await S.files.put(f, f.name), x = S.reading.get(id);
          await S.reading.update(id, { files: [...x.files, att] }); render();
        };
        else b.onclick = async () => {
          if (["reading", "read", "todo"].includes(act)) { await S.reading.update(id, { status: act }); render(); }
          if (act === "note") { const ed = $(".rl-note-edit", el); ed.hidden = !ed.hidden; if (!ed.hidden) $("textarea", ed).focus(); }
          if (act === "note-save") { await S.reading.update(id, { note: $(".rl-note-edit textarea", el).value }); render(); }
          if (act === "title") {   // a small sheet instead of the browser's own dialog (components §16)
            const x = S.reading.get(id);
            const m = LabModal(`<h2>${t("rl.editTitle")}</h2><input class="ui-field rl-title-in" value="${esc(x.title)}">
              <div class="btn-row"><button class="ui-btn" data-close>${t("c.cancel")}</button><button class="ui-btn prominent" data-save>${t("rl.save")}</button></div>`);
            const inp = $(".rl-title-in", m), save = async () => { const v = inp.value.trim(); if (v) { m.remove(); await S.reading.update(id, { title: v }); render(); } };
            $("[data-save]", m).onclick = save;
            inp.onkeydown = e => { if (e.key === "Enter") save(); if (e.key === "Escape") m.remove(); };
            inp.focus(); inp.select();
          }
          if (act === "del" && await LabConfirm(t("rl.removeQ"), { message: t("rl.removeMsg"), ok: t("rl.removeOk"), destructive: true })) { await S.reading.remove(id); render(); }
        };
      });
    });
  }

  // drop PDFs anywhere on the page
  view.addEventListener("dragover", e => { if ([...e.dataTransfer.items].some(i => i.kind === "file")) { e.preventDefault(); view.classList.add("dropping"); } });
  view.addEventListener("dragleave", e => { if (e.target === view) view.classList.remove("dropping"); });
  view.addEventListener("drop", e => { e.preventDefault(); view.classList.remove("dropping"); addPdfs(e.dataTransfer.files); });
  window.addEventListener("lab:mcp", () => { if (UI.currentView() === "reading") render(); });

  (window.LabPages ||= {}).reading = { render };
})();
