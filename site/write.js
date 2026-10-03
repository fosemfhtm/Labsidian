/* #/write — write or edit a diary entry.
 *   #/write                 new (restores your draft)
 *   #/write?paper=<id>      new review for a paper that's already in the lab
 *   #/write?review=<id>     edit an existing review
 */
(() => {
  const { t, lang } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  I18N.extend({
    ko: {
      "w.new": "다이어리 쓰기", "w.edit": "다이어리 편집", "w.sub": "{term} · 이번 학기 {n}번째 다이어리",
      "w.lookup.ph": "DOI · 논문 링크(arXiv, doi.org) · 제목으로 찾기", "w.fetch": "정보 불러오기", "w.fetching": "찾는 중…",
      "w.fetched": "{src}에서 불러왔어요", "w.notFound": "못 찾았어요 — 직접 입력해주세요",
      "w.title": "논문 제목", "w.venue": "저널·학회", "w.year": "연도", "w.link": "링크", "w.authors": "저자", "w.abstract": "초록 (있으면 지도 위치·태그 추천이 정확해져요)",
      "w.date": "다이어리 날짜", "w.dateHint": "어느 주 다이어리로 칠지예요. 밀린 주나 다음 주 것도 고를 수 있고, 실제 등록 시각은 따로 기록돼요.", "w.prevWeek": "지난주", "w.today": "오늘", "w.nextWeek": "다음 주", "w.dateLate": "{n}일 늦게 등록으로 표시돼요", "w.dateEarly": "{n}일 미리 작성으로 표시돼요", "w.dateTerm": "{term}에 들어가요",
      "w.files": "첨부 (논문 PDF · 그림)", "w.addPdf": "📄 PDF", "w.addImg": "🖼 이미지", "w.drop": "파일을 끌어다 놓거나, 내용 칸에 이미지를 붙여넣어도 돼요", "w.fileType": "PDF나 이미지만 첨부할 수 있어요", "w.fileSize": "{name}: 너무 커요 (PDF 20MB · 이미지 5MB까지)", "w.fileMax": "첨부는 {n}개까지예요", "w.uploading": "올리는 중…", "w.fileLocal": "지금은 이 브라우저에만 저장돼요 (DB 연결 후 모두에게 보여요)", "w.rating": "별점", "w.content": "내용", "w.memo": "Memo (critic)",
      "w.content.ph": "Problem:\nMethod:\nResult:\nContribution:", "w.memo.ph": "한계, 가정, 내 연구와의 연결…",
      "w.memoHint": "2024년 5월부터 메모(critic)가 있는 다이어리만 인정돼요", "w.tags": "태그", "w.tags.ph": "태그 검색 · Enter로 새 키워드 태그",
      "w.publish": "게시하기", "w.saveEdit": "수정 저장", "w.delete": "삭제", "w.discard": "새로 쓰기", "w.saved": "임시저장됨 {time}",
      "w.restored": "임시저장된 글을 불러왔어요", "w.fromReading": "읽을 목록에서 가져왔어요 — 논문 정보와 PDF가 채워져 있어요",
      "w.already": "{date}에 이 논문 다이어리를 이미 썼어요.", "w.editMine": "그 다이어리 수정하기", "w.need.title": "논문 제목을 입력해주세요", "w.need.rating": "별점을 골라주세요",
      "w.need.body": "내용이나 Memo를 써주세요", "w.done": "게시했어요 ✓", "w.updated": "수정했어요 ✓", "w.deleted": "삭제했어요", "w.confirmDelete": "이 다이어리를 삭제할까요?",
      "w.dup": "이미 연구실에서 읽은 논문이에요", "w.dupBy": "{names} 님이 읽었어요", "w.dupOpen": "다이어리 보기",
      "w.suggest": "추천 태그", "w.suggestHint": "비슷한 논문들의 태그 + 키워드 규칙 (클릭해서 추가)", "w.similar": "비슷한 논문", "w.forbidden": "내 다이어리만 편집할 수 있어요",
      "w.signin": "로그인이 필요해요", "w.forStudy": "📚 \"{title}\" 스터디에서 같이 읽는 논문의 다이어리예요. 평소 다이어리와 똑같이 쌓여요.", "w.forPick": "📚 \"{title}\" 스터디에 가져온 논문의 다이어리예요. 평소 다이어리와 똑같이 쌓여요.", "w.fromMcp": "내 AI(MCP)가 만든 초안이에요. 논문을 직접 읽고 내용을 확인·수정한 뒤 게시해주세요.",
      "w.mcpWaiting": "내 AI(MCP)가 만든 초안 {n}개:",
    },
    en: {
      "w.new": "Write diary", "w.edit": "Edit review", "w.sub": "{term} · review #{n} this term",
      "w.lookup.ph": "Find by DOI · paper link (arXiv, doi.org) · title", "w.fetch": "Fetch details", "w.fetching": "Searching…",
      "w.fetched": "Loaded from {src}", "w.notFound": "Not found — please fill in manually",
      "w.title": "Paper title", "w.venue": "Venue", "w.year": "Year", "w.link": "Link", "w.authors": "Authors", "w.abstract": "Abstract (improves map position & tag suggestions)",
      "w.date": "Diary date", "w.dateHint": "Which week this entry counts for. You can catch up on a past week or write ahead; the actual posting time is recorded separately.", "w.prevWeek": "Last week", "w.today": "Today", "w.nextWeek": "Next week", "w.dateLate": "Will show as posted {n}d late", "w.dateEarly": "Will show as written {n}d ahead", "w.dateTerm": "Counts toward {term}",
      "w.files": "Attachments (paper PDF · figures)", "w.addPdf": "📄 PDF", "w.addImg": "🖼 Image", "w.drop": "Drop files here, or paste an image into the summary", "w.fileType": "Only PDFs and images can be attached", "w.fileSize": "{name}: too large (PDF 20 MB · image 5 MB max)", "w.fileMax": "Up to {n} attachments", "w.uploading": "Uploading…", "w.fileLocal": "For now files are stored in this browser only (shared once the DB is connected)", "w.rating": "Rating", "w.content": "Summary", "w.memo": "Memo (critique)",
      "w.content.ph": "Problem:\nMethod:\nResult:\nContribution:", "w.memo.ph": "Limitations, assumptions, link to your research…",
      "w.memoHint": "Since May 2024 only reviews with a critique count", "w.tags": "Tags", "w.tags.ph": "Search tags · Enter adds a keyword tag",
      "w.publish": "Publish", "w.saveEdit": "Save changes", "w.delete": "Delete", "w.discard": "Start over", "w.saved": "Draft saved {time}",
      "w.restored": "Restored your saved draft", "w.fromReading": "From your reading list — the paper and its PDF are filled in",
      "w.already": "You already wrote a diary on this paper ({date}).", "w.editMine": "Edit that one", "w.need.title": "Please enter the paper title", "w.need.rating": "Please pick a rating",
      "w.need.body": "Please write a summary or a memo", "w.done": "Published ✓", "w.updated": "Saved ✓", "w.deleted": "Deleted", "w.confirmDelete": "Delete this review?",
      "w.dup": "Someone in the lab already read this paper", "w.dupBy": "Read by {names}", "w.dupOpen": "See reviews",
      "w.suggest": "Suggested tags", "w.suggestHint": "From similar papers' tags + keyword rules (click to add)", "w.similar": "Similar papers", "w.forbidden": "You can only edit your own reviews",
      "w.signin": "Please sign in", "w.forStudy": "📚 Diary entry on the paper read together in the \"{title}\" study — it's a regular entry.", "w.forPick": "📚 Diary entry on the paper you bring to the \"{title}\" study — it's a regular entry.", "w.fromMcp": "Drafted by your AI (MCP). Read the paper, check and edit before publishing.",
      "w.mcpWaiting": "{n} draft(s) from your AI (MCP):",
    },
  });

  const view = document.createElement("section");
  view.id = "view-write"; view.className = "view page";
  document.querySelector("main").appendChild(view);

  let files = [], addedNow = new Set(), study = null, pick = null, fromDraft = false, prePaper = null;
  let form = null, tags = [], rating = 0, editing = null, mcpDraft = null, saveTimer = null, suggestTimer = null, fromReading = null;

  const field = (id, label, input) => `<label class="fld" for="${id}"><span>${label}</span>${input}</label>`;

  function render(params) {
    const me = S.auth.current();
    if (!me) { view.innerHTML = `<div class="empty">${t("w.signin")}</div>`; return; }
    editing = params.get("review") ? UI.R[params.get("review")] : null;
    if (editing && editing.person !== me.id && me.role !== "admin") { view.innerHTML = `<div class="empty">${t("w.forbidden")}</div>`; return; }
    study = !editing && params.get("study") ? S.studies.get(params.get("study")) : null;
    pick = study && params.get("pick") ? study.picks?.[me.id] || null : null;   // the related paper I bring
    const studyPaper = pick ? S.studies.pickPaper(pick) : study ? S.studies.paperOf(study) : null;
    prePaper = params.get("paper") ? UI.PA[params.get("paper")] : editing ? UI.PA[editing.paper] : studyPaper;
    mcpDraft = params.get("mcp") ? S.drafts.mcp().find(d => d.id === params.get("mcp")) || null : null;
    fromReading = !editing && !study && params.get("reading") ? S.reading.get(params.get("reading")) : null;  // #/reading → write it up
    if (!prePaper && fromReading?.paperId) prePaper = UI.PA[fromReading.paperId];
    const myOld = !editing && prePaper ? prePaper.reviews.map(id => UI.R[id]).find(r => r && r.person === me.id) : null;
    const term = S.terms.current();
    const mineInTerm = UI.R ? Object.values(UI.R).filter(r => r.person === me.id && r.date >= term.start && r.date <= term.end).length : 0;

    view.innerHTML = `
      <div class="page-head"><h1>${editing ? t("w.edit") : t("w.new")}</h1>
        <p class="sub">${editing ? esc(prePaper?.title || "") : t("w.sub", { term: esc(term.label), n: mineInTerm + 1 })}</p></div>
      <div class="write-grid">
        <form class="card write-form" id="w-form" autocomplete="off">
          ${editing ? "" : `<div class="lookup"><input id="w-lookup" placeholder="${t("w.lookup.ph")}"><button type="button" class="btn" id="w-fetch">${t("w.fetch")}</button></div>
          <div class="muted" id="w-fetch-status"></div>`}
          <p class="restored" id="w-restored" hidden>${t("w.restored")} <button type="button" class="link-btn" id="w-discard">${t("w.discard")}</button></p>
          ${mcpDraft ? `<p class="restored mcp">🤖 ${t("w.fromMcp")}</p>` : ""}
          ${fromReading ? `<p class="restored">📚 ${t("w.fromReading")}</p>` : ""}
          ${myOld ? `<p class="restored">${t("w.already", { date: esc(myOld.date) })} <a class="link-btn" href="#/write?review=${myOld.id}">${t("w.editMine")}</a></p>` : ""}
          ${study ? `<p class="restored study">${t(pick ? "w.forPick" : "w.forStudy", { title: esc(study.title) })}</p>` : ""}
          ${!editing && !mcpDraft && S.drafts.mcp().length ? `<p class="restored mcp">🤖 ${t("w.mcpWaiting", { n: S.drafts.mcp().length })}
            ${S.drafts.mcp().map(d => `<a class="link-btn" href="#/write?mcp=${d.id}">${esc(d.title || "(untitled)")}</a>`).join(" · ")}</p>` : ""}
          ${field("w-title", t("w.title") + " *", `<input id="w-title" ${editing || study ? "readonly" : ""}>`)}
          <div class="row3">
            ${field("w-venue", t("w.venue"), `<input id="w-venue" ${editing ? "readonly" : ""}>`)}
            ${field("w-year", t("w.year"), `<input id="w-year" inputmode="numeric" ${editing ? "readonly" : ""}>`)}
            ${field("w-link", t("w.link"), `<input id="w-link" ${editing ? "readonly" : ""}>`)}
          </div>
          ${field("w-authors", t("w.authors"), `<input id="w-authors" ${editing ? "readonly" : ""}>`)}
          <details class="fld" ${editing ? "hidden" : ""}><summary>${t("w.abstract")}</summary><textarea id="w-abstract" rows="5"></textarea></details>
          <div class="row2">
            <div class="fld"><span>${t("w.date")}</span><input id="w-date" type="date">
              <div class="date-quick">${[["-7", "w.prevWeek"], ["0", "w.today"], ["7", "w.nextWeek"]].map(([d, k]) => `<button type="button" class="chip" data-shift="${d}">${t(k)}</button>`).join("")}</div>
              <em class="hint" id="w-date-hint" title="${t("w.dateHint")}"></em></div>
            <div class="fld"><span>${t("w.rating")} *</span><div class="star-input" id="w-stars">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-v="${i}">★</button>`).join("")}</div></div>
          </div>
          ${field("w-content", t("w.content"), `<textarea id="w-content" rows="10" placeholder="${t("w.content.ph")}"></textarea>`)}
          ${field("w-memo", t("w.memo"), `<textarea id="w-memo" rows="5" placeholder="${t("w.memo.ph")}"></textarea><em class="hint">${t("w.memoHint")}</em>`)}
          <div class="fld"><span>${t("w.files")}</span>
            <div class="drop" id="w-drop"><div class="drop-btns">
              <button type="button" class="btn small" data-pick="application/pdf">${t("w.addPdf")}</button>
              <button type="button" class="btn small" data-pick="image/*">${t("w.addImg")}</button>
              <span class="hint">${t("w.drop")}</span></div>
              <div class="att-list" id="w-files"></div><em class="hint">${t("w.fileLocal")}</em></div>
            <input type="file" id="w-file" hidden multiple></div>
          <div class="fld"><span>${t("w.tags")}</span>
            <div class="tag-input"><div class="chips" id="w-tags"></div><input id="w-tag-q" placeholder="${t("w.tags.ph")}"><div class="tag-pop" id="w-tag-pop" hidden></div></div></div>
          <p class="err" id="w-err"></p>
          <div class="form-foot"><span class="muted" id="w-saved"></span>
            ${editing ? `<button type="button" class="btn danger" id="w-del">${t("w.delete")}</button>` : ""}
            <button class="btn primary">${editing ? t("w.saveEdit") : t("w.publish")}</button></div>
        </form>
        <aside class="write-side">
          <div class="card dup" id="w-dup" hidden></div>
          <div class="card"><h4>${t("w.suggest")}</h4><p class="hint">${t("w.suggestHint")}</p><div class="chips" id="w-suggest"></div>
            <h4>${t("w.similar")}</h4><div class="mini-list" id="w-similar"></div></div>
</aside>
      </div>`;
    form = $("#w-form", view);
    tags = []; rating = 0; files = []; addedNow = new Set(); fromDraft = false;

    // fill
    const set = (id, v) => { const el = $("#" + id, view); if (el && v != null) el.value = v; };
    if (editing) {
      const p = UI.PA[editing.paper];
      set("w-title", p.title); set("w-venue", p.venueNorm || p.venue); set("w-year", p.year || ""); set("w-link", p.link); set("w-authors", p.authors);
      set("w-date", editing.date); set("w-content", editing.content); set("w-memo", editing.memo);
      rating = editing.rating; tags = [...(editing.tags || [])]; files = [...(editing.files || [])];
    } else {
      set("w-date", /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : S.today());  // from a calendar day
      const d = fromReading ? null : S.drafts.get();
      if (mcpDraft) {
        ["title", "venue", "year", "link", "authors", "abstract", "date", "content", "memo"].forEach(k => set("w-" + k, mcpDraft[k]));
        rating = mcpDraft.rating || 0; tags = [...(mcpDraft.tags || [])];
        const known = S.findPaper(mcpDraft.title);
        if (known && !mcpDraft.venue) { set("w-venue", known.venueNorm || known.venue); set("w-authors", known.authors); set("w-link", known.link); }
      } else if (fromReading && !prePaper) {
        ["title", "venue", "year", "link", "authors", "abstract"].forEach(k => set("w-" + k, fromReading[k]));
      } else if (study && !prePaper) {
        set("w-title", pick ? pick.title : study.title); set("w-link", pick ? pick.link : study.link);
      } else if (prePaper) {
        set("w-title", prePaper.title); set("w-venue", prePaper.venueNorm || prePaper.venue); set("w-year", prePaper.year || "");
        set("w-link", prePaper.link); set("w-authors", prePaper.authors); set("w-abstract", prePaper.abstract || "");
      } else if (d) {
        ["title", "venue", "year", "link", "authors", "abstract", "date", "content", "memo"].forEach(k => set("w-" + k, d[k]));
        rating = d.rating || 0; tags = d.tags || []; files = d.files || []; fromDraft = true;
        $("#w-restored", view).hidden = false;
      }
    }
    if (fromReading) files = [...fromReading.files];  // the PDF saved with it comes along
    paintStars(); paintTags(); paintFiles(); dateHint(); refreshSide();
    wire();
  }

  const val = id => ($("#" + id, view)?.value || "").trim();
  const collect = () => ({ title: val("w-title"), venue: val("w-venue"), year: val("w-year"), link: val("w-link"), authors: val("w-authors"),
    abstract: val("w-abstract"), date: val("w-date") || editing?.date || S.today(), content: $("#w-content", view).value, memo: $("#w-memo", view).value, rating, tags, files, studyId: study?.id || null, pick: !!pick, fromDraft });

  function paintStars() { view.querySelectorAll("#w-stars button").forEach(b => b.classList.toggle("on", +b.dataset.v <= rating)); }
  const topicLabel = id => { const x = UI.T[id]; return x ? UI.tl(x) : id.slice(2); };
  const topicColor = id => UI.T[id]?.color || "#9da7b3";
  function paintTags() {
    $("#w-tags", view).innerHTML = tags.map(id => `<span class="chip on" data-id="${esc(id)}"><span class="dot" style="background:${topicColor(id)}"></span>${esc(topicLabel(id))} ✕</span>`).join("");
  }
  // ---- diary date: how it will read next to the actual posting date
  function dateHint() {
    const d = val("w-date"), el = $("#w-date-hint", view); if (!el) return;
    if (!d) { el.textContent = ""; return; }
    const n = Math.round((Date.parse(S.today()) - Date.parse(d)) / 864e5);
    const term = S.terms.list().find(x => x.start <= d && d <= x.end);
    el.textContent = [!editing && n > 0 ? t("w.dateLate", { n }) : !editing && n < 0 ? t("w.dateEarly", { n: -n }) : "", term ? t("w.dateTerm", { term: term.label }) : ""].filter(Boolean).join(" · ");
  }

  // ---- attachments
  const MAX_FILES = 10;
  async function shrink(file) {  // figures: cap at 1600px and re-encode, so they stay small in storage
    if (file.type === "image/gif" || file.size < 300 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise(r => c.toBlob(r, "image/webp", 0.85));
      return b && b.size < file.size ? new File([b], (file.name || "image").replace(/\.\w+$/, "") + ".webp", { type: "image/webp" }) : file;
    } catch (e) { return file; }
  }
  async function addFiles(list) {
    const err = $("#w-err", view); err.textContent = "";
    for (let f of list) {
      if (files.length >= MAX_FILES) { err.textContent = t("w.fileMax", { n: MAX_FILES }); break; }
      const kind = S.files.kindOf(f.type);
      if (!kind) { err.textContent = t("w.fileType"); continue; }
      if (kind === "image") f = await shrink(f);
      if (f.size > S.files.limits[kind]) { err.textContent = t("w.fileSize", { name: f.name }); continue; }
      $("#w-saved", view).textContent = t("w.uploading");
      try {
        const meta = await S.files.put(f, f.name || (kind === "image" ? "image.png" : "paper.pdf"));
        files.push(meta); addedNow.add(meta.id);
      } catch (e) { err.textContent = e.message === "file.size" ? t("w.fileSize", { name: f.name }) : t("w.fileType"); }
    }
    $("#w-saved", view).textContent = "";
    paintFiles(); changed();
  }
  function paintFiles() {
    const box = $("#w-files", view); if (!box) return;
    box.innerHTML = files.map(f => f.kind === "image"
      ? `<span class="att img" data-id="${esc(f.id)}"><img data-fid="${esc(f.id)}" alt=""><button type="button" title="✕">✕</button></span>`
      : `<span class="att pdf" data-id="${esc(f.id)}">📄 ${esc(f.name)} <span class="m">${UI.kb(f.size)}</span><button type="button" title="✕">✕</button></span>`).join("");
  }
  function removeFile(id) {
    files = files.filter(f => f.id !== id);
    // files added in this session aren't referenced anywhere else; saved ones are cleaned up when the edit is saved
    if (addedNow.has(id)) { addedNow.delete(id); S.files.remove(id).catch(() => {}); }
    paintFiles(); changed();
  }

  function addTag(id) { if (!tags.includes(id)) { tags.push(id); paintTags(); changed(); } }

  function refreshSide() {
    const d = collect();
    // already read?
    const dup = !editing && d.title && S.findPaper(d.title);
    const box = $("#w-dup", view);
    box.hidden = !dup;
    if (dup) box.innerHTML = `<b>${t("w.dup")}</b><p>${t("w.dupBy", { names: dup.readers.map(r => esc(UI.P[r]?.name || r)).join(", ") })}</p>
      <button type="button" class="btn small" data-open="paper:${dup.id}">${t("w.dupOpen")}</button>`;
    if (!d.title && !d.content) { $("#w-suggest", view).innerHTML = ""; $("#w-similar", view).innerHTML = ""; return; }
    const sug = S.suggestTags(d);
    $("#w-suggest", view).innerHTML = sug.tags.filter(x => !tags.includes(x.id)).map(x =>
      `<span class="chip" data-add="${esc(x.id)}"><span class="dot" style="background:${topicColor(x.id)}"></span>+ ${esc(topicLabel(x.id))}</span>`).join("") || `<span class="muted">—</span>`;
    $("#w-similar", view).innerHTML = sug.similar.map(x => UI.miniPaper(UI.PA[x.id], Math.round(x.score * 100) + "%")).join("");
  }

  function changed() {
    clearTimeout(suggestTimer); suggestTimer = setTimeout(refreshSide, 350);
    if (editing || mcpDraft || study || fromReading || (prePaper && !fromDraft)) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const at = S.drafts.save(collect());
      if (at) $("#w-saved", view).textContent = t("w.saved", { time: new Date(at).toLocaleTimeString(lang === "ko" ? "ko-KR" : "en-US", { hour: "2-digit", minute: "2-digit" }) });
    }, 700);
  }

  function wire() {
    form.addEventListener("input", e => { if (e.target.id !== "w-tag-q") changed(); if (e.target.id === "w-date") dateHint(); });
    view.querySelectorAll("[data-shift]").forEach(b => (b.onclick = () => {
      const d = new Date(S.today() + "T00:00:00"); d.setDate(d.getDate() + +b.dataset.shift);
      $("#w-date", view).value = UI.localDay(d.toISOString()); dateHint(); changed();
    }));
    const picker = $("#w-file", view), drop = $("#w-drop", view);
    view.querySelectorAll("[data-pick]").forEach(b => (b.onclick = () => { picker.accept = b.dataset.pick; picker.click(); }));
    picker.onchange = () => { addFiles([...picker.files]); picker.value = ""; };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files]); };
    $("#w-files", view).onclick = e => { const b = e.target.closest("button"); if (b) removeFile(b.closest(".att").dataset.id); };
    ["w-content", "w-memo"].forEach(id => $("#" + id, view).addEventListener("paste", e => {
      const imgs = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
      if (imgs.length) { e.preventDefault(); addFiles(imgs); }
    }));
    $("#w-stars", view).onclick = e => { const b = e.target.closest("button"); if (!b) return; rating = +b.dataset.v; paintStars(); changed(); };
    $("#w-tags", view).onclick = e => { const c = e.target.closest(".chip"); if (!c) return; tags = tags.filter(x => x !== c.dataset.id); paintTags(); changed(); };
    $("#w-suggest", view).onclick = e => { const c = e.target.closest("[data-add]"); if (c) addTag(c.dataset.add); };
    $("#w-discard", view)?.addEventListener("click", () => { files.forEach(f => S.files.remove(f.id).catch(() => {})); S.drafts.clear(); render(new URLSearchParams()); });

    // tag autocomplete
    const q = $("#w-tag-q", view), pop = $("#w-tag-pop", view);
    q.oninput = () => {
      const s = q.value.trim().toLowerCase();
      if (!s) { pop.hidden = true; return; }
      const hits = Object.values(UI.T).filter(x => (x.label + " " + x.labelEn).toLowerCase().includes(s) && !tags.includes(x.id)).slice(0, 8);
      pop.hidden = false;
      pop.innerHTML = hits.map(x => `<div data-id="${esc(x.id)}"><span class="dot" style="background:${x.color}"></span>${esc(UI.tl(x))} <span class="muted">${x.axis}</span></div>`).join("") +
        `<div data-new="1">＋ “${esc(q.value.trim())}” <span class="muted">${lang === "ko" ? "키워드 태그로 추가" : "add as keyword tag"}</span></div>`;
    };
    pop.onclick = e => {
      const d = e.target.closest("[data-id],[data-new]"); if (!d) return;
      if (d.dataset.id) addTag(d.dataset.id);
      else { const k = q.value.trim().toLowerCase().replace(/[^0-9a-z가-힣_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); if (k) addTag("f:" + k); }
      q.value = ""; pop.hidden = true; q.focus();
    };
    q.onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); (pop.querySelector("[data-id]") || pop.querySelector("[data-new]"))?.click(); }
      if (e.key === "Escape") pop.hidden = true;
    };

    // metadata lookup
    $("#w-fetch", view)?.addEventListener("click", async () => {
      const st = $("#w-fetch-status", view), input = val("w-lookup") || val("w-title");
      if (!input) return;
      st.textContent = t("w.fetching");
      const m = await S.lookup(input);
      if (!m || !m.title) { st.textContent = t("w.notFound"); if (/^https?:/.test(input)) $("#w-link", view).value = input; return; }
      const set = (id, v) => { if (v) $("#" + id, view).value = v; };
      if (!$("#w-title", view).readOnly) set("w-title", m.title);
      set("w-venue", m.venue); set("w-year", m.year); set("w-link", m.link || (/^https?:/.test(input) ? input : ""));
      set("w-authors", m.authors); set("w-abstract", m.abstract);
      if (m.abstract) $("details", view).open = true;
      st.textContent = t("w.fetched", { src: m.source });
      changed(); refreshSide();
    });
    $("#w-lookup", view)?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#w-fetch", view).click(); } });

    // submit / delete
    form.onsubmit = async e => {
      e.preventDefault();
      const d = collect(), err = $("#w-err", view);
      if (!d.title) return (err.textContent = t("w.need.title"));
      if (!d.rating) return (err.textContent = t("w.need.rating"));
      if (!d.content.trim() && !d.memo.trim()) return (err.textContent = t("w.need.body"));
      const btn = form.querySelector("button.btn.primary"); if (btn.disabled) return;
      btn.disabled = true; clearTimeout(saveTimer);
      if (editing) {
        await S.reviews.update(editing.id, d);
        LabReload("#/me", t("w.updated"));
      } else {
        await S.reviews.create(d);
        if (mcpDraft) S.drafts.takeMcp(mcpDraft.id);
        LabReload(study ? "#/study/" + study.id : "#/me", t("w.done"));
      }
    };
    $("#w-del", view)?.addEventListener("click", async () => {
      if (!(await LabConfirm(t("w.confirmDelete"), { ok: t("w.delete"), destructive: true }))) return;
      await S.reviews.remove(editing.id);
      LabReload("#/me", t("w.deleted"));
    });
  }

  (window.LabPages ||= {}).write = { render };
})();
