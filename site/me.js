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
      "me.calendar": "작성 캘린더", "me.streak": "연속 작성 {n}주", "me.best": "최장 {n}주", "me.drift": "관심사 변화 (월별)",
      "me.reviews": "내 리뷰", "me.noReviews": "이 학기엔 아직 리뷰가 없어요", "me.draft": "임시저장된 글", "me.continue": "이어 쓰기",
      "me.reading": "읽을 목록", "me.noReading": "📚 버튼으로 담은 논문이 여기 모여요", "me.inbox": "받은 댓글·멘션", "me.noInbox": "아직 없어요",
      "me.export": "docx로 내보내기", "me.exporting": "만드는 중…", "me.write": "다이어리 쓰기", "me.remove": "빼기",
      "me.diaryTitle": "{term} Paper Diary — {name}", "me.color": "내 색", "me.exempt": "편 작성 · 이번 학기 작성 의무 없음",
      "me.notYet": "편 · {d}부터 작성 시작", "me.fromDate": "{d}부터 작성 (목표는 그 날짜 기준으로 계산)", "me.customTarget": "관리자가 정한 목표예요",
      "me.mcpDraft": "내 AI 초안", "me.review": "검토하고 게시", "me.adminNote": "관리자 계정은 리뷰를 쓰지 않아요. 멤버 계정으로 로그인해 보세요.",
    },
    en: {
      "me.title": "My page", "me.term": "Term", "me.progress": "This term's diary rate", "me.of": "{n} of {target} target",
      "me.pace": "Expected by today: {exp} — {diff}", "me.ahead": "{n} ahead", "me.behind": "{n} behind", "me.onpace": "right on pace",
      "me.left": "{d} writing days left in term", "me.legendWrote": "Wrote", "me.legendHoliday": "Public holiday", "me.legendLab": "Lab day off (shutdown, conference …)", "me.ended": "Term ended", "me.inc90": "90% (top incentive)", "me.inc70": "70%",
      "me.calendar": "Writing calendar", "me.streak": "{n}-week streak", "me.best": "best {n} weeks", "me.drift": "Interest drift (by month)",
      "me.reviews": "My reviews", "me.noReviews": "No reviews this term yet", "me.draft": "Saved draft", "me.continue": "Continue",
      "me.reading": "Reading list", "me.noReading": "Papers you save with 📚 show up here", "me.inbox": "Comments & mentions", "me.noInbox": "Nothing yet",
      "me.export": "Export .docx", "me.exporting": "Building…", "me.write": "Write diary", "me.remove": "Remove",
      "me.diaryTitle": "{term} Paper Diary — {name}", "me.adminNote": "The admin account doesn't write reviews. Sign in with a member account.",
      "me.color": "My colour", "me.exempt": "written · no diary duty this term",
      "me.notYet": " · starts on {d}", "me.fromDate": "Writing from {d} (target prorated from that date)", "me.customTarget": "Target set by an admin",
      "me.mcpDraft": "AI draft", "me.review": "Review & publish",
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
        <div class="pc-head">${person ? UI.avatar(me.id, true) : `<span class="avatar big" style="background:rgb(var(--indigo));color:#fff">A</span>`}
          <div><h1>${esc(me.name)}</h1><p class="sub">${me.role === "admin" ? "admin · " : ""}${t("me.title")}</p></div></div>
        <div class="btn-row">
          <select id="me-term">${terms.map(x => `<option value="${x.id}" ${x.id === term.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
          <a class="btn primary" href="#/write">✎ ${t("me.write")}</a>
          <button class="btn" id="me-export" ${n ? "" : "disabled"}>⬇ ${t("me.export")}</button>
          ${person ? `<label class="btn color-pick" title="${t("me.color")}"><span class="swatch" style="background:${person.color}"></span>${t("me.color")}<input type="color" id="me-color" value="${person.color}"></label>` : ""}
        </div>
      </div>
      ${!person ? `<div class="card">${t("me.adminNote")}</div>` : ""}
      <div class="me-grid">
        <div class="card progress-card">
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
        <div class="card"><h3>${t("me.calendar")} <span class="muted" id="me-streak"></span></h3><div id="me-cal" class="cal"></div></div>
      </div>
      <div class="card"><h3>${t("me.drift")}</h3><div id="me-drift"></div></div>
      <div class="me-grid">
        <div class="card"><h3>${t("me.reviews")} · ${n}</h3>
          ${draft ? `<div class="draft-row">📝 ${t("me.draft")}: <b>${esc(draft.title || "(untitled)")}</b> <a class="link-btn" href="#/write">${t("me.continue")}</a></div>` : ""}
          ${mcpDrafts.map(d => `<div class="draft-row mcp">🤖 ${t("me.mcpDraft")}: <b>${esc(d.title || "(untitled)")}</b> <a class="link-btn" href="#/write?mcp=${d.id}">${t("me.review")}</a></div>`).join("")}
          <div class="mini-list">${mine.map(r => `<div class="mini" data-open="paper:${r.paper}"><span class="t">${esc(UI.PA[r.paper]?.title)}</span>
            <span class="m">${S.comments.count(r.id) ? "💬 " + S.comments.count(r.id) : ""}</span><span class="m">${UI.stars(r.rating)}</span><span class="m">${r.date.slice(5)}</span>
            <a class="m link-btn" href="#/write?review=${r.id}" onclick="event.stopPropagation()">✎</a></div>`).join("") || `<div class="empty">${t("me.noReviews")}</div>`}</div>
        </div>
        <div class="side-col">
          <div class="card"><h3>${t("me.inbox")}</h3><div id="me-inbox"></div></div>
          <div class="card"><h3>${t("me.reading")}</h3><div class="mini-list" id="me-reading"></div></div>
        </div>
      </div>`;

    $("#me-term", view).onchange = e => { termId = e.target.value; render(); };
    $("#me-color", view)?.addEventListener("change", async e => { await S.users.setMyColor(e.target.value); LabReload("#/me", "🎨 ✓"); });
    $("#me-export", view).onclick = () => exportDocx(me, term, mine);
    calendar(term, mineAll, person);
    drift(mineAll);
    inbox();
    reading();
  }

  function calendar(term, mine, person) {
    const counts = {};
    mine.forEach(r => (counts[r.date] = (counts[r.date] || 0) + 1));
    const start = new Date(term.start), dow = (start.getDay() + 6) % 7; // Monday = 0
    const first = addDays(term.start, -dow), weeks = Math.ceil((days(first, term.end) + 1) / 7);
    const color = person?.color || "#6155f5";
    // weekdays only (no diary is owed on weekends); the lab's days off are shaded and named in the tooltip
    let html = `<div class="cal-grid" style="grid-template-columns:repeat(${weeks},1fr)">`;
    for (let w = 0; w < weeks; w++) for (let d = 0; d < 5; d++) {
      const day = addDays(first, w * 7 + d), c = counts[day] || 0, out = day < term.start || day > term.end;
      const off = !out && S.calendar.offDay(day), cls = [out && "out", day === S.today() && "today", off && (off.kind === "holiday" ? "off-holiday" : "off-lab")];
      html += `<i class="${cls.filter(Boolean).join(" ")}" style="grid-column:${w + 1};grid-row:${d + 1};${c ? `background:${color};opacity:${Math.min(1, 0.45 + c * 0.3)}` : ""}" title="${day}${off ? " · " + esc(off.label) : ""}${c ? " · " + c : ""}"></i>`;
    }
    html += "</div>";
    html += `<div class="cal-legend"><span><i style="background:${color}"></i>${t("me.legendWrote")}</span><span><i class="off-holiday"></i>${t("me.legendHoliday")}</span><span><i class="off-lab"></i>${t("me.legendLab")}</span></div>`;
    // months axis
    html += `<div class="cal-months">${[...new Set(Array.from({ length: weeks }, (_, w) => addDays(first, w * 7 + 6).slice(0, 7)).filter(m => m >= term.start.slice(0, 7) && m <= term.end.slice(0, 7)))].map(m => `<span>${+m.slice(5)}${lang === "ko" ? "월" : ""}</span>`).join("")}</div>`;
    $("#me-cal", view).innerHTML = html;
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

  function drift(mine) {
    if (!mine.length) { $("#me-drift", view).innerHTML = `<div class="empty">—</div>`; return; }
    const byMonth = {}, total = {};
    mine.forEach(r => {
      const m = r.date.slice(0, 7), p = UI.PA[r.paper];
      (p?.domains || []).slice(0, 2).forEach(d => {
        ((byMonth[m] ||= {})[d] = (byMonth[m][d] || 0) + 1);
        total[d] = (total[d] || 0) + 1;
      });
    });
    const top = Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d]) => d);
    const months = Object.keys(byMonth).sort().slice(-12);
    const color = d => UI.T["d:" + d]?.color || "#55556a";
    $("#me-drift", view).innerHTML = `<div class="drift">${months.map(m => {
      const row = byMonth[m], sum = Object.values(row).reduce((a, b) => a + b, 0);
      const other = Object.entries(row).filter(([d]) => !top.includes(d)).reduce((a, [, v]) => a + v, 0);
      return `<div class="drift-row"><span class="muted">${m}</span><div class="drift-bar">
        ${top.map(d => row[d] ? `<i style="flex:${row[d]};background:${color(d)}" title="${esc(UI.tl(UI.T["d:" + d]))} ${row[d]}"></i>` : "").join("")}
        ${other ? `<i style="flex:${other};background:#3a3a48"></i>` : ""}</div><span class="muted">${sum}</span></div>`;
    }).join("")}</div>
    <div class="chips" style="margin-top:8px">${top.map(d => `<span class="tag" data-open="topic:d:${d}"><span class="dot" style="background:${color(d)}"></span>${esc(UI.tl(UI.T["d:" + d]))}</span>`).join("")}</div>`;
  }

  function inbox() {
    const list = S.notifications.list().slice(0, 12);
    $("#me-inbox", view).innerHTML = list.map(nf => `<div class="notif ${nf.read ? "" : "unread"}" data-nid="${nf.id}" data-paper="${nf.paperId || ""}" data-review="${nf.reviewId || ""}" data-comment="${nf.commentId || ""}" data-draft="${nf.draftId || ""}" data-study="${nf.studyId || ""}" data-type="${nf.type}">
      ${UI.avatar(nf.actor)}<div><div>${esc(LabNotifText(nf))}</div>${nf.excerpt ? `<div class="excerpt">“${esc(nf.excerpt)}”</div>` : ""}<div class="muted">${LabAgo(nf.at)}</div></div></div>`).join("")
      || `<div class="muted">${t("me.noInbox")}</div>`;
    view.querySelectorAll("#me-inbox .notif").forEach(el => el.onclick = async () => {
      await S.notifications.markRead(el.dataset.nid); el.classList.remove("unread"); LabUpdateBell();
      LabOpenNotif(el.dataset);
    });
  }

  function reading() {
    const list = S.reading.list().map(x => UI.PA[x.paperId]).filter(Boolean);
    $("#me-reading", view).innerHTML = list.map(p => `<div class="mini" data-open="paper:${p.id}"><span class="t">${esc(p.title)}</span>
      <span class="m">${p.readers.map(r => UI.avatar(r)).join("")}</span><button class="m link-btn" data-unread="${p.id}">${t("me.remove")}</button></div>`).join("")
      || `<div class="muted">${t("me.noReading")}</div>`;
    view.querySelectorAll("[data-unread]").forEach(b => b.onclick = async e => { e.stopPropagation(); await S.reading.toggle(b.dataset.unread); reading(); });
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
