/* #/home — the lab feed: new diary entries and the conversations on them, newest first.
 *   tabs: all · my fields (papers near my interests) · questions · read together
 *   side: my progress, questions waiting for an answer, papers read together recently, who wrote this week
 */
(() => {
  const { t, lang } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  I18N.extend({
    ko: {
      "h.compose": "이번 주 논문 다이어리를 써볼까요?", "h.reading": "읽는 중 {a}편 · 다 읽고 정리 전 {b}편", "h.composeBtn": "✎ 다이어리 쓰기", "h.progress": "{term} · {n}/{target}편",
      "h.progressExempt": "{term} · {n}편 (작성 의무 없음)", "h.weekDone": "이번 주 작성 ✓", "h.weekTodo": "이번 주 아직 안 썼어요",
      "h.tab.all": "전체", "h.tab.mine": "내 관심 분야", "h.tab.q": "질문", "h.tab.shared": "함께 읽은 논문",
      "h.posted": "{t} 게시", "h.alsoRead": "{names} 님도 읽은 논문",
      "h.act.comment": "{a} 님이 {b} 님의 다이어리에 댓글을 남겼어요", "h.act.question": "{a} 님이 {b} 님에게 질문했어요",
      "h.act.idea": "{a} 님이 {b} 님의 다이어리에 아이디어를 남겼어요", "h.act.reply": "{a} 님이 답글을 남겼어요",
      "h.more": "더 보기", "h.empty": "아직 표시할 활동이 없어요", "h.mineEmpty": "다이어리를 몇 편 쓰면 관심 분야를 알아서 골라줘요",
      "h.openQ": "답을 기다리는 질문", "h.noOpenQ": "열린 질문이 없어요", "h.together": "최근 함께 읽은 논문", "h.thisWeek": "이번 주 다이어리",
      "h.nobodyYet": "아직 아무도 안 썼어요", "h.studyOpened": "{a} 님이 논문 스터디를 열었어요", "h.studies": "다가오는 스터디", "h.noStudies": "열린 스터디가 없어요", "h.openStudy": "스터디 열기", "h.resolved": "해결됨", "h.ago.now": "방금", "h.ago.m": "{n}분 전", "h.ago.h": "{n}시간 전", "h.ago.d": "{n}일 전",
    },
    en: {
      "h.compose": "Write this week's paper diary?", "h.reading": "Reading {a} · read, not written up {b}", "h.composeBtn": "✎ Write diary", "h.progress": "{term} · {n}/{target}",
      "h.progressExempt": "{term} · {n} (no quota)", "h.weekDone": "This week done ✓", "h.weekTodo": "Nothing yet this week",
      "h.tab.all": "All", "h.tab.mine": "My fields", "h.tab.q": "Questions", "h.tab.shared": "Read together",
      "h.posted": "posted {t}", "h.alsoRead": "also read by {names}",
      "h.act.comment": "{a} commented on {b}'s review", "h.act.question": "{a} asked {b} a question",
      "h.act.idea": "{a} left an idea on {b}'s review", "h.act.reply": "{a} replied",
      "h.more": "Show more", "h.empty": "Nothing to show yet", "h.mineEmpty": "Write a few entries and we'll pick your fields",
      "h.openQ": "Questions waiting for an answer", "h.noOpenQ": "No open questions", "h.together": "Recently read together", "h.thisWeek": "This week's diaries",
      "h.nobodyYet": "Nobody yet", "h.studyOpened": "{a} opened a paper study", "h.studies": "Upcoming studies", "h.noStudies": "No open studies", "h.openStudy": "Open a study", "h.resolved": "resolved", "h.ago.now": "just now", "h.ago.m": "{n}m ago", "h.ago.h": "{n}h ago", "h.ago.d": "{n}d ago",
    },
  });

  const view = document.createElement("section");
  view.id = "view-home"; view.className = "view page";
  document.querySelector("main").appendChild(view);

  const PAGE = 25;
  let tab = "all", shown = PAGE;

  const name = id => esc(UI.P[id]?.name || id);
  const ago = iso => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
    if (m < 1) return t("h.ago.now");
    if (m < 60) return t("h.ago.m", { n: m });
    if (m < 1440) return t("h.ago.h", { n: Math.round(m / 60) });
    if (m < 1440 * 7) return t("h.ago.d", { n: Math.round(m / 1440) });
    return UI.localDay(iso);
  };
  // when a review entered the feed: posting time if we have it, else its diary date (imported entries)
  const reviewTime = r => r.createdAt || `${r.date}T12:00:00`;
  const mondayOf = d => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return UI.localDay(x.toISOString()); };

  function myFields(me) {
    let topics = UI.P[me.id]?.topics || {};
    if (!Object.keys(topics).length) {
      topics = {};
      Object.values(UI.R).filter(r => r.person === me.id).forEach(r => UI.PA[r.paper] && UI.topicIds(UI.PA[r.paper]).forEach(x => (topics[x] = (topics[x] || 0) + 1)));
    }
    return new Set(Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k));
  }

  function items(me) {
    const reviews = Object.values(UI.R).filter(r => UI.PA[r.paper]);
    const comments = S.comments.recent(400).filter(c => UI.R[c.reviewId] && !S.studies.hidden(UI.R[c.reviewId]));
    const rv = r => ({ kind: "review", at: reviewTime(r), r });
    const cm = c => ({ kind: "comment", at: c.at, c });
    if (tab === "mine") {
      const f = myFields(me);
      return reviews.filter(r => r.person !== me.id && UI.topicIds(UI.PA[r.paper]).some(x => f.has(x))).map(rv);
    }
    if (tab === "q") return comments.filter(c => c.kind === "question" && !c.parent).map(cm);
    if (tab === "shared") return reviews.filter(r => UI.PA[r.paper].readers.length > 1).map(rv);
    const studies = S.studies.list().map(st => ({ kind: "study", at: st.createdAt, st }));
    return [...reviews.map(rv), ...comments.map(cm), ...studies];
  }

  function reviewItem(r, me) {
    const p = UI.PA[r.paper];
    const others = p.readers.filter(x => x !== r.person);
    // the review card already shows who wrote it; the line above only adds context (when it was posted, who else read it)
    const ctx = [r.createdAt ? t("h.posted", { t: ago(r.createdAt) }) : "",
      others.length ? `${others.slice(0, 3).map(id => UI.avatar(id)).join("")} ${t("h.alsoRead", { names: others.slice(0, 3).map(name).join(", ") + (others.length > 3 ? " …" : "") })}` : ""].filter(Boolean);
    return `<article class="feed-item">
      ${ctx.length ? `<div class="feed-ctx">${ctx.join(`<span class="m">·</span>`)}</div>` : ""}
      ${UI.reviewHtml(r, { title: true })}
    </article>`;
  }
  function commentItem(c) {
    const r = UI.R[c.reviewId], p = UI.PA[r.paper];
    const key = c.parent ? "h.act.reply" : `h.act.${["question", "idea"].includes(c.kind) ? c.kind : "comment"}`;
    return `<article class="feed-item act ${c.kind}" data-review="${r.id}" data-paper="${r.paper}" data-comment="${c.id}">
      <div class="feed-ctx">${UI.avatar(c.author)}<span>${t(key, { a: `<b>${name(c.author)}</b>`, b: `<b>${name(r.person)}</b>` })}</span>
        <span class="m">· ${ago(c.at)}</span>${c.resolved ? `<span class="pill ok">${t("h.resolved")}</span>` : ""}</div>
      <div class="act-body">${c.kind === "question" ? "❓ " : c.kind === "idea" ? "💡 " : ""}${esc(c.body)}</div>
      <div class="act-paper">${esc(p.title)}</div>
    </article>`;
  }

  function studyItem(st, me) {
    return `<article class="feed-item act study" data-study="${st.id}">
      <div class="feed-ctx">${UI.avatar(st.host)}<span>${t("h.studyOpened", { a: `<b>${name(st.host)}</b>` })}</span><span class="m">· ${ago(st.createdAt)}</span></div>
      <div class="act-body">📚 <b>${esc(st.title)}</b></div>
      <div class="act-paper">${[st.date, st.time, st.place].filter(Boolean).map(esc).join(" · ")}${st.members.length ? ` · ${UI.avStack(st.members, 5)}` : ""}</div>
    </article>`;
  }

  function side(me) {
    const term = S.terms.current();
    const mine = Object.values(UI.R).filter(r => r.person === me.id);
    const inTerm = mine.filter(r => r.date >= term.start && r.date <= term.end).length;
    const q = UI.P[me.id] ? S.quota(me.id, term) : { exempt: true };
    const wk = mondayOf(S.today());
    const weekDone = mine.some(r => mondayOf(r.date) === wk);
    const writers = {};
    Object.values(UI.R).forEach(r => { if (mondayOf(r.date) === wk) writers[r.person] = (writers[r.person] || 0) + 1; });
    const recent = S.comments.recent(400), answered = new Set(recent.map(x => x.parent).filter(Boolean));
    const openQ = recent.filter(c => c.kind === "question" && !c.parent && !c.resolved && UI.R[c.reviewId] && !answered.has(c.id)).slice(0, 5);
    const together = Object.values(UI.PA).filter(p => p.readers.length > 1).sort((a, b) => (b._last || "").localeCompare(a._last || "")).slice(0, 5);
    return `
      <div class="card compose">
        <div class="compose-row">${UI.avatar(me.id, true)}<div><b>${t("h.compose")}</b>
          <div class="muted">${q.exempt ? t("h.progressExempt", { term: esc(term.label), n: inTerm }) : t("h.progress", { term: esc(term.label), n: inTerm, target: q.target })}
            · <span class="${weekDone ? "wk-ok" : "wk-todo"}">${t(weekDone ? "h.weekDone" : "h.weekTodo")}</span></div>
          ${(() => { const rl = S.reading.list().filter(x => !x.written), a = rl.filter(x => x.status === "reading").length, b = rl.filter(x => x.status === "read").length;
            return a || b ? `<a class="rl-home" href="#/reading">📚 ${t("h.reading", { a, b })}</a>` : ""; })()}</div></div>
        <a class="btn primary wide" href="#/write">${t("h.composeBtn")}</a>
      </div>
      <div class="card"><h4>${t("h.studies")}</h4>
        ${S.studies.list().filter(st => !st.closed).sort((a, b) => ((a.date && a.date >= S.today()) ? 0 : 1) - ((b.date && b.date >= S.today()) ? 0 : 1) || (a.date || "9").localeCompare(b.date || "9")).slice(0, 4).map(st => `<a class="side-st" href="#/study/${st.id}"><b>${esc(st.title.slice(0, 60))}</b>
          <span class="m">${[st.date, st.time].filter(Boolean).join(" ") || "—"} · ${st.members.length}${lang === "ko" ? "명" : ""}${st.members.includes(me.id) ? " ✓" : ""}</span></a>`).join("")
          || `<p class="muted">${t("h.noStudies")}</p>`}
        <a class="link-btn" href="#/study/new">＋ ${t("h.openStudy")}</a></div>
      <div class="card"><h4>${t("h.openQ")}</h4>
        ${openQ.map(c => { const r = UI.R[c.reviewId]; return `<div class="side-q" data-review="${r.id}" data-paper="${r.paper}" data-comment="${c.id}">
          ${UI.avatar(c.author)}<div><div class="q">${esc(c.body.slice(0, 90))}</div><div class="m">→ ${name(r.person)} · ${esc(UI.PA[r.paper].title.slice(0, 50))}</div></div></div>`; }).join("")
          || `<p class="muted">${t("h.noOpenQ")}</p>`}</div>
      <div class="card"><h4>${t("h.together")}</h4><div class="mini-list">${together.map(p => UI.miniPaper(p)).join("")}</div></div>
      <div class="card week"><h4>${t("h.thisWeek")}</h4>
        <div class="week-writers">${Object.entries(writers).map(([id, n]) => `<span class="ww" data-open="person:${id}">${UI.avatar(id)}${name(id)}${n > 1 ? ` <span class="m">×${n}</span>` : ""}</span>`).join("")
          || `<p class="muted">${t("h.nobodyYet")}</p>`}</div></div>`;
  }

  function render() {
    const me = S.auth.current(); if (!me) return;
    S.studies.remind(); window.LabUpdateBell?.();
    const list = items(me).sort((a, b) => b.at.localeCompare(a.at));
    view.innerHTML = `
      <div class="home-grid">
        <div class="feed-col">
          <div class="feed-tabs-row"><div class="tabs feed-tabs">${["all", "mine", "q", "shared"].map(k => `<a href="javascript:void 0" data-tab="${k}" class="${tab === k ? "on" : ""}">${t("h.tab." + k)}</a>`).join("")}</div></div>
          <div class="feed" id="h-feed">${list.slice(0, shown).map(x => (x.kind === "review" ? reviewItem(x.r, me) : x.kind === "study" ? studyItem(x.st, me) : commentItem(x.c))).join("")
            || `<div class="empty">${t(tab === "mine" ? "h.mineEmpty" : "h.empty")}</div>`}</div>
          ${list.length > shown ? `<button class="more" id="h-more">${t("h.more")} (${list.length - shown})</button>` : ""}
        </div>
        <aside class="home-side">${side(me)}</aside>
      </div>`;
    view.querySelectorAll("[data-tab]").forEach(a => (a.onclick = () => { tab = a.dataset.tab; shown = PAGE; render(); }));
    $("#h-more", view)?.addEventListener("click", () => { shown += PAGE; render(); });
    // activity rows and side questions open the review + its thread
    view.querySelectorAll(".feed-item.act, .side-q").forEach(el => (el.onclick = e => {
      if (e.target.closest("[data-open]")) return;
      if (el.dataset.study) { location.hash = "#/study/" + el.dataset.study; return; }
      window.LabOpenReview?.(el.dataset.paper, el.dataset.review, el.dataset.comment);
    }));
  }

  (window.LabPages ||= {}).home = { render };
})();
