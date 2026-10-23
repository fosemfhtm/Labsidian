/* #/study — paper study: agree to read one paper together, collect questions before the (offline) meeting,
 * compare everyone's reviews side by side, and keep shared notes afterwards.
 *   #/study                list (tabs: open · past · read together)
 *   #/study/new?paper=<id> open a study
 *   #/study/<id>           one study
 * A study review is an ordinary diary entry (counts toward the quota), written via #/write?study=<id>.
 */
(() => {
  const { t, lang } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  I18N.extend({
    ko: {
      "st.title": "논문 스터디", "st.sub": "같이 읽기로 한 논문을 미리 질문하고, 모여서 이야기하고, 정리까지 남겨요",
      "st.open": "＋ 스터디 열기", "st.tab.open": "진행 중", "st.tab.past": "지난 스터디", "st.tab.shared": "함께 읽은 논문",
      "st.cands": "같이 읽고 싶어하는 논문", "st.candsHint": "2명 이상이 \"나도 읽어볼래요\"를 누르거나 읽을 목록에 담았어요", "st.candOpen": "이 논문으로 스터디 열기", "st.toGuide": "가이드에 추가", "st.inGuides": "가이드", "st.gCand": "가이드 「{g}」에서 👍 {n}", "st.toGuided": "가이드에 추가했어요",
      "st.empty": "진행 중인 스터디가 없어요. 위에서 하나 열어보세요.", "st.pastEmpty": "아직 끝난 스터디가 없어요",
      "st.members": "참가 {n}명", "st.reviewed": "다이어리 {n}/{m}", "st.qs": "질문 {n}", "st.noDate": "날짜 미정", "st.today": "오늘", "st.dday": "D-{n}", "st.after": "{n}일 지남",
      "st.done": "마침", "st.presenter": "발제", "st.host": "개설",
      "st.materials": "자료", "st.materialTitle": "자료 제목", "st.materialUrl": "자료 링크", "st.materialFile": "PDF · 이미지 추가…",
      "st.materialHint": "PDF와 이미지를 올릴 수 있어요. PPTX는 PDF로 내보내 올려 주세요.",
      "st.materialEmpty": "아직 자료가 없어요.", "st.materialDelete": "이 자료를 삭제할까요?", "st.materialDeleteMsg": "첨부 파일도 함께 삭제되고 되돌릴 수 없어요.",
      "st.materialInvalid": "80자 이내 제목과 http 또는 https 링크를 입력해 주세요.", "st.needPresenters": "발제자를 한 명 이상 선택해 주세요.",
      "st.materialAdd": "추가",
      // form
      "st.new": "스터디 열기", "st.paper": "논문", "st.paper.ph": "연구실 논문 검색 · 없으면 제목을 그대로 입력", "st.link": "링크 (선택)",
      "st.date": "날짜", "st.time": "시간", "st.place": "장소", "st.place.ph": "예: 세미나실, Zoom", "st.desc": "소개 · 읽을 범위", "st.desc.ph": "왜 같이 읽고 싶은지, 어디까지 읽어올지…",
      "st.invite": "초대 (알림이 가요)", "st.pdf": "PDF (선택)", "st.create": "스터디 열기", "st.need.title": "논문을 골라주세요", "st.created": "스터디를 열었어요 ✓",
      "st.series": "「{g}」 {n}회차", "st.seriesNew": "「{g}」 {n}회차", "st.prevRound": "← {n}회차", "st.nextRound": "{n}회차 →",
      "st.solo": "단발 스터디",
      "st.knownPaper": "연구실에서 {n}명이 읽은 논문이에요", "st.newPaper": "아직 연구실에서 아무도 안 읽은 논문이에요",
      // detail
      "st.join": "참가하기", "st.leave": "참가 취소", "st.joined": "참가했어요 · 읽을 목록에 담았어요", "st.write": "✎ 이 논문 다이어리 쓰기", "st.myReview": "내 다이어리 보기",
      "st.countsHint": "스터디에서 쓰는 다이어리도 평소와 같은 양식이라, 쓰면 내 다이어리에 그대로 쌓여요", "st.edit": "수정", "st.close": "스터디 마치기", "st.reopen": "다시 열기", "st.delete": "삭제",
      "st.confirmDelete": "이 스터디를 삭제할까요? 질문과 정리 노트도 함께 지워져요.", "st.confirmClose": "스터디를 마칠까요? 참가자에게 알림이 가요.",
      "st.compare": "다이어리 비교", "st.notYet": "아직 다이어리를 안 썼어요", "st.ratings": "별점",
      "st.board": "질문 보드", "st.boardHint": "모이기 전에 궁금한 점을 올리고 👍로 투표하세요. 많이 받은 순서대로 이야기해요.",
      "st.q.ph": "궁금한 점 · 토론하고 싶은 점", "st.q.add": "올리기", "st.q.done": "이야기함", "st.q.undo": "되돌리기", "st.q.empty": "아직 질문이 없어요",
      "st.notes": "정리 노트", "st.notesHint": "모임이 끝나면 누구든 정리해 주세요. 마지막 저장 내용이 남아요.",
      "st.n.conclusion": "결론 · 배운 점", "st.n.open": "남은 질문", "st.n.next": "후속으로 읽을 논문 · 해볼 것", "st.n.save": "노트 저장", "st.n.saved": "{name} 님이 {at}에 저장",
      "st.n.draft": "🤖 {name} 님의 AI(MCP)가 만든 정리 초안이 있어요.", "st.n.loadDraft": "불러오기", "st.n.savedToast": "정리 노트를 저장했어요",
      "st.abstract": "초록", "st.reviewBadge": "📚 스터디",
      "st.tab.prep": "질문", "st.tab.diary": "다이어리", "st.tab.picks": "소개 순서", "st.tab.notes": "정리", "st.tab.materials": "자료",
      "st.todo": "내 준비", "st.todo.diary": "같이 읽는 논문 다이어리 쓰기", "st.todo.pick": "가져올 논문 올리기", "st.todo.pickDiary": "가져온 논문 다이어리 쓰기",
      "st.editInfo": "일정·장소 수정", "st.save": "저장", "st.saved": "저장했어요",
      "st.todo.q": "궁금한 점 올리기 (선택)", "st.todo.allDone": "모임 준비를 마쳤어요", "st.todo.go": "하기", "st.todo.view": "보기", "st.todo.joinFirst": "참가하면 모임 전에 준비할 일이 여기 생겨요",
      "st.manage": "관리", "st.prepStatus": "참가자 준비 현황", "st.discussed": "모임에서 이야기한 질문",
      "st.n.empty": "아직 정리 노트가 없어요. 모임이 끝나면 누구든 정리해 주세요.", "st.n.write": "✎ 정리 쓰기", "st.n.edit": "수정", "st.n.cancel": "취소",
      "st.n.fromBoard": "질문 보드에서 이야기 못 한 질문 {n}개 넣기",
      "st.n.conclusion.ph": "오늘 이야기로 정리된 결론, 새로 알게 된 점", "st.n.open.ph": "결론이 안 난 질문, 더 알아볼 것", "st.n.next.ph": "다음에 읽을 논문, 우리 연구에 해볼 것",
      "st.blindMsg": "먼저 쓰고 보기: 내 다이어리를 올리면 보여요.", "st.writeMine": "내 다이어리 쓰기",
      "st.opt.blind": "먼저 쓰고 보기", "st.opt.blindHint": "내 다이어리를 올리기 전에는 다른 참가자의 다이어리를 가려요 (스터디가 끝나면 모두 보여요)",
      "st.opt.bring": "관련 논문 가져오기", "st.opt.bringHint": "같이 읽는 논문과 관련된 논문을 한 편씩 골라 와서 모임에서 돌아가며 소개해요",
      "st.bring.off": "없음", "st.bring.all": "모두", "st.bring.presenters": "발표자만",
      "st.blindOn": "🙈 먼저 쓰고 보기 중이에요. 내 다이어리를 올리면 다른 참가자의 다이어리가 보여요.",
      "st.prep": "모임 준비", "st.prepDiary": "다이어리", "st.prepPick": "가져온 논문",
      "st.common": "같이 읽는 논문", "st.picks": "가져온 논문 · 소개 순서", "st.picksHint": "같이 읽는 논문과 관련된 논문을 한 편씩 가져와서 모임에서 소개해요. 가져온 논문의 다이어리도 평소처럼 써요.",
      "st.myPick": "내가 가져올 논문", "st.pick.ph": "연구실 논문 검색 · 없으면 제목을 그대로 입력", "st.pick.why": "같이 읽는 논문과 어떻게 이어지나요?",
      "st.pick.why.ph": "예: 같은 문제를 강화학습 대신 최적화로 풂", "st.pick.slides": "📎 소개 자료 (PDF·이미지)", "st.pick.save": "올리기", "st.pick.edit": "바꾸기",
      "st.pick.remove": "빼기", "st.pick.write": "✎ 이 논문 다이어리 쓰기", "st.pick.none": "아직 아무도 안 가져왔어요", "st.pick.saved": "가져올 논문을 올렸어요",
      "st.pick.diary": "다이어리", "st.pick.noDiary": "다이어리 아직",
    },
    en: {
      "st.title": "Paper study", "st.sub": "Agree on a paper, collect questions before you meet, talk it through, keep the notes",
      "st.open": "＋ Open a study", "st.tab.open": "Open", "st.tab.past": "Past", "st.tab.shared": "Read together",
      "st.cands": "Papers people want to read", "st.candsHint": "2+ members marked \"want to read\" or put it on their reading list", "st.candOpen": "Open a study on this paper", "st.toGuide": "Add to a guide", "st.inGuides": "Guides", "st.gCand": "👍 {n} in the guide “{g}”", "st.toGuided": "Added to the guide",
      "st.empty": "No open studies. Open one above.", "st.pastEmpty": "No finished studies yet",
      "st.members": "{n} joined", "st.reviewed": "entries {n}/{m}", "st.qs": "{n} questions", "st.noDate": "date TBD", "st.today": "Today", "st.dday": "D-{n}", "st.after": "{n}d ago",
      "st.done": "done", "st.presenter": "presenter", "st.host": "opened by",
      "st.materials": "Materials", "st.materialTitle": "Material Title", "st.materialUrl": "Material Link", "st.materialFile": "Add PDF or Image…",
      "st.materialHint": "Upload a PDF or image. Export PPTX slides as a PDF before uploading.",
      "st.materialEmpty": "No materials yet.", "st.materialDelete": "Delete this material?", "st.materialDeleteMsg": "Its attached file will also be deleted. This cannot be undone.",
      "st.materialInvalid": "Enter a title of up to 80 characters and an http or https link.", "st.needPresenters": "Select at least one presenter.",
      "st.materialAdd": "Add",
      "st.new": "Open a study", "st.paper": "Paper", "st.paper.ph": "Search lab papers · or type a new title", "st.link": "Link (optional)",
      "st.date": "Date", "st.time": "Time", "st.place": "Place", "st.place.ph": "e.g. seminar room, Zoom", "st.desc": "About · what to read", "st.desc.ph": "Why read it together, which sections…",
      "st.invite": "Invite (they get notified)", "st.pdf": "PDF (optional)", "st.create": "Open study", "st.need.title": "Pick a paper", "st.created": "Study opened ✓",
      "st.series": "{g} · session {n}", "st.seriesNew": "{g} · session {n}", "st.prevRound": "← Session {n}", "st.nextRound": "Session {n} →",
      "st.solo": "One-off studies",
      "st.knownPaper": "{n} lab member(s) already read this", "st.newPaper": "Nobody in the lab has read this yet",
      "st.join": "Join", "st.leave": "Leave", "st.joined": "Joined · added to your reading list", "st.write": "✎ Write my diary entry", "st.myReview": "See my entry",
      "st.countsHint": "A study diary is an ordinary diary and lands in your diaries as usual", "st.edit": "Edit", "st.close": "Finish study", "st.reopen": "Reopen", "st.delete": "Delete",
      "st.confirmDelete": "Delete this study? Its questions and notes go too.", "st.confirmClose": "Finish this study? Members will be notified.",
      "st.compare": "Entries side by side", "st.notYet": "hasn't written an entry yet", "st.ratings": "Ratings",
      "st.board": "Question board", "st.boardHint": "Post questions before you meet and vote with 👍. The most-voted go first.",
      "st.q.ph": "A question or something to discuss", "st.q.add": "Post", "st.q.done": "discussed", "st.q.undo": "undo", "st.q.empty": "No questions yet",
      "st.notes": "Notes", "st.notesHint": "After the meeting, anyone can write them up. The last save is kept.",
      "st.n.conclusion": "Conclusion · takeaways", "st.n.open": "Open questions", "st.n.next": "Follow-up papers · things to try", "st.n.save": "Save notes", "st.n.saved": "saved by {name} · {at}",
      "st.n.draft": "🤖 {name}'s AI (MCP) drafted notes.", "st.n.loadDraft": "Load draft", "st.n.savedToast": "Notes saved",
      "st.abstract": "Abstract", "st.reviewBadge": "📚 study",
      "st.tab.prep": "Q&A", "st.tab.diary": "Diaries", "st.tab.picks": "Order", "st.tab.notes": "Notes", "st.tab.materials": "Materials",
      "st.todo": "My to-dos", "st.todo.diary": "Write my entry on the common paper", "st.todo.pick": "Post the paper I'll bring", "st.todo.pickDiary": "Write my entry on the brought paper",
      "st.editInfo": "Edit date & place", "st.save": "Save", "st.saved": "Saved",
      "st.todo.q": "Post a question (optional)", "st.todo.allDone": "You're ready for the meeting", "st.todo.go": "Do it", "st.todo.view": "View", "st.todo.joinFirst": "Join to get your prep to-dos here",
      "st.manage": "Manage", "st.prepStatus": "Who is ready", "st.discussed": "Discussed at the meeting",
      "st.n.empty": "No notes yet. After the meeting, anyone can write them up.", "st.n.write": "✎ Write notes", "st.n.edit": "Edit", "st.n.cancel": "Cancel",
      "st.n.fromBoard": "Add {n} undiscussed question(s) from the board",
      "st.n.conclusion.ph": "What we concluded, what we learned", "st.n.open.ph": "Unresolved questions, things to look up", "st.n.next.ph": "Papers to read next, things to try in our research",
      "st.blindMsg": "Write first, then read: post your entry to see this.", "st.writeMine": "Write my entry",
      "st.opt.blind": "Write first, then read", "st.opt.blindHint": "Other members' entries stay hidden until you post yours (all visible once the study ends)",
      "st.opt.bring": "Related papers", "st.opt.bringHint": "People pick a paper related to the common one and introduce it at the meeting",
      "st.bring.off": "None", "st.bring.all": "Everyone", "st.bring.presenters": "Presenters",
      "st.blindOn": "🙈 Write first, then read. Post your entry to see the others'.",
      "st.prep": "Preparation", "st.prepDiary": "diary", "st.prepPick": "brought paper",
      "st.common": "Read together", "st.picks": "Brought papers · order", "st.picksHint": "Related papers people bring and introduce at the meeting. Write their diary entries as usual.",
      "st.myPick": "The paper I'll bring", "st.pick.ph": "Search lab papers · or type a new title", "st.pick.why": "How does it connect to the common paper?",
      "st.pick.why.ph": "e.g. same problem, solved with optimisation instead of RL", "st.pick.slides": "📎 Slides (PDF · image)", "st.pick.save": "Post", "st.pick.edit": "Change",
      "st.pick.remove": "Remove", "st.pick.write": "✎ Write its diary entry", "st.pick.none": "Nobody has brought one yet", "st.pick.saved": "Posted the paper you'll bring",
      "st.pick.diary": "diary", "st.pick.noDiary": "no diary yet",
    },
  });

  const view = document.createElement("section");
  view.id = "view-study"; view.className = "view page wide";
  document.querySelector("main").appendChild(view);

  const name = id => esc(UI.personName(id));
  const fmtAt = iso => new Date(iso).toLocaleString(lang === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const dday = st => {
    if (st.closed) return `<span class="ui-pill">${t("st.done")}</span>`;
    if (!st.date) return `<span class="ui-pill">${t("st.noDate")}</span>`;
    const n = Math.round((Date.parse(st.date) - Date.parse(S.today())) / 864e5);
    return `<span class="ui-pill ${n === 0 ? "warn" : n > 0 ? "acc" : ""}">${n === 0 ? t("st.today") : n > 0 ? t("st.dday", { n }) : t("st.after", { n: -n })}</span>`;
  };
  const when = st => [st.date, st.time, st.place].filter(Boolean).map(esc).join(" · ");
  const pdfOf = st => (st.files || []).find(f => f.kind === "pdf") || S.studies.reviews(st).filter(r => !S.studies.hidden(r)).flatMap(r => r.files || []).find(f => f.kind === "pdf");
  const httpUrl = u => (/^https?:\/\//i.test(u || "") ? u : "");
  const back = `<button class="ui-btn text back" onclick="window.LabBack('#/study')">← ${t("d.back")}</button>`;

  // ---------------------------------------------------------------- list
  let tab = "open";
  function card(st) {
    const revs = S.studies.reviews(st), done = new Set(revs.map(r => r.person));
    return `<a class="ui-card st-card ${st.closed ? "closed" : ""}" href="#/study/${st.id}">
      <div class="st-top">${dday(st)}<span class="m">${when(st)}</span>${S.groups.get(st.groupId) ? `<span class="ui-pill">${t("grp.round", { n: S.groups.roundOf(st) })}</span>` : ""}</div>
      <h3>${esc(st.title)}</h3>
      ${st.desc ? `<p class="st-desc">${esc(st.desc.slice(0, 140))}</p>` : ""}
      <div class="st-foot">${UI.avStack(st.members, 6, u => (done.has(u) ? "did" : ""))}
        <span class="m">${st.presenters.length ? `${t("st.presenter")} ${st.presenters.map(name).join(", ")} · ` : ""}${t("st.reviewed", { n: st.members.filter(u => done.has(u)).length, m: st.members.length })} · ${t("st.qs", { n: S.studies.questions.list(st.id).length })}</span></div>
    </a>`;
  }
  function sharedHtml() {
    const list = Object.values(UI.PA).filter(p => p.readers.length > 1)
      .sort((a, b) => b.readers.length - a.readers.length || (b._last || "").localeCompare(a._last || ""));
    return `<div id="shared-list">${list.map(p => `
      <div class="ui-card shared-item">
        <h3 data-open="paper:${p.id}">${esc(p.title)}</h3>
        <div class="pr-meta"><span>${esc(S.paperCitation(p))}</span>${UI.stars(p.rating)}${UI.topicIds(p).map(UI.tag).join("")}
          <a class="ui-btn text" href="#/study/new?paper=${p.id}">📚 ${t("st.candOpen")}</a></div>
        <div class="rev-cols">${p.reviews.map(r => UI.reviewHtml(UI.R[r])).join("")}</div>
      </div>`).join("")}</div>`;
  }
  function listPage(params) {
    if (params.get("tab")) tab = params.get("tab");
    const all = S.studies.list(), open = all.filter(s => !s.closed), past = all.filter(s => s.closed).reverse(), groups = S.groups.list();
    const cands = S.studies.candidates(), gcands = S.guides.studyCandidates();
    view.innerHTML = `
      <div class="page-head row-head"><div><h1>${t("st.title")}</h1><p class="sub">${t("st.sub")}</p></div>
        <div class="btn-row"><a class="ui-btn" href="#/group/new">＋ ${t("grp.new")}</a><a class="ui-btn prominent" href="#/study/new">${t("st.open")}</a></div></div>
      ${groups.length ? `<div class="grp-cards">${groups.map(window.LabGroups.tile).join("")}</div>` : ""}
      <div class="ui-seg page-tabs">${["open", "past", "shared"].map(k => `<a href="#/study?tab=${k}" aria-current="${tab === k ? "page" : "false"}">${t("st.tab." + k)}${k === "open" && open.length ? ` <span class="ui-pill accent">${open.length}</span>` : ""}</a>`).join("")}</div>
      ${tab === "shared" ? sharedHtml() : `
        ${tab === "open" && (cands.length || gcands.length) ? `<div class="ui-card st-cands"><h4>${t("st.cands")}</h4><p class="hint">${t("st.candsHint")}</p>
          ${cands.map(c => { const p = UI.PA[c.paperId]; return p ? `<div class="ui-row ruled cand-row"><span class="t" data-open="paper:${p.id}">${esc(p.title)}</span>
            ${UI.avStack(c.members, 4)}<a class="ui-btn small" href="#/study/new?paper=${p.id}">${t("st.candOpen")}</a></div>` : ""; }).join("")}
          ${gcands.map(({ guide: g, item: it }) => { const p = S.guides.paperOf(it), title = S.guides.titleOf(it);
            return `<div class="ui-row ruled cand-row"><span class="t">${p ? `<span data-open="paper:${p.id}">${esc(title)}</span>` : esc(title)}
              <a class="m" href="#/guide/${g.id}">${t("st.gCand", { g: esc(g.title), n: it.votes.length })}</a></span>
            ${UI.avStack(it.votes, 4)}<a class="ui-btn small" href="#/study/new?${p ? `paper=${p.id}` : `title=${encodeURIComponent(title)}&link=${encodeURIComponent(it.meta?.link || "")}`}">${t("st.candOpen")}</a></div>`; }).join("")}</div>` : ""}
        ${grouped(tab === "open" ? open : past) || `<div class="ui-empty">${t(tab === "open" ? "st.empty" : "st.pastEmpty")}</div>`}`}`;
  }

  // a regular study's sessions together under its name; one-off studies after them
  function grouped(list) {
    if (!list.length) return "";
    const groups = new Map(), solo = [];
    list.forEach(st => { const g = S.groups.get(st.groupId); g ? (groups.get(g) || groups.set(g, []).get(g)).push(st) : solo.push(st); });
    if (!groups.size) return `<div class="st-grid">${solo.map(card).join("")}</div>`;
    return [...groups].map(([g, sts]) => `<section class="st-group"><h4><span class="ui-pill accent">${t("grp.title")}</span><a href="#/group/${encodeURIComponent(g.id)}">${esc(g.title)}</a></h4>
        <div class="st-grid">${sts.map(card).join("")}</div></section>`).join("")
      + (solo.length ? `<section class="st-group"><h4>${t("st.solo")}</h4><div class="st-grid">${solo.map(card).join("")}</div></section>` : "");
  }

  function paperSearch(input, pop, linkInput, onChange) {
    let paperId = null;
    input.oninput = () => {
      paperId = null; onChange?.(null);
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { pop.hidden = true; return; }
      const hits = Object.values(UI.PA).filter(p => p.title.toLowerCase().includes(q)).slice(0, 8);
      pop.hidden = !hits.length;
      pop.innerHTML = hits.map(p => `<div data-id="${p.id}">${esc(p.title)} <span class="muted">${p.readers.map(r => esc(UI.personName(r))).join(", ")}</span></div>`).join("");
    };
    pop.onclick = e => {
      const d = e.target.closest("[data-id]"); if (!d) return;
      const p = UI.PA[d.dataset.id]; paperId = p.id; input.value = p.title; if (linkInput) linkInput.value = p.link || ""; pop.hidden = true; onChange?.(p);
    };
    return { get id() { return paperId; }, set id(v) { paperId = v; } };
  }
  // who brings a related paper: the store keeps false · true (everyone) · "presenters"
  const BRING = { off: false, all: true, presenters: "presenters" };
  const bringSeg = (v, id) => `<div class="ui-seg small" id="${id}" role="group" aria-label="${t("st.opt.bring")}">${Object.entries(BRING).map(([k, x]) =>
    `<button type="button" data-bring="${k}" aria-pressed="${x === (v === "presenters" ? v : !!v)}">${t("st.bring." + k)}</button>`).join("")}</div>`;
  const paintSeg = b => b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  const uploadInto = async (file, err) => {
    try { return await S.files.put(file, file.name); }
    catch (e) { err.textContent = e.message === "file.size" ? t("w.fileSize", { name: file.name }) : t("w.fileType"); return null; }
  };

  // ---------------------------------------------------------------- create
  function newPage(params) {
    const me = S.auth.current();
    const g = S.groups.get(params.get("group"));
    const pre = params.get("paper") ? UI.PA[params.get("paper")] : null;
    const preTitle = pre?.title || params.get("title") || "", preLink = pre?.link || params.get("link") || "";
    const presenter = g ? S.groups.nextPresenter(g) : me.id, invited = new Set(g ? g.members : []);
    let newFiles = [];
    const others = Object.values(UI.P).filter(p => p.id !== me.id);
    view.innerHTML = `${back}
      <div class="page-head"><h1>${g ? t("st.seriesNew", { g: esc(g.title), n: S.groups.sessions(g).length + 1 }) : t("st.new")}</h1><p class="sub">${t("st.countsHint")}</p></div>
      <form class="ui-card write-form st-form" id="st-form" autocomplete="off">
        <label class="fld"><span>${t("st.paper")} *</span>
          <div class="tag-input"><input id="st-title" placeholder="${t("st.paper.ph")}" value="${esc(preTitle)}"><div class="tag-pop ui-popover list" id="st-pop" hidden></div></div>
          <em class="hint" id="st-known"></em></label>
        <label class="fld"><span>${t("st.link")}</span><input id="st-link" value="${esc(preLink)}"></label>
        <div class="row3">
          <label class="fld"><span>${t("st.date")}</span><input id="st-date" type="date" value="${g ? S.groups.nextDate(g) : ""}"></label>
          <label class="fld"><span>${t("st.time")}</span><input id="st-time" type="time" value="${esc(g?.cadence?.time || "")}"></label>
          <label class="fld"><span>${t("st.place")}</span><input id="st-place" placeholder="${t("st.place.ph")}" value="${esc(g?.place || "")}"></label>
        </div>
        <div class="fld"><span>${t("st.presenter")}</span><div class="chips" id="st-presenters">
          ${[UI.P[me.id] || me, ...others].map(p => `<button type="button" class="ui-chip" aria-pressed="${p.id === presenter}" data-u="${p.id}">${UI.avatar(p.id)}${esc(p.name)}</button>`).join("")}</div></div>
        <label class="fld"><span>${t("st.desc")}</span><textarea id="st-desc" rows="4" placeholder="${t("st.desc.ph")}"></textarea></label>
        <div class="st-opts">
          <label class="ui-check"><input type="checkbox" id="st-blind" checked><span><b>${t("st.opt.blind")}</b><em class="hint">${t("st.opt.blindHint")}</em></span></label>
          <div class="fld"><span>${t("st.opt.bring")}</span>${bringSeg(false, "st-bring")}<em class="hint">${t("st.opt.bringHint")}</em></div>
        </div>
        <div class="fld"><span>${t("st.invite")}</span><div class="chips" id="st-invite">
          ${others.map(p => `<button type="button" class="ui-chip" aria-pressed="${invited.has(p.id)}" data-u="${p.id}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</button>`).join("")}</div></div>
        <div class="fld"><span>${t("st.pdf")}</span><div class="drop-btns"><button type="button" class="ui-btn small" id="st-pick">📄 PDF</button><span class="att-list" id="st-files"></span></div>
          <input type="file" id="st-file" accept="application/pdf" hidden></div>
        <p class="err" id="st-err"></p>
        <div class="form-foot"><button class="ui-btn prominent">${t("st.create")}</button></div>
      </form>`;
    const title = $("#st-title", view), known = $("#st-known", view);
    const hint = () => {
      const p = box.id ? UI.PA[box.id] : S.findPaper(title.value);
      known.textContent = title.value.trim() ? (p ? t("st.knownPaper", { n: p.readers.length }) : t("st.newPaper")) : "";
    };
    const box = paperSearch(title, $("#st-pop", view), $("#st-link", view), hint);
    box.id = pre?.id || null; hint();
    $("#st-invite", view).onclick = e => { const c = e.target.closest(".ui-chip"); if (c) c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true"); };
    let bring = false;
    $("#st-bring", view).onclick = e => { const b = e.target.closest("[data-bring]"); if (!b) return; bring = BRING[b.dataset.bring]; paintSeg(b); };
    const presenters = new Set([presenter].filter(u => UI.P[u]));   // a disabled member has no chip, so can't stay selected
    $("#st-presenters", view).onclick = e => { const c = e.target.closest(".ui-chip"); if (!c) return; if (presenters.has(c.dataset.u)) presenters.delete(c.dataset.u); else presenters.add(c.dataset.u); c.setAttribute("aria-pressed", presenters.has(c.dataset.u)); };
    const picker = $("#st-file", view);
    $("#st-pick", view).onclick = () => picker.click();
    picker.onchange = async () => {
      const f = picker.files[0], out = $("#st-files", view), err = $("#st-err", view); picker.value = ""; if (!f) return;
      const meta = await uploadInto(f, err); if (!meta) return;
      newFiles = [meta]; out.innerHTML = `<span class="att pdf">📄 ${esc(f.name)} <span class="m">${UI.kb(f.size)}</span></span>`;
    };
    UI.submitOnce($("#st-form", view), async () => {
      if (!title.value.trim()) return ($("#st-err", view).textContent = t("st.need.title"));
      if (!presenters.size) return ($("#st-err", view).textContent = t("st.needPresenters"));
      const { id } = await S.studies.create({
        title: title.value, paperId: box.id, link: $("#st-link", view).value.trim(), date: $("#st-date", view).value, time: $("#st-time", view).value,
        place: $("#st-place", view).value.trim(), presenters: [...presenters], desc: $("#st-desc", view).value.trim(),
        invite: [...view.querySelectorAll('#st-invite .ui-chip[aria-pressed="true"]')].map(c => c.dataset.u), files: newFiles,
        blind: $("#st-blind", view).checked, bring, groupId: g?.id,
      });
      LabToast(t("st.created")); location.hash = "#/study/" + encodeURIComponent(id);
    }, $("#st-err", view));
  }

  // ---------------------------------------------------------------- detail
  // One study = three phases, one tab each (+ brought papers when that option is on):
  //   준비 (my to-dos, question board, who is ready) → 다이어리 (entries side by side) → 소개 순서 → 정리 (notes)
  let editPick = false, editNotes = false;
  const longDate = st => {
    if (!st.date) return t("st.noDate");
    return [UI.shortDate(st.date), st.time, st.place].filter(Boolean).map(esc).join(" · ");
  };

  // "Regular study · session 3" with the sessions either side
  function series(st) {
    const g = S.groups.get(st.groupId); if (!g) return "";
    const sts = S.groups.sessions(g), i = sts.indexOf(st), prev = sts[i - 1], next = sts[i + 1];
    return `<div class="st-series"><a href="#/group/${encodeURIComponent(g.id)}">👥 ${t("st.series", { g: esc(g.title), n: i + 1 })}</a>
      ${prev ? `<a class="ui-btn text" href="#/study/${prev.id}">${t("st.prevRound", { n: i })}</a>` : ""}${next ? `<a class="ui-btn text" href="#/study/${next.id}">${t("st.nextRound", { n: i + 2 })}</a>` : ""}</div>`;
  }

  function detailPage(id, params) {
    const me = S.auth.current(), st = S.studies.get(id);
    if (!st) { view.innerHTML = `${back}<div class="ui-empty">404</div>`; return; }
    const p = S.studies.paperOf(st), revs = S.studies.reviews(st);
    const byPerson = Object.fromEntries(revs.map(r => [r.person, r]));
    const joined = st.members.includes(me.id), canManage = S.studies.canManage(st), mine = byPerson[me.id];
    const qs = S.studies.questions.list(st.id), pdf = pdfOf(st), notes = st.notes || {};
    const people = [...st.members, ...revs.map(r => r.person).filter(u => !st.members.includes(u))];
    const shownRevs = revs.filter(r => !S.studies.hidden(r));
    const picks = st.bring ? S.studies.picks(st) : [], myPick = st.picks?.[me.id];
    const pickDiary = pk => { const pp = S.studies.pickPaper(pk); return pp ? Object.values(UI.R).find(r => r.paper === pp.id && r.person === pk.uid) : null; };
    const hasNotes = !!(notes.conclusion || notes.open || notes.next);
    const inGuides = p ? S.guides.forPaper(p) : S.guides.list().filter(g => g.items.some(it => it.key && it.key === st.paperKey));
    const guideAdd = it => {  // guides that don't have this paper yet
      const key = S.normTitle(it.title), gs = S.guides.list().filter(g => !g.items.some(x => (it.paperId && S.guides.paperOf(x)?.id === it.paperId) || x.key === key));
      return gs.length ? `<details class="st-manage gd-add-pop"><summary>＋ ${t("st.toGuide")}</summary><div class="menu-pop ui-popover">
        <select data-gsel aria-label="${t("st.toGuide")}">${gs.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join("")}</select>
        <button class="ui-btn small prominent" data-act="toguide" data-pid="${it.paperId || ""}" data-title="${esc(it.title)}" data-link="${esc(it.link || "")}">${t("gd.addBtn")}</button></div></details>` : "";
    };
    const past = st.closed || (st.date && st.date < S.today());
    const tabs = ["prep", "diary", ...(st.bring ? ["picks"] : []), "notes", "materials"];
    let tab = params?.get("tab"); if (!tabs.includes(tab)) tab = past ? "notes" : "prep";
    const link = k => `#/study/${st.id}?tab=${k}`;
    const count = { prep: qs.length ? String(qs.length) : "", diary: `${people.filter(u => byPerson[u]).length}/${people.length}`, picks: picks.length ? String(picks.length) : "", notes: hasNotes ? "✓" : "",
      materials: st.materials.length ? String(st.materials.length) : "" };

    // ---- my to-dos (only for members of an open study)
    const todo = [
      { done: !!mine, label: t("st.todo.diary"), go: mine ? `<button class="ui-btn text" data-open="paper:${mine.paper}">${t("st.todo.view")}</button>` : `<a class="ui-btn small prominent" href="#/write?study=${st.id}">${t("st.todo.go")}</a>` },
      ...(S.studies.brings(st, me.id) ? [{ done: !!myPick, label: t("st.todo.pick"), go: myPick ? `<a class="ui-btn text" href="${link("picks")}">${t("st.todo.view")}</a>` : `<a class="ui-btn small" href="${link("picks")}">${t("st.todo.go")}</a>` }] : []),
      ...(myPick ? [{ done: !!pickDiary(myPick), label: t("st.todo.pickDiary"), go: pickDiary(myPick) ? "" : `<a class="ui-btn small" href="#/write?study=${st.id}&pick=1">${t("st.todo.go")}</a>` }] : []),
      { done: qs.some(q => q.author === me.id), optional: true, label: t("st.todo.q"), go: qs.some(q => q.author === me.id) ? "" : `<a class="ui-btn text" href="${link("prep")}&focus=q">${t("st.todo.go")}</a>` },
    ];
    const allDone = todo.every(x => x.done || x.optional);
    const todoHtml = st.closed ? "" : joined && allDone   // same on every tab so switching tabs doesn't move them
      ? `<div class="st-todo-done">✓ ${t("st.todo.allDone")}</div>`
      : !joined
      ? `<div class="ui-card st-todo join"><span>${t("st.todo.joinFirst")}</span><button class="ui-btn prominent" data-act="join">${t("st.join")}</button></div>`
      : `<div class="ui-card st-todo"><h3>${t("st.todo")}</h3>${todo.map(x => `<div class="ui-row todo ${x.done ? "done" : ""} ${x.optional ? "opt" : ""}">
          <span class="ui-done ${x.done ? "checked" : ""}">${x.done ? "✓" : ""}</span><span class="lbl">${x.label}</span>${x.go}</div>`).join("")}</div>`;

    // ---- tab bodies
    const reviewCard = u => byPerson[u] ? UI.reviewHtml(byPerson[u])
      : `<div class="review st-missing">${UI.avatar(u)} <b>${name(u)}</b> <span class="m">${t("st.notYet")}</span></div>`;
    const prepTab = `<div class="st-two">
        <div class="ui-card st-board"><h3>${t("st.board")}</h3><p class="hint">${t("st.boardHint")}</p>
          ${st.closed ? "" : `<form class="st-q-form" id="st-q-form"><textarea id="st-q" rows="2" placeholder="${t("st.q.ph")}"></textarea><button class="ui-btn small prominent">${t("st.q.add")}</button></form>`}
          <div class="st-qs">${qs.map(q => `<div class="st-q ${q.done ? "done" : ""}" data-q="${q.id}">
              <button class="vote ${q.votes.includes(me.id) ? "on" : ""}" data-act="vote">👍 ${q.votes.length}</button>
              <div><div class="body">${esc(q.body)}</div><div class="m">${UI.avatar(q.author)} ${name(q.author)} · ${LabAgo(q.at)}
                ${q.author === me.id || canManage ? ` · <button class="ui-btn text" data-act="qdone">${q.done ? t("st.q.undo") : t("st.q.done")}</button> · <button class="ui-btn text destructive" data-act="qdel">✕</button>` : ""}</div></div></div>`).join("")
            || `<p class="muted">${t("st.q.empty")}</p>`}</div>
        </div>
        <div class="st-side">
          <div class="ui-card st-prep"><h3>${t("st.prepStatus")}</h3>
            ${st.members.map(u => `<div class="ui-row prep-row" data-open="person:${u}">${UI.avatar(u)}<span class="nm">${name(u)}${st.presenters.includes(u) ? ` <span class="ui-pill accent">${t("st.presenter")}</span>` : ""}</span>
              <span class="ck ${byPerson[u] ? "on" : ""}">${byPerson[u] ? "✓" : "·"} ${t("st.prepDiary")}</span>
              ${S.studies.brings(st, u) ? `<span class="ck ${st.picks?.[u] ? "on" : ""}">${st.picks?.[u] ? "✓" : "·"} ${t("st.prepPick")}</span>` : ""}</div>`).join("")}</div>
          ${p?.abstract ? `<details class="ui-card st-abs"><summary><h3>${t("st.abstract")}</h3></summary><p class="abstract-full">${esc(p.abstract)}</p></details>` : ""}
        </div></div>`;
    // shared materials (slides, links): any member adds a file or a link; the adder, host or an admin removes it
    const materialsTab = `<div class="ui-card st-materials">
      ${st.materials.map(m => `<div class="ui-row two ruled">${UI.avatar(m.by)}
        <span class="grow">${m.kind === "file" ? `<a class="link" data-fid="${esc(m.file.id)}" target="_blank" rel="noopener">${esc(m.title)}</a>` : `<a class="link" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.title)}</a>`}
          <div class="m">${name(m.by)} · ${esc(UI.shortDate(m.at.slice(0, 10)))}</div></span>
        ${m.by === me.id || st.host === me.id || me.role === "admin" ? `<button class="ui-btn small destructive" data-act="materialDelete" data-material="${m.id}">${t("st.delete")}</button>` : ""}</div>`).join("") || `<p class="muted">${t("st.materialEmpty")}</p>`}
      ${joined || me.role === "admin" ? `<form class="inline-form" id="st-material-form">
        <input id="st-material-title" maxlength="80" required placeholder="${t("st.materialTitle")}" aria-label="${t("st.materialTitle")}">
        <input id="st-material-url" type="url" placeholder="${t("st.materialUrl")}" aria-label="${t("st.materialUrl")}">
        <button class="ui-btn small">${t("st.materialAdd")}</button>
        <button type="button" class="ui-btn small" id="st-material-pick">${t("st.materialFile")}</button>
        <input id="st-material-file" type="file" accept="application/pdf,image/*" hidden></form>
        <p class="hint">${t("st.materialHint")}</p><p class="err" id="st-material-err"></p>` : ""}
    </div>`;
    const diaryTab = `
      ${st.blind && !st.closed && !mine ? `<p class="ui-notice warn">${t("st.blindOn")}</p>` : ""}
      ${shownRevs.length > 1 ? `<div class="st-rates">${t("st.ratings")} ${shownRevs.map(r => `<span class="st-rate" title="${name(r.person)}">${UI.avatar(r.person)}${r.rating}</span>`).join("")}</div>` : ""}
      <div class="rev-cols st-cols">${people.map(reviewCard).join("")}</div>`;
    const pickForm = st.closed || (myPick && !editPick) || !joined || !S.studies.brings(st, me.id) ? "" : `<form class="ui-card st-pick-form" id="st-pick-form" autocomplete="off">
        <b>${t("st.myPick")}</b>
        <div class="tag-input"><input id="pk-title" placeholder="${t("st.pick.ph")}" value="${esc(myPick?.title || "")}"><div class="tag-pop ui-popover list" id="pk-pop" hidden></div></div>
        <input id="pk-link" type="hidden" value="${esc(myPick?.link || "")}">
        <input id="pk-why" placeholder="${t("st.pick.why.ph")}" value="${esc(myPick?.why || "")}" aria-label="${t("st.pick.why")}">
        <div class="drop-btns"><button type="button" class="ui-btn small" id="pk-pickfile">${t("st.pick.slides")}</button><span class="att-list" id="pk-files">${(myPick?.files || []).map(f => `<span class="att pdf">📎 ${esc(f.name)}</span>`).join("")}</span>
          <input type="file" id="pk-file" accept="application/pdf,image/*" hidden><span class="spacer"></span>
          ${editPick ? `<button type="button" class="ui-btn small" data-act="pkcancel">${t("st.n.cancel")}</button>` : ""}<button class="ui-btn small prominent">${t("st.pick.save")}</button></div>
        <p class="err" id="pk-err"></p></form>`;
    const picksTab = `<p class="hint tab-hint">${t("st.picksHint")}</p>${pickForm}
      <div class="st-picks">${picks.map((pk, i) => { const pp = S.studies.pickPaper(pk), dr = pickDiary(pk);
        return `<div class="ui-card st-pick" data-pick="${pk.uid}">
          <div class="pk-head"><span class="pk-n">${i + 1}</span>${UI.avatar(pk.uid)}<b>${name(pk.uid)}</b>
            ${dr ? `<span class="ui-pill ok">${t("st.pick.diary")} ✓</span>` : `<span class="ui-pill">${t("st.pick.noDiary")}</span>`}<span class="spacer"></span>
            ${canManage && !st.closed && picks.length > 1 ? `<button class="ui-btn text" data-act="up" title="↑" ${i ? "" : "disabled"}>↑</button><button class="ui-btn text" data-act="down" title="↓" ${i < picks.length - 1 ? "" : "disabled"}>↓</button>` : ""}
            ${pk.uid === me.id && !st.closed ? `<button class="ui-btn text" data-act="pkedit">${t("st.pick.edit")}</button>` : ""}
            ${(pk.uid === me.id || canManage) && !st.closed ? `<button class="ui-btn text destructive" data-act="pkdel">${t("st.pick.remove")}</button>` : ""}</div>
          <div class="pk-title">${pp ? `<a href="#/paper/${pp.id}">${esc(pk.title)}</a>` : httpUrl(pk.link) ? `<a href="${esc(pk.link)}" target="_blank" rel="noopener noreferrer">${esc(pk.title)}</a>` : esc(pk.title)}</div>
          ${pk.why ? `<div class="pk-why">↳ ${esc(pk.why)}</div>` : ""}
          ${(pk.files || []).length ? `<div class="pk-files">${pk.files.map(f => `<a class="rv-pdf" data-fid="${esc(f.id)}" target="_blank" rel="noopener">📎 ${esc(f.name)}</a>`).join("")}</div>` : ""}
          ${pk.uid === me.id && !dr ? `<a class="ui-btn small" href="#/write?study=${st.id}&pick=1">${t("st.pick.write")}</a>` : ""}
          ${guideAdd({ paperId: pp?.id, title: pk.title, link: pk.link })}
          ${dr ? `<details class="pk-diary"><summary>${t("st.pick.diary")} · ${UI.stars(dr.rating)}</summary>${UI.reviewHtml(dr)}</details>` : ""}
        </div>`; }).join("") || `<div class="ui-empty">${t("st.pick.none")}</div>`}</div>`;
    const canWriteNotes = joined || me.role === "admin";
    const draftBanner = S.studies.notesDraft(st.id)
      ? `<p class="ui-notice info">${t("st.n.draft", { name: name(st.notesDraft.by) })} <button class="ui-btn text" data-act="draft">${t("st.n.loadDraft")}</button></p>` : "";
    const discussed = qs.filter(q => q.done), leftover = qs.filter(q => !q.done);
    const notesTab = editNotes ? `
      <div class="ui-card st-notes">${draftBanner}
        ${["conclusion", "open", "next"].map(k => `<label class="fld"><span>${t("st.n." + k)}</span><textarea id="st-n-${k}" rows="${k === "conclusion" ? 6 : 3}" placeholder="${t("st.n." + k + ".ph")}">${esc(notes[k] || "")}</textarea></label>`).join("")}
        ${leftover.length ? `<button type="button" class="ui-btn text" data-act="fromboard">＋ ${t("st.n.fromBoard", { n: leftover.length })}</button>` : ""}
        <div class="form-foot"><span></span><button type="button" class="ui-btn" data-act="ncancel">${t("st.n.cancel")}</button><button class="ui-btn prominent" data-act="notes">${t("st.n.save")}</button></div>
      </div>` : `
      ${draftBanner ? `<div class="ui-card">${draftBanner}</div>` : ""}
      ${hasNotes ? `<div class="ui-card st-notes-view">
          ${["conclusion", "open", "next"].filter(k => notes[k]).map(k => `<section><h4>${t("st.n." + k)}</h4><div class="nv">${esc(notes[k])}</div></section>`).join("")}
          <div class="form-foot"><span class="muted">${t("st.n.saved", { name: name(notes.by), at: fmtAt(notes.at) })}</span>
            ${canWriteNotes ? `<button class="ui-btn" data-act="nedit">${t("st.n.edit")}</button>` : ""}</div></div>`
        : `<div class="ui-card st-notes-empty"><p>${t("st.n.empty")}</p>${canWriteNotes ? `<button class="ui-btn prominent" data-act="nedit">${t("st.n.write")}</button>` : ""}</div>`}
      ${discussed.length ? `<div class="ui-card st-discussed"><h4>${t("st.discussed")} · ${discussed.length}</h4>${discussed.map(q => `<div class="ui-row ruled dq">👍 ${q.votes.length} · ${esc(q.body)}</div>`).join("")}</div>` : ""}`;

    view.innerHTML = `
      <a class="ui-btn text back" href="#/study">← ${t("st.title")}</a>
      <div class="st-hero">${series(st)}
        <div class="st-top">${dday(st)}<span>${longDate(st)}</span>${st.presenters.length ? `<span class="m">${t("st.presenter")} <b>${st.presenters.map(name).join(", ")}</b></span>` : ""}
          ${canManage ? `<details class="st-manage"><summary>⋯ ${t("st.manage")}</summary><div class="menu-pop ui-popover">
            ${st.closed ? "" : `<label class="ui-check"><input type="checkbox" data-opt="blind" ${st.blind ? "checked" : ""}><span>${t("st.opt.blind")}</span></label>
            <span class="ui-label">${t("st.opt.bring")}</span>${bringSeg(st.bring, "st-bring-edit")}<hr>`}
            <button class="ui-btn text" data-act="editinfo">${t("st.editInfo")}</button>
            <button class="ui-btn text" data-act="close">${st.closed ? t("st.reopen") : t("st.close")}</button>
            <button class="ui-btn text destructive" data-act="delete">${t("st.delete")}</button></div></details>` : ""}</div>
        <h1>${p ? `<a href="#/paper/${p.id}">${esc(st.title)}</a>` : esc(st.title)}</h1>
        <div class="st-meta">${p ? `<span>${esc(S.paperCitation(p))}</span>` : ""}
          ${pdf ? `<a class="ui-btn small" data-fid="${esc(pdf.id)}" target="_blank" rel="noopener">${t("d.pdf")}</a>` : ""}
          ${httpUrl(st.link) ? `<a class="ui-btn small" href="${esc(st.link)}" target="_blank" rel="noopener noreferrer">🔗 ${t("w.link")}</a>` : ""}
          ${UI.avStack(st.members, 6)}<span class="m">${t("st.members", { n: st.members.length })}</span>
          ${joined && st.host !== me.id && !st.presenters.includes(me.id) && !st.closed ? `<button class="ui-btn text" data-act="leave">${t("st.leave")}</button>` : ""}
          ${inGuides.map(g => `<a class="ui-pill" href="#/guide/${g.id}">📚 ${esc(g.title)}</a>`).join("")}${guideAdd({ paperId: p?.id, title: st.title, link: st.link })}</div>
        ${st.desc ? `<p class="st-desc full">${esc(st.desc)}</p>` : ""}
      </div>
      ${todoHtml}
      <div class="ui-seg page-tabs st-tabs">${tabs.map(k => `<a href="${link(k)}" aria-current="${tab === k ? "page" : "false"}">${t("st.tab." + k)}${count[k] ? ` <span class="cnt">${count[k]}</span>` : ""}</a>`).join("")}</div>
      <div class="st-tab">${{ prep: prepTab, diary: diaryTab, picks: picksTab, notes: notesTab, materials: materialsTab }[tab]}</div>`;
    wireDetail(st, params);
  }

  function wireDetail(st, params) {
    const rerender = () => detailPage(st.id, params);
    const mf = $("#st-material-form", view);
    if (mf) {
      const title = $("#st-material-title", view), url = $("#st-material-url", view), picker = $("#st-material-file", view), err = $("#st-material-err", view);
      $("#st-material-pick", view).onclick = () => { if (!title.reportValidity()) return; picker.click(); };
      picker.onchange = async () => {
        const f = picker.files[0]; picker.value = ""; if (!f) return;
        const file = await uploadInto(f, err); if (!file) return;
        try { await S.studies.addMaterial(st.id, { kind: "file", title: title.value, file }); rerender(); }
        catch (e) { await S.files.remove(file.id); err.textContent = t("st.materialInvalid"); }
      };
      UI.submitOnce(mf, async () => {
        if (!httpUrl(url.value.trim())) { err.textContent = t("st.materialInvalid"); return; }
        await S.studies.addMaterial(st.id, { kind: "link", title: title.value, url: url.value }); rerender();
      }, err);
    }
    view.querySelectorAll("[data-opt]").forEach(el => (el.onchange = async () => { await S.studies.update(st.id, { [el.dataset.opt]: el.checked }); rerender(); }));
    const bringEdit = $("#st-bring-edit", view);
    if (bringEdit) bringEdit.onclick = async e => { const b = e.target.closest("[data-bring]"); if (b) { await S.studies.update(st.id, { bring: BRING[b.dataset.bring] }); rerender(); } };
    const pf = $("#st-pick-form", view);
    if (pf) {
      const me = S.auth.current(), box = paperSearch($("#pk-title", view), $("#pk-pop", view), $("#pk-link", view));
      box.id = st.picks?.[me.id]?.paperId || null;
      const pickFiles = [...(st.picks?.[me.id]?.files || [])];
      const picker = $("#pk-file", view);
      $("#pk-pickfile", view).onclick = () => picker.click();
      picker.onchange = async () => {
        const f = picker.files[0], out = $("#pk-files", view); picker.value = ""; if (!f) return;
        const meta = await uploadInto(f, $("#pk-err", view)); if (!meta) return;
        pickFiles.push(meta); out.insertAdjacentHTML("beforeend", `<span class="att pdf">📎 ${esc(f.name)}</span>`);
      };
      UI.submitOnce(pf, async () => {
        const title = $("#pk-title", view).value.trim(); if (!title) return ($("#pk-err", view).textContent = t("st.need.title"));
        await S.studies.setPick(st.id, { title, paperId: box.id, link: $("#pk-link", view).value, why: $("#pk-why", view).value.trim(), files: pickFiles });
        editPick = false; LabToast(t("st.pick.saved")); rerender();
      }, $("#pk-err", view));
    }
    view.querySelectorAll("[data-act]").forEach(el => (el.onclick = async () => {
      const act = el.dataset.act, q = el.closest("[data-q]")?.dataset.q, pu = el.closest("[data-pick]")?.dataset.pick;
      if (act === "materialDelete") {
        if (!(await LabConfirm(t("st.materialDelete"), { message: t("st.materialDeleteMsg"), ok: t("st.delete"), destructive: true }))) return;
        await S.studies.removeMaterial(st.id, el.dataset.material); return rerender();
      }
      if (act === "pkedit") { editPick = true; return rerender(); }
      if (act === "toguide") {
        const gid = el.closest(".menu-pop").querySelector("[data-gsel]").value;
        await S.guides.addItem(gid, { paperId: el.dataset.pid || null, title: el.dataset.title, link: el.dataset.link });
        LabToast(t("st.toGuided")); return rerender();
      }
      if (act === "pkcancel") { editPick = false; return rerender(); }
      if (act === "pkdel") { await S.studies.removePick(st.id, pu); return rerender(); }
      if (act === "up" || act === "down") { await S.studies.movePick(st.id, pu, act === "up" ? -1 : 1); return rerender(); }
      if (act === "nedit") { editNotes = true; return rerender(); }
      if (act === "editinfo") return editInfo(st, rerender);
      if (act === "ncancel") { editNotes = false; return rerender(); }
      if (act === "fromboard") {
        const box = $("#st-n-open", view), add = S.studies.questions.list(st.id).filter(x => !x.done).map(x => "- " + x.body).join("\n");
        box.value = [box.value.trim(), add].filter(Boolean).join("\n"); el.remove(); return;
      }
      if (act === "draft") {
        const d = S.studies.notesDraft(st.id); if (!d) return;
        if (!editNotes) { editNotes = true; rerender(); }
        ["conclusion", "open", "next"].forEach(k => ($("#st-n-" + k, view).value = d[k] || ""));
        view.querySelector(".restored.mcp")?.remove(); return;
      }
      if (act === "notes") {
        await S.studies.saveNotes(st.id, Object.fromEntries(["conclusion", "open", "next"].map(k => [k, $("#st-n-" + k, view).value.trim()])));
        editNotes = false; LabToast(t("st.n.savedToast")); return rerender();
      }
      if (act === "join") { await S.studies.join(st.id); LabToast(t("st.joined")); }
      if (act === "leave") await S.studies.leave(st.id);
      if (act === "close") { if (!st.closed && !(await LabConfirm(t("st.confirmClose"), { ok: t("st.close") }))) return; await S.studies.close(st.id, !st.closed); }
      if (act === "delete") { if (!(await LabConfirm(t("st.confirmDelete"), { ok: t("st.delete"), destructive: true }))) return; await S.studies.remove(st.id); location.hash = "#/study"; return; }
      if (act === "vote") await S.studies.questions.vote(q);
      if (act === "qdone") { const x = S.studies.questions.list(st.id).find(y => y.id === q); await S.studies.questions.setDone(q, !x.done); }
      if (act === "qdel") await S.studies.questions.remove(q);
      rerender();
    }));
    const f = $("#st-q-form", view);
    if (f) UI.submitOnce(f, async () => {
      const body = $("#st-q", view).value.trim(); if (!body) return;
      await S.studies.questions.add(st.id, body); rerender();
    });
    if (params?.get("focus") === "q") $("#st-q", view)?.focus();
  }

  let lastId = null;
  function editInfo(st, done) {
    const others = Object.values(UI.P);
    const m = LabModal(`<h3>${t("st.editInfo")}</h3>
      <div class="row3"><label class="fld"><span>${t("st.date")}</span><input id="ei-date" type="date" value="${esc(st.date)}"></label>
        <label class="fld"><span>${t("st.time")}</span><input id="ei-time" type="time" value="${esc(st.time)}"></label>
        <label class="fld"><span>${t("st.place")}</span><input id="ei-place" value="${esc(st.place)}"></label></div>
      <div class="fld"><span>${t("st.presenter")}</span><div class="chips" id="ei-presenters">${others.map(p => `<button type="button" class="ui-chip" aria-pressed="${st.presenters.includes(p.id)}" data-u="${p.id}">${UI.avatar(p.id)}${esc(p.name)}</button>`).join("")}</div><p class="err" id="ei-err"></p></div>
      <label class="fld"><span>${t("st.desc")}</span><textarea id="ei-desc" rows="3">${esc(st.desc)}</textarea></label>
      <label class="fld"><span>${t("st.link")}</span><input id="ei-link" value="${esc(st.link)}"></label>
      <div class="form-foot"><span></span><button class="ui-btn" data-close>${t("st.n.cancel")}</button><button class="ui-btn prominent" id="ei-save">${t("st.save")}</button></div>`, { wide: true });
    m.querySelector(".modal").classList.add("write-form");
    const presenters = new Set(st.presenters.filter(u => UI.P[u]));
    m.querySelector("#ei-presenters").onclick = e => { const c = e.target.closest(".ui-chip"); if (!c) return; if (presenters.has(c.dataset.u)) presenters.delete(c.dataset.u); else presenters.add(c.dataset.u); c.setAttribute("aria-pressed", presenters.has(c.dataset.u)); };
    m.querySelector("#ei-save").onclick = async () => {
      const v = id => m.querySelector(id).value.trim();
      if (!presenters.size) { m.querySelector("#ei-err").textContent = t("st.needPresenters"); return; }
      await S.studies.update(st.id, { date: v("#ei-date"), time: v("#ei-time"), place: v("#ei-place"), presenters: [...presenters], desc: v("#ei-desc"), link: v("#ei-link") });
      m.remove(); LabToast(t("st.saved")); done();
    };
  }

  function render(params, arg) {
    if (!S.auth.current()) return;
    S.studies.remind(); window.LabUpdateBell?.();
    if (arg === "new") newPage(params);
    else if (arg) { if (arg !== lastId) { editPick = false; editNotes = false; lastId = arg; } detailPage(arg, params); }
    else listPage(params);
  }

  // a question / notes draft from someone's AI (MCP) just arrived → show it without a reload
  let last = null;
  window.addEventListener("lab:mcp", () => {
    if (UI.currentView() !== "study" || !last || last[1] === "new") return;
    const typing = editNotes || editPick || [...view.querySelectorAll("textarea, input:not([type=hidden]):not([type=checkbox]):not([type=file])")].some(el => el.value.trim() && !el.readOnly && el.id !== "st-title");
    if (!typing) render(...last);
  });

  (window.LabPages ||= {}).study = { render: (params, arg) => { last = [params, arg]; render(params, arg); } };
})();
