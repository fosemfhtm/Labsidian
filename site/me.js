/* #/me — my page, this term's workspace (design/patterns §2-C): progress, calendar, drafts, reading list, inbox, the
 * studies coming up, and my diaries to edit, delete and export. What others see of me (terrain, how my interests
 * moved, every term) is my profile, #/person/<me>. */
(() => {
  const { t, lang } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  I18N.extend({
    ko: {
      "me.title": "내 페이지", "me.term": "학기", "me.progress": "이번 학기 작성률", "me.of": "목표 {target}편 중 {n}편",
      "me.pace": "오늘까지 기대치 {exp}편 — {diff}", "me.ahead": "{n}편 앞서 있어요", "me.behind": "{n}편 뒤처져 있어요", "me.onpace": "딱 맞춰 가고 있어요",
      "me.left": "학기 종료까지 작성일 {d}일", "me.legendWrote": "작성", "me.legendHoliday": "공휴일", "me.legendLab": "연구실 쉬는 날 (셧다운·학회 등)", "me.ended": "학기 종료", "me.inc90": "90% (인센티브 상위)", "me.inc70": "70%",
      "me.calendar": "작성 캘린더", "me.streak": "연속 작성 {n}주", "me.best": "최장 {n}주",
      "me.reviews": "내 다이어리", "me.draft": "임시저장된 글", "me.continue": "이어 쓰기",
      "me.toProfile": "내 프로필 보기", "me.studies": "다가오는 스터디", "me.noStudies": "예정된 스터디가 없어요", "me.studiesAll": "스터디 전체", "me.presenting": "발표", "me.noDate": "날짜 미정",
      "me.reading": "읽을 목록", "me.noReading": "링크나 PDF로 읽을 논문을 모아 보세요", "me.readingAll": "읽을 목록 전체", "me.calWrite": "이 날짜로 다이어리 쓰기", "me.calNone": "작성 없음", "me.dow": "일월화수목금토", "me.inbox": "받은 댓글·멘션", "me.noInbox": "아직 없어요",
      "me.export": "docx로 내보내기", "me.exporting": "만드는 중…", "me.write": "다이어리 쓰기",
      "me.diaryTitle": "{term} Paper Diary — {name}", "me.color": "내 색", "me.exempt": "편 작성 · 이번 학기 작성 의무 없음",
      "me.notYet": "편 · {d}부터 작성 시작", "me.fromDate": "{d}부터 작성 (목표는 그 날짜 기준으로 계산)", "me.customTarget": "관리자가 정한 목표예요",
      "me.mcpDraft": "내 AI 초안", "me.review": "검토하고 게시", "me.adminNote": "관리자 계정은 다이어리를 쓰지 않아요. 멤버 계정으로 로그인해 보세요.",
      "me.more": "더보기",
      "me.ai": "AI 연결", "me.aiSub": "내 Claude·Codex에 Labsidian을 연결하는 토큰이에요. 토큰을 쓰는 AI는 내 이름으로 초안을 만들고 댓글을 달 수 있어요.",
      "me.aiNew": "새 토큰…", "me.aiTitle": "새 토큰", "me.aiName": "이름", "me.aiNamePh": "예: 노트북 Claude Code", "me.aiAdd": "추가", "me.aiCancel": "취소",
      "me.aiLoading": "불러오는 중…", "me.aiLoadFail": "토큰 목록을 불러오지 못했어요. 새로 고침해 보세요.",
      "me.aiEmpty": "아직 만든 토큰이 없어요. 새 토큰을 만들어 내 AI에 연결해 보세요.", "me.aiUnnamed": "이름 없는 토큰",
      "me.aiMeta": "만든 날 {created} · {used}", "me.aiUsed": "마지막 사용 {ago}", "me.aiNever": "아직 쓰지 않음",
      "me.aiDel": "삭제", "me.aiDelQ": "이 토큰을 삭제할까요?", "me.aiDelMsg": "이 토큰을 쓰는 AI는 더 이상 연결되지 않아요.",
      "me.aiDeleted": "토큰을 삭제했어요", "me.aiDelFail": "토큰을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      "me.aiFail": "토큰을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      "me.aiOnce": "토큰은 지금 한 번만 보여요. 이 창을 닫으면 다시 볼 수 없어요.", "me.aiToken": "토큰", "me.aiCmd": "Claude Code에 연결",
      "me.aiRepo": "<저장소 경로>", "me.aiCmdHelp": "<저장소 경로>는 Labsidian 저장소를 받은 폴더로 바꿔 주세요. Codex 설정은 README에 있어요.",
      "me.aiCopy": "복사", "me.aiDone": "완료",
    },
    en: {
      "me.title": "My page", "me.term": "Term", "me.progress": "This term's diary rate", "me.of": "{n} of {target} target",
      "me.pace": "Expected by today: {exp} — {diff}", "me.ahead": "{n} ahead", "me.behind": "{n} behind", "me.onpace": "right on pace",
      "me.left": "{d} writing days left in term", "me.legendWrote": "Wrote", "me.legendHoliday": "Public holiday", "me.legendLab": "Lab day off (shutdown, conference …)", "me.ended": "Term ended", "me.inc90": "90% (top incentive)", "me.inc70": "70%",
      "me.calendar": "Writing calendar", "me.streak": "{n}-week streak", "me.best": "best {n} weeks",
      "me.reviews": "My diaries", "me.draft": "Saved draft", "me.continue": "Continue",
      "me.toProfile": "My profile", "me.studies": "Studies coming up", "me.noStudies": "No study coming up", "me.studiesAll": "All studies", "me.presenting": "Presenting", "me.noDate": "Date to be set",
      "me.reading": "Reading list", "me.noReading": "Collect papers to read by link or PDF", "me.readingAll": "Whole reading list", "me.calWrite": "Write a diary for this day", "me.calNone": "Nothing written", "me.dow": "SMTWTFS", "me.inbox": "Comments & mentions", "me.noInbox": "Nothing yet",
      "me.export": "Export .docx", "me.exporting": "Building…", "me.write": "Write diary",
      "me.diaryTitle": "{term} Paper Diary — {name}", "me.adminNote": "The admin account doesn't write reviews. Sign in with a member account.",
      "me.color": "My colour", "me.exempt": "written · no diary duty this term",
      "me.notYet": " · starts on {d}", "me.fromDate": "Writing from {d} (target prorated from that date)", "me.customTarget": "Target set by an admin",
      "me.mcpDraft": "AI draft", "me.review": "Review & publish",
      "me.more": "More",
      "me.ai": "AI Connection", "me.aiSub": "Tokens that connect your Claude or Codex to Labsidian. An AI with a token can draft diaries and comment in your name.",
      "me.aiNew": "New Token…", "me.aiTitle": "New Token", "me.aiName": "Name", "me.aiNamePh": "e.g. Laptop Claude Code", "me.aiAdd": "Add", "me.aiCancel": "Cancel",
      "me.aiLoading": "Loading…", "me.aiLoadFail": "Couldn't load your tokens. Try reloading the page.",
      "me.aiEmpty": "No tokens yet. Make one to connect your AI.", "me.aiUnnamed": "Unnamed token",
      "me.aiMeta": "Created {created} · {used}", "me.aiUsed": "Last used {ago}", "me.aiNever": "Never used",
      "me.aiDel": "Delete", "me.aiDelQ": "Delete this token?", "me.aiDelMsg": "Any AI using this token won't be able to connect anymore.",
      "me.aiDeleted": "Token deleted", "me.aiDelFail": "Couldn't delete the token. Try again in a moment.",
      "me.aiFail": "Couldn't make a token. Try again in a moment.",
      "me.aiOnce": "This is the only time the token is shown. Once you close this, it can't be shown again.", "me.aiToken": "Token", "me.aiCmd": "Connect Claude Code",
      "me.aiRepo": "<repo path>", "me.aiCmdHelp": "Replace <repo path> with the folder you cloned Labsidian into. Codex setup is in the README.",
      "me.aiCopy": "Copy", "me.aiDone": "Done",
    },
  });

  const view = document.createElement("section");
  view.id = "view-me"; view.className = "view page";
  document.querySelector("main").appendChild(view);
  let termId = null;

  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

  function render() {
    const me = S.auth.current();
    if (!me) return;
    const person = UI.P[me.id];
    const terms = S.terms.list();
    const mineAll = Object.values(UI.R).filter(r => r.person === me.id).sort((a, b) => b.date.localeCompare(a.date));
    if (!termId) {
      const cur = S.terms.current();
      termId = mineAll.some(r => r.date >= cur.start && r.date <= cur.end) || !mineAll.length ? cur.id
        : (terms.find(x => mineAll[0].date >= x.start && mineAll[0].date <= x.end) || cur).id;
    }
    const term = terms.find(x => x.id === termId) || terms[0];
    const mine = mineAll.filter(r => r.date >= term.start && r.date <= term.end);
    const today = S.today();
    // duty for this member: prorated from their start date, or exempt (postdocs …), or a fixed target set by an admin
    const q = person ? S.quota(me.id, term) : { exempt: true, target: 0, start: term.start };
    // pace counts working days only (weekdays that aren't the lab's days off)
    const qEnd = q.end || term.end, total = Math.max(1, S.calendar.workdays(q.start, qEnd));
    const elapsed = today < q.start ? 0 : S.calendar.workdays(q.start, today < qEnd ? today : qEnd);
    const target = Math.max(1, q.target), n = mine.length, pct = Math.min(100, n / target * 100);
    const expected = Math.round(q.target * elapsed / total), diff = n - expected;
    const draft = S.drafts.get(), mcpDrafts = S.drafts.mcp();

    const upcoming = S.studies.list().filter(st => !st.closed && st.members.includes(me.id) && (!st.date || st.date >= today)).slice(0, 4);
    view.innerHTML = `
      <div class="page-head me-head">
        <div class="pc-head">${person ? UI.avatar(me.id, true) : `<span class="avatar big admin">A</span>`}
          <div><h1>${esc(me.name)}</h1><p class="sub">${me.role === "admin" ? "admin · " : ""}${t("me.title")}${person ? ` · <a href="#/person/${me.id}">${t("me.toProfile")} →</a>` : ""}</p></div></div>
        <div class="btn-row">
          <select id="me-term" aria-label="${t("me.term")}">${terms.map(x => `<option value="${x.id}" ${x.id === term.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
          <a class="ui-btn prominent" href="#/write">✎ ${t("me.write")}</a>
          ${person ? `<label class="ui-btn color-pick" title="${t("me.color")}"><span class="swatch" style="background:${person.color}"></span>${t("me.color")}<input type="color" id="me-color" value="${person.color}"></label>` : ""}
        </div>
      </div>
      ${draft ? `<div class="ui-notice draft-row">📝 ${t("me.draft")}: <b>${esc(draft.title || "(untitled)")}</b> <a class="ui-btn text" href="#/write">${t("me.continue")}</a></div>` : ""}
      ${mcpDrafts.map(d => `<div class="ui-notice info draft-row">🤖 ${t("me.mcpDraft")}: <b>${esc(d.title || "(untitled)")}</b> <a class="ui-btn text" href="#/write?mcp=${d.id}">${t("me.review")}</a></div>`).join("")}
      ${!person ? `<div class="ui-card">${t("me.adminNote")}</div>` : ""}
      <div class="me-grid">
        <div class="ui-card progress-card">
          <h3>${t("me.progress")}</h3>
          ${q.exempt ? `<div class="big-num"><b>${n}</b><span>${q.notYet ? t("me.notYet", { d: S.users.get(me.id)?.quota?.start || "" }) : t("me.exempt")}</span></div></div>` : `
          <div class="big-num"><b>${Math.round(pct)}%</b><span>${t("me.of", { n, target: q.target })}</span></div>
          ${q.start > term.start ? `<p class="muted">${t("me.fromDate", { d: q.start })}</p>` : ""}${q.custom ? `<p class="muted">${t("me.customTarget")}</p>` : ""}
          <div class="pbar"><div class="pfill" style="width:${pct}%"></div>
            <i class="mark" style="left:70%" title="${t("me.inc70")}"></i><i class="mark hi" style="left:90%" title="${t("me.inc90")}"></i>
            <i class="mark exp" style="left:${Math.min(100, expected / target * 100)}%"></i></div>
          <div class="pbar-l"><span>0</span><span style="left:70%">70%</span><span style="left:90%">90%</span></div>
          <p class="muted">${t("me.pace", { exp: expected, diff: diff > 0 ? t("me.ahead", { n: diff }) : diff < 0 ? t("me.behind", { n: -diff }) : t("me.onpace") })}</p>
          <p class="muted">${today > term.end ? t("me.ended") : t("me.left", { d: S.calendar.workdays(today, term.end) })}</p>
        </div>`}
        <div class="ui-card"><h3>${t("me.calendar")} <span class="muted" id="me-streak"></span></h3><div id="me-cal" class="cal"></div></div>
      </div>
      <div class="me-trio">
        <div class="ui-card"><h3>${t("me.reading")}</h3><div class="mini-list" id="me-reading"></div></div>
        <div class="ui-card"><h3>${t("me.inbox")}</h3><div id="me-inbox"></div></div>
        <div class="ui-card"><h3>${t("me.studies")}</h3>
          ${upcoming.map(st => `<a class="ui-row two" href="#/study/${st.id}"><div class="grow"><div class="me-st-t">${esc(st.title)}</div>
            <div class="m">${esc([st.date, st.time].filter(Boolean).join(" ") || t("me.noDate"))}${st.presenter === me.id ? ` · <span class="ui-pill accent">${t("me.presenting")}</span>` : ""}</div></div></a>`).join("")
            || `<p class="muted">${t("me.noStudies")}</p>`}
          <a class="ui-btn text" href="#/study">${t("me.studiesAll")} →</a></div>
      </div>
      ${person ? `<div class="ui-card me-reviews" id="me-reviews"><div class="row-between"><h3>${t("me.reviews")} <span class="muted">${n}</span></h3>
        <button class="ui-btn" id="me-export" ${n ? "" : "disabled"}>⬇ ${t("me.export")}</button></div><div id="me-dl"></div></div>` : ""}
      ${S.server ? `<div class="ui-card me-ai" id="me-ai"></div>` : ""}`;

    $("#me-term", view).onchange = e => { termId = e.target.value; render(); };
    $("#me-color", view)?.addEventListener("change", async e => { await S.users.setMyColor(e.target.value); LabReload("#/me", "🎨 ✓"); });
    $("#me-export", view)?.addEventListener("click", () => exportDocx(me, term, mine));
    calendar(term, mineAll, person);
    if (person) window.LabDiaries.mount($("#me-dl", view), { person: me.id, owner: true, term });
    inbox();
    reading();
    aiTokens();
  }

  // AI (MCP) tokens: each member connects their own Claude / Codex. The server keeps them (hashed), so only there.
  const day = iso => {
    const d = new Date(iso), other = d.getFullYear() !== new Date().getFullYear();
    return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", { ...(other ? { year: "numeric" } : {}), month: lang === "ko" ? "long" : "short", day: "numeric" }).format(d);
  };
  async function aiTokens() {
    const box = $("#me-ai", view);
    if (!box) return;
    box.innerHTML = `<div class="row-between"><h3>${t("me.ai")}</h3><button class="ui-btn" id="me-ai-new">${t("me.aiNew")}</button></div>
      <p class="muted">${t("me.aiSub")}</p><div id="me-ai-list"><p class="ui-empty compact">${t("me.aiLoading")}</p></div>`;
    $("#me-ai-new", box).onclick = newToken;
    let list;
    try { list = await S.tokens.list(); }
    catch (e) { console.warn(e); $("#me-ai-list", box).innerHTML = `<p class="ui-empty compact">${t("me.aiLoadFail")}</p>`; return; }
    $("#me-ai-list", box).innerHTML = list.map(x => `<div class="ui-row two ruled"><div class="grow"><div>${esc(x.label || t("me.aiUnnamed"))}</div>
        <div class="m">${t("me.aiMeta", { created: day(x.created), used: x.used ? t("me.aiUsed", { ago: LabAgo(x.used) }) : t("me.aiNever") })}</div></div>
        <button class="ui-btn small destructive" data-del="${esc(x.id)}">${t("me.aiDel")}</button></div>`).join("")
      || `<p class="ui-empty compact">${t("me.aiEmpty")}</p>`;
    box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      if (!await LabConfirm(t("me.aiDelQ"), { message: t("me.aiDelMsg"), ok: t("me.aiDel"), destructive: true })) return;
      try { await S.tokens.remove(b.dataset.del); LabToast(t("me.aiDeleted")); }
      catch (e) { console.warn(e); LabToast(t("me.aiDelFail")); }
      aiTokens();
    });
  }
  // shown once: the token and a ready-to-paste command (forced: a stray click outside mustn't lose it)
  function newToken() {
    const m = LabModal(`<form id="ai-form"><h2>${t("me.aiTitle")}</h2>
      <label class="ui-label" for="ai-label">${t("me.aiName")}</label>
      <input id="ai-label" name="label" maxlength="60" autocomplete="off" placeholder="${t("me.aiNamePh")}">
      <p class="err" id="ai-err" role="alert"></p>
      <div class="modal-foot"><button type="button" class="ui-btn" data-close>${t("me.aiCancel")}</button><button class="ui-btn prominent">${t("me.aiAdd")}</button></div>
    </form>`, { forced: true });
    const f = $("#ai-form", m);
    setTimeout(() => f.label.focus(), 50);
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = $(".prominent", f);
      btn.disabled = true;
      let r;
      try { r = await S.tokens.create(f.label.value.trim()); }
      catch (x) { console.warn(x); $("#ai-err", m).textContent = t("me.aiFail"); btn.disabled = false; return; }
      const cmd = `claude mcp add labsidian -e LABSIDIAN_URL=${location.origin} -e LABSIDIAN_TOKEN=${r.token} -- python ${t("me.aiRepo")}/mcp/labsidian_mcp.py`;
      $(".modal", m).innerHTML = `<h2>${t("me.aiTitle")}</h2><p class="sub">${t("me.aiOnce")}</p>
        <span class="ui-label">${t("me.aiToken")}</span>
        <div class="temp-pw secret"><code>${esc(r.token)}</code><button class="ui-btn small" data-copy="token">${t("me.aiCopy")}</button></div>
        <span class="ui-label">${t("me.aiCmd")}</span>
        <div class="temp-pw secret"><code>${esc(cmd)}</code><button class="ui-btn small" data-copy="cmd">${t("me.aiCopy")}</button></div>
        <p class="muted">${esc(t("me.aiCmdHelp"))}</p>
        <div class="modal-foot"><button class="ui-btn prominent" data-close>${t("me.aiDone")}</button></div>`;
      m.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => LabCopy(b.dataset.copy === "token" ? r.token : cmd));
      aiTokens();
    };
  }

  // calendar cells: hover → that day's entries (or the day off); click → open the entry, or write one for that day
  function calendarTips(mine, person) {
    const cal = $("#me-cal", view), tip = $(".cal-tip", cal), byDay = {};
    mine.forEach(r => (byDay[r.date] ||= []).push(r));
    let pinned = null;
    const body = (day, full) => {
      const rs = byDay[day] || [], off = S.calendar.offDay(day), d = new Date(day + "T00:00:00");
      const head = `<b>${d.getMonth() + 1}/${d.getDate()} (${t("me.dow")[d.getDay()]})</b>${off ? ` · <span class="cal-off">${esc(off.label)}</span>` : ""}`;
      const list = rs.length ? rs.map(r => `<a class="cal-rv" data-paper="${r.paper}" data-review="${r.id}">${esc(UI.PA[r.paper]?.title || "")}</a>`).join("")
        : `<span class="muted">${t("me.calNone")}</span>`;
      return head + `<div class="cal-list">${list}</div>` + (full && person && !rs.length ? `<a class="ui-btn small prominent" href="#/write?date=${day}">✎ ${t("me.calWrite")}</a>` : "");
    };
    const place = el => {
      const a = el.getBoundingClientRect(), b = cal.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = Math.max(0, Math.min(b.width - tip.offsetWidth, a.left - b.left + a.width / 2 - tip.offsetWidth / 2)) + "px";
      tip.style.top = (a.bottom - b.top + 6) + "px";
    };
    cal.querySelectorAll("i[data-day]").forEach(el => {
      el.onmouseenter = () => { if (pinned) return; tip.innerHTML = body(el.dataset.day, false); tip.classList.remove("pinned"); place(el); };
      el.onmouseleave = () => { if (!pinned) tip.hidden = true; };
      el.onclick = e => {
        e.stopPropagation();
        const rs = byDay[el.dataset.day] || [];
        if (rs.length === 1) { window.LabOpenReview?.(rs[0].paper, rs[0].id); return; }
        pinned = el.dataset.day; tip.innerHTML = body(pinned, true); tip.classList.add("pinned"); place(el);
      };
    });
    tip.onclick = e => { const a = e.target.closest(".cal-rv"); if (a) window.LabOpenReview?.(a.dataset.paper, a.dataset.review); };
    document.addEventListener("click", e => { if (pinned && !tip.contains(e.target)) { pinned = null; tip.hidden = true; } });
  }

  function calendar(term, mine, person) {
    const counts = {};
    mine.forEach(r => (counts[r.date] = (counts[r.date] || 0) + 1));
    const start = new Date(term.start), dow = (start.getDay() + 6) % 7; // Monday = 0
    const first = addDays(term.start, -dow), weeks = Math.ceil((days(first, term.end) + 1) / 7);
    const color = person?.color || "rgb(var(--indigo))";
    // weekdays only (no diary is owed on weekends); the lab's days off are shaded and named in the tooltip
    let html = `<div class="cal-grid" style="grid-template-columns:repeat(${weeks},1fr)">`;
    for (let w = 0; w < weeks; w++) for (let d = 0; d < 5; d++) {
      const day = addDays(first, w * 7 + d), c = counts[day] || 0, out = day < term.start || day > term.end;
      const off = !out && S.calendar.offDay(day), cls = [out && "out", day === S.today() && "today", off && (off.kind === "holiday" ? "off-holiday" : "off-lab")];
      html += `<i class="${cls.filter(Boolean).join(" ")}" ${out ? "" : `data-day="${day}"`} style="grid-column:${w + 1};grid-row:${d + 1};${c ? `background:color-mix(in srgb, ${color} ${Math.round(Math.min(1, 0.45 + c * 0.3) * 100)}%, var(--fill-3))` : ""}"></i>`;
    }
    html += "</div>";
    html += `<div class="cal-legend"><span><i style="background:${color}"></i>${t("me.legendWrote")}</span><span><i class="off-holiday"></i>${t("me.legendHoliday")}</span><span><i class="off-lab"></i>${t("me.legendLab")}</span></div>`;
    // months axis
    html += `<div class="cal-months">${[...new Set(Array.from({ length: weeks }, (_, w) => addDays(first, w * 7 + 6).slice(0, 7)).filter(m => m >= term.start.slice(0, 7) && m <= term.end.slice(0, 7)))].map(m => `<span>${+m.slice(5)}${lang === "ko" ? "월" : ""}</span>`).join("")}</div>`;
    $("#me-cal", view).innerHTML = html + `<div class="cal-tip ui-tooltip" hidden></div>`;
    calendarTips(mine, person);
    // streaks in weeks (any review that week)
    const wk = d => Math.floor(days("2020-01-06", d) / 7);
    const set = new Set(mine.map(r => wk(r.date)));
    let best = 0, run = 0, prev = null;
    [...set].sort((a, b) => a - b).forEach(w => { run = prev !== null && w === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = w; });
    let cur = 0, w = wk(S.today());
    if (!set.has(w)) w--;
    while (set.has(w)) { cur++; w--; }
    $("#me-streak", view).textContent = `· ${t("me.streak", { n: cur })} · ${t("me.best", { n: best })}`;
  }

  let inboxN = 5;
  function inbox() {
    const all = S.notifications.list(), list = all.slice(0, inboxN);
    $("#me-inbox", view).innerHTML = list.map(nf => `<div class="ui-row two notif ${nf.read ? "" : "unread"}" data-nid="${nf.id}" data-paper="${nf.paperId || ""}" data-review="${nf.reviewId || ""}" data-comment="${nf.commentId || ""}" data-draft="${nf.draftId || ""}" data-study="${nf.studyId || ""}" data-guide="${nf.guideId || ""}" data-type="${nf.type}">
      ${UI.avatar(nf.actor)}<div><div>${esc(LabNotifText(nf))}</div>${nf.excerpt ? `<div class="excerpt">“${esc(nf.excerpt)}”</div>` : ""}<div class="muted">${LabAgo(nf.at)}</div></div></div>`).join("")
      || `<div class="muted">${t("me.noInbox")}</div>`;
    if (all.length > inboxN) $("#me-inbox", view).insertAdjacentHTML("beforeend", `<button class="ui-btn text" id="me-inbox-more">${t("me.more")} (${all.length - inboxN})</button>`);
    $("#me-inbox-more", view)?.addEventListener("click", () => { inboxN += 10; inbox(); });
    view.querySelectorAll("#me-inbox .notif").forEach(el => el.onclick = async () => {
      await S.notifications.markRead(el.dataset.nid); el.classList.remove("unread"); LabUpdateBell();
      LabOpenNotif(el.dataset);
    });
  }

  function reading() {
    const list = S.reading.list(), st = x => (x.written ? "written" : x.status), by = s => list.filter(x => st(x) === s);
    const active = [...by("reading"), ...by("read"), ...by("todo")].slice(0, 5);
    $("#me-reading", view).innerHTML = `<div class="rl-counts">${["reading", "todo", "read"].map(s => `<a href="#/reading"><b>${by(s).length}</b>${t("rl.s." + s)}</a>`).join("")}</div>`
      + (active.map(x => `<div class="ui-row mini" ${x.paperId ? `data-open="paper:${esc(x.paperId)}"` : `onclick="location.hash='#/reading'"`}><span class="t">${esc(x.title)}</span>
        <span class="m rl-dot rl-st-${st(x)}">${t("rl.s." + st(x))}</span></div>`).join("") || `<div class="muted">${t("me.noReading")}</div>`)
      + `<a class="ui-btn text rl-all" href="#/reading">${t("me.readingAll")} →</a>`;
  }

  // same layout as the lab's Word diary: date header, then 논문/Link/저널/저자/Rating/내용/Memo
  async function exportDocx(me, term, mine) {
    const btn = $("#me-export", view); btn.textContent = t("me.exporting"); btn.disabled = true;
    try {
      const docx = await import("https://cdn.jsdelivr.net/npm/docx@9.8.1/+esm");
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
      const kv = (k, v) => new Paragraph({ children: [new TextRun({ text: k + ": ", bold: true }), new TextRun(v || "")] });
      const multi = (k, v) => {
        const lines = (v || "").split("\n");
        return [new Paragraph({ children: [new TextRun({ text: k + ": ", bold: true }), new TextRun(lines[0] || "")] }),
          ...lines.slice(1).map(l => new Paragraph({ children: [new TextRun(l)] }))];
      };
      const byDate = [...mine].sort((a, b) => a.date.localeCompare(b.date));
      const children = [new Paragraph({ text: t("me.diaryTitle", { term: term.label, name: me.name }), heading: HeadingLevel.TITLE })];
      byDate.forEach(r => {
        const p = UI.PA[r.paper], [y, m, d] = r.date.split("-").map(Number);
        children.push(new Paragraph({ text: `${y}년 ${m}월 ${d}일`, heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun({ text: me.name, bold: true })] }),
          kv("논문", p.title), kv("Link", p.link), kv("저널", p.venueNorm || p.venue), kv("저자", p.authors),
          kv("Rating", "✯".repeat(r.rating)), ...multi("내용", r.content), ...multi("Memo", r.memo), new Paragraph(""));
      });
      const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `${term.label} Paper Diary - ${me.name}.docx`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { LabToast("export failed: " + e.message); }
    btn.textContent = "⬇ " + t("me.export"); btn.disabled = false;
  }

  (window.LabPages ||= {}).me = { render };
})();
