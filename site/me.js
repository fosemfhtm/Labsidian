/* #/me — my page: term progress, calendar, interest drift, my reviews, draft, reading list, inbox, .docx export. */
(() => {
  const { t, lang } = window.I18N, UI = window.LabUI, S = window.Store;
  const { esc } = UI;
  const $ = (s, r = document) => r.querySelector(s);

  I18N.extend({
    ko: {
      "me.title": "내 페이지", "me.term": "학기", "me.progress": "이번 학기 작성률", "me.of": "목표 {target}편 중 {n}편",
      "me.pace": "오늘까지 기대치 {exp}편 — {diff}", "me.ahead": "{n}편 앞서 있어요", "me.behind": "{n}편 뒤처져 있어요", "me.onpace": "딱 맞춰 가고 있어요",
      "me.left": "학기 종료까지 작성일 {d}일", "me.legendWrote": "작성", "me.legendHoliday": "공휴일", "me.legendLab": "연구실 쉬는 날 (셧다운·학회 등)", "me.ended": "학기 종료", "me.inc90": "90% (인센티브 상위)", "me.inc70": "70%",
      "me.calendar": "작성 캘린더", "me.driftEmpty": "다이어리를 쓰면 달마다 관심 분야가 쌓여요", "me.streak": "연속 작성 {n}주", "me.best": "최장 {n}주", "me.drift": "관심사 변화 (월별)",
      "me.reviews": "내 다이어리", "me.noReviews": "이 학기엔 아직 다이어리가 없어요", "me.draft": "임시저장된 글", "me.continue": "이어 쓰기",
      "me.reading": "읽을 목록", "me.noReading": "링크나 PDF로 읽을 논문을 모아 보세요", "me.readingAll": "읽을 목록 전체", "me.calWrite": "이 날짜로 다이어리 쓰기", "me.calNone": "작성 없음", "me.dow": "일월화수목금토", "me.inbox": "받은 댓글·멘션", "me.noInbox": "아직 없어요",
      "me.export": "docx로 내보내기", "me.exporting": "만드는 중…", "me.write": "다이어리 쓰기", "me.remove": "빼기",
      "me.diaryTitle": "{term} Paper Diary — {name}", "me.color": "내 색", "me.exempt": "편 작성 · 이번 학기 작성 의무 없음",
      "me.notYet": "편 · {d}부터 작성 시작", "me.fromDate": "{d}부터 작성 (목표는 그 날짜 기준으로 계산)", "me.customTarget": "관리자가 정한 목표예요",
      "me.mcpDraft": "내 AI 초안", "me.review": "검토하고 게시", "me.adminNote": "관리자 계정은 다이어리를 쓰지 않아요. 멤버 계정으로 로그인해 보세요.",
      "me.axis.domain": "분야", "me.axis.method": "방법론", "me.none.domain": "분야 없음", "me.none.method": "방법론 없음", "me.other": "기타",
      "me.driftHint": "막대에 올리면 편수, 누르면 아래 다이어리가 그 달·그 태그로 걸러져요", "me.driftHintAll": "학기별로 봐요 — 막대를 누르면 그 학기 다이어리가 그 태그로 걸러져요", "me.driftTip": "{m} · {tag} {n}편",
      "me.span.term": "월별", "me.span.all": "학기별",
      "me.search": "제목·내용 검색", "me.allDomains": "모든 분야", "me.allMethods": "모든 방법론", "me.commented": "💬 댓글 있는 것만",
      "me.sortNew": "최신순", "me.sortRating": "별점순", "me.shown": "{all}편 중 {n}편", "me.clear": "필터 지우기", "me.month": "{y}년 {m}월",
      "me.noMatch": "조건에 맞는 다이어리가 없어요", "me.more": "더보기", "me.termScope": "{term} 다이어리",
    },
    en: {
      "me.title": "My page", "me.term": "Term", "me.progress": "This term's diary rate", "me.of": "{n} of {target} target",
      "me.pace": "Expected by today: {exp} — {diff}", "me.ahead": "{n} ahead", "me.behind": "{n} behind", "me.onpace": "right on pace",
      "me.left": "{d} writing days left in term", "me.legendWrote": "Wrote", "me.legendHoliday": "Public holiday", "me.legendLab": "Lab day off (shutdown, conference …)", "me.ended": "Term ended", "me.inc90": "90% (top incentive)", "me.inc70": "70%",
      "me.calendar": "Writing calendar", "me.driftEmpty": "Write diaries and your fields pile up month by month", "me.streak": "{n}-week streak", "me.best": "best {n} weeks", "me.drift": "Interest drift (by month)",
      "me.reviews": "My reviews", "me.noReviews": "No reviews this term yet", "me.draft": "Saved draft", "me.continue": "Continue",
      "me.reading": "Reading list", "me.noReading": "Collect papers to read by link or PDF", "me.readingAll": "Whole reading list", "me.calWrite": "Write a diary for this day", "me.calNone": "Nothing written", "me.dow": "SMTWTFS", "me.inbox": "Comments & mentions", "me.noInbox": "Nothing yet",
      "me.export": "Export .docx", "me.exporting": "Building…", "me.write": "Write diary", "me.remove": "Remove",
      "me.diaryTitle": "{term} Paper Diary — {name}", "me.adminNote": "The admin account doesn't write reviews. Sign in with a member account.",
      "me.color": "My colour", "me.exempt": "written · no diary duty this term",
      "me.notYet": " · starts on {d}", "me.fromDate": "Writing from {d} (target prorated from that date)", "me.customTarget": "Target set by an admin",
      "me.mcpDraft": "AI draft", "me.review": "Review & publish",
      "me.axis.domain": "Fields", "me.axis.method": "Methods", "me.none.domain": "No field", "me.none.method": "No method", "me.other": "Other",
      "me.driftHint": "Hover a bar for counts; click it to filter your reviews below by that month and tag", "me.driftHintAll": "By term — click a bar to see that term's reviews with that tag", "me.driftTip": "{m} · {tag} {n}",
      "me.span.term": "By month", "me.span.all": "By term",
      "me.search": "Search title & text", "me.allDomains": "All fields", "me.allMethods": "All methods", "me.commented": "💬 With comments",
      "me.sortNew": "Newest", "me.sortRating": "Rating", "me.shown": "{n} of {all}", "me.clear": "Clear filters", "me.month": "{m}/{y}",
      "me.noMatch": "No reviews match", "me.more": "More", "me.termScope": "{term} reviews",
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

    view.innerHTML = `
      <div class="page-head me-head">
        <div class="pc-head">${person ? UI.avatar(me.id, true) : `<span class="avatar big admin">A</span>`}
          <div><h1>${esc(me.name)}</h1><p class="sub">${me.role === "admin" ? "admin · " : ""}${t("me.title")}</p></div></div>
        <div class="btn-row">
          <select id="me-term">${terms.map(x => `<option value="${x.id}" ${x.id === term.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
          <a class="ui-btn prominent" href="#/write">✎ ${t("me.write")}</a>
          <button class="ui-btn" id="me-export" ${n ? "" : "disabled"}>⬇ ${t("me.export")}</button>
          ${person ? `<label class="ui-btn color-pick" title="${t("me.color")}"><span class="swatch" style="background:${person.color}"></span>${t("me.color")}<input type="color" id="me-color" value="${person.color}"></label>` : ""}
        </div>
      </div>
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
      <div class="me-grid me-pair">
        <div class="ui-card"><h3>${t("me.reading")}</h3><div class="mini-list" id="me-reading"></div></div>
        <div class="ui-card"><h3>${t("me.inbox")}</h3><div id="me-inbox"></div></div>
      </div>
      <div class="ui-card"><div class="row-between drift-head"><h3>${t("me.drift").replace(/ \(.*\)$/, "")}</h3>
        <div class="drift-ctl"><div class="ui-seg small" id="me-span">${["term", "all"].map(a => `<button data-v="${a}" aria-pressed="${span === a}">${t("me.span." + a)}</button>`).join("")}</div>
        <div class="ui-seg small" id="me-axis">${["domain", "method"].map(a => `<button data-v="${a}" aria-pressed="${axis === a}">${t("me.axis." + a)}</button>`).join("")}</div></div></div>
        <p class="hint" id="me-drift-hint"></p><div id="me-drift"></div></div>
      <div class="ui-card me-reviews" id="me-reviews"><h3>${t("me.reviews")} · <span id="me-rv-count">${n}</span></h3>
        ${draft ? `<div class="ui-notice draft-row">📝 ${t("me.draft")}: <b>${esc(draft.title || "(untitled)")}</b> <a class="ui-btn text" href="#/write">${t("me.continue")}</a></div>` : ""}
        ${mcpDrafts.map(d => `<div class="ui-notice info draft-row">🤖 ${t("me.mcpDraft")}: <b>${esc(d.title || "(untitled)")}</b> <a class="ui-btn text" href="#/write?mcp=${d.id}">${t("me.review")}</a></div>`).join("")}
        <div class="rv-filters">
          <input id="rf-q" type="search" placeholder="${t("me.search")}" value="${esc(rf.q)}">
          <select id="rf-dom"></select><select id="rf-met"></select>
          <button type="button" class="ui-chip" aria-pressed="${!!rf.commented}" id="rf-com">${t("me.commented")}</button>
          <select id="rf-sort"><option value="new">${t("me.sortNew")}</option><option value="rating" ${rf.sort === "rating" ? "selected" : ""}>${t("me.sortRating")}</option></select>
        </div>
        <div class="rv-active" id="rf-active"></div>
        <div id="me-rv-list"></div>
      </div>`;

    $("#me-term", view).onchange = e => { termId = e.target.value; rf.month = ""; render(); };
    $("#me-color", view)?.addEventListener("change", async e => { await S.users.setMyColor(e.target.value); LabReload("#/me", "🎨 ✓"); });
    $("#me-export", view).onclick = () => exportDocx(me, term, mine);
    calendar(term, mineAll, person);
    ctx = { mineAll, mine, term };
    drift();
    reviewFilters();
    inbox();
    reading();
  }

  // ---------------- my reviews: filters, grouped by month (folded except the newest), linked to the interest chart
  let ctx = null;
  const rf = { q: "", domain: "", method: "", commented: false, sort: "new", month: "", open: {} };
  const pref = (k, d) => { try { return localStorage.getItem("labsidian.me." + k) || d; } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem("labsidian.me." + k, v); } catch (e) {} };
  let axis = pref("axis", "domain"), span = pref("span", "term");  // interest chart: fields|methods, months of this term|all terms
  const tagsOf = (p, ax) => (ax === "domain" ? p?.domains : p?.methods) || [];
  const tagName = (ax, k) => { const x = UI.T[(ax === "domain" ? "d:" : "m:") + k]; return k === "_none" ? t("me.none." + ax) : x ? UI.tl(x) : k; };
  const matchTag = (p, ax, k) => !k || (k === "_none" ? !tagsOf(p, ax).length : tagsOf(p, ax).includes(k));

  function filtered() {
    const base = rf.month ? ctx.mine.filter(r => r.date.startsWith(rf.month)) : ctx.mine, q = rf.q.trim().toLowerCase();
    const list = base.filter(r => {
      const p = UI.PA[r.paper];
      if (q && !`${p?.title || ""} ${r.content} ${r.memo}`.toLowerCase().includes(q)) return false;
      return matchTag(p, "domain", rf.domain) && matchTag(p, "method", rf.method) && (!rf.commented || S.comments.count(r.id));
    });
    return rf.sort === "rating" ? list.sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date)) : list;
  }

  function reviewFilters() {
    const opts = ax => {
      const c = {};
      ctx.mineAll.forEach(r => { const ks = tagsOf(UI.PA[r.paper], ax); (ks.length ? ks : ["_none"]).forEach(k => (c[k] = (c[k] || 0) + 1)); });
      return `<option value="">${t(ax === "domain" ? "me.allDomains" : "me.allMethods")}</option>` + Object.entries(c).sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `<option value="${esc(k)}" ${rf[ax] === k ? "selected" : ""}>${esc(tagName(ax, k))} (${n})</option>`).join("");
    };
    $("#rf-dom", view).innerHTML = opts("domain"); $("#rf-met", view).innerHTML = opts("method");
    let qt = null;
    $("#rf-q", view).oninput = e => { clearTimeout(qt); qt = setTimeout(() => { rf.q = e.target.value; reviewList(); }, 200); };
    $("#rf-dom", view).onchange = e => { rf.domain = e.target.value; reviewList(); drift(); };
    $("#rf-met", view).onchange = e => { rf.method = e.target.value; reviewList(); drift(); };
    $("#rf-com", view).onclick = e => { rf.commented = !rf.commented; e.currentTarget.setAttribute("aria-pressed", rf.commented); reviewList(); };
    $("#rf-sort", view).onchange = e => { rf.sort = e.target.value; reviewList(); };
    reviewList();
  }

  function reviewList() {
    const list = filtered(), base = ctx.mine;
    const any = rf.q || rf.domain || rf.method || rf.commented || rf.month;
    const chips = [
      rf.month && [t("me.month", { y: rf.month.slice(0, 4), m: +rf.month.slice(5) }), "month"],
      rf.domain && [tagName("domain", rf.domain), "domain"], rf.method && [tagName("method", rf.method), "method"],
    ].filter(Boolean);
    $("#rf-active", view).innerHTML = (any ? `<span class="muted">${t("me.shown", { n: list.length, all: base.length })}</span>` : `<span class="muted">${t("me.termScope", { term: esc(ctx.term.label) })}</span>`)
      + chips.map(([label, k]) => `<button type="button" class="ui-chip" aria-pressed="true" data-clear="${k}">${esc(label)} ✕</button>`).join("")
      + (any ? `<button class="ui-btn text" data-clear="all">${t("me.clear")}</button>` : "");
    $("#rf-active", view).querySelectorAll("[data-clear]").forEach(b => b.onclick = () => {
      const k = b.dataset.clear;
      if (k === "all") Object.assign(rf, { q: "", domain: "", method: "", commented: false, month: "" }); else rf[k] = "";
      if (k === "all") { $("#rf-q", view).value = ""; $("#rf-com", view).setAttribute("aria-pressed", "false"); }
      reviewFilters(); drift();
    });
    if (!list.length) { $("#me-rv-list", view).innerHTML = `<div class="ui-empty">${t(ctx.mine.length ? "me.noMatch" : "me.noReviews")}</div>`; return; }
    // newest month open; everything open while filtering or when there are few
    const groups = [];
    list.forEach(r => { const m = rf.sort === "rating" ? "" : r.date.slice(0, 7); const g = groups.at(-1); g && g.m === m ? g.rs.push(r) : groups.push({ m, rs: [r] }); });
    const openAll = any || list.length <= 12;
    $("#me-rv-list", view).innerHTML = groups.map((g, i) => {
      const rows = g.rs.map(r => {
        const p = UI.PA[r.paper], c = S.comments.count(r.id);
        return `<div class="ui-row mini rv-row" data-open="paper:${r.paper}"><span class="t">${esc(p?.title)}
          <span class="rv-tags">${[...(p?.domains || []).slice(0, 2).map(d => UI.tag("d:" + d)), ...(p?.methods || []).slice(0, 1).map(m => UI.tag("m:" + m))].join("")}</span></span>
          <span class="m">${c ? "💬 " + c : ""}</span><span class="m">${UI.stars(r.rating)}</span><span class="m">${r.date.slice(5)}</span>
          <a class="m ui-btn text" href="#/write?review=${r.id}" onclick="event.stopPropagation()">✎</a></div>`;
      }).join("");
      if (!g.m) return `<div class="mini-list">${rows}</div>`;
      const open = rf.open[g.m] ?? (openAll || i === 0);
      return `<details class="rv-month" data-m="${g.m}" ${open ? "open" : ""}><summary>${t("me.month", { y: g.m.slice(0, 4), m: +g.m.slice(5) })} <span class="muted">${g.rs.length}</span></summary>
        <div class="mini-list">${rows}</div></details>`;
    }).join("");
    $("#me-rv-list", view).querySelectorAll("details.rv-month").forEach(d => d.ontoggle = () => (rf.open[d.dataset.m] = d.open));
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

  function drift() {
    const box = $("#me-drift", view);
    [["#me-axis", v => { axis = v; setPref("axis", v); }], ["#me-span", v => { span = v; setPref("span", v); if (v === "all") rf.month = ""; }]].forEach(([sel, set]) =>
      $(sel, view).querySelectorAll("button").forEach(b => b.onclick = () => {
        set(b.dataset.v); $(sel, view).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); drift(); reviewList();
      }));
    $("#me-drift-hint", view).textContent = t(span === "all" ? "me.driftHintAll" : "me.driftHint");
    // rows: the months of the term shown on this page (≤ 6), or one row per term — never an endless list
    const terms = S.terms.list().filter(x => ctx.mineAll.some(r => r.date >= x.start && r.date <= x.end));
    const rowOf = span === "all" ? r => terms.find(x => r.date >= x.start && r.date <= x.end)?.id : r => r.date.slice(0, 7);
    const mine = span === "all" ? ctx.mineAll : ctx.mine;
    if (!mine.length) { box.innerHTML = `<p class="ui-empty compact">${t("me.driftEmpty")}</p>`; return; }
    const byMonth = {}, total = {};
    mine.forEach(r => {
      const m = rowOf(r), ks = tagsOf(UI.PA[r.paper], axis).slice(0, 2); if (!m) return;
      (ks.length ? ks : ["_none"]).forEach(k => { ((byMonth[m] ||= {})[k] = (byMonth[m][k] || 0) + 1); total[k] = (total[k] || 0) + 1; });
    });
    if (span === "term") {  // every month of the term so far, written in or not
      for (let d = ctx.term.start.slice(0, 7); d <= (S.today() < ctx.term.end ? S.today() : ctx.term.end).slice(0, 7);
        d = (([y, m]) => (m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`))(d.split("-").map(Number))) byMonth[d] ||= {};
    }
    const rowLabel = m => (span === "all" ? terms.find(x => x.id === m)?.label || m : m);
    const top = Object.entries(total).filter(([k]) => k !== "_none").sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
    if (total._none) top.push("_none");
    const months = span === "all" ? terms.map(x => x.id).filter(id => byMonth[id]) : Object.keys(byMonth).sort();
    const color = k => (k === "_none" ? "rgb(var(--gray))" : UI.T[(axis === "domain" ? "d:" : "m:") + k]?.color || "rgb(var(--gray2))");
    const rowOn = m => (span === "all" ? m === ctx.term.id : !rf.month || rf.month === m);
    const sel = rf[axis], seg = (m, k, n) => {
      const on = rowOn(m) && (!sel || sel === k), active = (span === "term" && rf.month) || sel;
      return `<i data-m="${m}" data-k="${esc(k)}" data-n="${n}" class="${active && on ? "on" : active ? "dim" : ""}" style="flex:${n};background:${color(k)}"></i>`;
    };
    box.innerHTML = `<div class="drift">${months.map(m => {
      const row = byMonth[m], sum = Object.values(row).reduce((a, b) => a + b, 0);
      const other = Object.entries(row).filter(([k]) => !top.includes(k)).reduce((a, [, v]) => a + v, 0);
      const cur = span === "all" ? m === ctx.term.id : rf.month === m;
      return `<div class="drift-row"><button class="ui-btn text drift-m ${cur ? "on" : ""}" data-month="${m}">${esc(rowLabel(m))}</button><div class="drift-bar">
        ${top.map(k => (row[k] ? seg(m, k, row[k]) : "")).join("")}${other ? `<i data-m="${m}" data-k="_other" data-n="${other}" style="flex:${other};background:var(--fill)"></i>` : ""}</div>
        <span class="muted">${sum}</span></div>`;
    }).join("")}</div>
    <div class="chips drift-legend">${top.map(k => `<button type="button" class="ui-tag" aria-pressed="${sel === k}" data-k="${esc(k)}"><span class="dot" style="background:${color(k)}"></span>${esc(tagName(axis, k))}</button>`).join("")}</div>
    <div class="drift-tip ui-tooltip" hidden></div>`;
    const tip = $(".drift-tip", box);
    box.querySelectorAll(".drift-bar i").forEach(el => {
      el.onmouseenter = () => {
        const k = el.dataset.k;
        tip.textContent = t("me.driftTip", { m: rowLabel(el.dataset.m), tag: k === "_other" ? t("me.other") : tagName(axis, k), n: el.dataset.n });
        tip.hidden = false;
        const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(b.width - tip.offsetWidth, a.left - b.left + a.width / 2 - tip.offsetWidth / 2)) + "px";
        tip.style.top = (a.top - b.top - tip.offsetHeight - 6) + "px";
      };
      el.onmouseleave = () => (tip.hidden = true);
      el.onclick = () => {  // same segment again → clear
        const k = el.dataset.k === "_other" ? "" : el.dataset.k;
        if (span === "all") { const same = termId === el.dataset.m && rf[axis] === k; rf[axis] = same ? "" : k; return pickTerm(el.dataset.m); }
        const same = rf.month === el.dataset.m && rf[axis] === k;
        rf.month = same ? "" : el.dataset.m; rf[axis] = same ? "" : k;
        afterDriftPick();
      };
    });
    box.querySelectorAll("[data-month]").forEach(b => b.onclick = () => {
      if (span === "all") return pickTerm(b.dataset.month);
      rf.month = rf.month === b.dataset.month ? "" : b.dataset.month; afterDriftPick();
    });
    box.querySelectorAll(".chips .ui-tag[data-k]").forEach(c => c.onclick = () => { rf[axis] = rf[axis] === c.dataset.k ? "" : c.dataset.k; afterDriftPick(); });
  }
  function pickTerm(id) {  // a term row → the whole page switches to that term (progress, calendar, reviews)
    termId = id; rf.month = ""; rf.open = {};
    render();
    $("#me-reviews", view).scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function afterDriftPick() {
    rf.open = {};
    reviewFilters(); drift();
    $("#me-reviews", view).scrollIntoView({ behavior: "smooth", block: "start" });
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
