/* Login gate, header user menu, notifications bell, toasts. Talks only to window.Store. */
(() => {
  const { t, lang } = window.I18N, UI = window.LabUI, S = window.Store;
  const $ = s => document.querySelector(s), esc = UI.esc;

  I18N.extend({
    ko: {
      "a.title": "연구실 Paper Diary", "a.id": "이름", "a.pw": "비밀번호", "a.login": "로그인", "a.fail": "이름 또는 비밀번호가 맞지 않아요",
      "a.mock": "데모 모드 — 계정과 데이터가 이 브라우저에만 저장돼요. 계정은 관리자가 발급해요.",
      "a.changeTitle": "새 비밀번호 설정", "a.changeSub": "처음 로그인했거나 비밀번호가 초기화됐어요. 본인만 아는 비밀번호로 바꿔주세요.",
      "a.old": "현재(초기) 비밀번호", "a.new": "새 비밀번호 (6자 이상)", "a.new2": "새 비밀번호 확인", "a.save": "저장", "a.mismatch": "새 비밀번호가 서로 달라요",
      "a.pwWrong": "현재 비밀번호가 맞지 않아요", "a.pwShort": "6자 이상으로 해주세요", "a.cancel": "취소",
      "a.demoPick": "데모 계정으로 둘러보기", "a.demoHint": "가상의 연구실 데이터예요. 아무 멤버나 골라 들어가 보세요 — 바꾼 내용은 이 브라우저에만 저장돼요.",
      "a.demoAdmin": "관리자", "a.orPw": "이름·비밀번호로 로그인",
      "m.theme": "화면", "m.lang": "언어", "m.auto": "자동", "m.light": "라이트", "m.dark": "다크", "c.cancel": "취소", "c.ok": "확인", "m.write": "다이어리 쓰기", "m.reading": "읽을 목록", "m.me": "내 페이지", "m.pw": "비밀번호 변경", "m.admin": "관리자", "m.logout": "로그아웃",
      "n.title": "알림", "n.empty": "새 알림이 없어요", "n.readAll": "모두 읽음",
      "n.curation": "이번 달 태그·지도 정리할 때예요 — 비슷한 태그 합치기, 지도 영역 이름 확인 (내 AI에게 시켜도 돼요)",
      "n.comment": "{a} 님이 내 다이어리에 댓글을 남겼어요", "n.question": "{a} 님이 내 다이어리에 질문했어요", "n.idea": "{a} 님이 내 다이어리에 아이디어를 남겼어요",
      "n.reply": "{a} 님이 내 댓글에 답글을 남겼어요", "n.mention": "{a} 님이 나를 언급했어요", "n.like": "{a} 님이 내 다이어리를 좋아해요",
      "n.want": "{a} 님이 내 다이어리를 보고 읽을 목록에 담았어요", "n.sameRead": "{a} 님도 내가 읽은 논문을 읽었어요",
      "nav.me": "내 페이지", "n.mcpDraft": "내 AI(MCP)가 다이어리 초안을 만들었어요",
      "n.studyInvite": "{a} 님이 논문 스터디에 초대했어요", "n.studyJoin": "{a} 님이 내 스터디에 참가했어요", "n.studyQuestion": "{a} 님이 스터디에 질문을 올렸어요",
      "n.studyClosed": "{a} 님이 스터디를 마쳤어요 — 정리 노트를 확인해보세요", "n.studyTomorrow": "내일 논문 스터디가 있어요", "n.studyToday": "오늘 논문 스터디가 있어요", "n.studyTomorrowTodo": "내일 스터디예요 — 아직 다이어리(또는 가져올 논문)를 안 올렸어요", "n.studyTodayTodo": "오늘 스터디예요 — 아직 다이어리(또는 가져올 논문)를 안 올렸어요", "n.studyNotesDraft": "내 AI(MCP)가 스터디 정리 초안을 만들었어요", "n.guideItem": "{a} 님이 가이드에 논문을 추가했어요", "n.guideSession": "다음 모임 발표 차례예요 — 모임을 만들어 주세요", "n.guideJoin": "{a} 님이 모임에 참여했어요",
      "tm.all": "모든 학기", "tm.title": "볼 학기", "tm.hint": "여러 학기를 함께 볼 수 있어요. 그래프·사람·논문 목록에 적용돼요.", "tm.apply": "적용",
      "mcp.applied": "AI(MCP) 요청 {n}건이 반영됐어요", "mcp.reload": "새로고침해서 보기",
      "sync.error": "서버에 저장하지 못했어요 — scripts/serve.py가 켜져 있는지 확인해 주세요. 다시 연결되면 자동으로 보내요.",
    },
    en: {
      "a.title": "Lab Paper Diary", "a.id": "Name", "a.pw": "Password", "a.login": "Sign in", "a.fail": "Wrong name or password",
      "a.mock": "Demo mode — accounts and data are stored in this browser only. Accounts are issued by an admin.",
      "a.changeTitle": "Set a new password", "a.changeSub": "This is your first sign-in or your password was reset. Choose a password only you know.",
      "a.old": "Current (initial) password", "a.new": "New password (6+ chars)", "a.new2": "Confirm new password", "a.save": "Save", "a.mismatch": "Passwords don't match",
      "a.pwWrong": "Current password is wrong", "a.pwShort": "Use at least 6 characters", "a.cancel": "Cancel",
      "a.demoPick": "Explore with a demo account", "a.demoHint": "A fictional lab. Pick any member to sign in — your changes stay in this browser only.",
      "a.demoAdmin": "Admin", "a.orPw": "Sign in with name & password",
      "m.theme": "Appearance", "m.lang": "Language", "m.auto": "Auto", "m.light": "Light", "m.dark": "Dark", "c.cancel": "Cancel", "c.ok": "OK", "m.write": "Write diary", "m.reading": "Reading list", "m.me": "My page", "m.pw": "Change password", "m.admin": "Admin", "m.logout": "Sign out",
      "n.title": "Notifications", "n.empty": "No new notifications", "n.readAll": "Mark all read",
      "n.curation": "Time for this month's tidy-up — merge similar tags, check the map's region names (or ask your AI)",
      "n.comment": "{a} commented on your review", "n.question": "{a} asked a question on your review", "n.idea": "{a} left an idea on your review",
      "n.reply": "{a} replied to your comment", "n.mention": "{a} mentioned you", "n.like": "{a} liked your review",
      "n.want": "{a} added a paper from your review to their reading list", "n.sameRead": "{a} also read a paper you reviewed",
      "nav.me": "My page", "n.mcpDraft": "Your AI (MCP) drafted a diary entry",
      "n.studyInvite": "{a} invited you to a paper study", "n.studyJoin": "{a} joined your study", "n.studyQuestion": "{a} posted a question to a study",
      "n.studyClosed": "{a} finished a study — see the notes", "n.studyTomorrow": "Paper study tomorrow", "n.studyToday": "Paper study today", "n.studyTomorrowTodo": "Study tomorrow — your diary (or brought paper) isn't up yet", "n.studyTodayTodo": "Study today — your diary (or brought paper) isn't up yet", "n.studyNotesDraft": "Your AI (MCP) drafted study notes", "n.guideItem": "{a} added a paper to a guide", "n.guideSession": "You present next — set up the next session", "n.guideJoin": "{a} joined your reading group",
      "tm.all": "All terms", "tm.title": "Terms to show", "tm.hint": "Pick one or several terms. Applies to the graph, people and paper lists.", "tm.apply": "Apply",
      "mcp.applied": "Applied {n} AI (MCP) request(s)", "mcp.reload": "Reload to see",
      "sync.error": "Couldn't save to the server — is scripts/serve.py running? Changes are sent again once it's back.",
    },
  });

  // ---------- toast ----------
  const toastEl = document.createElement("div");
  toastEl.className = "toast ui-toast ui-glass strong"; document.body.appendChild(toastEl);
  let toastTimer;
  window.LabToast = (msg, ms = 2600) => {
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
  };
  // survive a reload (writes rebuild the dataset by reloading)
  window.LabToast.flash = msg => { try { sessionStorage.setItem("lab.flash", msg); } catch (e) {} };
  try { const f = sessionStorage.getItem("lab.flash"); if (f) { sessionStorage.removeItem("lab.flash"); setTimeout(() => LabToast(f), 300); } } catch (e) {}
  window.LabReload = (hash, msg) => { if (msg) LabToast.flash(msg); if (hash) location.hash = hash; location.reload(); };

  // ---------- modal ----------
  window.LabModal = (html, opts = {}) => {
    const m = document.createElement("div");
    m.className = "ui-scrim sheet modal-back" + (opts.forced ? " forced" : "");
    m.innerHTML = `<div class="modal ui-sheet ${opts.wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(m);
    m.addEventListener("click", e => { if ((!opts.forced && e.target === m) || e.target.closest("[data-close]")) m.remove(); });
    return m;
  };

  // HIG alert: title + message, ≤ 2 buttons, Cancel on the leading side, the action trailing (red when destructive)
  window.LabConfirm = (title, opts = {}) => new Promise(resolve => {
    const m = document.createElement("div");
    m.className = "ui-scrim"; m.setAttribute("data-ui", ""); m.dataset.theme = document.documentElement.dataset.theme || "auto";
    m.innerHTML = `<div class="ui-alert ui-glass strong" role="alertdialog" aria-modal="true"><h3>${esc(title)}</h3>${opts.message ? `<p>${esc(opts.message)}</p>` : ""}
      <div class="acts"><button class="ui-btn" data-v="0">${esc(opts.cancel || t("c.cancel"))}</button>
      <button class="ui-btn ${opts.destructive ? "destructive" : "prominent"}" data-v="1">${esc(opts.ok || t("c.ok"))}</button></div></div>`;
    const done = v => { m.remove(); document.removeEventListener("keydown", key); resolve(v); };
    const key = e => { if (e.key === "Escape") done(false); if (e.key === "Enter") done(true); };
    m.onclick = e => { const b = e.target.closest("[data-v]"); if (b) done(b.dataset.v === "1"); else if (e.target === m) done(false); };
    document.addEventListener("keydown", key);
    document.body.appendChild(m); m.querySelector('[data-v="1"]').focus();
  });

  // ---------- login gate ----------
  function loginScreen() {
    const g = document.createElement("div");
    g.className = "gate";
    g.innerHTML = `<form class="gate-card" id="login-form" autocomplete="on">
      <div class="gate-logo"><img class="logo-mark" src="logo.svg" alt="">Labsidian</div>
      <p class="sub">${t("a.title")}</p>
      ${S.demo ? `<div class="gate-demo"><b>${t("a.demoPick")}</b><p class="hint">${t("a.demoHint")}</p>
        <div class="gate-people">${(window.LAB.people || []).map(p => `<button type="button" data-demo="${esc(p.id)}">${UI.avatar(p.id)}<span>${esc(p.name)}</span></button>`).join("")}
        <button type="button" data-demo="admin"><span class="avatar admin">A</span><span>${t("a.demoAdmin")}</span></button></div></div>
      <details class="gate-pw"><summary>${t("a.orPw")}</summary>` : ""}
      <label>${t("a.id")}<input name="name" autocomplete="username" required></label>
      <label>${t("a.pw")}<input name="pw" type="password" autocomplete="current-password" required></label>
      <p class="err" id="login-err"></p>
      <button class="ui-btn prominent large">${t("a.login")}</button>
      ${S.demo ? "</details>" : S.mock ? `<p class="hint">${t("a.mock")}</p>` : ""}
      <div class="lang ui-seg small gate-lang"><button type="button" data-v="ko">KO</button><button type="button" data-v="en">EN</button></div>
    </form>`;
    document.body.appendChild(g);
    g.querySelectorAll(".gate-lang button").forEach(b => { b.setAttribute("aria-pressed", b.dataset.v === lang); b.onclick = () => I18N.setLang(b.dataset.v); });
    g.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try { await S.auth.signIn(f.name.value, f.pw.value); location.reload(); }
      catch (err) { $("#login-err").textContent = t("a.fail"); }
    };
    g.querySelectorAll("[data-demo]").forEach(b => b.onclick = async () => { await S.auth.demoSignIn(b.dataset.demo); location.reload(); });
    if (!S.demo) setTimeout(() => g.querySelector("input").focus(), 50);
  }
  function passwordForm(forced) {
    const m = LabModal(`<form id="pw-form">
      <h2>${t("a.changeTitle")}</h2>${forced ? `<p class="sub">${t("a.changeSub")}</p>` : ""}
      <label>${t("a.old")}<input name="old" type="password" autocomplete="current-password" required></label>
      <label>${t("a.new")}<input name="n1" type="password" autocomplete="new-password" required></label>
      <label>${t("a.new2")}<input name="n2" type="password" autocomplete="new-password" required></label>
      <p class="err" id="pw-err"></p>
      <div class="modal-foot">${forced ? "" : `<button type="button" class="ui-btn" data-close>${t("a.cancel")}</button>`}<button class="ui-btn prominent">${t("a.save")}</button></div>
    </form>`, { forced });
    m.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      const f = e.target, err = m.querySelector("#pw-err");
      if (f.n1.value !== f.n2.value) { err.textContent = t("a.mismatch"); return; }
      try { await S.auth.changePassword(f.old.value, f.n1.value); m.remove(); LabToast("✓"); }
      catch (x) { err.textContent = x.message === "pw.short" ? t("a.pwShort") : t("a.pwWrong"); }
    };
  }

  // ---------- header ----------
  function header(me) {
    const nav = $("#nav");
    if (!nav.querySelector('[data-view="me"]')) nav.insertAdjacentHTML("beforeend", `<a href="#/me" data-view="me"><i data-lucide="user-round" class="ic"></i><span>${t("nav.me")}</span></a>`);
    const host = document.createElement("div");
    host.className = "top-right";
    const n = S.notifications.unread();
    const vt = S.view.terms(), all = S.view.allTerms();
    const termLabel = !vt.length ? t("tm.all") : vt.length === 1 ? (all.find(x => x.id === vt[0])?.label || vt[0]) : `${all.find(x => x.id === vt[0])?.label || vt[0]} +${vt.length - 1}`;
    host.innerHTML = `
      <button class="term-btn ${vt.length ? "active" : ""}" id="term-btn">📅 <span class="hide-sm">${esc(termLabel)}</span><span class="caret">▾</span></button>
      <a class="ui-btn prominent small" href="#/write">✎ <span class="hide-sm">${t("m.write")}</span></a>
      <button class="top-icon bell" id="bell" title="${t("n.title")}">🔔${n ? `<span class="ui-badge">${n > 99 ? "99+" : n}</span>` : ""}</button>
      <button class="user-btn" id="user-btn">${me.id === "admin" ? `<span class="avatar admin">A</span>` : UI.avatar(me.id)}<span class="hide-sm">${esc(me.name)}</span><span class="caret">▾</span></button>`;
    $("#lang").before(host);
    $("#bell").onclick = e => { e.stopPropagation(); toggleMenu("notif", notifMenu, e.currentTarget); };
    $("#term-btn").onclick = e => { e.stopPropagation(); toggleMenu("terms", termMenu, e.currentTarget); };
    $("#user-btn").onclick = e => { e.stopPropagation(); toggleMenu("user", userMenu, e.currentTarget); };
    document.addEventListener("click", e => { if (!e.target.closest(".menu")) closeMenus(); });
  }
  let openMenu = null;
  const closeMenus = () => { document.querySelectorAll(".menu").forEach(m => m.remove()); openMenu = null; };
  function toggleMenu(name, build, anchor) {
    const was = openMenu; closeMenus();
    if (was === name) return;
    openMenu = name;
    const m = document.createElement("div");
    m.className = "menu ui-menu ui-glass strong menu-" + name;
    m.innerHTML = build();
    document.body.appendChild(m);
    const sidebar = document.documentElement.dataset.layout === "sidebar" && innerWidth > 760;
    if (anchor && sidebar) {   // menus open beside the sidebar control, kept on screen
      const r = anchor.getBoundingClientRect();
      m.style.left = r.right + 10 + "px"; m.style.right = "auto";
      m.style.top = Math.max(12, Math.min(r.top, innerHeight - m.offsetHeight - 12)) + "px";
    } else if (anchor && name === "terms") { const r = anchor.getBoundingClientRect(); m.style.left = Math.min(r.left, innerWidth - m.offsetWidth - 12) + "px"; m.style.right = "auto"; }
    m.addEventListener("click", e => e.stopPropagation());
    if (name === "notif") wireNotif(m);
    if (name === "terms") wireTerms(m);
    if (name === "user") wireUser(m);
  }
  function termMenu() {
    const vt = S.view.terms();
    return `<div class="menu-h"><b>${t("tm.title")}</b></div><p class="hint menu-hint">${t("tm.hint")}</p>
      <label class="check menu-check"><input type="checkbox" data-all ${vt.length ? "" : "checked"}> ${t("tm.all")}</label>
      ${S.view.allTerms().reverse().map(x => `<label class="check menu-check"><input type="checkbox" data-term="${esc(x.id)}" ${vt.includes(x.id) ? "checked" : ""}> ${esc(x.label)}</label>`).join("")}
      <div class="menu-foot"><button class="ui-btn prominent small" data-act="apply">${t("tm.apply")}</button></div>`;
  }
  function wireTerms(m) {
    const all = m.querySelector("[data-all]"), boxes = [...m.querySelectorAll("[data-term]")];
    all.onchange = () => { if (all.checked) boxes.forEach(b => (b.checked = false)); };
    boxes.forEach(b => (b.onchange = () => { all.checked = !boxes.some(x => x.checked); }));
    m.querySelector('[data-act="apply"]').onclick = () => { S.view.setTerms(boxes.filter(b => b.checked).map(b => b.dataset.term)); location.reload(); };
  }
  function userMenu() {
    const me = S.auth.current();
    return `<a href="#/me" data-go>${t("m.me")}</a><a href="#/reading" data-go>${t("m.reading")}</a><a href="#/write" data-go>${t("m.write")}</a>
      <button data-act="pw">${t("m.pw")}</button>${me.role === "admin" ? `<a href="#/admin" data-go>${t("m.admin")}</a>` : ""}
      <hr><div class="menu-theme"><span>${t("m.theme")}</span><div class="ui-seg small">${["auto", "light", "dark"].map(v => `<button data-theme-set="${v}" aria-pressed="${(document.documentElement.dataset.theme || "auto") === v}">${t("m." + v)}</button>`).join("")}</div></div>
      <div class="menu-theme menu-lang"><span>${t("m.lang")}</span><div class="ui-seg small">${["ko", "en"].map(v => `<button data-lang-set="${v}" aria-pressed="${lang === v}">${v.toUpperCase()}</button>`).join("")}</div></div>
      <hr><button data-act="logout">${t("m.logout")}</button>`;
  }
  function wireUser(m) {
    m.querySelectorAll("[data-go]").forEach(a => a.addEventListener("click", closeMenus));
    m.querySelector('[data-act="pw"]').onclick = () => { closeMenus(); passwordForm(false); };
    m.querySelectorAll("[data-theme-set]").forEach(b => (b.onclick = e => {
      e.stopPropagation();
      const v = b.dataset.themeSet;
      try { v === "auto" ? localStorage.removeItem("lab.theme") : localStorage.setItem("lab.theme", v); } catch (x) {}
      document.documentElement.dataset.theme = v;   // CSS follows by itself; canvases (the graph) listen for lab:theme
      m.querySelectorAll("[data-theme-set]").forEach(x => x.setAttribute("aria-pressed", x === b));
      window.dispatchEvent(new Event("lab:theme"));
    }));
    m.querySelectorAll("[data-lang-set]").forEach(b => (b.onclick = () => b.dataset.langSet !== lang && I18N.setLang(b.dataset.langSet)));
    m.querySelector('[data-act="logout"]').onclick = async () => { await S.auth.signOut(); location.hash = "#/home"; location.reload(); };
  }
  const ago = iso => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return lang === "ko" ? "방금" : "now";
    if (s < 3600) return Math.floor(s / 60) + (lang === "ko" ? "분 전" : "m");
    if (s < 86400) return Math.floor(s / 3600) + (lang === "ko" ? "시간 전" : "h");
    return Math.floor(s / 86400) + (lang === "ko" ? "일 전" : "d");
  };
  window.LabAgo = ago;
  const actorName = id => UI.P[id]?.name || (id === "admin" ? "admin" : id);
  window.LabNotifText = n => t("n." + n.type, { a: actorName(n.actor) });
  function notifMenu() {
    const list = S.notifications.list().slice(0, 30);
    return `<div class="menu-h"><b>${t("n.title")}</b>${list.some(n => !n.read) ? `<button class="ui-btn text" data-act="all">${t("n.readAll")}</button>` : ""}</div>` +
      (list.map(n => `<div class="ui-row two notif ${n.read ? "" : "unread"}" data-id="${n.id}" data-paper="${n.paperId || ""}" data-review="${n.reviewId || ""}" data-comment="${n.commentId || ""}" data-draft="${n.draftId || ""}" data-study="${n.studyId || ""}" data-guide="${n.guideId || ""}" data-type="${n.type}">
        ${n.type === "curation" ? `<span class="avatar admin"><i data-lucide="sparkles" class="ic"></i></span>` : UI.avatar(n.actor)}<div><div>${esc(LabNotifText(n))}</div>
        ${n.paperId && UI.PA[n.paperId] ? `<div class="muted ellip">${esc(UI.PA[n.paperId].title)}</div>` : ""}
        ${n.excerpt ? `<div class="excerpt">“${esc(n.excerpt)}”</div>` : ""}<div class="muted">${ago(n.at)}</div></div></div>`).join("") || `<div class="ui-empty">${t("n.empty")}</div>`);
  }
  function wireNotif(m) {
    m.querySelector('[data-act="all"]')?.addEventListener("click", async () => { await S.notifications.markAllRead(); closeMenus(); updateBell(); });
    m.querySelectorAll(".notif").forEach(el => el.onclick = async () => {
      await S.notifications.markRead(el.dataset.id); closeMenus(); updateBell();
      openNotif(el.dataset);
    });
  }
  // where a notification leads (used by the bell and the my-page inbox)
  function openNotif(d) {
    if (d.type === "curation") { location.hash = "#/admin?tab=tags"; return; }
    if (d.draft) { location.hash = "#/write?mcp=" + d.draft; return; }
    if (d.guide) { location.hash = d.type === "guideSession" ? "#/study/new?guide=" + d.guide : "#/guide/" + d.guide; return; }
    if (d.study) {
      const tab = { studyClosed: "notes", studyNotesDraft: "notes", studyQuestion: "prep" }[d.type];
      location.hash = "#/study/" + d.study + (tab ? "?tab=" + tab : ""); return;
    }
    window.LabOpenReview?.(d.paper, d.review, d.comment);
  }
  window.LabOpenNotif = openNotif;
  function updateBell() {
    const n = S.notifications.unread(), b = $("#bell");
    if (b) b.innerHTML = `🔔${n ? `<span class="ui-badge">${n > 99 ? "99+" : n}</span>` : ""}`;
  }
  window.LabUpdateBell = updateBell;

  // open a paper drawer and jump to a review (optionally its comment thread)
  window.LabOpenReview = (paperId, reviewId, commentId) => {
    if (!paperId || !UI.PA[paperId]) return;
    UI.openDrawer("paper", paperId);
    setTimeout(() => {
      const drawer = document.getElementById("drawer");
      const el = drawer.querySelector(`[id="rv-${reviewId}"]`) || document.getElementById("rv-" + reviewId);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1600);
      if (commentId) window.LabSocial?.openThread(reviewId, commentId, drawer.contains(el) ? drawer : document);
    }, 120);
  };

  // ---------- boot ----------
  const me = S.auth.current();
  if (!me) { document.body.classList.add("locked"); loginScreen(); return; }
  header(me);
  if (me.mustChange) passwordForm(true);
  window.addEventListener("lab:syncerror", () => LabToast("⚠️ " + t("sync.error"), 8000));
  window.addEventListener("lab:mcp", e => {
    const { applied, needsReload } = e.detail;
    updateBell();
    const typing = document.activeElement?.closest?.("#drawer") && /TEXTAREA|INPUT/.test(document.activeElement.tagName);
    if (!typing) window.LabUI.refreshDrawer?.();
    if (!applied) return;
    if (needsReload) {
      const b = document.createElement("div");
      b.className = "mcp-banner";
      b.innerHTML = `🤖 ${t("mcp.applied", { n: applied })} <button class="ui-btn small prominent">${t("mcp.reload")}</button>`;
      b.querySelector("button").onclick = () => location.reload();
      document.body.appendChild(b);
    } else LabToast("🤖 " + t("mcp.applied", { n: applied }), 3500);
  });
  window.LabMe = me;
})();
